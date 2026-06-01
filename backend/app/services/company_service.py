"""
company_service.py
Helper to get company settings from DB.
Used by PDF service so all generated PDFs show the correct company name/info.
"""
from sqlalchemy.orm import Session
from app.models.models import CompanySettings
import os


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


def resolve_logo_file(logo_path: str) -> str:
    if not logo_path:
        return ""
    path = logo_path.lstrip("/")
    if os.path.exists(path):
        return path
    alt = os.path.join(os.getcwd(), path)
    if os.path.exists(alt):
        return alt
    return ""


def company_address(company: dict) -> str:
    return ", ".join(filter(None, [
        company.get("address") or "",
        company.get("city") or "",
        company.get("state") or "",
        company.get("zip_code") or "",
    ]))


def company_identity_lines(company: dict) -> list[str]:
    lines = []
    name = company.get("legal_name") or company.get("name") or "My Company"
    lines.append(name)
    address = company_address(company)
    if address:
        lines.append(address)
    if company.get("mc_number"):
        lines.append(f"MC: {company['mc_number']}")
    if company.get("dot_number"):
        lines.append(f"DOT: {company['dot_number']}")
    if company.get("phone"):
        lines.append(f"Phone: {company['phone']}")
    if company.get("email"):
        lines.append(f"Email: {company['email']}")
    if company.get("website"):
        lines.append(company["website"])
    return lines
