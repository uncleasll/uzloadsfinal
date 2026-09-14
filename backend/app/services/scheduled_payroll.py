"""Calendar-based payroll candidates; application dates are unique across settlements.

Calendar anchoring is verified against EZLoads' unsaved schedule previews.
Old applications without a source/date link require explicit reconciliation.
"""
from calendar import monthrange
from datetime import timedelta
from decimal import Decimal
from app.services.driver_pay_service import money
from app.models.models import SettlementAdjustment, DriverScheduledTransaction


def occurrence_date(start, schedule, index):
    if schedule in ('daily', 'weekly', 'biweekly'):
        return start + timedelta(days={'daily': 1, 'weekly': 7, 'biweekly': 14}[schedule] * index)
    if schedule in ('monthly', 'annual', 'annually'):
        month_index = start.year * 12 + start.month - 1 + index * (1 if schedule == 'monthly' else 12)
        year, month = divmod(month_index, 12)
        month += 1
        return start.replace(year=year, month=month, day=min(start.day, monthrange(year, month)[1]))
    raise ValueError('Select a supported recurring schedule.')


def schedule_dates(tx, through):
    if not tx.start_date:
        return []
    if tx.repeat_type == 'times' and (not tx.repeat_times or tx.repeat_times < 1):
        return []
    if tx.repeat_type == 'until' and not tx.end_date:
        return []
    end = min(through, tx.end_date) if tx.end_date else through
    result = []
    for index in range(100000):
        if tx.repeat_type == 'times' and index >= tx.repeat_times:
            break
        due = occurrence_date(tx.start_date, tx.schedule, index)
        if installment_amount(tx, index) <= 0:
            break
        if due > end:
            break
        result.append(due)
    else:
        raise ValueError('Schedule period is too large.')
    return result


def applications(db, tx_id):
    return db.query(SettlementAdjustment).filter(SettlementAdjustment.scheduled_transaction_id == tx_id).all()


def available_dates(db, tx, through):
    if not tx.is_active:
        return []
    applied = applications(db, tx.id)
    # Legacy counters cannot identify which dates were already charged.
    if (tx.times_applied or 0) > len(applied):
        return []
    used = {a.date for a in applied}
    return [d for d in schedule_dates(tx, through) if d not in used]


def refresh_counters(db, tx):
    db.flush()
    rows = applications(db, tx.id)
    tx.times_applied = len(rows)
    tx.last_applied = max((a.date for a in rows), default=None)
    used = {a.date for a in rows}
    tx.next_due = None
    if tx.start_date:
        for index in range(len(rows) + 1):
            if tx.repeat_type == 'times' and index >= (tx.repeat_times or 0):
                break
            due = occurrence_date(tx.start_date, tx.schedule, index)
            if installment_amount(tx, index) <= 0:
                break
            if tx.end_date and due > tx.end_date:
                break
            if due not in used:
                tx.next_due = due
                break


def release_application(db, adj):
    if adj.scheduled_transaction_id is None:
        return
    tx = db.query(DriverScheduledTransaction).filter(DriverScheduledTransaction.id == adj.scheduled_transaction_id).with_for_update().one()
    adj.scheduled_transaction_id = None
    refresh_counters(db, tx)


def installment_amount(tx, index):
    if tx.trans_type not in ('loan', 'escrow'):
        return money(tx.amount)
    if not tx.deduct_by or tx.deduct_by <= 0:
        return 0.0
    principal = Decimal(str(money(tx.amount)))
    step = Decimal(str(money(tx.deduct_by)))
    return money(max(Decimal(0), min(step, principal - step * index)))


def amount_for_date(tx, due):
    dates = schedule_dates(tx, due)
    if not dates or dates[-1] != due:
        raise ValueError('Invalid scheduled date')
    return installment_amount(tx, len(dates) - 1)


def generate_occurrences(db, tx, through):
    from app.models.models import ScheduledPayrollOccurrence, DriverProfile, Driver
    if not tx.is_active or (tx.times_applied or 0) > len(applications(db, tx.id)):
        return 0
    if not tx.start_date or not tx.schedule:
        return 0
    existing = {r.date for r in db.query(ScheduledPayrollOccurrence).filter(ScheduledPayrollOccurrence.scheduled_transaction_id == tx.id)}
    profile = db.query(DriverProfile).filter(DriverProfile.driver_id == tx.driver_id).first()
    driver = db.query(Driver).filter(Driver.id == tx.driver_id).one()
    payee = tx.payable_to or (profile.payable_to if profile else None) or driver.name
    created = 0
    for index, due in enumerate(schedule_dates(tx, through)):
        if due in existing:
            continue
        db.add(ScheduledPayrollOccurrence(scheduled_transaction_id=tx.id, driver_id=tx.driver_id,
            payable_to=payee, date=due, amount=installment_amount(tx, index),
            adj_type='addition' if tx.trans_type == 'addition' else 'deduction',
            category=tx.category or tx.trans_type,
            description=tx.settlement_description or tx.description or tx.category or ''))
        created += 1
    db.flush()
    return created


def run_schedules(db, through, driver_id=None):
    query = db.query(DriverScheduledTransaction).filter(DriverScheduledTransaction.is_active == True)
    if driver_id is not None:
        query = query.filter(DriverScheduledTransaction.driver_id == driver_id)
    count = 0
    for tx in query.order_by(DriverScheduledTransaction.id).with_for_update().all():
        count += generate_occurrences(db, tx, through)
    return count


def unassigned_occurrences(db, settlement):
    from app.models.models import ScheduledPayrollOccurrence as Occ
    from sqlalchemy import exists
    used = exists().where(SettlementAdjustment.scheduled_transaction_id == Occ.scheduled_transaction_id, SettlementAdjustment.date == Occ.date)
    return db.query(Occ).filter(Occ.driver_id == settlement.driver_id, Occ.payable_to == settlement.payable_to,
        Occ.date <= settlement.date, ~used).order_by(Occ.date, Occ.id).all()
