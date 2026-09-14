"""Reference-verified bases: payee percentage uses freight; quickpay uses invoice."""
from decimal import Decimal
from app.models.models import Broker, DriverAdditionalPayee, LoadAdditionalPayee
from app.services.driver_pay_service import money


def capture_quickpay(db, load):
    broker = db.query(Broker).filter(Broker.id == load.broker_id).first() if load.broker_id else None
    load.quickpay_rate_snapshot = broker.quickpay_fee or 0 if broker else 0


def invoice_amount(load):
    return money(Decimal(str(load.rate or 0)) + sum((Decimal(str(s.invoice_amount or 0)) * (1 if s.add_deduct == 'Add' else -1) for s in load.services or []), Decimal(0)))


def quickpay_fee(load):
    return money(Decimal(str(invoice_amount(load))) * Decimal(str(load.quickpay_rate_snapshot or 0)) / 100)


def capture_payees(db, load):
    load.additional_payees.clear()
    db.flush()
    refresh_payees(db, load)


def refresh_payees(db, load):
    if not load.driver_id:
        return
    existing = {entry.vendor_id for entry in load.additional_payees}
    rules = db.query(DriverAdditionalPayee).filter(DriverAdditionalPayee.driver_id == load.driver_id, DriverAdditionalPayee.is_active == True).all()
    for rule in rules:
        if rule.vendor_id not in existing and rule.vendor.is_active:
            load.additional_payees.append(LoadAdditionalPayee(driver_id=load.driver_id, vendor_id=rule.vendor_id,
                payable_to=rule.vendor.company_name, rate_pct=rule.rate_pct, date=load.load_date, base_amount=0, amount=0))
    for entry in load.additional_payees:
        entry.base_amount = load.rate or 0
        entry.amount = money(Decimal(str(entry.base_amount)) * Decimal(str(entry.rate_pct)) / 100)
        entry.date = load.load_date
