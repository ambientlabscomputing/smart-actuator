import asyncio

import uvicorn

from brain import Config, logger
from brain.interface.app import create_app
from brain.interface.grpc.server import create_grpc_server
from brain.service import new_brain_service


def main() -> None:
    asyncio.run(run())


async def run() -> None:
    config = Config()
    logger.info("Starting Brain with config: %s", config)

    # The FastAPI app manages the primary BrainService lifecycle via its lifespan.
    # The gRPC server gets its own instance for now; both share the same config.
    # TODO(J3): unify into a single shared BrainService via DI.
    app = create_app(config)
    grpc_service = new_brain_service(config)
    grpc_server = create_grpc_server(grpc_service, config)

    uvicorn_cfg = uvicorn.Config(
        app,
        host=config.rest_host,
        port=config.rest_port,
        log_level="info",
    )
    uvicorn_server = uvicorn.Server(uvicorn_cfg)

    await grpc_server.start()
    logger.info("gRPC server started on %s:%d", config.grpc_host, config.grpc_port)

    try:
        async with asyncio.TaskGroup() as tg:
            tg.create_task(uvicorn_server.serve())
            tg.create_task(grpc_server.wait_for_termination())
    except* (asyncio.CancelledError, KeyboardInterrupt):
        pass
    finally:
        logger.info("Shutting down Brain")
        try:
            await asyncio.shield(grpc_server.stop(grace=2))
        except (asyncio.CancelledError, Exception):
            pass


if __name__ == "__main__":
    main()

