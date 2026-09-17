"""Weekly truck statements must reproduce the STATEMENTS 2025 Excel blocks to the cent.
In-memory SQLite only; never touches the configured database."""
import os
os.environ['DATABASE_URL'] = 'sqlite://'
import unittest
from datetime import date
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.models.models import (Base, Driver, DriverDeduction, Expense, Load, LoadStatus, BillingStatus, LoadStop, StopType,
                               Truck, TruckDeduction, Broker)
from app.services import weekly_statement as ws
from app.api.v1 import api_router
from app.db.session import get_db

WEEK = date(2025, 12, 27)   # Saturday; Excel block "12/27-01/02"


class WeeklyStatementCase(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine, autoflush=False)
        self.broker = Broker(name='RXO', is_active=True)
        self.db.add(self.broker); self.db.commit()

    def tearDown(self):
        self.db.close(); self.engine.dispose()

    def truck(self, unit, fee_pct, template, driver=None):
        t = Truck(unit_number=unit, is_active=True, fee_pct=fee_pct, driver=driver)
        self.db.add(t); self.db.flush()
        for i, (label, amount) in enumerate(template):
            self.db.add(TruckDeduction(truck_id=t.id, label=label, amount=amount, sort_order=i))
        self.db.commit()
        return t

    def driver(self, name, pay_type, pct=30.0, per_mile=0.55, deductions=()):
        d = Driver(name=name, is_active=True, pay_type=pay_type, pay_pct=pct, per_mile_rate=per_mile)
        self.db.add(d); self.db.flush()
        for label, amount in deductions:
            self.db.add(DriverDeduction(driver_id=d.id, label=label, amount=amount))
        self.db.commit()
        return d

    def load(self, truck, driver, number, pickup, rate):
        l = Load(load_number=number, truck_id=truck.id, driver_id=driver.id if driver else None, broker_id=self.broker.id,
                 load_date=pickup, rate=rate, is_active=True, status=LoadStatus.DELIVERED, billing_status=BillingStatus.PENDING)
        l.stops.append(LoadStop(stop_type=StopType.PICKUP, stop_order=1, city='A', state='NJ', stop_date=pickup))
        self.db.add(l); self.db.commit()
        return l

    def expense(self, truck, day, category, amount, description=''):
        e = Expense(expense_date=day, category=category, amount=amount, truck_id=truck.id, is_active=True, description=description)
        self.db.add(e); self.db.commit()
        return e

    COMPANY_TEMPLATE = [('CARGO INS', 250.0), ('ELD', 50.0), ('SAFETY', 75.0), ('PHYSICAL DAMAGE INS', 67.74), ('TRAILER', 225.0)]


