"""Invoices and factoring: what is ready to bill, what is out, what the factor owes, what came in."""
from __future__ import annotations
import io
from datetime import date, timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.core.tenant import get_company_id
from app.models.models import Attachment, BillingStatus, Broker, Company, Invoice, Load, LoadDocument, LoadHistory
from app.services import weekly_statement as ws
from app.services.driver_pay_service import money

FINISHED = ("Delivered", "Closed")
OPEN_INVOICE = ("Pending", "Sent", "Factored", "Funded")


def company(db: Session) -> Company | None:
    cid = get_company_id()
    return db.get(Company, cid) if cid else None


def terms_days(db: Session, broker: Broker | None) -> int:
    if broker and broker.pay_terms:
        digits = "".join(ch for ch in broker.pay_terms if ch.isdigit())
        if digits:
            return int(digits)
    c = company(db)
    return (c.payment_terms_days if c and c.payment_terms_days else 30)


def next_number(db: Session) -> int:
    return (db.query(func.max(Invoice.invoice_number)).scalar() or 1000) + 1


def invoice_amount(load: Load) -> float:
    return money((load.rate or 0.0) + sum((s.invoice_amount or 0.0) if s.add_deduct == "Add" else -(s.invoice_amount or 0.0) for s in (load.services or [])))


# ── Serialising ──────────────────────────────────────────────────────────────

def _load_bits(l: Load) -> dict:
    stops = sorted(l.stops or [], key=lambda s: s.stop_order)
    pu = next((s for s in stops if getattr(s.stop_type, "value", s.stop_type) == "pickup"), None)
    de = next((s for s in reversed(stops) if getattr(s.stop_type, "value", s.stop_type) == "delivery"), None)
    return {"load_id": l.id, "load_number": l.po_number or str(l.load_number), "broker": l.broker.name if l.broker else None, "broker_id": l.broker_id,
            "factoring_broker": bool(l.broker and l.broker.factoring), "driver": l.driver.name if l.driver else None, "truck": l.truck.unit_number if l.truck else None,
            "pickup": f"{pu.city}, {pu.state}" if pu and pu.city else None, "delivery": f"{de.city}, {de.state}" if de and de.city else None,
            "delivered_on": (l.actual_delivery_date or (de.stop_date if de else None) or l.load_date).isoformat() if l else None,
            "pod": ws.has_pod(l), "load_status": getattr(l.status, "value", l.status), "billing_status": getattr(l.billing_status, "value", l.billing_status)}


def serialize(inv: Invoice, today: date | None = None) -> dict:
    today = today or date.today()
    age = (today - inv.sent_at).days if inv.sent_at else ((today - inv.invoice_date).days if inv.invoice_date else 0)
    overdue = inv.status in ("Sent", "Factored", "Funded") and inv.due_date is not None and today > inv.due_date
    return {"id": inv.id, "invoice_number": inv.invoice_number, "status": inv.status, "channel": inv.channel, "amount": inv.amount,
            "invoice_date": inv.invoice_date.isoformat() if inv.invoice_date else None, "due_date": inv.due_date.isoformat() if inv.due_date else None,
            "sent_at": inv.sent_at.isoformat() if inv.sent_at else None, "funded_at": inv.funded_at.isoformat() if inv.funded_at else None,
            "paid_at": inv.paid_at.isoformat() if inv.paid_at else None, "fee_pct": inv.fee_pct, "fee_amount": inv.fee_amount,
            "advance_pct": inv.advance_pct, "advance_amount": inv.advance_amount, "paid_amount": inv.paid_amount,
            "age_days": age, "overdue": overdue, "days_overdue": (today - inv.due_date).days if overdue else 0, "notes": inv.notes,
            **(_load_bits(inv.load) if inv.load else {})}


# ── Queries ──────────────────────────────────────────────────────────────────

def _loads_q(db: Session):
    return db.query(Load).options(joinedload(Load.stops), joinedload(Load.broker), joinedload(Load.driver), joinedload(Load.truck), joinedload(Load.services), joinedload(Load.documents))


