"""
G-code REST router.

POST /gcode/translate?save=true   — translate a file into a Program (saves by default)
POST /gcode/preview               — translate and return a lightweight path preview
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from brain.interface.rest.deps import get_service
from brain.models.gcode import GCodePreview, GCodeTranslationRequest, GCodeTranslationResult, GantrySampleRequest
from brain.service.service import BrainService

router = APIRouter(tags=["gcode"])

Service = Annotated[BrainService, Depends(get_service)]


@router.post(
    "/gcode/translate",
    response_model=GCodeTranslationResult,
    status_code=201,
    summary="Translate a G-code file into a Program",
)
async def translate_gcode(
    body: GCodeTranslationRequest,
    svc: Service,
    request: Request,
    save: bool = Query(default=True, description="Persist the resulting Program. Set to false for a dry-run."),
) -> GCodeTranslationResult:
    """
    Parse and translate the G-code file identified by *file_id* into a Program
    AST of MOVE_SE3 nodes.

    - **save=true** (default): persists the Program so it can be run via
      `POST /programs/{program_id}/runs`.
    - **save=false**: returns the translation result without storing it.

    Possible error codes:
    - **404** — file_id not found or missing from disk.
    - **409** — AST validation failed (malformed program).
    - **422** — request body validation failed.
    """
    try:
        if save:
            return await svc.gcode.translate_and_save(
                body, created_by=request.state.user.username
            )
        return await svc.gcode.translate_file(body)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post(
    "/gcode/preview",
    response_model=GCodePreview,
    summary="Preview the translated path without saving",
)
async def preview_gcode(
    body: GCodeTranslationRequest,
    svc: Service,
) -> GCodePreview:
    """
    Translate the G-code file and return a lightweight path preview.

    No Program is persisted.  Poses are capped at 2 000; *truncated* will be
    true when the full translation would exceed that limit.

    Useful for showing the tool path in the UI before committing to a save.
    """
    try:
        return await svc.gcode.preview(body)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


# ── Sample generation ─────────────────────────────────────────────────────────

@router.get(
    "/gcode/samples",
    response_model=list[str],
    summary="List built-in G-code sample names",
)
async def list_gcode_samples(svc: Service) -> list[str]:
    """Return the sorted list of built-in sample names accepted by POST /gcode/samples."""
    return svc.gcode.list_samples()


@router.post(
    "/gcode/samples",
    response_model=GCodeTranslationResult,
    status_code=201,
    summary="Generate a built-in G-code sample and save it as a Program",
)
async def generate_gcode_sample(
    body: GantrySampleRequest,
    svc: Service,
    request: Request,
) -> GCodeTranslationResult:
    """
    Generate a named built-in G-code sample with configurable origin and
    dimensions, translate it in memory, persist the resulting Program, and
    return the translation result.

    - **origin_mm** — ``[cx, cy, work_z]``: pattern centre and working Z in mm.
      For a gantry where X and Y run 0 → *width_mm*, set
      ``cx = width_mm / 2`` and ``cy = height_mm / 2`` so the entire pattern
      stays in the positive quadrant.
    - **width_mm / height_mm** — overall bounding box of the pattern.

    No file upload is required — G-code is generated server-side.
    """
    try:
        return await svc.gcode.generate_and_save_sample(
            body, created_by=request.state.user.username
        )
    except KeyError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
