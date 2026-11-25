from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.api.deps import get_current_user, require_csrf
from app.database import get_db
from app.models.user import UserModel
from app.schemas.project import (
    ProjectListItemSchema,
    ProjectDetailSchema,
    ProjectCreateSchema,
    ProjectUpdateSchema,
    ProjectRenameSchema,
    ProjectProfileChangeSchema,
)
from app.crud import project as project_crud

router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.get("", response_model=list[ProjectListItemSchema])
def list_projects(db: Session = Depends(get_db), current_user: UserModel = Depends(get_current_user)):
    return project_crud.get_projects(db, current_user.id)


@router.get("/{project_id}", response_model=ProjectDetailSchema)
def get_project(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    project = project_crud.get_project(db, project_id, current_user.id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.post("", response_model=ProjectDetailSchema)
def create_project(
    data: ProjectCreateSchema,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
    _: None = Depends(require_csrf),
):
    return project_crud.create_project(db, data, current_user.id)


@router.put("/{project_id}", response_model=ProjectDetailSchema)
def update_project(
    project_id: str,
    data: ProjectUpdateSchema,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
    _: None = Depends(require_csrf),
):
    project = project_crud.update_project(db, project_id, data, current_user.id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.patch("/{project_id}", response_model=ProjectListItemSchema)
def rename_project(
    project_id: str,
    data: ProjectRenameSchema,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
    _: None = Depends(require_csrf),
):
    project = project_crud.rename_project(db, project_id, data.name, current_user.id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.patch("/{project_id}/content-profile", response_model=ProjectDetailSchema)
def change_project_content_profile(
    project_id: str,
    data: ProjectProfileChangeSchema,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
    _: None = Depends(require_csrf),
):
    # Отдельный от PUT/PATCH-автосейва эндпоинт — см. ProjectUpdateSchema:
    # смена профиля требует явного предупреждения на фронте (сколько
    # сущностей/рецептов станет невидимо), не должна проходить тихо через
    # общий save-путь.
    project = project_crud.update_content_profile(db, project_id, data.content_profile, current_user.id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.delete("/{project_id}")
def delete_project(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
    _: None = Depends(require_csrf),
):
    ok = project_crud.delete_project(db, project_id, current_user.id)
    if not ok:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"ok": True}


@router.post("/{project_id}/duplicate", response_model=ProjectDetailSchema)
def duplicate_project(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
    _: None = Depends(require_csrf),
):
    copy = project_crud.duplicate_project(db, project_id, current_user.id)
    if not copy:
        raise HTTPException(status_code=404, detail="Project not found")
    return copy
