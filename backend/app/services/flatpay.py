"""Keep the driver's period compensation in the recurring payroll workflow."""
import math
from app.models.models import DriverScheduledTransaction, ScheduledPayrollOccurrence
from app.crud.payroll import PayrollError
from app.services.driver_pay_service import money


def sync_flatpay(db, driver, profile):
    key = f'flatpay:{driver.id}'
    tx = db.query(DriverScheduledTransaction).filter(DriverScheduledTransaction.source_key == key).with_for_update().first()
    if profile.pay_type != 'flatpay':
        if tx:
            tx.is_active = False
        return
    # Do not invent start dates for profiles created before this feature.
    if not profile.flatpay_start_date or not profile.flatpay_period:
        raise PayrollError('Flatpay needs its own starting date and period.')
    if not profile.flatpay or not math.isfinite(profile.flatpay) or money(profile.flatpay) <= 0:
        raise PayrollError('Flatpay amount must be positive.')
    values = dict(amount=money(profile.flatpay), schedule=profile.flatpay_period,
                  start_date=profile.flatpay_start_date, payable_to=profile.payable_to or driver.name)
    if tx and any(getattr(tx, k) != v for k, v in values.items()):
        latest = db.query(ScheduledPayrollOccurrence).filter_by(scheduled_transaction_id=tx.id).order_by(ScheduledPayrollOccurrence.date.desc()).first()
        if latest:
            if profile.flatpay_start_date <= latest.date:
                raise PayrollError('Start the revised flatpay schedule after the last generated period; existing pay is preserved.')
            tx.source_key = None
            tx.is_active = False
            db.flush()
            tx = None
        elif tx.times_applied:
            raise PayrollError('Reconcile legacy flatpay applications before changing this schedule.')
    if not tx:
        tx = DriverScheduledTransaction(driver_id=driver.id, source_key=key, trans_type='addition',
            category='Driver payments', description='Flatpay', repeat_type='always', **values)
        db.add(tx)
    else:
        for k, v in values.items():
            setattr(tx, k, v)
    tx.is_active = driver.is_active
    if not tx.times_applied:
        tx.next_due = profile.flatpay_start_date
