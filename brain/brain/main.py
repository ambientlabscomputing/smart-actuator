import asyncio

import uvicorn

from brain import Config, logger
from brain.interface.app import create_app
from brain.interface.grpc.server import create_grpc_server
from brain.repository.session_maker import init_session_maker
from brain.service import init_brain_service


def main() -> None:
    asyncio.run(run())


async def run() -> None:
    config = Config()
    init_session_maker(config)
    logger.info("Starting Brain with config: {}", config)

    # Single shared BrainService for both REST and gRPC.
    service = init_brain_service(config)
    app = create_app(config)
    grpc_server = create_grpc_server(service, config)

    uvicorn_cfg = uvicorn.Config(
        app,
        host=config.rest.host,
        port=config.rest.port,
        log_level="info",
    )
    uvicorn_server = uvicorn.Server(uvicorn_cfg)

    await grpc_server.start()
    logger.info("gRPC server started on %s:%d", config.grpc.host, config.grpc.port)

    try:
        # When uvicorn exits (normal shutdown via SIGINT), tear down the gRPC
        # server too so we don't block forever in wait_for_termination().
        async def _serve_http() -> None:
            try:
                await uvicorn_server.serve()
            finally:
                await grpc_server.stop(grace=2)

        async with asyncio.TaskGroup() as tg:
            tg.create_task(_serve_http())
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
