"""
Maintenance (the Fleet Command Center model): odometer log, services done, and what is due.

For each truck and service type:
  last service   = newest TruckService of that type
  current odo    = newest odometer reading (statements write one when odometer end is entered)
  next due miles = last odometer + interval miles      (if the interval is mileage based)
  next due date  = last date + interval days           (if the interval is date based)
  status         = RED     due or overdue
                   AMBER   within the alert window
                   GREEN   fine
                   GRAY    no history for this service yet
"""
from __future__ import annotations

from datetime import date, timedelta
from sqlalchemy.orm import Session, joinedload

from app.models.models import OdometerReading, ServiceInterval, Truck, TruckService

DEFAULT_INTERVALS = [
    # service_type, miles, days, alert_miles, alert_days   (Fleet Command Center SETTINGS sheet)
    ("Oil Change", 25000, 180, 3000, 14),
    ("PM Service", 50000, 180, 5000, 21),
    ("Tires", 60000, 365, 5000, 30),
    ("Alignment", 30000, 365, 3000, 30),
    ("Brakes", 50000, 365, 5000, 30),
    ("Coolant", 150000, 730, 10000, 45),
    ("Transmission", 150000, 730, 10000, 45),
    ("Annual Inspection", 0, 365, 0, 30),
]


def intervals(db: Session) -> list[ServiceInterval]:
    rows = db.query(ServiceInterval).order_by(ServiceInterval.sort_order, ServiceInterval.id).all()
    if rows:
        return rows
    for i, (t, m, d, am, ad) in enumerate(DEFAULT_INTERVALS):
        db.add(ServiceInterval(service_type=t, miles=m, days=d, alert_miles=am, alert_days=ad, sort_order=i))
    db.commit()
    return db.query(ServiceInterval).order_by(ServiceInterval.sort_order, ServiceInterval.id).all()


def current_odometer(db: Session, truck_id: int) -> OdometerReading | None:
    """Odometers only go up, so the highest reading is the current one whatever date it was written on."""
    return (db.query(OdometerReading).filter(OdometerReading.truck_id == truck_id)
              .order_by(OdometerReading.reading.desc(), OdometerReading.date.desc(), OdometerReading.id.desc()).first())


def record_odometer(db: Session, truck_id: int, day: date, reading: int, source: str = "manual") -> OdometerReading:
    if reading < 0:
        raise ValueError("Odometer must be a positive number")
    row = db.query(OdometerReading).filter_by(truck_id=truck_id, date=day, source=source).first()
    if row:
        row.reading = reading
    else:
        row = OdometerReading(truck_id=truck_id, date=day, reading=reading, source=source)
        db.add(row)
    db.flush()
    return row


def record_service(db: Session, truck_id: int, service_type: str, day: date, odometer: int | None, cost: float = 0.0,
                   vendor: str | None = None, notes: str | None = None) -> TruckService:
    row = TruckService(truck_id=truck_id, service_type=service_type.strip(), date=day, odometer=odometer, cost=cost or 0.0, vendor=vendor, notes=notes)
    db.add(row)
    if odometer:
        record_odometer(db, truck_id, day, odometer, source="service")
    db.flush()
    return row


def status_for(interval: ServiceInterval, last: TruckService | None, odo: int | None, today: date) -> dict:
    if not last:
        return {"status": "GRAY", "next_due_miles": None, "next_due_date": None, "miles_left": None, "days_left": None}
    next_miles = (last.odometer + interval.miles) if interval.miles and last.odometer else None
    next_date = (last.date + timedelta(days=interval.days)) if interval.days else None
    miles_left = (next_miles - odo) if next_miles is not None and odo is not None else None
    days_left = (next_date - today).days if next_date else None
    status = "GREEN"
    if (miles_left is not None and miles_left <= 0) or (days_left is not None and days_left <= 0):
        status = "RED"
    elif (miles_left is not None and miles_left <= (interval.alert_miles or 0)) or (days_left is not None and days_left <= (interval.alert_days or 0)):
        status = "AMBER"
    return {"status": status, "next_due_miles": next_miles, "next_due_date": next_date.isoformat() if next_date else None,
            "miles_left": miles_left, "days_left": days_left}


def board(db: Session, today: date | None = None) -> dict:
    today = today or date.today()
    ivs = intervals(db)
    trucks = db.query(Truck).options(joinedload(Truck.driver)).filter(Truck.is_active == True).order_by(Truck.unit_number).all()
    services = db.query(TruckService).order_by(TruckService.date.desc(), TruckService.id.desc()).all()
    last_by = {}
    for s in services:
        last_by.setdefault((s.truck_id, s.service_type), s)
    rows, counts = [], {"RED": 0, "AMBER": 0, "GREEN": 0, "GRAY": 0}
    for t in trucks:
        odo = current_odometer(db, t.id)
        items = []
        for iv in ivs:
            last = last_by.get((t.id, iv.service_type))
            st = status_for(iv, last, odo.reading if odo else None, today)
            counts[st["status"]] += 1
            items.append({"service_type": iv.service_type, "last_date": last.date.isoformat() if last else None,
                          "last_odometer": last.odometer if last else None, **st})
        rows.append({"truck_id": t.id, "unit_number": t.unit_number, "driver_name": t.driver.name if t.driver else None,
                     "odometer": odo.reading if odo else None, "odometer_date": odo.date.isoformat() if odo else None,
                     "worst": next((s for s in ("RED", "AMBER", "GREEN", "GRAY") if any(i["status"] == s for i in items)), "GRAY"),
                     "services": items})
    return {"today": today.isoformat(), "counts": counts, "rows": rows,
            "intervals": [{"id": i.id, "service_type": i.service_type, "miles": i.miles, "days": i.days, "alert_miles": i.alert_miles, "alert_days": i.alert_days} for i in ivs]}


def history(db: Session, truck_id: int) -> dict:
    return {
        "services": [{"id": s.id, "service_type": s.service_type, "date": s.date.isoformat(), "odometer": s.odometer, "cost": s.cost, "vendor": s.vendor, "notes": s.notes}
                     for s in db.query(TruckService).filter_by(truck_id=truck_id).order_by(TruckService.date.desc(), TruckService.id.desc()).all()],
        "odometer": [{"id": o.id, "date": o.date.isoformat(), "reading": o.reading, "source": o.source}
                     for o in db.query(OdometerReading).filter_by(truck_id=truck_id).order_by(OdometerReading.date.desc(), OdometerReading.id.desc()).limit(52).all()],
    }
