from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from typing import Optional, List
from datetime import date, timedelta
from app.models.models import Load, LoadStop, Driver, Broker, Truck, Dispatcher, LoadService, Settlement, SettlementPayment


def period_dates(period: str):
    today = date.today()
    if period == "today":
        return today, today
    elif period == "yesterday":
        y = today - timedelta(days=1); return y, y
    elif period == "this_week":
        return today - timedelta(days=today.weekday()), today
    elif period == "last_week":
        s = today - timedelta(days=today.weekday()+7); return s, s+timedelta(days=6)
    elif period == "last_7_days":
        return today - timedelta(days=7), today
    elif period == "last_30_days":
        return today - timedelta(days=30), today
    elif period == "this_month":
        return today.replace(day=1), today
    elif period == "last_month":
        f = today.replace(day=1); e = f - timedelta(days=1); return e.replace(day=1), e
    elif period == "last_3_months":
        return today - timedelta(days=90), today
    elif period == "last_6_months":
        return today - timedelta(days=180), today
    elif period == "this_year":
        return today.replace(month=1, day=1), today
    elif period == "last_year":
        return date(today.year-1,1,1), date(today.year-1,12,31)
    return today - timedelta(days=30), today


def _base_load_query(db, period, date_from, date_to, broker_id, driver_id, truck_id, dispatcher_id, statuses, billing_statuses):
    if not date_from or not date_to:
        df, dt = period_dates(period)
        date_from = date_from or df
        date_to = date_to or dt
    q = db.query(Load).options(
        joinedload(Load.driver), joinedload(Load.broker),
        joinedload(Load.truck), joinedload(Load.dispatcher),
        joinedload(Load.stops), joinedload(Load.services),
    ).filter(Load.is_active == True, Load.load_date >= date_from, Load.load_date <= date_to)
    if broker_id: q = q.filter(Load.broker_id == broker_id)
    if driver_id: q = q.filter(Load.driver_id == driver_id)
    if truck_id:  q = q.filter(Load.truck_id == truck_id)
    if dispatcher_id: q = q.filter(Load.dispatcher_id == dispatcher_id)
    if statuses:  q = q.filter(Load.status.in_(statuses))
    if billing_statuses: q = q.filter(Load.billing_status.in_(billing_statuses))
    return q.order_by(Load.load_date), date_from, date_to


def _row(load):
    pickup = next((s for s in load.stops if s.stop_type.value=='pickup'), None)
    delivery = next((s for s in load.stops if s.stop_type.value=='delivery'), None)
    d = load.driver
    pay = (load.loaded_miles*(d.pay_rate_loaded if d else 0.65))+(load.empty_miles*(d.pay_rate_empty if d else 0.30)) if d else 0.0
    lumpers = sum(s.invoice_amount for s in load.services if s.service_type.value=='Lumper')
    other_add = sum((s.invoice_amount if s.add_deduct=='Add' else -s.invoice_amount) for s in load.services if s.service_type.value!='Lumper')
    qp_fee = 0.0
    gross = load.rate + lumpers + other_add - pay - qp_fee
    return {
        "load_number": load.load_number, "load_date": str(load.load_date),
        "actual_delivery_date": str(load.actual_delivery_date) if load.actual_delivery_date else None,
        "pickup_city": pickup.city if pickup else "", "pickup_state": pickup.state if pickup else "",
        "pickup_date": str(pickup.stop_date) if pickup and pickup.stop_date else "",
        "delivery_city": delivery.city if delivery else "", "delivery_state": delivery.state if delivery else "",
        "delivery_date": str(delivery.stop_date) if delivery and delivery.stop_date else "",
        "broker": load.broker.name if load.broker else "",
        "driver": f"{d.name} [{d.driver_type}]" if d else "",
        "driver_name": d.name if d else "",
        "dispatcher": load.dispatcher.name if load.dispatcher else "",
        "truck": load.truck.unit_number if load.truck else "",
        "rate": load.rate, "total_miles": load.total_miles,
        "loaded_miles": load.loaded_miles, "empty_miles": load.empty_miles,
        "rate_per_mile": round(load.rate/load.loaded_miles,4) if load.loaded_miles else 0,
        "driver_pay": round(pay,2), "lumpers": round(lumpers,2),
        "other_add_ded": round(other_add,2), "qp_fee": qp_fee,
        "gross_profit": round(gross,2),
        "status": load.status.value, "billing_status": load.billing_status.value,
        "po_number": load.po_number or "",
    }


def get_total_revenue_report(db, period="last_30_days", date_from=None, date_to=None,
    broker_id=None, driver_id=None, truck_id=None, group_by="none", date_type="pickup",
    statuses=None, billing_statuses=None):
    q, date_from, date_to = _base_load_query(db, period, date_from, date_to, broker_id, driver_id, truck_id, None, statuses, billing_statuses)
    loads = q.all()
    rows = [_row(l) for l in loads]
    total_revenue = sum(r["rate"] for r in rows)
    total_miles = sum(r["total_miles"] for r in rows)
    return {"rows": rows, "summary": {"total_revenue": total_revenue, "total_miles": total_miles,
        "total_loads": len(rows), "rate_per_mile": round(total_revenue/total_miles,4) if total_miles else 0},
        "date_from": str(date_from), "date_to": str(date_to)}


