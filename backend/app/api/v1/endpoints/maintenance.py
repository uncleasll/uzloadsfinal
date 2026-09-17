"""Maintenance: service due board, odometer log, services done, interval settings."""
from datetime import date
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.models import ServiceInterval, Truck, TruckService
from app.services import maintenance as mt

router = APIRouter(prefix="/maintenance", tags=["maintenance"])


def _truck(db: Session, truck_id: int) -> Truck:
    t = db.query(Truck).filter(Truck.id == truck_id).first()
    if not t:
        raise HTTPException(404, "Truck not found")
    return t


@router.get("")
def maintenance_board(db: Session = Depends(get_db)):
    return mt.board(db)


@router.get("/trucks/{truck_id}")
def truck_history(truck_id: int, db: Session = Depends(get_db)):
    _truck(db, truck_id)
    return mt.history(db, truck_id)


class OdometerIn(BaseModel):
    date: date
    reading: int = Field(ge=0)
    source: str = "manual"


@router.post("/trucks/{truck_id}/odometer", status_code=201)
def add_odometer(truck_id: int, data: OdometerIn, db: Session = Depends(get_db)):
    _truck(db, truck_id)
    try:
        mt.record_odometer(db, truck_id, data.date, data.reading, data.source)
    except ValueError as e:
        raise HTTPException(400, str(e))
    db.commit()
    return mt.history(db, truck_id)


class ServiceIn(BaseModel):
    service_type: str
    date: date
    odometer: Optional[int] = Field(default=None, ge=0)
    cost: float = Field(default=0.0, ge=0)
    vendor: Optional[str] = None
    notes: Optional[str] = None


@router.post("/trucks/{truck_id}/services", status_code=201)
def add_service(truck_id: int, data: ServiceIn, db: Session = Depends(get_db)):
    _truck(db, truck_id)
    if not data.service_type.strip():
        raise HTTPException(400, "Service type is required")
    mt.record_service(db, truck_id, data.service_type, data.date, data.odometer, data.cost, data.vendor, data.notes)
    db.commit()
    return mt.history(db, truck_id)


@router.delete("/services/{service_id}")
def delete_service(service_id: int, db: Session = Depends(get_db)):
    s = db.query(TruckService).filter(TruckService.id == service_id).first()
    if not s:
        raise HTTPException(404, "Service not found")
    db.delete(s)
    db.commit()
    return {"message": "Deleted"}


class IntervalIn(BaseModel):
    id: Optional[int] = None
    service_type: str
    miles: int = Field(default=0, ge=0)
    days: int = Field(default=0, ge=0)
    alert_miles: int = Field(default=0, ge=0)
    alert_days: int = Field(default=0, ge=0)


@router.put("/intervals")
def set_intervals(data: List[IntervalIn], db: Session = Depends(get_db)):
    existing = {i.id: i for i in mt.intervals(db)}
    keep = {d.id for d in data if d.id}
    for i in list(existing.values()):
        if i.id not in keep:
            db.delete(i)
    for n, d in enumerate(data):
        row = existing.get(d.id) if d.id else None
        if not row:
            row = ServiceInterval()
            db.add(row)
        row.service_type, row.miles, row.days, row.alert_miles, row.alert_days, row.sort_order = d.service_type.strip(), d.miles, d.days, d.alert_miles, d.alert_days, n
    db.commit()
    return mt.board(db)["intervals"]
