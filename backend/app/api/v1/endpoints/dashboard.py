"""Owner dashboard: any range of statement weeks at a glance, what needs paying now, and the trend."""
from datetime import date, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload

from app.db.session import get_db
from app.models.models import StatementLine, TruckStatement
from app.services import dispatcher_pay, maintenance as mt, weekly_statement as ws
from app.services.driver_pay_service import money

router = APIRouter(tags=["dashboard"])

MIN_TREND_WEEKS = 8


def _weeks_between(first: date, last: date) -> list[date]:
    out, w = [], first
    while w <= last:
        out.append(w); w += timedelta(days=7)
    return out


def _load_statements(db: Session, weeks: list[date]) -> list[TruckStatement]:
    if not weeks:
        return []
    return (db.query(TruckStatement)
              .options(joinedload(TruckStatement.lines).joinedload(StatementLine.load), joinedload(TruckStatement.truck), joinedload(TruckStatement.driver))
              .filter(TruckStatement.period_start.in_(weeks)).all())


def _aggregate(stmts: list[TruckStatement]) -> dict:
    """Totals for a set of statements, the way the board sums a single week."""
    loads = [l for s in stmts for l in s.lines if l.kind == "load"]
    miles = sum(int(l.load.total_miles or 0) for l in loads if l.load)
    gross = money(sum(s.gross or 0 for s in stmts))
    trucks = {s.truck_id for s in stmts}
    return {
        "trucks": len(trucks), "trucks_with_loads": len({s.truck_id for s in stmts if any(l.kind == "load" for l in s.lines)}),
        "loads": len(loads), "miles": miles, "rpm": round(gross / miles, 2) if miles else None,
        "gross": gross, "deductions": money(sum((s.fee or 0) + (s.deductions or 0) for s in stmts)),
        "driver_pay": money(sum(s.driver_pay or 0 for s in stmts)), "driver_payouts": money(sum(s.driver_payout or 0 for s in stmts)),
        "net": money(sum(s.net or 0 for s in stmts)),
    }


