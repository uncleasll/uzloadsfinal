"""
PDF Service — two generators:
1. generate_invoice_pdf  — invoice with dark-header table (unchanged)
2. generate_settlement_pdf — Driver Pay Report matching the sample image 1:1
"""
import io
from datetime import timedelta
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_RIGHT, TA_CENTER
from reportlab.platypus import (
    SimpleDocTemplate, Table, TableStyle,
    Paragraph, Spacer, HRFlowable
)
from app.models.models import Load
from app.services.company_service import get_company
from app.db.session import SessionLocal


# ── shared colors ─────────────────────────────────────────────────────────────
DARK   = colors.HexColor("#111827")
GRAY   = colors.HexColor("#6b7280")
BORDER = colors.HexColor("#cccccc")
TH_BG  = colors.HexColor("#1a2332")


# ── shared helpers ─────────────────────────────────────────────────────────────
def _fmt_date(d) -> str:
    if not d:
        return ""
    try:
        return d.strftime("%m/%d/%Y")
    except Exception:
        return str(d)


def _get_company_info(db=None):
    _db = db
    _close = False
    if _db is None:
        _db = SessionLocal()
        _close = True
    try:
        company = get_company(_db)
    finally:
        if _close and _db:
            _db.close()
    return {
        "name":      company.get("name")      or "My Company",
        "email":     company.get("email")     or "",
        "phone":     company.get("phone")     or "",
        "city":      company.get("city")      or "",
        "state":     company.get("state")     or "",
        "zip_code":  company.get("zip_code")  or "",
        "mc_number": company.get("mc_number") or "",
        "dot_number":company.get("dot_number")or "",
    }


def _enum_value(v):
    return v.value if hasattr(v, "value") else v


def _first_or_self(value):
    if isinstance(value, list):
        return value[0] if value else None
    if hasattr(value, "__iter__") and value.__class__.__name__ == "InstrumentedList":
        return value[0] if len(value) > 0 else None
    return value


