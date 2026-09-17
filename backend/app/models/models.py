from sqlalchemy import (
    Column, Integer, String, Float, Date, DateTime, Text,
    ForeignKey, Boolean, Enum as SAEnum, func, UniqueConstraint, JSON
)
from sqlalchemy.orm import relationship
from app.db.session import Base
import enum


def enum_column(enum_cls, enum_name: str):
    return SAEnum(
        enum_cls,
        name=enum_name,
        values_callable=lambda x: [e.value for e in x],
        validate_strings=True,
    )


class Company(Base):
    """A tenant: one trucking company using the product."""
    __tablename__ = "companies"

    id = Column(Integer, primary_key=True)
    name = Column(String(200), nullable=False)
    week_start_day = Column(Integer, default=5, nullable=False)   # 0=Mon … 5=Sat
    created_at = Column(DateTime, server_default=func.now())


class LoadStatus(str, enum.Enum):
    NEW = "New"
    CANCELED = "Canceled"
    TONU = "TONU"
    DISPATCHED = "Dispatched"
    EN_ROUTE = "En Route"
    PICKED_UP = "Picked-up"
    DELIVERED = "Delivered"
    CLOSED = "Closed"


class BillingStatus(str, enum.Enum):
    PENDING = "Pending"
    CANCELED = "Canceled"
    BOL_RECEIVED = "BOL received"
    INVOICED = "Invoiced"
    SENT_TO_FACTORING = "Sent to factoring"
    FUNDED = "Funded"
    PAID = "Paid"


class StopType(str, enum.Enum):
    PICKUP = "pickup"
    DELIVERY = "delivery"
    OTHER = "other"


class ServiceType(str, enum.Enum):
    LUMPER = "Lumper"
    DETENTION = "Detention"
    OTHER = "Other"


class DocumentType(str, enum.Enum):
    CONFIRMATION = "Confirmation"
    BOL = "BOL"
    OTHER = "Other"


class Driver(Base):
    __tablename__ = "drivers"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True, index=True)
    name = Column(String(200), nullable=False)
    phone = Column(String(50))
    email = Column(String(200))
    license_number = Column(String(100))
    is_active = Column(Boolean, default=True)
    driver_type = Column(String(50), default="Drv")
    pay_rate_loaded = Column(Float, default=0.65)
    pay_rate_empty = Column(Float, default=0.30)
    created_at = Column(DateTime, server_default=func.now())
    # Weekly statement pay rule (Excel: 30% of gross, $0.55 per total mile, or none)
    pay_type = Column(String(20), default="percent")   # percent | per_mile | none
    pay_pct = Column(Float, default=30.0)
    per_mile_rate = Column(Float, default=0.55)

    loads = relationship("Load", back_populates="driver")
    weekly_deductions = relationship("DriverDeduction", back_populates="driver", cascade="all, delete-orphan")


class Truck(Base):
    __tablename__ = "trucks"
    __table_args__ = (UniqueConstraint("company_id", "unit_number", name="uq_truck_unit_per_company"),)

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True, index=True)
    unit_number = Column(String(50), nullable=False)
    make = Column(String(100))
    model = Column(String(100))
    year = Column(Integer)
    vin = Column(String(100))
    eld_provider = Column(String(100))
    eld_id = Column(String(100))
    ownership = Column(String(50), default='Owned')
    driver_id = Column(Integer, ForeignKey("drivers.id"), nullable=True)
    plate = Column(String(50))
    plate_state = Column(String(10))
    purchase_date = Column(Date, nullable=True)
    purchase_price = Column(Float, nullable=True)
    notes = Column(Text)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    # Weekly statement rules (Excel: fee % of gross, fixed deduction template)
    fee_pct = Column(Float, default=0.0)
    carry_negative = Column(Boolean, default=True)

    loads = relationship("Load", back_populates="truck")
    driver = relationship("Driver", foreign_keys=[driver_id])
    documents = relationship("TruckDocument", back_populates="truck", cascade="all, delete-orphan")
    deductions = relationship("TruckDeduction", back_populates="truck", cascade="all, delete-orphan", order_by="TruckDeduction.sort_order")


class Trailer(Base):
    __tablename__ = "trailers"
    __table_args__ = (UniqueConstraint("company_id", "unit_number", name="uq_trailer_unit_per_company"),)

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True, index=True)
    unit_number = Column(String(50), nullable=False)
    trailer_type = Column(String(100))
    make = Column(String(100))
    model = Column(String(100))
    year = Column(Integer)
    vin = Column(String(100))
    ownership = Column(String(50), default='Owned')
    driver_id = Column(Integer, ForeignKey("drivers.id"), nullable=True)
    plate = Column(String(50))
    plate_state = Column(String(10))
    purchase_date = Column(Date, nullable=True)
    purchase_price = Column(Float, nullable=True)
    notes = Column(Text)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())

    loads = relationship("Load", back_populates="trailer")
    driver = relationship("Driver", foreign_keys=[driver_id])
    documents = relationship("TrailerDocument", back_populates="trailer", cascade="all, delete-orphan")


