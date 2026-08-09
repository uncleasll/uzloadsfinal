"""
Load CSV import - Karvan-style import flow
Template columns: load_number, broker_name, driver_name, rate,
                  pickup_city, pickup_state, pickup_date,
                  delivery_city, delivery_state, delivery_date,
                  po_number, notes
Matches brokers/drivers by exact name. Reports success/failure per row.
"""
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, date
import csv, io, os, re, shutil, subprocess, tempfile, uuid
from app.db.session import get_db
from app.models.models import Load, LoadStop, StopType, Broker, Driver, LoadStatus, BillingStatus
from app.services.driver_pay_service import take_snapshot

router = APIRouter(prefix="/loads-import", tags=["loads-import"])

CSV_TEMPLATE_HEADER = [
    "load_number", "broker_name", "driver_name", "rate",
    "pickup_city", "pickup_state", "pickup_zip", "pickup_date",
    "delivery_city", "delivery_state", "delivery_zip", "delivery_date",
    "po_number", "notes",
]


def _parse_date(s: str):
    if not s: return None
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%m/%d/%y", "%d.%m.%Y"):
        try:
            return datetime.strptime(s.strip(), fmt).date()
        except ValueError:
            pass
    return None


def _format_date(s: str) -> Optional[str]:
    d = _parse_date(s)
    return d.isoformat() if d else None


def _normalize_text(text: str) -> str:
    return re.sub(r"[ \t]+", " ", text.replace("\r", "\n"))


def _extract_pdf_text(raw: bytes) -> str:
    try:
        from pypdf import PdfReader
    except Exception as exc:
        raise HTTPException(500, "PDF extraction requires pypdf. Install backend requirements.") from exc
    try:
        reader = PdfReader(io.BytesIO(raw))
        text = "\n".join(page.extract_text() or "" for page in reader.pages)
        if len(text.strip()) >= 50:
            return text
        return _ocr_pdf_pages(raw)
    except Exception as exc:
        raise HTTPException(400, f"Could not read PDF: {exc}") from exc


def _find_binary(name: str) -> Optional[str]:
    found = shutil.which(name)
    if found:
        return found
    candidates = [
        f"/opt/homebrew/bin/{name}",
        f"/usr/local/bin/{name}",
        f"/usr/bin/{name}",
        f"/Users/macbookpro/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/override/{name}",
        f"/Users/macbookpro/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/{name}",
    ]
    return next((path for path in candidates if os.path.exists(path)), None)


def _ocr_pdf_pages(raw: bytes) -> str:
    pdftoppm = _find_binary("pdftoppm")
    if not pdftoppm:
        raise HTTPException(500, "Scanned PDF OCR requires pdftoppm installed on the server.")
    with tempfile.TemporaryDirectory() as tmpdir:
        pdf_path = os.path.join(tmpdir, "document.pdf")
        prefix = os.path.join(tmpdir, "page")
        with open(pdf_path, "wb") as fh:
            fh.write(raw)
        try:
            render = subprocess.run(
                [pdftoppm, "-png", "-r", "220", "-f", "1", "-l", "4", pdf_path, prefix],
                capture_output=True,
                text=True,
                timeout=45,
                check=False,
            )
        except FileNotFoundError as exc:
            raise HTTPException(500, "Scanned PDF OCR requires pdftoppm installed on the server.") from exc
        if render.returncode != 0:
            raise HTTPException(400, (render.stderr or "Could not render PDF for OCR").strip())
        text_parts = []
        for image_name in sorted(name for name in os.listdir(tmpdir) if name.startswith("page-") and name.endswith(".png")):
            with open(os.path.join(tmpdir, image_name), "rb") as fh:
                text_parts.append(_extract_image_text(fh.read(), ".png"))
        return "\n".join(text_parts)


def _extract_image_text(raw: bytes, suffix: str) -> str:
    tesseract = _find_binary("tesseract")
    if not tesseract:
        raise HTTPException(500, "Image OCR requires tesseract installed on the server.")
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(raw)
        tmp_path = tmp.name
    try:
        res = subprocess.run(
            [tesseract, tmp_path, "stdout", "--psm", "6"],
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )
        if res.returncode != 0:
            raise HTTPException(400, (res.stderr or "OCR failed").strip())
        return res.stdout
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


def _first(patterns: List[str], text: str, flags=re.I) -> str:
    for pattern in patterns:
        m = re.search(pattern, text, flags)
        if m:
            return (m.group(1) or "").strip(" :#\n\t")
    return ""


def _money_to_float(value: str) -> float:
    if not value:
        return 0.0
    try:
        return float(re.sub(r"[^0-9.]", "", value))
    except ValueError:
        return 0.0


