import os
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from result import Err, Ok
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import JSONResponse

from brain.interface.rest import (
    actuators_router,
    calibrations_router,
    events_router,
    machine_router,
    mode_router,
    motion_router,
    programs_router,
    state_router,
    templates_router,
    users_router,
)
from brain.interface.ros import RosGateway
from brain.service import app_svc
from brain.utils.config import Config
from brain.utils.context import journey_id_var
from brain.utils.logger import logger

_API_PREFIX = "/api/v1"

# Routes that bypass bearer-token auth (e.g. the login endpoint itself).
_PUBLIC_PATHS: frozenset[str] = frozenset({f"{_API_PREFIX}/users/login"})


class _RequestContextMiddleware(BaseHTTPMiddleware):
    """
    Per-request logging context + uncaught-exception logger.

    Binds journey_id, request_id, method, and path into the loguru context
    so every log line emitted inside the handler is traceable. Catches and
    logs any exception that escapes the route, then re-raises so FastAPI's
    default 500 handler still runs.
    """

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        journey_id = request.headers.get("x-journey-id") or str(uuid.uuid4())
        request_id = request.headers.get("x-request-id") or uuid.uuid4().hex
        journey_id_var.set(journey_id)

        with logger.contextualize(
            journey_id=journey_id,
            request_id=request_id,
            method=request.method,
            path=request.url.path,
        ):
            try:
                response = await call_next(request)
            except Exception:
                logger.opt(exception=True).error(
                    "Unhandled exception in {} {}", request.method, request.url.path
                )
                raise

        response.headers["x-journey-id"] = journey_id
        response.headers["x-request-id"] = request_id
        return response


class _TokenMiddleware(BaseHTTPMiddleware):
    """
    Bearer-token authentication via the OAuthService (RS256 JWT).

    Expects `Authorization: Bearer <token>` (or `?token=` on WebSocket upgrades).
    Validates the JWT, resolves the owning User, and attaches it to
    `request.state.user`. Binds `user_id` into the loguru context.

    Bypassed entirely when `BRAIN_AUTH_DISABLED` is truthy — for local dev.
    """

    @staticmethod
    def _extract_token(request: Request) -> str:
        if request.headers.get("upgrade", "").lower() == "websocket":
            return request.query_params.get("token", "")
        auth = request.headers.get("authorization", "")
        if auth.lower().startswith("bearer "):
            return auth.split(" ", 1)[1].strip()
        return ""

    @staticmethod
    def _unauthorized(detail: str = "Unauthorized") -> JSONResponse:
        return JSONResponse(
            {"detail": detail},
            status_code=401,
            headers={"WWW-Authenticate": "Bearer"},
        )

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if os.environ.get("BRAIN_AUTH_DISABLED", "").lower() in ("1", "true", "yes"):
            return await call_next(request)
        if request.url.path in _PUBLIC_PATHS:
            return await call_next(request)
        if app_svc is None:
            return self._unauthorized()

        token = self._extract_token(request)
        if not token:
            return self._unauthorized()

        result = await app_svc.oauth_service.validate_token(token)
        match result:
            case Ok(user):
                pass
            case Err(error):
                return self._unauthorized(str(error))
        request.state.user = user
        with logger.contextualize(user_id=user.username):
            return await call_next(request)


@asynccontextmanager
async def _lifespan(app: FastAPI) -> AsyncIterator[None]:
    config: Config = app.state.config
    if app_svc is None:
        raise RuntimeError(
            "BrainService not initialized — call init_brain_service() before create_app()"
        )
    ros = RosGateway(config)

    app.state.ros = ros

    await app_svc.start()
    await ros.start()
    yield
    await ros.stop()
    await app_svc.stop()


def create_app(config: Config | None = None) -> FastAPI:
    app = FastAPI(
        title="Brain API",
        description="Smart Actuator Brain — REST interface",
        version="0.1.0",
        lifespan=_lifespan,
    )
    app.state.config = config or Config()

    # CORS — allow the Vite dev server (and any origin in dev when no token set)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["x-journey-id", "x-request-id"],
    )

    # Order matters: request context first so it's always in scope, token second
    app.add_middleware(_RequestContextMiddleware)
    app.add_middleware(_TokenMiddleware)

    app.include_router(actuators_router, prefix=_API_PREFIX)
    app.include_router(calibrations_router, prefix=_API_PREFIX)
    app.include_router(machine_router, prefix=_API_PREFIX)
    app.include_router(mode_router, prefix=_API_PREFIX)
    app.include_router(motion_router, prefix=_API_PREFIX)
    app.include_router(programs_router, prefix=_API_PREFIX)
    app.include_router(state_router, prefix=_API_PREFIX)
    app.include_router(events_router, prefix=_API_PREFIX)
    app.include_router(templates_router, prefix=_API_PREFIX)
    app.include_router(users_router, prefix=_API_PREFIX)

    return app