class TruckDocument(Base):
    __tablename__ = "truck_documents"

    id = Column(Integer, primary_key=True, index=True)
    truck_id = Column(Integer, ForeignKey("trucks.id"), nullable=False)
    doc_type = Column(String(100), nullable=False)  # annual_inspection, registration, repairs, other
    issue_date = Column(Date, nullable=True)
    exp_date = Column(Date, nullable=True)
    name = Column(String(200))
    notes = Column(Text)
    file_path = Column(String(500))
    original_filename = Column(String(200))
    created_at = Column(DateTime, server_default=func.now())

    truck = relationship("Truck", back_populates="documents")


class TrailerDocument(Base):
    __tablename__ = "trailer_documents"

    id = Column(Integer, primary_key=True, index=True)
    trailer_id = Column(Integer, ForeignKey("trailers.id"), nullable=False)
    doc_type = Column(String(100), nullable=False)
    issue_date = Column(Date, nullable=True)
    exp_date = Column(Date, nullable=True)
    name = Column(String(200))
    notes = Column(Text)
    file_path = Column(String(500))
    original_filename = Column(String(200))
    created_at = Column(DateTime, server_default=func.now())

    trailer = relationship("Trailer", back_populates="documents")


class CompanySettings(Base):
    __tablename__ = "company_settings"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), default='Karvan')
    legal_name = Column(String(200))
    mc_number = Column(String(50))
    dot_number = Column(String(50))
    address = Column(String(300))
    city = Column(String(100))
    state = Column(String(50))
    zip_code = Column(String(20))
    phone = Column(String(50))
    email = Column(String(200))
    website = Column(String(200))
    logo_path = Column(String(500))
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class Broker(Base):
    __tablename__ = "brokers"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True, index=True)
    name = Column(String(200), nullable=False)
    mc_number = Column(String(50))
    dot_number = Column(String(50))
    address = Column(String(500))
    address2 = Column(String(500))
    city = Column(String(100))
    state = Column(String(50))
    zip_code = Column(String(20))
    phone = Column(String(50))
    email = Column(String(200))
    fid_ein = Column(String(50))
    notes = Column(Text)

    # Type flags — a broker row can represent a broker, a shipper/receiver, or both.
    is_broker = Column(Boolean, default=True, nullable=False)
    is_shipper_receiver = Column(Boolean, default=False, nullable=False)

    # Billing / credit
    factoring = Column(Boolean, default=False)
    factoring_company = Column(String(200))
    quickpay_fee = Column(Float)
    credit = Column(String(10))              # A / B / C grade
    avg_days_to_pay = Column(Integer)
    status = Column(String(20), default="Pending", nullable=False)  # Pending / Approved / No buy
    pay_terms = Column(String(100))

    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())

    loads = relationship("Load", back_populates="broker")


class Dispatcher(Base):
    __tablename__ = "dispatchers"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True, index=True)
    name = Column(String(200), nullable=False)
    email = Column(String(200))
    phone = Column(String(50))
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    # Weekly commission (Excel "Office" sheet): percent of the week's gross, or a flat amount
    commission_type = Column(String(10), default="pct")   # pct | flat
    commission_value = Column(Float, default=0.0)

    loads = relationship("Load", back_populates="dispatcher")


