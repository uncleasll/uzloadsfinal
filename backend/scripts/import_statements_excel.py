"""
Import the STATEMENTS Excel workbook into Karvan weekly statements.

    python scripts/import_statements_excel.py "/path/STATEMENTS 2025.xlsx"            # dry run, prints what it would do
    python scripts/import_statements_excel.py "/path/STATEMENTS 2025.xlsx" --apply    # writes to DATABASE_URL
    python scripts/import_statements_excel.py "…xlsx" --apply --sheets 328,780,301     # only some trucks

What it reads from every truck sheet (one weekly block at a time, newest first):
  - load rows          → loads (broker load # kept in po_number), broker / dispatcher / driver by name
  - fee fraction       → truck.fee_pct (from the newest block)
  - fixed deductions   → truck deduction template (CARGO INS, ELD, SAFETY, PHYSICAL DAMAGE, TRAILER, TRUCK PAYMENT, PARKING, IFTA)
  - DIESEL             → Fuel expense in that week
  - other amounts      → expenses in that week (scale, wash, toll, invoice…)
  - DRIVER 30% / PER MILE .55 / none → driver pay rule; odometer start/end when present
  - a carry-in row     → truck.carry_negative = True
  - ACH "Amount:"      → statement marked paid with that payout
The Excel RATE (net) is stored in the statement notes so it can be compared with the generated net.
Re-running is safe: loads are matched by truck + broker load # + pickup date, expenses by their Excel origin.
"""
from __future__ import annotations

import argparse
import os
import re
import sys
from collections import defaultdict
from datetime import date, datetime, timedelta

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import openpyxl  # noqa: E402

from app.db.session import SessionLocal, engine  # noqa: E402
from app.models.models import (  # noqa: E402
    Base, BillingStatus, Broker, Dispatcher, Driver, DriverDeduction, Expense, Load, LoadStatus, LoadStop, StopType,
    StatementStatus, Truck, TruckDeduction,
)
from app.services import weekly_statement as ws  # noqa: E402

SKIP_SHEETS = {"ALL LOAD ", "Driver Expenses 2025", "Office", "Comdata "}
TEMPLATE_LABELS = ["CARGO", "ELD", "SAFETY", "PHYSICAL", "TRAILER", "TRUCK PAYMENT", "PARKING", "IFTA"]
PERIOD_RE = re.compile(r"^\s*(\d{1,2})/(\d{1,2})\s*-\s*(\d{1,2})/(\d{1,2})")
ORIGIN = "Excel"


def num(v) -> float | None:
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str):
        s = re.sub(r"[^\d.\-]", "", v.replace(",", "."))
        try:
            return float(s) if s not in ("", "-", ".") else None
        except ValueError:
            return None
    return None


def odo(v) -> int | None:
    digits = re.sub(r"\D", "", str(v or ""))
    return int(digits) if digits else None


def text(v) -> str:
    return str(v).strip() if v is not None else ""


