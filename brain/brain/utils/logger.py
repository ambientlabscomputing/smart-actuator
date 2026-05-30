import sys

from loguru import logger

from brain import Config

__all__ = ["logger"]


def setup_logger(config: Config) -> None:
    """
    Configure the global logger based on the provided config.

    This should be called once at application startup.
    """
    logger.remove()  # Remove default handler

    # logger 1: log to file with rotation and retention
    logger.add(
        sink=config.log.log_file,
        level=config.log.log_level,
        rotation="10 MB",  # Rotate log file after it reaches 10 MB
        retention="7 days",  # Keep logs for 7 days
        compression="zip",  # Compress rotated logs
        serialize=True,
    )

    # logger 2: log to console with colorization
    if config.log.log_to_console:
        logger.add(
            sink=sys.stderr,
            level=config.log.log_level,
            colorize=True,
            serialize=False,  # Don't serialize console logs
        )
