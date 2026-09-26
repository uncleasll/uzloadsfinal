"""IFTA quarter worksheet: miles per state (entered), gallons bought per state (from fuel receipts), taxable gallons by fleet MPG."""
from __future__ import annotations
import re
from datetime import date

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.models import Expense, IftaMiles, Load, Truck
from app.services.driver_pay_service import money

STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC']


def quarter_bounds(year: int, quarter: int) -> tuple[date, date]:
    start = date(year, 3 * (quarter - 1) + 1, 1)
    end = date(year + (quarter == 4), 1 if quarter == 4 else 3 * quarter + 1, 1)
    return start, end


def parse_fuel(desc: str | None) -> tuple[str | None, float | None]:
    """Fuel imports write '… City, TX · 123.4 gal …'; older rows have only that text."""
    if not desc:
        return None, None
    st = None
    for m in re.finditer(r",\s*([A-Z]{2})\b", desc):
        if m.group(1) in STATES:
            st = m.group(1)
    g = re.search(r"([\d.]+)\s*gal", desc)
    return st, float(g.group(1)) if g else None


def fuel_by_state(db: Session, start: date, end: date, truck_id: int | None = None) -> dict[str, dict]:
    q = db.query(Expense).filter(Expense.is_active == True, Expense.category == "Fuel", Expense.expense_date >= start, Expense.expense_date < end)  # noqa: E712
    if truck_id:
        q = q.filter(Expense.truck_id == truck_id)
    out: dict[str, dict] = {}
    for e in q.all():
        st, gal = e.state, e.gallons
        if not st or gal is None:
            pst, pgal = parse_fuel(e.description)
            st, gal = st or pst, gal if gal is not None else pgal
        key = st or "??"
        row = out.setdefault(key, {"state": key, "gallons": 0.0, "cost": 0.0, "receipts": 0})
        row["gallons"] += gal or 0.0; row["cost"] += e.amount or 0.0; row["receipts"] += 1
    return out


def worksheet(db: Session, year: int, quarter: int, truck_id: int | None = None) -> dict:
    start, end = quarter_bounds(year, quarter)
    trucks = db.query(Truck).filter(Truck.is_active == True).order_by(Truck.unit_number).all()  # noqa: E712
    if truck_id:
        trucks = [t for t in trucks if t.id == truck_id]
    tids = [t.id for t in trucks]
    miles_rows = db.query(IftaMiles).filter(IftaMiles.year == year, IftaMiles.quarter == quarter, IftaMiles.truck_id.in_(tids)).all() if tids else []
    miles_by_state: dict[str, int] = {}
    miles_by_truck: dict[int, int] = {}
    for r in miles_rows:
        miles_by_state[r.state] = miles_by_state.get(r.state, 0) + r.miles
        miles_by_truck[r.truck_id] = miles_by_truck.get(r.truck_id, 0) + r.miles
    fuel = fuel_by_state(db, start, end, truck_id)
    load_miles = {tid: int(m or 0) for tid, m in db.query(Load.truck_id, func.sum(Load.total_miles))
                  .filter(Load.is_active == True, Load.truck_id.in_(tids), Load.load_date >= start, Load.load_date < end).group_by(Load.truck_id).all()} if tids else {}  # noqa: E712
    total_miles = sum(miles_by_state.values())
    total_gal = sum(f["gallons"] for f in fuel.values())
    mpg = round(total_miles / total_gal, 2) if total_miles and total_gal else None
    states = sorted(set(miles_by_state) | {k for k in fuel if k != "??"})
    rows = []
    for st in states:
        m = miles_by_state.get(st, 0)
        g = fuel.get(st, {}).get("gallons", 0.0)
        taxable = round(m / mpg, 1) if mpg else None
        rows.append({"state": st, "miles": m, "gallons": round(g, 1), "cost": money(fuel.get(st, {}).get("cost", 0.0)),
                     "taxable_gallons": taxable, "net_gallons": round(taxable - g, 1) if taxable is not None else None})
    return {
        "year": year, "quarter": quarter, "from": start.isoformat(), "to": (end - __import__("datetime").timedelta(days=1)).isoformat(),
        "totals": {"miles": total_miles, "gallons": round(total_gal, 1), "cost": money(sum(f["cost"] for f in fuel.values())), "mpg": mpg,
                   "unknown_state_gallons": round(fuel.get("??", {}).get("gallons", 0.0), 1), "unknown_state_receipts": fuel.get("??", {}).get("receipts", 0)},
        "states": rows,
        "trucks": [{"truck_id": t.id, "unit_number": t.unit_number, "ifta_miles": miles_by_truck.get(t.id, 0), "load_miles": load_miles.get(t.id, 0),
                    "states": {r.state: r.miles for r in miles_rows if r.truck_id == t.id}} for t in trucks],
    }


def set_miles(db: Session, truck_id: int, year: int, quarter: int, entries: dict[str, int]) -> None:
    """Replace a truck's per-state miles for the quarter with what was entered."""
    db.query(IftaMiles).filter(IftaMiles.truck_id == truck_id, IftaMiles.year == year, IftaMiles.quarter == quarter).delete(synchronize_session=False)
    for st, m in entries.items():
        st = (st or "").upper()
        if st in STATES and int(m or 0) > 0:
            db.add(IftaMiles(truck_id=truck_id, year=year, quarter=quarter, state=st, miles=int(m)))
    db.commit()
