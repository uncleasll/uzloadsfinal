"""Shared date basis for open balances and load reports."""
from sqlalchemy import select, func
from app.models.models import Load, LoadStop, StopType


def payroll_date_column(date_type):
    if date_type == 'delivery':
        return Load.actual_delivery_date
    if date_type != 'pickup':
        raise ValueError('date_type must be pickup or delivery')
    pickup = select(func.min(LoadStop.stop_date)).where(
        LoadStop.load_id == Load.id, LoadStop.stop_type == StopType.PICKUP,
    ).correlate(Load).scalar_subquery()
    return func.coalesce(pickup, Load.load_date)
