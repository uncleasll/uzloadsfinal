from sqlalchemy.orm import Session, joinedload
from typing import Optional, List
from app.models.models import Driver, Truck, Trailer, Broker, Dispatcher, TruckDocument, TrailerDocument
from app.schemas.schemas import (
    DriverCreate, DriverUpdate, TruckCreate, TruckUpdate,
    TrailerCreate, TrailerUpdate, BrokerCreate, BrokerUpdate,
    DispatcherCreate, DispatcherUpdate
)


# ─── Drivers ──────────────────────────────────────────────────────────────────

def get_drivers(db: Session, is_active: Optional[bool] = None) -> List[Driver]:
    q = db.query(Driver)
    if is_active is not None:
        q = q.filter(Driver.is_active == is_active)
    return q.order_by(Driver.name).all()


def get_driver(db: Session, driver_id: int) -> Optional[Driver]:
    return db.query(Driver).filter(Driver.id == driver_id).first()


def create_driver(db: Session, driver_in: DriverCreate) -> Driver:
    driver = Driver(**driver_in.model_dump())
    db.add(driver)
    db.commit()
    db.refresh(driver)
    return driver


def update_driver(db: Session, driver_id: int, driver_in: DriverUpdate) -> Optional[Driver]:
    driver = db.query(Driver).filter(Driver.id == driver_id).first()
    if not driver:
        return None
    for k, v in driver_in.model_dump(exclude_unset=True).items():
        setattr(driver, k, v)
    db.commit()
    db.refresh(driver)
    return driver


# ─── Trucks ───────────────────────────────────────────────────────────────────

def get_trucks(db: Session, is_active: Optional[bool] = None) -> List[Truck]:
    q = db.query(Truck).options(joinedload(Truck.driver), joinedload(Truck.documents))
    if is_active is not None:
        q = q.filter(Truck.is_active == is_active)
    return q.order_by(Truck.unit_number).all()


def get_truck(db: Session, truck_id: int):
    return db.query(Truck).options(joinedload(Truck.driver), joinedload(Truck.documents)).filter(Truck.id == truck_id).first()


def delete_truck(db: Session, truck_id: int) -> bool:
    truck = db.query(Truck).filter(Truck.id == truck_id).first()
    if not truck:
        return False
    truck.is_active = False
    db.commit()
    return True


def add_truck_document(db: Session, truck_id: int, data: dict) -> TruckDocument:
    doc = TruckDocument(truck_id=truck_id, **data)
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc


def update_truck_document(db: Session, doc_id: int, data: dict):
    doc = db.query(TruckDocument).filter(TruckDocument.id == doc_id).first()
    if not doc:
        return None
    for k, v in data.items():
        setattr(doc, k, v)
    db.commit()
    db.refresh(doc)
    return doc


def delete_truck_document(db: Session, doc_id: int) -> bool:
    doc = db.query(TruckDocument).filter(TruckDocument.id == doc_id).first()
    if not doc:
        return False
    db.delete(doc)
    db.commit()
    return True


def create_truck(db: Session, truck_in: TruckCreate) -> Truck:
    truck = Truck(**truck_in.model_dump())
    db.add(truck)
    db.commit()
    db.refresh(truck)
    return truck


def update_truck(db: Session, truck_id: int, truck_in: TruckUpdate) -> Optional[Truck]:
    truck = db.query(Truck).filter(Truck.id == truck_id).first()
    if not truck:
        return None
    for k, v in truck_in.model_dump(exclude_unset=True).items():
        setattr(truck, k, v)
    db.commit()
    db.refresh(truck)
    return truck


# ─── Trailers ─────────────────────────────────────────────────────────────────

def get_trailers(db: Session, is_active: Optional[bool] = None) -> List[Trailer]:
    q = db.query(Trailer).options(joinedload(Trailer.driver), joinedload(Trailer.documents))
    if is_active is not None:
        q = q.filter(Trailer.is_active == is_active)
    return q.order_by(Trailer.unit_number).all()


def get_trailer(db: Session, trailer_id: int):
    return db.query(Trailer).options(joinedload(Trailer.driver), joinedload(Trailer.documents)).filter(Trailer.id == trailer_id).first()


def delete_trailer(db: Session, trailer_id: int) -> bool:
    trailer = db.query(Trailer).filter(Trailer.id == trailer_id).first()
    if not trailer:
        return False
    trailer.is_active = False
    db.commit()
    return True


def add_trailer_document(db: Session, trailer_id: int, data: dict) -> TrailerDocument:
    doc = TrailerDocument(trailer_id=trailer_id, **data)
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc


def update_trailer_document(db: Session, doc_id: int, data: dict):
    doc = db.query(TrailerDocument).filter(TrailerDocument.id == doc_id).first()
    if not doc:
        return None
    for k, v in data.items():
        setattr(doc, k, v)
    db.commit()
    db.refresh(doc)
    return doc


def delete_trailer_document(db: Session, doc_id: int) -> bool:
    doc = db.query(TrailerDocument).filter(TrailerDocument.id == doc_id).first()
    if not doc:
        return False
    db.delete(doc)
    db.commit()
    return True


def create_trailer(db: Session, trailer_in: TrailerCreate) -> Trailer:
    trailer = Trailer(**trailer_in.model_dump())
    db.add(trailer)
    db.commit()
    db.refresh(trailer)
    return trailer


def update_trailer(db: Session, trailer_id: int, trailer_in: TrailerUpdate) -> Optional[Trailer]:
    trailer = db.query(Trailer).filter(Trailer.id == trailer_id).first()
    if not trailer:
        return None
    for k, v in trailer_in.model_dump(exclude_unset=True).items():
        setattr(trailer, k, v)
    db.commit()
    db.refresh(trailer)
    return trailer


# ─── Brokers ──────────────────────────────────────────────────────────────────

def get_brokers(db: Session, is_active: Optional[bool] = None) -> List[Broker]:
    q = db.query(Broker)
    if is_active is not None:
        q = q.filter(Broker.is_active == is_active)
    return q.order_by(Broker.name).all()


def get_broker(db: Session, broker_id: int) -> Optional[Broker]:
    return db.query(Broker).filter(Broker.id == broker_id).first()


def create_broker(db: Session, broker_in: BrokerCreate) -> Broker:
    broker = Broker(**broker_in.model_dump())
    db.add(broker)
    db.commit()
    db.refresh(broker)
    return broker


def update_broker(db: Session, broker_id: int, broker_in: BrokerUpdate) -> Optional[Broker]:
    broker = db.query(Broker).filter(Broker.id == broker_id).first()
    if not broker:
        return None
    for k, v in broker_in.model_dump(exclude_unset=True).items():
        setattr(broker, k, v)
    db.commit()
    db.refresh(broker)
    return broker


# ─── Dispatchers ──────────────────────────────────────────────────────────────

def get_dispatchers(db: Session, is_active: Optional[bool] = None) -> List[Dispatcher]:
    q = db.query(Dispatcher)
    if is_active is not None:
        q = q.filter(Dispatcher.is_active == is_active)
    return q.order_by(Dispatcher.name).all()


def create_dispatcher(db: Session, dispatcher_in: DispatcherCreate) -> Dispatcher:
    dispatcher = Dispatcher(**dispatcher_in.model_dump())
    db.add(dispatcher)
    db.commit()
    db.refresh(dispatcher)
    return dispatcher
