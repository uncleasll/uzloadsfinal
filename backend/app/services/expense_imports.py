"""
Card and toll exports → expenses, format detected from the header row.

  Comdata  : Seq Num | Date issued | ... | Amount | Fees | Purpose | Unit | ...          (Excel "Comdata" sheet)
  Pilot    : Trans Date | Driver Name | Unit Number | Card Number | Unit Price | Fees | Quantity | Discount | Amount | State | City | Location
  Tolls    : ... | POSTED DATE | ... | TOLL RECORD ID | EQUIP ID | AGENCY | ENTRY PLAZA | ENTRY DATE/TIME | EXIT PLAZA | EXIT DATE/TIME | ... | TOLL
             (EZPass / Bestpass style export used in Fleet Command Center)

Every row becomes one Expense on the truck named by the unit column. Each row carries an origin key in
its description so importing the same file twice adds nothing.
"""
from __future__ import annotations

import hashlib
import re
from datetime import date, datetime
from decimal import Decimal
from sqlalchemy.orm import Session

from app.models.models import Expense, Truck
from app.services.comdata_import import _to_amount, _to_date, category_for, read_rows as _read_rows_comdata
from app.services.driver_pay_service import money


def _norm(h) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(h or "").lower()).strip()


def read_table(filename: str, raw: bytes) -> tuple[list[str], list[list]]:
    """Header (normalized) and rows, from CSV or XLSX."""
    import csv, io
    if filename.lower().endswith((".xlsx", ".xlsm")):
        import openpyxl
        wb = openpyxl.load_workbook(io.BytesIO(raw), read_only=True, data_only=True)
        rows = list(wb.worksheets[0].iter_rows(values_only=True))
    else:
        rows = list(csv.reader(io.StringIO(raw.decode("utf-8-sig", errors="replace"))))
    rows = [r for r in rows if any(v not in (None, "") for v in r)]
    if not rows:
        return [], []
    return [_norm(h) for h in rows[0]], [list(r) for r in rows[1:]]


def detect_format(header: list[str]) -> str | None:
    h = set(header)
    if "seq num" in h and "purpose" in h:
        return "comdata"
    if "trans date" in h and ("unit number" in h or "unit" in h) and "quantity" in h:
        return "pilot"
    if "toll" in h and ("equip id" in h or "equipment id" in h):
        return "tolls"
    return None


def _col(header: list[str], *names: str) -> int | None:
    for n in names:
        if n in header:
            return header.index(n)
    return None


def _unit(v) -> str:
    if isinstance(v, float):
        v = int(v)
    s = str(v or "").strip()
    if re.fullmatch(r"\d+\.0+", s):      # "1002.0" from a spreadsheet export
        s = s.split(".")[0]
    return s.lstrip("0") or "0"


def _dt(v) -> date | None:
    if isinstance(v, datetime):
        return v.date()
    d = _to_date(v)
    if d:
        return d
    s = str(v or "").strip()
    for fmt in ("%m/%d/%Y %H:%M:%S", "%m/%d/%Y %H:%M", "%Y-%m-%d %H:%M:%S", "%m/%d/%y %H:%M"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            pass
    return None


def import_expenses(db: Session, filename: str, raw: bytes) -> dict:
    header, rows = read_table(filename, raw)
    fmt = detect_format(header)
    if fmt == "comdata":
        from app.services.comdata_import import import_comdata
        result = import_comdata(db, filename, raw)
        result["format"] = "comdata"
        return result
    if fmt is None:
        raise ValueError("Unrecognized file. Expected a Comdata, Pilot fuel, or toll export with its header row.")

    trucks = {_unit(t.unit_number): t for t in db.query(Truck).all()}
    marker = "Pilot #" if fmt == "pilot" else "Toll #"
    existing = {m.group(1) for (desc,) in db.query(Expense.description).filter(Expense.description.like(f"{marker}%")).all()
                for m in [re.match(rf"{re.escape(marker)}(\S+)", desc or "")] if m}

    created, skipped, unmatched, errors = 0, 0, set(), []
    if fmt == "pilot":
        c_date, c_unit, c_amt = _col(header, "trans date"), _col(header, "unit number", "unit"), _col(header, "amount")
        c_qty, c_loc, c_city, c_state, c_card, c_drv = _col(header, "quantity"), _col(header, "location"), _col(header, "city"), _col(header, "state"), _col(header, "card number"), _col(header, "driver name")
        for i, r in enumerate(rows, start=2):
            d, amount = _dt(r[c_date]), _to_amount(r[c_amt])
            if not d or amount <= 0:
                errors.append(f"Row {i}: missing date or amount"); continue
            unit = _unit(r[c_unit]) if c_unit is not None else ""
            key = hashlib.sha1(f"{d}|{unit}|{amount}|{r[c_card] if c_card is not None else ''}|{r[c_loc] if c_loc is not None else ''}".encode()).hexdigest()[:12]
            if key in existing:
                skipped += 1; continue
            truck = trucks.get(unit)
            if not truck:
                unmatched.add(unit or "(blank)"); continue
            gallons = _to_amount(r[c_qty]) if c_qty is not None else Decimal("0")
            place = ", ".join(x for x in [str(r[c_city] or "").strip().title() if c_city is not None else "", str(r[c_state] or "").strip().upper() if c_state is not None else ""] if x)
            desc = " · ".join(x for x in [f"{marker}{key}", str(r[c_loc] or "").strip().title() if c_loc is not None else "", place,
                                          f"{gallons:.1f} gal" if gallons else "", str(r[c_drv] or "").strip().title() if c_drv is not None else ""] if x)
            db.add(Expense(expense_date=d, category="Fuel", amount=money(amount), description=desc, truck_id=truck.id, is_active=True))
            existing.add(key); created += 1
    else:
        c_unit, c_amt, c_rec = _col(header, "equip id", "equipment id"), _col(header, "toll"), _col(header, "toll record id")
        c_exit, c_post, c_agency, c_plaza, c_entry = _col(header, "exit date time", "exit date"), _col(header, "posted date"), _col(header, "agency"), _col(header, "exit plaza"), _col(header, "entry plaza")
        for i, r in enumerate(rows, start=2):
            when = r[c_exit] if c_exit is not None else None
            d = _dt(when) or (_dt(r[c_post]) if c_post is not None else None)
            amount = _to_amount(r[c_amt])
            if not d or amount <= 0:
                errors.append(f"Row {i}: missing date or toll amount"); continue
            unit = _unit(r[c_unit])
            key = hashlib.sha1(f"{r[c_rec] if c_rec is not None else ''}|{when}|{unit}|{amount}".encode()).hexdigest()[:12]
            if key in existing:
                skipped += 1; continue
            truck = trucks.get(unit)
            if not truck:
                unmatched.add(unit or "(blank)"); continue
            agency = str(r[c_agency] or "").strip() if c_agency is not None else ""
            plaza = " → ".join(x for x in [str(r[c_entry] or "").strip() if c_entry is not None else "", str(r[c_plaza] or "").strip() if c_plaza is not None else ""] if x)
            desc = " · ".join(x for x in [f"{marker}{key}", agency, plaza] if x)
            db.add(Expense(expense_date=d, category="Tolls", amount=money(amount), description=desc, truck_id=truck.id, is_active=True))
            existing.add(key); created += 1
    db.commit()
    return {"format": fmt, "created": created, "skipped_duplicates": skipped, "unmatched_units": sorted(unmatched), "errors": errors[:20], "rows": len(rows)}
