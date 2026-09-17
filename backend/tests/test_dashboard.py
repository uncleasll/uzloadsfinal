import os
os.environ['DATABASE_URL'] = 'sqlite://'
import unittest
from datetime import date
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.models.models import Base, Driver, Load, LoadStatus, BillingStatus, LoadStop, StopType, Truck, TruckDeduction
from app.api.v1 import api_router
from app.db.session import get_db
from app.services import weekly_statement as ws


class Dashboard(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine, autoflush=False)
        app = FastAPI(); app.include_router(api_router); app.dependency_overrides[get_db] = lambda: self.db
        self.client = TestClient(app)

    def tearDown(self):
        self.db.close(); self.engine.dispose()

    def test_dashboard_shape_and_numbers(self):
        d = Driver(name='D', is_active=True, pay_type='percent', pay_pct=30)
        t = Truck(unit_number='780', is_active=True, fee_pct=3.5, driver=d)
        idle = Truck(unit_number='322', is_active=True, fee_pct=3.5)
        self.db.add_all([t, idle]); self.db.flush()
        self.db.add(TruckDeduction(truck_id=idle.id, label='ELD', amount=50))
        week = ws.week_start(date.today())
        l = Load(load_number=1, truck_id=t.id, driver_id=d.id, load_date=week, rate=2000, total_miles=800, is_active=True, status=LoadStatus.DELIVERED, billing_status=BillingStatus.PENDING)
        l.stops.append(LoadStop(stop_type=StopType.PICKUP, stop_order=1, stop_date=week))
        self.db.add(l); self.db.commit()
        r = self.client.get('/api/v1/dashboard')
        self.assertEqual(r.status_code, 200, r.text)
        b = r.json()
        self.assertEqual(b['this_week']['gross'], 2000.0)
        self.assertEqual(b['this_week']['net'], 2000 - 70 - 600 - 50)   # idle truck still pays its ELD
        self.assertEqual(b['this_week']['rpm'], 2.5)
        self.assertEqual(b['attention']['idle_trucks'], {'count': 1, 'units': ['322']})
        self.assertEqual(b['attention']['negative_weeks']['units'], ['322'])
        self.assertEqual(len(b['trend']), 8); self.assertEqual(b['trend'][-1]['gross'], 2000.0)
        self.assertEqual(b['top_trucks'][0]['unit_number'], '780')


if __name__ == '__main__':
    unittest.main()
