import os
os.environ['DATABASE_URL'] = 'sqlite://'
import unittest
from datetime import date, timedelta
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient
from app.models.models import Base, Driver, DriverDocument, Expense, Truck, TruckDocument
from app.main import app
from app.db.session import get_db
from app.core.tenant import company_scope


class ComplianceAndIfta(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine, autoflush=False)
        app.dependency_overrides[get_db] = lambda: self.db
        self.c = TestClient(app)
        owner = self.c.post('/api/v1/auth/register', json={'company_name': 'Acme', 'name': 'Owner', 'email': 'o@acme.com', 'password': 'secret-123'}).json()
        self.cid = owner['user']['company_id']; self.oh = {'Authorization': f"Bearer {owner['access_token']}"}
        today = date.today()
        with company_scope(self.cid):
            d = Driver(name='Bobur', is_active=True); self.t = Truck(unit_number='551', is_active=True, driver=d)
            self.db.add_all([d, self.t]); self.db.flush()
            self.db.add_all([
                DriverDocument(driver_id=d.id, doc_type='cdl', exp_date=today + timedelta(days=12)),
                DriverDocument(driver_id=d.id, doc_type='medical_card', exp_date=today - timedelta(days=3)),
                DriverDocument(driver_id=d.id, doc_type='mvr', exp_date=today + timedelta(days=200)),
                TruckDocument(truck_id=self.t.id, doc_type='registration', exp_date=today + timedelta(days=25)),
                Expense(expense_date=date(2026, 8, 3), category='Fuel', amount=612.40, truck_id=self.t.id, state='TX', gallons=180.0, is_active=True),
                Expense(expense_date=date(2026, 8, 20), category='Fuel', amount=300.00, truck_id=self.t.id, description='[karvan-pilot:abc] Pilot 123 · Amarillo, TX · 90.0 gal', is_active=True),
                Expense(expense_date=date(2026, 9, 2), category='Fuel', amount=410.00, truck_id=self.t.id, description='[karvan-pilot:def] Loves · Tucumcari, NM · 120.0 gal', is_active=True),
                Expense(expense_date=date(2026, 9, 5), category='Tolls', amount=40.00, truck_id=self.t.id, is_active=True),
            ])
            self.db.commit()

    def tearDown(self):
        app.dependency_overrides.clear(); self.db.close(); self.engine.dispose()

    def test_expiring_documents(self):
        items = self.c.get('/api/v1/compliance/expiring', headers=self.oh).json()
        self.assertEqual([(i['owner'], i['document'], i['status']) for i in items],
                         [('Bobur', 'Medical card', 'expired'), ('Bobur', 'CDL', 'soon'), ('Truck 551', 'Registration', 'soon')])
        d = self.c.get('/api/v1/dashboard', headers=self.oh).json()['attention']['documents']
        self.assertEqual((d['expired'], d['soon']), (1, 2))

    def test_ifta_worksheet(self):
        # Q3 2026: fuel in TX (180 + 90 parsed from text) and NM (120 parsed)
        w = self.c.get('/api/v1/ifta/2026/3', headers=self.oh).json()
        self.assertEqual(w['totals']['gallons'], 390.0); self.assertEqual(w['totals']['mpg'], None)
        # enter the miles per state from the ELD summary
        r = self.c.put(f'/api/v1/ifta/2026/3/trucks/{self.t.id}', json={'miles': {'TX': 2400, 'NM': 1500, 'AZ': 900, 'zz': 5}}, headers=self.oh)
        self.assertEqual(r.status_code, 200, r.text)
        w = r.json()
        self.assertEqual(w['totals']['miles'], 4800); self.assertEqual(w['totals']['mpg'], 12.31)
        by = {s['state']: s for s in w['states']}
        self.assertEqual(by['TX']['gallons'], 270.0); self.assertEqual(by['TX']['taxable_gallons'], 195.0); self.assertEqual(by['TX']['net_gallons'], -75.0)   # bought more than burned
        self.assertEqual(by['AZ']['gallons'], 0.0); self.assertGreater(by['AZ']['net_gallons'], 0)                                                     # burned, bought nothing
        self.assertEqual(w['trucks'][0]['states'], {'TX': 2400, 'NM': 1500, 'AZ': 900})


if __name__ == '__main__':
    unittest.main()
