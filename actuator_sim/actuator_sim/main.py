import asyncio
import signal

import click

from actuator_sim import logger, service
from actuator_sim.interface import new_interface
from actuator_sim.utils.config import ActuatorConfig, get_config_location, load_config
from actuator_sim.utils.logger import setup_logger


@click.group()
def cli():
    """actuator_sim CLI entrypoint."""


def _load_runtime_config() -> ActuatorConfig:
    """Load runtime configuration and initialize logging."""
    config_path = get_config_location()
    config = load_config(config_path)
    setup_logger(config)
    logger.info("Actuator simulator starting with configuration from {}", config_path)
    return config


def main():
    """Compatibility wrapper for direct invocation."""
    cli()


@cli.command("run")
def run_command():
    """Run the actuator simulator service."""
    config = _load_runtime_config()
    try:
        with logger.contextualize(config=config.model_dump(mode="json")):
            asyncio.run(run(config))
    except KeyboardInterrupt:
        pass


async def run(config: ActuatorConfig):
    """Run the actuator simulator service."""
    logger.info("Running actuator simulator service")
    svc = service.new_service(config)
    await svc.start()
    interface = new_interface(config, svc)
    await interface.start()

    loop = asyncio.get_running_loop()
    stop = asyncio.Event()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, stop.set)

    await stop.wait()

    logger.info("Shutting down gracefully...")
    await interface.stop()
    await svc.stop()
    logger.info("Shutdown complete")


if __name__ == "__main__":
    cli()
