from brain.utils.config import Config

from .factory import new_brain_service
from .service import BrainService, Service

app_svc: BrainService | None = None


def init_brain_service(config: Config) -> BrainService:
    global app_svc
    if app_svc is not None:
        raise RuntimeError("BrainService already initialized")
    app_svc = new_brain_service(config)
    return app_svc


__all__ = ["BrainService", "Service", "new_brain_service", "init_brain_service", "app_svc"]
