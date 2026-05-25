from pydantic import BaseModel, Field

# ── Command requests ────────────────────────────────────────────────────────


class SetPositionRequest(BaseModel):
    angle: float = Field(..., description="Target angle in radians")


class SetVelocityRequest(BaseModel):
    velocity: float = Field(..., description="Target velocity in rad/s")


class SetTorqueRequest(BaseModel):
    torque: float = Field(..., description="Target torque in N\u00b7m")


# ── Responses ────────────────────────────────────────────────────────────────


class CommandResponse(BaseModel):
    success: bool
    message: str = ""


class PositionResponse(BaseModel):
    angle: float = Field(..., description="Current angle in radians")


class VelocityResponse(BaseModel):
    velocity: float = Field(..., description="Current velocity in rad/s")


class CurrentResponse(BaseModel):
    current: float = Field(..., description="Current draw in amperes")
