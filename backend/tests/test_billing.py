import os, io, tempfile
os.environ['DATABASE_URL'] = 'sqlite://'
os.environ['UPLOAD_DIR'] = tempfile.mkdtemp()
import unittest
from datetime import date, timedelta
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient
from PIL import Image
from pypdf import PdfReader
from app.models.models import Base, Broker, Driver, Load, LoadStatus, BillingStatus, LoadStop, StopType, Truck
from app.main import app
from app.db.session import get_db
from app.core.tenant import company_scope


def png():
    b = io.BytesIO(); Image.new('RGB', (400, 300), (250, 250, 250)).save(b, 'PNG'); return b.getvalue()


class Billing(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine, autoflush=False)
        app.dependency_overrides[get_db] = lambda: self.db
        self.c = TestClient(app)
        owner = self.c.post('/api/v1/auth/register', json={'company_name': 'Acme', 'name': 'Owner', 'email': 'o@acme.com', 'password': 'secret-123'}).json()
        self.cid = owner['user']['company_id']; self.oh = {'Authorization': f"Bearer {owner['access_token']}"}
        self.c.put('/api/v1/company/me', json={'name': 'Acme', 'week_start_day': 5, 'payment_terms_days': 30, 'factoring_company': 'RTS', 'factoring_fee_pct': 3, 'factoring_advance_pct': 90}, headers=self.oh)
        with company_scope(self.cid):
            d = Driver(name='Bobur', is_active=True); t = Truck(unit_number='551', is_active=True, driver=d)
            self.direct = Broker(name='RXO', is_broker=True, factoring=False, pay_terms='Net 45')
            self.factored = Broker(name='Blue Grace', is_broker=True, factoring=True, quickpay_fee=2.5)
            self.db.add_all([d, t, self.direct, self.factored]); self.db.flush()
            self.l1 = Load(load_number=1, po_number='RX1', truck_id=t.id, driver_id=d.id, broker_id=self.direct.id, load_date=date.today() - timedelta(days=3), rate=2000, is_active=True, status=LoadStatus.DELIVERED, billing_status=BillingStatus.PENDING)
            self.l1.stops.append(LoadStop(stop_type=StopType.PICKUP, stop_order=1, city='Chicago', state='IL', stop_date=date.today() - timedelta(days=3)))
            self.l1.stops.append(LoadStop(stop_type=StopType.DELIVERY, stop_order=2, city='Newark', state='NJ', stop_date=date.today() - timedelta(days=1)))
            self.l2 = Load(load_number=2, po_number='BG1', truck_id=t.id, driver_id=d.id, broker_id=self.factored.id, load_date=date.today() - timedelta(days=2), rate=3400, is_active=True, status=LoadStatus.DELIVERED, billing_status=BillingStatus.PENDING)
            self.l3 = Load(load_number=3, po_number='OPEN', truck_id=t.id, driver_id=d.id, broker_id=self.direct.id, load_date=date.today(), rate=900, is_active=True, status=LoadStatus.EN_ROUTE, billing_status=BillingStatus.PENDING)
            self.db.add_all([self.l1, self.l2, self.l3]); self.db.commit()

    def tearDown(self):
        app.dependency_overrides.clear(); self.db.close(); self.engine.dispose()

    def test_ready_then_direct_flow(self):
        ready = self.c.get('/api/v1/billing/ready', headers=self.oh).json()
        self.assertEqual(sorted(r['load_number'] for r in ready), ['BG1', 'RX1'])     # OPEN is still moving
        r = self.c.post('/api/v1/billing/invoices', json={'load_ids': [self.l1.id], 'send': 'direct'}, headers=self.oh)
        self.assertEqual(r.status_code, 201, r.text); inv = r.json()[0]
        self.assertEqual((inv['status'], inv['channel'], inv['amount'], inv['broker']), ('Sent', 'direct', 2000.0, 'RXO'))
        self.assertEqual(inv['due_date'], (date.today() + timedelta(days=45)).isoformat())       # broker's Net 45 beats the company's 30
        o = self.c.get('/api/v1/billing/overview', headers=self.oh).json()
        self.assertEqual(o['direct']['amount'], 2000.0); self.assertEqual(o['ready']['count'], 1); self.assertEqual(o['aging']['0_30'], 2000.0)
        r = self.c.post(f"/api/v1/billing/invoices/{inv['id']}/paid", json={'amount': 2000}, headers=self.oh).json()
        self.assertEqual((r['status'], r['paid_amount']), ('Paid', 2000.0))
        self.db.expire_all()
        with company_scope(self.cid):
            self.assertEqual(self.db.get(Load, self.l1.id).billing_status, BillingStatus.PAID)

    def test_factoring_flow_and_overdue(self):
        r = self.c.post('/api/v1/billing/invoices', json={'load_ids': [self.l2.id], 'send': 'factoring'}, headers=self.oh).json()[0]
        self.assertEqual(r['status'], 'Factored'); self.assertEqual(r['fee_pct'], 2.5); self.assertEqual(r['fee_amount'], 85.0); self.assertEqual(r['advance_amount'], 3060.0)
        self.db.expire_all()
        with company_scope(self.cid):
            self.assertEqual(self.db.get(Load, self.l2.id).billing_status, BillingStatus.SENT_TO_FACTORING)
        o = self.c.get('/api/v1/billing/overview', headers=self.oh).json()
        self.assertEqual(o['at_factor'], {'count': 1, 'amount': 3400.0, 'advance_expected': 3060.0})
        f = self.c.post(f"/api/v1/billing/invoices/{r['id']}/funded", json={}, headers=self.oh).json()
        self.assertEqual(f['status'], 'Funded')
        o = self.c.get('/api/v1/billing/overview', headers=self.oh).json()
        self.assertEqual(o['funded_waiting_reserve'], {'count': 1, 'amount': 255.0})           # 3400 - 3060 - 85
        p = self.c.post(f"/api/v1/billing/invoices/{r['id']}/paid", json={}, headers=self.oh).json()
        self.assertEqual(p['paid_amount'], 3315.0)                                               # what the company keeps
        # overdue: an invoice sent 40 days ago on 30-day terms
        r2 = self.c.post('/api/v1/billing/invoices', json={'load_ids': [self.l1.id]}, headers=self.oh).json()[0]
        self.c.post(f"/api/v1/billing/invoices/{r2['id']}/send", json={'channel': 'direct', 'on': (date.today() - timedelta(days=60)).isoformat()}, headers=self.oh)
        o = self.c.get('/api/v1/billing/overview', headers=self.oh).json()
        self.assertEqual(o['overdue']['count'], 1); self.assertEqual(o['aging']['31_60'], 2000.0)
        d = self.c.get('/api/v1/dashboard', headers=self.oh).json()['attention']['invoices']
        self.assertEqual((d['overdue_count'], d['overdue_amount']), (1, 2000.0))

    def test_packet_includes_pod_pages(self):
        inv = self.c.post('/api/v1/billing/invoices', json={'load_ids': [self.l1.id]}, headers=self.oh).json()[0]
        # a POD photo from the driver app lands on the load
        self.c.post(f"/api/v1/loads/{self.l1.id}/documents", headers=self.oh, files={'file': ('pod.png', png(), 'image/png')}, data={'document_type': 'Other', 'notes': '[karvan-document:POD]'})
        r = self.c.get(f"/api/v1/billing/invoices/{inv['id']}/packet.pdf", headers=self.oh)
        self.assertEqual(r.status_code, 200); self.assertEqual(r.headers['content-type'], 'application/pdf')
        self.assertGreaterEqual(len(PdfReader(io.BytesIO(r.content)).pages), 2)                  # invoice + POD page


