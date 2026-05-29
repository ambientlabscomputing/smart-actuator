from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from brain.models.user import SqlUser, User, UserCreate, PatchUser
from brain.repository.session_decorator import with_session
import bcrypt
from datetime import datetime, timezone

class UserRepository:
    @with_session
    async def create_user(self, session: AsyncSession, user_create: UserCreate, created_by: str) -> User:
        password_hash = self.hash_password(user_create.password)
        sql_user = SqlUser(
            username=user_create.username,
            name=user_create.name,
            password_hash=password_hash,
            created_by=created_by,
            updated_by=created_by,
        )
        session.add(sql_user)
        await session.commit()
        await session.refresh(sql_user)
        return User.model_validate(sql_user)

    @with_session
    async def get_user_by_username(self, session: AsyncSession, username: str) -> User | None:
        result = await session.execute(select(SqlUser).where(SqlUser.username == username))
        sql_user = result.scalar_one_or_none()
        return User.model_validate(sql_user) if sql_user else None

    @with_session
    async def update_user(self, session: AsyncSession, username: str, patch: PatchUser, updated_by: str) -> User | None:
        result = await session.execute(select(SqlUser).where(SqlUser.username == username))
        sql_user = result.scalar_one_or_none()
        if not sql_user:
            return None

        if patch.username is not None:
            sql_user.username = patch.username
        if patch.name is not None:
            sql_user.name = patch.name
        if patch.password is not None:
            sql_user.password_hash = self.hash_password(patch.password)

        sql_user.updated_by = updated_by
        sql_user.updated_at = datetime.now(timezone.utc)

        await session.commit()
        await session.refresh(sql_user)
        return User.model_validate(sql_user)
    
    @with_session
    async def delete_user(self, session: AsyncSession, username: str) -> bool:
        result = await session.execute(select(SqlUser).where(SqlUser.username == username))
        sql_user = result.scalar_one_or_none()
        if not sql_user:
            return False

        await session.delete(sql_user)
        await session.commit()
        return True

    @with_session
    async def verify_user(self, session: AsyncSession, username: str, password: str) -> bool:
        result = await session.execute(select(SqlUser).where(SqlUser.username == username))
        sql_user = result.scalar_one_or_none()
        if not sql_user:
            return False

        return bcrypt.checkpw(password.encode("utf-8"), sql_user.password_hash.encode("utf-8"))

    def hash_password(self, password: str) -> str:
        hashed_password = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12))
        return hashed_password.decode("utf-8")
