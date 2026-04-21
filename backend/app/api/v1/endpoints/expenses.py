"""
Expenses endpoint - full CRUD + categories for P&L report
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from typing import Optional, List
from datetime import date
from app.db.session import get_db
from app.models.models import Expense, Vendor, Driver, Truck

router = APIRouter(prefix="/expenses", tags=["expenses"])

EXPENSE_CATEGORIES = [
    "Fuel", "Maintenance", "Repairs", "Tires", "Insurance",
    "Tolls", "Parking", "Permits", "Office Expenses",
    "Legal & Professional", "Software", "Telephone", "Supplies",
    "Travel", "Truck Registration", "IFTA Tax", "Factoring Fee", "Other"
]


def _serialize(e: Expense) -> dict:
    return {
        "id": e.id,
        "expense_date": e.expense_date.isoformat() if e.expense_date else None,
        "category": e.category,
        "amount": e.amount,
        "description": e.description,
        "vendor_id": e.vendor_id,
        "vendor": {"id": e.vendor.id, "name": e.vendor.company_name} if e.vendor else None,
        "truck_id": e.truck_id,
        "truck": {"id": e.truck.id, "unit_number": e.truck.unit_number} if e.truck else None,
        "driver_id": e.driver_id,
        "driver": {"id": e.driver.id, "name": e.driver.name} if e.driver else None,
        "receipt_path": e.receipt_path,
        "receipt_filename": e.receipt_filename,
        "created_at": e.created_at.isoformat() if e.created_at else None,
    }


@router.get("/categories")
def list_categories():
    return EXPENSE_CATEGORIES


@router.get("")
def list_expenses(
    page: int = 1,
    page_size: int = 50,
    category: Optional[str] = None,
    vendor_id: Optional[int] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: Session = Depends(get_db),
):
    q = db.query(Expense).options(
        joinedload(Expense.vendor),
        joinedload(Expense.truck),
        joinedload(Expense.driver),
    ).filter(Expense.is_active == True)

    if category:
        q = q.filter(Expense.category == category)
    if vendor_id:
        q = q.filter(Expense.vendor_id == vendor_id)
    if date_from:
        q = q.filter(Expense.expense_date >= date_from)
    if date_to:
        q = q.filter(Expense.expense_date <= date_to)

    total = q.count()
    total_amount = q.with_entities(func.coalesce(func.sum(Expense.amount), 0.0)).scalar() or 0.0
    items = (q.order_by(Expense.expense_date.desc())
              .offset((page-1)*page_size).limit(page_size).all())
    return {
        "items": [_serialize(e) for e in items],
        "total": total,
        "total_amount": total_amount,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
    }


@router.get("/summary")
def category_summary(
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: Session = Depends(get_db),
):
    q = db.query(Expense.category, func.sum(Expense.amount).label('total'))\
          .filter(Expense.is_active == True)
    if date_from: q = q.filter(Expense.expense_date >= date_from)
    if date_to:   q = q.filter(Expense.expense_date <= date_to)
    rows = q.group_by(Expense.category).all()
    return [{"category": r[0], "amount": float(r[1] or 0)} for r in rows]


@router.get("/{expense_id}")
def get_expense(expense_id: int, db: Session = Depends(get_db)):
    e = db.query(Expense).options(
        joinedload(Expense.vendor), joinedload(Expense.truck), joinedload(Expense.driver)
    ).filter(Expense.id == expense_id, Expense.is_active == True).first()
    if not e:
        raise HTTPException(404, "Expense not found")
    return _serialize(e)


@router.post("", status_code=201)
def create_expense(data: dict, db: Session = Depends(get_db)):
    allowed = ["expense_date","category","amount","description","vendor_id","truck_id","driver_id","receipt_path","receipt_filename"]
    payload = {k: v for k, v in data.items() if k in allowed}
    if not payload.get("expense_date"):
        raise HTTPException(400, "expense_date required")
    if not payload.get("category"):
        raise HTTPException(400, "category required")
    if not payload.get("amount") or float(payload["amount"]) <= 0:
        raise HTTPException(400, "amount must be > 0")

    exp = Expense(**payload)
    db.add(exp)
    db.commit()
    db.refresh(exp)
    return _serialize(exp)


@router.put("/{expense_id}")
def update_expense(expense_id: int, data: dict, db: Session = Depends(get_db)):
    e = db.query(Expense).filter(Expense.id == expense_id).first()
    if not e:
        raise HTTPException(404, "Expense not found")
    allowed = ["expense_date","category","amount","description","vendor_id","truck_id","driver_id","receipt_path","receipt_filename"]
    for k, v in data.items():
        if k in allowed:
            setattr(e, k, v)
    db.commit()
    db.refresh(e)
    return _serialize(e)


@router.delete("/{expense_id}")
def delete_expense(expense_id: int, db: Session = Depends(get_db)):
    e = db.query(Expense).filter(Expense.id == expense_id).first()
    if not e:
        raise HTTPException(404, "Expense not found")
    e.is_active = False
    db.commit()
    return {"message": "Deleted"}
