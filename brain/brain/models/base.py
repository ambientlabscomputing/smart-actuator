from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from datetime import datetime, timezone
from pydantic import BaseModel, Field

class Base(BaseModel):
    class Config:
        from_attributes = True
    id: int = Field(..., description="Unique identifier for the record")
    created_by: str = Field(..., description="Username of the creator")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), description="Timestamp of record creation")
    updated_by: str = Field(..., description="Username of the last updater")
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), description="Timestamp of last update")

class SqlBase(DeclarativeBase):
    id: Mapped[int] = mapped_column(primary_key=True)
    created_by: Mapped[str] = mapped_column(nullable=False)
    created_at: Mapped[datetime] = mapped_column(nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_by: Mapped[str] = mapped_column(nullable=False)
    updated_at: Mapped[datetime] = mapped_column(nullable=False, default=lambda: datetime.now(timezone.utc))
