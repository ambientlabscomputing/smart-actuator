from abc import ABC, abstractmethod

from brain import Config
from brain.repository.repository import Repository


class Service(ABC):
    @abstractmethod
    async def start(self):
        pass

    @abstractmethod
    async def stop(self):
        pass


class BrainService(Service):
    def __init__(self, repository: Repository, config: Config):
        self.repository = repository
        self.config = config

    async def start(self):
        # Initialize the service, e.g., load configuration from the repository
        pass

    async def stop(self):
        # Clean up resources if needed
        pass
