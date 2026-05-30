from brain import Config, logger
from brain.models.user import PatchUser, SearchUsers, User, UserCreate
from brain.repository import Repository

seed_users = [
    UserCreate(username="admin", name="Admin User", password="admin"),
]


class UserService:
    def __init__(self, repository: Repository, config: Config) -> None:
        self.repository = repository
        self.config = config

    async def start(self) -> None:
        await self._seed()

    async def _seed(self) -> None:
        for user_create in seed_users:
            existing_user = await self.repository.user.get_user_by_username(user_create.username)
            if existing_user:
                logger.info(f"Seed user '{user_create.username}' already exists, skipping")
                continue
            logger.info(f"Creating seed user '{user_create.username}'")
            await self.repository.user.create_user(user_create, created_by="system")

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
