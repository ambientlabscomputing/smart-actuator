from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from brain.interface.rest import (
    actuators_router,
    events_router,
    machine_router,
    mode_router,
    motion_router,
    programs_router,
    state_router,
)
from brain.interface.ros import RosGateway
from brain.service import new_brain_service
from brain.utils.config import Config

_API_PREFIX = "/api/v1"


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

    app.include_router(actuators_router, prefix=_API_PREFIX)
    app.include_router(machine_router, prefix=_API_PREFIX)
    app.include_router(mode_router, prefix=_API_PREFIX)
    app.include_router(motion_router, prefix=_API_PREFIX)
    app.include_router(programs_router, prefix=_API_PREFIX)
    app.include_router(state_router, prefix=_API_PREFIX)
    app.include_router(events_router, prefix=_API_PREFIX)

    return app
