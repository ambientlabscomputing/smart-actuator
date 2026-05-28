from enum import StrEnum

from pydantic import BaseModel


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
