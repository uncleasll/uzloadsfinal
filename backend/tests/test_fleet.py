import os
os.environ['DATABASE_URL'] = 'sqlite://'
import unittest
from datetime import date, timedelta
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient
from app.models.models import Base, Driver, Load, LoadStatus, BillingStatus, LoadStop, StopType, Truck
from app.main import app
from app.db.session import get_db
from app.core.tenant import company_scope
from app.services import weekly_statement as ws


class Fleet(unittest.TestCase):
    """A truck breaks down; its driver moves to a spare truck for a while; pay, chat and the board follow."""

    def setUp(self):
        self.engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine, autoflush=False)
        app.dependency_overrides[get_db] = lambda: self.db
        self.c = TestClient(app)
        owner = self.c.post('/api/v1/auth/register', json={'company_name': 'Acme', 'name': 'Owner', 'email': 'o@acme.com', 'password': 'secret-123'}).json()
        self.cid = owner['user']['company_id']; self.oh = {'Authorization': f"Bearer {owner['access_token']}"}
        with company_scope(self.cid):
            self.bobur = Driver(name='Bobur', is_active=True, pay_type='percent', pay_pct=30)
            self.t551 = Truck(unit_number='551', is_active=True, fee_pct=3.5, driver=self.bobur)
            self.spare = Truck(unit_number='900', is_active=True, fee_pct=3.5)          # spare, no permanent driver
            self.db.add_all([self.bobur, self.t551, self.spare]); self.db.commit()
        inv = self.c.post('/api/v1/auth/invitations', json={'name': 'Bobur', 'email': 'b@acme.com', 'role': 'driver', 'driver_id': self.bobur.id}, headers=self.oh).json()
        r = self.c.post(f"/api/v1/auth/invitations/{inv['token']}/accept", json={'password': 'driver-pass-1'}).json()
        self.bh = {'Authorization': f"Bearer {r['access_token']}"}

    def tearDown(self):
        app.dependency_overrides.clear(); self.db.close(); self.engine.dispose()

    def test_breakdown_then_temporary_truck(self):
        # 1. the driver reports a breakdown from the app: truck goes to the shop, board shows it, driver is idle
        r = self.c.post('/api/v1/driver/inspections', headers=self.bh, files=[('files', ('f.png', b'x', 'image/png'))], data={'kind': 'breakdown', 'notes': 'turbo'})
        self.assertEqual(r.status_code, 201, r.text)
        board = self.c.get('/api/v1/dispatch/board', headers=self.oh).json()
        t551 = next(t for t in board['trucks'] if t['unit_number'] == '551')
        self.assertEqual(t551['state'], 'in_shop'); self.assertIn('turbo', t551['status_note'])
        self.assertEqual([d['name'] for d in board['idle_drivers']], ['Bobur']); self.assertIn('in shop', board['idle_drivers'][0]['reason'])
        self.assertEqual(board['counts']['down'], 1)
        # 2. the office puts Bobur on the spare truck for a week
        r = self.c.post('/api/v1/fleet/assignments', json={'driver_id': self.bobur.id, 'truck_id': self.spare.id, 'end_date': (date.today() + timedelta(days=7)).isoformat(), 'reason': '551 in shop'}, headers=self.oh)
        self.assertEqual(r.status_code, 201, r.text)
        board = self.c.get('/api/v1/dispatch/board', headers=self.oh).json()
        spare = next(t for t in board['trucks'] if t['unit_number'] == '900')
        self.assertEqual((spare['driver'], spare['temporary_driver'], spare['state']), ('Bobur', True, 'free'))
        self.assertEqual(board['idle_drivers'], [])
        # 3. the driver app now shows the spare truck, and the spare truck's chat has Bobur in it
        me = self.c.get('/api/v1/driver/me', headers=self.bh).json()
        self.assertEqual((me['truck']['unit_number'], me['truck']['temporary']), ('900', True))
        convs = self.c.get('/api/v1/chat/conversations', headers=self.bh).json()
        self.assertIn('Truck 900', [c['title'] for c in convs])
        # 4. a load on the spare truck this week pays Bobur on the spare truck's statement
        with company_scope(self.cid):
            l = Load(load_number=1, po_number='S1', truck_id=self.spare.id, driver_id=self.bobur.id, load_date=date.today(), rate=1000, is_active=True, status=LoadStatus.DELIVERED, billing_status=BillingStatus.PENDING)
            l.stops.append(LoadStop(stop_type=StopType.PICKUP, stop_order=1, stop_date=date.today()))
            self.db.add(l); self.db.commit()
            s = ws.generate(self.db, self.spare.id, date.today()); self.db.commit()
            self.assertEqual(s.driver_id, self.bobur.id); self.assertEqual(s.driver_pay, 300.0)
            # and 551, empty and in the shop, has no driver pay this week
            s551 = ws.generate(self.db, self.t551.id, date.today()); self.db.commit()
            self.assertEqual(s551.driver_pay, 0.0)
        # 5. truck back in service, assignment ended: Bobur is back on 551
        self.assertEqual(self.c.put(f'/api/v1/fleet/trucks/{self.t551.id}/status', json={'status': 'active'}, headers=self.oh).json()['status'], 'active')
        aid = r.json()['id']
        self.c.post(f'/api/v1/fleet/assignments/{aid}/end', headers=self.oh)
        hist = self.c.get(f'/api/v1/fleet/trucks/{self.spare.id}/history', headers=self.oh).json()
        self.assertEqual(hist['assignments'][0]['driver'], 'Bobur'); self.assertEqual(hist['assignments'][0]['end_date'], date.today().isoformat())
        # ended today means still driving today; tomorrow he is back on 551
        from app.services.fleet import effective_truck
        with company_scope(self.cid):
            self.assertEqual(effective_truck(self.db, self.bobur, date.today() + timedelta(days=1)).unit_number, '551')


if __name__ == '__main__':
    unittest.main()
