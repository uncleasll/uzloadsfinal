from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import date, datetime
from app.models.models import LoadStatus, BillingStatus, StopType, ServiceType, DocumentType


# ─── Driver ───────────────────────────────────────────────────────────────────

class DriverBase(BaseModel):
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    license_number: Optional[str] = None
    driver_type: Optional[str] = "Drv"
    pay_rate_loaded: Optional[float] = 0.65
    pay_rate_empty: Optional[float] = 0.30
    is_active: Optional[bool] = True


class DriverCreate(DriverBase):
    pass


class DriverUpdate(DriverBase):
    name: Optional[str] = None


class DriverOut(DriverBase):
    id: int
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ─── Truck ────────────────────────────────────────────────────────────────────

class TruckDocumentOut(BaseModel):
    id: int
    truck_id: int
    doc_type: str
    issue_date: Optional[date] = None
    exp_date: Optional[date] = None
    name: Optional[str] = None
    notes: Optional[str] = None
    file_path: Optional[str] = None
    original_filename: Optional[str] = None
    created_at: Optional[datetime] = None
    class Config:
        from_attributes = True


class TruckBase(BaseModel):
    unit_number: str
    make: Optional[str] = None
    model: Optional[str] = None
    year: Optional[int] = None
    vin: Optional[str] = None
    eld_provider: Optional[str] = None
    eld_id: Optional[str] = None
    ownership: Optional[str] = 'Owned'
    driver_id: Optional[int] = None
    plate: Optional[str] = None
    plate_state: Optional[str] = None
    purchase_date: Optional[date] = None
    purchase_price: Optional[float] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = True


class TruckCreate(TruckBase):
    pass


class TruckUpdate(TruckBase):
    unit_number: Optional[str] = None


class DriverSimple(BaseModel):
    id: int
    name: str
    driver_type: str
    class Config:
        from_attributes = True


class TruckOut(TruckBase):
    id: int
    created_at: Optional[datetime] = None
    driver: Optional[DriverSimple] = None
    documents: List[TruckDocumentOut] = []

    class Config:
        from_attributes = True


# ─── Trailer ──────────────────────────────────────────────────────────────────

class TrailerDocumentOut(BaseModel):
    id: int
    trailer_id: int
    doc_type: str
    issue_date: Optional[date] = None
    exp_date: Optional[date] = None
    name: Optional[str] = None
    notes: Optional[str] = None
    file_path: Optional[str] = None
    original_filename: Optional[str] = None
    created_at: Optional[datetime] = None
    class Config:
        from_attributes = True


class TrailerBase(BaseModel):
    unit_number: str
    trailer_type: Optional[str] = None
    make: Optional[str] = None
    model: Optional[str] = None
    year: Optional[int] = None
    vin: Optional[str] = None
    ownership: Optional[str] = 'Owned'
    driver_id: Optional[int] = None
    plate: Optional[str] = None
    plate_state: Optional[str] = None
    purchase_date: Optional[date] = None
    purchase_price: Optional[float] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = True


class TrailerCreate(TrailerBase):
    pass


class TrailerUpdate(TrailerBase):
    unit_number: Optional[str] = None


class TrailerOut(TrailerBase):
    id: int
    created_at: Optional[datetime] = None
    driver: Optional[DriverSimple] = None
    documents: List[TrailerDocumentOut] = []

    class Config:
        from_attributes = True


# ─── Broker ───────────────────────────────────────────────────────────────────

class BrokerBase(BaseModel):
    name: str
    mc_number: Optional[str] = None
    dot_number: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    factoring: Optional[bool] = False
    factoring_company: Optional[str] = None
    is_active: Optional[bool] = True


class BrokerCreate(BrokerBase):
    pass


class BrokerUpdate(BrokerBase):
    name: Optional[str] = None


class BrokerOut(BrokerBase):
    id: int
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ─── Dispatcher ───────────────────────────────────────────────────────────────

class DispatcherBase(BaseModel):
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    is_active: Optional[bool] = True


class DispatcherCreate(DispatcherBase):
    pass


class DispatcherUpdate(DispatcherBase):
    name: Optional[str] = None


class DispatcherOut(DispatcherBase):
    id: int

    class Config:
        from_attributes = True


# ─── Load Stop ────────────────────────────────────────────────────────────────

class LoadStopBase(BaseModel):
    stop_type: StopType
    stop_order: int
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    country: Optional[str] = "US"
    stop_date: Optional[date] = None
    address: Optional[str] = None
    notes: Optional[str] = None


class LoadStopCreate(LoadStopBase):
    pass


class LoadStopOut(LoadStopBase):
    id: int

    class Config:
        from_attributes = True


# ─── Load Service ─────────────────────────────────────────────────────────────

class LoadServiceBase(BaseModel):
    service_type: ServiceType
    add_deduct: Optional[str] = "Add"
    invoice_amount: Optional[float] = 0.0
    drivers_payable: Optional[float] = 0.0
    notes: Optional[str] = None


