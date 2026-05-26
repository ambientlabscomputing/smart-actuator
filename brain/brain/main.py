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

    # The FastAPI app manages the BrainService lifecycle via its lifespan handler.
    # We also create a BrainService instance here solely to pass to the gRPC server;
    # in production the two should share the same instance via a DI container.
    # TODO: unify into a single shared BrainService instance.
    app = create_app(config)
    service = new_brain_service(config)
    grpc_server = create_grpc_server(service, config)

    uvicorn_cfg = uvicorn.Config(
        app,
        host=config.rest_host,
        port=config.rest_port,
        log_level="info",
    )
    uvicorn_server = uvicorn.Server(uvicorn_cfg)

    await service.start()
    await grpc_server.start()
    logger.info("gRPC server started on %s:%d", config.grpc_host, config.grpc_port)

    try:
        async with asyncio.TaskGroup() as tg:
            tg.create_task(uvicorn_server.serve())
            tg.create_task(grpc_server.wait_for_termination())
    finally:
        logger.info("Shutting down Brain")
        await grpc_server.stop(grace=5)
        await service.stop()


if __name__ == "__main__":
    main()


if __name__ == "__main__":
    main()
