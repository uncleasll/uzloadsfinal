from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session
from typing import Optional, List
from datetime import date
import os, uuid, io

from app.db.session import get_db
from app.schemas.schemas import (
    LoadCreate, LoadUpdate, LoadOut, LoadListOut,
    LoadServiceCreate, LoadServiceOut, LoadNoteCreate, LoadNoteOut,
    LoadDocumentOut, LoadHistoryOut, PaginatedResponse
)
from app.crud import loads as crud
from app.models.models import LoadDocument, LoadHistory
from app.services.pdf_service import generate_invoice_pdf
from app.core.config import settings

router = APIRouter(prefix="/loads", tags=["loads"])


@router.get("", response_model=dict)
def list_loads(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
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
    show_only_active: bool = False,
    direct_billing: Optional[bool] = None,
    load_number: Optional[int] = None,
    sort_by: str = Query("load_number"),
    sort_dir: str = Query("desc", pattern="^(asc|desc)$"),
    db: Session = Depends(get_db),
):
    result = crud.get_loads(
        db, page=page, page_size=page_size,
        search=search, status=status, billing_status=billing_status,
        driver_id=driver_id, broker_id=broker_id, truck_id=truck_id,
        trailer_id=trailer_id, dispatcher_id=dispatcher_id,
        date_from=date_from, date_to=date_to,
        show_only_active=show_only_active,
        direct_billing=direct_billing, load_number=load_number,
        sort_by=sort_by, sort_dir=sort_dir,
    )
    items = [LoadListOut.model_validate(l) for l in result["items"]]
    return {
        "items": [i.model_dump() for i in items],
        "total": result["total"],
        "page": result["page"],
        "page_size": result["page_size"],
        "total_pages": result["total_pages"],
        "total_rate": result["total_rate"],
        "total_pending_rate": result["total_pending_rate"],
        "total_invoiced_rate": result["total_invoiced_rate"],
        "total_paid_rate": result["total_paid_rate"],
        "total_overdue_rate": result["total_overdue_rate"],
    }


@router.post("", response_model=LoadOut, status_code=201)
def create_load(load_in: LoadCreate, db: Session = Depends(get_db)):
    try:
        return crud.create_load(db, load_in, author="System")
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("/{load_id}", response_model=LoadOut)
def get_load(load_id: int, db: Session = Depends(get_db)):
    load = crud.get_load(db, load_id)
    if not load:
        raise HTTPException(404, "Load not found")
    return load


@router.put("/{load_id}", response_model=LoadOut)
def update_load(load_id: int, load_in: LoadUpdate, db: Session = Depends(get_db)):
    try:
        load = crud.update_load(db, load_id, load_in)
    except ValueError as e:
        raise HTTPException(400, str(e))
    if not load:
        raise HTTPException(404, "Load not found")
    return load


@router.delete("/{load_id}")
def delete_load(load_id: int, db: Session = Depends(get_db)):
    if not crud.delete_load(db, load_id):
        raise HTTPException(404, "Load not found")
    return {"message": "Load deactivated"}


# ─── Services ─────────────────────────────────────────────────────────────────

@router.post("/{load_id}/services", response_model=LoadServiceOut, status_code=201)
def add_service(load_id: int, service_in: LoadServiceCreate, db: Session = Depends(get_db)):
    return crud.add_service(db, load_id, service_in)


@router.delete("/{load_id}/services/{service_id}")
def delete_service(load_id: int, service_id: int, db: Session = Depends(get_db)):
    if not crud.delete_service(db, service_id):
        raise HTTPException(404, "Service not found")
    return {"message": "Service deleted"}


# ─── Notes ────────────────────────────────────────────────────────────────────

@router.post("/{load_id}/notes", response_model=LoadNoteOut, status_code=201)
def add_note(load_id: int, note_in: LoadNoteCreate, db: Session = Depends(get_db)):
    return crud.add_note(db, load_id, note_in)


@router.delete("/{load_id}/notes/{note_id}")
def delete_note(load_id: int, note_id: int, db: Session = Depends(get_db)):
    from app.models.models import LoadNote
    note = db.query(LoadNote).filter(LoadNote.id == note_id, LoadNote.load_id == load_id).first()
    if not note:
        raise HTTPException(404, "Note not found")
    db.delete(note)
    db.commit()
    return {"message": "Deleted"}


@router.put("/{load_id}/notes/{note_id}")
def update_note(load_id: int, note_id: int, data: dict, db: Session = Depends(get_db)):
    from app.models.models import LoadNote
    note = db.query(LoadNote).filter(LoadNote.id == note_id, LoadNote.load_id == load_id).first()
    if not note:
        raise HTTPException(404, "Note not found")
    if "content" in data:
        note.content = data["content"]
    db.commit()
    return {"id": note.id, "content": note.content, "author": note.author, "created_at": str(note.created_at)}


# ─── Documents ────────────────────────────────────────────────────────────────

