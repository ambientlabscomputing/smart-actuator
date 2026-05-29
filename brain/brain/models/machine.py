import json

from pydantic import BaseModel, Field
from sqlalchemy.orm import Mapped, mapped_column

from brain.models.base import SqlBase


class TemplateRef(BaseModel):
    """Identifies a specific template version in a git-hosted catalogue."""

    source: str
    template_id: str
    version: str
    content_hash: str
    ref: str = Field(description="Git tag, branch, or SHA — floating or pinned")


class TemplateMeta(BaseModel):
    """Summary information about a template from the catalogue."""

    template_id: str
    name: str
    summary: str
    version: str
    publisher: str
    source: str
    brain_compatibility: str = ""
    firmware_compatibility: str = ""


class MachineDescription(BaseModel):
    """
    The minimal user-authored description of a machine: which template,
    what parameter values, and which actuators are bound to which joints.
    This is the source of truth persisted across restarts, not the expanded URDF.
    """

    machine_id: str
    template_ref: TemplateRef
    parameters: dict[str, float | str] = Field(default_factory=dict)
    actuator_bindings: list[str] = Field(
        default_factory=list,
        description="Actuator IDs in joint-slot order; index i → joint slot i",
    )


class Machine(BaseModel):
    """
    The runtime representation of a bound machine: the description plus
    the expanded URDF and bind-time computed caches.
    """

    description: MachineDescription
    expanded_urdf: str = ""
    reach_volume_cache: dict[str, float] = Field(default_factory=dict)
    collision_bounds_cache: dict[str, object] = Field(default_factory=dict)
    joint_names: list[str] = Field(default_factory=list)


class SqlMachine(SqlBase):
    __tablename__ = "machines"

    machine_id: Mapped[str] = mapped_column(unique=True, nullable=False, index=True)
    description_json: Mapped[str] = mapped_column(nullable=False)
    expanded_urdf: Mapped[str] = mapped_column(nullable=False, default="")

    def to_machine(self) -> Machine:
        description = MachineDescription.model_validate(json.loads(self.description_json))
        return Machine(description=description, expanded_urdf=self.expanded_urdf)


class SqlSimEntry(SqlBase):
    __tablename__ = "sim_registry"

    machine_id: Mapped[str] = mapped_column(nullable=False, index=True)
    slot: Mapped[int] = mapped_column(nullable=False)
    address: Mapped[str] = mapped_column(nullable=False)
    pid: Mapped[int] = mapped_column(nullable=False)
    actuator_id: Mapped[str] = mapped_column(nullable=False)
    joint_name: Mapped[str] = mapped_column(nullable=False, default="")


class SqlHardwareEntry(SqlBase):
    __tablename__ = "hardware_registry"

    machine_id: Mapped[str] = mapped_column(nullable=False, index=True)
    slot: Mapped[int] = mapped_column(nullable=False)
    address: Mapped[str] = mapped_column(nullable=False)
    actuator_id: Mapped[str] = mapped_column(nullable=False)
    joint_name: Mapped[str] = mapped_column(nullable=False, default="")