@router.get("/dashboard")
def dashboard(date_from: Optional[date] = Query(None, alias="from"), date_to: Optional[date] = Query(None, alias="to"),
              db: Session = Depends(get_db)):
    today = date.today()
    this_week = ws.week_start(today, db=db)
    ws.board(db, this_week)                          # make sure the current week's drafts exist

    # The selected range, snapped to whole statement weeks. Default: this week.
    first = ws.week_start(date_from or today, db=db)
    last = ws.week_start(date_to or date_from or today, db=db)
    if last < first:
        first, last = last, first
    weeks = _weeks_between(first, last)
    prev_weeks = [w - timedelta(days=7 * len(weeks)) for w in weeks]

    stmts = _load_statements(db, weeks)
    period = _aggregate(stmts)
    period.update({"from": first.isoformat(), "to": ws.week_end(last).isoformat(), "weeks": len(weeks),
                   "label": ws.period_label(first) if len(weeks) == 1 else f"{first.month:02d}/{first.day:02d}-{ws.week_end(last).month:02d}/{ws.week_end(last).day:02d}"})
    previous = _aggregate(_load_statements(db, prev_weeks))

    # Where the gross went, by line kind (positive = taken from gross)
    kinds: dict[str, float] = {}
    for s in stmts:
        for l in s.lines:
            if l.kind != "load":
                kinds[l.kind] = kinds.get(l.kind, 0.0) + (l.amount or 0)
    k = lambda name: money(kinds.get(name, 0.0))
    breakdown = {"fee": k("fee"), "fixed": k("template"), "fuel": k("fuel"), "expenses": k("expense"), "other": money(k("manual") + k("carry_in")),
                 "driver_pay": k("driver_pay"), "net": period["net"]}

    # Gross by broker
    by_broker: dict[str, tuple[float, int]] = {}
    for s in stmts:
        for l in s.lines:
            if l.kind == "load":
                name = l.load.broker.name if l.load and l.load.broker else "No broker"
                g, n = by_broker.get(name, (0.0, 0))
                by_broker[name] = (g + abs(l.amount or 0), n + 1)
    brokers = sorted([{"name": n, "gross": money(g), "loads": c} for n, (g, c) in by_broker.items()], key=lambda x: x["gross"], reverse=True)[:8]

    # Trucks over the range
    per_truck: dict[int, dict] = {}
    for s in stmts:
        t = per_truck.setdefault(s.truck_id, {"truck_id": s.truck_id, "unit_number": s.truck.unit_number if s.truck else "?", "driver_name": s.driver.name if s.driver else None,
                                              "loads": 0, "miles": 0, "gross": 0.0, "net": 0.0, "status": s.status})
        t["gross"] += s.gross or 0; t["net"] += s.net or 0
        for l in s.lines:
            if l.kind == "load":
                t["loads"] += 1; t["miles"] += int(l.load.total_miles or 0) if l.load else 0
        if s.period_start == last:
            t["driver_name"] = s.driver.name if s.driver else t["driver_name"]; t["status"] = s.status
    top = sorted([t for t in per_truck.values() if t["loads"]], key=lambda t: t["gross"], reverse=True)[:10]
    for t in top:
        t["gross"] = money(t["gross"]); t["net"] = money(t["net"]); t["rpm"] = round(t["gross"] / t["miles"], 2) if t["miles"] else None

    # What needs paying right now (independent of the range)
    rows_now = ws.board(db, this_week)
    unpaid = db.query(TruckStatement).filter(TruckStatement.status == "ready").all()
    negative = [r for r in rows_now if r["net"] < 0]
    disp = dispatcher_pay.week_rows(db, this_week)
    month = today.strftime("%Y-%m")
    from app.api.v1.endpoints.office import bills_for_month
    bills = bills_for_month(month, db)
    maint = mt.board(db, today)
    due_services = [{"unit_number": r["unit_number"], "service_type": s["service_type"], "status": s["status"],
                     "miles_left": s["miles_left"], "days_left": s["days_left"]}
                    for r in maint["rows"] for s in r["services"] if s["status"] in ("RED", "AMBER")]
    due_services.sort(key=lambda x: (x["status"] != "RED", x["miles_left"] if x["miles_left"] is not None else 10**9))
    bills_due_soon = [b for b in bills["rows"] if not b["paid"] and b["due_day"] <= today.day + 7]
    attention = {
        "statements_ready": {"count": len(unpaid), "driver_payouts": money(sum(s.driver_payout for s in unpaid)), "net": money(sum(s.net for s in unpaid))},
        "negative_weeks": {"count": len(negative), "amount": money(sum(r["net"] for r in negative)), "units": [r["unit_number"] for r in negative][:8]},
        "idle_trucks": {"count": sum(1 for r in rows_now if not r["loads"]), "units": [r["unit_number"] for r in rows_now if not r["loads"]][:8]},
        "dispatchers_unpaid": {"count": sum(1 for d in disp if d["commission"] > 0 and not d["paid"]), "amount": money(sum(d["commission"] for d in disp if d["commission"] > 0 and not d["paid"]))},
        "bills": {"month": month, "remaining": bills["totals"]["remaining"], "unpaid_count": bills["totals"]["count"] - bills["totals"]["paid_count"],
                  "due_soon": [{"label": b["label"], "amount": b["amount"], "due_day": b["due_day"], "overdue": b["due_day"] < today.day} for b in bills_due_soon][:6]},
        "maintenance": {"due": maint["counts"]["RED"], "soon": maint["counts"]["AMBER"], "items": due_services[:6]},
    }

    # Trend: the range's weeks, padded backwards to at least MIN_TREND_WEEKS
    trend_weeks = _weeks_between(min(first, last - timedelta(days=7 * (MIN_TREND_WEEKS - 1))), last)
    per_week = {w: [] for w in trend_weeks}
    for s in _load_statements(db, trend_weeks):
        per_week[s.period_start].append(s)
    trend = []
    for w in trend_weeks:
        agg = _aggregate(per_week[w])
        trend.append({"period_start": w.isoformat(), "label": ws.period_label(w), "in_range": first <= w <= last,
                      "gross": agg["gross"], "net": agg["net"], "driver_pay": agg["driver_pay"], "deductions": agg["deductions"],
                      "loads": agg["loads"], "miles": agg["miles"], "rpm": agg["rpm"]})

    return {"today": today.isoformat(), "this_week_start": this_week.isoformat(), "period": period, "previous": previous,
            "attention": attention, "trend": trend, "breakdown": breakdown, "brokers": brokers, "top_trucks": top}
