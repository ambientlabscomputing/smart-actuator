import os

import bcrypt

from brain import Config, logger
from brain.models.user import PatchUser, SearchUsers, User, UserCreate
from brain.repository import Repository

# Self-hosted default: works out of the box with no configuration, same as
# Grafana/Nextcloud-style admin bootstrapping. Override via env vars for
# automated (e.g. docker-compose) deployments; _seed() warns loudly when the
# defaults are still in effect.
_DEFAULT_ADMIN_USERNAME = "admin"
_DEFAULT_ADMIN_PASSWORD = "admin"


class UserService:
    def __init__(self, repository: Repository, config: Config) -> None:
        self.repository = repository
        self.config = config

    async def start(self) -> None:
        await self._seed()

    async def _seed(self) -> None:
        username = os.environ.get("BRAIN_ADMIN_USERNAME", _DEFAULT_ADMIN_USERNAME)
        password = os.environ.get("BRAIN_ADMIN_PASSWORD", _DEFAULT_ADMIN_PASSWORD)

        existing_user = await self.repository.user.get_user_by_username(username)
        if existing_user:
            logger.info(f"Seed user '{username}' already exists, skipping")
        else:
            logger.info(f"Creating seed user '{username}'")
            await self.repository.user.create_user(
                UserCreate(username=username, name="Admin User", password=password),
                created_by="system",
            )

        if username == _DEFAULT_ADMIN_USERNAME and password == _DEFAULT_ADMIN_PASSWORD:
            logger.warning(
                "Using default admin credentials ({}/{}). Set BRAIN_ADMIN_USERNAME and "
                "BRAIN_ADMIN_PASSWORD before exposing this brain to an untrusted network.",
                _DEFAULT_ADMIN_USERNAME,
                _DEFAULT_ADMIN_PASSWORD,
            )

    async def has_default_password(self, username: str) -> bool:
        """Whether the given user's current password is still the well-known default."""
        password_hash = await self.repository.user.get_password_hash(username)
        if password_hash is None:
            return False
        default = _DEFAULT_ADMIN_PASSWORD.encode("utf-8")
        return bcrypt.checkpw(default, password_hash.encode("utf-8"))

    async def get_user(self, user_id: str) -> User | None:
        return await self.repository.user.get_user(user_id)

    async def search_users(self, search: SearchUsers) -> tuple[list[User], int]:
        return await self.repository.user.search_users(search)

    async def create_user(self, user_create: UserCreate, created_by: str) -> User:
        return await self.repository.user.create_user(user_create, created_by)

    async def update_user(self, user_id: int, patch: PatchUser, updated_by: str) -> User | None:
        return await self.repository.user.update_user(user_id, patch, updated_by)

    async def delete_user(self, user_id: int) -> None:
        await self.repository.user.delete_user(user_id)
