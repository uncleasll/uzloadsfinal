from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse, Response
from sqlalchemy.orm import Session
from typing import Optional
from datetime import date
import io
from app.db.session import get_db
from app.crud import reports as crud
from app.services.report_export_service import (
    generate_rate_per_mile_pdf, generate_rate_per_mile_xlsx,
    generate_total_revenue_pdf, generate_total_revenue_xlsx,
    generate_gross_profit_pdf, generate_gross_profit_xlsx,
    generate_gross_profit_per_load_pdf, generate_gross_profit_per_load_xlsx,
    generate_revenue_by_dispatcher_pdf, generate_revenue_by_dispatcher_xlsx,
    generate_payment_summary_pdf, generate_payment_summary_xlsx,
    generate_expenses_pdf, generate_expenses_xlsx,
    generate_profit_loss_pdf, generate_profit_loss_xlsx,
)

router = APIRouter(prefix="/reports", tags=["reports"])


def _sl(s): return [x.strip() for x in s.split(",")] if s else None
def _filters_str(statuses, billing_statuses, **kw):
    return {
        "statuses": statuses or "All",
        "billing_statuses": billing_statuses or "All",
        **kw,
    }


# ─── Total Revenue ─────────────────────────────────────────────────────────────

@router.get("/total-revenue")
def total_revenue(period:str=Query("last_30_days"),date_from:Optional[date]=None,date_to:Optional[date]=None,
    broker_id:Optional[int]=None,driver_id:Optional[int]=None,truck_id:Optional[int]=None,
    group_by:str=Query("none"),date_type:str=Query("pickup"),statuses:Optional[str]=None,
    billing_statuses:Optional[str]=None,db:Session=Depends(get_db)):
    return crud.get_total_revenue_report(db,period=period,date_from=date_from,date_to=date_to,
        broker_id=broker_id,driver_id=driver_id,truck_id=truck_id,group_by=group_by,
        date_type=date_type,statuses=_sl(statuses),billing_statuses=_sl(billing_statuses))

@router.get("/total-revenue/pdf")
def total_revenue_pdf(period:str=Query("last_30_days"),date_from:Optional[date]=None,date_to:Optional[date]=None,
    broker_id:Optional[int]=None,driver_id:Optional[int]=None,truck_id:Optional[int]=None,
    group_by:str=Query("none"),date_type:str=Query("pickup"),statuses:Optional[str]=None,
    billing_statuses:Optional[str]=None,columns:Optional[str]=None,db:Session=Depends(get_db)):
    data=crud.get_total_revenue_report(db,period=period,date_from=date_from,date_to=date_to,
        broker_id=broker_id,driver_id=driver_id,truck_id=truck_id,group_by=group_by,
        date_type=date_type,statuses=_sl(statuses),billing_statuses=_sl(billing_statuses))
    cols=columns.split(",") if columns else ["pickup_date","actual_delivery_date","load_number","route","rate"]
    f=_filters_str(statuses,billing_statuses)
    pdf=generate_total_revenue_pdf(data,f,cols)
    return Response(pdf,media_type="application/pdf",headers={"Content-Disposition":"attachment; filename=total_revenue.pdf"})

