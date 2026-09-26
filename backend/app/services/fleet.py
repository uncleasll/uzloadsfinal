"""Who is on which truck today, which trucks are down, and which drivers are waiting for one."""
from __future__ import annotations
from datetime import date, datetime

from sqlalchemy.orm import Session, joinedload

from app.models.models import Driver, DriverAssignment, Message, Truck, User

TRUCK_STATUSES = ("active", "in_shop", "out_of_service")


def assignment_on(db: Session, on: date, *, truck_id: int | None = None, driver_id: int | None = None) -> DriverAssignment | None:
    q = db.query(DriverAssignment).filter(DriverAssignment.start_date <= on,
                                          (DriverAssignment.end_date.is_(None)) | (DriverAssignment.end_date >= on))
    if truck_id is not None:
        q = q.filter(DriverAssignment.truck_id == truck_id)
    if driver_id is not None:
        q = q.filter(DriverAssignment.driver_id == driver_id)
    return q.order_by(DriverAssignment.start_date.desc(), DriverAssignment.id.desc()).first()


def effective_driver(db: Session, truck: Truck, on: date | None = None) -> Driver | None:
    """A dated assignment beats the truck's permanent driver."""
    a = assignment_on(db, on or date.today(), truck_id=truck.id)
    return a.driver if a else truck.driver


def effective_truck(db: Session, driver: Driver, on: date | None = None) -> Truck | None:
    on = on or date.today()
    a = assignment_on(db, on, driver_id=driver.id)
    if a:
        return a.truck
    return db.query(Truck).filter(Truck.driver_id == driver.id, Truck.is_active == True).first()  # noqa: E712


def idle_drivers(db: Session, on: date | None = None) -> list[dict]:
    """Active drivers with no truck to drive today: no truck at all, or their truck is down and nobody moved them."""
    on = on or date.today()
    out = []
    for d in db.query(Driver).filter(Driver.is_active == True).order_by(Driver.name).all():  # noqa: E712
        t = effective_truck(db, d, on)
        if t is None or t.status != "active":
            own = db.query(Truck).filter(Truck.driver_id == d.id, Truck.is_active == True).first()  # noqa: E712
            out.append({"driver_id": d.id, "name": d.name, "phone": d.phone,
                        "reason": "no truck" if own is None else f"truck {own.unit_number} is {own.status.replace('_', ' ')}",
                        "own_truck": own.unit_number if own else None,
                        "since": own.status_since.isoformat() if own and own.status_since else None})
    return out


def set_truck_status(db: Session, truck: Truck, status: str, note: str | None, user: User | None) -> Truck:
    if status not in TRUCK_STATUSES:
        raise ValueError("Unknown truck status")
    if truck.status == status and (note or "") == (truck.status_note or ""):
        return truck
    truck.status = status
    truck.status_note = note
    truck.status_since = datetime.utcnow()
    from app.services.chat import ensure_truck_conversation
    conv = ensure_truck_conversation(db, truck)
    label = {"active": "back in service", "in_shop": "in the shop", "out_of_service": "out of service"}[status]
    db.add(Message(conversation_id=conv.id, sender_id=user.id if user else None, kind="system",
                   body=f"Truck {truck.unit_number} is {label}" + (f": {note}" if note else "")))
    db.commit(); db.refresh(truck)
    return truck


def assign(db: Session, *, driver: Driver, truck: Truck, start: date, end: date | None, reason: str | None, user: User | None) -> DriverAssignment:
    if end and end < start:
        raise ValueError("End date is before the start date")
    # close whatever else this driver had open in that window, so one driver is never on two trucks
    for a in db.query(DriverAssignment).filter(DriverAssignment.driver_id == driver.id, DriverAssignment.end_date.is_(None)).all():
        if a.truck_id != truck.id:
            a.end_date = start
    a = DriverAssignment(driver_id=driver.id, truck_id=truck.id, start_date=start, end_date=end, reason=reason, created_by=user.id if user else None)
    db.add(a)
    from app.services.chat import ensure_truck_conversation
    conv = ensure_truck_conversation(db, truck)
    until = f" until {end:%m/%d}" if end else ""
    db.add(Message(conversation_id=conv.id, sender_id=user.id if user else None, kind="system",
                   body=f"{driver.name} drives truck {truck.unit_number} from {start:%m/%d}{until}" + (f" ({reason})" if reason else "")))
    db.commit(); db.refresh(a)
    return a


def end_assignment(db: Session, a: DriverAssignment, on: date | None = None) -> DriverAssignment:
    a.end_date = on or date.today()
    db.commit(); db.refresh(a)
    return a


def truck_history(db: Session, truck: Truck) -> list[dict]:
    rows = (db.query(DriverAssignment).options(joinedload(DriverAssignment.driver))
              .filter(DriverAssignment.truck_id == truck.id).order_by(DriverAssignment.start_date.desc()).all())
    return [_a(a) for a in rows]


def _a(a: DriverAssignment) -> dict:
    return {"id": a.id, "driver_id": a.driver_id, "driver": a.driver.name if a.driver else None, "truck_id": a.truck_id,
            "truck": a.truck.unit_number if a.truck else None, "start_date": a.start_date.isoformat(),
            "end_date": a.end_date.isoformat() if a.end_date else None, "reason": a.reason,
            "open": a.end_date is None or a.end_date >= date.today()}