def ready_to_invoice(db: Session) -> list[dict]:
    """Delivered loads with no invoice yet. POD present or not is shown, not enforced: some brokers bill without it."""
    invoiced = {i.load_id for i in db.query(Invoice.load_id).filter(Invoice.is_active == True).all()}  # noqa: E712
    loads = _loads_q(db).filter(Load.is_active == True, Load.status.in_(FINISHED)).order_by(Load.load_date.desc()).all()  # noqa: E712
    out = []
    for l in loads:
        if l.id in invoiced or getattr(l.billing_status, "value", l.billing_status) in ("Canceled",):
            continue
        out.append({**_load_bits(l), "amount": invoice_amount(l), "rate": l.rate})
    return out


def invoices(db: Session, status: str | None = None, broker_id: int | None = None) -> list[Invoice]:
    q = (db.query(Invoice).options(joinedload(Invoice.load).joinedload(Load.stops), joinedload(Invoice.load).joinedload(Load.broker),
                                    joinedload(Invoice.load).joinedload(Load.driver), joinedload(Invoice.load).joinedload(Load.truck), joinedload(Invoice.load).joinedload(Load.documents))
           .filter(Invoice.is_active == True))  # noqa: E712
    if status == "open":
        q = q.filter(Invoice.status.in_(OPEN_INVOICE))
    elif status:
        q = q.filter(Invoice.status == status)
    if broker_id:
        q = q.filter(Invoice.broker_id == broker_id)
    return q.order_by(Invoice.invoice_number.desc()).all()


def overview(db: Session) -> dict:
    today = date.today()
    ready = ready_to_invoice(db)
    open_inv = [serialize(i, today) for i in invoices(db, "open")]
    buckets = {"0_30": 0.0, "31_60": 0.0, "61_90": 0.0, "90_plus": 0.0}
    for i in open_inv:
        if i["status"] == "Pending":
            continue
        a = i["age_days"]
        buckets["0_30" if a <= 30 else "31_60" if a <= 60 else "61_90" if a <= 90 else "90_plus"] += i["amount"]
    drafts = [i for i in open_inv if i["status"] == "Pending"]
    out_direct = [i for i in open_inv if i["status"] == "Sent"]
    at_factor = [i for i in open_inv if i["status"] == "Factored"]
    funded = [i for i in open_inv if i["status"] == "Funded"]
    overdue = [i for i in open_inv if i["overdue"]]
    by_broker: dict[str, dict] = {}
    for i in open_inv:
        if i["status"] == "Pending":
            continue
        b = by_broker.setdefault(i["broker"] or "No broker", {"broker": i["broker"] or "No broker", "count": 0, "amount": 0.0, "overdue": 0.0})
        b["count"] += 1; b["amount"] += i["amount"]
        if i["overdue"]:
            b["overdue"] += i["amount"]
    c = company(db)
    return {
        "today": today.isoformat(),
        "ready": {"count": len(ready), "amount": money(sum(r["amount"] for r in ready)), "without_pod": sum(1 for r in ready if not r["pod"])},
        "drafts": {"count": len(drafts), "amount": money(sum(i["amount"] for i in drafts))},
        "outstanding": {"count": len(out_direct) + len(at_factor) + len(funded), "amount": money(sum(i["amount"] for i in out_direct + at_factor + funded))},
        "direct": {"count": len(out_direct), "amount": money(sum(i["amount"] for i in out_direct))},
        "at_factor": {"count": len(at_factor), "amount": money(sum(i["amount"] for i in at_factor)), "advance_expected": money(sum(i["advance_amount"] or 0 for i in at_factor))},
        "funded_waiting_reserve": {"count": len(funded), "amount": money(sum((i["amount"] - (i["advance_amount"] or 0) - (i["fee_amount"] or 0)) for i in funded))},
        "overdue": {"count": len(overdue), "amount": money(sum(i["amount"] for i in overdue))},
        "aging": {k: money(v) for k, v in buckets.items()},
        "by_broker": sorted(by_broker.values(), key=lambda b: -b["amount"]),
        "settings": {"payment_terms_days": c.payment_terms_days if c else 30, "factoring_company": c.factoring_company if c else None,
                     "factoring_fee_pct": c.factoring_fee_pct if c else 3.0, "factoring_advance_pct": c.factoring_advance_pct if c else 90.0},
    }


