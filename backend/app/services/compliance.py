"""Papers that expire: CDL, medical card, registration, insurance, inspections. Warn before, shout after."""
from __future__ import annotations
from datetime import date

from sqlalchemy.orm import Session, joinedload

from app.models.models import DriverDocument, TrailerDocument, TruckDocument

LABELS = {"cdl": "CDL", "medical_card": "Medical card", "drug_test": "Drug test", "mvr": "MVR", "application": "Application",
          "ssn_card": "SSN card", "employment_verification": "Employment verification", "other": "Document"}


def expiring(db: Session, within_days: int = 30, today: date | None = None) -> list[dict]:
    today = today or date.today()
    out: list[dict] = []

    def add(kind: str, owner_id: int, owner: str, doc: str, exp: date | None, link: str):
        if not exp:
            return
        left = (exp - today).days
        if left > within_days:
            return
        out.append({"kind": kind, "owner_id": owner_id, "owner": owner, "document": doc, "exp_date": exp.isoformat(), "days_left": left,
                    "status": "expired" if left < 0 else "soon", "link": link})

    for d in db.query(DriverDocument).options(joinedload(DriverDocument.driver)).all():
        if d.driver and d.driver.is_active:
            add("driver", d.driver_id, d.driver.name, LABELS.get(getattr(d.doc_type, "value", d.doc_type), str(d.doc_type)), d.exp_date, "/drivers")
    for t in db.query(TruckDocument).options(joinedload(TruckDocument.truck)).all():
        if t.truck and t.truck.is_active:
            add("truck", t.truck_id, f"Truck {t.truck.unit_number}", (t.doc_type or "Document").replace("_", " ").title(), t.exp_date, "/trucks")
    for t in db.query(TrailerDocument).options(joinedload(TrailerDocument.trailer)).all():
        if t.trailer and t.trailer.is_active:
            add("trailer", t.trailer_id, f"Trailer {t.trailer.unit_number}", (t.doc_type or "Document").replace("_", " ").title(), t.exp_date, "/trailers")
    out.sort(key=lambda x: x["days_left"])
    return out


def summary(db: Session, within_days: int = 30) -> dict:
    items = expiring(db, within_days)
    return {"expired": sum(1 for i in items if i["status"] == "expired"), "soon": sum(1 for i in items if i["status"] == "soon"), "items": items[:6]}
