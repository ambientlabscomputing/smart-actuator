"""
GCodeService — upload → parse → translate → persist pipeline.

Typical call flow:
  1. Client uploads a .gcode file via FileService (POST /files).
  2. Client POSTs a GCodeTranslationRequest (with file_id) to POST /gcode/translate.
  3. GCodeService reads the file bytes, parses them, translates into a Program
     AST, and (optionally) persists it via ProgramService.
  4. Client can then run the program via the standard programs/runs API.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from brain.models.gcode import GCodePreview, GCodeTranslationRequest, GCodeTranslationResult
from brain.service.gcode.parser import parse_gcode
from brain.service.gcode.translator import make_preview, translate
from brain.utils.logger import logger

if TYPE_CHECKING:
    from brain.service.file_service import FileService
    from brain.service.program_service import ProgramService


class GCodeService:
    def __init__(self, file_service: FileService, programs: ProgramService) -> None:
        self._files = file_service
        self._programs = programs

    # ── Core translation ──────────────────────────────────────────────────────

    async def translate_file(self, request: GCodeTranslationRequest) -> GCodeTranslationResult:
        """
        Load the file from disk, parse it, and translate it into a Program AST.

        Raises FileNotFoundError if the file record or file on disk is missing.
        Does NOT persist the result — call translate_and_save for that.
        """
        data = await self._files.read_file(request.file_id)
        if data is None:
            raise FileNotFoundError(
                f"File {request.file_id} not found or missing from disk. "
                "Upload the file first via POST /files."
            )
        content = data.decode("utf-8", errors="replace")
        logger.info(
            "GCodeService: translating file_id={} as program_id={} ({} bytes)",
            request.file_id,
            request.program_id,
            len(data),
        )
        parse_result = parse_gcode(content)
        result = translate(
            parse_result.program.commands,
            request,
            source_lines=parse_result.source_lines,
            parser_dropped=parse_result.dropped_lines,
        )
        logger.info(
            "GCodeService: translation complete — {} poses, {} warnings, {} dropped lines",
            result.pose_count,
            len(result.warnings),
            len(result.dropped_lines),
        )
        return result

    async def translate_and_save(
        self, request: GCodeTranslationRequest, *, created_by: str
    ) -> GCodeTranslationResult:
        """
        Translate and persist the resulting Program via ProgramService.

        Raises FileNotFoundError (missing file) or ValueError (AST validation).
        """
        result = await self.translate_file(request)
        await self._programs.save_program(result.program, created_by=created_by)
        logger.info(
            "GCodeService: saved program {} ({!r})",
            request.program_id,
            request.name,
        )
        return result

    # ── Preview ───────────────────────────────────────────────────────────────

    async def preview(self, request: GCodeTranslationRequest) -> GCodePreview:
        """
        Translate and return a lightweight path preview (no persistence).

        Caps at 2 000 poses and sets GCodePreview.truncated when the full
        program would exceed that limit.
        """
        result = await self.translate_file(request)
        return make_preview(result)
