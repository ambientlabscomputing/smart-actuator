from __future__ import annotations

import datetime
from pathlib import Path

import jwt
from async_lru import alru_cache
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.asymmetric.rsa import RSAPrivateKey, RSAPublicKey
from cryptography.x509 import load_pem_x509_certificate
from cryptography.x509.oid import NameOID
from result import Err, Ok, Result

from brain.models.user import User
from brain.repository.repository import Repository
from brain.utils.config import Config
from brain.utils.logger import logger

_ALGORITHM = "RS256"
_TOKEN_ISSUER = "brain"


class OAuthService:
    """RS256-signed JWT access tokens backed by an X.509 cert/key pair."""

    def __init__(self, repository: Repository, config: Config) -> None:
        self.repo = repository
        self.config = config
        self._private_key: RSAPrivateKey | None = None
        self._public_key: RSAPublicKey | None = None
        self.bootstrap_certs()

    # ------------------------------------------------------------------
    # Cert / key management
    # ------------------------------------------------------------------

    def bootstrap_certs(self) -> None:
        """Load or generate the RSA private key and self-signed X.509 certificate."""
        logger.debug("Bootstrapping OAuth certs ...")
        cert_path = Path(self.config.oauth.cert_path)
        key_path = Path(self.config.oauth.key_path)

        if not key_path.exists() or not cert_path.exists():
            logger.info("OAuth cert/key not found — generating self-signed RSA-2048 pair")
            self._generate_self_signed(cert_path, key_path)

        try:
            private_key = serialization.load_pem_private_key(
                key_path.read_bytes(),
                password=None,
            )
            if not isinstance(private_key, RSAPrivateKey):
                raise TypeError(f"Expected RSA private key, got {type(private_key).__name__}")
            self._private_key = private_key

            cert = load_pem_x509_certificate(cert_path.read_bytes())
            public_key = cert.public_key()
            if not isinstance(public_key, RSAPublicKey):
                raise TypeError(f"Expected RSA public key in cert, got {type(public_key).__name__}")
            self._public_key = public_key

            logger.info("OAuth cert/key loaded (subject: {})", cert.subject.rfc4514_string())
        except Exception:
            logger.exception("Failed to load OAuth cert/key — token auth unavailable")
            self._private_key = None
            self._public_key = None
            raise

    @staticmethod
    def _generate_self_signed(cert_path: Path, key_path: Path) -> None:
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)

        key_path.parent.mkdir(parents=True, exist_ok=True)
        key_path.write_bytes(
            key.private_bytes(
                serialization.Encoding.PEM,
                serialization.PrivateFormat.TraditionalOpenSSL,
                serialization.NoEncryption(),
            )
        )

        name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "brain")])
        now = datetime.datetime.now(datetime.UTC)
        cert = (
            x509.CertificateBuilder()
            .subject_name(name)
            .issuer_name(name)
            .public_key(key.public_key())
            .serial_number(x509.random_serial_number())
            .not_valid_before(now)
            .not_valid_after(now + datetime.timedelta(days=3650))
            .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
            .sign(key, hashes.SHA256())
        )

        cert_path.parent.mkdir(parents=True, exist_ok=True)
        cert_path.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
        logger.info("Generated self-signed cert at {} and key at {}", cert_path, key_path)

    def get_public_key(self) -> str:
        """Return the PEM-encoded public key for external token verification."""
        if self._public_key is None:
            return ""
        return self._public_key.public_bytes(
            serialization.Encoding.PEM,
            serialization.PublicFormat.SubjectPublicKeyInfo,
        ).decode()

    # ------------------------------------------------------------------
    # Token operations
    # ------------------------------------------------------------------

    def _build_token(self, user: User) -> str:
        if self._private_key is None:
            raise RuntimeError("OAuth private key not loaded — cannot sign tokens")
        now = datetime.datetime.now(datetime.UTC)
        payload = {
            "sub": user.username,
            "name": user.name,
            "iss": _TOKEN_ISSUER,
            "iat": now,
            "exp": now + datetime.timedelta(seconds=self.config.oauth.token_ttl_seconds),
        }
        return jwt.encode(payload, self._private_key, algorithm=_ALGORITHM)

    @alru_cache(maxsize=128, ttl=300)
    async def validate_token(self, token: str) -> Result[User, str]:
        """Decode and validate a JWT; return the owning User on success."""
        if self._public_key is None:
            return Err("OAuth public key not loaded — cannot validate tokens")
        try:
            payload = jwt.decode(
                token,
                self._public_key,
                algorithms=[_ALGORITHM],
                issuer=_TOKEN_ISSUER,
            )
        except jwt.ExpiredSignatureError:
            return Err("Token has expired")
        except jwt.InvalidTokenError as exc:
            return Err(f"Invalid token: {exc}")

        username: str = payload.get("sub", "")
        user = await self.repo.user.get_user_by_username(username)
        if user is None:
            return Err(f"User '{username}' not found")
        return Ok(user)

    # ------------------------------------------------------------------
    # Authentication
    # ------------------------------------------------------------------

    async def authenticate_user(self, username: str, password: str) -> Result[str, str]:
        """Verify credentials and return a signed JWT on success."""
        if not username or not password:
            return Err("Username and password are required")
        if not await self.repo.user.verify_user(username, password):
            return Err("Invalid username or password")
        user = await self.repo.user.get_user_by_username(username)
        if user is None:
            return Err("User not found")
        try:
            token = self._build_token(user)
        except RuntimeError as exc:
            return Err(str(exc))
        return Ok(token)