def get_rate_per_mile_report(db, period="last_30_days", date_from=None, date_to=None,
    broker_id=None, driver_id=None, truck_id=None, dispatcher_id=None,
    group_by="none", date_type="pickup", statuses=None, billing_statuses=None,
    change_to_overridden=False):
    q, date_from, date_to = _base_load_query(db, period, date_from, date_to, broker_id, driver_id, truck_id, dispatcher_id, statuses, billing_statuses)
    loads = q.all()
    rows = [_row(l) for l in loads]
    total_revenue = sum(r["rate"] for r in rows)
    total_miles = sum(r["total_miles"] for r in rows)
    return {"rows": rows, "summary": {"total_revenue": total_revenue, "total_miles": total_miles,
        "total_loads": len(rows), "rate_per_mile": round(total_revenue/total_miles,4) if total_miles else 0},
        "date_from": str(date_from), "date_to": str(date_to)}


def get_revenue_by_dispatcher_report(db, period="last_30_days", date_from=None, date_to=None,
    dispatcher_id=None, statuses=None, billing_statuses=None, detailed=False):
    q, date_from, date_to = _base_load_query(db, period, date_from, date_to, None, None, None, dispatcher_id, statuses, billing_statuses)
    loads = q.all()
    groups = {}
    for load in loads:
        disp_name = load.dispatcher.name if load.dispatcher else "Unassigned"
        if disp_name not in groups:
            groups[disp_name] = {"dispatcher": disp_name, "loads": [], "rate_amount": 0.0, "overridden_rate": 0.0}
        groups[disp_name]["loads"].append(_row(load))
        groups[disp_name]["rate_amount"] += load.rate
        groups[disp_name]["overridden_rate"] += load.rate
    rows = list(groups.values())
    return {"rows": rows, "date_from": str(date_from), "date_to": str(date_to),
        "summary": {"total": sum(r["rate_amount"] for r in rows)}}


def get_payment_summary_report(db, period="last_30_days", date_from=None, date_to=None):
    if not date_from or not date_to:
        df, dt = period_dates(period)
        date_from = date_from or df; date_to = date_to or dt
    settlements = db.query(Settlement).options(
        joinedload(Settlement.driver), joinedload(Settlement.payments)
    ).filter(Settlement.is_active==True, Settlement.date>=date_from, Settlement.date<=date_to).all()
    rows = []
    for s in settlements:
        rows.append({"driver_name": s.driver.name if s.driver else "", "payable_to": s.payable_to or "",
            "total_amount": s.settlement_total, "balance_due": s.balance_due})
    return {"rows": rows, "date_from": str(date_from), "date_to": str(date_to),
        "summary": {"total_amount": sum(r["total_amount"] for r in rows), "total_balance": sum(r["balance_due"] for r in rows)}}


def get_expenses_report(db, period="last_30_days", date_from=None, date_to=None, category="All", detailed=False):
    if not date_from or not date_to:
        df, dt = period_dates(period)
        date_from = date_from or df; date_to = date_to or dt
    return {"rows": [], "date_from": str(date_from), "date_to": str(date_to), "category": category,
        "summary": {"total": 0.0}}


def get_gross_profit_report(db, period="last_30_days", date_from=None, date_to=None,
    driver_id=None, truck_id=None, date_type="pickup"):
    q, date_from, date_to = _base_load_query(db, period, date_from, date_to, None, driver_id, truck_id, None, None, None)
    loads = q.all()
    rows = [_row(l) for l in loads]
    total_revenue = sum(r["rate"] for r in rows)
    driver_payments = sum(r["driver_pay"] for r in rows)
    gross_profit = total_revenue - driver_payments
    driver_name = ""
    if driver_id:
        d = db.query(Driver).filter(Driver.id==driver_id).first()
        if d: driver_name = f"{d.name} [{d.driver_type}]"
    truck_unit = ""
    if truck_id:
        t = db.query(Truck).filter(Truck.id==truck_id).first()
        if t: truck_unit = t.unit_number
    return {"rows": rows, "date_from": str(date_from), "date_to": str(date_to),
        "driver_name": driver_name, "truck_unit": truck_unit,
        "summary": {"total_revenue": total_revenue, "loads_revenue": total_revenue, "other_revenue": 0.0,
            "driver_payments": driver_payments, "fuel": 0.0, "tolls": 0.0, "gross_profit": gross_profit}}


def get_gross_profit_per_load_report(db, period="last_30_days", date_from=None, date_to=None,
    broker_id=None, driver_id=None, truck_id=None, group_by="none", date_type="pickup",
    statuses=None, billing_statuses=None):
    q, date_from, date_to = _base_load_query(db, period, date_from, date_to, broker_id, driver_id, truck_id, None, statuses, billing_statuses)
    loads = q.all()
    rows = [_row(l) for l in loads]
    driver_name = ""
    if driver_id:
        d = db.query(Driver).filter(Driver.id==driver_id).first()
        if d: driver_name = f"{d.name} [{d.driver_type}]"
    truck_unit = ""
    if truck_id:
        t = db.query(Truck).filter(Truck.id==truck_id).first()
        if t: truck_unit = t.unit_number
    return {"rows": rows, "date_from": str(date_from), "date_to": str(date_to),
        "driver_name": driver_name, "truck_unit": truck_unit,
        "summary": {"total_revenue": sum(r["rate"] for r in rows), "total_driver_pay": sum(r["driver_pay"] for r in rows),
            "total_gross_profit": sum(r["gross_profit"] for r in rows)}}


def get_profit_loss_report(db, period="last_30_days", date_from=None, date_to=None,
    driver_id=None, truck_id=None, date_type="pickup"):
    data = get_gross_profit_report(db, period, date_from, date_to, driver_id, truck_id, date_type)
    data["summary"]["expenses"] = 0.0
    data["summary"]["net_profit"] = data["summary"]["gross_profit"] - data["summary"]["expenses"]
    return data
