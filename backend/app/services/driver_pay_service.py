"""
driver_pay_service.py
─────────────────────
All driver-pay math goes through this module.

CRITICAL RULE:
  Computation always uses the snapshot fields stored ON the load itself.
  It NEVER reads from driver.pay_rate_loaded / driver_profiles.freight_percentage at
  computation time for existing loads.  The live profile is only read when creating
  a brand-new snapshot (e.g. when a load is first created or a driver is first assigned).
"""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP
from sqlalchemy.orm import Session

from app.models.models import Load, Driver, DriverProfile, LoadHistory


# Billing statuses where financial data is considered settled / locked
LOCKED_BILLING_STATUSES = {"Invoiced", "Sent to factoring", "Funded", "Paid"}
# Load statuses that additionally lock driver pay
LOCKED_LOAD_STATUSES = {"Delivered", "Closed"}


def money(value) -> float:
    return float(Decimal(str(value or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def rate_or_default(value, default=0.0):
    """Zero is a configured rate, not a missing value."""
    return default if value is None else value


def stored_driver_pay(load: Load) -> float:
    """Shared read path for loads, settlements and reports; never consult live rates."""
    if load.drivers_payable_snapshot is not None:
        return money(load.drivers_payable_snapshot)
    return compute_driver_pay(load) if load.pay_type_snapshot else 0.0


# ─────────────────────────────────────────────────────────────────────────────
# Snapshot capture
# ─────────────────────────────────────────────────────────────────────────────

def take_snapshot(db: Session, load: Load) -> None:
    """
    Read the driver's CURRENT pay rules and freeze them onto the load.

    Call this when:
      - A load is first created (with a driver assigned)
      - A driver is changed on an OPEN load

    Do NOT call this for locked loads (billing locked or delivered/closed).
    """
    from app.services.load_financials import capture_payees
    capture_payees(db, load)
    load.extra_stop_rate_snapshot = 0.0
    refresh_extra_stop_count(load)
    load.driver_pay_override = None
    load.snapshot_overridden = False
    if not load.driver_id:
        # No driver — clear any stale snapshot
        load.pay_type_snapshot = None
        load.payable_to_snapshot = None
        load.pay_rate_loaded_snapshot = None
        load.pay_rate_empty_snapshot = None
        load.freight_percentage_snapshot = None
        load.flatpay_snapshot = None
        load.drivers_payable_snapshot = 0.0
        load.snapshot_taken_at = datetime.utcnow()
        return

    driver: Driver | None = db.query(Driver).filter_by(id=load.driver_id).first()
    profile: DriverProfile | None = (
        db.query(DriverProfile).filter_by(driver_id=load.driver_id).first()
    )

    load.payable_to_snapshot = (profile.payable_to if profile and profile.payable_to else driver.name if driver else None)

    if profile:
        load.pay_type_snapshot = "percentage" if profile.pay_type == "freight_percentage" else (profile.pay_type or "per_mile")
        load.pay_rate_loaded_snapshot = (
            rate_or_default(driver.pay_rate_loaded, 0.65) if driver else 0.0
        )
        load.pay_rate_empty_snapshot = (
            rate_or_default(driver.pay_rate_empty, 0.30) if driver else 0.0
        )
        load.freight_percentage_snapshot = profile.freight_percentage or 0.0
        load.flatpay_snapshot = profile.flatpay or 0.0
        load.extra_stop_rate_snapshot = profile.per_extra_stop or 0.0
    elif driver:
        load.pay_type_snapshot = "per_mile"
        load.pay_rate_loaded_snapshot = rate_or_default(driver.pay_rate_loaded, 0.65)
        load.pay_rate_empty_snapshot = rate_or_default(driver.pay_rate_empty, 0.30)
        load.freight_percentage_snapshot = 0.0
        load.flatpay_snapshot = 0.0
    else:
        load.pay_type_snapshot = "per_mile"
        load.pay_rate_loaded_snapshot = 0.65
        load.pay_rate_empty_snapshot = 0.30
        load.freight_percentage_snapshot = 0.0
        load.flatpay_snapshot = 0.0

    load.snapshot_taken_at = datetime.utcnow()
    load.snapshot_overridden = False
    load.drivers_payable_snapshot = compute_driver_pay(load)


# ─────────────────────────────────────────────────────────────────────────────
# Core computation — ONLY uses snapshot fields
# ─────────────────────────────────────────────────────────────────────────────

def compute_driver_pay(load: Load) -> float:
    """
    Compute driver pay entirely from the load's snapshot fields.
    Never reads from driver.pay_rate_* or driver_profiles.freight_percentage.
    """
    return money(sum(Decimal(str(line["amount"])) for line in driver_pay_lines(load)))


def driver_pay_lines(load: Load) -> list[dict]:
    """The breakdown and total use the same components and cent rounding."""
    if not load.driver_id:
        return []
    pay_type = load.pay_type_snapshot
    lines = []
    override = load.driver_pay_override
    if override:
        kind = override['type']
        if kind == 'fixed':
            lines.append({'label': 'Overridden base pay', 'amount': money(override['amount'])})
        elif kind == 'percentage':
            base = Decimal(str(override['base']))
            pct = Decimal(str(override['percentage']))
            lines.append({'label': f'Override: {pct}% of ${base:,.2f}', 'amount': money(base * pct / 100)})
        elif kind == 'per_mile':
            for label, miles, rate in [('loaded', load.loaded_miles, override['loaded_rate']), ('empty', load.empty_miles, override['empty_rate'])]:
                lines.append({'label': f'Override: {miles or 0} {label} mi × ${rate:g}', 'amount': money(Decimal(str(miles or 0)) * Decimal(str(rate)))})
    elif pay_type in ("percentage", "freight_percentage"):
        pct = Decimal(str(load.freight_percentage_snapshot or 0))
        base = Decimal(str(load.rate or 0))
        lines.append({"label": f"{pct}% of freight ${base:,.2f}", "amount": money(base * pct / 100)})
    elif pay_type == "per_mile":
        for kind, miles, rate in (
            ("loaded", load.loaded_miles, rate_or_default(load.pay_rate_loaded_snapshot, 0.65)),
            ("empty", load.empty_miles, rate_or_default(load.pay_rate_empty_snapshot, 0.30)),
        ):
            lines.append({"label": f"{miles or 0} {kind} mi × ${rate:,.2f}/mi",
                          "amount": money(Decimal(str(miles or 0)) * Decimal(str(rate)))})
    elif pay_type in ("flatpay", "hourly"):
        # Period compensation belongs to a settlement entry, not every load.
        lines.append({"label": "Period pay is recorded separately in payroll", "amount": 0.0})
    stop_count = load.extra_stop_count_snapshot or 0
    stop_rate = load.extra_stop_rate_snapshot or 0
    if override and override['type'] == 'per_mile' and override.get('extra_stop_rate') is not None:
        stop_rate = override['extra_stop_rate']
    if stop_count:
        lines.append({'label': f'{stop_count} extra stops × ${stop_rate:,.2f}', 'amount': money(Decimal(str(stop_count)) * Decimal(str(stop_rate)))})
    for service in load.services or []:
        if service.drivers_payable:
            kind = getattr(service.service_type, "value", service.service_type)
            lines.append({"label": f"{kind} ({service.add_deduct})",
                          "amount": money(service.drivers_payable * (1 if service.add_deduct == "Add" else -1))})
    return lines


# ─────────────────────────────────────────────────────────────────────────────
# Lock check
# ─────────────────────────────────────────────────────────────────────────────

def is_locked(load: Load) -> bool:
    """Return True if this load's financial data must not be mutated."""
    return (
        getattr(load.billing_status, "value", load.billing_status) in LOCKED_BILLING_STATUSES
        or getattr(load.status, "value", load.status) in LOCKED_LOAD_STATUSES
    )


def is_in_settlement(db, load: Load) -> tuple:
    """
    Check if this load is currently included in any active settlement.
    Returns (is_in_settlement, settlement_number, settlement_status) tuple.
    """
    from app.models.models import SettlementItem, Settlement
    item = db.query(SettlementItem).join(Settlement).filter(
        SettlementItem.load_id == load.id,
        Settlement.is_active == True,
        Settlement.status != "Void",
    ).first()
    if not item:
        from app.models.models import SettlementAdjustment, LoadAdditionalPayee
        item = db.query(SettlementAdjustment).join(LoadAdditionalPayee, SettlementAdjustment.load_payee_id == LoadAdditionalPayee.id).join(Settlement, SettlementAdjustment.settlement_id == Settlement.id).filter(
            LoadAdditionalPayee.load_id == load.id, Settlement.is_active == True, Settlement.status != 'Void').first()
    if item:
        s = item.settlement
        status = s.status.value if hasattr(s.status, 'value') else str(s.status)
        return (True, s.settlement_number, status)
    return (False, None, None)


# ─────────────────────────────────────────────────────────────────────────────
# Recalculate (safe)
# ─────────────────────────────────────────────────────────────────────────────

def recalculate_driver_pay(
    db: Session,
    load: Load,
    author: str = "System",
    force: bool = False,
) -> float:
    """
    Recompute driver pay using the load's existing snapshot rules.
    Raises ValueError if the load is locked (unless force=True).
    Adds an audit-log entry.
    """
    if is_locked(load) and not force:
        raise ValueError(
            f"Load #{load.load_number} billing status is '{load.billing_status}' — "
            "historical driver pay cannot be changed without force override."
        )

    # NEW: Check settlement lock
    in_settle, sett_num, sett_status = is_in_settlement(db, load)
    if in_settle and not force:
        raise ValueError(
            f"Load #{load.load_number} is locked in settlement #{sett_num} ({sett_status}). "
            f"Remove the load from the settlement first, then recalculate pay."
        )

    old_pay = load.drivers_payable_snapshot or 0.0
    new_pay = compute_driver_pay(load)
    load.drivers_payable_snapshot = new_pay

    hist = LoadHistory(
        load_id=load.id,
        description=(
            f"Driver pay recalculated using snapshot rules "
            f"(pay_type={load.pay_type_snapshot}, "
            f"rate_loaded={load.pay_rate_loaded_snapshot}, "
            f"rate_empty={load.pay_rate_empty_snapshot}, "
            f"pct={load.freight_percentage_snapshot}): "
            f"${old_pay:.2f} → ${new_pay:.2f}"
        ),
        author=author,
    )
    db.add(hist)
    return new_pay


def refresh_extra_stop_count(load):
    regular = sum(getattr(s.stop_type, 'value', s.stop_type) in ('pickup', 'delivery') for s in load.stops or [])
    other_payable = sum(getattr(s.stop_type, 'value', s.stop_type) == 'other' and bool(s.is_payable) for s in load.stops or [])
    load.extra_stop_count_snapshot = max(regular - 2, 0) + other_payable
