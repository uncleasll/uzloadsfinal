"""
company_service.py
Helper to get company settings from DB.
Used by PDF service so all generated PDFs show the correct company name/info.
"""
from sqlalchemy.orm import Session
from app.models.models import CompanySettings


_DEFAULT = {
    "name": "My Company",
    "legal_name": "",
    "mc_number": "",
    "dot_number": "",
    "address": "",
    "city": "",
    "state": "",
    "zip_code": "",
    "phone": "",
    "email": "",
    "website": "",
    "logo_path": "",
}


def get_company(db: Session) -> dict:
    s = db.query(CompanySettings).first()
    if not s:
        return _DEFAULT.copy()
    return {
        "name": s.name or "My Company",
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
