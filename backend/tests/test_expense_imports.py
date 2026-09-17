"""Pilot fuel and toll exports (Fleet Command Center formats) become truck expenses; Comdata still works."""
import os
os.environ['DATABASE_URL'] = 'sqlite://'
import unittest
from datetime import date
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool
from app.models.models import Base, Expense, Truck
from app.services.expense_imports import detect_format, import_expenses, read_table
from app.services import weekly_statement as ws

PILOT = (
    "Trans Date,Driver Name,Unit Number,Card Number,Unit Price,Fees,Quantity,Discount,Amount,State,City,Location,Checker\n"
    "8/30/2026,Mukhamedov Alisher,1007,7083050030699437609,5.7,1.5,141.28,91.41,713.75,OH,GIRARD,PETRO GIRARD,\n"
    "8/30/2026,Shah Agha,1008,7083050030899387208,5.96,1.5,112.02,39.21,628.32,AZ,QUARTZSITE,PILOT QUARTZSITE 328,\n"
    "8/29/2026,Nobody,9999,1,5,1.5,10,0,50,TX,VAN HORN,PILOT,\n"
)
TOLLS = (
    "BILL TO ACCOUNT NUMBER,INVOICE NUMBER,INVOICE DATE,ACCOUNT NUMBER,SOURCE,POSTED DATE,PP DEVICE ID,TOLL RECORD ID,EQUIP ID,AGENCY,ENTRY PLAZA,ENTRY DATE/TIME,EXIT PLAZA,EXIT DATE/TIME,CL,MILES,TR PLATE,TOLL\n"
    "1,0573682M260831,8/31/2026,573682,ELITE,8/21/2026,777838807,14236179,1122,KTA,,,043NB,8/19/2026 16:20:40,5,0,N,0.41\n"
    "1,0573682M260831,8/31/2026,573682,EZPASS,8/27/2026,777838807,1606596616,1122,WVPEDTA,,,Pax,8/26/2026 1:31:01,8,0,N,13\n"
    "1,0573682M260831,8/31/2026,573682,EZPASS,8/23/2026,777838811,1606596626,1003,PTC,GTY - Gateway Barrier - 2,8/21/2026 15:50:00,T313 - T313 E,8/21/2026 15:56:17,4,0,N,31.57\n"
)


class ExpenseImports(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine, autoflush=False)
        for unit in ['1007', '1008', '1122', '1003']:
            self.db.add(Truck(unit_number=unit, is_active=True))
        self.db.commit()

    def tearDown(self):
        self.db.close(); self.engine.dispose()

    def test_detects_formats(self):
        self.assertEqual(detect_format(read_table('a.csv', PILOT.encode())[0]), 'pilot')
        self.assertEqual(detect_format(read_table('a.csv', TOLLS.encode())[0]), 'tolls')
        self.assertEqual(detect_format(read_table('a.csv', b"Seq Num,Date issued,Amount,Fees,Purpose,Unit\n")[0]), 'comdata')
        with self.assertRaises(ValueError):
            import_expenses(self.db, 'x.csv', b"a,b\n1,2\n")

    def test_pilot_fuel(self):
        r = import_expenses(self.db, 'pilot.csv', PILOT.encode())
        self.assertEqual((r['format'], r['created'], r['unmatched_units']), ('pilot', 2, ['9999']))
        e = self.db.query(Expense).filter(Expense.truck.has(unit_number='1007')).one()
        self.assertEqual((e.category, e.amount, e.expense_date), ('Fuel', 713.75, date(2026, 8, 30)))
        self.assertIn('141.3 gal', e.description)
        again = import_expenses(self.db, 'pilot.csv', PILOT.encode())
        self.assertEqual((again['created'], again['skipped_duplicates']), (0, 2))

    def test_tolls_land_on_the_statement(self):
        r = import_expenses(self.db, 'tolls.csv', TOLLS.encode())
        self.assertEqual((r['format'], r['created']), ('tolls', 3))
        t = self.db.query(Truck).filter_by(unit_number='1122').one()
        s = ws.generate(self.db, t.id, date(2026, 8, 15))   # week 8/15–8/21 has the KTA toll
        self.assertEqual([round(l.amount, 2) for l in s.lines if l.kind == 'expense'], [0.41])
        s = ws.generate(self.db, t.id, date(2026, 8, 22))   # 8/26 WVPEDTA toll
        self.assertEqual(s.deductions, 13.0)
        self.assertTrue(all(e.category == 'Tolls' for e in self.db.query(Expense).all()))


if __name__ == '__main__':
    unittest.main()