class ExcelBlocks(WeeklyStatementCase):
    def test_week_boundaries_are_saturday_to_friday(self):
        self.assertEqual(ws.week_start(date(2025, 12, 30)), WEEK)      # Tuesday → Saturday 12/27
        self.assertEqual(ws.week_start(WEEK), WEEK)                    # Saturday stays
        self.assertEqual(ws.week_start(date(2026, 1, 2)), WEEK)        # Friday belongs to the same week
        self.assertEqual(ws.week_start(date(2026, 1, 3)), date(2026, 1, 3))
        self.assertEqual(ws.period_label(WEEK), '12/27-01/02')

    def test_truck_328_per_mile_block(self):
        """Excel 328, 12/27-01/02: gross 3600, fee 3.5%, template, diesel 900.71, invoice 990,
        driver 0.55 × 1,739 mi = 956.45, occupational health -150 → payout 806.45, net -40.90."""
        drv = self.driver('Alisher Sharipov', 'per_mile', per_mile=0.55, deductions=[('Occupational health', 150.0)])
        t = self.truck('328', 3.5, self.COMPANY_TEMPLATE, driver=drv)
        self.load(t, drv, 595285, date(2025, 12, 27), 1400)
        self.load(t, drv, 20963070, date(2025, 12, 29), 2200)
        self.expense(t, date(2025, 12, 30), 'Fuel', 900.71)
        self.expense(t, date(2025, 12, 27), 'Invoice', 990.0, '1529 trailer 915')

        s = ws.generate(self.db, t.id, WEEK)
        self.assertEqual(s.gross, 3600.0)
        self.assertEqual(s.fee, 126.0)
        self.assertEqual(s.driver_pay, 0.0)          # no odometer yet
        s = ws.set_odometer(self.db, s, 739264, 741003)
        self.assertEqual(s.driver_pay, 956.45)
        self.assertEqual(s.driver_deductions, 150.0)
        self.assertEqual(s.driver_payout, 806.45)
        self.assertEqual(s.deductions, 250 + 50 + 75 + 67.74 + 225 + 900.71 + 990.0)
        self.assertEqual(s.net, -40.90)
        kinds = [l.kind for l in s.lines]
        self.assertEqual(kinds.count('load'), 2)
        self.assertIn('fuel', kinds); self.assertIn('expense', kinds); self.assertIn('driver_deduction', kinds)

    def test_truck_780_percent_block(self):
        """Excel 780, 12/27-01/02: gross 7500, 3.5% fee, template + truck payment 750, diesel 1620.02,
        driver 30% = 2250, occupational health -150 → payout 2100, net 1949.74."""
        drv = self.driver('Parvizjon Mukhiddinov', 'percent', pct=30, deductions=[('Occupational health', 150.0)])
        t = self.truck('780', 3.5, self.COMPANY_TEMPLATE + [('TRUCK PAYMENT', 750.0)], driver=drv)
        for n, day, rate in [(9314720, date(2025, 12, 27), 1600), (373715, date(2025, 12, 29), 2100),
                             (211550, date(2025, 12, 30), 1300), (6268695, date(2025, 12, 31), 2500)]:
            self.load(t, drv, n, day, rate)
        self.expense(t, date(2025, 12, 28), 'Diesel', 1620.02)

        s = ws.generate(self.db, t.id, WEEK)
        self.assertEqual(s.gross, 7500.0)
        self.assertEqual(s.fee, 262.5)
        self.assertEqual(s.driver_pay, 2250.0)
        self.assertEqual(s.driver_payout, 2100.0)
        self.assertEqual(s.net, 1949.74)

    def test_owner_driver_with_carry_in(self):
        """Excel 301 style: 12% fee, no driver pay line, last week's negative net rolls into this week."""
        t = self.truck('301', 12.0, [('CARGO INS', 411.0), ('ELD', 50.0), ('SAFETY', 75.0), ('TRAILER', 300.0)])
        owner = self.driver('Jasur Ergashev', 'none')
        t.driver = owner; self.db.commit()
        prev_week = date(2025, 12, 20)
        self.load(t, owner, 1, date(2025, 12, 22), 500)          # small week → negative
        prev = ws.generate(self.db, t.id, prev_week)
        self.assertEqual(prev.driver_pay, 0.0)
        self.assertEqual(prev.net, round(500 - 60 - 836, 2))      # -396.00
        self.load(t, owner, 2, date(2025, 12, 29), 3000)
        cur = ws.generate(self.db, t.id, WEEK)
        self.assertEqual(cur.carry_in, 396.0)
        self.assertEqual(cur.net, round(3000 - 360 - 836 - 396, 2))
        # Owner can switch the carry off for this week
        cur = ws.set_carry(self.db, cur, False)
        self.assertEqual(cur.carry_in, 0.0)
        self.assertEqual(cur.net, round(3000 - 360 - 836, 2))

    def test_manual_lines_survive_regeneration_and_paid_locks(self):
        drv = self.driver('D', 'percent', pct=30)
        t = self.truck('842', 3.5, self.COMPANY_TEMPLATE, driver=drv)
        self.load(t, drv, 1, date(2025, 12, 28), 2000)
        s = ws.generate(self.db, t.id, WEEK)
        s = ws.add_manual_line(self.db, s, 'Truck wash 12/28', 95.22)
        self.assertEqual(s.deductions, round(667.74 + 95.22, 2))
        self.load(t, drv, 2, date(2025, 12, 30), 1000)            # a late load arrives
        s = ws.generate(self.db, t.id, WEEK)
        self.assertEqual(s.gross, 3000.0)
        self.assertEqual([l.label for l in s.lines if l.kind == 'manual'], ['Truck wash 12/28'])
        s = ws.set_status(self.db, s, 'paid', ach_reference='591252728')
        self.assertEqual(s.status, 'paid')
        with self.assertRaises(ws.StatementError):
            ws.add_manual_line(self.db, s, 'late', 1)
        self.load(t, drv, 3, date(2025, 12, 31), 9999)             # must not change a paid week
        again = ws.generate(self.db, t.id, WEEK)
        self.assertEqual(again.gross, 3000.0)

    def test_canceled_loads_and_other_trucks_are_excluded(self):
        drv = self.driver('D', 'percent')
        t = self.truck('1', 0, [], driver=drv)
        other = self.truck('2', 0, [], driver=drv)
        self.load(t, drv, 1, date(2025, 12, 28), 1000)
        canceled = self.load(t, drv, 2, date(2025, 12, 28), 5000); canceled.status = LoadStatus.CANCELED
        self.load(other, drv, 3, date(2025, 12, 28), 7000)
        self.load(t, drv, 4, date(2026, 1, 3), 8000)               # next week
        self.db.commit()
        s = ws.generate(self.db, t.id, WEEK)
        self.assertEqual(s.gross, 1000.0)


