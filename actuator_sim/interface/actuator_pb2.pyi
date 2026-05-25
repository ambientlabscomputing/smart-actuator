from typing import ClassVar as _ClassVar
from typing import Optional as _Optional

from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message

DESCRIPTOR: _descriptor.FileDescriptor

class SetPositionRequest(_message.Message):
    __slots__ = ("angle",)
    ANGLE_FIELD_NUMBER: _ClassVar[int]
    angle: float
    def __init__(self, angle: _Optional[float] = ...) -> None: ...

class SetVelocityRequest(_message.Message):
    __slots__ = ("velocity",)
    VELOCITY_FIELD_NUMBER: _ClassVar[int]
    velocity: float
    def __init__(self, velocity: _Optional[float] = ...) -> None: ...

class SetTorqueRequest(_message.Message):
    __slots__ = ("torque",)
    TORQUE_FIELD_NUMBER: _ClassVar[int]
    torque: float
    def __init__(self, torque: _Optional[float] = ...) -> None: ...

class ReadRequest(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class CommandResponse(_message.Message):
    __slots__ = ("success", "message")
    SUCCESS_FIELD_NUMBER: _ClassVar[int]
    MESSAGE_FIELD_NUMBER: _ClassVar[int]
    success: bool
    message: str
    def __init__(self, success: bool = ..., message: _Optional[str] = ...) -> None: ...

class PositionResponse(_message.Message):
    __slots__ = ("angle",)
    ANGLE_FIELD_NUMBER: _ClassVar[int]
    angle: float
    def __init__(self, angle: _Optional[float] = ...) -> None: ...

class VelocityResponse(_message.Message):
    __slots__ = ("velocity",)
    VELOCITY_FIELD_NUMBER: _ClassVar[int]
    velocity: float
    def __init__(self, velocity: _Optional[float] = ...) -> None: ...

class CurrentResponse(_message.Message):
    __slots__ = ("current",)
    CURRENT_FIELD_NUMBER: _ClassVar[int]
    current: float
    def __init__(self, current: _Optional[float] = ...) -> None: ...
