import asyncio
import pathlib

import click
import uvicorn

from brain import generate_default_config, load_config, logger, msg
from brain.interface.app import create_app
from brain.interface.grpc.server import create_grpc_server
from brain.repository.session_maker import init_session_maker
from brain.service import init_brain_service
from brain.utils.logger import setup_logger


@click.group()
def main() -> None:
    pass


@main.command()
def cfggen() -> None:
    """Generate a default config file."""
    path = generate_default_config()
    msg("Generated default config.", {"path": path})


@main.command("gcode-samples")
@click.option(
    "--name",
    "-n",
    "names",
    multiple=True,
    help=("Sample name(s) to generate.  May be repeated.  Omit to generate ALL samples."),
)
@click.option(
    "--output-dir",
    "-o",
    default=".",
    show_default=True,
    type=click.Path(file_okay=False, writable=True, path_type=pathlib.Path),
    help="Directory where .gcode files are written.",
)
@click.option(
    "--list",
    "list_only",
    is_flag=True,
    default=False,
    help="List available sample names and exit.",
)
def gcode_samples(
    names: tuple[str, ...],
    output_dir: pathlib.Path,
    list_only: bool,
) -> None:
    """Generate sample G-code files with recognisable motions and arcs.

    Each sample stays within 100–250 mm of the base (0.1–0.25 m) so it
    exercises a realistic working envelope without extreme reach.

    \b
    Examples:
      brain gcode-samples --list
      brain gcode-samples -n circle -n helix -o /tmp/gcode
      brain gcode-samples -o ./samples   # generate all
    """
    from brain.service.gcode.samples import SAMPLE_NAMES, generate_sample

    if list_only:
        click.echo("Available samples:")
        for s in SAMPLE_NAMES:
            click.echo(f"  {s}")
        return

    targets = list(names) if names else SAMPLE_NAMES
    unknown = [n for n in targets if n not in SAMPLE_NAMES]
    if unknown:
        raise click.BadParameter(
            f"Unknown sample(s): {', '.join(unknown)}.  Use --list to see available names.",
            param_hint="--name",
        )

    output_dir.mkdir(parents=True, exist_ok=True)
    for name in targets:
        content = generate_sample(name)
        dest = output_dir / f"{name}.gcode"
        dest.write_text(content, encoding="utf-8")
        msg(f"Wrote {name}.gcode", {"path": str(dest), "lines": content.count("\n") + 1})


@main.command()
def run() -> None:
    asyncio.run(_run())


async def _run() -> None:
    config = load_config()
    setup_logger(config)
    init_session_maker(config)
    logger.debug("Starting Brain with config: {}", config.model_dump_json(indent=4))

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
