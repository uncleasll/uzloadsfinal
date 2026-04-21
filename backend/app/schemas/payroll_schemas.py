from pydantic import BaseModel
from typing import Optional, List
from datetime import date, datetime
from app.models.models import SettlementStatus


class SettlementAdjustmentCreate(BaseModel):
    adj_type: str   # 'addition' | 'deduction'
    date: Optional[date] = None
    category: Optional[str] = None
    description: Optional[str] = None
    amount: float


class SettlementAdjustmentOut(BaseModel):
    id: int
    adj_type: str
    date: Optional[date] = None
    category: Optional[str] = None
    description: Optional[str] = None
    amount: float
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class SettlementPaymentCreate(BaseModel):
    payment_number: Optional[str] = None
    description: Optional[str] = None
    amount: float
    payment_date: Optional[date] = None
    is_carryover: bool = False


class SettlementPaymentOut(BaseModel):
    id: int
    payment_number: Optional[str] = None
    description: Optional[str] = None
    amount: float
    payment_date: Optional[date] = None
    is_carryover: bool = False
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class SettlementItemOut(BaseModel):
    id: int
    load_id: Optional[int] = None
    item_type: str
    description: Optional[str] = None
    amount: float
    load_date: Optional[date] = None
    load_status: Optional[str] = None
    load_billing_status: Optional[str] = None
    load_pickup_city: Optional[str] = None
    load_delivery_city: Optional[str] = None
    amount_snapshot: Optional[float] = None
    created_at: Optional[datetime] = None
    load: Optional[dict] = None

    class Config:
        from_attributes = True


class SettlementHistoryOut(BaseModel):
    id: int
    description: str
    author: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class SettlementCreate(BaseModel):
    driver_id: int
    payable_to: Optional[str] = None
    status: Optional[SettlementStatus] = SettlementStatus.PREPARING
    date: date
    notes: Optional[str] = None


class SettlementUpdate(BaseModel):
    driver_id: Optional[int] = None
    payable_to: Optional[str] = None
    status: Optional[SettlementStatus] = None
    date: Optional[date] = None
    notes: Optional[str] = None


class SettlementOut(BaseModel):
    id: int
    settlement_number: int
    driver_id: int
    payable_to: Optional[str] = None
    status: SettlementStatus
    date: date
    settlement_total: float
    balance_due: float
    notes: Optional[str] = None
    qb_exported: bool = False
    qb_exported_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    driver: Optional[dict] = None
    items: List[SettlementItemOut] = []
    adjustments: List[SettlementAdjustmentOut] = []
    payments: List[SettlementPaymentOut] = []
    history: List[SettlementHistoryOut] = []

    class Config:
        from_attributes = True


class SettlementListOut(BaseModel):
    id: int
    settlement_number: int
    driver_id: int
    payable_to: Optional[str] = None
    status: SettlementStatus
    date: date
    settlement_total: float
    balance_due: float
    qb_exported: bool = False
    driver: Optional[dict] = None

    class Config:
        from_attributes = True


class OpenBalanceItem(BaseModel):
    driver_id: int
    driver_name: str
    driver_type: str
    payable_to: str
    balance: float
    updated: Optional[date] = None


class ReportFilter(BaseModel):
    period: Optional[str] = "last_30_days"
    date_from: Optional[date] = None
    date_to: Optional[date] = None
    broker_id: Optional[int] = None
    driver_id: Optional[int] = None
    truck_id: Optional[int] = None
    group_by: Optional[str] = "none"
    date_type: Optional[str] = "pickup"
    statuses: Optional[List[str]] = None
    billing_statuses: Optional[List[str]] = None