def _parse_stop(section: str) -> dict:
    lines = [ln.strip() for ln in section.splitlines() if ln.strip()]
    date = _first([r"(\d{1,2}/\d{1,2}/\d{2,4})"], section)
    times = re.findall(r"(\d{1,2}:\d{2}\s*(?:AM|PM)?)", section, flags=re.I)
    city_state_zip = re.search(r"([A-Z][A-Z .'-]+),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)", section)
    company = ""
    address = ""
    if lines:
        start_idx = 1 if re.search(r"\d{1,2}/\d{1,2}/\d{2,4}", lines[0]) else 0
        company = re.sub(r"^(PICKUP|DELIVER|DELIVERY)\s*", "", lines[start_idx], flags=re.I).strip()
        for ln in lines[start_idx + 1:]:
            if re.search(r"\d+\s+[A-Z0-9 .'-]+", ln) and not re.search(r"ORDER|TOTAL|PHONE|EMAIL|CONTACT", ln, re.I):
                address = ln
                break
    return {
        "company_name": company,
        "address": address,
        "city": city_state_zip.group(1).strip() if city_state_zip else "",
        "state": city_state_zip.group(2).strip() if city_state_zip else "",
        "zip_code": city_state_zip.group(3).strip() if city_state_zip else "",
        "stop_date": _format_date(date) if date else None,
        "stop_time": times[0].upper().replace(" ", "") if times else "",
        "notes": " ".join(lines[:8]),
    }


def _parse_crowley_stop(text: str, label: str, stop_type: str, order: int) -> Optional[dict]:
    pattern = (
        label
        + r"\s+Name:\s*(?P<company>.*?)\s+Appt Start:\s*(?P<start>\d{1,2}/\d{1,2}/\d{2,4})\s*(?P<time>\d{3,4})"
        + r".*?Address:\s*(?P<address>.*?)\s+Appt End:.*?\n(?P<city>[A-Z .'-]+),\s*(?P<state>[A-Z]{2})\s+(?P<zip>\d{5})"
    )
    m = re.search(pattern, text, re.I | re.S)
    if not m:
        return None
    raw_time = m.group("time")
    time_value = raw_time if ":" in raw_time else f"{raw_time[:-2]}:{raw_time[-2:]}"
    return {
        "stop_type": stop_type,
        "stop_order": order,
        "company_name": re.sub(r"\s+", " ", m.group("company")).strip(),
        "address": re.sub(r"\s+", " ", m.group("address")).strip(),
        "city": m.group("city").strip(),
        "state": m.group("state").strip(),
        "zip_code": m.group("zip").strip(),
        "stop_date": _format_date(m.group("start")),
        "stop_time": time_value,
        "notes": "",
    }


def _parse_rate_confirmation(text: str) -> dict:
    text = _normalize_text(text)
    crowley_pickup = _parse_crowley_stop(text, r"PU\d+", "pickup", 1)
    crowley_delivery = _parse_crowley_stop(text, r"S[O0]\d+", "delivery", 2)
    pickup_match = re.search(r"\bPICKUP\b(?P<body>.*?)(?=\bDELIVER(?:Y)?\b|\bDROP\b|$)", text, re.I | re.S)
    delivery_match = re.search(r"\bDELIVER(?:Y)?\b(?P<body>.*?)(?=\bPLEASE\b|\bTERMS\b|\bNOTES\b|$)", text, re.I | re.S)
    pickup = crowley_pickup or (_parse_stop(pickup_match.group("body")) if pickup_match else {})
    delivery = crowley_delivery or (_parse_stop(delivery_match.group("body")) if delivery_match else {})
    load_date = pickup.get("stop_date") or date.today().isoformat()
    delivery_date = delivery.get("stop_date")
    notes_parts = []
    for label in ("PICKUP INSTRUCTIONS", "DELIVERY INSTRUCTIONS", "NOTES", "COMMENTS"):
      m = re.search(label + r"\s*(.*?)(?=\n[A-Z][A-Z /#-]{3,}\n|$)", text, re.I | re.S)
      if m:
          notes_parts.append(re.sub(r"\s+", " ", m.group(1)).strip())
    rate_value = _first([
        r"(?:TOTAL|FLAT RATE|RATE|CHARGES)\s*\$?\s*([0-9][0-9,]*(?:\.\d{2})?)",
        r"\$\s*([0-9][0-9,]*(?:\.\d{2})?)",
    ], text)
    return {
        "load_number": _first([r"LOAD NUMBER\s*#?\s*([A-Z0-9-]+)", r"\bLOAD\s*#\s*([A-Z0-9-]+)", r"\bORDER\s*:\s*([A-Z0-9-]+)"], text),
        "po_number": _first([r"\bPO\s*#\s*([A-Z0-9-]+)", r"\bP\.?O\.?\s*NUMBER\s*([A-Z0-9-]+)", r"\bORDER\s*:\s*([A-Z0-9-]+)"], text),
        "broker_name": (
            "CROWLEY" if re.search(r"Crowley Land Transportation", text, re.I)
            else _first([r"^>?\s*([A-Z][A-Z .,&'-]+?)\s+\d{1,2}/\d{1,2}/\d{2,4}", r"^([A-Z][A-Z .,&'-]+)$"], text, re.I | re.M)
            or (text.splitlines()[0].strip() if text.splitlines() else "")
        ),
        "driver_name": _first([r"DRIVER NAME\s*:?\s*([A-Z .'-]+)", r"Please Sign:\s*([A-Z .'-]+)", r"\bDRIVER\s*:\s*([A-Z .'-]+)"], text),
        "driver_phone": _first([r"DRIVER (?:PHONE|CELL)\s*:?\s*([0-9() .+-]+)"], text),
        "rate": _money_to_float(rate_value),
        "load_date": load_date,
        "actual_delivery_date": delivery_date,
        "notes": "; ".join(p for p in notes_parts if p),
        "stops": [
            {"stop_type": "pickup", "stop_order": 1, **pickup},
            {"stop_type": "delivery", "stop_order": 2, **delivery},
        ],
        "raw_text": text[:20000],
    }


