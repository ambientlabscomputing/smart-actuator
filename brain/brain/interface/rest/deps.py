from fastapi import Request

from brain.service.service import BrainService


def get_service(request: Request) -> BrainService:
    """FastAPI dependency — injects the BrainService from app state."""
    return request.app.state.brain  # type: ignore[no-any-return]
