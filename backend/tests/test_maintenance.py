"""Service-due logic matches the Fleet Command Center sheet: intervals, alert windows, odometer from statements."""
import os
os.environ['DATABASE_URL'] = 'sqlite://'
import unittest
from datetime import date
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.models.models import Base, Driver, Truck
from app.services import maintenance as mt
from app.services import weekly_statement as ws
from app.api.v1 import api_router
from app.db.session import get_db


class Maintenance(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine, autoflush=False)
        self.truck = Truck(unit_number='1007', is_active=True, driver=Driver(name='Alisher Mukhamedov', is_active=True, pay_type='per_mile', per_mile_rate=0.55))
        self.db.add(self.truck); self.db.commit()
        app = FastAPI(); app.include_router(api_router); app.dependency_overrides[get_db] = lambda: self.db
        self.client = TestClient(app)

    def tearDown(self):
        self.db.close(); self.engine.dispose()

    def test_defaults_and_statuses(self):
        today = date(2026, 9, 14)
        board = mt.board(self.db, today)
        self.assertEqual([i['service_type'] for i in board['intervals']][:2], ['Oil Change', 'PM Service'])
        self.assertEqual(board['rows'][0]['worst'], 'GRAY')                         # no history yet
        mt.record_odometer(self.db, self.truck.id, date(2026, 9, 2), 445984, 'samsara')
        mt.record_service(self.db, self.truck.id, 'Oil Change', date(2026, 8, 10), 412500, 425, 'Example Shop')
        mt.record_service(self.db, self.truck.id, 'PM Service', date(2026, 7, 15), 405000, 780)
        self.db.commit()
        row = mt.board(self.db, today)['rows'][0]
        oil = next(s for s in row['services'] if s['service_type'] == 'Oil Change')
        pm = next(s for s in row['services'] if s['service_type'] == 'PM Service')
        self.assertEqual(oil['next_due_miles'], 437500)
        self.assertEqual(oil['status'], 'RED')            # 445,984 is past 437,500 — same as the Excel DASHBOARD
        self.assertEqual(pm['next_due_miles'], 455000)
        self.assertEqual(pm['status'], 'GREEN')           # 9,016 miles left, alert window is 5,000
        self.assertEqual(row['worst'], 'RED')
        self.assertEqual(mt.board(self.db, today)['counts']['RED'], 1)

    def test_statement_odometer_feeds_the_log_and_api(self):
        s = ws.generate(self.db, self.truck.id, date(2026, 8, 29))
        ws.set_odometer(self.db, s, 440000, 441200); self.db.commit()
        odo = mt.current_odometer(self.db, self.truck.id)
        self.assertEqual((odo.reading, odo.source), (441200, 'statement'))
        r = self.client.post(f'/api/v1/maintenance/trucks/{self.truck.id}/services', json={'service_type': 'Tires', 'date': '2026-09-01', 'odometer': 441500, 'cost': 1900})
        self.assertEqual(r.status_code, 201, r.text)
        self.assertEqual(mt.current_odometer(self.db, self.truck.id).reading, 441500)
        board = self.client.get('/api/v1/maintenance').json()
        tires = next(x for x in board['rows'][0]['services'] if x['service_type'] == 'Tires')
        self.assertEqual((tires['status'], tires['next_due_miles']), ('GREEN', 501500))
        r = self.client.put('/api/v1/maintenance/intervals', json=[{'service_type': 'Oil Change', 'miles': 20000, 'days': 0, 'alert_miles': 2000, 'alert_days': 0}])
        self.assertEqual([i['service_type'] for i in r.json()], ['Oil Change'])


if __name__ == '__main__':
    unittest.main()
