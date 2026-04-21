"""
Load CSV import - ezLoads-style import flow
Template columns: load_number, broker_name, driver_name, rate,
                  pickup_city, pickup_state, pickup_date,
                  delivery_city, delivery_state, delivery_date,
                  po_number, notes
Matches brokers/drivers by exact name. Reports success/failure per row.
"""
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime, date
import csv, io, uuid
from app.db.session import get_db
from app.models.models import Load, LoadStop, StopType, Broker, Driver, LoadStatus, BillingStatus
from app.services.driver_pay_service import take_snapshot

router = APIRouter(prefix="/loads-import", tags=["loads-import"])

CSV_TEMPLATE_HEADER = [
    "load_number", "broker_name", "driver_name", "rate",
    "pickup_city", "pickup_state", "pickup_zip", "pickup_date",
    "delivery_city", "delivery_state", "delivery_zip", "delivery_date",
    "po_number", "notes",
]


def _parse_date(s: str):
    if not s: return None
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%m/%d/%y", "%d.%m.%Y"):
        try:
            return datetime.strptime(s.strip(), fmt).date()
        except ValueError:
            pass
    return None


def _next_load_number(db: Session) -> int:
    from sqlalchemy import func as sqlfunc
    m = db.query(sqlfunc.max(Load.load_number)).scalar()
    return (m or 1000) + 1


@router.get("/template")
def download_template():
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(CSV_TEMPLATE_HEADER)
    w.writerow([
        "1234", "ABC Logistics", "John Smith", "2500.00",
        "New York Mills", "MN", "56567", "2026-04-15",
        "Brookland", "AR", "72417", "2026-04-17",
        "PO-12345", "Example load"
    ])
    return Response(
        buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=loads_template.csv"}
    )


@router.post("")
def import_loads(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """
    Parse CSV, import loads, return batch_id + per-row results.
    """
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(400, "File must be .csv")

    content = file.file.read().decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(content))
    batch_id = str(uuid.uuid4())[:8]

    results = []
    success_count = 0
    fail_count = 0

    for row_num, row in enumerate(reader, start=2):  # row 1 = header
        try:
            broker_name = (row.get("broker_name") or "").strip()
            driver_name = (row.get("driver_name") or "").strip()

            broker = db.query(Broker).filter(Broker.name == broker_name, Broker.is_active == True).first() if broker_name else None
            driver = db.query(Driver).filter(Driver.name == driver_name, Driver.is_active == True).first() if driver_name else None

            errors = []
            if broker_name and not broker:
                errors.append(f"Broker '{broker_name}' not found")
            if driver_name and not driver:
                errors.append(f"Driver '{driver_name}' not found")

            pickup_date = _parse_date(row.get("pickup_date", ""))
            delivery_date = _parse_date(row.get("delivery_date", ""))
            rate = float(row.get("rate") or 0)

            if errors:
                results.append({"row": row_num, "status": "failed", "errors": errors, "data": dict(row)})
                fail_count += 1
                continue

            load = Load(
                load_number=_next_load_number(db),
                status=LoadStatus.NEW,
                billing_status=BillingStatus.PENDING,
                rate=rate,
                load_date=pickup_date or date.today(),
                actual_delivery_date=delivery_date,
                po_number=row.get("po_number") or None,
                notes=row.get("notes") or None,
                is_active=True,
                driver_id=driver.id if driver else None,
                broker_id=broker.id if broker else None,
            )
            db.add(load)
            db.flush()

            take_snapshot(db, load)

            db.add(LoadStop(
                load_id=load.id, stop_type=StopType.PICKUP, stop_order=1,
                city=row.get("pickup_city") or "", state=row.get("pickup_state") or "",
                zip_code=row.get("pickup_zip") or "", country="US", stop_date=pickup_date,
            ))
            db.add(LoadStop(
                load_id=load.id, stop_type=StopType.DELIVERY, stop_order=2,
                city=row.get("delivery_city") or "", state=row.get("delivery_state") or "",
                zip_code=row.get("delivery_zip") or "", country="US", stop_date=delivery_date,
            ))

            db.commit()

            results.append({
                "row": row_num, "status": "success",
                "load_number": load.load_number, "load_id": load.id
            })
            success_count += 1

        except Exception as e:
            db.rollback()
            results.append({"row": row_num, "status": "failed", "errors": [str(e)], "data": dict(row)})
            fail_count += 1

    return {
        "batch_id": batch_id,
        "total": success_count + fail_count,
        "success": success_count,
        "failed": fail_count,
        "results": results,
    }
