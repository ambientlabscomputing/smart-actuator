from datetime import UTC, datetime

from pydantic import BaseModel, Field
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(BaseModel):
    class Config:
        from_attributes = True

    id: int = Field(..., description="Unique identifier for the record")
    created_by: str = Field(..., description="Username of the creator")
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        description="Timestamp of record creation",
    )
    updated_by: str = Field(..., description="Username of the last updater")
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC), description="Timestamp of last update"
    )


class SqlBase(DeclarativeBase):
    id: Mapped[int] = mapped_column(primary_key=True)
    created_by: Mapped[str] = mapped_column(nullable=False)
    created_at: Mapped[datetime] = mapped_column(nullable=False, default=lambda: datetime.now(UTC))
    updated_by: Mapped[str] = mapped_column(nullable=False)
    updated_at: Mapped[datetime] = mapped_column(nullable=False, default=lambda: datetime.now(UTC))


class BaseListRequest(BaseModel):
    limit: int = Field(100, description="Maximum number of records returned")
    offset: int = Field(0, description="Number of records skipped before the returned results")
    sort_by: str | None = Field(None, description="Field by which to sort the records")
    sort_order: str = Field("asc", description="Direction of sorting: 'asc' or 'desc'")


class BaseListResponse[T: BaseModel](BaseModel):
    results: list[T] = Field(..., description="List of records")
    total: int = Field(..., description="Total number of records matching the query")
    count: int = Field(..., description="Number of records in the current response")
    query: BaseListRequest | None = Field(
        None, description="Original query parameters used for the request", exclude_if=None
    )
