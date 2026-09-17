"""Comdata export rows become truck expenses, keyed by Seq Num so re-imports are safe."""
import os
os.environ['DATABASE_URL'] = 'sqlite://'
import unittest
from datetime import date
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool
from app.models.models import Base, Expense, Truck
from app.services.comdata_import import import_comdata, category_for
from app.services import weekly_statement as ws

CSV = (
    "Seq Num,Date issued,Date Cashed,Code,Location City,State,Amount,Fees,Purpose,Unit,Control Num,Receiver,Charged\n"
    "1899,1/1/2025,1/1/2025,OH760,CAMBRIDGE,OH,500,4.5,FUEL,663,432768,KHASAN AMINOV,YES\n"
    "1903,1/3/2025,1/3/2025,TX000,AUSTIN,TX,40,4.5,LUMPER FEE\t,838,15087,DILSHOD KHAYITOV,LUMPER FEE\n"
    "1905,1/4/2025,1/4/2025,PA000,BELLEFONTE,PA,350,4.5,SERVICE,782,573574,DILSHODJON MARDONOV,YES\n"
    "1906,1/4/2025,1/4/2025,IL153,MONEE,IL,156.42,4.5,SERVICE,999,578336,NOBODY,YES\n"
)


class ComdataImport(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine, autoflush=False)
        for unit in ['663', '838', '782']:
            self.db.add(Truck(unit_number=unit, is_active=True, fee_pct=3.5))
        self.db.commit()

    def tearDown(self):
        self.db.close(); self.engine.dispose()

    def test_categories(self):
        self.assertEqual(category_for('FUEL'), 'Fuel')
        self.assertEqual(category_for('LUMPER FEE\t'), 'Lumper')
        self.assertEqual(category_for('TIRE CHANG'), 'Tires')
        self.assertEqual(category_for('TOWING'), 'Towing')
        self.assertEqual(category_for('BERGES'), 'Other')

    def test_import_creates_expenses_and_skips_duplicates(self):
        result = import_comdata(self.db, 'comdata.csv', CSV.encode())
        self.assertEqual(result['created'], 3)
        self.assertEqual(result['unmatched_units'], ['999'])
        fuel = self.db.query(Expense).filter(Expense.category == 'Fuel').one()
        self.assertEqual(fuel.amount, 504.5)                      # amount + card fee
        self.assertEqual(fuel.expense_date, date(2025, 1, 1))
        self.assertEqual(fuel.truck.unit_number, '663')
        self.assertIn('Comdata #1899', fuel.description)
        again = import_comdata(self.db, 'comdata.csv', CSV.encode())
        self.assertEqual((again['created'], again['skipped_duplicates']), (0, 3))
        self.assertEqual(self.db.query(Expense).count(), 3)

    def test_imported_fuel_lands_on_the_truck_statement(self):
        import_comdata(self.db, 'comdata.csv', CSV.encode())
        t = self.db.query(Truck).filter_by(unit_number='663').one()
        s = ws.generate(self.db, t.id, date(2024, 12, 28))     # week 12/28–1/03 contains 1/1
        self.assertEqual([l.kind for l in s.lines if l.kind == 'fuel'], ['fuel'])
        self.assertEqual(s.deductions, 504.5)

    def test_rejects_unknown_layout(self):
        with self.assertRaises(ValueError):
            import_comdata(self.db, 'x.csv', b"a,b,c\n1,2,3\n")


if __name__ == '__main__':
    unittest.main()