class Load(Base):
    __tablename__ = "loads"
    __table_args__ = (UniqueConstraint("company_id", "load_number", name="uq_load_number_per_company"),)

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True, index=True)
    load_number = Column(Integer, nullable=False)
    status = Column(enum_column(LoadStatus, "loadstatus"), default=LoadStatus.NEW, nullable=False)
    billing_status = Column(enum_column(BillingStatus, "billingstatus"), default=BillingStatus.PENDING, nullable=False)
    load_date = Column(Date, nullable=False)
    actual_delivery_date = Column(Date)
    rate = Column(Float, default=0.0)
    total_miles = Column(Integer, default=0)
    loaded_miles = Column(Integer, default=0)
    empty_miles = Column(Integer, default=0)
    po_number = Column(String(100))
    notes = Column(Text)
    is_active = Column(Boolean, default=True)
    direct_billing = Column(Boolean, default=False)
    # Saturday of the weekly statement this load is filed in; empty means "the week of the pickup date"
    statement_week = Column(Date, nullable=True, index=True)

    driver_id = Column(Integer, ForeignKey("drivers.id"))
    truck_id = Column(Integer, ForeignKey("trucks.id"))
    trailer_id = Column(Integer, ForeignKey("trailers.id"))
    broker_id = Column(Integer, ForeignKey("brokers.id"))
    dispatcher_id = Column(Integer, ForeignKey("dispatchers.id"))

    # ── Historical compensation snapshot ──────────────────────────────────────
    pay_type_snapshot = Column(String(50), nullable=True)
    payable_to_snapshot = Column(String(200), nullable=True)
    pay_rate_loaded_snapshot = Column(Float, nullable=True)
    pay_rate_empty_snapshot = Column(Float, nullable=True)
    freight_percentage_snapshot = Column(Float, nullable=True)
    flatpay_snapshot = Column(Float, nullable=True)
    extra_stop_rate_snapshot = Column(Float, nullable=True)
    extra_stop_count_snapshot = Column(Integer, nullable=True)
    drivers_payable_snapshot = Column(Float, nullable=True)
    snapshot_taken_at = Column(DateTime, nullable=True)
    quickpay_rate_snapshot = Column(Float, nullable=True)
    driver_pay_override = Column(JSON, nullable=True)
    snapshot_overridden = Column(Boolean, default=False)

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    driver = relationship("Driver", back_populates="loads")
    truck = relationship("Truck", back_populates="loads")
    trailer = relationship("Trailer", back_populates="loads")
    broker = relationship("Broker", back_populates="loads")
    dispatcher = relationship("Dispatcher", back_populates="loads")
    additional_payees = relationship("LoadAdditionalPayee", back_populates="load", cascade="all, delete-orphan")
    stops = relationship("LoadStop", back_populates="load", cascade="all, delete-orphan", order_by="LoadStop.stop_order")
    services = relationship("LoadService", back_populates="load", cascade="all, delete-orphan")
    documents = relationship("LoadDocument", back_populates="load", cascade="all, delete-orphan")
    history = relationship("LoadHistory", back_populates="load", cascade="all, delete-orphan", order_by="LoadHistory.created_at.desc()")
    notes_list = relationship("LoadNote", back_populates="load", cascade="all, delete-orphan")


    @property
    def quickpay_amount(self):
        from app.services.load_financials import quickpay_fee
        return quickpay_fee(self)

    @property
    def invoice_total(self):
        from app.services.load_financials import invoice_amount
        return invoice_amount(self)


class LoadStop(Base):
    __tablename__ = "load_stops"

    id = Column(Integer, primary_key=True, index=True)
    load_id = Column(Integer, ForeignKey("loads.id"), nullable=False)
    stop_type = Column(enum_column(StopType, "stoptype"), nullable=False)
    stop_order = Column(Integer, nullable=False)
    is_payable = Column(Boolean, default=False, nullable=False)
    title = Column(String(200), nullable=True)
    city = Column(String(100))
    state = Column(String(50))
    zip_code = Column(String(20))
    country = Column(String(50), default="US")
    stop_date = Column(Date)
    address = Column(String(500))
    notes = Column(Text)

    load = relationship("Load", back_populates="stops")


class LoadService(Base):
    __tablename__ = "load_services"

    id = Column(Integer, primary_key=True, index=True)
    load_id = Column(Integer, ForeignKey("loads.id"), nullable=False)
    service_type = Column(enum_column(ServiceType, "servicetype"), nullable=False)
    add_deduct = Column(String(10), default="Add")
    invoice_amount = Column(Float, default=0.0)
    drivers_payable = Column(Float, default=0.0)
    notes = Column(Text)
    created_at = Column(DateTime, server_default=func.now())

    load = relationship("Load", back_populates="services")


class LoadDocument(Base):
    __tablename__ = "load_documents"

    id = Column(Integer, primary_key=True, index=True)
    load_id = Column(Integer, ForeignKey("loads.id"), nullable=False)
    document_type = Column(enum_column(DocumentType, "documenttype"), nullable=False)
    filename = Column(String(500), nullable=False)
    original_filename = Column(String(500))
    file_path = Column(String(1000))
    file_size = Column(Integer)
    notes = Column(Text)
    uploaded_at = Column(DateTime, server_default=func.now())

    load = relationship("Load", back_populates="documents")


class LoadHistory(Base):
    __tablename__ = "load_history"

    id = Column(Integer, primary_key=True, index=True)
    load_id = Column(Integer, ForeignKey("loads.id"), nullable=False)
    description = Column(Text, nullable=False)
    author = Column(String(200))
    created_at = Column(DateTime, server_default=func.now())

    load = relationship("Load", back_populates="history")


class LoadNote(Base):
    __tablename__ = "load_notes"

    id = Column(Integer, primary_key=True, index=True)
    load_id = Column(Integer, ForeignKey("loads.id"), nullable=False)
    content = Column(Text, nullable=False)
    author = Column(String(200))
    created_at = Column(DateTime, server_default=func.now())

    load = relationship("Load", back_populates="notes_list")


class SettlementStatus(str, enum.Enum):
    PREPARING = "Preparing"
    READY = "Ready"
    SENT = "Sent"
    PAID = "Paid"
    VOID = "Void"


