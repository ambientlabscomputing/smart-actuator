from __future__ import annotations

import base64
import hashlib
import importlib.metadata
import io
import mimetypes
import os
import stat
import uuid
import zipfile
from datetime import UTC, datetime, timedelta
from pathlib import Path, PurePosixPath
from typing import Any, cast

import httpx
import rfc8785
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey

from brain.models.fabricate import (
    ArtifactReference,
    DeviceRegistration,
    Digest,
    FabricateStatus,
    MachineSnapshotV1,
    PairingState,
    PreparedSnapshot,
    ReleaseManifestV1,
    RuntimeTemplate,
    Signature,
    SoftwareVersions,
)
from brain.service.actuator_service import ActuatorService
from brain.service.file_service import FileService
from brain.service.machine_service import MachineService
from brain.service.template_service import TemplateService
from brain.utils.config import Config

ALLOWED_ATTACHMENT_TYPES = {
    "application/json",
    "application/pdf",
    "application/step",
    "model/step",
    "text/plain",
    "text/csv",
    "text/yaml",
    "image/png",
    "image/jpeg",
}
EXCLUDED = [
    "local users and credentials",
    "programs and G-code",
    "logs and telemetry",
    "network addresses",
    "unselected files",
]


def _canonical(payload: Any) -> bytes:
    return rfc8785.dumps(payload)


def _sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


