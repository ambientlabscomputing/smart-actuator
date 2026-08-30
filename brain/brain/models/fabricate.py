from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Digest(Contract):
    algorithm: Literal["sha256"] = "sha256"
    value: str = Field(pattern=r"^[0-9a-f]{64}$")


class Signature(Contract):
    algorithm: Literal["Ed25519"] = "Ed25519"
    key_id: str
    value: str


class ArtifactReference(Contract):
    path: str
    media_type: str
    byte_size: int = Field(ge=0)
    digest: Digest


class RuntimeTemplate(Contract):
    publisher: str
    template_id: str
    version: str
    content_hash: str
    source: str
    ref: str
    document: dict[str, Any]


class SoftwareVersions(Contract):
    brain: str
    controller: str | None = None
    firmware: dict[str, str] = Field(default_factory=dict)
    actuator_protocol: str | None = None


class HardwareIdentity(Contract):
    kind: str
    serial: str
    firmware_version: str | None = None


class MachineSnapshotV1(Contract):
    schema_version: Literal["1.0"] = "1.0"
    capabilities: list[str] = Field(default_factory=list)
    deployment_id: str
    machine_id: str
    created_at: datetime
    runtime_template: RuntimeTemplate
    machine_description: dict[str, Any]
    diagnostic_urdf: str | None = None
    software: SoftwareVersions
    hardware: list[HardwareIdentity] = Field(default_factory=list)
    attachments: list[ArtifactReference] = Field(default_factory=list)
    content_digest: Digest
    signature: Signature


class ReleaseManifestV1(Contract):
    schema_version: Literal["1.0"] = "1.0"
    release_id: str
    revision: int = Field(ge=1)
    machine_family: str
    snapshot_digest: Digest
    artifact_manifest_digest: Digest
    bom_digest: Digest
    version_pins: dict[str, str]
    compatibility: dict[str, str]
    created_at: datetime
    signature: Signature


class PairingState(BaseModel):
    authorization_id: str
    device_code: str
    user_code: str
    verification_uri: str
    challenge: str
    expires_at: datetime
    interval: int


class DeviceRegistration(BaseModel):
    device_id: str
    org_id: str
    key_id: str
    fingerprint: str


class PreparedSnapshot(BaseModel):
    digest: str
    byte_size: int
    machine_id: str
    archive_path: str
    included_attachments: list[str]
    excluded_categories: list[str]
    compatibility: dict[str, Any]
    preview: dict[str, Any]


class FabricateStatus(BaseModel):
    available: bool
    paired: bool
    deployment_id: str
    device: DeviceRegistration | None = None
    pairing: PairingState | None = None
    compatibility: dict[str, Any] | None = None
    error: str | None = None


class PrepareSnapshotRequest(BaseModel):
    machine_id: str
    attachment_ids: list[int] = Field(default_factory=list)