# ── Actions ──────────────────────────────────────────────────────────────────

def create_from_load(db: Session, load: Load, author: str = "System") -> Invoice:
    existing = db.query(Invoice).filter(Invoice.load_id == load.id, Invoice.is_active == True).first()  # noqa: E712
    if existing:
        return existing
    today = date.today()
    inv = Invoice(invoice_number=next_number(db), load_id=load.id, broker_id=load.broker_id, invoice_date=today,
                  due_date=today + timedelta(days=terms_days(db, load.broker)), status="Pending", amount=invoice_amount(load))
    db.add(inv)
    load.billing_status = BillingStatus.INVOICED
    db.add(LoadHistory(load_id=load.id, description=f"Invoice #{inv.invoice_number} created for ${inv.amount:,.2f}", author=author))
    db.commit(); db.refresh(inv)
    return inv


def send(db: Session, inv: Invoice, channel: str, on: date | None = None, author: str = "System") -> Invoice:
    """Direct: the broker owes it in N days. Factoring: the factor advances most of it now and keeps a fee."""
    if channel not in ("direct", "factoring"):
        raise ValueError("Channel must be direct or factoring")
    if inv.status not in ("Pending", "Sent", "Factored"):
        raise ValueError(f"Invoice is already {inv.status.lower()}")
    on = on or date.today()
    inv.channel, inv.sent_at = channel, on
    inv.due_date = on + timedelta(days=terms_days(db, inv.broker))
    if channel == "factoring":
        c = company(db)
        b = inv.broker
        fee = b.quickpay_fee if b and b.quickpay_fee else (c.factoring_fee_pct if c and c.factoring_fee_pct is not None else 3.0)
        adv = c.factoring_advance_pct if c and c.factoring_advance_pct is not None else 90.0
        inv.fee_pct, inv.fee_amount = fee, money(inv.amount * fee / 100)
        inv.advance_pct, inv.advance_amount = adv, money(inv.amount * adv / 100)
        inv.status = "Factored"
        if inv.load:
            inv.load.billing_status = BillingStatus.SENT_TO_FACTORING
        note = f"Invoice #{inv.invoice_number} sent to {c.factoring_company if c and c.factoring_company else 'factoring'}: advance ${inv.advance_amount:,.2f}, fee {fee}%"
    else:
        inv.fee_pct = inv.fee_amount = inv.advance_pct = inv.advance_amount = None
        inv.status = "Sent"
        if inv.load:
            inv.load.billing_status = BillingStatus.INVOICED
        note = f"Invoice #{inv.invoice_number} sent to {inv.broker.name if inv.broker else 'broker'}, due {inv.due_date:%m/%d}"
    if inv.load:
        db.add(LoadHistory(load_id=inv.load_id, description=note, author=author))
    db.commit(); db.refresh(inv)
    return inv


def funded(db: Session, inv: Invoice, amount: float | None = None, on: date | None = None, author: str = "System") -> Invoice:
    if inv.status != "Factored":
        raise ValueError("Only an invoice at the factor can be funded")
    inv.status, inv.funded_at = "Funded", on or date.today()
    if amount is not None:
        inv.advance_amount = money(amount)
    if inv.load:
        inv.load.billing_status = BillingStatus.FUNDED
        db.add(LoadHistory(load_id=inv.load_id, description=f"Invoice #{inv.invoice_number} funded: ${inv.advance_amount or 0:,.2f}", author=author))
    db.commit(); db.refresh(inv)
    return inv


