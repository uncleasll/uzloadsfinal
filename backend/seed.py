"""
Production seed — real Uzbek drivers, US brokers, 10+ loads across different states/statuses.
Run: python seed.py
"""
import sys
import os
from datetime import date, datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.db.session import SessionLocal
from app.services.driver_pay_service import take_snapshot
from app.db.session import engine
from app.models.models import (
    Base,
    Driver,
    Truck,
    Trailer,
    Broker,
    Dispatcher,
    Load,
    LoadStop,
    LoadService,
    LoadHistory,
    User,
    DriverProfile,
)
from app.services.auth_service import hash_password, create_user as _create_user

Base.metadata.create_all(bind=engine)
db = SessionLocal()

try:
    # ── Drivers ───────────────────────────────────────────────────────────────
    drivers = [
        Driver(name="Shohjahon Bobakulov", driver_type="Drv", phone="(240) 555-0101", email="shohjahon@silkroad.com", pay_rate_loaded=0.65, pay_rate_empty=0.30, is_active=True),
        Driver(name="Xumotyun Baxriddinov", driver_type="Drv", phone="(240) 555-0102", email="xumotyun@silkroad.com", pay_rate_loaded=0.60, pay_rate_empty=0.28, is_active=True),
        Driver(name="Jasur Toshmatov", driver_type="Drv", phone="(240) 555-0103", email="jasur@silkroad.com", pay_rate_loaded=0.65, pay_rate_empty=0.30, is_active=True),
        Driver(name="Bobur Yusupov", driver_type="OO", phone="(240) 555-0104", email="bobur@silkroad.com", pay_rate_loaded=0.75, pay_rate_empty=0.35, is_active=True),
        Driver(name="Dilshod Nazarov", driver_type="Drv", phone="(240) 555-0105", email="dilshod@silkroad.com", pay_rate_loaded=0.62, pay_rate_empty=0.29, is_active=True),
    ]
    db.add_all(drivers)
    db.flush()

    # ── Trucks ────────────────────────────────────────────────────────────────
    trucks = [
        Truck(unit_number="TRK001", make="Freightliner", model="Cascadia", year=2022, vin="1FUJGHDV3CLBP8001", is_active=True),
        Truck(unit_number="TRK002", make="Kenworth", model="T680", year=2021, vin="1XKWD49X3LJ001234", is_active=True),
        Truck(unit_number="TRK003", make="Peterbilt", model="389", year=2023, vin="2NP2HM6X2PM000321", is_active=True),
        Truck(unit_number="TRK004", make="Volvo", model="VNL 860", year=2022, vin="4V4NC9EH6NN000456", is_active=True),
    ]
    db.add_all(trucks)
    db.flush()

    # ── Trailers ──────────────────────────────────────────────────────────────
    trailers = [
        Trailer(unit_number="TRL001", trailer_type="Dry Van", is_active=True),
        Trailer(unit_number="TRL002", trailer_type="Reefer", is_active=True),
        Trailer(unit_number="TRL003", trailer_type="Dry Van", is_active=True),
    ]
    db.add_all(trailers)
    db.flush()

    # ── Brokers ───────────────────────────────────────────────────────────────
    brokers = [
        Broker(name="Global Freight LLC", mc_number="MC987654", city="Dallas", state="TX", phone="(972) 555-0201", email="dispatch@globalfreight.com", factoring=True, factoring_company="OTR Capital", is_active=True),
        Broker(name="National Transport Corp", mc_number="MC123456", city="Chicago", state="IL", phone="(312) 555-0202", email="loads@nationaltransport.com", factoring=False, is_active=True),
        Broker(name="FastLane Logistics", mc_number="MC456789", city="Atlanta", state="GA", phone="(404) 555-0203", email="ops@fastlane.com", factoring=True, factoring_company="Triumph Business Capital", is_active=True),
        Broker(name="Coyote Logistics", mc_number="MC789012", city="Chicago", state="IL", phone="(800) 555-0204", email="book@coyote.com", factoring=False, is_active=True),
        Broker(name="Echo Global Logistics", mc_number="MC234567", city="Phoenix", state="AZ", phone="(480) 555-0205", email="dispatch@echo.com", factoring=True, factoring_company="Porter Freight Funding", is_active=True),
        Broker(name="XPO Logistics", mc_number="MC345678", city="Charlotte", state="NC", phone="(704) 555-0206", email="freight@xpo.com", factoring=False, is_active=True),
    ]
    db.add_all(brokers)
    db.flush()

    # ── Dispatchers ───────────────────────────────────────────────────────────
    disps = [
        Dispatcher(name="Asilbek Karimov", email="asilbekkarimov066@gmail.com", phone="(970) 610-8065", is_active=True),
        Dispatcher(name="Sardor Rahimov", email="sardor@silkroad.com", phone="(720) 555-0301", is_active=True),
    ]
    db.add_all(disps)
    db.flush()

    d1, d2, d3, d4, d5 = drivers
    t1, t2, t3, t4 = trucks
    tr1, tr2, tr3 = trailers
    b1, b2, b3, b4, b5, b6 = brokers
    disp1, disp2 = disps

    # ── Loads ─────────────────────────────────────────────────────────────────
    # IMPORTANT:
    # Use exact DB enum values, not Python Enum member names like PICKED_UP/PENDING.
    loads_cfg = [
        dict(num=1001, status="Picked-up", billing="Pending",
             ld=date(2026, 4, 2), dd=date(2026, 4, 4), rate=0.0, lm=936, em=0,
             po="", drv=d2, trk=None, trl=None, brk=b2, dsp=disp1,
             stops=[("pickup", "New York Mills", "MN", "56567", date(2026, 4, 2)),
                    ("delivery", "Brookland", "AR", "72417", date(2026, 4, 4))],
             services=[dict(type="Lumper", add="Deduct", inv=213.0, pay=0.0, notes="Advanced")]),

        dict(num=1002, status="New", billing="Pending",
             ld=date(2026, 4, 5), dd=date(2026, 4, 8), rate=2500.0, lm=786, em=0,
             po="PO789456", drv=d1, trk=t1, trl=tr1, brk=b1, dsp=disp1,
             stops=[("pickup", "Dallas", "TX", "75201", date(2026, 4, 5)),
                    ("delivery", "Atlanta", "GA", "30301", date(2026, 4, 8))],
             services=[]),

        dict(num=1003, status="Delivered", billing="Invoiced",
             ld=date(2026, 3, 28), dd=date(2026, 3, 31), rate=3200.0, lm=1100, em=80,
             po="PO321654", drv=d3, trk=t2, trl=tr1, brk=b3, dsp=disp1,
             stops=[("pickup", "Miami", "FL", "33101", date(2026, 3, 28)),
                    ("delivery", "Philadelphia", "PA", "19101", date(2026, 3, 31))],
             services=[]),

        dict(num=1004, status="Closed", billing="Paid",
             ld=date(2026, 3, 20), dd=date(2026, 3, 23), rate=2800.0, lm=920, em=45,
             po="PO654987", drv=d4, trk=t3, trl=tr2, brk=b4, dsp=disp2,
             stops=[("pickup", "Los Angeles", "CA", "90001", date(2026, 3, 20)),
                    ("delivery", "Denver", "CO", "80201", date(2026, 3, 23))],
             services=[]),

        dict(num=1005, status="En Route", billing="Pending",
             ld=date(2026, 4, 6), dd=date(2026, 4, 9), rate=1900.0, lm=480, em=30,
             po="PO111222", drv=d5, trk=t4, trl=tr3, brk=b5, dsp=disp1,
             stops=[("pickup", "Houston", "TX", "77001", date(2026, 4, 6)),
                    ("delivery", "New Orleans", "LA", "70112", date(2026, 4, 9))],
             services=[]),

        dict(num=1006, status="Dispatched", billing="Pending",
             ld=date(2026, 4, 7), dd=date(2026, 4, 10), rate=3500.0, lm=1250, em=60,
             po="PO333444", drv=d1, trk=t1, trl=tr1, brk=b6, dsp=disp1,
             stops=[("pickup", "Seattle", "WA", "98101", date(2026, 4, 7)),
                    ("delivery", "San Francisco", "CA", "94101", date(2026, 4, 10))],
             services=[]),

        dict(num=1007, status="Delivered", billing="BOL received",
             ld=date(2026, 3, 25), dd=date(2026, 3, 28), rate=2200.0, lm=750, em=50,
             po="PO555666", drv=d2, trk=t2, trl=tr2, brk=b1, dsp=disp2,
             stops=[("pickup", "Nashville", "TN", "37201", date(2026, 3, 25)),
                    ("delivery", "Charlotte", "NC", "28201", date(2026, 3, 28))],
             services=[dict(type="Detention", add="Add", inv=150.0, pay=75.0, notes="4hr delay")]),

        dict(num=1008, status="Closed", billing="Paid",
             ld=date(2026, 3, 15), dd=date(2026, 3, 18), rate=4200.0, lm=1450, em=90,
             po="PO777888", drv=d3, trk=t3, trl=tr3, brk=b2, dsp=disp1,
             stops=[("pickup", "Chicago", "IL", "60601", date(2026, 3, 15)),
                    ("delivery", "Phoenix", "AZ", "85001", date(2026, 3, 18))],
             services=[]),

        dict(num=1009, status="Delivered", billing="Sent to factoring",
             ld=date(2026, 4, 1), dd=date(2026, 4, 4), rate=2650.0, lm=870, em=40,
             po="PO999000", drv=d4, trk=t4, trl=tr1, brk=b3, dsp=disp2,
             stops=[("pickup", "Kansas City", "MO", "64101", date(2026, 4, 1)),
                    ("delivery", "Memphis", "TN", "38101", date(2026, 4, 4))],
             services=[]),

        dict(num=1010, status="TONU", billing="Canceled",
             ld=date(2026, 4, 3), dd=None, rate=300.0, lm=0, em=85,
             po="PO101010", drv=d5, trk=t1, trl=tr2, brk=b4, dsp=disp1,
             stops=[("pickup", "Denver", "CO", "80201", date(2026, 4, 3)),
                    ("delivery", "Albuquerque", "NM", "87101", date(2026, 4, 4))],
             services=[]),

        dict(num=1011, status="Closed", billing="Paid",
             ld=date(2026, 3, 10), dd=date(2026, 3, 13), rate=3100.0, lm=980, em=55,
             po="PO111311", drv=d1, trk=t2, trl=tr3, brk=b5, dsp=disp1,
             stops=[("pickup", "Portland", "OR", "97201", date(2026, 3, 10)),
                    ("delivery", "Las Vegas", "NV", "89101", date(2026, 3, 13))],
             services=[]),

        dict(num=1012, status="Delivered", billing="Invoiced",
             ld=date(2026, 4, 4), dd=date(2026, 4, 7), rate=2100.0, lm=640, em=35,
             po="PO121212", drv=d2, trk=t3, trl=tr1, brk=b6, dsp=disp2,
             stops=[("pickup", "Indianapolis", "IN", "46201", date(2026, 4, 4)),
                    ("delivery", "St. Louis", "MO", "63101", date(2026, 4, 7))],
             services=[dict(type="Lumper", add="Add", inv=250.0, pay=125.0, notes="Unload fee")]),
    ]

    for cfg in loads_cfg:
        load = Load(
            load_number=cfg["num"],
            status=cfg["status"],
            billing_status=cfg["billing"],
            load_date=cfg["ld"],
            actual_delivery_date=cfg.get("dd"),
            rate=cfg["rate"],
            loaded_miles=cfg["lm"],
            empty_miles=cfg["em"],
            total_miles=cfg["lm"] + cfg["em"],
            po_number=cfg.get("po") or None,
            driver_id=cfg["drv"].id if cfg["drv"] else None,
            truck_id=cfg["trk"].id if cfg["trk"] else None,
            trailer_id=cfg["trl"].id if cfg["trl"] else None,
            broker_id=cfg["brk"].id if cfg["brk"] else None,
            dispatcher_id=cfg["dsp"].id if cfg["dsp"] else None,
            is_active=True,
        )
        db.add(load)
        db.flush()
        take_snapshot(db, load)
        db.flush()

        for i, (stype, city, state, zip_, sdate) in enumerate(cfg["stops"]):
            db.add(
                LoadStop(
                    load_id=load.id,
                    stop_type=stype,  # exact DB values: pickup / delivery
                    stop_order=i + 1,
                    city=city,
                    state=state,
                    zip_code=zip_,
                    country="US",
                    stop_date=sdate,
                )
            )

        for svc_cfg in cfg.get("services", []):
            db.add(
                LoadService(
                    load_id=load.id,
                    service_type=svc_cfg["type"],  # exact DB values: Lumper / Detention / Other
                    add_deduct=svc_cfg["add"],
                    invoice_amount=svc_cfg["inv"],
                    drivers_payable=svc_cfg["pay"],
                    notes=svc_cfg.get("notes"),
                )
            )

        pickup_stop = next((s for s in cfg["stops"] if s[0] == "pickup"), None)
        delivery_stop = next((s for s in cfg["stops"] if s[0] == "delivery"), None)
        pl = f"{pickup_stop[1]}, {pickup_stop[2]}" if pickup_stop else ""
        dl = f"{delivery_stop[1]}, {delivery_stop[2]}" if delivery_stop else ""
        drv_name = cfg["drv"].name if cfg["drv"] else "—"
        brk_name = cfg["brk"].name if cfg["brk"] else "—"

        db.add(
            LoadHistory(
                load_id=load.id,
                description=(
                    f"Load #{cfg['num']} created: driver: {drv_name}; broker: {brk_name}; "
                    f"route: {pl} → {dl}; rate: ${cfg['rate']:.2f}; "
                    f"status: {cfg['status']}; billing: {cfg['billing']}"
                ),
                author=cfg["dsp"].name if cfg["dsp"] else "System",
                created_at=datetime.now(),
            )
        )

    # ── Default admin / dispatcher users ──────────────────────────────────────
    if not db.query(User).filter(User.email == "admin@uzloads.com").first():
        db.add(
            User(
                name="Asilbek Karimov",
                email="admin@uzloads.com",
                hashed_password=hash_password("admin123"),
                role="admin",
                is_active=True,
            )
        )

    if not db.query(User).filter(User.email == "dispatcher@uzloads.com").first():
        db.add(
            User(
                name="Sardor Rahimov",
                email="dispatcher@uzloads.com",
                hashed_password=hash_password("disp123"),
                role="dispatcher",
                is_active=True,
            )
        )

    if not db.query(User).filter(User.email == "asilbekkarimov066@gmail.com").first():
        _create_user(db, "Asilbek Karimov", "asilbekkarimov066@gmail.com", "Asilbek123", role="dispatcher", dispatcher_id=disp1.id)

    if not db.query(User).filter(User.email == "sardor@silkroad.com").first():
        _create_user(db, "Sardor Rahimov", "sardor@silkroad.com", "Sardor123", role="dispatcher", dispatcher_id=disp2.id)

    # ── Driver profiles ───────────────────────────────────────────────────────
    profiles_data = [
        dict(driver=d1, first_name="Shohjahon", last_name="Bobakulov", status="Hired",
             hire_date=date(2026, 4, 5), address="9172 Ryerson rd", city="Philadelphia", state="PA", zip="19114",
             payable="Shohjahon Bobakulov", truck_id=t1.id, trailer_id=tr1.id),
        dict(driver=d2, first_name="Xumotyun", last_name="Baxriddinov", status="Hired",
             hire_date=date(2026, 4, 1), address="new york", address2="52th street", city="Phoenix", state="AZ", zip="85001",
             payable="Xumotyun Baxriddinov", truck_id=None, trailer_id=None),
        dict(driver=d3, first_name="Jasur", last_name="Toshmatov", status="Hired",
             hire_date=date(2026, 3, 15), address="123 Main St", city="Chicago", state="IL", zip="60601",
             payable="Jasur Toshmatov", truck_id=t2.id, trailer_id=tr2.id),
        dict(driver=d4, first_name="Bobur", last_name="Yusupov", status="Hired",
             hire_date=date(2026, 2, 1), address="456 Oak Ave", city="Denver", state="CO", zip="80201",
             payable="Bobur Yusupov", truck_id=t3.id, trailer_id=tr3.id),
        dict(driver=d5, first_name="Dilshod", last_name="Nazarov", status="Hired",
             hire_date=date(2026, 3, 1), address="789 Pine St", city="Houston", state="TX", zip="77001",
             payable="Dilshod Nazarov", truck_id=t4.id, trailer_id=None),
    ]

    for p in profiles_data:
        if not db.query(DriverProfile).filter(DriverProfile.driver_id == p["driver"].id).first():
            db.add(
                DriverProfile(
                    driver_id=p["driver"].id,
                    first_name=p["first_name"],
                    last_name=p["last_name"],
                    hire_date=p["hire_date"],
                    address=p.get("address", ""),
                    address2=p.get("address2", ""),
                    city=p.get("city", ""),
                    state=p.get("state", ""),
                    zip_code=p.get("zip", ""),
                    payable_to=p["payable"],
                    truck_id=p["truck_id"],
                    trailer_id=p["trailer_id"],
                    ifta_handled=True,
                    driver_status=p["status"],
                    pay_type="per_mile",
                    per_extra_stop=0,
                )
            )

    db.commit()

    print("✓ Seed completed:")
    print(f"  {len(drivers)} drivers, {len(trucks)} trucks, {len(trailers)} trailers")
    print(f"  {len(brokers)} brokers, {len(disps)} dispatchers")
    print(f"  {len(loads_cfg)} loads (loads 1001–1012)")
    print("✓ Admin user: admin@uzloads.com / admin123")
    print("✓ Dispatcher: dispatcher@uzloads.com / disp123")
    print("✓ Driver profiles created")
    print("\n  Auth credentials:")
    print("  admin@uzloads.com              / admin123")
    print("  dispatcher@uzloads.com         / disp123")
    print("  asilbekkarimov066@gmail.com   / Asilbek123")
    print("  sardor@silkroad.com           / Sardor123")

except Exception as e:
    db.rollback()
    print(f"✗ Seed failed: {e}")
    import traceback
    traceback.print_exc()
    raise

finally:
    db.close()