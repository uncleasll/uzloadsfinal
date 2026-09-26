"""Truck status, idle drivers and dated driver assignments."""
from __future__ import annotations
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.v1.endpoints.auth import require_user
from app.db.session import get_db
from app.models.models import Driver, DriverAssignment, Truck
from app.services import fleet

router = APIRouter(prefix="/fleet", tags=["fleet"])


class StatusIn(BaseModel):
    status: str
    note: Optional[str] = None


@router.put("/trucks/{truck_id}/status")
def truck_status(truck_id: int, data: StatusIn, db: Session = Depends(get_db), user=Depends(require_user)):
    t = db.get(Truck, truck_id)
    if not t:
        raise HTTPException(404, "Truck not found")
    try:
        t = fleet.set_truck_status(db, t, data.status, data.note, user)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"truck_id": t.id, "status": t.status, "status_note": t.status_note, "status_since": t.status_since.isoformat() if t.status_since else None}


@router.get("/idle-drivers")
def idle(db: Session = Depends(get_db), user=Depends(require_user)):
    return fleet.idle_drivers(db)


class AssignIn(BaseModel):
    driver_id: int
    truck_id: int
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    reason: Optional[str] = None


@router.post("/assignments", status_code=201)
def create_assignment(data: AssignIn, db: Session = Depends(get_db), user=Depends(require_user)):
    d = db.get(Driver, data.driver_id); t = db.get(Truck, data.truck_id)
    if not d or not t:
        raise HTTPException(404, "Driver or truck not found")
    try:
        a = fleet.assign(db, driver=d, truck=t, start=data.start_date or date.today(), end=data.end_date, reason=data.reason, user=user)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return fleet._a(a)


@router.post("/assignments/{assignment_id}/end")
def end_assignment(assignment_id: int, db: Session = Depends(get_db), user=Depends(require_user)):
    a = db.get(DriverAssignment, assignment_id)
    if not a:
        raise HTTPException(404, "Assignment not found")
    return fleet._a(fleet.end_assignment(db, a))


@router.get("/trucks/{truck_id}/history")
def history(truck_id: int, db: Session = Depends(get_db), user=Depends(require_user)):
    t = db.get(Truck, truck_id)
    if not t:
        raise HTTPException(404, "Truck not found")
    return {"truck": t.unit_number, "status": t.status, "permanent_driver": t.driver.name if t.driver else None, "assignments": fleet.truck_history(db, t)}