@router.post("/{load_id}/documents", response_model=LoadDocumentOut, status_code=201)
async def upload_document(
    load_id: int,
    document_type: str = Form(...),
    notes: Optional[str] = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    ext = os.path.splitext(file.filename)[1]
    unique_name = f"{uuid.uuid4()}{ext}"
    file_path = os.path.join(settings.UPLOAD_DIR, unique_name)

    contents = await file.read()
    with open(file_path, "wb") as f:
        f.write(contents)

    doc = crud.save_document(
        db, load_id=load_id, document_type=document_type,
        filename=unique_name, original_filename=file.filename,
        file_path=file_path, file_size=len(contents), notes=notes
    )
    return doc


@router.delete("/{load_id}/documents/{doc_id}")
def delete_document(load_id: int, doc_id: int, db: Session = Depends(get_db)):
    if not crud.delete_document(db, doc_id):
        raise HTTPException(404, "Document not found")
    return {"message": "Document deleted"}


@router.get("/{load_id}/documents/{doc_id}/download")
def download_document(load_id: int, doc_id: int, db: Session = Depends(get_db)):
    doc = db.query(LoadDocument).filter(
        LoadDocument.id == doc_id,
        LoadDocument.load_id == load_id,
    ).first()
    if not doc:
        raise HTTPException(404, "Document not found")
    if not doc.file_path or not os.path.exists(doc.file_path):
        raise HTTPException(404, "File missing on server")
    return FileResponse(
        doc.file_path,
        filename=doc.original_filename or doc.filename,
        media_type="application/octet-stream",
    )


@router.get("/{load_id}/documents/merged")
def merged_documents(load_id: int, db: Session = Depends(get_db)):
    load = crud.get_load(db, load_id)
    if not load:
        raise HTTPException(404, "Load not found")
    docs = [doc for doc in (load.documents or []) if doc.file_path and os.path.exists(doc.file_path)]
    if not docs:
        raise HTTPException(404, "No documents to merge")

    from reportlab.lib import colors
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

    buffer = io.BytesIO()
    pdf = SimpleDocTemplate(buffer, pagesize=letter, rightMargin=36, leftMargin=36, topMargin=36, bottomMargin=36)
    styles = getSampleStyleSheet()
    story = [
        Paragraph(f"Load #{load.load_number} Document Packet", styles["Title"]),
        Spacer(1, 12),
        Paragraph("Uploaded document index", styles["Heading2"]),
    ]
    rows = [["Type", "File name", "Uploaded"]]
    for doc in docs:
        rows.append([
            str(doc.document_type),
            doc.original_filename or doc.filename,
            doc.uploaded_at.strftime("%m/%d/%Y %I:%M %p") if doc.uploaded_at else "",
        ])
    table = Table(rows, colWidths=[110, 300, 110])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1d4ed8")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#d1d5db")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f9fafb")]),
    ]))
    story.append(table)
    story.append(Spacer(1, 12))
    story.append(Paragraph(
        "Non-PDF source files remain available from the Documents tab. This packet keeps the invoice workflow together even when uploads include images or office files.",
        styles["BodyText"],
    ))
    pdf.build(story)
    buffer.seek(0)
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=load_{load.load_number}_documents.pdf"},
    )


# ─── PDF Invoice ──────────────────────────────────────────────────────────────

@router.get("/{load_id}/invoice/pdf")
def download_invoice_pdf(load_id: int, db: Session = Depends(get_db)):
    load = crud.get_load(db, load_id)
    if not load:
        raise HTTPException(404, "Load not found")
    pdf_bytes = generate_invoice_pdf(load)
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=invoice_{load.load_number}.pdf"}
    )


# ─── Driver Pay Recalculate ───────────────────────────────────────────────────

@router.post("/{load_id}/recalculate-driver-pay")
def recalculate_driver_pay_endpoint(
    load_id: int,
    db: Session = Depends(get_db),
):
    from app.services.driver_pay_service import recalculate_driver_pay, is_locked
    load = crud.get_load(db, load_id)
    if not load:
        raise HTTPException(404, "Load not found")
    if is_locked(load):
        raise HTTPException(
            400,
            f"Load #{load.load_number} billing status is '{load.billing_status}'. "
            "Historical driver pay cannot be changed for locked loads."
        )
    try:
        new_pay = recalculate_driver_pay(db, load, author="Dispatcher")
        db.commit()
        return {"drivers_payable": new_pay, "snapshot_overridden": load.snapshot_overridden}
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/{load_id}/retake-snapshot")
def retake_driver_snapshot(
    load_id: int,
    db: Session = Depends(get_db),
):
    """Re-capture driver pay rules from the current driver profile (open loads only)."""
    from app.services.driver_pay_service import take_snapshot, is_locked
    load = crud.get_load(db, load_id)
    if not load:
        raise HTTPException(404, "Load not found")
    if is_locked(load):
        raise HTTPException(
            400,
            f"Load #{load.load_number} is locked (billing: {load.billing_status}). "
            "Cannot update snapshot for a locked load."
        )
    take_snapshot(db, load)
    history = LoadHistory(
        load_id=load_id,
        description=f"Driver compensation snapshot refreshed from current driver profile.",
        author="Dispatcher"
    )
    db.add(history)
    db.commit()
    return {
        "pay_type_snapshot": load.pay_type_snapshot,
        "pay_rate_loaded_snapshot": load.pay_rate_loaded_snapshot,
        "pay_rate_empty_snapshot": load.pay_rate_empty_snapshot,
        "freight_percentage_snapshot": load.freight_percentage_snapshot,
        "drivers_payable_snapshot": load.drivers_payable_snapshot,
    }

