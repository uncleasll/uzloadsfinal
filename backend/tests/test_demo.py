import os
os.environ['DATABASE_URL'] = 'sqlite://'
import unittest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient
from app.models.models import Base
from app.main import app
from app.db.session import get_db


class Demo(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine, autoflush=False)
        app.dependency_overrides[get_db] = lambda: self.db
        self.c = TestClient(app)

    def tearDown(self):
        app.dependency_overrides.clear(); self.db.close(); self.engine.dispose()

    def test_each_role_opens_its_product_with_data(self):
        o = self.c.post('/api/v1/auth/demo?role=admin').json(); oh = {'Authorization': f"Bearer {o['access_token']}"}
        self.assertEqual(o['user']['company_name'], 'Karvan Demo Trucking')
        board = self.c.get('/api/v1/dashboard', headers=oh).json()
        self.assertGreater(board['period']['gross'], 0)
        d = self.c.post('/api/v1/auth/demo?role=driver').json(); dh = {'Authorization': f"Bearer {d['access_token']}"}
        me = self.c.get('/api/v1/driver/me', headers=dh).json()
        self.assertEqual(me['truck']['unit_number'], '551'); self.assertIsNotNone(me['current_load'])
        j = self.c.post('/api/v1/auth/demo?role=dispatcher').json(); jh = {'Authorization': f"Bearer {j['access_token']}"}
        b = self.c.get('/api/v1/dispatch/board', headers=jh).json()
        self.assertEqual(len(b['trucks']), 5); self.assertEqual(len(b['unassigned']), 1)
        # second call reuses the same company
        o2 = self.c.post('/api/v1/auth/demo?role=admin').json()
        self.assertEqual(o2['user']['company_id'], o['user']['company_id'])
        self.assertEqual(self.c.get('/api/v1/auth/users', headers=oh).json().__len__(), 3)
        # the demo is full: statements paid, invoices in every state, chat with photos, bills, papers
        ov = self.c.get('/api/v1/billing/overview', headers=oh).json()
        self.assertGreater(ov['outstanding']['count'], 0); self.assertGreater(ov['at_factor']['count'], 0); self.assertEqual(ov['overdue']['count'], 1)
        convs = self.c.get('/api/v1/chat/conversations', headers=oh).json()
        t551 = next(c for c in convs if c['title'] == 'Truck 551')
        msgs = self.c.get(f"/api/v1/chat/conversations/{t551['id']}/messages", headers=oh).json()
        self.assertGreaterEqual(sum(len(m['attachments']) for m in msgs), 2)
        self.assertGreater(len(self.c.get('/api/v1/compliance/expiring', headers=oh).json()), 0)
        wk = self.c.get('/api/v1/driver/statement', headers=dh).json()['weeks']
        self.assertIn('paid', [w['status'] for w in wk])


    def test_old_demo_is_rebuilt(self):
        from app.services import demo as demo_svc
        from app.models.models import User, Truck
        from app.core.tenant import company_scope
        o = self.c.post('/api/v1/auth/demo?role=admin').json()
        with company_scope(None):
            u = self.db.query(User).filter(User.email == demo_svc.DEMO_EMAILS['admin']).first(); u.phone = 'seed-v1'; self.db.commit()
            old_cid = u.company_id
        o2 = self.c.post('/api/v1/auth/demo?role=admin').json()
        self.assertNotEqual(o2['user']['company_id'], old_cid)
        with company_scope(None):
            self.assertEqual(self.db.query(Truck).filter(Truck.company_id == old_cid).count(), 0)
            self.assertEqual(self.db.query(Truck).filter(Truck.company_id == o2['user']['company_id']).count(), 5)


if __name__ == '__main__':
    unittest.main()
