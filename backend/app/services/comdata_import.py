"""
Comdata card export → expenses.

The Excel "Comdata" sheet has these columns (CSV or XLSX export from Comdata):
  Seq Num | Date issued | Date Cashed | Code | Location City | State | Amount | Fees | Purpose | Unit | Control Num | Receiver | Charged

Each row becomes one Expense on the truck named by Unit. Amount includes the card fee, because the fee
is charged to the truck on the statement. Rows are keyed by Seq Num so re-importing the same file is safe.
"""
from __future__ import annotations

import csv
import io
import re
from datetime import date, datetime
from decimal import Decimal
from sqlalchemy.orm import Session

from app.models.models import Expense, Truck
from app.services.driver_pay_service import money

MARKER = "Comdata #"

CATEGORY_MAP = [
    (("FUEL", "DIESEL", "DEF"), "Fuel"),
    (("LUMPER",), "Lumper"),
    (("TIRE", "RIM"), "Tires"),
    (("TOW",), "Towing"),
    (("WASH",), "Truck Wash"),
    (("SERVICE", "REPAIR", "SHOP", "FIX", "OIL", "COOLANT", "ANTIFREEZ", "GLASS", "MIRROR", "CHAIN", "STRAP", "MUD"), "Repairs"),
    (("SCALE",), "Scale"),
    (("TOLL",), "Tolls"),
    (("PARKING",), "Parking"),
    (("HOTEL",), "Travel"),
    (("PERMIT",), "Permits"),
    (("CASH", "ADV", "FOR DRIVER"), "Driver Advance"),
    (("LATE", "MISS", "RESCHEDULE", "RESTOCK", "RESTACK", "CROSS DOCK"), "Broker Fees"),
]


def category_for(purpose: str) -> str:
    p = (purpose or "").strip().upper()
    for keys, cat in CATEGORY_MAP:
        if any(k in p for k in keys):
            return cat
    return "Other"


HEADER_ALIASES = {
    "seq num": "seq", "seq": "seq", "sequence": "seq",
    "date issued": "date", "issued": "date", "date": "date",
    "location city": "city", "city": "city",
    "state": "state",
    "amount": "amount",
    "fees": "fees", "fee": "fees",
    "purpose": "purpose",
    "unit": "unit", "unit number": "unit", "truck": "unit",
    "control num": "control", "control number": "control",
    "receiver": "receiver", "driver": "receiver",
}


def _norm_header(h) -> str:
    return HEADER_ALIASES.get(re.sub(r"\s+", " ", str(h or "")).strip().lower(), "")


def _to_date(v) -> date | None:
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    s = str(v or "").strip()
    for fmt in ("%m/%d/%Y", "%m/%d/%y", "%Y-%m-%d", "%m-%d-%Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def _to_amount(v) -> Decimal:
    if v is None or v == "":
        return Decimal("0")
    if isinstance(v, (int, float)):
        return Decimal(str(v))
    s = re.sub(r"[^\d.\-]", "", str(v).replace(",", "."))
    try:
        return Decimal(s) if s else Decimal("0")
    except Exception:
        return Decimal("0")


def read_rows(filename: str, raw: bytes) -> list[dict]:
    """Return a list of dicts keyed by normalized header, from CSV or XLSX."""
    if filename.lower().endswith((".xlsx", ".xlsm")):
        import openpyxl
        wb = openpyxl.load_workbook(io.BytesIO(raw), read_only=True, data_only=True)
        ws = wb.worksheets[0]
        rows = list(ws.iter_rows(values_only=True))
    else:
        text = raw.decode("utf-8-sig", errors="replace")
        rows = list(csv.reader(io.StringIO(text)))
    if not rows:
        return []
    header = [_norm_header(h) for h in rows[0]]
    out = []
    for r in rows[1:]:
        if not any(v not in (None, "") for v in r):
            continue
        out.append({header[i]: r[i] for i in range(min(len(header), len(r))) if header[i]})
    return out


def import_comdata(db: Session, filename: str, raw: bytes) -> dict:
    rows = read_rows(filename, raw)
    if not rows or "amount" not in rows[0] and not any("amount" in r for r in rows):
        raise ValueError("Could not find the Comdata columns (Seq Num, Date issued, Amount, Purpose, Unit).")

    trucks = {t.unit_number.strip().lstrip("0") or "0": t for t in db.query(Truck).all()}
    existing = {
        m.group(1) for (desc,) in db.query(Expense.description).filter(Expense.description.like(f"{MARKER}%")).all()
        for m in [re.match(rf"{re.escape(MARKER)}(\S+)", desc or "")] if m
    }

    created, skipped, unmatched, errors = 0, 0, [], []
    for i, r in enumerate(rows, start=2):
        seq = str(r.get("seq") or "").strip().rstrip(".0") if not isinstance(r.get("seq"), (int, float)) else str(int(r["seq"]))
        d = _to_date(r.get("date"))
        amount = _to_amount(r.get("amount")) + _to_amount(r.get("fees"))
        unit = str(r.get("unit") or "").strip()
        if isinstance(r.get("unit"), float):
            unit = str(int(r["unit"]))
        if not d or amount <= 0:
            errors.append(f"Row {i}: missing date or amount")
            continue
        if not seq:
            seq = f"{d.isoformat()}-{unit}-{amount}"
        if seq in existing:
            skipped += 1
            continue
        truck = trucks.get(unit.lstrip("0") or "0")
        if not truck:
            unmatched.append(unit or "(blank)")
            continue
        purpose = str(r.get("purpose") or "").strip()
        place = ", ".join(x for x in [str(r.get("city") or "").strip().title(), str(r.get("state") or "").strip().upper()] if x)
        receiver = str(r.get("receiver") or "").strip().title()
        fee = _to_amount(r.get("fees"))
        desc = " · ".join(x for x in [f"{MARKER}{seq}", purpose.title(), place, receiver, f"fee {money(fee):.2f}" if fee else ""] if x)
        db.add(Expense(expense_date=d, category=category_for(purpose), amount=money(amount), description=desc, truck_id=truck.id, is_active=True))
        existing.add(seq)
        created += 1
    db.commit()
    return {"created": created, "skipped_duplicates": skipped, "unmatched_units": sorted(set(unmatched)), "errors": errors[:20], "rows": len(rows)}
