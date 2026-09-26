import os
os.environ['DATABASE_URL'] = 'sqlite://'
import unittest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient
from app.models.models import Base, Driver, Truck
from app.main import app
from app.db.session import get_db
from app.core.tenant import company_scope


class AuthAndRoles(unittest.TestCase):
    """The request guard, invitations and role limits, through the real app with its middleware."""

    def setUp(self):
        self.engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine, autoflush=False)
        app.dependency_overrides[get_db] = lambda: self.db
        self.client = TestClient(app)
        r = self.client.post('/api/v1/auth/register', json={'company_name': 'Acme Trucking', 'name': 'Owner', 'email': 'owner@acme.com', 'password': 'secret-123'})
        self.assertEqual(r.status_code, 201, r.text)
        self.owner = r.json()
        self.h = {'Authorization': f"Bearer {self.owner['access_token']}"}

    def tearDown(self):
        app.dependency_overrides.clear(); self.db.close(); self.engine.dispose()

    def test_api_needs_a_token(self):
        self.assertEqual(self.client.get('/api/v1/trucks').status_code, 401)
        self.assertEqual(self.client.get('/api/v1/dashboard').status_code, 401)
        self.assertEqual(self.client.get('/api/v1/trucks', headers={'Authorization': 'Bearer nonsense'}).status_code, 401)
        self.assertEqual(self.client.get('/health').status_code, 200)
        self.assertEqual(self.client.get('/api/v1/trucks', headers=self.h).status_code, 200)

    def test_invite_driver_and_driver_is_kept_out_of_the_office(self):
        with company_scope(self.owner['user']['company_id']):
            d = Driver(name='Bobur', is_active=True); t = Truck(unit_number='551', is_active=True, driver=d)
            self.db.add_all([d, t]); self.db.commit()
        r = self.client.post('/api/v1/auth/invitations', json={'name': 'Bobur', 'email': 'bobur@acme.com', 'role': 'driver', 'driver_id': d.id}, headers=self.h)
        self.assertEqual(r.status_code, 201, r.text)
        token = r.json()['token']
        self.assertEqual(self.client.get(f'/api/v1/auth/invitations/{token}/preview').json()['company_name'], 'Acme Trucking')
        r = self.client.post(f'/api/v1/auth/invitations/{token}/accept', json={'password': 'driver-pass-1', 'phone': '555'})
        self.assertEqual(r.status_code, 200, r.text)
        u = r.json()['user']
        self.assertEqual((u['role'], u['driver_id'], u['company_id']), ('driver', d.id, self.owner['user']['company_id']))
        dh = {'Authorization': f"Bearer {r.json()['access_token']}"}
        self.assertEqual(self.client.get('/api/v1/auth/me', headers=dh).status_code, 200)
        self.assertEqual(self.client.get('/api/v1/trucks', headers=dh).status_code, 403)
        self.assertEqual(self.client.get('/api/v1/dashboard', headers=dh).status_code, 403)
        # the link is single-use and gone from the pending list
        self.assertEqual(self.client.post(f'/api/v1/auth/invitations/{token}/accept', json={'password': 'driver-pass-1'}).status_code, 404)
        self.assertEqual(self.client.get('/api/v1/auth/invitations', headers=self.h).json(), [])
        # the driver can sign in with the password they chose
        self.assertEqual(self.client.post('/api/v1/auth/login', data={'username': 'bobur@acme.com', 'password': 'driver-pass-1'}).status_code, 200)

    def test_team_is_per_company_and_admin_only(self):
        r = self.client.post('/api/v1/auth/register', json={'company_name': 'Other LLC', 'name': 'Other', 'email': 'o@other.com', 'password': 'secret-123'})
        oh = {'Authorization': f"Bearer {r.json()['access_token']}"}
        self.client.post('/api/v1/auth/invitations', json={'name': 'Disp', 'email': 'disp@acme.com', 'role': 'dispatcher'}, headers=self.h)
        self.assertEqual([u['email'] for u in self.client.get('/api/v1/auth/users', headers=oh).json()], ['o@other.com'])
        self.assertEqual(self.client.get('/api/v1/auth/invitations', headers=oh).json(), [])
        self.assertEqual(len(self.client.get('/api/v1/auth/invitations', headers=self.h).json()), 1)
        # an accountant may see the team but not change it
        inv = self.client.post('/api/v1/auth/invitations', json={'name': 'Acc', 'email': 'acc@acme.com', 'role': 'accountant'}, headers=self.h).json()
        acc = self.client.post(f"/api/v1/auth/invitations/{inv['token']}/accept", json={'password': 'acc-pass-12'}).json()
        ah = {'Authorization': f"Bearer {acc['access_token']}"}
        self.assertEqual(self.client.get('/api/v1/auth/users', headers=ah).status_code, 200)
        self.assertEqual(self.client.post('/api/v1/auth/invitations', json={'name': 'X', 'email': 'x@acme.com', 'role': 'driver'}, headers=ah).status_code, 403)
        self.assertEqual(self.client.put(f"/api/v1/auth/users/{self.owner['user']['id']}", json={'is_active': False}, headers=ah).status_code, 403)
        # the owner cannot lock themselves out
        self.assertEqual(self.client.put(f"/api/v1/auth/users/{self.owner['user']['id']}", json={'is_active': False}, headers=self.h).status_code, 400)

    def test_login_is_throttled(self):
        for _ in range(8):
            self.assertEqual(self.client.post('/api/v1/auth/login', data={'username': 'owner@acme.com', 'password': 'wrong'}).status_code, 401)
        self.assertEqual(self.client.post('/api/v1/auth/login', data={'username': 'owner@acme.com', 'password': 'wrong'}).status_code, 429)


if __name__ == '__main__':
    unittest.main()
