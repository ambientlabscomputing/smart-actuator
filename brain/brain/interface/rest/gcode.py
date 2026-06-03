"""
G-code REST router.

POST /gcode/translate?save=true   — translate a file into a Program (saves by default)
POST /gcode/preview               — translate and return a lightweight path preview
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from brain.interface.rest.deps import get_service
from brain.models.gcode import GCodePreview, GCodeTranslationRequest, GCodeTranslationResult
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
