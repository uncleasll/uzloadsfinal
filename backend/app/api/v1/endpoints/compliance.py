"""Expiring papers and the IFTA worksheet."""
from __future__ import annotations
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.v1.endpoints.auth import require_user
from app.db.session import get_db
from app.models.models import Truck
from app.services import compliance, ifta

router = APIRouter(tags=["compliance"])


@router.get("/compliance/expiring")
def expiring(days: int = Query(30, ge=0, le=365), db: Session = Depends(get_db), user=Depends(require_user)):
    return compliance.expiring(db, days)


@router.get("/ifta/{year}/{quarter}")
def worksheet(year: int, quarter: int, truck_id: Optional[int] = None, db: Session = Depends(get_db), user=Depends(require_user)):
    if quarter not in (1, 2, 3, 4):
        raise HTTPException(400, "Quarter must be 1 to 4")
    return ifta.worksheet(db, year, quarter, truck_id)


class MilesIn(BaseModel):
    miles: dict[str, int]      # state -> miles


@router.put("/ifta/{year}/{quarter}/trucks/{truck_id}")
def set_miles(year: int, quarter: int, truck_id: int, data: MilesIn, db: Session = Depends(get_db), user=Depends(require_user)):
    if not db.get(Truck, truck_id):
        raise HTTPException(404, "Truck not found")
    ifta.set_miles(db, truck_id, year, quarter, data.miles)
    return ifta.worksheet(db, year, quarter)


@router.get("/ifta/current")
def current(db: Session = Depends(get_db), user=Depends(require_user)):
    t = date.today()
    return {"year": t.year, "quarter": (t.month - 1) // 3 + 1}
