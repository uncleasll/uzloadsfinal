"""Two companies on one database never see each other's trucks, loads, weeks or bills."""
import os
os.environ['DATABASE_URL'] = 'sqlite://'
import unittest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from app.models.models import Base, Company, Load, Truck
from app.core.tenant import company_scope, get_company_id, set_company_id, reset_company_id
from app.services.auth_service import decode_token
from app.api.v1 import api_router
from app.db.session import get_db


class Tenancy(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine, autoflush=False)
        app = FastAPI()

        @app.middleware("http")
        async def tenant(request: Request, call_next):
            cid = None
            auth = request.headers.get("authorization", "")
            if auth.lower().startswith("bearer "):
                payload = decode_token(auth[7:])
                cid = payload.get("company_id") if payload else None
            token = set_company_id(cid)
            try:
                return await call_next(request)
            finally:
                reset_company_id(token)

        app.include_router(api_router)
        app.dependency_overrides[get_db] = lambda: self.db
        self.client = TestClient(app)

    def tearDown(self):
        self.db.close(); self.engine.dispose()

    def signup(self, company, email):
        r = self.client.post('/api/v1/auth/register', json={'company_name': company, 'name': 'Owner', 'email': email, 'password': 'test-pass-123'})
        self.assertEqual(r.status_code, 201, r.text)
        return {'Authorization': f"Bearer {r.json()['access_token']}"}, r.json()['user']

    def test_companies_are_isolated(self):
        a, ua = self.signup('Karvan', 'a@example.com')
        b, ub = self.signup('Eastern Green', 'b@example.com')
        self.assertEqual(ua['company_name'], 'Karvan'); self.assertNotEqual(ua['company_id'], ub['company_id'])

        # Both companies can use the same unit number
        ra = self.client.post('/api/v1/trucks', json={'unit_number': '101'}, headers=a); self.assertEqual(ra.status_code, 201, ra.text)
        rb = self.client.post('/api/v1/trucks', json={'unit_number': '101'}, headers=b); self.assertEqual(rb.status_code, 201, rb.text)
        self.assertNotEqual(ra.json()['id'], rb.json()['id'])

        # Each sees only its own trucks, on the entity list and on the weekly board
        self.assertEqual([t['id'] for t in self.client.get('/api/v1/trucks', headers=a).json()], [ra.json()['id']])
        self.assertEqual([r['truck_id'] for r in self.client.get('/api/v1/weeks/2025-12-27', headers=b).json()['rows']], [rb.json()['id']])

        # A cannot open B's truck week, rules, or bill
        self.assertEqual(self.client.get(f"/api/v1/weeks/2025-12-27/trucks/{rb.json()['id']}", headers=a).status_code, 400)
        self.assertEqual(self.client.get(f"/api/v1/trucks/{rb.json()['id']}/rules", headers=a).status_code, 404)
        bill = self.client.post('/api/v1/bills', json={'label': 'Rent', 'amount': 100, 'due_day': 1}, headers=b).json()
        self.assertEqual(self.client.get('/api/v1/bills', headers=a).json(), [])
        self.assertEqual(self.client.put(f"/api/v1/bills/{bill['id']}", json={'label': 'X', 'amount': 1, 'due_day': 1}, headers=a).status_code, 404)

        # Load numbers start independently per company
        la = self.client.post('/api/v1/loads', json={'load_date': '2025-12-29', 'rate': 100, 'truck_id': ra.json()['id'], 'stops': []}, headers=a)
        lb = self.client.post('/api/v1/loads', json={'load_date': '2025-12-29', 'rate': 200, 'truck_id': rb.json()['id'], 'stops': []}, headers=b)
        self.assertEqual(la.status_code, 201, la.text); self.assertEqual(lb.status_code, 201, lb.text)
        self.assertEqual(la.json()['load_number'], lb.json()['load_number'])
        with company_scope(None):
            self.assertEqual(self.db.query(Load).count(), 2)
        with company_scope(ua['company_id']):
            self.assertEqual(self.db.query(Load).count(), 1)
            self.assertEqual(self.db.query(Truck).one().company_id, ua['company_id'])

    def test_no_company_means_no_filter_for_scripts(self):
        self.db.add_all([Company(name='A'), Company(name='B')]); self.db.commit()
        with company_scope(1):
            self.db.add(Truck(unit_number='1', is_active=True)); self.db.commit()
        with company_scope(2):
            self.db.add(Truck(unit_number='1', is_active=True)); self.db.commit()
            self.assertEqual(self.db.query(Truck).count(), 1)
        self.assertIsNone(get_company_id())
        self.assertEqual(self.db.query(Truck).count(), 2)


if __name__ == '__main__':
    unittest.main()
