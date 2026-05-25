from pydantic import BaseModel, Field

def get_config_location() -> str:
    import os
    return os.getenv("ACTUATOR_SIM_CONFIG", "configs/default.yaml")

def load_config(config_path: str) -> 'ActuatorConfig':
    """Load configuration from a YAML file."""
    import yaml
    with open(config_path, 'r') as f:
        config_data = yaml.safe_load(f)
    return ActuatorConfig(**config_data)

class LogSettings(BaseModel):
    file: str = Field(default="actuator_sim.log", description="Path to the log file")
    level: str = Field(default="ERROR", description="Logging level")
    log_to_stderr: bool = Field(default=False, description="Whether to log to stderr")


class GrpcConfig(BaseModel):
    host: str = Field(default="0.0.0.0", description="gRPC server bind address")
    port: int = Field(default=50051, description="gRPC server port")
    max_workers: int = Field(default=10, description="Thread-pool size for the gRPC server")


class ActuatorConfig(BaseModel):
    log_settings: LogSettings = Field(default_factory=LogSettings, description="Logging configuration")
    grpc: GrpcConfig = Field(default_factory=GrpcConfig, description="gRPC server configuration")
