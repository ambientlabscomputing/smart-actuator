from datetime import datetime

from pydantic import BaseModel
from sqlalchemy.orm import Mapped, mapped_column

from brain.models.base import Base, BaseListRequest, BaseListResponse, SqlBase


class UserBase(Base):
    username: str
    name: str
    last_login: datetime | None = None


class User(UserBase):
    pass


class InternalUser(UserBase):
    password_hash: str


class UserCreate(BaseModel):
    username: str
    name: str
    password: str


class PatchUser(BaseModel):
    username: str | None = None
    name: str | None = None
    password: str | None = None


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class SearchUsers(BaseListRequest):
    username: str | None = None
    name: str | None = None


class SearchUsersResponse(BaseListResponse[User]):
    pass


class SqlUser(SqlBase):
    __tablename__ = "users"

    username: Mapped[str] = mapped_column(unique=True, nullable=False)
    name: Mapped[str] = mapped_column(nullable=False)
    password_hash: Mapped[str] = mapped_column(nullable=False)
    last_login: Mapped[datetime | None] = mapped_column(nullable=True)
