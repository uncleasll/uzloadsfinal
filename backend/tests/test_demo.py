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
        self.assertEqual(len(b['trucks']), 4); self.assertEqual(len(b['unassigned']), 1)
        # second call reuses the same company
        o2 = self.c.post('/api/v1/auth/demo?role=admin').json()
        self.assertEqual(o2['user']['company_id'], o['user']['company_id'])
        self.assertEqual(self.c.get('/api/v1/auth/users', headers=oh).json().__len__(), 3)


if __name__ == '__main__':
    unittest.main()