def paid(db: Session, inv: Invoice, amount: float | None = None, on: date | None = None, author: str = "System") -> Invoice:
    """Direct: the broker paid. Factoring: the broker paid the factor and the reserve came back; the invoice is closed."""
    if inv.status == "Paid":
        return inv
    inv.status, inv.paid_at = "Paid", on or date.today()
    inv.paid_amount = money(amount) if amount is not None else money(inv.amount - (inv.fee_amount or 0))
    if inv.load:
        inv.load.billing_status = BillingStatus.PAID
        db.add(LoadHistory(load_id=inv.load_id, description=f"Invoice #{inv.invoice_number} paid: ${inv.paid_amount:,.2f}", author=author))
    db.commit(); db.refresh(inv)
    return inv


def reopen(db: Session, inv: Invoice) -> Invoice:
    inv.status, inv.channel, inv.sent_at, inv.funded_at, inv.paid_at = "Pending", None, None, None, None
    inv.fee_pct = inv.fee_amount = inv.advance_pct = inv.advance_amount = inv.paid_amount = None
    if inv.load:
        inv.load.billing_status = BillingStatus.INVOICED
    db.commit(); db.refresh(inv)
    return inv


# ── The packet: invoice page + POD/BOL pages ─────────────────────────────────

def packet_pdf(db: Session, inv: Invoice) -> bytes:
    from pypdf import PdfReader, PdfWriter
    from reportlab.lib.pagesizes import letter
    from reportlab.pdfgen import canvas
    from PIL import Image
    from app.services.pdf_service import generate_invoice_pdf
    from app.services.storage import storage

    writer = PdfWriter()
    for page in PdfReader(io.BytesIO(generate_invoice_pdf(inv.load, db=db))).pages:
        writer.add_page(page)

    def add_image(data: bytes, title: str):
        img = Image.open(io.BytesIO(data)).convert("RGB")
        w, h = letter
        buf = io.BytesIO()
        c = canvas.Canvas(buf, pagesize=letter)
        c.setFont("Helvetica-Bold", 10); c.drawString(36, h - 30, title)
        scale = min((w - 72) / img.width, (h - 90) / img.height)
        dw, dh = img.width * scale, img.height * scale
        from reportlab.lib.utils import ImageReader
        c.drawImage(ImageReader(img), 36, h - 50 - dh, width=dw, height=dh)
        c.showPage(); c.save()
        for page in PdfReader(io.BytesIO(buf.getvalue())).pages:
            writer.add_page(page)

    def add_pdf(data: bytes):
        for page in PdfReader(io.BytesIO(data)).pages:
            writer.add_page(page)

    load = inv.load
    seen = set()
    # Documents filed on the load (uploaded in the office or from the driver app)
    for d in sorted(load.documents or [], key=lambda d: (0 if (d.notes or "").startswith("[karvan-document:POD]") else 1, d.id)):
        if not d.file_path:
            continue
        try:
            with open(d.file_path, "rb") as fh:
                data = fh.read()
        except OSError:
            continue
        seen.add(d.original_filename)
        kind = "POD" if (d.notes or "").startswith("[karvan-document:POD]") else getattr(d.document_type, "value", d.document_type)
        title = f"Load #{load.po_number or load.load_number} · {kind} · {d.original_filename or ''}"
        if (d.file_path or "").lower().endswith(".pdf"):
            try: add_pdf(data)
            except Exception: pass
        else:
            try: add_image(data, title)
            except Exception: pass
    # Chat photos tied to the load that were not filed yet (pod/bol/lumper/scale)
    for a in db.query(Attachment).filter(Attachment.load_id == load.id, Attachment.category.in_(("pod", "bol", "lumper", "scale"))).order_by(Attachment.id).all():
        if a.original_filename in seen:
            continue
        f = storage().get(a.storage_key)
        if f and (a.content_type or "").startswith("image/"):
            try: add_image(f.data, f"Load #{load.po_number or load.load_number} · {a.category.upper()} · {a.stamp.splitlines()[0] if a.stamp else ''}")
            except Exception: pass
    out = io.BytesIO(); writer.write(out)
    return out.getvalue()