class Settlement(Base):
    __tablename__ = "settlements"

    id = Column(Integer, primary_key=True, index=True)
    settlement_number = Column(Integer, nullable=False, unique=True)
    driver_id = Column(Integer, ForeignKey("drivers.id"), nullable=False)
    payable_to = Column(String(200))
    status = Column(enum_column(SettlementStatus, "settlementstatus"), default=SettlementStatus.PREPARING)
    date = Column(Date, nullable=False)
    settlement_total = Column(Float, default=0.0)
    balance_due = Column(Float, default=0.0)
    notes = Column(Text)
    is_active = Column(Boolean, default=True)
    qb_exported = Column(Boolean, default=False)
    qb_exported_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    driver = relationship("Driver", foreign_keys=[driver_id])
    items = relationship("SettlementItem", back_populates="settlement", cascade="all, delete-orphan")
    payments = relationship("SettlementPayment", back_populates="settlement", cascade="all, delete-orphan")
    adjustments = relationship("SettlementAdjustment", back_populates="settlement", cascade="all, delete-orphan")
    history = relationship("SettlementHistory", back_populates="settlement", cascade="all, delete-orphan", order_by="SettlementHistory.created_at.desc()")
    legacy_advances = relationship("Payment", foreign_keys="Payment.applied_settlement_id", viewonly=True)
    outgoing_carryovers = relationship("PayrollCarryover", foreign_keys="PayrollCarryover.source_settlement_id")
    incoming_carryovers = relationship("PayrollCarryover", foreign_keys="PayrollCarryover.target_settlement_id")


