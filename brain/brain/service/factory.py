from brain import Config
from brain.repository.repository import Repository
from brain.service.service import BrainService


def new_brain_service(config: Config) -> BrainService:
    repository = Repository()
    service = BrainService(repository, config)
    return service
