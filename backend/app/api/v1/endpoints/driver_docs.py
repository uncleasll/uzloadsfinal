from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import Optional
import os, uuid
from app.db.session import get_db
from app.models.models import DriverDocument, DriverDocType, Driver
from app.core.config import settings
from pydantic import BaseModel
from datetime import date

router = APIRouter(prefix="/drivers", tags=["driver-docs"])


class DocCreate(BaseModel):
    doc_type: str
    status: Optional[str] = None
    number: Optional[str] = None           # maps to DB column 'number'
    state: Optional[str] = None
    application_date: Optional[date] = None
    hire_date: Optional[date] = None
    termination_date: Optional[date] = None
    issue_date: Optional[date] = None
    exp_date: Optional[date] = None
    notes: Optional[str] = None
    name: Optional[str] = None


def _doc_dict(d: DriverDocument) -> dict:
    return {
        "id": d.id, "driver_id": d.driver_id,
        "doc_type": d.doc_type.value if hasattr(d.doc_type, "value") else d.doc_type,
        "status": d.status,
        "number": d.number,
        "state": d.state,
        "application_date": str(d.application_date) if d.application_date else None,
        "hire_date": str(d.hire_date) if d.hire_date else None,
        "termination_date": str(d.termination_date) if d.termination_date else None,
        "issue_date": str(d.issue_date) if d.issue_date else None,
        "exp_date": str(d.exp_date) if d.exp_date else None,
        "notes": d.notes,
        "name": d.name,
        "original_filename": d.original_filename,
        "filename": d.filename,
        "file_path": d.file_path,
    }


@router.get("/{driver_id}/documents")
def get_documents(driver_id: int, db: Session = Depends(get_db)):
    docs = db.query(DriverDocument).filter(DriverDocument.driver_id == driver_id).all()
    return [_doc_dict(d) for d in docs]


@router.post("/{driver_id}/documents", status_code=201)
def add_document(driver_id: int, data: DocCreate, db: Session = Depends(get_db)):
    payload = data.model_dump()
    # schema uses 'number', model column is also 'number' — keep as-is
    doc = DriverDocument(driver_id=driver_id, **payload)
    db.add(doc); db.commit(); db.refresh(doc)
    return _doc_dict(doc)


@router.post("/{driver_id}/documents/{doc_id}/upload", status_code=201)
async def upload_doc_file(
    driver_id: int, doc_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    doc = db.query(DriverDocument).filter(DriverDocument.id == doc_id).first()
    if not doc: raise HTTPException(404, "Document not found")
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    ext = os.path.splitext(file.filename)[1]
    unique_name = f"{uuid.uuid4()}{ext}"
    file_path = os.path.join(settings.UPLOAD_DIR, unique_name)
    contents = await file.read()
    with open(file_path, "wb") as f: f.write(contents)
    doc.filename = unique_name
    doc.original_filename = file.filename
    doc.file_path = file_path
    db.commit(); db.refresh(doc)
    return _doc_dict(doc)


@router.put("/{driver_id}/documents/{doc_id}")
def update_document(driver_id: int, doc_id: int, data: DocCreate, db: Session = Depends(get_db)):
    doc = db.query(DriverDocument).filter(DriverDocument.id == doc_id).first()
    if not doc: raise HTTPException(404, "Not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(doc, k, v)
    db.commit(); db.refresh(doc)
    return _doc_dict(doc)


@router.delete("/{driver_id}/documents/{doc_id}")
def delete_document(driver_id: int, doc_id: int, db: Session = Depends(get_db)):
    doc = db.query(DriverDocument).filter(DriverDocument.id == doc_id).first()
    if not doc: raise HTTPException(404, "Not found")
    db.delete(doc); db.commit()
    return {"message": "Deleted"}
