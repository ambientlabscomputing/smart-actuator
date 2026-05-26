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

class Config(BaseModel):
    log: LogConfig = Field(default_factory=LogConfig, description="Logging configuration")
    sidecar_socket: str = Field(
        default="unix:///tmp/sidecar.sock",
        description="gRPC socket address for the Rust sidecar",
    )
    db_path: str = Field(default="brain.db", description="Path to the SQLite database")
    rest_host: str = Field(default="0.0.0.0")
    rest_port: int = Field(default=8080)
    grpc_host: str = Field(default="0.0.0.0")
    grpc_port: int = Field(default=50051)
    template_cache_dir: str = Field(
        default="~/.brain/templates",
        description="Local directory for cached template repos",
    )
    trusted_template_sources: list[str] = Field(
        default=["github.com/ambient-labs"],
        description="Source URL prefixes trusted to load templates without a provenance warning",
    )