class SettlementItem(Base):
    __tablename__ = "settlement_items"

    id = Column(Integer, primary_key=True, index=True)
    settlement_id = Column(Integer, ForeignKey("settlements.id"), nullable=False)
    load_id = Column(Integer, ForeignKey("loads.id"), nullable=True)
    item_type = Column(String(50), default="load")   # 'load' | 'addition' | 'deduction' | 'carryover'
    description = Column(Text)
    amount = Column(Float, default=0.0)
    # Snapshot of load state at time of settlement creation
    load_date = Column(Date, nullable=True)
    load_status = Column(String(50), nullable=True)
    load_billing_status = Column(String(50), nullable=True)
    load_pickup_city = Column(String(100), nullable=True)
    load_delivery_city = Column(String(100), nullable=True)
    amount_snapshot = Column(Float, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    settlement = relationship("Settlement", back_populates="items")
    load = relationship("Load")


class SettlementAdjustment(Base):
    """Manual additions and deductions to a settlement."""
    __tablename__ = "settlement_adjustments"
    __table_args__ = (UniqueConstraint("scheduled_transaction_id", "date", name="uq_scheduled_application_date"),)

    id = Column(Integer, primary_key=True, index=True)
    settlement_id = Column(Integer, ForeignKey("settlements.id"), nullable=False)
    adj_type = Column(String(20), nullable=False)   # 'addition' | 'deduction'
    date = Column(Date, nullable=True)
    category = Column(String(100), nullable=True)
    description = Column(Text, nullable=True)
    amount = Column(Float, default=0.0)
    advanced_payment_id = Column(Integer, ForeignKey("advanced_payments.id"), nullable=True)
    scheduled_transaction_id = Column(Integer, ForeignKey("driver_scheduled_transactions.id"), nullable=True)
    time_report_id = Column(Integer, ForeignKey("driver_time_reports.id"), unique=True, nullable=True)
    load_payee_id = Column(Integer, ForeignKey("load_additional_payees.id"), unique=True, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    settlement = relationship("Settlement", back_populates="adjustments")


class SettlementPayment(Base):
    __tablename__ = "settlement_payments"

    id = Column(Integer, primary_key=True, index=True)
    settlement_id = Column(Integer, ForeignKey("settlements.id"), nullable=False)
    payment_number = Column(String(50))
    description = Column(Text)
    amount = Column(Float, default=0.0)
    payment_date = Column(Date, nullable=True)
    is_carryover = Column(Boolean, default=False)
    created_at = Column(DateTime, server_default=func.now())

    settlement = relationship("Settlement", back_populates="payments")


class PayrollCarryover(Base):
    """A debt transfer, never a cash payment. Both sides are linked and auditable."""
    __tablename__ = "payroll_carryovers"

    id = Column(Integer, primary_key=True)
    source_settlement_id = Column(Integer, ForeignKey("settlements.id"), nullable=False, unique=True)
    target_settlement_id = Column(Integer, ForeignKey("settlements.id"), nullable=True)
    amount = Column(Float, nullable=False)
    date = Column(Date, nullable=False)
    created_at = Column(DateTime, server_default=func.now())


class SettlementHistory(Base):
    """Audit log for settlements."""
    __tablename__ = "settlement_history"

    id = Column(Integer, primary_key=True, index=True)
    settlement_id = Column(Integer, ForeignKey("settlements.id"), nullable=False)
    description = Column(Text, nullable=False)
    author = Column(String(200), nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    settlement = relationship("Settlement", back_populates="history")


class SettlementEmailLog(Base):
    __tablename__ = "settlement_email_logs"

    id = Column(Integer, primary_key=True, index=True)
    settlement_id = Column(Integer, ForeignKey("settlements.id"), nullable=False)
    to_email = Column(String(500))
    cc_email = Column(String(500))
    subject = Column(String(500))
    body = Column(Text)
    sent_at = Column(DateTime, server_default=func.now())
    sent_by = Column(String(200))


# ── User / Auth ────────────────────────────────────────────────────────────────

class UserRole(str, enum.Enum):
    ADMIN = "admin"
    DISPATCHER = "dispatcher"
    ACCOUNTANT = "accountant"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True, index=True)
    name = Column(String(200), nullable=False)
    email = Column(String(200), nullable=False, unique=True)
    hashed_password = Column(String(500), nullable=False)
    role = Column(enum_column(UserRole, "userrole"), default=UserRole.DISPATCHER, nullable=False)
    is_active = Column(Boolean, default=True)
    dispatcher_id = Column(Integer, ForeignKey("dispatchers.id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    last_login = Column(DateTime, nullable=True)

    dispatcher = relationship("Dispatcher", foreign_keys=[dispatcher_id])


class DriverDocType(str, enum.Enum):
    APPLICATION = "application"
    CDL = "cdl"
    MEDICAL_CARD = "medical_card"
    DRUG_TEST = "drug_test"
    MVR = "mvr"
    SSN_CARD = "ssn_card"
    EMPLOYMENT_VERIFICATION = "employment_verification"
    OTHER = "other"


class DriverDocument(Base):
    __tablename__ = "driver_documents"

    id = Column(Integer, primary_key=True, index=True)
    driver_id = Column(Integer, ForeignKey("drivers.id"), nullable=False)
    doc_type = Column(enum_column(DriverDocType, "driverdoctype"), nullable=False)
    status = Column(String(100), nullable=True)
    number = Column(String(100), nullable=True)
    state = Column(String(10), nullable=True)
    application_date = Column(Date, nullable=True)
    hire_date = Column(Date, nullable=True)
    termination_date = Column(Date, nullable=True)
    issue_date = Column(Date, nullable=True)
    exp_date = Column(Date, nullable=True)
    notes = Column(Text, nullable=True)
    name = Column(String(200), nullable=True)
    filename = Column(String(500), nullable=True)
    original_filename = Column(String(500), nullable=True)
    file_path = Column(String(1000), nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    driver = relationship("Driver", foreign_keys=[driver_id])


class DriverProfile(Base):
    __tablename__ = "driver_profiles"

    id = Column(Integer, primary_key=True, index=True)
    driver_id = Column(Integer, ForeignKey("drivers.id"), nullable=False, unique=True)
    first_name = Column(String(100), nullable=True)
    last_name = Column(String(100), nullable=True)
    date_of_birth = Column(Date, nullable=True)
    hire_date = Column(Date, nullable=True)
    termination_date = Column(Date, nullable=True)
    address = Column(String(500), nullable=True)
    address2 = Column(String(500), nullable=True)
    city = Column(String(100), nullable=True)
    state = Column(String(50), nullable=True)
    zip_code = Column(String(20), nullable=True)
    payable_to = Column(String(200), nullable=True)
    co_driver_id = Column(Integer, ForeignKey("drivers.id"), nullable=True)
    truck_id = Column(Integer, ForeignKey("trucks.id"), nullable=True)
    trailer_id = Column(Integer, ForeignKey("trailers.id"), nullable=True)
    fuel_card = Column(String(100), nullable=True)
    ifta_handled = Column(Boolean, default=True)
    driver_status = Column(String(50), default="Applicant")
    pay_type = Column(String(50), default="per_mile")
    per_extra_stop = Column(Float, default=0.0)
    freight_percentage = Column(Float, default=0.0)
    flatpay = Column(Float, default=0.0)
    flatpay_period = Column(String(20), nullable=True)
    flatpay_start_date = Column(Date, nullable=True)
    hourly_rate = Column(Float, default=0.0)
    notes = Column(Text, nullable=True)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    driver = relationship("Driver", foreign_keys=[driver_id], backref="profile")
    co_driver = relationship("Driver", foreign_keys=[co_driver_id])
    truck = relationship("Truck", foreign_keys=[truck_id])
    trailer = relationship("Trailer", foreign_keys=[trailer_id])


# ── Vendors / Payable To ───────────────────────────────────────────────────────

class Vendor(Base):
    __tablename__ = "vendors"

    id = Column(Integer, primary_key=True, index=True)
    company_name = Column(String(200), nullable=False)
    vendor_type = Column(String(50), nullable=True)
    address = Column(String(500), nullable=True)
    address2 = Column(String(500), nullable=True)
    city = Column(String(100), nullable=True)
    state = Column(String(50), nullable=True)
    zip_code = Column(String(20), nullable=True)
    phone = Column(String(50), nullable=True)
    email = Column(String(200), nullable=True)
    fid_ein = Column(String(50), nullable=True)
    mc_number = Column(String(50), nullable=True)
    notes = Column(Text, nullable=True)
    is_equipment_owner = Column(Boolean, default=False)
    is_additional_payee = Column(Boolean, default=False)
    additional_payee_rate_pct = Column(Float, nullable=True)
    settlement_template_type = Column(String(100), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())


class DriverScheduledTransaction(Base):
    """Recurring payroll addition/deduction tied to a driver."""
    __tablename__ = "driver_scheduled_transactions"

    source_key = Column(String(100), unique=True, nullable=True)

    id = Column(Integer, primary_key=True, index=True)
    driver_id = Column(Integer, ForeignKey("drivers.id"), nullable=False)
    trans_type = Column(String(20), nullable=False)   # addition | deduction | loan | escrow
    category = Column(String(100), nullable=True)
    description = Column(Text, nullable=True)
    amount = Column(Float, default=0.0)
    deduct_by = Column(Float, nullable=True)
    schedule = Column(String(50), nullable=True)      # daily | weekly | biweekly | monthly | annually
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    repeat_type = Column(String(20), nullable=True)   # always | times | until
    repeat_times = Column(Integer, nullable=True)
    times_applied = Column(Integer, default=0)
    last_applied = Column(Date, nullable=True)
    next_due = Column(Date, nullable=True)
    is_active = Column(Boolean, default=True)
    payable_to = Column(String(200), nullable=True)
    settlement_description = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    driver = relationship("Driver", foreign_keys=[driver_id])


class Expense(Base):
    __tablename__ = "expenses"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True, index=True)
    expense_date = Column(Date, nullable=False)
    category = Column(String(100), nullable=False)
    amount = Column(Float, nullable=False)
    description = Column(Text)
    vendor_id = Column(Integer, ForeignKey("vendors.id"), nullable=True)
    truck_id = Column(Integer, ForeignKey("trucks.id"), nullable=True)
    driver_id = Column(Integer, ForeignKey("drivers.id"), nullable=True)
    receipt_path = Column(String(500))
    receipt_filename = Column(String(200))
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    vendor = relationship("Vendor")
    truck = relationship("Truck")
    driver = relationship("Driver")


class Invoice(Base):
    __tablename__ = "invoices"

    id = Column(Integer, primary_key=True, index=True)
    invoice_number = Column(Integer, unique=True, nullable=False, index=True)
    load_id = Column(Integer, ForeignKey("loads.id"), nullable=False)
    broker_id = Column(Integer, ForeignKey("brokers.id"), nullable=True)
    invoice_date = Column(Date, nullable=False)
    due_date = Column(Date, nullable=True)
    status = Column(String(50), default="Pending")  # Pending/Sent/Paid/Overdue
    amount = Column(Float, nullable=False)
    notes = Column(Text)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    load = relationship("Load")
    broker = relationship("Broker")


class Payment(Base):
    """
    Standalone Payments table — holds Advanced Payments, Settlement Payments, and other payments.
    - Advanced Payments are created here, then applied into a settlement via applied_settlement_id.
    - Settlement Payments are payments made against a specific settlement.
    """
    __tablename__ = "payments_new"

    id = Column(Integer, primary_key=True, index=True)
    payment_number = Column(Integer, unique=True, index=True)
    payment_type = Column(String(30), nullable=False)  # advanced_payment | settlement_payment | other
    driver_id = Column(Integer, ForeignKey("drivers.id"), nullable=True)
    vendor_id = Column(Integer, ForeignKey("vendors.id"), nullable=True)
    settlement_id = Column(Integer, ForeignKey("settlements.id"), nullable=True)
    applied_settlement_id = Column(Integer, ForeignKey("settlements.id"), nullable=True)
    payment_date = Column(Date, nullable=False)
    amount = Column(Float, nullable=False)
    description = Column(Text)
    payable_to = Column(String(200))
    notes = Column(Text)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    driver = relationship("Driver", foreign_keys=[driver_id])
    vendor = relationship("Vendor", foreign_keys=[vendor_id])
    settlement = relationship("Settlement", foreign_keys=[settlement_id])
    applied_settlement = relationship("Settlement", foreign_keys=[applied_settlement_id])


class AdvancedPayment(Base):
    """
    Advanced payments created in Payments module BEFORE a settlement.
    They are later applied/deducted inside a settlement.
    """
    __tablename__ = "advanced_payments"

    id = Column(Integer, primary_key=True, index=True)
    payment_number = Column(Integer, unique=True, nullable=False, index=True)
    driver_id = Column(Integer, ForeignKey("drivers.id"), nullable=False)
    vendor_id = Column(Integer, ForeignKey("vendors.id"), nullable=True)
    payment_date = Column(Date, nullable=False)
    amount = Column(Float, nullable=False)
    description = Column(Text)
    category = Column(String(100))
    applied_amount = Column(Float, default=0.0)
    applied_to_settlement_id = Column(Integer, ForeignKey("settlements.id"), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    driver = relationship("Driver", foreign_keys=[driver_id])
    vendor = relationship("Vendor", foreign_keys=[vendor_id])
    applied_to_settlement = relationship("Settlement", foreign_keys=[applied_to_settlement_id])


class DriverTimeReport(Base):
    __tablename__ = 'driver_time_reports'
    id = Column(Integer, primary_key=True)
    driver_id = Column(Integer, ForeignKey('drivers.id'), nullable=False)
    payable_to = Column(String(200), nullable=False)
    date = Column(Date, nullable=False)
    hours = Column(Float, nullable=False)
    hourly_rate = Column(Float, nullable=False)
    amount = Column(Float, nullable=False)
    description = Column(Text, nullable=True)
    request_key = Column(String(100), unique=True, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, server_default=func.now())


class ScheduledPayrollOccurrence(Base):
    __tablename__ = 'scheduled_payroll_occurrences'
    __table_args__ = (UniqueConstraint('scheduled_transaction_id', 'date', name='uq_payroll_occurrence_date'),)
    id = Column(Integer, primary_key=True)
    scheduled_transaction_id = Column(Integer, ForeignKey('driver_scheduled_transactions.id'), nullable=False)
    driver_id = Column(Integer, ForeignKey('drivers.id'), nullable=False)
    payable_to = Column(String(200), nullable=False)
    date = Column(Date, nullable=False)
    amount = Column(Float, nullable=False)
    adj_type = Column(String(20), nullable=False)
    category = Column(String(100), nullable=True)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())


class DriverAdditionalPayee(Base):
    __tablename__ = 'driver_additional_payees'
    __table_args__ = (UniqueConstraint('driver_id', 'vendor_id', name='uq_driver_additional_vendor'),)
    id = Column(Integer, primary_key=True)
    driver_id = Column(Integer, ForeignKey('drivers.id'), nullable=False)
    vendor_id = Column(Integer, ForeignKey('vendors.id'), nullable=False)
    rate_pct = Column(Float, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    vendor = relationship('Vendor')


class LoadAdditionalPayee(Base):
    __tablename__ = 'load_additional_payees'
    __table_args__ = (UniqueConstraint('load_id', 'vendor_id', name='uq_load_additional_vendor'),)
    id = Column(Integer, primary_key=True)
    load_id = Column(Integer, ForeignKey('loads.id'), nullable=False)
    driver_id = Column(Integer, ForeignKey('drivers.id'), nullable=False)
    vendor_id = Column(Integer, ForeignKey('vendors.id'), nullable=False)
    payable_to = Column(String(200), nullable=False)
    rate_pct = Column(Float, nullable=False)
    base_amount = Column(Float, nullable=False)
    amount = Column(Float, nullable=False)
    date = Column(Date, nullable=False)
    load = relationship('Load', back_populates='additional_payees')


# ── Weekly truck statements (Excel STATEMENTS workbook model) ─────────────────

class TruckDeduction(Base):
    """Fixed weekly deduction on a truck: cargo ins, ELD, safety, trailer, truck payment..."""
    __tablename__ = "truck_deductions"

    id = Column(Integer, primary_key=True)
    truck_id = Column(Integer, ForeignKey("trucks.id"), nullable=False)
    label = Column(String(120), nullable=False)
    amount = Column(Float, nullable=False, default=0.0)
    effective_from = Column(Date, nullable=True)
    effective_to = Column(Date, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    sort_order = Column(Integer, default=0)

    truck = relationship("Truck", back_populates="deductions")


class DriverDeduction(Base):
    """Fixed weekly deduction taken from the driver's payout (e.g. occupational health)."""
    __tablename__ = "driver_deductions"

    id = Column(Integer, primary_key=True)
    driver_id = Column(Integer, ForeignKey("drivers.id"), nullable=False)
    label = Column(String(120), nullable=False)
    amount = Column(Float, nullable=False, default=0.0)
    effective_from = Column(Date, nullable=True)
    effective_to = Column(Date, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)

    driver = relationship("Driver", back_populates="weekly_deductions")


class StatementStatus(str, enum.Enum):
    DRAFT = "draft"
    READY = "ready"
    PAID = "paid"


class TruckStatement(Base):
    """One truck, one Saturday–Friday week. Generated; only manual lines and odometer are typed."""
    __tablename__ = "truck_statements"
    __table_args__ = (UniqueConstraint("truck_id", "period_start", name="uq_truck_statement_week"),)

    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True, index=True)
    truck_id = Column(Integer, ForeignKey("trucks.id"), nullable=False)
    driver_id = Column(Integer, ForeignKey("drivers.id"), nullable=True)
    period_start = Column(Date, nullable=False)
    period_end = Column(Date, nullable=False)
    status = Column(String(10), default=StatementStatus.DRAFT.value, nullable=False)
    fee_pct = Column(Float, default=0.0)
    odometer_start = Column(Integer, nullable=True)
    odometer_end = Column(Integer, nullable=True)
    carry_enabled = Column(Boolean, default=True, nullable=False)
    # Calculated results (stored so the board is one query)
    gross = Column(Float, default=0.0)
    fee = Column(Float, default=0.0)
    deductions = Column(Float, default=0.0)
    driver_pay = Column(Float, default=0.0)
    driver_deductions = Column(Float, default=0.0)
    driver_payout = Column(Float, default=0.0)
    carry_in = Column(Float, default=0.0)
    net = Column(Float, default=0.0)
    ach_reference = Column(String(100), nullable=True)
    paid_at = Column(DateTime, nullable=True)
    notes = Column(Text)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    truck = relationship("Truck")
    driver = relationship("Driver")
    lines = relationship("StatementLine", back_populates="statement", cascade="all, delete-orphan", order_by="StatementLine.sort_order")


class StatementLine(Base):
    """Every row of the Excel block, with its source. Positive amount = deduction from gross."""
    __tablename__ = "statement_lines"

    id = Column(Integer, primary_key=True)
    statement_id = Column(Integer, ForeignKey("truck_statements.id"), nullable=False)
    kind = Column(String(20), nullable=False)   # load | fee | template | fuel | expense | driver_pay | driver_deduction | carry_in | manual
    label = Column(String(200), nullable=False)
    amount = Column(Float, nullable=False, default=0.0)
    load_id = Column(Integer, ForeignKey("loads.id"), nullable=True)
    expense_id = Column(Integer, ForeignKey("expenses.id"), nullable=True)
    sort_order = Column(Integer, default=0)

    statement = relationship("TruckStatement", back_populates="lines")
    load = relationship("Load")


class DispatcherPayout(Base):
    """A dispatcher's commission for one week, recorded when paid."""
    __tablename__ = "dispatcher_payouts"
    __table_args__ = (UniqueConstraint("dispatcher_id", "period_start", name="uq_dispatcher_week"),)

    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True, index=True)
    dispatcher_id = Column(Integer, ForeignKey("dispatchers.id"), nullable=False)
    period_start = Column(Date, nullable=False)
    gross = Column(Float, default=0.0)
    amount = Column(Float, default=0.0)
    paid_at = Column(DateTime, nullable=True)
    notes = Column(Text)


class RecurringBill(Base):
    """Monthly fixed bill (Excel "Dues" sheets): truck lease, office rent, Samsara, DAT..."""
    __tablename__ = "recurring_bills"

    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True, index=True)
    label = Column(String(200), nullable=False)
    vendor = Column(String(200))
    amount = Column(Float, nullable=False, default=0.0)
    due_day = Column(Integer, nullable=False, default=1)   # 1..31
    account = Column(String(100))                          # which bank account pays it
    truck_id = Column(Integer, ForeignKey("trucks.id"), nullable=True)
    notes = Column(Text)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    truck = relationship("Truck")
    payments = relationship("BillPayment", back_populates="bill", cascade="all, delete-orphan")


class BillPayment(Base):
    __tablename__ = "bill_payments"
    __table_args__ = (UniqueConstraint("bill_id", "month", name="uq_bill_month"),)

    id = Column(Integer, primary_key=True)
    bill_id = Column(Integer, ForeignKey("recurring_bills.id"), nullable=False)
    month = Column(String(7), nullable=False)   # YYYY-MM
    amount = Column(Float, nullable=False)
    paid_at = Column(DateTime, server_default=func.now())
    notes = Column(Text)

    bill = relationship("RecurringBill", back_populates="payments")


# ── Maintenance (Fleet Command Center model) ──────────────────────────────────

class OdometerReading(Base):
    __tablename__ = "truck_odometer_readings"

    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True, index=True)
    truck_id = Column(Integer, ForeignKey("trucks.id"), nullable=False, index=True)
    date = Column(Date, nullable=False)
    reading = Column(Integer, nullable=False)
    source = Column(String(50))       # statement | samsara | manual | import
    created_at = Column(DateTime, server_default=func.now())

    truck = relationship("Truck")


class ServiceInterval(Base):
    """Per company: how often each service is due, in miles and days, and when to warn."""
    __tablename__ = "service_intervals"
    __table_args__ = (UniqueConstraint("company_id", "service_type", name="uq_service_interval"),)

    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True, index=True)
    service_type = Column(String(50), nullable=False)
    miles = Column(Integer, default=0)          # 0 = not mileage based
    days = Column(Integer, default=0)           # 0 = not date based
    alert_miles = Column(Integer, default=0)
    alert_days = Column(Integer, default=0)
    sort_order = Column(Integer, default=0)


class TruckService(Base):
    """A service actually done: oil change on 8/10 at 412,500 mi for $425."""
    __tablename__ = "truck_services"

    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True, index=True)
    truck_id = Column(Integer, ForeignKey("trucks.id"), nullable=False, index=True)
    service_type = Column(String(50), nullable=False)
    date = Column(Date, nullable=False)
    odometer = Column(Integer, nullable=True)
    cost = Column(Float, default=0.0)
    vendor = Column(String(200))
    notes = Column(Text)
    expense_id = Column(Integer, ForeignKey("expenses.id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    truck = relationship("Truck")
