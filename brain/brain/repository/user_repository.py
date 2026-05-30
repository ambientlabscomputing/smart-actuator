from datetime import UTC, datetime

import bcrypt
from async_lru import alru_cache
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from brain.models.user import PatchUser, SearchUsers, SqlUser, User, UserCreate
from brain.repository.session_decorator import with_session


class UserRepository:
    @with_session
    async def create_user(
        self, user_create: UserCreate, created_by: str, *, session: AsyncSession | None = None
    ) -> User:
        assert session is not None
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

    @alru_cache(maxsize=128, ttl=300)
    @with_session
    async def get_user(self, user_id: str, *, session: AsyncSession | None = None) -> User | None:
        assert session is not None
        result = await session.execute(select(SqlUser).where(SqlUser.username == user_id))
        sql_user = result.scalar_one_or_none()
        return User.model_validate(sql_user) if sql_user else None

    @alru_cache(maxsize=128, ttl=300)
    @with_session
    async def get_user_by_username(
        self, username: str, *, session: AsyncSession | None = None
    ) -> User | None:
        assert session is not None
        result = await session.execute(select(SqlUser).where(SqlUser.username == username))
        sql_user = result.scalar_one_or_none()
        return User.model_validate(sql_user) if sql_user else None

    @with_session
    async def search_users(
        self, search: SearchUsers, *, session: AsyncSession | None = None
    ) -> tuple[list[User], int]:
        assert session is not None
        query = select(SqlUser)
        if search.username:
            query = query.where(SqlUser.username.ilike(f"%{search.username}%"))
        if search.name:
            query = query.where(SqlUser.name.ilike(f"%{search.name}%"))
        if search.sort_by in {"username", "name", "created_at", "updated_at"}:
            sort_column = getattr(SqlUser, search.sort_by)
            if search.sort_order == "desc":
                sort_column = sort_column.desc()
            query = query.order_by(sort_column)
        else:
            query = query.order_by(SqlUser.created_at)
        query = query.offset(search.offset).limit(search.limit)
        result = await session.execute(query)
        users = [User.model_validate(sql_user) for sql_user in result.scalars().all()]
        total = await session.execute(query.count())
        return users, total.scalar()

    @with_session
    async def update_user(
        self,
        user_id: int,
        patch: PatchUser,
        updated_by: str,
        *,
        session: AsyncSession | None = None,
    ) -> User | None:
        assert session is not None
        result = await session.execute(select(SqlUser).where(SqlUser.id == user_id))
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
        sql_user.updated_at = datetime.now(UTC)

        await session.commit()
        await session.refresh(sql_user)
        return User.model_validate(sql_user)

    @with_session
    async def delete_user(self, user_id: int, *, session: AsyncSession | None = None) -> bool:
        assert session is not None
        result = await session.execute(select(SqlUser).where(SqlUser.id == user_id))
        sql_user = result.scalar_one_or_none()
        if not sql_user:
            return False

        await session.delete(sql_user)
        await session.commit()
        return True

    @with_session
    async def verify_user(
        self, username: str, password: str, *, session: AsyncSession | None = None
    ) -> bool:
        assert session is not None
        result = await session.execute(select(SqlUser).where(SqlUser.username == username))
        sql_user = result.scalar_one_or_none()
        if not sql_user:
            return False
        await session.execute(
            update(SqlUser).where(SqlUser.username == username).values(updated_at=datetime.now(UTC))
        )
        await session.commit()
        return bcrypt.checkpw(password.encode("utf-8"), sql_user.password_hash.encode("utf-8"))

    def hash_password(self, password: str) -> str:
        hashed_password = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12))
        return hashed_password.decode("utf-8")
