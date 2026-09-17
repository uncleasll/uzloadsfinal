"""Owner dashboard: this week at a glance, what needs paying, what is due, and the recent trend."""
from datetime import date, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.models import TruckStatement
from app.services import dispatcher_pay, maintenance as mt, weekly_statement as ws
from app.services.driver_pay_service import money

router = APIRouter(tags=["dashboard"])


@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db)):
    today = date.today()
    start = ws.week_start(today, db=db)
    rows = ws.board(db, start)                      # generates drafts for the current week
    prev_start = start - timedelta(days=7)
    prev = {s.truck_id: s for s in db.query(TruckStatement).filter(TruckStatement.period_start == prev_start).all()}

    def total(key, items):
        return money(sum(r[key] for r in items))

    this_week = {
        "period": ws.period_label(start), "period_start": start.isoformat(), "period_end": ws.week_end(start).isoformat(),
        "trucks": len(rows), "trucks_with_loads": sum(1 for r in rows if r["loads"]),
        "loads": sum(r["loads"] for r in rows), "miles": sum(r["miles"] for r in rows),
        "gross": total("gross", rows), "deductions": money(total("fee", rows) + total("deductions", rows)),
        "driver_pay": total("driver_pay", rows), "driver_payouts": total("driver_payout", rows), "net": total("net", rows),
    }
    this_week["rpm"] = round(this_week["gross"] / this_week["miles"], 2) if this_week["miles"] else None
    last_week = {
        "gross": money(sum(s.gross for s in prev.values())), "net": money(sum(s.net for s in prev.values())),
        "loads": sum(len([l for l in s.lines if l.kind == "load"]) for s in prev.values()),
    }

    # What needs paying: statements that are ready but not paid (any week), negative weeks, dispatchers, bills
    unpaid = (db.query(TruckStatement).filter(TruckStatement.status == "ready").all())
    negative = [r for r in rows if r["net"] < 0]
    disp = dispatcher_pay.week_rows(db, start)
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
        "idle_trucks": {"count": sum(1 for r in rows if not r["loads"]), "units": [r["unit_number"] for r in rows if not r["loads"]][:8]},
        "dispatchers_unpaid": {"count": sum(1 for d in disp if d["commission"] > 0 and not d["paid"]), "amount": money(sum(d["commission"] for d in disp if d["commission"] > 0 and not d["paid"]))},
        "bills": {"month": month, "remaining": bills["totals"]["remaining"], "unpaid_count": bills["totals"]["count"] - bills["totals"]["paid_count"],
                  "due_soon": [{"label": b["label"], "amount": b["amount"], "due_day": b["due_day"], "overdue": b["due_day"] < today.day} for b in bills_due_soon][:6]},
        "maintenance": {"due": maint["counts"]["RED"], "soon": maint["counts"]["AMBER"], "items": due_services[:6]},
    }

    # Trend: last 8 weeks from stored statements (no generation for old weeks)
    weeks = [start - timedelta(days=7 * i) for i in range(7, -1, -1)]
    agg = {p: (g or 0, n or 0) for p, g, n in db.query(TruckStatement.period_start, func.sum(TruckStatement.gross), func.sum(TruckStatement.net))
           .filter(TruckStatement.period_start.in_(weeks)).group_by(TruckStatement.period_start).all()}
    trend = [{"period_start": w.isoformat(), "label": ws.period_label(w), "gross": money(agg.get(w, (0, 0))[0] or 0), "net": money(agg.get(w, (0, 0))[1] or 0)} for w in weeks]
    trend[-1]["gross"], trend[-1]["net"] = this_week["gross"], this_week["net"]

    top = sorted([r for r in rows if r["loads"]], key=lambda r: r["gross"], reverse=True)[:8]
    return {"today": today.isoformat(), "this_week": this_week, "last_week": last_week, "attention": attention, "trend": trend,
            "top_trucks": [{"truck_id": r["truck_id"], "unit_number": r["unit_number"], "driver_name": r["driver_name"], "loads": r["loads"],
                            "gross": r["gross"], "net": r["net"], "rpm": r["rpm"], "status": r["status"]} for r in top]}