@router.get("/total-revenue/xlsx")
def total_revenue_xlsx(period:str=Query("last_30_days"),date_from:Optional[date]=None,date_to:Optional[date]=None,
    broker_id:Optional[int]=None,driver_id:Optional[int]=None,truck_id:Optional[int]=None,
    group_by:str=Query("none"),date_type:str=Query("pickup"),statuses:Optional[str]=None,
    billing_statuses:Optional[str]=None,columns:Optional[str]=None,db:Session=Depends(get_db)):
    data=crud.get_total_revenue_report(db,period=period,date_from=date_from,date_to=date_to,
        broker_id=broker_id,driver_id=driver_id,truck_id=truck_id,group_by=group_by,
        date_type=date_type,statuses=_sl(statuses),billing_statuses=_sl(billing_statuses))
    cols=columns.split(",") if columns else []
    xlsx=generate_total_revenue_xlsx(data,_filters_str(statuses,billing_statuses),cols)
    return Response(xlsx,media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition":"attachment; filename=total_revenue.xlsx"})


# ─── Rate per Mile ─────────────────────────────────────────────────────────────

@router.get("/rate-per-mile")
def rate_per_mile(period:str=Query("last_30_days"),date_from:Optional[date]=None,date_to:Optional[date]=None,
    broker_id:Optional[int]=None,driver_id:Optional[int]=None,truck_id:Optional[int]=None,
    dispatcher_id:Optional[int]=None,group_by:str=Query("none"),date_type:str=Query("pickup"),
    statuses:Optional[str]=None,billing_statuses:Optional[str]=None,change_to_overridden:bool=False,
    db:Session=Depends(get_db)):
    return crud.get_rate_per_mile_report(db,period=period,date_from=date_from,date_to=date_to,
        broker_id=broker_id,driver_id=driver_id,truck_id=truck_id,dispatcher_id=dispatcher_id,
        group_by=group_by,date_type=date_type,statuses=_sl(statuses),billing_statuses=_sl(billing_statuses))

@router.get("/rate-per-mile/pdf")
def rate_per_mile_pdf(period:str=Query("last_30_days"),date_from:Optional[date]=None,date_to:Optional[date]=None,
    broker_id:Optional[int]=None,driver_id:Optional[int]=None,truck_id:Optional[int]=None,
    dispatcher_id:Optional[int]=None,group_by:str=Query("none"),date_type:str=Query("pickup"),
    statuses:Optional[str]=None,billing_statuses:Optional[str]=None,dispatcher_name:Optional[str]=None,
    db:Session=Depends(get_db)):
    data=crud.get_rate_per_mile_report(db,period=period,date_from=date_from,date_to=date_to,
        broker_id=broker_id,driver_id=driver_id,truck_id=truck_id,dispatcher_id=dispatcher_id,
        group_by=group_by,date_type=date_type,statuses=_sl(statuses),billing_statuses=_sl(billing_statuses))
    f=_filters_str(statuses,billing_statuses,dispatcher_name=dispatcher_name or "All dispatchers")
    pdf=generate_rate_per_mile_pdf(data,f)
    return Response(pdf,media_type="application/pdf",headers={"Content-Disposition":"attachment; filename=rate_per_mile.pdf"})

@router.get("/rate-per-mile/xlsx")
def rate_per_mile_xlsx(period:str=Query("last_30_days"),date_from:Optional[date]=None,date_to:Optional[date]=None,
    broker_id:Optional[int]=None,driver_id:Optional[int]=None,truck_id:Optional[int]=None,
    dispatcher_id:Optional[int]=None,group_by:str=Query("none"),date_type:str=Query("pickup"),
    statuses:Optional[str]=None,billing_statuses:Optional[str]=None,dispatcher_name:Optional[str]=None,
    db:Session=Depends(get_db)):
    data=crud.get_rate_per_mile_report(db,period=period,date_from=date_from,date_to=date_to,
        broker_id=broker_id,driver_id=driver_id,truck_id=truck_id,dispatcher_id=dispatcher_id,
        group_by=group_by,date_type=date_type,statuses=_sl(statuses),billing_statuses=_sl(billing_statuses))
    f=_filters_str(statuses,billing_statuses,dispatcher_name=dispatcher_name or "All dispatchers")
    xlsx=generate_rate_per_mile_xlsx(data,f)
    return Response(xlsx,media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition":"attachment; filename=rate_per_mile.xlsx"})


# ─── Revenue by Dispatcher ──────────────────────────────────────────────────────

@router.get("/revenue-by-dispatcher")
def revenue_by_dispatcher(period:str=Query("last_30_days"),date_from:Optional[date]=None,date_to:Optional[date]=None,
    dispatcher_id:Optional[int]=None,statuses:Optional[str]=None,billing_statuses:Optional[str]=None,
    detailed:bool=False,db:Session=Depends(get_db)):
    return crud.get_revenue_by_dispatcher_report(db,period=period,date_from=date_from,date_to=date_to,
        dispatcher_id=dispatcher_id,statuses=_sl(statuses),billing_statuses=_sl(billing_statuses),detailed=detailed)

@router.get("/revenue-by-dispatcher/pdf")
def revenue_by_dispatcher_pdf(period:str=Query("last_30_days"),date_from:Optional[date]=None,date_to:Optional[date]=None,
    dispatcher_id:Optional[int]=None,statuses:Optional[str]=None,billing_statuses:Optional[str]=None,
    dispatcher_name:Optional[str]=None,detailed:bool=False,db:Session=Depends(get_db)):
    data=crud.get_revenue_by_dispatcher_report(db,period=period,date_from=date_from,date_to=date_to,
        dispatcher_id=dispatcher_id,statuses=_sl(statuses),billing_statuses=_sl(billing_statuses),detailed=detailed)
    f=_filters_str(statuses,billing_statuses,dispatcher_name=dispatcher_name or "All")
    pdf=generate_revenue_by_dispatcher_pdf(data,f)
    return Response(pdf,media_type="application/pdf",headers={"Content-Disposition":"attachment; filename=revenue_by_dispatcher.pdf"})

@router.get("/revenue-by-dispatcher/xlsx")
def revenue_by_dispatcher_xlsx(period:str=Query("last_30_days"),date_from:Optional[date]=None,date_to:Optional[date]=None,
    dispatcher_id:Optional[int]=None,statuses:Optional[str]=None,billing_statuses:Optional[str]=None,
    dispatcher_name:Optional[str]=None,detailed:bool=False,db:Session=Depends(get_db)):
    data=crud.get_revenue_by_dispatcher_report(db,period=period,date_from=date_from,date_to=date_to,
        dispatcher_id=dispatcher_id,statuses=_sl(statuses),billing_statuses=_sl(billing_statuses),detailed=detailed)
    xlsx=generate_revenue_by_dispatcher_xlsx(data,_filters_str(statuses,billing_statuses,dispatcher_name=dispatcher_name or "All"))
    return Response(xlsx,media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition":"attachment; filename=revenue_by_dispatcher.xlsx"})


# ─── Payment Summary ────────────────────────────────────────────────────────────

@router.get("/payment-summary")
def payment_summary(period:str=Query("last_30_days"),date_from:Optional[date]=None,date_to:Optional[date]=None,db:Session=Depends(get_db)):
    return crud.get_payment_summary_report(db,period=period,date_from=date_from,date_to=date_to)

@router.get("/payment-summary/pdf")
def payment_summary_pdf(period:str=Query("last_30_days"),date_from:Optional[date]=None,date_to:Optional[date]=None,db:Session=Depends(get_db)):
    data=crud.get_payment_summary_report(db,period=period,date_from=date_from,date_to=date_to)
    pdf=generate_payment_summary_pdf(data,{})
    return Response(pdf,media_type="application/pdf",headers={"Content-Disposition":"attachment; filename=payment_summary.pdf"})

@router.get("/payment-summary/xlsx")
def payment_summary_xlsx(period:str=Query("last_30_days"),date_from:Optional[date]=None,date_to:Optional[date]=None,db:Session=Depends(get_db)):
    data=crud.get_payment_summary_report(db,period=period,date_from=date_from,date_to=date_to)
    xlsx=generate_payment_summary_xlsx(data,{})
    return Response(xlsx,media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition":"attachment; filename=payment_summary.xlsx"})


# ─── Expenses ──────────────────────────────────────────────────────────────────

@router.get("/expenses")
def expenses(period:str=Query("last_30_days"),date_from:Optional[date]=None,date_to:Optional[date]=None,
    category:str=Query("All"),detailed:bool=False,db:Session=Depends(get_db)):
    return crud.get_expenses_report(db,period=period,date_from=date_from,date_to=date_to,category=category,detailed=detailed)

@router.get("/expenses/pdf")
def expenses_pdf(period:str=Query("last_30_days"),date_from:Optional[date]=None,date_to:Optional[date]=None,
    category:str=Query("All"),db:Session=Depends(get_db)):
    data=crud.get_expenses_report(db,period=period,date_from=date_from,date_to=date_to,category=category)
    pdf=generate_expenses_pdf(data,{"category":category})
    return Response(pdf,media_type="application/pdf",headers={"Content-Disposition":"attachment; filename=expenses.pdf"})

@router.get("/expenses/xlsx")
def expenses_xlsx(period:str=Query("last_30_days"),date_from:Optional[date]=None,date_to:Optional[date]=None,
    category:str=Query("All"),db:Session=Depends(get_db)):
    data=crud.get_expenses_report(db,period=period,date_from=date_from,date_to=date_to,category=category)
    xlsx=generate_expenses_xlsx(data,{"category":category})
    return Response(xlsx,media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition":"attachment; filename=expenses.xlsx"})


# ─── Gross Profit ───────────────────────────────────────────────────────────────

@router.get("/gross-profit")
def gross_profit(period:str=Query("last_30_days"),date_from:Optional[date]=None,date_to:Optional[date]=None,
    driver_id:Optional[int]=None,truck_id:Optional[int]=None,date_type:str=Query("pickup"),db:Session=Depends(get_db)):
    return crud.get_gross_profit_report(db,period=period,date_from=date_from,date_to=date_to,driver_id=driver_id,truck_id=truck_id,date_type=date_type)

@router.get("/gross-profit/pdf")
def gross_profit_pdf(period:str=Query("last_30_days"),date_from:Optional[date]=None,date_to:Optional[date]=None,
    driver_id:Optional[int]=None,truck_id:Optional[int]=None,date_type:str=Query("pickup"),db:Session=Depends(get_db)):
    data=crud.get_gross_profit_report(db,period=period,date_from=date_from,date_to=date_to,driver_id=driver_id,truck_id=truck_id,date_type=date_type)
    pdf=generate_gross_profit_pdf(data,{})
    return Response(pdf,media_type="application/pdf",headers={"Content-Disposition":"attachment; filename=gross_profit.pdf"})

@router.get("/gross-profit/xlsx")
def gross_profit_xlsx(period:str=Query("last_30_days"),date_from:Optional[date]=None,date_to:Optional[date]=None,
    driver_id:Optional[int]=None,truck_id:Optional[int]=None,date_type:str=Query("pickup"),db:Session=Depends(get_db)):
    data=crud.get_gross_profit_report(db,period=period,date_from=date_from,date_to=date_to,driver_id=driver_id,truck_id=truck_id,date_type=date_type)
    xlsx=generate_gross_profit_xlsx(data,{})
    return Response(xlsx,media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition":"attachment; filename=gross_profit.xlsx"})


# ─── Gross Profit per Load ──────────────────────────────────────────────────────

@router.get("/gross-profit-per-load")
def gross_profit_per_load(period:str=Query("last_30_days"),date_from:Optional[date]=None,date_to:Optional[date]=None,
    broker_id:Optional[int]=None,driver_id:Optional[int]=None,truck_id:Optional[int]=None,
    group_by:str=Query("none"),date_type:str=Query("pickup"),statuses:Optional[str]=None,
    billing_statuses:Optional[str]=None,db:Session=Depends(get_db)):
    return crud.get_gross_profit_per_load_report(db,period=period,date_from=date_from,date_to=date_to,
        broker_id=broker_id,driver_id=driver_id,truck_id=truck_id,group_by=group_by,date_type=date_type,
        statuses=_sl(statuses),billing_statuses=_sl(billing_statuses))

@router.get("/gross-profit-per-load/pdf")
def gross_profit_per_load_pdf(period:str=Query("last_30_days"),date_from:Optional[date]=None,date_to:Optional[date]=None,
    broker_id:Optional[int]=None,driver_id:Optional[int]=None,truck_id:Optional[int]=None,
    group_by:str=Query("none"),date_type:str=Query("pickup"),statuses:Optional[str]=None,
    billing_statuses:Optional[str]=None,db:Session=Depends(get_db)):
    data=crud.get_gross_profit_per_load_report(db,period=period,date_from=date_from,date_to=date_to,
        broker_id=broker_id,driver_id=driver_id,truck_id=truck_id,group_by=group_by,date_type=date_type,
        statuses=_sl(statuses),billing_statuses=_sl(billing_statuses))
    f=_filters_str(statuses,billing_statuses)
    pdf=generate_gross_profit_per_load_pdf(data,f)
    return Response(pdf,media_type="application/pdf",headers={"Content-Disposition":"attachment; filename=gross_profit_per_load.pdf"})

@router.get("/gross-profit-per-load/xlsx")
def gross_profit_per_load_xlsx(period:str=Query("last_30_days"),date_from:Optional[date]=None,date_to:Optional[date]=None,
    broker_id:Optional[int]=None,driver_id:Optional[int]=None,truck_id:Optional[int]=None,
    group_by:str=Query("none"),date_type:str=Query("pickup"),statuses:Optional[str]=None,
    billing_statuses:Optional[str]=None,db:Session=Depends(get_db)):
    data=crud.get_gross_profit_per_load_report(db,period=period,date_from=date_from,date_to=date_to,
        broker_id=broker_id,driver_id=driver_id,truck_id=truck_id,group_by=group_by,date_type=date_type,
        statuses=_sl(statuses),billing_statuses=_sl(billing_statuses))
    xlsx=generate_gross_profit_per_load_xlsx(data,_filters_str(statuses,billing_statuses))
    return Response(xlsx,media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition":"attachment; filename=gross_profit_per_load.xlsx"})


# ─── Profit & Loss ──────────────────────────────────────────────────────────────

@router.get("/profit-loss")
def profit_loss(period:str=Query("last_30_days"),date_from:Optional[date]=None,date_to:Optional[date]=None,
    driver_id:Optional[int]=None,truck_id:Optional[int]=None,date_type:str=Query("pickup"),db:Session=Depends(get_db)):
    return crud.get_profit_loss_report(db,period=period,date_from=date_from,date_to=date_to,driver_id=driver_id,truck_id=truck_id,date_type=date_type)

@router.get("/profit-loss/pdf")
def profit_loss_pdf(period:str=Query("last_30_days"),date_from:Optional[date]=None,date_to:Optional[date]=None,
    driver_id:Optional[int]=None,truck_id:Optional[int]=None,date_type:str=Query("pickup"),db:Session=Depends(get_db)):
    data=crud.get_profit_loss_report(db,period=period,date_from=date_from,date_to=date_to,driver_id=driver_id,truck_id=truck_id,date_type=date_type)
    pdf=generate_profit_loss_pdf(data,{})
    return Response(pdf,media_type="application/pdf",headers={"Content-Disposition":"attachment; filename=profit_loss.pdf"})

@router.get("/profit-loss/xlsx")
def profit_loss_xlsx(period:str=Query("last_30_days"),date_from:Optional[date]=None,date_to:Optional[date]=None,
    driver_id:Optional[int]=None,truck_id:Optional[int]=None,date_type:str=Query("pickup"),db:Session=Depends(get_db)):
    data=crud.get_profit_loss_report(db,period=period,date_from=date_from,date_to=date_to,driver_id=driver_id,truck_id=truck_id,date_type=date_type)
    xlsx=generate_profit_loss_xlsx(data,{})
    return Response(xlsx,media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition":"attachment; filename=profit_loss.xlsx"})
