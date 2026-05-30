from pathlib import Path

from pydantic import BaseModel, Field


class LogConfig(BaseModel):
    log_level: str = Field(default="INFO", description="Logging level (e.g., DEBUG, INFO, WARNING)")
    log_file: str = Field(
        default="brain.log",
        description="Path to the log file. Logs will be rotated and compressed automatically.",
    )
    log_to_console: bool = Field(
        default=True,
        description="Whether to also log to the console (stdout).",
    )


class RestConfig(BaseModel):
    host: str = Field(default="0.0.0.0")
    port: int = Field(default=8080)


class GrpcConfig(BaseModel):
    host: str = Field(default="0.0.0.0")
    port: int = Field(default=50061)


class SidecarConfig(BaseModel):
    socket: str = Field(
        default="unix:///tmp/sidecar.sock",
        description="gRPC socket address for the Rust sidecar",
    )


class DatabaseConfig(BaseModel):
    path: str = Field(default="brain.db", description="Path to the SQLite database")

    @property
    def url(self) -> str:
        """SQLAlchemy async connection URL derived from path."""
        return f"sqlite+aiosqlite:///{self.path}"


class SimConfig(BaseModel):
    binary_path: str = Field(
        default="smart-actuator/target/debug/actuator-sim",
        description="Path to the actuator-sim binary, relative to the workspace root",
    )
    config_path: str = Field(
        default="smart-actuator/crates/actuator-sim/configs/default.yaml",
        description="Path to the base actuator-sim config YAML, relative to the workspace root",
    )
    port_range_start: int = Field(
        default=50100,
        description="First port in the range allocated to spawned sim instances",
    )
    port_range_end: int = Field(
        default=50199,
        description="Last port in the range allocated to spawned sim instances",
    )


class TemplateConfig(BaseModel):
    dir: str = Field(
        default=str(Path(__file__).parents[2] / "templates"),
        description="Directory containing in-tree template bundles",
    )
    cache_dir: str = Field(
        default="~/.brain/templates",
        description="Local directory for cached template repos",
    )
    trusted_sources: list[str] = Field(
        default=["github.com/ambient-labs"],
        description="Source URL prefixes trusted to load templates without a provenance warning",
    )


class OAuthConfig(BaseModel):
    """OAuth Server configuration"""

    cert_path: str = Field(
        default="cert.pem",
        description="Path to the TLS certificate file for the OAuth server",
    )
    key_path: str = Field(
        default="key.pem",
        description="Path to the TLS private key file for the OAuth server",
    )
    token_ttl_seconds: int = Field(
        default=3600,
        description="JWT access token lifetime in seconds",
    )


class Config(BaseModel):
    db: DatabaseConfig = Field(default_factory=DatabaseConfig, description="Database configuration")
    grpc: GrpcConfig = Field(default_factory=GrpcConfig, description="gRPC server configuration")
    log: LogConfig = Field(default_factory=LogConfig, description="Logging configuration")
    rest: RestConfig = Field(default_factory=RestConfig, description="REST server configuration")
    sidecar: SidecarConfig = Field(
        default_factory=SidecarConfig, description="Sidecar gRPC bridge configuration"
    )
    sim: SimConfig = Field(default_factory=SimConfig, description="Sim lifecycle configuration")
    templates: TemplateConfig = Field(
        default_factory=TemplateConfig, description="Template configuration"
    )
    oauth: OAuthConfig = Field(
        default_factory=OAuthConfig, description="OAuth server configuration"
    )
