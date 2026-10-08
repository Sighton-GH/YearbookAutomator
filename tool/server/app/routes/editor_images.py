from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from app.routes.workspace_access import enforce_workspace_write
from app.services.editor_images import cleanup_editor_images

router = APIRouter()


class EditorImageCleanup(BaseModel):
    workspace_id: str
    candidates: list[str] = Field(default_factory=list, max_length=1000)
    # All current people, originals, defaults and edit-history inputs/outputs.
    protected_filenames: list[str] = Field(default_factory=list, max_length=10000)


@router.post("/editor-images-cleanup")
async def cleanup(payload: EditorImageCleanup, request: Request):
    enforce_workspace_write(request, payload.workspace_id)
    return {"deleted": cleanup_editor_images(payload.workspace_id, payload.candidates, payload.protected_filenames)}
