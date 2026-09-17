"""Dispatcher commissions match the Excel Office sheet; bills calendar tracks a month."""
import os
os.environ['DATABASE_URL'] = 'sqlite://'
import unittest
from datetime import date
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.models.models import Base, Dispatcher, Load, LoadStatus, BillingStatus, LoadStop, StopType, Truck
from app.services import dispatcher_pay
from app.api.v1 import api_router
from app.db.session import get_db

WEEK = date(2025, 12, 27)


class OfficeCase(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine, autoflush=False)
        app = FastAPI(); app.include_router(api_router)
        app.dependency_overrides[get_db] = lambda: self.db
        self.client = TestClient(app)
        self.islom = Dispatcher(name='Islom', is_active=True, commission_type='pct', commission_value=2.0)
        self.shukhrat = Dispatcher(name='Shukhrat', is_active=True, commission_type='flat', commission_value=170.0)
        self.truck = Truck(unit_number='100', is_active=True)
        self.db.add_all([self.islom, self.shukhrat, self.truck]); self.db.commit()

    def tearDown(self):
        self.db.close(); self.engine.dispose()

    def load(self, dispatcher, day, rate, status=LoadStatus.DELIVERED):
        n = self.db.query(Load).count() + 1
        l = Load(load_number=n, truck_id=self.truck.id, dispatcher_id=dispatcher.id, load_date=day, rate=rate, is_active=True, status=status, billing_status=BillingStatus.PENDING)
        l.stops.append(LoadStop(stop_type=StopType.PICKUP, stop_order=1, stop_date=day))
        self.db.add(l); self.db.commit()

    def test_office_sheet_week(self):
        """Excel Office: Islom gross 59,669 × 2% = 1,193.38; Shukhrat flat $170 regardless of gross."""
        for rate in [9315, 3300, 5855, 7000, 4800, 5600, 5999, 3300, 3200, 3300, 8000]:
            self.load(self.islom, date(2025, 12, 29), rate)
        self.load(self.shukhrat, date(2025, 12, 30), 3600)
        self.load(self.shukhrat, date(2026, 1, 5), 9999)                      # next week
        self.load(self.islom, date(2025, 12, 31), 500, LoadStatus.CANCELED)   # ignored
        rows = {r['name']: r for r in dispatcher_pay.week_rows(self.db, WEEK)}
        self.assertEqual(rows['Islom']['gross'], 59669.0)
        self.assertEqual(rows['Islom']['commission'], 1193.38)
        self.assertEqual(rows['Islom']['loads'], 11)
        self.assertEqual(rows['Shukhrat']['gross'], 3600.0)
        self.assertEqual(rows['Shukhrat']['commission'], 170.0)

    def test_mark_paid_and_rules_over_http(self):
        self.load(self.islom, date(2025, 12, 29), 10000)
        r = self.client.get('/api/v1/weeks/2025-12-30/dispatchers')
        self.assertEqual(r.status_code, 200, r.text)
        row = next(x for x in r.json()['rows'] if x['name'] == 'Islom')
        self.assertEqual(row['commission'], 200.0); self.assertFalse(row['paid'])
        r = self.client.post(f"/api/v1/weeks/2025-12-27/dispatchers/{self.islom.id}/paid", json={'paid': True})
        self.assertTrue(r.json()['paid']); self.assertEqual(r.json()['paid_amount'], 200.0)
        r = self.client.put(f"/api/v1/dispatchers/{self.islom.id}/rules", json={'commission_type': 'pct', 'commission_value': 2.5})
        self.assertEqual(r.json()['commission_value'], 2.5)
        r = self.client.get('/api/v1/weeks/2025-12-27/dispatchers')
        row = next(x for x in r.json()['rows'] if x['name'] == 'Islom')
        self.assertEqual(row['commission'], 250.0)
        self.assertEqual(row['paid_amount'], 200.0)          # what was actually paid stays recorded

    def test_bills_month(self):
        r = self.client.post('/api/v1/bills', json={'label': 'Office rent and parking', 'vendor': 'Zeke', 'amount': 27700, 'due_day': 1, 'account': 'AFS'})
        self.assertEqual(r.status_code, 201, r.text); rent = r.json()['id']
        r = self.client.post('/api/v1/bills', json={'label': 'Samsara', 'vendor': 'Samsara', 'amount': 4959.66, 'due_day': 2, 'account': 'GC'})
        samsara = r.json()['id']
        r = self.client.get('/api/v1/bills/month/2026-01')
        self.assertEqual(r.json()['totals'], {'due': 32659.66, 'paid': 0.0, 'remaining': 32659.66, 'count': 2, 'paid_count': 0})
        r = self.client.post(f'/api/v1/bills/{rent}/pay', json={'month': '2026-01'})
        self.assertTrue(r.json()['paid']); self.assertEqual(r.json()['paid_amount'], 27700.0)
        r = self.client.get('/api/v1/bills/month/2026-01')
        self.assertEqual(r.json()['totals']['remaining'], 4959.66)
        r = self.client.get('/api/v1/bills/month/2026-02')
        self.assertEqual(r.json()['totals']['paid'], 0.0)          # a new month starts unpaid
        r = self.client.delete(f'/api/v1/bills/{rent}/pay/2026-01')
        self.assertFalse(r.json()['paid'])
        r = self.client.delete(f'/api/v1/bills/{samsara}')
        self.assertEqual(len(self.client.get('/api/v1/bills/month/2026-01').json()['rows']), 1)
        self.assertEqual(self.client.get('/api/v1/bills/month/2026-13').status_code, 400)


if __name__ == '__main__':
    unittest.main()
