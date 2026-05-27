from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from brain.interface.rest.deps import get_service
from brain.models.machine import TemplateMeta
from brain.service.service import BrainService
from brain.service.template_service import TemplateParamSchema

router = APIRouter(prefix="/templates", tags=["templates"])

Service = Annotated[BrainService, Depends(get_service)]


@router.get("", response_model=list[TemplateMeta], summary="List available templates")
async def list_templates(svc: Service) -> list[TemplateMeta]:
    """Return summary metadata for all in-tree templates."""
    return await svc.templates.list_templates()


@router.get("/{template_id}", response_model=TemplateParamSchema, summary="Get template schema")
async def get_template(template_id: str, svc: Service) -> TemplateParamSchema:
    """Return full schema (parameters + joints) for a single template."""
    tmpl = await svc.templates.get_template(template_id)
    if tmpl is None:
        raise HTTPException(status_code=404, detail=f"Template {template_id!r} not found")
    return tmpl
