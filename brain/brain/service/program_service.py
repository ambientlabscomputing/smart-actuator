from brain.models.program import Program, ProgramMeta, ProgramNode
from brain.repository.repository import Repository
from brain.utils.config import Config
from brain.utils.logger import logger


class TypeCheckError(Exception):
    pass


class ProgramService:
    """
    Program storage and interpretation (C6).

    Programs are stored as a proto-schema-defined AST. The Web UI's block
    editor is a view over that AST; external languages drive the Brain via
    gRPC rather than emitting the AST directly. The interpreter runs in
    Python — programs are bound by physical motion time, not interpreter speed.
    """

    def __init__(self, repository: Repository, config: Config) -> None:
        self._repository = repository
        self._config = config
        self._running: dict[str, bool] = {}

    async def save_program(self, program: Program) -> None:
        """Persist a named program to SQLite."""
        # TODO: upsert into repository programs table
        logger.debug("Saving program %s", program.meta.program_id)

    async def load_program(self, program_id: str) -> Program | None:
        """Load a named program from SQLite."""
        # TODO: query repository
        return None

    async def list_programs(self) -> list[ProgramMeta]:
        """Return metadata for all stored programs."""
        # TODO: query repository
        return []

    async def delete_program(self, program_id: str) -> None:
        """Remove a program from SQLite."""
        # TODO: delete from repository
        logger.info("Deleting program %s", program_id)

    def type_check(self, program: Program, machine_id: str) -> list[str]:
        """
        Validate the program AST against the named machine's description.
        Returns a list of error strings (empty means the program is valid).
        Joint references, move targets, and sub-program names are all checked.
        """
        # TODO: walk the AST; resolve joint/sub-program refs against machine model
        return []

    async def run_program(self, program_id: str, machine_id: str) -> None:
        """
        Type-check then interpret the named program.
        Raises TypeCheckError if validation fails so the error surfaces
        before any motion begins.
        """
        program = await self.load_program(program_id)
        if program is None:
            raise ValueError(f"Program {program_id!r} not found")
        errors = self.type_check(program, machine_id)
        if errors:
            raise TypeCheckError(f"Program {program_id!r} failed type-check: {errors}")
        logger.info("Running program %s on machine %s", program_id, machine_id)
        self._running[program_id] = True
        # TODO: walk AST and dispatch each node to the appropriate service

    async def pause_program(self, program_id: str) -> None:
        """Pause an in-progress program execution."""
        logger.info("Pausing program %s", program_id)
        # TODO: signal the running interpreter coroutine to pause

    async def resume_program(self, program_id: str) -> None:
        """Resume a paused program."""
        logger.info("Resuming program %s", program_id)
        # TODO: signal the paused interpreter coroutine to continue

    async def abort_program(self, program_id: str) -> None:
        """Abort a running or paused program."""
        logger.warning("Aborting program %s", program_id)
        self._running.pop(program_id, None)
        # TODO: cancel the interpreter coroutine, trigger motion abort

    def _interpret_node(self, node: ProgramNode, machine_id: str) -> None:
        """Recursively interpret a single AST node. Stub for now."""
        # TODO: dispatch on node.kind to motion/state/lifecycle services
