from brain import service as _svc
from brain.service.service import BrainService


def get_service() -> BrainService:
    """FastAPI dependency — returns the process-wide BrainService."""
    assert _svc.app_svc is not None, (
        "BrainService not initialized — call init_brain_service() first"
    )
    return _svc.app_svc