if __name__ == '__main__':
    unittest.main()

    def test_invoice_numbers_count_per_company(self):
        """Two companies both start at #1001: numbering never leaks across tenants."""
        r = self.c.post('/api/v1/billing/invoices', json={'load_ids': [self.l1.id], 'send': 'direct'}, headers=self.oh)
        self.assertEqual(r.status_code, 201, r.text); self.assertEqual(r.json()[0]['invoice_number'], 1001)
        other = self.c.post('/api/v1/auth/register', json={'company_name': 'Beta', 'name': 'Owner', 'email': 'o@beta.com', 'password': 'secret-123'}).json()
        cid2, oh2 = other['user']['company_id'], {'Authorization': f"Bearer {other['access_token']}"}
        with company_scope(cid2):
            d = Driver(name='Ali', is_active=True); t = Truck(unit_number='1', is_active=True, driver=d); b = Broker(name='TQL', is_broker=True)
            self.db.add_all([d, t, b]); self.db.flush()
            l = Load(load_number=1, po_number='T1', truck_id=t.id, driver_id=d.id, broker_id=b.id, load_date=date.today() - timedelta(days=2), rate=900, is_active=True, status=LoadStatus.DELIVERED, billing_status=BillingStatus.PENDING)
            self.db.add(l); self.db.commit()
        r = self.c.post('/api/v1/billing/invoices', json={'load_ids': [l.id], 'send': 'direct'}, headers=oh2)
        self.assertEqual(r.status_code, 201, r.text); self.assertEqual(r.json()[0]['invoice_number'], 1001)
        r = self.c.post('/api/v1/billing/invoices', json={'load_ids': [self.l2.id], 'send': 'direct'}, headers=self.oh)
        self.assertEqual(r.json()[0]['invoice_number'], 1002)