def to_date(v) -> date | None:
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    s = text(v)
    for fmt in ("%m/%d/%Y", "%m/%d/%y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            pass
    return None


def category_for(label: str) -> str:
    u = label.upper()
    for key, cat in [("SCALE", "Scale"), ("WASH", "Truck Wash"), ("TOLL", "Tolls"), ("INVOICE", "Repairs"), ("PJF", "Supplies"),
                     ("BEST PASS", "Tolls"), ("EMISSION", "Permits"), ("MILEAGE", "Permits"), ("OCCUPATIONAL", "Driver"), ("EXPENC", "Other"), ("EXPENS", "Other")]:
        if key in u:
            return cat
    return "Other"


# ── Parse one sheet into blocks ───────────────────────────────────────────────

def parse_sheet(ws_):
    rows = list(ws_.iter_rows(min_col=1, max_col=14, values_only=True))
    blocks, i = [], 0
    while i < len(rows):
        if rows[i][0] != "TRUCK":
            i += 1
            continue
        b = {"loads": [], "deductions": [], "fee_pct": None, "diesel": [], "pay": None, "odometer": (None, None),
             "carry_in": False, "rate": None, "ach": None, "period": None, "gross": None, "driver_deductions": [], "driver_pay_excel": None}
        j = i + 1
        # load rows until GROSS
        while j < len(rows) and rows[j][2] != "GROSS":
            r = rows[j]
            if isinstance(r[0], str) and PERIOD_RE.match(r[0]):
                b["period"] = r[0].strip()
            rate = num(r[11])
            if rate is not None and rate != 0 and (r[4] or r[5]):
                b["loads"].append({"driver": text(r[2]), "dispatcher": text(r[3]), "broker": text(r[4]), "load_no": text(r[5]),
                                   "pu": to_date(r[6]), "dl": to_date(r[7]), "frm": text(r[8]), "to": text(r[9]), "rate": rate, "pod": r[12] is True})
            j += 1
        if j >= len(rows):
            break
        b["gross"] = num(rows[j][3])
        # deduction rows until RATE (max 45 rows)
        k = j + 1
        while k < len(rows) and rows[k][2] != "RATE" and k < j + 45:
            r = rows[k]
            c, d = r[2], num(r[3])
            if isinstance(r[0], str) and PERIOD_RE.match(r[0]):
                b["period"] = r[0].strip()
            if isinstance(c, float) and 0 < c < 1:
                b["fee_pct"] = round(c * 100, 2)
            elif isinstance(c, str):
                cu = c.strip().upper()
                if PERIOD_RE.match(c):
                    b["carry_in"] = True
                    if d:
                        b["deductions"].append(("carry", f"Balance from {c.strip()}", d))
                elif "DRIVER" in cu:
                    if d is not None and ("%" in cu or "PER MILE" in cu or cu.strip() == "DRIVER"):
                        b["driver_pay_excel"] = d   # the amount Excel actually charged for driver pay
                elif cu == "DIESEL":
                    if d:
                        b["diesel"].append(d)
                elif any(t in cu for t in TEMPLATE_LABELS) and d is not None:
                    b["deductions"].append(("template", c.strip(), d))
                elif d is not None and d != 0 and cu not in ("GROSS", ""):
                    b["deductions"].append(("expense" if d > 0 else "credit", c.strip(), d))
            # right-hand column: driver pay label, odometer, occupational health, ACH
            jl, kl, ll = text(r[9]), text(r[10]), r[11]
            ju = jl.upper()
            if "PER MILE" in ju:
                m = re.search(r"(\d*\.\d+|\d+)", ju.split("MILE", 1)[1])
                b["pay"] = ("per_mile", float(m.group(1)) if m else 0.55)
                if num(ll) and b["driver_pay_excel"] is None:
                    b["driver_pay_excel"] = num(ll)
            elif ju.startswith("DRIVER") and "%" in ju:
                m = re.search(r"(\d+(?:\.\d+)?)\s*%", ju)
                b["pay"] = ("percent", float(m.group(1)) if m else 30.0)
            if ju.startswith("START"):
                b["odometer"] = (odo(jl.split("-", 1)[-1]), odo(kl.split("-", 1)[-1]))
            if "OCCUPATIONAL" in ju and num(ll):
                b["driver_deductions"].append(("Occupational health", abs(num(ll))))
            if ju == "AMOUNT:" and num(ll):
                b["ach"] = num(ll)
            k += 1
        # left column pay labels too (DRIVER 30% in column C)
        for r in rows[j:k]:
            cu = text(r[2]).upper()
            if cu.startswith("DRIVER") and "%" in cu and not b["pay"]:
                m = re.search(r"(\d+(?:\.\d+)?)\s*%", cu)
                b["pay"] = ("percent", float(m.group(1)) if m else 30.0)
        if k < len(rows) and rows[k][2] == "RATE":
            b["rate"] = num(rows[k][3])
        # ACH may sit below RATE
        for r in rows[k:k + 8]:
            if text(r[9]).upper() == "AMOUNT:" and num(r[11]):
                b["ach"] = num(r[11])
        blocks.append(b)
        i = k + 1
    return blocks


def assign_weeks(blocks):
    """Blocks are newest first. Turn 'MM/DD-MM/DD' labels into Saturday dates, walking backwards in time."""
    upper = date(2026, 12, 31)
    for b in blocks:
        start = None
        pu_dates = [l["pu"] for l in b["loads"] if l["pu"]]
        if b["period"]:
            m = PERIOD_RE.match(b["period"])
            mm, dd = int(m.group(1)), int(m.group(2))
            candidates = []
            for y in (2027, 2026, 2025, 2024):
                try:
                    c = date(y, mm, dd)
                except ValueError:
                    continue
                if c.weekday() == 5 and c <= upper:
                    candidates.append(c)
            if pu_dates:
                candidates = [c for c in candidates if abs((c - min(pu_dates)).days) < 20] or candidates
            start = max(candidates) if candidates else None
        if not start and pu_dates:
            start = ws.week_start(min(pu_dates))
        b["start"] = start
        if start:
            upper = start - timedelta(days=1)
    return [b for b in blocks if b["start"]]


# ── Write ─────────────────────────────────────────────────────────────────────

class Importer:
    def __init__(self, db, apply: bool):
        self.db, self.apply = db, apply
        self.stats = defaultdict(int)
        self.compare = []
        self.next_load_number = 100001  # set once the company scope is active (see main)

    def get_or_create(self, model, **by):
        obj = self.db.query(model).filter_by(**by).first()
        if not obj:
            obj = model(**by, is_active=True)
            self.db.add(obj)
            self.db.flush()
            self.stats[f"new {model.__tablename__}"] += 1
        return obj

    def truck(self, unit: str) -> Truck:
        return self.get_or_create(Truck, unit_number=unit)

    def person(self, model, name: str):
        name = re.sub(r"\s+", " ", name).strip()
        return self.get_or_create(model, name=name) if name and name.upper() not in ("NO LOADS", "-") else None

    def run_sheet(self, unit: str, blocks):
        blocks = assign_weeks(blocks)
        if not blocks:
            return
        truck = self.truck(unit)
        newest = next((b for b in blocks if b["loads"]), blocks[0])
        truck.carry_negative = any(b["carry_in"] for b in blocks)
        for b in reversed(blocks):  # oldest first
            start, end = b["start"], ws.week_end(b["start"])
            if ws.get_statement(self.db, truck.id, start):
                self.stats["statements skipped"] += 1
                continue
            driver = None
            for l in b["loads"]:
                broker = self.person(Broker, l["broker"]) if l["broker"] else None
                dispatcher = self.person(Dispatcher, l["dispatcher"].title()) if l["dispatcher"] else None
                driver = self.person(Driver, l["driver"]) or driver
                pu = l["pu"] or start
                exists = self.db.query(Load).filter(Load.truck_id == truck.id, Load.po_number == (l["load_no"] or None), Load.load_date == pu).first()
                if exists:
                    exists.statement_week = start
                    self.stats["loads skipped"] += 1
                    continue
                n = self.next_load_number
                self.next_load_number += 1
                frm, to = [p.strip() for p in (l["frm"].rsplit(",", 1) + [""])[:2]], [p.strip() for p in (l["to"].rsplit(",", 1) + [""])[:2]]
                load = Load(load_number=n, truck_id=truck.id, driver_id=driver.id if driver else None, broker_id=broker.id if broker else None,
                            dispatcher_id=dispatcher.id if dispatcher else None, load_date=pu, actual_delivery_date=l["dl"], rate=l["rate"],
                            po_number=l["load_no"] or None, status=LoadStatus.DELIVERED, billing_status=BillingStatus.PENDING, is_active=True,
                            statement_week=start)
                load.stops.append(LoadStop(stop_type=StopType.PICKUP, stop_order=1, city=frm[0] or None, state=frm[1] or None, stop_date=pu))
                load.stops.append(LoadStop(stop_type=StopType.DELIVERY, stop_order=2, city=to[0] or None, state=to[1] or None, stop_date=l["dl"]))
                self.db.add(load)
                self.stats["loads"] += 1
            if not driver and truck.driver_id:
                driver = self.db.get(Driver, truck.driver_id)
            if driver:
                truck.driver_id = driver.id
                if b["pay"]:
                    driver.pay_type, value = b["pay"]
                    if driver.pay_type == "percent":
                        driver.pay_pct = value
                    else:
                        driver.per_mile_rate = value
                elif b["loads"]:
                    driver.pay_type = "none"
                for label, amount in b["driver_deductions"]:
                    if not any(d.label == label for d in driver.weekly_deductions):
                        self.db.add(DriverDeduction(driver_id=driver.id, label=label, amount=amount))
            # this block's own fee and rows: fee on the truck for generation, every Excel row as a line on the statement
            truck.fee_pct = b["fee_pct"] or 0.0
            for amount in b["diesel"]:
                self.expense(truck, end, "Fuel", amount, f"{ORIGIN} {unit} {ws.period_label(start)} DIESEL")
            for kind, label, amount in b["deductions"]:
                if kind == "expense":
                    self.expense(truck, end, category_for(label), amount, f"{ORIGIN} {unit} {ws.period_label(start)} {label}")
            self.db.flush()
            stmt = ws.generate(self.db, truck.id, start)
            stmt = ws.set_carry(self.db, stmt, False)   # the Excel carry row below is the source of truth
            for kind, label, amount in b["deductions"]:
                if kind in ("template", "carry", "credit"):
                    stmt = ws.add_manual_line(self.db, stmt, label, amount)   # credits are negative lines
            odo_s, odo_e = b["odometer"]
            if odo_s and odo_e and odo_e > odo_s:
                stmt = ws.set_odometer(self.db, stmt, int(odo_s), int(odo_e))
            if b["driver_pay_excel"] is not None and abs(b["driver_pay_excel"] - stmt.driver_pay) > 0.01:
                stmt = ws.add_manual_line(self.db, stmt, "Driver pay as paid in Excel (difference)", round(b["driver_pay_excel"] - stmt.driver_pay, 2))
                self.stats["driver pay adjustments"] += 1
            stmt.notes = f"Imported from Excel sheet {unit}, block {b['period'] or ''}. Excel net: {b['rate']}" + (f", ACH {b['ach']}" if b["ach"] else "")
            stmt = ws.set_status(self.db, stmt, StatementStatus.PAID.value, ach_reference=f"Excel ACH {b['ach']:.2f}" if b["ach"] else "Excel import")
            self.stats["statements"] += 1
            if b["rate"] is not None:
                self.compare.append((unit, ws.period_label(start), b["rate"], stmt.net))
        # rules for the weeks that come after the import: newest block's fee and template, active from the next week
        truck.fee_pct = newest["fee_pct"] or 0.0
        if not truck.deductions:
            from_day = blocks[0]["start"] + timedelta(days=7)
            for i, (kind, label, amount) in enumerate(newest["deductions"]):
                if kind == "template":
                    self.db.add(TruckDeduction(truck_id=truck.id, label=label, amount=amount, sort_order=i, effective_from=from_day))
        self.db.flush()

    def expense(self, truck, day, category, amount, origin):
        if self.db.query(Expense).filter(Expense.truck_id == truck.id, Expense.description == origin).first():
            return
        self.db.add(Expense(expense_date=day, category=category, amount=abs(amount), description=origin, truck_id=truck.id, is_active=True))
        self.stats["expenses"] += 1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("workbook")
    ap.add_argument("--apply", action="store_true", help="write to the database (default is a dry run)")
    ap.add_argument("--sheets", help="comma-separated truck sheet names to import")
    ap.add_argument("--company", type=int, default=1, help="company id the trucks belong to (default 1)")
    args = ap.parse_args()

    wb = openpyxl.load_workbook(args.workbook, read_only=True, data_only=True)
    wanted = set(s.strip() for s in args.sheets.split(",")) if args.sheets else None
    Base.metadata.create_all(engine)
    from app.core.tenant import company_scope
    import app.core.tenant  # noqa: F401
    db = SessionLocal()
    imp = Importer(db, args.apply)
    scope = company_scope(args.company)
    scope.__enter__()
    imp.next_load_number = (db.query(Load.load_number).order_by(Load.load_number.desc()).first() or (100000,))[0] + 1
    try:
        for sheet in wb.worksheets:
            if sheet.title in SKIP_SHEETS or sheet.title.startswith("Dues") or (wanted and sheet.title not in wanted):
                continue
            blocks = parse_sheet(sheet)
            if not blocks:
                continue
            imp.run_sheet(sheet.title.strip(), blocks)
            print(f"sheet {sheet.title!r}: {len(blocks)} blocks", file=sys.stderr)
        if args.apply:
            db.commit()
            print("COMMITTED")
        else:
            db.rollback()
            print("DRY RUN, nothing written")
    finally:
        db.close()
        scope.__exit__(None, None, None)
    for k, v in sorted(imp.stats.items()):
        print(f"  {k}: {v}")
    diffs = [(u, p, ex, ours) for u, p, ex, ours in imp.compare if abs((ex or 0) - ours) > 0.01]
    print(f"  statements compared with Excel net: {len(imp.compare)}, exact matches: {len(imp.compare) - len(diffs)}")
    for u, p, ex, ours in diffs[:25]:
        print(f"    {u} {p}: Excel {ex:,.2f}  Karvan {ours:,.2f}  diff {ours - (ex or 0):,.2f}")


if __name__ == "__main__":
    main()
