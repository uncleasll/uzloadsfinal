"""
Import an Eastern Green style GROSS BOARD workbook into a company's loads.

    python scripts/import_gross_board_excel.py "…GROSS BOARD.xlsx" --company 2 [--vehicles "…Fleet Command Center.xlsx"] [--apply]

GROSS ENTRY columns: MONTH | WEEK | DATE | COMPANY | DRIVER | BROKER | LOAD ID | SHIPPER | RECEIVER | RATE | DHD MI | LOADED MI | TOTAL MI | RPM | NOTE

  - each row → a load filed in the week of DATE (the company's week start applies), broker load id in po_number
  - DRIVER → driver by name; "A || B" team rows go to the first name, the second is kept in the load notes
  - the truck comes from the VEHICLES sheet of a Fleet Command Center workbook (unit ↔ driver); without it,
    a truck named after the driver is created so the weekly board still works
  - DHD MI / LOADED MI / TOTAL MI → empty_miles / loaded_miles / total_miles
Re-running is safe: rows are matched by company + broker load id + date.
"""
from __future__ import annotations

import argparse
import os
import re
import sys
from collections import defaultdict
from datetime import date, datetime

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import openpyxl  # noqa: E402

import app.core.tenant  # noqa: F401,E402
from app.core.tenant import company_scope  # noqa: E402
from app.db.session import SessionLocal, engine  # noqa: E402
from app.models.models import Base, BillingStatus, Broker, Company, Driver, Load, LoadStatus, LoadStop, StopType, Truck  # noqa: E402
from app.services import weekly_statement as ws  # noqa: E402


def norm_name(n: str) -> str:
    return re.sub(r"\s+", " ", str(n or "")).strip().title()


def same_person(a: str, b: str) -> bool:
    """'Mirzakulov Zarif' = 'Zarif Mirzakulov'; 'Nurmuhammad Amriddinov' ≈ 'Nurmukhammad Amiriddinov'; 'Kamoliddin' ⊂ 'Kamoliddin Sultonov'."""
    from difflib import SequenceMatcher
    ta, tb = a.lower().split(), b.lower().split()
    if not ta or not tb:
        return False
    if set(ta) == set(tb):
        return True
    if len(ta) == 1 or len(tb) == 1:
        return (ta[0] in tb) or (tb[0] in ta)
    return SequenceMatcher(None, " ".join(sorted(ta)), " ".join(sorted(tb))).ratio() >= 0.8


def load_vehicles(path: str | None) -> dict[str, str]:
    if not path:
        return {}
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    out = {}
    for r in list(wb["VEHICLES"].iter_rows(values_only=True))[1:]:
        if r[0] and r[1]:
            out[norm_name(r[1])] = str(int(r[0])) if isinstance(r[0], float) else str(r[0]).strip()
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("workbook")
    ap.add_argument("--company", type=int, required=True)
    ap.add_argument("--vehicles", help="Fleet Command Center workbook with a VEHICLES sheet (unit ↔ driver)")
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    Base.metadata.create_all(engine)
    vehicles = load_vehicles(args.vehicles)
    wb = openpyxl.load_workbook(args.workbook, read_only=True, data_only=True)
    sheet = wb["GROSS ENTRY"] if "GROSS ENTRY" in wb.sheetnames else wb.worksheets[0]
    rows = [r for r in sheet.iter_rows(values_only=True) if isinstance(r[9], (int, float)) and r[2]]

    db = SessionLocal()
    stats = defaultdict(int)
    with company_scope(args.company):
        company = db.get(Company, args.company)
        if not company:
            raise SystemExit(f"Company {args.company} does not exist. Register it first.")
        start_day = company.week_start_day if company.week_start_day is not None else 5
        drivers = {d.name: d for d in db.query(Driver).all()}
        trucks = {t.unit_number: t for t in db.query(Truck).all()}
        brokers = {b.name.upper(): b for b in db.query(Broker).all()}
        next_no = (db.query(Load.load_number).order_by(Load.load_number.desc()).first() or (100000,))[0] + 1

        def driver_for(name: str) -> Driver:
            for known, d in drivers.items():
                if same_person(known, name):
                    return d
            d = Driver(name=name, is_active=True, pay_type="none")
            db.add(d); db.flush(); drivers[name] = d; stats["new drivers"] += 1
            return d

        def truck_for(driver: Driver) -> Truck:
            unit = next((u for n, u in vehicles.items() if same_person(n, driver.name)), None) or driver.name.split()[-1].upper()
            t = trucks.get(unit)
            if not t:
                t = Truck(unit_number=unit, is_active=True, fee_pct=0.0, driver_id=driver.id)
                db.add(t); db.flush(); trucks[unit] = t; stats["new trucks"] += 1
            elif not t.driver_id:
                t.driver_id = driver.id
            return t

        for r in rows:
            day = r[2].date() if isinstance(r[2], datetime) else r[2]
            if not isinstance(day, date):
                stats["skipped bad date"] += 1; continue
            names = [norm_name(x) for x in str(r[4]).split("||")]
            # a team row goes to whichever name owns a known truck, else the first name
            owner = next((n for n in names if any(same_person(v, n) for v in vehicles)), names[0])
            driver = driver_for(owner)
            truck = truck_for(driver)
            load_id = str(r[6] or "").strip() or None
            if load_id and db.query(Load).filter(Load.po_number == load_id, Load.load_date == day, Load.truck_id == truck.id).first():
                stats["already imported"] += 1; continue
            broker_name = norm_name(r[5]).upper() or "UNKNOWN"
            broker = brokers.get(broker_name)
            if not broker:
                broker = Broker(name=broker_name, is_active=True); db.add(broker); db.flush(); brokers[broker_name] = broker; stats["new brokers"] += 1
            dhd, loaded, total = int(r[10] or 0), int(r[11] or 0), int(r[12] or 0) or int(r[10] or 0) + int(r[11] or 0)
            load = Load(load_number=next_no, truck_id=truck.id, driver_id=driver.id, broker_id=broker.id, load_date=day, rate=float(r[9]),
                        po_number=load_id, empty_miles=dhd, loaded_miles=loaded, total_miles=total,
                        status=LoadStatus.DELIVERED, billing_status=BillingStatus.PENDING, is_active=True,
                        statement_week=ws.week_start(day, start_day),
                        notes=(f"Team: {' / '.join(names)}" if len(names) > 1 else None) or (str(r[14]).strip() if len(r) > 14 and r[14] else None))
            load.stops.append(LoadStop(stop_type=StopType.PICKUP, stop_order=1, stop_date=day, title=str(r[7] or "").strip() or None))
            load.stops.append(LoadStop(stop_type=StopType.DELIVERY, stop_order=2, stop_date=day, title=str(r[8] or "").strip() or None))
            db.add(load); next_no += 1; stats["loads"] += 1
        if args.apply:
            db.commit(); print("COMMITTED")
        else:
            db.rollback(); print("DRY RUN, nothing written")
    db.close()
    for k, v in sorted(stats.items()):
        print(f"  {k}: {v}")


if __name__ == "__main__":
    main()