class FabricateService:
    def __init__(
        self,
        config: Config,
        machine: MachineService,
        templates: TemplateService,
        files: FileService,
        actuators: ActuatorService,
    ) -> None:
        self.config, self.machine, self.templates, self.files, self.actuators = (
            config,
            machine,
            templates,
            files,
            actuators,
        )
        self.root = Path(config.fabricate.state_dir).expanduser()
        self.root.mkdir(parents=True, exist_ok=True, mode=0o700)
        os.chmod(self.root, 0o700)
        self.deployment_id = self._stable_text("deployment-id", str(uuid.uuid4()))

    def _stable_text(self, name: str, default: str) -> str:
        path = self.root / name
        if not path.exists():
            self._atomic(path, default.encode(), 0o600)
        return path.read_text().strip()

    def _atomic(self, path: Path, data: bytes, mode: int = 0o600) -> None:
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        temporary = path.with_suffix(path.suffix + ".tmp")
        temporary.write_bytes(data)
        os.chmod(temporary, mode)
        temporary.replace(path)

    def _key(self) -> Ed25519PrivateKey:
        path = self.root / "device-key.pem"
        if not path.exists():
            key = Ed25519PrivateKey.generate()
            raw = key.private_bytes(
                serialization.Encoding.PEM,
                serialization.PrivateFormat.PKCS8,
                serialization.NoEncryption(),
            )
            self._atomic(path, raw)
        if stat.S_IMODE(path.stat().st_mode) != 0o600:
            os.chmod(path, 0o600)
        parsed = serialization.load_pem_private_key(path.read_bytes(), password=None)
        assert isinstance(parsed, Ed25519PrivateKey)
        return parsed

    def _public_pem(self, key: Ed25519PrivateKey | None = None) -> str:
        value = (
            (key or self._key())
            .public_key()
            .public_bytes(
                serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo
            )
        )
        return value.decode()

    def _sign(self, message: str, key: Ed25519PrivateKey | None = None) -> str:
        return base64.b64encode((key or self._key()).sign(message.encode())).decode()

    def _registration(self) -> DeviceRegistration | None:
        path = self.root / "registration.json"
        return DeviceRegistration.model_validate_json(path.read_text()) if path.exists() else None

    def _pairing(self) -> PairingState | None:
        path = self.root / "pairing.json"
        return PairingState.model_validate_json(path.read_text()) if path.exists() else None

    async def _request(
        self, method: str, path: str, *, token: str | None = None, **kwargs: Any
    ) -> httpx.Response:
        headers = dict(kwargs.pop("headers", {}))
        if token:
            headers["Authorization"] = f"Bearer {token}"
        async with httpx.AsyncClient(timeout=self.config.fabricate.timeout_seconds) as client:
            response = await client.request(
                method,
                f"{self.config.fabricate.api_url.rstrip('/')}/{path.lstrip('/')}",
                headers=headers,
                **kwargs,
            )
        if response.is_error:
            try:
                detail = response.json().get("error", {}).get("message") or response.json().get(
                    "detail"
                )
            except Exception:
                detail = None
            raise RuntimeError(detail or f"Fabricate returned HTTP {response.status_code}")
        return response

    async def compatibility(self) -> dict[str, Any]:
        response = await self._request(
            "POST",
            "compatibility/check",
            json={
                "client_kind": "brain",
                "client_version": self.config.fabricate.client_version,
                "snapshot_versions": self.config.fabricate.snapshot_versions,
                "release_versions": self.config.fabricate.release_versions,
                "operation": "validate",
            },
        )
        return cast(dict[str, Any], response.json())

    async def status(self) -> FabricateStatus:
        try:
            compatibility = await self.compatibility()
            available, error = True, None
        except Exception as exc:
            compatibility, available, error = None, False, str(exc)
        return FabricateStatus(
            available=available,
            paired=self._registration() is not None,
            deployment_id=self.deployment_id,
            device=self._registration(),
            pairing=self._pairing(),
            compatibility=compatibility,
            error=error,
        )

    async def begin_pairing(self, name: str) -> PairingState:
        response = await self._request(
            "POST",
            "device-authorizations",
            json={
                "deployment_id": self.deployment_id,
                "name": name,
                "public_key": self._public_pem(),
                "capabilities": ["snapshot-v1", "release-download-v1"],
                "client_version": self.config.fabricate.client_version,
            },
        )
        body = response.json()
        pairing = PairingState(
            authorization_id=body["authorization_id"],
            device_code=body["device_code"],
            user_code=body["user_code"],
            verification_uri=body["verification_uri"],
            challenge=body["challenge"],
            expires_at=datetime.now(UTC) + timedelta(seconds=body["expires_in"]),
            interval=body["interval"],
        )
        self._atomic(self.root / "pairing.json", pairing.model_dump_json().encode())
        return pairing

    async def poll_pairing(self) -> dict[str, Any]:
        pairing = self._pairing()
        if pairing is None:
            raise RuntimeError("Pairing has not been started")
        status = (
            await self._request(
                "GET", "device-authorizations/status", params={"device_code": pairing.device_code}
            )
        ).json()
        if status["state"] == "approved":
            message = (
                f"fabricate-pair:{pairing.authorization_id}:{_sha(pairing.challenge.encode())}"
            )
            body = (
                await self._request(
                    "POST",
                    "device-authorizations/redeem",
                    json={
                        "device_code": pairing.device_code,
                        "signature": {"key_id": "pending", "value": self._sign(message)},
                    },
                )
            ).json()
            registration = DeviceRegistration.model_validate(body)
            self._atomic(self.root / "registration.json", registration.model_dump_json().encode())
            (self.root / "pairing.json").unlink(missing_ok=True)
            return {"state": "paired", "device": registration.model_dump()}
        return cast(dict[str, Any], status)

    async def _token(self) -> str:
        registration = self._registration()
        if registration is None:
            raise RuntimeError("Deployment is not paired")
        challenge = (
            await self._request(
                "POST",
                "device-sessions/challenge",
                json={"device_id": registration.device_id, "key_id": registration.key_id},
            )
        ).json()
        message = (
            f"fabricate-token:{challenge['challenge_id']}:{_sha(challenge['challenge'].encode())}"
        )
        token = (
            await self._request(
                "POST",
                "device-sessions/token",
                json={
                    "challenge_id": challenge["challenge_id"],
                    "signature": {"key_id": registration.key_id, "value": self._sign(message)},
                },
            )
        ).json()
        return str(token["access_token"])

    async def reset(self) -> dict[str, Any]:
        warning = None
        registration = self._registration()
        if registration:
            try:
                await self._request(
                    "DELETE",
                    f"devices/{registration.device_id}/self",
                    token=await self._token(),
                )
            except Exception:
                warning = (
                    "Local identity cleared; revoke the old device in Fabricate "
                    "if it remains listed."
                )
        for name in ["registration.json", "pairing.json", "device-key.pem"]:
            (self.root / name).unlink(missing_ok=True)
        return {"reset": True, "warning": warning}

    async def rotate(self) -> DeviceRegistration:
        registration = self._registration()
        if registration is None:
            raise RuntimeError("Deployment is not paired")
        old, new = self._key(), Ed25519PrivateKey.generate()
        public = self._public_pem(new)
        raw = new.public_key().public_bytes(
            serialization.Encoding.Raw, serialization.PublicFormat.Raw
        )
        fp = _sha(raw)
        message = f"fabricate-rotate:{registration.device_id}:{registration.key_id}:{fp}"
        body = (
            await self._request(
                "POST",
                f"devices/{registration.device_id}/rotate-key",
                token=await self._token(),
                json={
                    "new_public_key": public,
                    "old_key_signature": {
                        "key_id": registration.key_id,
                        "value": self._sign(message, old),
                    },
                    "new_key_signature": {"key_id": "new", "value": self._sign(message, new)},
                },
            )
        ).json()
        updated = DeviceRegistration.model_validate(body)
        self._atomic(
            self.root / "device-key.pem",
            new.private_bytes(
                serialization.Encoding.PEM,
                serialization.PrivateFormat.PKCS8,
                serialization.NoEncryption(),
            ),
        )
        self._atomic(self.root / "registration.json", updated.model_dump_json().encode())
        return updated

    async def prepare_snapshot(
        self, machine_id: str, attachment_ids: list[int]
    ) -> PreparedSnapshot:
        machine = await self.machine.get_machine(machine_id)
        if machine is None:
            raise ValueError(f"Machine {machine_id!r} not found")
        schema = await self.templates.get_template(machine.description.template_ref.template_id)
        document = self.templates.raw_template(machine.description.template_ref.template_id)
        if schema is None or document is None:
            raise ValueError("The runtime template is unavailable")
        attachments: list[tuple[ArtifactReference, bytes]] = []
        seen: set[str] = set()
        for file_id in attachment_ids:
            stored, data = await self.files.get_file(file_id), await self.files.read_file(file_id)
            if stored is None or data is None:
                raise ValueError(f"Attachment {file_id} is missing")
            filename = Path(stored.location).name
            if filename in {"", ".", ".."} or PurePosixPath(filename).name != filename:
                raise ValueError("Attachment name is unsafe")
            attachment_path = f"attachments/{file_id}-{filename}"
            if attachment_path in seen:
                raise ValueError("Duplicate attachment path")
            media = mimetypes.guess_type(filename)[0] or "application/octet-stream"
            if media not in ALLOWED_ATTACHMENT_TYPES:
                raise ValueError(f"Attachment type {media} is not allowed")
            seen.add(attachment_path)
            attachments.append(
                (
                    ArtifactReference(
                        path=attachment_path,
                        media_type=media,
                        byte_size=len(data),
                        digest=Digest(value=_sha(data)),
                    ),
                    data,
                )
            )
        registration = self._registration()
        if registration is None:
            raise RuntimeError("Deployment is not paired")
        empty = Digest(value="0" * 64)
        unsigned = Signature(key_id=registration.key_id, value="")
        snapshot = MachineSnapshotV1(
            capabilities=["snapshot-v1"],
            deployment_id=self.deployment_id,
            machine_id=machine_id,
            created_at=datetime.now(UTC),
            runtime_template=RuntimeTemplate(
                publisher=schema.publisher,
                template_id=schema.template_id,
                version=schema.version,
                content_hash=schema.content_hash,
                source=schema.source,
                ref=schema.ref,
                document=document,
            ),
            machine_description=machine.description.model_dump(mode="json"),
            diagnostic_urdf=machine.expanded_urdf,
            software=SoftwareVersions(brain=importlib.metadata.version("brain")),
            hardware=[],
            attachments=[item for item, _ in attachments],
            content_digest=empty,
            signature=unsigned,
        )
        content = snapshot.model_dump(mode="json", exclude={"content_digest", "signature"})
        digest = Digest(value=_sha(_canonical(content)))
        snapshot = snapshot.model_copy(update={"content_digest": digest})
        signable = snapshot.model_dump(mode="json", exclude={"signature"})
        snapshot = snapshot.model_copy(
            update={
                "signature": Signature(
                    key_id=registration.key_id,
                    value=base64.b64encode(self._key().sign(_canonical(signable))).decode(),
                )
            }
        )
        archive_path = self.root / "prepared" / f"{digest.value}.zip"
        archive_path.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:

            def write(name: str, data: bytes) -> None:
                info = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0))
                info.external_attr = 0o600 << 16
                info.compress_type = zipfile.ZIP_DEFLATED
                archive.writestr(info, data)

            write("snapshot.json", snapshot.model_dump_json().encode())
            for item, data in attachments:
                write(item.path, data)
        raw = archive_path.read_bytes()
        if len(raw) > self.config.fabricate.max_snapshot_bytes:
            archive_path.unlink()
            raise ValueError("Prepared snapshot exceeds the configured limit")
        compatibility = await self.compatibility()
        result = PreparedSnapshot(
            digest=_sha(raw),
            byte_size=len(raw),
            machine_id=machine_id,
            archive_path=str(archive_path),
            included_attachments=[item.path for item, _ in attachments],
            excluded_categories=EXCLUDED,
            compatibility=compatibility,
            preview={
                "schema_version": "1.0",
                "machine_id": machine_id,
                "template": f"{schema.publisher}/{schema.template_id}@{schema.version}",
                "content_digest": digest.value,
            },
        )
        self._atomic(
            self.root / "prepared" / f"{result.digest}.json", result.model_dump_json().encode()
        )
        return result

    async def send_snapshot(self, digest: str) -> dict[str, Any]:
        metadata = self.root / "prepared" / f"{digest}.json"
        if not metadata.exists():
            raise ValueError("Prepared snapshot was not found")
        prepared = PreparedSnapshot.model_validate_json(metadata.read_text())
        data = Path(prepared.archive_path).read_bytes()
        if _sha(data) != digest:
            raise ValueError("Prepared snapshot archive changed")
        token = await self._token()
        grant = (
            await self._request(
                "POST",
                "snapshot-uploads",
                token=token,
                json={
                    "local_machine_id": prepared.machine_id,
                    "archive_digest": {"value": digest},
                    "byte_size": len(data),
                    "media_type": "application/zip",
                },
            )
        ).json()
        headers = {"Content-Type": "application/zip", "x-upsert": "false"}
        async with httpx.AsyncClient(timeout=self.config.fabricate.timeout_seconds) as client:
            uploaded = await client.post(grant["upload_url"], headers=headers, content=data)
        if uploaded.status_code not in {200, 201, 409}:
            uploaded.raise_for_status()
        return cast(dict[str, Any], (
            await self._request(
                "POST",
                "snapshot-uploads/finalize",
                token=token,
                json={"upload_id": grant["upload_id"]},
            )
        ).json())

    async def releases(self) -> list[dict[str, Any]]:
        return cast(
            list[dict[str, Any]],
            (await self._request("GET", "device-releases", token=await self._token())).json(),
        )

    async def download_release(self, release_id: str) -> dict[str, Any]:
        grant = (
            await self._request(
                "POST", f"device-releases/{release_id}/download-grant", token=await self._token()
            )
        ).json()
        async with httpx.AsyncClient(timeout=self.config.fabricate.timeout_seconds) as client:
            response = await client.get(grant["url"])
        response.raise_for_status()
        data = response.content
        expected = grant["archive_digest"]["value"]
        if len(data) != grant["byte_size"] or _sha(data) != expected:
            raise ValueError("Release archive digest verification failed")
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as archive:
                manifest = ReleaseManifestV1.model_validate_json(archive.read("release.json"))
        except (KeyError, zipfile.BadZipFile, ValueError) as exc:
            raise ValueError("Release archive has no valid release.json manifest") from exc
        if manifest.release_id != release_id:
            raise ValueError("Release manifest identity does not match the assignment")
        key_pem = self.config.fabricate.release_signing_public_keys.get(manifest.signature.key_id)
        if key_pem is None:
            raise ValueError("Release signing key is not pinned by this deployment")
        key = serialization.load_pem_public_key(key_pem.encode())
        if not isinstance(key, Ed25519PublicKey):
            raise ValueError("Pinned release key is not Ed25519")
        try:
            key.verify(
                base64.b64decode(manifest.signature.value, validate=True),
                _canonical(manifest.model_dump(mode="json", exclude={"signature"})),
            )
        except Exception as exc:
            raise ValueError("Release manifest signature verification failed") from exc
        destination = self.root / "releases" / f"{release_id}.zip"
        self._atomic(destination, data)
        return {
            "release_id": release_id,
            "path": str(destination),
            "digest_verified": True,
            "signature_verified": True,
            "apply_available": False,
        }
