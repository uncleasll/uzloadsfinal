import os, io, tempfile
os.environ['DATABASE_URL'] = 'sqlite://'
os.environ['UPLOAD_DIR'] = tempfile.mkdtemp()
import unittest
from datetime import date
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient
from PIL import Image
from app.models.models import Base, Driver, Load, LoadStatus, BillingStatus, LoadStop, StopType, Truck, Broker, Expense
from app.main import app
from app.db.session import get_db
from app.core.tenant import company_scope


def png():
    b = io.BytesIO(); Image.new('RGB', (300, 200), (10, 120, 60)).save(b, 'PNG'); return b.getvalue()


class DriverApp(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine, autoflush=False)
        app.dependency_overrides[get_db] = lambda: self.db
        self.c = TestClient(app)
        owner = self.c.post('/api/v1/auth/register', json={'company_name': 'Acme', 'name': 'Owner', 'email': 'o@acme.com', 'password': 'secret-123'}).json()
        self.cid = owner['user']['company_id']; self.oh = {'Authorization': f"Bearer {owner['access_token']}"}
        with company_scope(self.cid):
            self.d = Driver(name='Bobur', is_active=True, pay_type='percent', pay_pct=30)
            self.t = Truck(unit_number='551', is_active=True, fee_pct=3.5, driver=self.d)
            b = Broker(name='RXO', phone='555-1000', is_broker=True)
            self.db.add_all([self.d, self.t, b]); self.db.flush()
            self.load = Load(load_number=1, po_number='RX1', truck_id=self.t.id, driver_id=self.d.id, broker_id=b.id, load_date=date.today(), rate=2000, total_miles=800,
                             is_active=True, status=LoadStatus.NEW, billing_status=BillingStatus.PENDING)
            self.load.stops.append(LoadStop(stop_type=StopType.PICKUP, stop_order=1, stop_date=date.today(), city='Chicago', state='IL', title='Shipper A'))
            self.load.stops.append(LoadStop(stop_type=StopType.DELIVERY, stop_order=2, stop_date=date.today(), city='Newark', state='NJ', title='Receiver B'))
            self.db.add(self.load); self.db.commit()
        inv = self.c.post('/api/v1/auth/invitations', json={'name': 'Bobur', 'email': 'b@acme.com', 'role': 'driver', 'driver_id': self.d.id}, headers=self.oh).json()
        r = self.c.post(f"/api/v1/auth/invitations/{inv['token']}/accept", json={'password': 'driver-pass-1'}).json()
        self.h = {'Authorization': f"Bearer {r['access_token']}"}

    def tearDown(self):
        app.dependency_overrides.clear(); self.db.close(); self.engine.dispose()

    def test_home_screen(self):
        r = self.c.get('/api/v1/driver/me', headers=self.h)
        self.assertEqual(r.status_code, 200, r.text)
        b = r.json()
        self.assertEqual(b['truck']['unit_number'], '551')
        self.assertEqual(b['current_load']['number'], 'RX1'); self.assertEqual(b['current_load']['next_status'], 'Dispatched')
        self.assertEqual(b['current_load']['broker']['phone'], '555-1000'); self.assertEqual(b['current_load']['delivery']['city'], 'Newark')
        self.assertEqual(b['week']['gross'], 2000.0); self.assertEqual(b['week']['driver_pay'], 600.0)
        # the office cannot use driver endpoints, and a driver cannot use the office
        self.assertEqual(self.c.get('/api/v1/driver/me', headers=self.oh).status_code, 403)
        self.assertEqual(self.c.get('/api/v1/loads', headers=self.h).status_code, 403)

    def test_status_flow_needs_pod_before_delivered(self):
        url = f'/api/v1/driver/loads/{self.load.id}/status'
        for s in ['Dispatched', 'En Route', 'Picked-up']:
            r = self.c.post(url, json={'status': s, 'client_id': f'c-{s}', 'lat': 41.8, 'lng': -87.6}, headers=self.h)
            self.assertEqual(r.status_code, 200, r.text); self.assertEqual(r.json()['status'], s)
        self.assertEqual(self.c.post(url, json={'status': 'Picked-up', 'client_id': 'c-Picked-up'}, headers=self.h).json()['status'], 'Picked-up')  # resend ok
        self.assertEqual(self.c.post(url, json={'status': 'Dispatched'}, headers=self.h).status_code, 400)                                     # cannot go back
        r = self.c.post(url, json={'status': 'Delivered'}, headers=self.h)
        self.assertEqual(r.status_code, 400); self.assertIn('POD', r.text)
        r = self.c.post(f'/api/v1/driver/loads/{self.load.id}/photos', headers=self.h, files={'file': ('pod.png', png(), 'image/png')},
                        data={'category': 'pod', 'client_id': 'pod-1', 'taken_at': '2026-09-26T15:00:00', 'lat': '40.7', 'lng': '-74.1'})
        self.assertEqual(r.status_code, 201, r.text)
        self.assertIn('POD · load #RX1', r.json()['body']); self.assertIn('Load #RX1', r.json()['attachments'][0]['stamp'])
        r = self.c.post(url, json={'status': 'Delivered', 'client_id': 'c-del'}, headers=self.h)
        self.assertEqual(r.status_code, 200, r.text); self.assertTrue(r.json()['pod']); self.assertEqual(r.json()['next_status'], None)
        # the office sees the trail in the truck's chat
        convs = self.c.get('/api/v1/chat/conversations', headers=self.oh).json()
        conv = next(c for c in convs if c['title'] == 'Truck 551')
        bodies = [m['body'] for m in self.c.get(f"/api/v1/chat/conversations/{conv['id']}/messages", headers=self.oh).json()]
        self.assertTrue(any('picked-up' in b for b in bodies)); self.assertTrue(any('delivered' in b for b in bodies))

    def test_receipt_inspection_odometer(self):
        r = self.c.post('/api/v1/driver/expenses', headers=self.h, files={'file': ('r.png', png(), 'image/png')},
                        data={'amount': '312.40', 'category': 'Fuel', 'note': 'Pilot, Toledo', 'client_id': 'exp-1'})
        self.assertEqual(r.status_code, 201, r.text)
        self.assertTrue(self.c.post('/api/v1/driver/expenses', headers=self.h, data={'amount': '312.40', 'category': 'Fuel', 'client_id': 'exp-1'}).json().get('duplicate'))
        with company_scope(self.cid):
            self.assertEqual(self.db.query(Expense).count(), 1)
        home = self.c.get('/api/v1/driver/me', headers=self.h).json()
        self.assertEqual(home['week']['driver_pay'], 600.0)   # fuel is the truck's cost, not the driver's
        r = self.c.post('/api/v1/driver/inspections', headers=self.h, files=[('files', ('f.png', png(), 'image/png')), ('files', ('b.png', png(), 'image/png'))],
                        data={'kind': 'pre_trip', 'client_id': 'insp-1', 'lat': '41.8', 'lng': '-87.6'})
        self.assertEqual(r.status_code, 201, r.text); self.assertEqual(len(r.json()['attachments']), 2)
        self.assertEqual(self.c.post('/api/v1/driver/inspections', headers=self.h, files=[('files', ('f.png', png(), 'image/png'))], data={'client_id': 'insp-1'}).json()['id'], r.json()['id'])
        r = self.c.post('/api/v1/driver/odometer', json={'reading': 412500}, headers=self.h)
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(self.c.get('/api/v1/driver/me', headers=self.h).json()['week']['odometer'], 412500)
        st = self.c.get('/api/v1/driver/statement', headers=self.h).json()
        self.assertEqual(st['truck'], '551'); self.assertEqual(len(st['weeks']), 4); self.assertEqual(st['weeks'][0]['driver_pay'], 600.0)


if __name__ == '__main__':
    unittest.main()
