from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_, and_, func
from typing import Optional, List
from datetime import date
from app.models.models import (
    Load, LoadStop, LoadService, LoadDocument, LoadHistory, LoadNote,
    LoadStatus, BillingStatus, Driver, Broker, Truck, Trailer, Dispatcher
)
from app.schemas.schemas import LoadCreate, LoadUpdate, LoadServiceCreate, LoadNoteCreate
from app.services.driver_pay_service import take_snapshot, recalculate_driver_pay as _recalc_pay
import os
import shutil


def get_next_load_number(db: Session) -> int:
    max_load = db.query(func.max(Load.load_number)).scalar()
    return (max_load or 1000) + 1


def get_loads(
    db: Session,
    page: int = 1,
    page_size: int = 25,
    search: Optional[str] = None,
    status: Optional[str] = None,
    billing_status: Optional[str] = None,
    driver_id: Optional[int] = None,
    broker_id: Optional[int] = None,
    truck_id: Optional[int] = None,
    trailer_id: Optional[int] = None,
    dispatcher_id: Optional[int] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    pickup_date_from: Optional[date] = None,
    pickup_date_to: Optional[date] = None,
    delivery_date_from: Optional[date] = None,
    delivery_date_to: Optional[date] = None,
    show_only_active: bool = False,
    direct_billing: Optional[bool] = None,
    state: Optional[str] = None,
    load_number: Optional[int] = None,
):
    query = db.query(Load).options(
        joinedload(Load.driver),
        joinedload(Load.truck),
        joinedload(Load.trailer),
        joinedload(Load.broker),
        joinedload(Load.dispatcher),
        joinedload(Load.stops),
        joinedload(Load.services),
        joinedload(Load.documents),
    )

    if show_only_active:
        query = query.filter(Load.is_active == True)

    if load_number:
        query = query.filter(Load.load_number == load_number)

    if search:
        query = query.join(Load.broker, isouter=True).join(Load.driver, isouter=True)
        search_term = f"%{search}%"
        query = query.filter(
            or_(
                Load.load_number.cast(db.bind.dialect.name == 'postgresql' and None or None).ilike(search_term) if False else Load.load_number == (int(search) if search.isdigit() else -1),
                Load.po_number.ilike(search_term),
                Broker.name.ilike(search_term),
                Driver.name.ilike(search_term),
            )
        )

    if status:
        statuses = [s.strip() for s in status.split(",")]
        query = query.filter(Load.status.in_(statuses))

    if billing_status:
        billing_statuses = [s.strip() for s in billing_status.split(",")]
        query = query.filter(Load.billing_status.in_(billing_statuses))

    if driver_id:
        query = query.filter(Load.driver_id == driver_id)

    if broker_id:
        query = query.filter(Load.broker_id == broker_id)

    if truck_id:
        query = query.filter(Load.truck_id == truck_id)

    if trailer_id:
        query = query.filter(Load.trailer_id == trailer_id)

    if dispatcher_id:
        query = query.filter(Load.dispatcher_id == dispatcher_id)

    if date_from:
        query = query.filter(Load.load_date >= date_from)

    if date_to:
        query = query.filter(Load.load_date <= date_to)

    if direct_billing is not None:
        query = query.filter(Load.direct_billing == direct_billing)

    total = query.count()

    # Financial totals
    total_rate = db.query(func.sum(Load.rate)).filter(
        Load.id.in_([l.id for l in query.all()])
    ).scalar() or 0.0

    query = query.order_by(Load.load_number.desc())
    offset = (page - 1) * page_size
    items = query.offset(offset).limit(page_size).all()

    # Recalculate totals on actual filtered set
    rate_query = db.query(func.sum(Load.rate))
    if show_only_active:
        rate_query = rate_query.filter(Load.is_active == True)
    if status:
        rate_query = rate_query.filter(Load.status.in_(statuses))
    if driver_id:
        rate_query = rate_query.filter(Load.driver_id == driver_id)
    if broker_id:
        rate_query = rate_query.filter(Load.broker_id == broker_id)
    total_rate = rate_query.scalar() or 0.0

    invoiced_q = rate_query.filter(Load.billing_status.in_(["Invoiced", "Sent to factoring", "Funded", "Paid"]))

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size if page_size > 0 else 1,
        "total_rate": total_rate,
    }


def get_load(db: Session, load_id: int):
    return db.query(Load).options(
        joinedload(Load.driver),
        joinedload(Load.truck),
        joinedload(Load.trailer),
        joinedload(Load.broker),
        joinedload(Load.dispatcher),
        joinedload(Load.stops),
        joinedload(Load.services),
        joinedload(Load.documents),
        joinedload(Load.history),
        joinedload(Load.notes_list),
    ).filter(Load.id == load_id).first()


