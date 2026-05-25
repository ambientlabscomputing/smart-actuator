import sys

from loguru import logger

from actuator_sim.utils.config import ActuatorConfig


def setup_logger(config: ActuatorConfig):
    logger.remove()  # Remove default logger
    logger.add(
        config.log_settings.file,
        rotation="10 MB",
        retention="7 days",
        level=config.log_settings.level,
        serialize=True,
    )
    if config.log_settings.log_to_stderr:
        logger.add(sys.stderr, level=config.log_settings.level)
    logger.info("Logger initialized with file: {}", config.log_settings.file)
