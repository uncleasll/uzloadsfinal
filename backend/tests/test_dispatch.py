import os
os.environ['DATABASE_URL'] = 'sqlite://'
import unittest
from datetime import date
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient
from app.models.models import Base, Driver, Dispatcher, Load, LoadStatus, BillingStatus, LoadStop, StopType, Truck
from app.main import app
from app.db.session import get_db
from app.core.tenant import company_scope


class DispatchWorkspace(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine, autoflush=False)
        app.dependency_overrides[get_db] = lambda: self.db
        self.c = TestClient(app)
        owner = self.c.post('/api/v1/auth/register', json={'company_name': 'Acme', 'name': 'Owner', 'email': 'o@acme.com', 'password': 'secret-123'}).json()
        self.cid = owner['user']['company_id']; self.oh = {'Authorization': f"Bearer {owner['access_token']}"}
        with company_scope(self.cid):
            d1 = Driver(name='Bobur', is_active=True); d2 = Driver(name='Alisher', is_active=True)
            self.t551 = Truck(unit_number='551', is_active=True, driver=d1); self.t328 = Truck(unit_number='328', is_active=True, driver=d2); t9 = Truck(unit_number='999', is_active=True)
            self.jasur = Dispatcher(name='Jasur', is_active=True, commission_type='pct', commission_value=2); islom = Dispatcher(name='Islom', is_active=True)
            self.db.add_all([d1, d2, self.t551, self.t328, t9, self.jasur, islom]); self.db.flush()
            l1 = Load(load_number=1, po_number='J1', truck_id=self.t551.id, driver_id=d1.id, dispatcher_id=self.jasur.id, load_date=date.today(), rate=2000, is_active=True, status=LoadStatus.EN_ROUTE, billing_status=BillingStatus.PENDING)
            l1.stops.append(LoadStop(stop_type=StopType.PICKUP, stop_order=1, city='Chicago', state='IL', stop_date=date.today()))
            l1.stops.append(LoadStop(stop_type=StopType.DELIVERY, stop_order=2, city='Newark', state='NJ', stop_date=date.today()))
            l2 = Load(load_number=2, po_number='I1', dispatcher_id=islom.id, load_date=date.today(), rate=900, is_active=True, status=LoadStatus.NEW, billing_status=BillingStatus.PENDING)
            self.db.add_all([l1, l2]); self.db.commit()
        inv = self.c.post('/api/v1/auth/invitations', json={'name': 'Jasur', 'email': 'j@acme.com', 'role': 'dispatcher', 'dispatcher_id': self.jasur.id}, headers=self.oh).json()
        r = self.c.post(f"/api/v1/auth/invitations/{inv['token']}/accept", json={'password': 'disp-pass-1'}).json()
        self.jh = {'Authorization': f"Bearer {r['access_token']}"}

    def tearDown(self):
        app.dependency_overrides.clear(); self.db.close(); self.engine.dispose()

    def test_board(self):
        b = self.c.get('/api/v1/dispatch/board', headers=self.jh).json()
        states = {t['unit_number']: t['state'] for t in b['trucks']}
        self.assertEqual(states, {'328': 'free', '551': 'En Route', '999': 'no_driver'})
        t551 = next(t for t in b['trucks'] if t['unit_number'] == '551')
        self.assertEqual(t551['current_load']['number'], 'J1'); self.assertEqual(t551['current_load']['next_stop']['city'], 'Chicago')
        self.assertEqual([l['number'] for l in b['unassigned']], ['I1'])
        self.assertEqual(b['counts'], {'free': 1, 'on_load': 1, 'no_driver': 1, 'down': 0, 'unassigned': 1, 'idle_drivers': 0})

    def test_dispatcher_sees_own_loads_and_no_money(self):
        mine = self.c.get('/api/v1/loads', headers=self.jh).json()
        self.assertEqual([l['po_number'] for l in mine['items']], ['J1'])
        everyone = self.c.get('/api/v1/loads', headers=self.oh).json()
        self.assertEqual(sorted(l['po_number'] for l in everyone['items']), ['I1', 'J1'])
        # a load a dispatcher creates is theirs even if the form said otherwise
        r = self.c.post('/api/v1/loads', json={'po_number': 'J2', 'rate': 1500, 'load_date': date.today().isoformat(), 'truck_id': self.t328.id, 'dispatcher_id': 999, 'stops': []}, headers=self.jh)
        self.assertEqual(r.status_code, 201, r.text); self.assertEqual(r.json()['dispatcher']['name'], 'Jasur')
        for path in ['/api/v1/weeks/2026-09-26', '/api/v1/dashboard', '/api/v1/bills', '/api/v1/expenses', f'/api/v1/trucks/{self.t551.id}/rules', '/api/v1/auth/invitations']:
            self.assertEqual(self.c.get(path, headers=self.jh).status_code, 403, path)
        self.assertEqual(self.c.get('/api/v1/trucks', headers=self.jh).status_code, 200)
        self.assertEqual(self.c.get('/api/v1/chat/conversations', headers=self.jh).status_code, 200)

    def test_my_week_is_only_mine(self):
        rows = self.c.get('/api/v1/dispatch/my-week', headers=self.jh).json()['rows']
        self.assertEqual([r['name'] for r in rows], ['Jasur']); self.assertEqual(rows[0]['gross'], 2000.0); self.assertEqual(rows[0]['commission'], 40.0)
        self.assertEqual(len(self.c.get('/api/v1/dispatch/my-week', headers=self.oh).json()['rows']), 2)


if __name__ == '__main__':
    unittest.main()
