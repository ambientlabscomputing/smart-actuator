import asyncio

from brain import Config, logger
from brain.service import new_brain_service


def main():
    asyncio.run(run())


async def run():
    config = Config()
    logger.info("Starting the application with config: %s", config)
    service = new_brain_service(config)
    try:
        logger.info("Starting the brain service...")
        await service.start()
        logger.info("Brain service started successfully.")
    except Exception as e:
        logger.error("An error occurred while starting the brain service: %s", e)
    finally:
        logger.info("Stopping the brain service...")
        await service.stop()
        logger.info("Brain service stopped.")


if __name__ == "__main__":
    main()
