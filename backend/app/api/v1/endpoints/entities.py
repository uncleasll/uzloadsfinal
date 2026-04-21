from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from app.db.session import get_db
from app.schemas.schemas import (
    DriverCreate, DriverUpdate, DriverOut,
    TruckCreate, TruckUpdate, TruckOut, TruckDocumentOut,
    TrailerCreate, TrailerUpdate, TrailerOut, TrailerDocumentOut,
    BrokerCreate, BrokerUpdate, BrokerOut,
    DispatcherCreate, DispatcherUpdate, DispatcherOut
)
from app.crud import entities as crud

router = APIRouter(tags=["entities"])


# ─── Drivers ──────────────────────────────────────────────────────────────────

@router.get("/drivers", response_model=List[DriverOut])
def list_drivers(is_active: Optional[bool] = None, db: Session = Depends(get_db)):
    return crud.get_drivers(db, is_active)


@router.post("/drivers", response_model=DriverOut, status_code=201)
def create_driver(driver_in: DriverCreate, db: Session = Depends(get_db)):
    return crud.create_driver(db, driver_in)


@router.put("/drivers/{driver_id}", response_model=DriverOut)
def update_driver(driver_id: int, driver_in: DriverUpdate, db: Session = Depends(get_db)):
    driver = crud.update_driver(db, driver_id, driver_in)
    if not driver:
        raise HTTPException(404, "Driver not found")
    return driver


# ─── Trucks ───────────────────────────────────────────────────────────────────

@router.get("/trucks", response_model=List[TruckOut])
def list_trucks(is_active: Optional[bool] = None, db: Session = Depends(get_db)):
    return crud.get_trucks(db, is_active)


@router.post("/trucks", response_model=TruckOut, status_code=201)
def create_truck(truck_in: TruckCreate, db: Session = Depends(get_db)):
    return crud.create_truck(db, truck_in)


@router.get("/trucks/{truck_id}", response_model=TruckOut)
def get_truck(truck_id: int, db: Session = Depends(get_db)):
    truck = crud.get_truck(db, truck_id)
    if not truck:
        raise HTTPException(404, "Truck not found")
    return truck


@router.put("/trucks/{truck_id}", response_model=TruckOut)
def update_truck(truck_id: int, truck_in: TruckUpdate, db: Session = Depends(get_db)):
    truck = crud.update_truck(db, truck_id, truck_in)
    if not truck:
        raise HTTPException(404, "Truck not found")
    return truck


@router.delete("/trucks/{truck_id}")
def delete_truck(truck_id: int, db: Session = Depends(get_db)):
    if not crud.delete_truck(db, truck_id):
        raise HTTPException(404, "Truck not found")
    return {"message": "Truck deactivated"}


@router.post("/trucks/{truck_id}/documents", response_model=TruckDocumentOut, status_code=201)
def add_truck_document(truck_id: int, data: dict, db: Session = Depends(get_db)):
    return crud.add_truck_document(db, truck_id, data)


@router.put("/trucks/{truck_id}/documents/{doc_id}", response_model=TruckDocumentOut)
def update_truck_document(truck_id: int, doc_id: int, data: dict, db: Session = Depends(get_db)):
    doc = crud.update_truck_document(db, doc_id, data)
    if not doc:
        raise HTTPException(404, "Document not found")
    return doc


@router.delete("/trucks/{truck_id}/documents/{doc_id}")
def delete_truck_document(truck_id: int, doc_id: int, db: Session = Depends(get_db)):
    if not crud.delete_truck_document(db, doc_id):
        raise HTTPException(404, "Document not found")
    return {"message": "Deleted"}


# ─── Trailers ─────────────────────────────────────────────────────────────────

@router.get("/trailers", response_model=List[TrailerOut])
def list_trailers(is_active: Optional[bool] = None, db: Session = Depends(get_db)):
    return crud.get_trailers(db, is_active)


@router.post("/trailers", response_model=TrailerOut, status_code=201)
def create_trailer(trailer_in: TrailerCreate, db: Session = Depends(get_db)):
    return crud.create_trailer(db, trailer_in)


@router.get("/trailers/{trailer_id}", response_model=TrailerOut)
def get_trailer(trailer_id: int, db: Session = Depends(get_db)):
    trailer = crud.get_trailer(db, trailer_id)
    if not trailer:
        raise HTTPException(404, "Trailer not found")
    return trailer


@router.put("/trailers/{trailer_id}", response_model=TrailerOut)
def update_trailer(trailer_id: int, trailer_in: TrailerUpdate, db: Session = Depends(get_db)):
    trailer = crud.update_trailer(db, trailer_id, trailer_in)
    if not trailer:
        raise HTTPException(404, "Trailer not found")
    return trailer


@router.delete("/trailers/{trailer_id}")
def delete_trailer(trailer_id: int, db: Session = Depends(get_db)):
    if not crud.delete_trailer(db, trailer_id):
        raise HTTPException(404, "Trailer not found")
    return {"message": "Trailer deactivated"}


@router.post("/trailers/{trailer_id}/documents", response_model=TrailerDocumentOut, status_code=201)
def add_trailer_document(trailer_id: int, data: dict, db: Session = Depends(get_db)):
    return crud.add_trailer_document(db, trailer_id, data)


@router.put("/trailers/{trailer_id}/documents/{doc_id}", response_model=TrailerDocumentOut)
def update_trailer_document(trailer_id: int, doc_id: int, data: dict, db: Session = Depends(get_db)):
    doc = crud.update_trailer_document(db, doc_id, data)
    if not doc:
        raise HTTPException(404, "Document not found")
    return doc


@router.delete("/trailers/{trailer_id}/documents/{doc_id}")
def delete_trailer_document(trailer_id: int, doc_id: int, db: Session = Depends(get_db)):
    if not crud.delete_trailer_document(db, doc_id):
        raise HTTPException(404, "Document not found")
    return {"message": "Deleted"}


# ─── Brokers ──────────────────────────────────────────────────────────────────

@router.get("/brokers", response_model=List[BrokerOut])
def list_brokers(is_active: Optional[bool] = None, db: Session = Depends(get_db)):
    return crud.get_brokers(db, is_active)


@router.post("/brokers", response_model=BrokerOut, status_code=201)
def create_broker(broker_in: BrokerCreate, db: Session = Depends(get_db)):
    return crud.create_broker(db, broker_in)


@router.put("/brokers/{broker_id}", response_model=BrokerOut)
def update_broker(broker_id: int, broker_in: BrokerUpdate, db: Session = Depends(get_db)):
    broker = crud.update_broker(db, broker_id, broker_in)
    if not broker:
        raise HTTPException(404, "Broker not found")
    return broker


# ─── Dispatchers ──────────────────────────────────────────────────────────────

@router.get("/dispatchers", response_model=List[DispatcherOut])
def list_dispatchers(is_active: Optional[bool] = None, db: Session = Depends(get_db)):
    return crud.get_dispatchers(db, is_active)


@router.post("/dispatchers", response_model=DispatcherOut, status_code=201)
def create_dispatcher(dispatcher_in: DispatcherCreate, db: Session = Depends(get_db)):
    return crud.create_dispatcher(db, dispatcher_in)