class LoadServiceCreate(LoadServiceBase):
    pass


class LoadServiceOut(LoadServiceBase):
    id: int
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ─── Load Document ────────────────────────────────────────────────────────────

class LoadDocumentOut(BaseModel):
    id: int
    document_type: DocumentType
    filename: str
    original_filename: Optional[str] = None
    file_size: Optional[int] = None
    notes: Optional[str] = None
    uploaded_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ─── Load History ─────────────────────────────────────────────────────────────

class LoadHistoryOut(BaseModel):
    id: int
    description: str
    author: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ─── Load Note ────────────────────────────────────────────────────────────────

class LoadNoteCreate(BaseModel):
    content: str
    author: Optional[str] = None


class LoadNoteOut(BaseModel):
    id: int
    content: str
    author: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ─── Load ─────────────────────────────────────────────────────────────────────

class LoadCreate(BaseModel):
    status: Optional[LoadStatus] = LoadStatus.NEW
    billing_status: Optional[BillingStatus] = BillingStatus.PENDING
    load_date: date
    actual_delivery_date: Optional[date] = None
    rate: Optional[float] = 0.0
    total_miles: Optional[int] = 0
    loaded_miles: Optional[int] = 0
    empty_miles: Optional[int] = 0
    po_number: Optional[str] = None
    notes: Optional[str] = None
    direct_billing: Optional[bool] = False
    driver_id: Optional[int] = None
    truck_id: Optional[int] = None
    trailer_id: Optional[int] = None
    broker_id: Optional[int] = None
    dispatcher_id: Optional[int] = None
    stops: Optional[List[LoadStopCreate]] = []


class LoadUpdate(BaseModel):
    status: Optional[LoadStatus] = None
    billing_status: Optional[BillingStatus] = None
    load_date: Optional[date] = None
    actual_delivery_date: Optional[date] = None
    rate: Optional[float] = None
    total_miles: Optional[int] = None
    loaded_miles: Optional[int] = None
    empty_miles: Optional[int] = None
    po_number: Optional[str] = None
    notes: Optional[str] = None
    direct_billing: Optional[bool] = None
    driver_id: Optional[int] = None
    truck_id: Optional[int] = None
    trailer_id: Optional[int] = None
    broker_id: Optional[int] = None
    dispatcher_id: Optional[int] = None
    stops: Optional[List[LoadStopCreate]] = None


class LoadOut(BaseModel):
    id: int
    load_number: int
    status: LoadStatus
    billing_status: BillingStatus
    load_date: date
    actual_delivery_date: Optional[date] = None
    rate: float
    total_miles: int
    loaded_miles: int
    empty_miles: int
    po_number: Optional[str] = None
    notes: Optional[str] = None
    direct_billing: bool
    is_active: bool
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    pay_type_snapshot: Optional[str] = None
    pay_rate_loaded_snapshot: Optional[float] = None
    pay_rate_empty_snapshot: Optional[float] = None
    freight_percentage_snapshot: Optional[float] = None
    flatpay_snapshot: Optional[float] = None
    drivers_payable_snapshot: Optional[float] = None
    snapshot_taken_at: Optional[datetime] = None
    snapshot_overridden: bool = False
    driver: Optional[DriverOut] = None
    truck: Optional[TruckOut] = None
    trailer: Optional[TrailerOut] = None
    broker: Optional[BrokerOut] = None
    dispatcher: Optional[DispatcherOut] = None
    stops: List[LoadStopOut] = []
    services: List[LoadServiceOut] = []
    documents: List[LoadDocumentOut] = []
    history: List[LoadHistoryOut] = []
    notes_list: List[LoadNoteOut] = []

    class Config:
        from_attributes = True


class LoadListOut(BaseModel):
    id: int
    load_number: int
    status: LoadStatus
    billing_status: BillingStatus
    load_date: date
    actual_delivery_date: Optional[date] = None
    rate: float
    total_miles: int
    loaded_miles: int
    empty_miles: int
    po_number: Optional[str] = None
    is_active: bool
    drivers_payable_snapshot: Optional[float] = None
    driver: Optional[DriverOut] = None
    truck: Optional[TruckOut] = None
    trailer: Optional[TrailerOut] = None
    broker: Optional[BrokerOut] = None
    dispatcher: Optional[DispatcherOut] = None
    stops: List[LoadStopOut] = []
    services: List[LoadServiceOut] = []
    documents: List[LoadDocumentOut] = []

    class Config:
        from_attributes = True


# ─── Pagination ───────────────────────────────────────────────────────────────

class PaginatedResponse(BaseModel):
    items: List
    total: int
    page: int
    page_size: int
    total_pages: int
    total_rate: float = 0.0
    invoiced_total: float = 0.0
    pending_total: float = 0.0
