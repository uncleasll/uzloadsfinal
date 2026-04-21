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
from sqlalchemy.orm import Session

from app.models.models import Load, Driver, DriverProfile, LoadHistory


# Billing statuses where financial data is considered settled / locked
LOCKED_BILLING_STATUSES = {"Invoiced", "Sent to factoring", "Funded", "Paid"}
# Load statuses that additionally lock driver pay
LOCKED_LOAD_STATUSES = {"Delivered", "Closed"}


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
    if not load.driver_id:
        # No driver — clear any stale snapshot
        load.pay_type_snapshot = None
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

    if profile:
        load.pay_type_snapshot = profile.pay_type or "per_mile"
        load.pay_rate_loaded_snapshot = (
            getattr(profile, "pay_rate_loaded", None)
            or (driver.pay_rate_loaded if driver else 0.65)
        )
        load.pay_rate_empty_snapshot = (
            getattr(profile, "pay_rate_empty", None)
            or (driver.pay_rate_empty if driver else 0.30)
        )
        load.freight_percentage_snapshot = profile.freight_percentage or 0.0
        load.flatpay_snapshot = profile.flatpay or 0.0
    elif driver:
        load.pay_type_snapshot = "per_mile"
        load.pay_rate_loaded_snapshot = driver.pay_rate_loaded or 0.65
        load.pay_rate_empty_snapshot = driver.pay_rate_empty or 0.30
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
    pay_type = load.pay_type_snapshot or "per_mile"

    if pay_type == "percentage":
        pct = (load.freight_percentage_snapshot or 0.0) / 100.0
        base = (load.rate or 0.0) * pct
        # Services that go to driver
        svc_adj = sum(
            (s.drivers_payable if s.add_deduct == "Add" else -s.drivers_payable)
            for s in (load.services or [])
        )
        return round(base + svc_adj, 2)

    elif pay_type == "flatpay":
        return round(load.flatpay_snapshot or 0.0, 2)

    else:  # per_mile (default)
        loaded = (load.loaded_miles or 0) * (load.pay_rate_loaded_snapshot or 0.65)
        empty = (load.empty_miles or 0) * (load.pay_rate_empty_snapshot or 0.30)
        return round(loaded + empty, 2)


# ─────────────────────────────────────────────────────────────────────────────
# Lock check
# ─────────────────────────────────────────────────────────────────────────────

def is_locked(load: Load) -> bool:
    """Return True if this load's financial data must not be mutated."""
    return (
        str(load.billing_status) in LOCKED_BILLING_STATUSES
        or str(load.status) in LOCKED_LOAD_STATUSES
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
    ).first()
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
