"""Preview historical aggregate corrections after migration 010; --apply persists them.

Run from backend: python scripts/reconcile_payroll.py [--apply]
Never replaces load snapshots with current driver rates.
"""
import argparse
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.db.session import SessionLocal
from app.models.models import Settlement
from app.crud.payroll import settlement_totals


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    with SessionLocal() as db:
        query = db.query(Settlement).filter(Settlement.is_active == True)
        if args.apply:
            query = query.with_for_update()
        settlements = query.all()
        blocked = [s.settlement_number for s in settlements if any(p.is_carryover for p in s.payments)]
        if blocked:
            print('Legacy carryover payments require manual reconciliation:', blocked)
            if args.apply:
                raise SystemExit('No changes applied. Reconcile those debt transfers first.')
        changed = 0
        for s in settlements:
            total, due = settlement_totals(s)
            if (s.settlement_total, s.balance_due) != (total, due):
                changed += 1
                print(f'#{s.settlement_number}: total {s.settlement_total:.2f} -> {total:.2f}; due {s.balance_due:.2f} -> {due:.2f}')
                if args.apply:
                    s.settlement_total, s.balance_due = total, due
        if args.apply:
            db.commit()
        print(f'{changed} settlement(s). ' + ('Applied; statuses preserved.' if args.apply else 'Preview only; nothing changed.'))


if __name__ == '__main__':
    main()
