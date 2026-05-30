import json
from enum import StrEnum

from pydantic import BaseModel
from sqlalchemy.orm import Mapped, mapped_column

from brain.models.base import SqlBase


class CalibrationJobStatus(StrEnum):
    started = "started"
    waiting_for_home = "waiting_for_home"
    running_sweep = "running_sweep"
    completed = "completed"
    aborted = "aborted"
    faulted = "faulted"


class CalibrationJobState(BaseModel):
    job_id: str
    machine_id: str
    joint_index: int
    status: CalibrationJobStatus
    step: int
    prompt: str
    last_measurement: dict = {}
    result: dict = {}
    error: str = ""
    created_at: int = 0
    updated_at: int = 0


class SqlCalibrationSession(SqlBase):
    __tablename__ = "calibration_sessions"

    job_id: Mapped[str] = mapped_column(unique=True, nullable=False, index=True)
    machine_id: Mapped[str] = mapped_column(nullable=False, index=True)
    joint_index: Mapped[int] = mapped_column(nullable=False)
    status: Mapped[str] = mapped_column(nullable=False)
    step: Mapped[int] = mapped_column(nullable=False, default=0)
    prompt: Mapped[str] = mapped_column(nullable=False, default="")
    last_measurement_json: Mapped[str] = mapped_column(nullable=False, default="{}")
    result_json: Mapped[str] = mapped_column(nullable=False, default="{}")
    error: Mapped[str] = mapped_column(nullable=False, default="")

    def to_state(self) -> CalibrationJobState:
        return CalibrationJobState(
            job_id=self.job_id,
            machine_id=self.machine_id,
            joint_index=self.joint_index,
            status=CalibrationJobStatus(self.status),
            step=self.step,
            prompt=self.prompt,
            last_measurement=json.loads(self.last_measurement_json),
            result=json.loads(self.result_json),
            error=self.error,
        )