class WeeklyApi(WeeklyStatementCase):
    def setUp(self):
        super().setUp()
        app = FastAPI(); app.include_router(api_router)
        app.dependency_overrides[get_db] = lambda: self.db
        self.client = TestClient(app)

    def test_board_generate_rules_and_status_over_http(self):
        drv = self.driver('D', 'percent', pct=30)
        t = self.truck('780', 3.5, [], driver=drv)
        self.load(t, drv, 1, date(2025, 12, 29), 1000)

        r = self.client.put(f'/api/v1/trucks/{t.id}/rules', json={'fee_pct': 3.5, 'carry_negative': True,
            'deductions': [{'label': 'CARGO INS', 'amount': 250}, {'label': 'ELD', 'amount': 50}]})
        self.assertEqual(r.status_code, 200, r.text); self.assertEqual(len(r.json()['deductions']), 2)

        r = self.client.put(f'/api/v1/drivers/{drv.id}/rules', json={'pay_type': 'percent', 'pay_pct': 30,
            'deductions': [{'label': 'Occupational health', 'amount': 150}]})
        self.assertEqual(r.status_code, 200, r.text)

        r = self.client.get('/api/v1/weeks/2025-12-30')
        self.assertEqual(r.status_code, 200, r.text)
        body = r.json()
        self.assertEqual(body['period'], '12/27-01/02')
        row = body['rows'][0]
        self.assertEqual(row['gross'], 1000.0); self.assertEqual(row['net'], 1000 - 35 - 300 - 300)
        self.assertEqual(row['driver_payout'], 150.0)
        self.assertEqual(body['totals']['net'], row['net'])

        r = self.client.post(f"/api/v1/statements/{row['id']}/lines", json={'label': 'Scale 12/30', 'amount': 14.75})
        self.assertEqual(r.status_code, 201, r.text); self.assertEqual(r.json()['net'], round(365 - 14.75, 2))
        line_id = next(l['id'] for l in r.json()['lines'] if l['kind'] == 'manual')

        r = self.client.post(f"/api/v1/statements/{row['id']}/status", json={'status': 'paid', 'ach_reference': 'ACH-1'})
        self.assertEqual(r.json()['status'], 'paid')
        r = self.client.delete(f"/api/v1/statements/{row['id']}/lines/{line_id}")
        self.assertEqual(r.status_code, 400)
        r = self.client.get(f"/api/v1/weeks/2025-12-27/trucks/{t.id}")
        self.assertEqual(r.json()['status'], 'paid'); self.assertEqual(r.json()['ach_reference'], 'ACH-1')


if __name__ == '__main__':
    unittest.main()
