from pydantic import BaseModel, Field
from sqlalchemy.orm import Mapped, mapped_column
from brain.models.base import SqlBase, Base, BaseListResponse, BaseListRequest

class StoredFile(Base):
    """
    A file stored in the database, such as a calibration file or program file.
    """

    location: str = Field(description="File path or URI where the file is stored")
    size_bytes: int = Field(description="Size of the file in bytes")

class SqlStoredFile(SqlBase):
    __tablename__ = "stored_files"

    location: Mapped[str] = mapped_column(nullable=False)
    size_bytes: Mapped[int] = mapped_column(nullable=False)

class StoredFilesRequest(BaseListRequest):
    location: str | None = Field(None, description="Filter by file location (supports partial match)")

class StoredFilesResponse(BaseListResponse[StoredFile]):
    pass

class UploadFileRequest(BaseModel):
    location: str = Field(description="File path or URI where the file is stored")
    size_bytes: int = Field(description="Size of the file in bytes")
