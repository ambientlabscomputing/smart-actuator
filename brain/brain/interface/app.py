import os
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

from brain.interface.rest import (
    actuators_router,
    events_router,
    machine_router,
    mode_router,
    motion_router,
    programs_router,
    state_router,
    templates_router,
)
from brain.interface.ros import RosGateway
from brain.service import new_brain_service
from brain.utils.config import Config
from brain.utils.context import journey_id_var
from brain.utils.logger import logger

_API_PREFIX = "/api/v1"


class _JourneyIdMiddleware(BaseHTTPMiddleware):
    """Reads X-Journey-Id from incoming requests (or generates one) and logs it."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        journey_id = request.headers.get("x-journey-id") or str(uuid.uuid4())
        journey_id_var.set(journey_id)
        with logger.contextualize(journey_id=journey_id):
            response = await call_next(request)
        response.headers["x-journey-id"] = journey_id
        return response


class _TokenMiddleware(BaseHTTPMiddleware):
    """
    Enforces a static bearer token when BRAIN_TOKEN env var is set.
    When the env var is absent the middleware is a no-op — safe for local dev.
    WebSocket upgrade requests skip token checks (token passed as query param instead).
    """

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        required = os.environ.get("BRAIN_TOKEN", "")
        if not required:
            return await call_next(request)

        # WebSocket upgrades: token provided as ?token=... query param
        if request.headers.get("upgrade", "").lower() == "websocket":
            provided = request.query_params.get("token", "")
        else:
            auth = request.headers.get("authorization", "")
            provided = auth.removeprefix("Bearer ").strip()

        if provided != required:
            from starlette.responses import JSONResponse

            return JSONResponse({"detail": "Unauthorized"}, status_code=401)

        return await call_next(request)


@asynccontextmanager
async def _lifespan(app: FastAPI) -> AsyncIterator[None]:
    config: Config = app.state.config
    service = new_brain_service(config)
    ros = RosGateway(config)

    app.state.brain = service
    app.state.ros = ros

    await service.start()
    await ros.start()
    yield
    await ros.stop()
    await service.stop()


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
        expose_headers=["x-journey-id"],
    )

    # Order matters: journey-id first so it's always in context, token second
    app.add_middleware(_JourneyIdMiddleware)
    app.add_middleware(_TokenMiddleware)

    app.include_router(actuators_router, prefix=_API_PREFIX)
    app.include_router(machine_router, prefix=_API_PREFIX)
    app.include_router(mode_router, prefix=_API_PREFIX)
    app.include_router(motion_router, prefix=_API_PREFIX)
    app.include_router(programs_router, prefix=_API_PREFIX)
    app.include_router(state_router, prefix=_API_PREFIX)
    app.include_router(events_router, prefix=_API_PREFIX)
    app.include_router(templates_router, prefix=_API_PREFIX)

    return app

