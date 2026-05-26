from fastapi import APIRouter

router = APIRouter(prefix="/brain", tags=["brain"])


@router.get("/health")
async def health_check():
    return {"status": "ok"}
