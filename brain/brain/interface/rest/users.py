from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from result import Err, Ok

from brain import logger
from brain.interface.rest.deps import get_service
from brain.models.user import (
    LoginRequest,
    LoginResponse,
    PatchUser,
    SearchUsers,
    SearchUsersResponse,
    User,
    UserCreate,
)
from brain.service.service import BrainService

router = APIRouter(prefix="/users", tags=["users"])

Service = Annotated[BrainService, Depends(get_service)]


@router.get("/me", response_model=User)
async def get_current_user(request: Request) -> User:
    """
    Get the currently authenticated user.
    """
    user = request.state.user
    if not user:
        logger.error(
            "We should never hit this because the auth middleware "
            "should reject unauthenticated requests"
        )
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


@router.post("/login", response_model=LoginResponse)
async def login(body: LoginRequest, svc: Service) -> LoginResponse:
    """
    Authenticate a user and return a Bearer token.
    """
    match await svc.oauth_service.authenticate_user(body.username, body.password):
        case Ok(token):
            return LoginResponse(access_token=token)
        case Err(error):
            raise HTTPException(status_code=401, detail=str(error))


@router.get("/{user_id}", response_model=User)
async def get_user(user_id: str, svc: Service) -> User:
    """
    Get a user by their username.
    """
    user = await svc.user_service.get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail=f"User {user_id!r} not found")
    return user


@router.get("/", response_model=SearchUsersResponse)
async def search_users(
    svc: Service, params: Annotated[SearchUsers, Query()]
) -> SearchUsersResponse:
    """
    Search for users based on query parameters.
    """
    users, total = await svc.user_service.search_users(params)
    return SearchUsersResponse(results=users, total=total, count=len(users), query=params)


@router.post("/", response_model=User, status_code=201)
async def create_user(user_create: UserCreate, svc: Service, request: Request) -> User:
    """
    Create a new user.
    """
    return await svc.user_service.create_user(user_create, created_by=request.state.user.username)


@router.patch("/{user_id}", response_model=User)
async def update_user(user_id: int, user_patch: PatchUser, svc: Service, request: Request) -> User:
    """
    Update an existing user.
    """
    updated_user = await svc.user_service.update_user(
        user_id, user_patch, updated_by=request.state.user.username
    )
    if not updated_user:
        raise HTTPException(status_code=404, detail=f"User {user_id!r} not found")
    return updated_user


@router.delete("/{user_id}", status_code=204)
async def delete_user(user_id: int, svc: Service) -> None:
    """
    Delete a user by their ID.
    """
    deleted = await svc.user_service.delete_user(user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"User {user_id!r} not found")
