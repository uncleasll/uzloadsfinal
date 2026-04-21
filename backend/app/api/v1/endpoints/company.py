from fastapi import APIRouter, Depends, UploadFile, File
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.models import CompanySettings
import os, shutil

router = APIRouter(prefix="/company", tags=["company"])

UPLOAD_DIR = "uploads/company"
os.makedirs(UPLOAD_DIR, exist_ok=True)


def _get_or_create(db: Session) -> CompanySettings:
    s = db.query(CompanySettings).first()
    if not s:
        s = CompanySettings(name="My Company")
        db.add(s)
        db.commit()
        db.refresh(s)
    return s


def _serialize(s: CompanySettings) -> dict:
    return {
        "id": s.id,
        "name": s.name or "",
        "legal_name": s.legal_name or "",
        "mc_number": s.mc_number or "",
        "dot_number": s.dot_number or "",
        "address": s.address or "",
        "city": s.city or "",
        "state": s.state or "",
        "zip_code": s.zip_code or "",
        "phone": s.phone or "",
        "email": s.email or "",
        "website": s.website or "",
        "logo_path": s.logo_path or "",
    }


@router.get("")
def get_company(db: Session = Depends(get_db)):
    return _serialize(_get_or_create(db))


@router.put("")
def update_company(data: dict, db: Session = Depends(get_db)):
    s = _get_or_create(db)
    allowed = ["name","legal_name","mc_number","dot_number","address","city","state","zip_code","phone","email","website"]
    for k, v in data.items():
        if k in allowed:
            setattr(s, k, v or None)
    db.commit()
    db.refresh(s)
    return _serialize(s)


@router.post("/logo")
def upload_logo(file: UploadFile = File(...), db: Session = Depends(get_db)):
    ext = os.path.splitext(file.filename or "logo.png")[1]
    path = os.path.join(UPLOAD_DIR, f"logo{ext}")
    with open(path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    s = _get_or_create(db)
    s.logo_path = "/" + path
    db.commit()
    return {"logo_path": s.logo_path}
