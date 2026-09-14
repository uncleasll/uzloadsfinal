"""Generate due payroll entries hourly; row locks and unique dates allow multiple workers."""
import asyncio
import logging
from datetime import date
from app.db.session import SessionLocal
from app.services.scheduled_payroll import run_schedules


def generate_due_payroll():
    with SessionLocal() as db:
        count = run_schedules(db, date.today())
        db.commit()
        return count


async def scheduled_payroll_loop():
    while True:
        try:
            await asyncio.to_thread(generate_due_payroll)
        except Exception:
            logging.getLogger(__name__).exception('Scheduled payroll generation failed')
        await asyncio.sleep(3600)
