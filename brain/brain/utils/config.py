from pydantic import BaseModel, Field


class Config(BaseModel):
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
