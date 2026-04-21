"""
Invoices endpoint - create invoice from load, list, email, mark paid
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from typing import Optional
from datetime import date, timedelta
from app.db.session import get_db
from app.models.models import Invoice, Load, Broker

router = APIRouter(prefix="/invoices", tags=["invoices"])

INVOICE_STATUSES = ["Pending", "Sent", "Paid", "Overdue"]


def _serialize(inv: Invoice) -> dict:
    return {
        "id": inv.id,
        "invoice_number": inv.invoice_number,
        "load_id": inv.load_id,
        "load_number": inv.load.load_number if inv.load else None,
        "broker_id": inv.broker_id,
        "broker_name": inv.broker.name if inv.broker else None,
        "invoice_date": inv.invoice_date.isoformat() if inv.invoice_date else None,
        "due_date": inv.due_date.isoformat() if inv.due_date else None,
        "status": inv.status,
        "amount": inv.amount,
        "notes": inv.notes,
        "created_at": inv.created_at.isoformat() if inv.created_at else None,
    }


def _next_invoice_number(db: Session) -> int:
    m = db.query(func.max(Invoice.invoice_number)).scalar()
    return (m or 1000) + 1


@router.get("")
def list_invoices(
    page: int = 1,
    page_size: int = 50,
    status: Optional[str] = None,
    broker_id: Optional[int] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: Session = Depends(get_db),
):
    q = db.query(Invoice).options(
        joinedload(Invoice.load),
        joinedload(Invoice.broker),
    ).filter(Invoice.is_active == True)

    if status:    q = q.filter(Invoice.status == status)
    if broker_id: q = q.filter(Invoice.broker_id == broker_id)
    if date_from: q = q.filter(Invoice.invoice_date >= date_from)
    if date_to:   q = q.filter(Invoice.invoice_date <= date_to)

    total = q.count()
    items = (q.order_by(Invoice.invoice_number.desc())
              .offset((page-1)*page_size).limit(page_size).all())
    return {
        "items": [_serialize(i) for i in items],
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
    }


@router.get("/{invoice_id}")
def get_invoice(invoice_id: int, db: Session = Depends(get_db)):
    inv = db.query(Invoice).options(joinedload(Invoice.load), joinedload(Invoice.broker))\
          .filter(Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(404, "Invoice not found")
    return _serialize(inv)


@router.post("/from-load/{load_id}", status_code=201)
def create_invoice_from_load(load_id: int, db: Session = Depends(get_db)):
    load = db.query(Load).filter(Load.id == load_id).first()
    if not load:
        raise HTTPException(404, "Load not found")
    # Ensure no active invoice already
    existing = db.query(Invoice).filter(Invoice.load_id == load_id, Invoice.is_active == True).first()
    if existing:
        raise HTTPException(400, f"Invoice #{existing.invoice_number} already exists for this load")

    today = date.today()
    inv = Invoice(
        invoice_number=_next_invoice_number(db),
        load_id=load.id,
        broker_id=load.broker_id,
        invoice_date=today,
        due_date=today + timedelta(days=30),
        status="Pending",
        amount=load.rate or 0.0,
    )
    db.add(inv)
    db.commit()
    db.refresh(inv)
    return _serialize(inv)


@router.put("/{invoice_id}")
def update_invoice(invoice_id: int, data: dict, db: Session = Depends(get_db)):
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(404, "Invoice not found")
    allowed = ["invoice_date", "due_date", "status", "amount", "notes"]
    for k, v in data.items():
        if k in allowed:
            setattr(inv, k, v)
    db.commit()
    db.refresh(inv)
    return _serialize(inv)


@router.post("/{invoice_id}/mark-paid")
def mark_paid(invoice_id: int, db: Session = Depends(get_db)):
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(404, "Invoice not found")
    inv.status = "Paid"
    db.commit()
    # Also advance related load's billing status
    if inv.load:
        try:
            from app.models.models import BillingStatus as BS
            inv.load.billing_status = BS.PAID
        except Exception:
            pass
    db.commit()
    return _serialize(inv)


@router.delete("/{invoice_id}")
def delete_invoice(invoice_id: int, db: Session = Depends(get_db)):
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(404, "Invoice not found")
    inv.is_active = False
    db.commit()
    return {"message": "Deleted"}


@router.get("/{invoice_id}/pdf")
def invoice_pdf(invoice_id: int, db: Session = Depends(get_db)):
    from app.services.pdf_service import generate_invoice_pdf
    inv = db.query(Invoice).options(
        joinedload(Invoice.load).joinedload(Load.broker),
        joinedload(Invoice.load).joinedload(Load.driver),
        joinedload(Invoice.load).joinedload(Load.stops),
    ).filter(Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(404, "Invoice not found")
    pdf = generate_invoice_pdf(inv.load, db=db)
    filename = f"invoice_{inv.invoice_number}.pdf"
    return Response(pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f"attachment; filename={filename}"})
