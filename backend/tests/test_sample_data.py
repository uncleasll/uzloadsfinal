import os, tempfile
os.environ['DATABASE_URL'] = 'sqlite://'
os.environ['UPLOAD_DIR'] = tempfile.mkdtemp()
import unittest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient
from app.models.models import Base
from app.main import app
from app.db.session import get_db


class SampleData(unittest.TestCase):
    """An owner fills their own empty company with a month of work; the other apps get accounts; it never runs twice."""

    def setUp(self):
        self.engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine, autoflush=False)
        app.dependency_overrides[get_db] = lambda: self.db
        self.c = TestClient(app)
        owner = self.c.post('/api/v1/auth/register', json={'company_name': 'Real Carrier LLC', 'name': 'Asilbek', 'email': 'a@real.com', 'password': 'secret-123'}).json()
        self.oh = {'Authorization': f"Bearer {owner['access_token']}"}

    def tearDown(self):
        app.dependency_overrides.clear(); self.db.close()

    def test_fill_then_refuse_second_time(self):
        r = self.c.post('/api/v1/company/me/sample-data', headers=self.oh)
        self.assertEqual(r.status_code, 201, r.text)
        accounts = r.json()['accounts']
        self.assertEqual(sorted(a['role'] for a in accounts), ['accountant', 'dispatcher', 'dispatcher', 'driver', 'driver', 'driver', 'driver'])
        self.assertEqual(len(self.c.get('/api/v1/trucks', headers=self.oh).json()), 5)
        d = self.c.get('/api/v1/dashboard', headers=self.oh).json()
        self.assertGreater(d['period']['gross'], 0)
        convs = self.c.get('/api/v1/chat/conversations', headers=self.oh).json()
        # every working truck group has its driver in it and talk in it; live loads have threads
        for unit in ('551', '328', '780', '301'):
            g = next(c for c in convs if c['title'] == f'Truck {unit}')
            self.assertTrue(g['last_message'], unit)
            self.assertTrue(any(m['role'] == 'driver' for m in g['members']), unit)
        self.assertGreaterEqual(sum(1 for c in convs if c['kind'] == 'load'), 4)
        self.assertGreaterEqual(len(next(c for c in convs if c['kind'] == 'company')['members']), 8)
        # the driver account opens the driver app inside the same company
        drv = next(a for a in accounts if a['role'] == 'driver')
        tok = self.c.post('/api/v1/auth/login', data={'username': drv['email'], 'password': drv['password']}).json()['access_token']
        me = self.c.get('/api/v1/driver/me', headers={'Authorization': f'Bearer {tok}'}).json()
        self.assertEqual(me['truck']['unit_number'], '551')
        # never on top of existing data, unless asked to replace it
        r = self.c.post('/api/v1/company/me/sample-data', headers=self.oh)
        self.assertEqual(r.status_code, 400)
        r = self.c.post('/api/v1/company/me/sample-data?replace=true', headers=self.oh)
        self.assertEqual(r.status_code, 201, r.text)
        self.assertEqual(len(self.c.get('/api/v1/trucks', headers=self.oh).json()), 5)
        self.assertEqual(self.c.get('/api/v1/auth/me', headers=self.oh).json()['email'], 'a@real.com')

    def test_only_the_owner(self):
        r = self.c.post('/api/v1/company/me/sample-data', headers=self.oh)
        self.assertEqual(r.status_code, 201, r.text)
        disp = next(a for a in r.json()['accounts'] if a['role'] == 'dispatcher')
        tok = self.c.post('/api/v1/auth/login', data={'username': disp['email'], 'password': disp['password']}).json()['access_token']
        self.assertEqual(self.c.post('/api/v1/company/me/sample-data', headers={'Authorization': f'Bearer {tok}'}).status_code, 403)
