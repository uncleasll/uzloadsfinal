"""A sandbox company anyone can open from the login screens: one owner, one dispatcher, one driver, a small fleet, a week of loads."""
from __future__ import annotations
from datetime import date, timedelta

from sqlalchemy.orm import Session

from app.core.tenant import company_scope
from app.models.models import (BillingStatus, Broker, Company, Dispatcher, Driver, DriverDeduction, Load, LoadStatus, LoadStop, StopType,
                               Truck, TruckDeduction, User)
from app.services.auth_service import hash_password

DEMO_EMAILS = {"admin": "owner@demo.karvan", "dispatcher": "dispatch@demo.karvan", "driver": "driver@demo.karvan"}
DEMO_PASSWORD = "karvan-demo"


def ensure_demo(db: Session) -> dict[str, User]:
    """Creates the demo company on first use; afterwards just returns its three users."""
    with company_scope(None):
        owner = db.query(User).filter(User.email == DEMO_EMAILS["admin"]).first()
        if owner:
            users = {r: db.query(User).filter(User.email == e).first() for r, e in DEMO_EMAILS.items()}
            if all(users.values()):
                return users
            company = db.get(Company, owner.company_id)
        else:
            company = Company(name="Karvan Demo Trucking", week_start_day=5, payment_terms_days=30, factoring_company="RTS", factoring_fee_pct=3, factoring_advance_pct=90)
            db.add(company); db.flush()
    with company_scope(company.id):
        users = {}
        for role, email in DEMO_EMAILS.items():
            u = db.query(User).filter(User.email == email).first()
            if not u:
                u = User(name={"admin": "Demo Owner", "dispatcher": "Jasur (demo dispatcher)", "driver": "Bobur (demo driver)"}[role], email=email,
                         hashed_password=hash_password(DEMO_PASSWORD), role=role, is_active=True, company_id=company.id)
                db.add(u)
            users[role] = u
        db.flush()
        if not db.query(Truck).first():
            disp = Dispatcher(name="Jasur", is_active=True, commission_type="pct", commission_value=2)
            db.add(disp); db.flush()
            users["dispatcher"].dispatcher_id = disp.id
            drivers = [Driver(name=n, is_active=True, pay_type=pt, pay_pct=pct, per_mile_rate=pm, phone=ph) for n, pt, pct, pm, ph in
                       [("Bobur Nasimov", "percent", 30, 0, "555-0101"), ("Alisher Sharipov", "per_mile", 0, 0.55, "555-0102"), ("Erkin Mardonov", "percent", 30, 0, "555-0103")]]
            db.add_all(drivers); db.flush()
            users["driver"].driver_id = drivers[0].id
            db.add(DriverDeduction(driver_id=drivers[0].id, label="Occupational health", amount=150))
            trucks = [Truck(unit_number=u, make=mk, model=md, year=y, fee_pct=f, is_active=True, driver_id=d.id if d else None) for u, mk, md, y, f, d in
                      [("551", "Volvo", "VNL", 2022, 12, drivers[0]), ("328", "Freightliner", "Cascadia", 2021, 3.5, drivers[1]), ("780", "Volvo", "VNL 860", 2023, 3.5, drivers[2]), ("322", "Freightliner", "Cascadia", 2020, 3.5, None)]]
            db.add_all(trucks); db.flush()
            for t in trucks:
                for label, amt in [("CARGO INS", 411), ("ELD", 50), ("SAFETY", 75), ("PHYSICAL DAMAGE", 85.67), ("TRAILER", 300)] + ([("TRUCK PAYMENT", 927.57), ("PARKING", 100), ("IFTA", 45)] if t.unit_number == "551" else []):
                    db.add(TruckDeduction(truck_id=t.id, label=label, amount=amt))
            brokers = [Broker(name=n, is_broker=True, factoring=f, phone=p, quickpay_fee=2.5 if f else None) for n, f, p in [("RXO", False, "555-2000"), ("Blue Grace Logistics", True, "555-2001"), ("Trinity Logistics", False, "555-2002")]]
            db.add_all(brokers); db.flush()
            today = date.today()
            lanes = [("Chicago", "IL", "4500 S Cicero Ave", "Newark", "NJ", "100 Port St", 790, 2000), ("Franklin Park", "IL", "9800 W Grand Ave", "Atlanta", "GA", "3200 Fulton Industrial Blvd", 720, 1850),
                     ("Somerset", "NJ", "1 Davidson Ave", "Columbus", "OH", "4400 Groves Rd", 530, 1400), ("Louisville", "KY", "7400 Industrial Blvd", "Dallas", "TX", "2200 Irving Blvd", 850, 2300),
                     ("Newark", "NJ", "20 Doremus Ave", "Chicago", "IL", "3600 S Kedzie Ave", 800, 2100)]
            n = 1
            for i, (pc, ps, pa, dc, ds, da, miles, rate) in enumerate(lanes):
                t = trucks[i % 3]; d = drivers[i % 3]; b = brokers[i % 3]
                days_ago = 9 - i * 2
                st = LoadStatus.DELIVERED if i < 3 else (LoadStatus.EN_ROUTE if i == 4 else LoadStatus.DISPATCHED)   # Bobur has one open load
                l = Load(load_number=n, po_number=f"{b.name.split()[0].upper()[:3]}-{1000 + n}", truck_id=t.id, driver_id=d.id, broker_id=b.id, dispatcher_id=disp.id,
                         load_date=today - timedelta(days=days_ago), rate=rate, total_miles=miles, loaded_miles=miles - 40, empty_miles=40, is_active=True,
                         status=st, billing_status=BillingStatus.PENDING)
                l.stops.append(LoadStop(stop_type=StopType.PICKUP, stop_order=1, city=pc, state=ps, address=pa, stop_date=today - timedelta(days=days_ago), title=f"{pc} DC"))
                l.stops.append(LoadStop(stop_type=StopType.DELIVERY, stop_order=2, city=dc, state=ds, address=da, stop_date=today - timedelta(days=days_ago - 1), title=f"{dc} Receiver"))
                db.add(l); n += 1
            # one load waiting for a truck
            l = Load(load_number=n, po_number="TRI-1099", broker_id=brokers[2].id, dispatcher_id=disp.id, load_date=today + timedelta(days=1), rate=1650, total_miles=610, is_active=True, status=LoadStatus.NEW, billing_status=BillingStatus.PENDING)
            l.stops.append(LoadStop(stop_type=StopType.PICKUP, stop_order=1, city="Indianapolis", state="IN", stop_date=today + timedelta(days=1), title="Eli Lilly DC"))
            l.stops.append(LoadStop(stop_type=StopType.DELIVERY, stop_order=2, city="Nashville", state="TN", stop_date=today + timedelta(days=2), title="Nashville Receiver"))
            db.add(l)
        db.commit()
        for u in users.values():
            db.refresh(u)
        return users
