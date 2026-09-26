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
from app.models.models import Base, Driver, Load, LoadStatus, BillingStatus, Truck
from app.main import app
from app.db.session import get_db
from app.core.tenant import company_scope
from app.services.weekly_statement import has_pod


def png_bytes(w=400, h=300):
    buf = io.BytesIO(); Image.new('RGB', (w, h), (200, 30, 30)).save(buf, 'PNG'); return buf.getvalue()


class Chat(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine, autoflush=False)
        app.dependency_overrides[get_db] = lambda: self.db
        self.c = TestClient(app)
        owner = self.c.post('/api/v1/auth/register', json={'company_name': 'Acme', 'name': 'Owner', 'email': 'o@acme.com', 'password': 'secret-123'}).json()
        self.cid = owner['user']['company_id']
        self.oh = {'Authorization': f"Bearer {owner['access_token']}"}
        with company_scope(self.cid):
            self.bobur = Driver(name='Bobur', is_active=True); self.alisher = Driver(name='Alisher', is_active=True)
            self.t551 = Truck(unit_number='551', is_active=True, driver=self.bobur); self.t328 = Truck(unit_number='328', is_active=True, driver=self.alisher)
            self.db.add_all([self.bobur, self.alisher, self.t551, self.t328]); self.db.commit()
        self.bh = self._invite('Bobur', 'b@acme.com', self.bobur.id)
        self.ah = self._invite('Alisher', 'a@acme.com', self.alisher.id)

    def _invite(self, name, email, driver_id):
        inv = self.c.post('/api/v1/auth/invitations', json={'name': name, 'email': email, 'role': 'driver', 'driver_id': driver_id}, headers=self.oh).json()
        r = self.c.post(f"/api/v1/auth/invitations/{inv['token']}/accept", json={'password': 'driver-pass-1'}).json()
        return {'Authorization': f"Bearer {r['access_token']}"}

    def tearDown(self):
        app.dependency_overrides.clear(); self.db.close(); self.engine.dispose()

    def test_driver_sees_only_the_channel_and_his_truck(self):
        convs = self.c.get('/api/v1/chat/conversations', headers=self.bh).json()
        self.assertEqual(sorted(c['title'] for c in convs), ['Everyone', 'Truck 551'])
        office = self.c.get('/api/v1/chat/conversations', headers=self.oh).json()
        self.assertEqual(sorted(c['title'] for c in office), ['Everyone', 'Truck 328', 'Truck 551'])
        t328 = next(c for c in office if c['title'] == 'Truck 328')
        self.assertEqual(self.c.get(f"/api/v1/chat/conversations/{t328['id']}/messages", headers=self.bh).status_code, 404)

    def test_offline_resend_is_not_duplicated_and_unread_counts(self):
        conv = next(c for c in self.c.get('/api/v1/chat/conversations', headers=self.bh).json() if c['kind'] == 'truck')
        body = {'body': 'Loaded, leaving now', 'client_id': 'phone-abc', 'client_created_at': '2026-09-26T10:00:00'}
        a = self.c.post(f"/api/v1/chat/conversations/{conv['id']}/messages", json=body, headers=self.bh).json()
        b = self.c.post(f"/api/v1/chat/conversations/{conv['id']}/messages", json=body, headers=self.bh).json()
        self.assertEqual(a['id'], b['id'])
        msgs = [m for m in self.c.get(f"/api/v1/chat/conversations/{conv['id']}/messages", headers=self.oh).json() if m['kind'] == 'text']
        self.assertEqual(len(msgs), 1); self.assertEqual(msgs[0]['sender_name'], 'Bobur'); self.assertEqual(msgs[0]['client_created_at'], '2026-09-26T10:00:00')
        office_view = next(c for c in self.c.get('/api/v1/chat/conversations', headers=self.oh).json() if c['id'] == conv['id'])
        self.assertEqual(office_view['unread'], 1)
        self.c.post(f"/api/v1/chat/conversations/{conv['id']}/read", headers=self.oh)
        office_view = next(c for c in self.c.get('/api/v1/chat/conversations', headers=self.oh).json() if c['id'] == conv['id'])
        self.assertEqual(office_view['unread'], 0)

    def test_photo_is_stamped_and_can_become_the_pod(self):
        with company_scope(self.cid):
            load = Load(load_number=1, po_number='BG1', truck_id=self.t551.id, driver_id=self.bobur.id, load_date=date.today(), rate=1000, is_active=True, status=LoadStatus.DELIVERED, billing_status=BillingStatus.PENDING)
            self.db.add(load); self.db.commit()
        conv = next(c for c in self.c.get('/api/v1/chat/conversations', headers=self.bh).json() if c['kind'] == 'truck')
        r = self.c.post(f"/api/v1/chat/conversations/{conv['id']}/attachments", headers=self.bh,
                        files={'file': ('pod.png', png_bytes(), 'image/png')},
                        data={'category': 'pod', 'caption': 'POD signed', 'client_id': 'ph-1', 'taken_at': '2026-09-26T14:03:00', 'lat': '41.85', 'lng': '-87.65', 'load_id': str(load.id)})
        self.assertEqual(r.status_code, 201, r.text)
        m = r.json(); a = m['attachments'][0]
        self.assertEqual(m['kind'], 'photo'); self.assertEqual(a['content_type'], 'image/jpeg')
        self.assertIn('Truck 551', a['stamp']); self.assertIn('Load #BG1', a['stamp']); self.assertIn('2026-09-26 14:03', a['stamp']); self.assertIn('Bobur', a['stamp'])
        self.assertEqual((a['width'], a['height']), (400, 300))
        f = self.c.get(a['url'], headers=self.oh)
        self.assertEqual(f.status_code, 200); self.assertEqual(f.headers['content-type'], 'image/jpeg')
        img = Image.open(io.BytesIO(f.content)); self.assertEqual(img.width, 400); self.assertGreater(img.height, 300)   # the band was added
        # resend after reconnect: same message, no second photo
        again = self.c.post(f"/api/v1/chat/conversations/{conv['id']}/attachments", headers=self.bh, files={'file': ('pod.png', png_bytes(), 'image/png')}, data={'client_id': 'ph-1'})
        self.assertEqual(again.json()['id'], m['id'])
        # office turns it into the load's POD
        r = self.c.post(f"/api/v1/chat/attachments/{a['id']}/to-load", json={'load_id': load.id, 'as_pod': True}, headers=self.oh)
        self.assertEqual(r.status_code, 200, r.text)
        self.db.expire_all()
        with company_scope(self.cid):
            self.assertTrue(has_pod(self.db.get(Load, load.id)))

    def test_driver_change_keeps_history(self):
        conv = next(c for c in self.c.get('/api/v1/chat/conversations', headers=self.oh).json() if c['title'] == 'Truck 551')
        self.c.post(f"/api/v1/chat/conversations/{conv['id']}/messages", json={'body': 'Old driver here'}, headers=self.bh)
        with company_scope(self.cid):
            self.db.get(Truck, self.t551.id).driver_id = self.alisher.id; self.db.commit()
        self.assertNotIn('Truck 551', [c['title'] for c in self.c.get('/api/v1/chat/conversations', headers=self.bh).json()])
        self.assertIn('Truck 551', [c['title'] for c in self.c.get('/api/v1/chat/conversations', headers=self.ah).json()])
        history = self.c.get(f"/api/v1/chat/conversations/{conv['id']}/members", headers=self.oh).json()
        bobur = next(h for h in history if h['name'] == 'Bobur'); alisher = next(h for h in history if h['name'] == 'Alisher')
        self.assertIsNotNone(bobur['left_at']); self.assertIsNone(alisher['left_at'])
        msgs = self.c.get(f"/api/v1/chat/conversations/{conv['id']}/messages", headers=self.ah).json()
        self.assertIn('Old driver here', [m['body'] for m in msgs])
        self.assertIn('Bobur left', [m['body'] for m in msgs if m['kind'] == 'system'])


if __name__ == '__main__':
    unittest.main()
