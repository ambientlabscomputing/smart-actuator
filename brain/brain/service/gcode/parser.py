from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

from result import Err, Ok

from brain.models.gcode import BaseGCodeCommand, GCodeCommand, GCodeProgram, get_command_model
from brain.utils.logger import logger

# ── Preprocessing ─────────────────────────────────────────────────────────────

_PAREN_RE = re.compile(r'\([^)]*\)')


def _preprocess_line(line: str) -> str:
    """Strip parenthetical and semicolon comments, and leading N<int> line numbers."""
    # Remove (parenthetical comments) first
    line = _PAREN_RE.sub('', line)
    # Remove ; inline comments
    idx = line.find(';')
    if idx >= 0:
        line = line[:idx]
    line = line.strip()
    # Strip leading line-number token (N10, N010, …)
    if line:
        parts = line.split()
        if parts and parts[0][0].upper() == 'N' and parts[0][1:].isdigit():
            line = ' '.join(parts[1:])
    return line


# ── Parse result ──────────────────────────────────────────────────────────────


@dataclass
class ParseResult:
    """Return value of parse_gcode — commands with their original 1-based line numbers."""

    program: GCodeProgram
    source_lines: list[int] = field(default_factory=list)
    """1-based source line number for each entry in program.commands (parallel list)."""
    dropped_lines: list[tuple[int, str]] = field(default_factory=list)
    """(1-based line number, error message) for every line that could not be parsed."""


# ── Core parsing ──────────────────────────────────────────────────────────────


def _get_command(line: str) -> tuple[GCodeCommand | None, str | None]:
    if not line:
        return None, "Empty line"
    cmd_str = line.split()[0].upper()
    try:
        return GCodeCommand(cmd_str), None
    except ValueError:
        return None, f"Unknown command: {cmd_str!r}"


def parse_gcode_line(line: str):
    """Parse a single pre-processed G-code line into a typed command model."""
    cmd_enum, err = _get_command(line)
    if err:
        return Err(err)
    assert cmd_enum is not None
    cmd_model_cls = get_command_model(cmd_enum)
    if cmd_model_cls is None:
        return Err(f"No model found for command: {cmd_enum}")
    return cmd_model_cls.parse_from_line(line)


def parse_gcode(content: str) -> ParseResult:
    """
    Parse a G-code string into a ParseResult.

    Each successfully parsed command is appended to program.commands with its
    1-based line number in source_lines.  Lines that fail are collected in
    dropped_lines instead of silently discarded.
    """
    commands: list[BaseGCodeCommand] = []
    source_lines: list[int] = []
    dropped_lines: list[tuple[int, str]] = []

    for line_num, raw in enumerate(content.splitlines(), start=1):
        line = _preprocess_line(raw)
        if not line:
            continue
        match parse_gcode_line(line):
            case Ok(cmd):
                commands.append(cmd)
                source_lines.append(line_num)
            case Err(err):
                dropped_lines.append((line_num, err))
                logger.warning("G-code line {}: {!r} — {}", line_num, raw.strip(), err)

    return ParseResult(
        program=GCodeProgram(commands=commands),
        source_lines=source_lines,
        dropped_lines=dropped_lines,
    )


def parse_gcode_file(file_path: Path) -> ParseResult:
    logger.info("Parsing G-code file: {}", file_path)
    with file_path.open("r") as f:
        content = f.read()
    return parse_gcode(content)
