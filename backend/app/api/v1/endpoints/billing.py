"""Invoices and factoring for the office."""
from __future__ import annotations
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

from app.api.v1.endpoints.auth import require_user
from app.db.session import get_db
from app.models.models import Invoice, Load
from app.services import billing

router = APIRouter(prefix="/billing", tags=["billing"])


def _inv(db: Session, invoice_id: int) -> Invoice:
    inv = (db.query(Invoice).options(joinedload(Invoice.load).joinedload(Load.stops), joinedload(Invoice.load).joinedload(Load.broker),
                                     joinedload(Invoice.load).joinedload(Load.documents), joinedload(Invoice.broker))
             .filter(Invoice.id == invoice_id, Invoice.is_active == True).first())  # noqa: E712
    if not inv:
        raise HTTPException(404, "Invoice not found")
    return inv


@router.get("/overview")
def overview(db: Session = Depends(get_db), user=Depends(require_user)):
    return billing.overview(db)


@router.get("/ready")
def ready(db: Session = Depends(get_db), user=Depends(require_user)):
    return billing.ready_to_invoice(db)


@router.get("/invoices")
def list_invoices(status: Optional[str] = None, broker_id: Optional[int] = None, db: Session = Depends(get_db), user=Depends(require_user)):
    return [billing.serialize(i) for i in billing.invoices(db, status, broker_id)]


class CreateIn(BaseModel):
    load_ids: list[int]
    send: Optional[str] = None       # direct | factoring: create and send in one go


@router.post("/invoices", status_code=201)
def create(data: CreateIn, db: Session = Depends(get_db), user=Depends(require_user)):
    out = []
    for lid in data.load_ids:
        load = db.query(Load).options(joinedload(Load.services), joinedload(Load.broker)).filter(Load.id == lid).first()
        if not load:
            raise HTTPException(404, f"Load {lid} not found")
        inv = billing.create_from_load(db, load, author=user.name)
        if data.send:
            try:
                inv = billing.send(db, inv, data.send, author=user.name)
            except ValueError as e:
                raise HTTPException(400, str(e))
        out.append(billing.serialize(_inv(db, inv.id)))
    return out


class SendIn(BaseModel):
    channel: str
    on: Optional[date] = None


@router.post("/invoices/{invoice_id}/send")
def send(invoice_id: int, data: SendIn, db: Session = Depends(get_db), user=Depends(require_user)):
    try:
        return billing.serialize(billing.send(db, _inv(db, invoice_id), data.channel, data.on, author=user.name))
    except ValueError as e:
        raise HTTPException(400, str(e))


class MoneyIn(BaseModel):
    amount: Optional[float] = None
    on: Optional[date] = None


@router.post("/invoices/{invoice_id}/funded")
def funded(invoice_id: int, data: MoneyIn, db: Session = Depends(get_db), user=Depends(require_user)):
    try:
        return billing.serialize(billing.funded(db, _inv(db, invoice_id), data.amount, data.on, author=user.name))
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/invoices/{invoice_id}/paid")
def paid(invoice_id: int, data: MoneyIn, db: Session = Depends(get_db), user=Depends(require_user)):
    return billing.serialize(billing.paid(db, _inv(db, invoice_id), data.amount, data.on, author=user.name))


@router.post("/invoices/{invoice_id}/reopen")
def reopen(invoice_id: int, db: Session = Depends(get_db), user=Depends(require_user)):
    return billing.serialize(billing.reopen(db, _inv(db, invoice_id)))


@router.get("/invoices/{invoice_id}/packet.pdf")
def packet(invoice_id: int, db: Session = Depends(get_db), user=Depends(require_user)):
    inv = _inv(db, invoice_id)
    pdf = billing.packet_pdf(db, inv)
    return Response(pdf, media_type="application/pdf", headers={"Content-Disposition": f'inline; filename="invoice_{inv.invoice_number}_packet.pdf"'})