def create_load(db: Session, load_in: LoadCreate, author: str = "System") -> Load:
    load_number = get_next_load_number(db)
    stops = load_in.stops or []
    load_data = load_in.model_dump(exclude={"stops"})
    db_load = Load(**load_data, load_number=load_number)
    db.add(db_load)
    db.flush()
    # Freeze driver compensation rules at load-creation time
    take_snapshot(db, db_load)

    for stop_data in stops:
        stop = LoadStop(load_id=db_load.id, **stop_data.model_dump())
        db.add(stop)

    # Build history entry
    driver_name = ""
    if load_in.driver_id:
        drv = db.query(Driver).filter(Driver.id == load_in.driver_id).first()
        if drv:
            driver_name = f"{drv.name} [{drv.driver_type}]"

    broker_name = ""
    if load_in.broker_id:
        brk = db.query(Broker).filter(Broker.id == load_in.broker_id).first()
        if brk:
            broker_name = brk.name

    truck_unit = ""
    if load_in.truck_id:
        trk = db.query(Truck).filter(Truck.id == load_in.truck_id).first()
        if trk:
            truck_unit = trk.unit_number

    dispatcher_name = author
    if load_in.dispatcher_id:
        disp = db.query(Dispatcher).filter(Dispatcher.id == load_in.dispatcher_id).first()
        if disp:
            dispatcher_name = disp.name

    history_desc = (
        f"The load #{load_number} was created: "
        f"truck: {truck_unit}; "
        f"driver: {driver_name}; "
        f"broker: {broker_name}; "
        f"broker load: #{load_in.po_number or ''}; "
        f"completed date: {load_in.actual_delivery_date}; "
        f"rate: ${load_in.rate:.2f}; "
        f"status: {load_in.status.value}; "
        f"billing status: {load_in.billing_status.value}; "
        f"dispatcher: {dispatcher_name}"
    )
    for stop in stops:
        history_desc += (
            f"\n{stop.stop_type.value.capitalize()} was added: "
            f"type: {stop.stop_type.value}; "
            f"city: {stop.city}; state: {stop.state}; "
            f"country: {stop.country}; zip: {stop.zip_code}; "
            f"date: {stop.stop_date}"
        )

    history = LoadHistory(load_id=db_load.id, description=history_desc, author=author)
    db.add(history)
    db.commit()
    db.refresh(db_load)
    return db_load


def update_load(db: Session, load_id: int, load_in: LoadUpdate, author: str = "System") -> Optional[Load]:
    db_load = db.query(Load).filter(Load.id == load_id).first()
    if not db_load:
        return None

    from app.services.driver_pay_service import take_snapshot, is_locked
    update_data = load_in.model_dump(exclude_unset=True, exclude={"stops"})
    driver_changed = "driver_id" in update_data and update_data["driver_id"] != db_load.driver_id
    for key, value in update_data.items():
        setattr(db_load, key, value)

    if load_in.stops is not None:
        db.query(LoadStop).filter(LoadStop.load_id == load_id).delete()
        for stop_data in load_in.stops:
            stop = LoadStop(load_id=load_id, **stop_data.model_dump())
            db.add(stop)

    # If driver changed on an unlocked load, retake compensation snapshot
    if driver_changed and not is_locked(db_load):
        db.flush()
        take_snapshot(db, db_load)

    history = LoadHistory(
        load_id=load_id,
        description=f"Load #{db_load.load_number} was updated by {author}",
        author=author
    )
    db.add(history)
    db.commit()
    db.refresh(db_load)
    return db_load


def delete_load(db: Session, load_id: int) -> bool:
    db_load = db.query(Load).filter(Load.id == load_id).first()
    if not db_load:
        return False
    db_load.is_active = False
    db.commit()
    return True


def add_service(db: Session, load_id: int, service_in: LoadServiceCreate) -> LoadService:
    service = LoadService(load_id=load_id, **service_in.model_dump())
    db.add(service)

    db_load = db.query(Load).filter(Load.id == load_id).first()
    history = LoadHistory(
        load_id=load_id,
        description=f"Service added: {service_in.service_type.value} - ${service_in.invoice_amount:.2f}",
        author="System"
    )
    db.add(history)
    db.commit()
    db.refresh(service)
    return service


def delete_service(db: Session, service_id: int) -> bool:
    svc = db.query(LoadService).filter(LoadService.id == service_id).first()
    if not svc:
        return False
    db.delete(svc)
    db.commit()
    return True


def add_note(db: Session, load_id: int, note_in: LoadNoteCreate) -> LoadNote:
    note = LoadNote(load_id=load_id, **note_in.model_dump())
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


def save_document(db: Session, load_id: int, document_type: str, filename: str,
                  original_filename: str, file_path: str, file_size: int, notes: str = None) -> LoadDocument:
    from app.models.models import DocumentType as DT
    doc = LoadDocument(
        load_id=load_id,
        document_type=document_type,
        filename=filename,
        original_filename=original_filename,
        file_path=file_path,
        file_size=file_size,
        notes=notes
    )
    db.add(doc)
    history = LoadHistory(
        load_id=load_id,
        description=f"Document uploaded: {document_type} - {original_filename}",
        author="System"
    )
    db.add(history)
    db.commit()
    db.refresh(doc)
    return doc


def delete_document(db: Session, doc_id: int) -> bool:
    doc = db.query(LoadDocument).filter(LoadDocument.id == doc_id).first()
    if not doc:
        return False
    if doc.file_path and os.path.exists(doc.file_path):
        os.remove(doc.file_path)
    db.delete(doc)
    db.commit()
    return True