# ═════════════════════════════════════════════════════════════════════════════
# 1.  INVOICE PDF  (unchanged from original)
# ═════════════════════════════════════════════════════════════════════════════
def generate_invoice_pdf(load: Load, db=None) -> bytes:
    company  = _get_company_info(db)
    co_name  = company["name"]
    co_email = company["email"]
    co_phone = company["phone"]
    co_addr  = ", ".join(filter(None, [company["city"], company["state"], company["zip_code"]]))

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=letter,
        rightMargin=0.75 * inch, leftMargin=0.75 * inch,
        topMargin=0.75 * inch,  bottomMargin=0.75 * inch,
    )
    story = []

    normal = ParagraphStyle("n", fontName="Helvetica",      fontSize=9, leading=13, textColor=DARK)
    bold   = ParagraphStyle("b", fontName="Helvetica-Bold", fontSize=9, leading=13, textColor=DARK)

    def P(text, style=normal):
        return Paragraph(text, style)

    broker_name = load.broker.name if load.broker else ""
    broker_addr = f"{load.broker.city or ''}, {load.broker.state or ''}" if load.broker else ""
    from_text = (
        "From:<br/>"
        f"<b>{co_name}</b><br/>"
        + (f"{co_addr}<br/>"        if co_addr  else "")
        + (f"Email: {co_email}<br/>" if co_email else "")
        + (f"Phone: {co_phone}"      if co_phone else "")
    )
    to_text = (
        "To:<br/>"
        f"<b>{broker_name}</b><br/>"
        f"{broker_addr}<br/>"
    )

    logo_cell = Table(
        [[P(f"<b>{co_name}</b>", bold)]],
        colWidths=[0.7 * inch, 0.6 * inch],
    )
    logo_cell.setStyle(TableStyle([
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("BOX",           (0, 0), (-1, -1), 0.5, BORDER),
        ("TOPPADDING",    (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING",   (0, 0), (-1, -1), 6),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 4),
    ]))

    header_tbl = Table(
        [[logo_cell, P(from_text, normal), P(to_text, normal)]],
        colWidths=[1.4 * inch, 3.4 * inch, 2.3 * inch],
    )
    header_tbl.setStyle(TableStyle([
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
        ("BOX",           (0, 0), (-1, -1), 0.5, BORDER),
        ("LINEAFTER",     (0, 0), (1,  0),  0.5, BORDER),
        ("TOPPADDING",    (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING",   (0, 0), (-1, -1), 8),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
    ]))
    story.append(header_tbl)
    story.append(Spacer(1, 14))

    title_style = ParagraphStyle("title", fontName="Helvetica-Bold", fontSize=13, textColor=DARK, spaceAfter=6)
    story.append(Paragraph(f"Invoice #{load.load_number}", title_style))

    inv_date = load.actual_delivery_date or load.load_date
    due_date = (inv_date + timedelta(days=30)) if inv_date else None

    pickup   = next((s for s in load.stops if _enum_value(s.stop_type) == "pickup"),   None)
    delivery = next((s for s in load.stops if _enum_value(s.stop_type) == "delivery"), None)
    pickup_loc   = f"{pickup.city}, {pickup.state}"     if pickup   else ""
    delivery_loc = f"{delivery.city}, {delivery.state}" if delivery else ""
    route = f"{pickup_loc} - {delivery_loc}" if pickup_loc or delivery_loc else ""

    driver_name  = load.driver.unit_number  if load.driver  else ""
    truck_unit   = load.truck.unit_number   if load.truck   else ""
    trailer_unit = load.trailer.unit_number if load.trailer else ""

    meta_style = ParagraphStyle("meta", fontName="Helvetica", fontSize=9, leading=14, textColor=DARK)
    story.append(Paragraph(f"Date: {_fmt_date(inv_date)}",     meta_style))
    story.append(Paragraph(f"Due date: {_fmt_date(due_date)}", meta_style))
    story.append(Spacer(1, 6))
    story.append(Paragraph(f"PO number: {load.po_number or ''}", meta_style))
    story.append(Paragraph(route, meta_style))
    story.append(Paragraph(f"{driver_name} / {truck_unit} / {trailer_unit}", meta_style))
    story.append(Spacer(1, 14))

    th_style = ParagraphStyle("th",   fontName="Helvetica-Bold", fontSize=9, textColor=colors.white)
    th_r     = ParagraphStyle("thr",  fontName="Helvetica-Bold", fontSize=9, textColor=colors.white, alignment=TA_RIGHT)
    td_style = ParagraphStyle("td",   fontName="Helvetica",      fontSize=9, textColor=DARK)
    td_r     = ParagraphStyle("tdr",  fontName="Helvetica",      fontSize=9, textColor=DARK, alignment=TA_RIGHT)
    td_rb    = ParagraphStyle("tdrb", fontName="Helvetica-Bold", fontSize=9, textColor=DARK, alignment=TA_RIGHT)

    table_data = [[
        Paragraph("#",           th_style),
        Paragraph("Date",        th_style),
        Paragraph("Delivery",    th_style),
        Paragraph("Description", th_style),
        Paragraph("Amount",      th_r),
    ]]

    rows = []
    if load.rate and load.rate > 0:
        desc = f"Miles: {pickup_loc} - {delivery_loc} distance: {load.loaded_miles}mi/{load.empty_miles}mi"
        rows.append({
            "date":        _fmt_date(load.load_date),
            "delivery":    _fmt_date(load.actual_delivery_date),
            "description": desc,
            "amount":      load.rate,
        })

    for svc in load.services:
        svc_delivery     = _fmt_date(delivery.stop_date if delivery else None)
        svc_delivery_loc = delivery_loc
        svc_type = _enum_value(svc.service_type)
        desc = f"{svc_type} advanced/Delivery: {svc_delivery_loc}"
        if svc.notes:
            desc += f" - {svc.notes}"
        amt = svc.invoice_amount if svc.add_deduct == "Add" else -svc.invoice_amount
        rows.append({
            "date":        _fmt_date(svc.created_at.date() if svc.created_at else load.load_date),
            "delivery":    svc_delivery,
            "description": desc,
            "amount":      amt,
        })

    if not rows:
        rows.append({
            "date":        _fmt_date(load.load_date),
            "delivery":    _fmt_date(load.actual_delivery_date),
            "description": "No items",
            "amount":      0,
        })

    for i, row in enumerate(rows):
        amt_str = f"${row['amount']:,.2f}" if row["amount"] >= 0 else f"-${abs(row['amount']):,.2f}"
        table_data.append([
            Paragraph(str(i + 1),        td_style),
            Paragraph(row["date"],        td_style),
            Paragraph(row["delivery"],    td_style),
            Paragraph(row["description"], td_style),
            Paragraph(amt_str,            td_r),
        ])

    total     = sum(r["amount"] for r in rows)
    total_str = f"${total:,.2f}" if total >= 0 else f"-${abs(total):,.2f}"
    table_data.append([
        Paragraph("",        td_style),
        Paragraph("",        td_style),
        Paragraph("",        td_style),
        Paragraph("Total:",  td_rb),
        Paragraph(total_str, td_rb),
    ])

    col_w = [0.3*inch, 0.8*inch, 0.8*inch, 4.3*inch, 1.0*inch]
    tbl = Table(table_data, colWidths=col_w, repeatRows=1)
    tbl.setStyle(TableStyle([
        ("BACKGROUND",   (0, 0),  (-1, 0),  TH_BG),
        ("FONTNAME",     (0, 0),  (-1, 0),  "Helvetica-Bold"),
        ("TEXTCOLOR",    (0, 0),  (-1, 0),  colors.white),
        ("GRID",         (0, 0),  (-1, -2), 0.5, BORDER),
        ("LINEABOVE",    (0, -1), (-1, -1), 1, DARK),
        ("ROWBACKGROUNDS",(0, 1), (-1, -2), [colors.white, colors.HexColor("#f9f9f9")]),
        ("BACKGROUND",   (0, -1), (-1, -1), colors.HexColor("#fffbe6")),
        ("FONTNAME",     (0, -1), (-1, -1), "Helvetica-Bold"),
        ("TOPPADDING",   (0, 0),  (-1, -1), 6),
        ("BOTTOMPADDING",(0, 0),  (-1, -1), 6),
        ("LEFTPADDING",  (0, 0),  (-1, -1), 6),
        ("RIGHTPADDING", (0, 0),  (-1, -1), 6),
        ("VALIGN",       (0, 0),  (-1, -1), "MIDDLE"),
    ]))
    story.append(tbl)

    doc.build(story)
    buf.seek(0)
    return buf.read()


# ═════════════════════════════════════════════════════════════════════════════
# 2.  SETTLEMENT PDF  — matches sample image 1:1
#
#  Layout per load block:
#  ┌──────────┬──────────────────────────────────────────┬──────────────────┐
#  │ Load #   │  6NY3451                                 │                  │  ← light-gray bg
#  ├──────────┼──────────────────────────────────────────┼──────────────────┤
#  │ Pickup:  │  12/3/2025  MKY1                         │                  │
#  │ Delivery:│  12/3/2025  DFW7                         │                  │
#  │ Rate:    │  $2,500.00 × 90% = $2,250.00             │  $2,250.00       │
#  │ Notes:   │                                          │  Total Pay: $X   │ ← bold right
#  └──────────┴──────────────────────────────────────────┴──────────────────┘
# ═════════════════════════════════════════════════════════════════════════════
def generate_settlement_pdf(settlement, db=None) -> bytes:
    company  = _get_company_info(db)
    co_name  = company["name"]
    co_email = company["email"]
    co_phone = company["phone"]
    co_addr  = ", ".join(filter(None, [company["city"], company["state"], company["zip_code"]]))

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=letter,
        rightMargin=0.65 * inch, leftMargin=0.65 * inch,
        topMargin=0.70 * inch,  bottomMargin=0.85 * inch,
    )
    story = []

    # ── colors ────────────────────────────────────────────────────────────────
    BLACK      = colors.HexColor("#111111")
    BORDER_COL = colors.HexColor("#cccccc")
    LIGHT_GRAY = colors.HexColor("#f5f5f5")
    MID_GRAY   = colors.HexColor("#dddddd")
    FOOTER_GRAY= colors.HexColor("#666666")

    # ── styles ────────────────────────────────────────────────────────────────
    def S(name, **kw):
        base = dict(fontName="Helvetica", fontSize=9, leading=13, textColor=BLACK)
        base.update(kw)
        return ParagraphStyle(name, **base)

    title_s  = S("title", fontName="Helvetica-Bold", fontSize=14, leading=18, alignment=TA_CENTER)
    head_l   = S("hl",    fontName="Helvetica-Bold", fontSize=10, leading=14)
    head_r   = S("hr",    fontName="Helvetica-Bold", fontSize=10, leading=14, alignment=TA_RIGHT)
    sub_l    = S("sl")
    sub_r    = S("sr",    alignment=TA_RIGHT)
    period_s = S("per",   fontName="Helvetica-Bold", fontSize=11, leading=15, alignment=TA_CENTER)
    lbl_s    = S("lbl",   fontName="Helvetica-Bold")
    val_s    = S("val")
    val_r    = S("vr",    alignment=TA_RIGHT)
    val_rb   = S("vrb",   fontName="Helvetica-Bold", alignment=TA_RIGHT)
    ded_h    = S("dh",    fontName="Helvetica-Bold")
    total_s  = S("tot",   fontName="Helvetica-Bold", fontSize=10, leading=14)
    total_r  = S("tr",    fontName="Helvetica-Bold", fontSize=10, leading=14, alignment=TA_RIGHT)
    footer_s = S("ft",    fontSize=8, leading=12, textColor=FOOTER_GRAY, alignment=TA_CENTER)

    def P(txt, s=val_s):
        return Paragraph(str(txt) if txt else "", s)

    # ── driver info ───────────────────────────────────────────────────────────
    driver     = settlement.driver
    drv_name   = driver.name if driver else ""
    payable_to = settlement.payable_to or drv_name
    drv_phone  = driver.phone if driver else ""
    drv_email  = driver.email if driver else ""
    drv_addr1  = ""
    drv_addr2  = ""

    if driver and hasattr(driver, "profile") and driver.profile:
        profile = _first_or_self(driver.profile)
        if profile:
            drv_addr1 = getattr(profile, "address",  "") or ""
            drv_addr2 = ", ".join(filter(None, [
                getattr(profile, "city",     "") or "",
                getattr(profile, "state",    "") or "",
                getattr(profile, "zip_code", "") or "",
            ]))

    item_dates = [i.load_date for i in (settlement.items or []) if i.load_date]
    date_from  = min(item_dates) if item_dates else settlement.date
    date_to    = max(item_dates) if item_dates else settlement.date

    # ── title ─────────────────────────────────────────────────────────────────
    story.append(P("Driver Pay Report", title_s))
    story.append(Spacer(1, 10))

    # ── two-column header ─────────────────────────────────────────────────────
    left_lines  = [P(payable_to, head_l)]
    if drv_addr1: left_lines.append(P(drv_addr1, sub_l))
    if drv_addr2: left_lines.append(P(drv_addr2, sub_l))
    if drv_phone: left_lines.append(P(drv_phone, sub_l))
    if drv_email: left_lines.append(P(drv_email, sub_l))

    right_lines = [P(co_name, head_r)]
    if co_addr:  right_lines.append(P(co_addr,             sub_r))
    if co_phone: right_lines.append(P(f"Phone: {co_phone}", sub_r))
    if co_email: right_lines.append(P(co_email,             sub_r))

    hdr_tbl = Table([[left_lines, right_lines]], colWidths=[3.6 * inch, 3.6 * inch])
    hdr_tbl.setStyle(TableStyle([
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING",   (0, 0), (-1, -1), 0),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
        ("TOPPADDING",    (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(hdr_tbl)
    story.append(Spacer(1, 8))

    # ── horizontal rule ───────────────────────────────────────────────────────
    story.append(HRFlowable(width="100%", thickness=1, color=BLACK, spaceAfter=6))

    # ── work period ───────────────────────────────────────────────────────────
    story.append(P(
        f"Work Period  [{_fmt_date(date_from)}]  ~  [{_fmt_date(date_to)}]",
        period_s,
    ))
    story.append(Spacer(1, 12))

    # ── load blocks ───────────────────────────────────────────────────────────
    COL_LBL = 0.75 * inch   # "Load #" / "Pickup:" label
    COL_MID = 4.65 * inch   # data / description
    COL_PAY = 1.80 * inch   # amount / Total Pay

    load_items = [i for i in (settlement.items or []) if i.item_type == "load"]
    subtotal   = 0.0

    for item in load_items:
        load = item.load
        if not load:
            continue

        pay_type = load.pay_type_snapshot or "per_mile"
        amount   = item.amount_snapshot if item.amount_snapshot is not None else item.amount
        subtotal += amount

        # rate formula
        if pay_type == "percentage":
            pct      = load.freight_percentage_snapshot or 0.0
            rate_str = f"${load.rate:,.2f}  \u00d7  {pct:.0f}%  =  ${amount:,.2f}"
        elif pay_type == "flatpay":
            rate_str = f"Flat pay  =  ${amount:,.2f}"
        else:
            rate_l   = load.pay_rate_loaded_snapshot or 0.65
            rate_e   = load.pay_rate_empty_snapshot  or 0.30
            rate_str = f"${load.rate:,.2f}  (${rate_l}/mi loaded, ${rate_e}/mi empty)"

        # stop info
        pickup_city   = item.load_pickup_city   or ""
        delivery_city = item.load_delivery_city or ""
        pick_date     = ""
        del_date      = ""

        if load.stops:
            for stop in load.stops:
                t = _enum_value(stop.stop_type)
                if t == "pickup":
                    if not pickup_city:
                        pickup_city = f"{stop.city or ''}, {stop.state or ''}"
                    if not pick_date and stop.stop_date:
                        pick_date = _fmt_date(stop.stop_date)
                elif t == "delivery":
                    if not delivery_city:
                        delivery_city = f"{stop.city or ''}, {stop.state or ''}"
                    if not del_date and stop.stop_date:
                        del_date = _fmt_date(stop.stop_date)

        load_num     = load.load_number if load else ""
        pickup_val   = f"{pick_date}  {pickup_city}".strip()
        delivery_val = f"{del_date}  {delivery_city}".strip()

        # 5-row grid per load — matches image exactly
        blk_data = [
            # row 0 — Load # header (light-gray bg)
            [P("Load #",   lbl_s), P(load_num,     lbl_s), P("")],
            # row 1
            [P("Pickup:",   val_s), P(pickup_val,   val_s), P("")],
            # row 2
            [P("Delivery:", val_s), P(delivery_val, val_s), P("")],
            # row 3 — rate amount right-aligned in PAY column
            [P("Rate:",     val_s), P(rate_str,     val_s), P(f"${amount:,.2f}", val_r)],
            # row 4 — Total Pay bold right
            [P("Notes:",    val_s), P(""),                  P(f"Total Pay:  ${amount:,.2f}", val_rb)],
        ]

        blk_tbl = Table(blk_data, colWidths=[COL_LBL, COL_MID, COL_PAY])
        blk_tbl.setStyle(TableStyle([
            ("BOX",           (0, 0), (-1, -1), 0.5, BORDER_COL),
            ("LINEBELOW",     (0, 0), (-1,  0), 0.5, BORDER_COL),
            ("BACKGROUND",    (0, 0), (-1,  0), LIGHT_GRAY),
            ("TOPPADDING",    (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING",   (0, 0), (-1, -1), 8),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
            ("VALIGN",        (0, 0), (-1, -1), "TOP"),
        ]))
        story.append(blk_tbl)
        story.append(Spacer(1, 6))

    story.append(Spacer(1, 4))

    # ── recurring deductions ──────────────────────────────────────────────────
    adjustments = list(settlement.adjustments or [])
    if adjustments:
        story.append(P("Recurring Deduction", ded_h))
        story.append(Spacer(1, 4))
        ded_rows = []
        for adj in adjustments:
            label   = adj.category or adj.description or adj.adj_type
            amt     = adj.amount if adj.adj_type == "addition" else -adj.amount
            amt_str = f"${amt:,.2f}" if amt >= 0 else f"-${abs(amt):,.2f}"
            ded_rows.append([P(label, val_s), P(amt_str, val_r)])

        ded_tbl = Table(ded_rows, colWidths=[5.4 * inch, 1.8 * inch])
        ded_tbl.setStyle(TableStyle([
            ("BOX",           (0, 0), (-1, -1), 0.5, BORDER_COL),
            ("GRID",          (0, 0), (-1, -1), 0.3, MID_GRAY),
            ("TOPPADDING",    (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING",   (0, 0), (-1, -1), 8),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
            ("ROWBACKGROUNDS",(0, 0), (-1, -1), [colors.white, LIGHT_GRAY]),
        ]))
        story.append(ded_tbl)
        story.append(Spacer(1, 8))

    # ── summary ───────────────────────────────────────────────────────────────
    adj_total      = sum(a.amount if a.adj_type == "addition" else -a.amount for a in adjustments)
    grand_total    = round(subtotal + adj_total, 2)
    payments_total = sum(p.amount for p in (settlement.payments or []))
    balance_due    = round(grand_total - payments_total, 2)

    summary_data = [
        [P("Subtotal:",    total_s), P(f"${subtotal:,.2f}",    total_r)],
        [P("Grand Total:", total_s), P(f"${grand_total:,.2f}", total_r)],
    ]
    if payments_total:
        summary_data.append([P("Payments:",    total_s), P(f"-${payments_total:,.2f}", total_r)])
        summary_data.append([P("Balance Due:", total_s), P(f"${balance_due:,.2f}",     total_r)])

    sum_tbl = Table(summary_data, colWidths=[5.4 * inch, 1.8 * inch])
    sum_tbl.setStyle(TableStyle([
        ("TOPPADDING",    (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING",   (0, 0), (-1, -1), 0),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
        ("LINEABOVE",     (0, -1), (-1, -1), 1.2, BLACK),
        ("FONTNAME",      (0, -1), (-1, -1), "Helvetica-Bold"),
    ]))
    story.append(sum_tbl)

    story.append(Spacer(1, 20))
    story.append(P("uzLoads TMS and Driver App  \u2022  uzloads.net", footer_s))

    doc.build(story)
    buf.seek(0)
    return buf.read()