def _next_load_number(db: Session) -> int:
    from sqlalchemy import func as sqlfunc
    m = db.query(sqlfunc.max(Load.load_number)).scalar()
    return (m or 1000) + 1


@router.get("/template")
def download_template():
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(CSV_TEMPLATE_HEADER)
    w.writerow([
        "1234", "ABC Logistics", "John Smith", "2500.00",
        "New York Mills", "MN", "56567", "2026-04-15",
        "Brookland", "AR", "72417", "2026-04-17",
        "PO-12345", "Example load"
    ])
    return Response(
        buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=loads_template.csv"}
    )


@router.post("")
def import_loads(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """
    Parse CSV, import loads, return batch_id + per-row results.
    """
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(400, "File must be .csv")

    content = file.file.read().decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(content))
    batch_id = str(uuid.uuid4())[:8]

    results = []
    success_count = 0
    fail_count = 0

    for row_num, row in enumerate(reader, start=2):  # row 1 = header
        try:
            broker_name = (row.get("broker_name") or "").strip()
            driver_name = (row.get("driver_name") or "").strip()

            broker = db.query(Broker).filter(Broker.name == broker_name, Broker.is_active == True).first() if broker_name else None
            driver = db.query(Driver).filter(Driver.name == driver_name, Driver.is_active == True).first() if driver_name else None

            errors = []
            if broker_name and not broker:
                errors.append(f"Broker '{broker_name}' not found")
            if driver_name and not driver:
                errors.append(f"Driver '{driver_name}' not found")

            pickup_date = _parse_date(row.get("pickup_date", ""))
            delivery_date = _parse_date(row.get("delivery_date", ""))
            rate = float(row.get("rate") or 0)

            if errors:
                results.append({"row": row_num, "status": "failed", "errors": errors, "data": dict(row)})
                fail_count += 1
                continue

            load = Load(
                load_number=_next_load_number(db),
                status=LoadStatus.NEW,
                billing_status=BillingStatus.PENDING,
                rate=rate,
                load_date=pickup_date or date.today(),
                actual_delivery_date=delivery_date,
                po_number=row.get("po_number") or None,
                notes=row.get("notes") or None,
                is_active=True,
                driver_id=driver.id if driver else None,
                broker_id=broker.id if broker else None,
            )
            db.add(load)
            db.flush()

            take_snapshot(db, load)

            db.add(LoadStop(
                load_id=load.id, stop_type=StopType.PICKUP, stop_order=1,
                city=row.get("pickup_city") or "", state=row.get("pickup_state") or "",
                zip_code=row.get("pickup_zip") or "", country="US", stop_date=pickup_date,
            ))
            db.add(LoadStop(
                load_id=load.id, stop_type=StopType.DELIVERY, stop_order=2,
                city=row.get("delivery_city") or "", state=row.get("delivery_state") or "",
                zip_code=row.get("delivery_zip") or "", country="US", stop_date=delivery_date,
            ))

            db.commit()

            results.append({
                "row": row_num, "status": "success",
                "load_number": load.load_number, "load_id": load.id
            })
            success_count += 1

        except Exception as e:
            db.rollback()
            results.append({"row": row_num, "status": "failed", "errors": [str(e)], "data": dict(row)})
            fail_count += 1

    return {
        "batch_id": batch_id,
        "total": success_count + fail_count,
        "success": success_count,
        "failed": fail_count,
        "results": results,
    }


@router.post("/extract-documents")
async def extract_documents(files: List[UploadFile] = File(...)):
    if not files:
        raise HTTPException(400, "Upload at least one file")
    if len(files) > 10:
        raise HTTPException(400, "Upload up to 10 files")

    chunks = []
    extracted_files = []
    for file in files:
        raw = await file.read()
        if len(raw) > 5 * 1024 * 1024:
            raise HTTPException(400, f"{file.filename} is larger than 5MB")
        name = (file.filename or "document").lower()
        content_type = (file.content_type or "").lower()
        if name.endswith(".pdf") or "pdf" in content_type:
            text = _extract_pdf_text(raw)
        elif name.endswith((".png", ".jpg", ".jpeg")) or content_type.startswith("image/"):
            suffix = ".png" if name.endswith(".png") else ".jpg"
            text = _extract_image_text(raw, suffix)
        else:
            raise HTTPException(400, f"Unsupported file type: {file.filename}")
        chunks.append(text)
        extracted_files.append({"filename": file.filename, "characters": len(text or "")})

    parsed = _parse_rate_confirmation("\n\n".join(chunks))
    return {"files": extracted_files, "load": parsed}
