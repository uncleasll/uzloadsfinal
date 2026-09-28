"""A sandbox company anyone can open from the sign-in screens. Seeded once with a month of realistic work:
loads across four weeks, statements (two paid), chat with photos, receipts, invoices in every state, bills, service, papers."""
from __future__ import annotations
import io
from datetime import date, datetime, timedelta

from sqlalchemy.orm import Session

from app.core.tenant import company_scope
from app.models.models import (BillPayment, BillingStatus, Broker, Company, Dispatcher, Driver, DriverDeduction, DriverDocument, Load, LoadStatus, LoadStop,
                               RecurringBill, StopType, Truck, TruckDeduction, TruckDocument, User)
from app.services.auth_service import hash_password

DEMO_EMAILS = {"admin": "owner@demo.karvan", "dispatcher": "dispatch@demo.karvan", "driver": "driver@demo.karvan"}
DEMO_PASSWORD = "karvan-demo"
SEED_VERSION = 4          # bump when the seed changes; an older demo company is wiped and rebuilt


def _wipe_company(db: Session, company_id: int) -> None:
    """Delete everything that belongs to one company, children first. Only ever used on the demo sandbox."""
    from sqlalchemy import text
    from app.models.models import Base
    scoped = {t.name for t in Base.metadata.sorted_tables if "company_id" in t.c}
    for t in reversed(Base.metadata.sorted_tables):
        if t.name == "companies":
            continue
        if "company_id" in t.c:
            db.execute(text(f"DELETE FROM {t.name} WHERE company_id = :cid"), {"cid": company_id})
            continue
        for fk in t.foreign_keys:
            parent = fk.column.table
            if parent.name in scoped:
                db.execute(text(f"DELETE FROM {t.name} WHERE {fk.parent.name} IN (SELECT id FROM {parent.name} WHERE company_id = :cid)"), {"cid": company_id})
    db.execute(text("DELETE FROM companies WHERE id = :cid"), {"cid": company_id})
    db.commit()

LANES = [  # pickup city, state, address, delivery city, state, address, miles, rate
    ("Chicago", "IL", "4500 S Cicero Ave", "Newark", "NJ", "100 Port St", 790, 2000), ("Franklin Park", "IL", "9800 W Grand Ave", "Atlanta", "GA", "3200 Fulton Industrial Blvd", 720, 1850),
    ("Somerset", "NJ", "1 Davidson Ave", "Columbus", "OH", "4400 Groves Rd", 530, 1400), ("Louisville", "KY", "7400 Industrial Blvd", "Dallas", "TX", "2200 Irving Blvd", 850, 2300),
    ("Newark", "NJ", "20 Doremus Ave", "Chicago", "IL", "3600 S Kedzie Ave", 800, 2100), ("Indianapolis", "IN", "5500 W Bradbury Ave", "Nashville", "TN", "1600 Elm Hill Pike", 290, 950),
    ("Dallas", "TX", "1100 N Stemmons Fwy", "Memphis", "TN", "4200 Air Trans Rd", 450, 1250), ("Columbus", "OH", "2900 Charter St", "Harrisburg", "PA", "1200 Cameron St", 430, 1300),
    ("Atlanta", "GA", "2000 Pleasantdale Rd", "Charlotte", "NC", "1900 Wilkinson Blvd", 250, 800), ("Memphis", "TN", "3800 Lamar Ave", "Houston", "TX", "9800 Wallisville Rd", 580, 1700),
]


def _photo(text: str, color=(226, 232, 240)) -> bytes:
    from PIL import Image, ImageDraw
    img = Image.new("RGB", (900, 650), color)
    d = ImageDraw.Draw(img)
    d.rectangle((40, 40, 860, 610), outline=(100, 116, 139), width=3)
    d.text((70, 80), text, fill=(15, 23, 42))
    for i in range(6):
        d.line((70, 160 + i * 60, 830, 160 + i * 60), fill=(148, 163, 184), width=2)
    buf = io.BytesIO(); img.save(buf, "JPEG", quality=80); return buf.getvalue()


def ensure_demo(db: Session) -> dict[str, User]:
    with company_scope(None):
        owner = db.query(User).filter(User.email == DEMO_EMAILS["admin"]).first()
        if owner and owner.phone == f"seed-v{SEED_VERSION}":
            users = {r: db.query(User).filter(User.email == e).first() for r, e in DEMO_EMAILS.items()}
            if all(users.values()):
                return users
        if owner:                                       # an older or half-built demo: start over
            _wipe_company(db, owner.company_id)
            owner = None
        if True:
            company = Company(name="Karvan Demo Trucking", week_start_day=5, payment_terms_days=30, factoring_company="RTS Financial", factoring_fee_pct=3, factoring_advance_pct=90)
            db.add(company); db.flush()
    with company_scope(company.id):
        users: dict[str, User] = {}
        for role, email in DEMO_EMAILS.items():
            u = db.query(User).filter(User.email == email).first()
            if not u:
                u = User(name={"admin": "Sam Karimov", "dispatcher": "Jasur Toshev", "driver": "Bobur Nasimov"}[role], email=email,
                         hashed_password=hash_password(DEMO_PASSWORD), role=role, is_active=True, company_id=company.id,
                         phone=f"seed-v{SEED_VERSION}" if role == "admin" else {"driver": "555-0101"}.get(role))
                db.add(u)
            users[role] = u
        users["admin"].phone = "seed-building"
        db.commit()
        users["_new"] = lambda name, role, slug, **links: _account(db, company.id, name, role, f"{slug}@demo.karvan", DEMO_PASSWORD, **links)
        try:
            _seed(db, users)
            users["admin"].phone = f"seed-v{SEED_VERSION}"
            db.commit()
        except Exception as e:                       # leave a readable trace; the next call wipes and rebuilds
            import traceback; traceback.print_exc()
            db.rollback()
            u = db.query(User).filter(User.email == DEMO_EMAILS["admin"]).first()
            if u:
                u.phone = f"seed-failed: {type(e).__name__}: {str(e)[:120]}"
                db.commit()
            raise RuntimeError(f"Demo seed failed: {type(e).__name__}: {str(e)[:300]}") from e
        users = {k: v for k, v in users.items() if isinstance(v, User)}
        for u in users.values():
            db.refresh(u)
        return users


SAMPLE_PASSWORD = "karvan-2026"


def _account(db: Session, cid: int, name: str, role: str, email: str, password: str, **links) -> User:
    u = db.query(User).filter(User.email == email).first()
    if not u:
        u = User(name=name, email=email, hashed_password=hash_password(password), role=role, is_active=True, company_id=cid, **links)
        db.add(u); db.flush()
    else:
        for k, v in links.items():
            setattr(u, k, v)
    return u


def _clear_company_data(db: Session, company_id: int) -> None:
    """Everything in one company except the company row and its owner accounts. Used to replace sample data."""
    from sqlalchemy import text
    from app.models.models import Base
    scoped = {t.name for t in Base.metadata.sorted_tables if "company_id" in t.c}
    for t in reversed(Base.metadata.sorted_tables):
        if t.name == "companies":
            continue
        if t.name == "users":
            db.execute(text("DELETE FROM users WHERE company_id = :cid AND role != 'admin'"), {"cid": company_id})
            continue
        if "company_id" in t.c:
            db.execute(text(f"DELETE FROM {t.name} WHERE company_id = :cid"), {"cid": company_id})
            continue
        for fk in t.foreign_keys:
            parent = fk.column.table
            if parent.name in scoped and parent.name != "users":
                db.execute(text(f"DELETE FROM {t.name} WHERE {fk.parent.name} IN (SELECT id FROM {parent.name} WHERE company_id = :cid)"), {"cid": company_id})
    db.commit()


def fill_company(db: Session, owner: User, replace: bool = False) -> dict:
    """Put the same month of realistic work into the owner's own company: fleet, people, loads, statements,
    invoices, expenses, papers and chat. Every driver, both dispatchers and an accountant get an account so all
    three apps have people to sign in as. Refuses when the company already has trucks unless replace=True, which
    clears everything but the owner accounts first."""
    cid = owner.company_id
    with company_scope(cid):
        if db.query(Truck).count():
            if not replace:
                raise ValueError("This company already has trucks. Sample data only goes into an empty company.")
            _clear_company_data(db, cid)
            db.expire_all()
            owner = db.get(User, owner.id)
        c = db.get(Company, cid)
        if c.week_start_day is None: c.week_start_day = 5
        if not c.factoring_company: c.factoring_company, c.factoring_fee_pct, c.factoring_advance_pct = "RTS Financial", 3, 90
        if c.payment_terms_days is None: c.payment_terms_days = 30
        users = {"admin": owner, "_accounts": []}
        users["_new"] = lambda name, role, slug, **links: _account(db, cid, name, role, f"{slug}@{cid}.karvan.local", SAMPLE_PASSWORD, **links)
        users["dispatcher"] = users["_new"]("Jasur Toshev", "dispatcher", "jasur")
        users["driver"] = users["_new"]("Bobur Nasimov", "driver", "bobur", phone="555-0101")
        db.commit()
        _seed(db, users)
        people = [users["dispatcher"], users["driver"]] + users["_accounts"]
        return {"accounts": [{"role": u.role.value if hasattr(u.role, "value") else u.role, "name": u.name, "email": u.email, "password": SAMPLE_PASSWORD} for u in people]}


def _seed(db: Session, users: dict[str, User]) -> None:
    from app.services import billing, chat, dispatcher_pay, maintenance as mt, weekly_statement as ws
    from app.models.models import Expense
    today = date.today()
    week0 = ws.week_start(today, db=db)

    disp = Dispatcher(name="Jasur Toshev", is_active=True, commission_type="pct", commission_value=2); disp2 = Dispatcher(name="Islom Rahimov", is_active=True, commission_type="flat", commission_value=200)
    db.add_all([disp, disp2]); db.flush(); users["dispatcher"].dispatcher_id = disp.id
    drivers = [Driver(name=n, is_active=True, pay_type=pt, pay_pct=pct, per_mile_rate=pm, phone=ph, driver_type=dt) for n, pt, pct, pm, ph, dt in
               [("Bobur Nasimov", "percent", 30, 0, "555-0101", "Drv"), ("Alisher Sharipov", "per_mile", 0, 0.55, "555-0102", "Drv"), ("Erkin Mardonov", "percent", 30, 0, "555-0103", "Drv"), ("Parvizjon Mukhiddinov", "none", 0, 0, "555-0104", "OO")]]
    db.add_all(drivers); db.flush(); users["driver"].driver_id = drivers[0].id
    # Everyone who works here can sign in: the other drivers, the second dispatcher, the accountant
    new = users.get("_new"); made = users.setdefault("_accounts", [])
    if new:
        for d, slug in zip(drivers[1:], ("alisher", "erkin", "parvizjon")):
            made.append(new(d.name, "driver", slug, driver_id=d.id, phone=d.phone))
        made.append(new(disp2.name, "dispatcher", "islom", dispatcher_id=disp2.id))
        made.append(new("Dilnoza Yusupova", "accountant", "dilnoza"))
        db.flush()
    db.add(DriverDeduction(driver_id=drivers[0].id, label="Occupational health", amount=150))
    trucks = [Truck(unit_number=u, make=mk, model=md, year=y, vin=v, plate=p, plate_state="IL", fee_pct=f, ownership=o, is_active=True, driver_id=d.id if d else None) for u, mk, md, y, v, p, f, o, d in
              [("551", "Volvo", "VNL 760", 2022, "4V4NC9EH5NN123551", "P-551 IL", 12, "Owned", drivers[0]), ("328", "Freightliner", "Cascadia", 2021, "3AKJHHDR5MSM00328", "P-328 IL", 3.5, "Owner-operator", drivers[1]),
               ("780", "Volvo", "VNL 860", 2023, "4V4NC9EJ8PN000780", "P-780 IL", 3.5, "Leased", drivers[2]), ("301", "Kenworth", "T680", 2020, "1XKYD49X0LJ000301", "P-301 IL", 12, "Owned", drivers[3]), ("322", "Freightliner", "Cascadia", 2020, "3AKJHHDR2LSL00322", "P-322 IL", 3.5, "Owned", None)]]
    db.add_all(trucks); db.flush()
    for t in trucks:
        rows = [("CARGO INS", 411), ("ELD", 50), ("SAFETY", 75), ("PHYSICAL DAMAGE", 85.67), ("TRAILER", 300)]
        if t.ownership == "Owned": rows += [("TRUCK PAYMENT", 927.57), ("PARKING", 100), ("IFTA", 45)]
        for label, amt in rows: db.add(TruckDeduction(truck_id=t.id, label=label, amount=amt))
    brokers = [Broker(name=n, is_broker=True, factoring=f, phone=p, quickpay_fee=q, pay_terms=pt, status="Approved", mc_number=mc) for n, f, p, q, pt, mc in
               [("RXO", False, "555-2000", None, "Net 30", "MC-123456"), ("Blue Grace Logistics", True, "555-2001", 2.5, "Net 45", "MC-234567"), ("Trinity Logistics", False, "555-2002", None, "Net 30", "MC-345678"), ("C.H. Robinson", True, "555-2003", 3.0, "Net 30", "MC-456789")]]
    db.add_all(brokers); db.flush()

    # ── four weeks of loads: weeks -3..-1 delivered, this week live
    n = 1000
    loads_by_truck: dict[int, list[Load]] = {}
    for wk in range(3, -1, -1):
        wstart = week0 - timedelta(days=7 * wk)
        for i, t in enumerate(trucks[:4]):
            d = t.driver
            for j in range(2 if wk else 1):
                lane = LANES[(i * 2 + j + wk) % len(LANES)]; b = brokers[(i + j + wk) % 4]
                pu = wstart + timedelta(days=(j * 3 + i) % 6)
                n += 1
                if wk == 0:
                    st = [LoadStatus.DISPATCHED, LoadStatus.EN_ROUTE, LoadStatus.PICKED_UP, LoadStatus.DELIVERED][i]
                else:
                    st = LoadStatus.DELIVERED
                l = Load(load_number=n, po_number=f"{b.name.split()[0].upper()[:3].replace('.', '')}-{n}", truck_id=t.id, driver_id=d.id if d else None, broker_id=b.id,
                         dispatcher_id=disp.id if i % 2 == 0 else disp2.id, load_date=pu, rate=lane[7], total_miles=lane[6], loaded_miles=lane[6] - 40, empty_miles=40,
                         is_active=True, status=st, billing_status=BillingStatus.PENDING, actual_delivery_date=pu + timedelta(days=1) if st == LoadStatus.DELIVERED else None)
                l.stops.append(LoadStop(stop_type=StopType.PICKUP, stop_order=1, city=lane[0], state=lane[1], address=lane[2], stop_date=pu, title=f"{lane[0]} DC"))
                l.stops.append(LoadStop(stop_type=StopType.DELIVERY, stop_order=2, city=lane[3], state=lane[4], address=lane[5], stop_date=pu + timedelta(days=1), title=f"{lane[3]} Receiver"))
                db.add(l); loads_by_truck.setdefault(t.id, []).append(l)
    # one load waiting for a truck
    l = Load(load_number=n + 1, po_number="TRI-2099", broker_id=brokers[2].id, dispatcher_id=disp.id, load_date=today + timedelta(days=1), rate=1650, total_miles=610, is_active=True, status=LoadStatus.NEW, billing_status=BillingStatus.PENDING)
    l.stops.append(LoadStop(stop_type=StopType.PICKUP, stop_order=1, city="Indianapolis", state="IN", address="5500 W Bradbury Ave", stop_date=today + timedelta(days=1), title="Eli Lilly DC"))
    l.stops.append(LoadStop(stop_type=StopType.DELIVERY, stop_order=2, city="Nashville", state="TN", address="1600 Elm Hill Pike", stop_date=today + timedelta(days=2), title="Nashville Receiver"))
    db.add(l); db.flush()

    # ── expenses: fuel with state and gallons, tolls, a repair
    for wk in range(3, -1, -1):
        wstart = week0 - timedelta(days=7 * wk)
        for i, t in enumerate(trucks[:4]):
            for k, (st, gal, price) in enumerate([("IL", 120, 3.89), ("OH", 95, 3.74), ("TX", 140, 3.42)][: 2 + (i % 2)]):
                db.add(Expense(expense_date=wstart + timedelta(days=k * 2), category="Fuel", amount=round(gal * price, 2), gallons=gal, state=st, truck_id=t.id,
                               description=f"Pilot #{300 + k} · {['Effingham', 'Toledo', 'Amarillo'][k]}, {st} · {gal:.1f} gal"))
            db.add(Expense(expense_date=wstart + timedelta(days=3), category="Tolls", amount=[42.5, 38, 61.25, 19][i], truck_id=t.id, description="EZPass"))
    db.add(Expense(expense_date=week0 - timedelta(days=9), category="Repair", amount=1240, truck_id=trucks[1].id, description="Brake pads and rotors · Chicago Freightliner"))
    db.flush()

    # ── statements: past three weeks generated, two paid, one ready
    for wk in range(3, 0, -1):
        wstart = week0 - timedelta(days=7 * wk)
        for t in trucks[:4]:
            s = ws.generate(db, t.id, wstart)
            ws.set_odometer(db, s, 412000 + (3 - wk) * 2900 + t.id * 10, 412000 + (4 - wk) * 2900 + t.id * 10)
            if wk >= 2:
                ws.set_status(db, s, "ready"); ws.set_status(db, s, "paid", ach_reference=f"ACH-{wstart:%m%d}-{t.unit_number}")
            elif t.unit_number in ("551", "328"):
                ws.set_status(db, s, "ready")
        dispatcher_pay.set_paid(db, disp.id, wstart, True) if wk >= 2 else None
    for t in trucks[:4]:
        ws.generate(db, t.id, week0)
    db.commit()

    # ── invoices in every state
    delivered = [l for ls in loads_by_truck.values() for l in ls if getattr(l.status, "value", l.status) == "Delivered"]
    delivered.sort(key=lambda l: l.load_date)
    for idx, l in enumerate(delivered):
        inv = billing.create_from_load(db, l)
        if idx < 3:
            billing.send(db, inv, "direct", on=l.load_date + timedelta(days=2)); billing.paid(db, inv, on=l.load_date + timedelta(days=26))
        elif idx < 5:
            billing.send(db, inv, "factoring", on=l.load_date + timedelta(days=2)); billing.funded(db, inv, on=l.load_date + timedelta(days=4)); billing.paid(db, inv, on=l.load_date + timedelta(days=30))
        elif idx < 8:
            billing.send(db, inv, "factoring", on=l.load_date + timedelta(days=2)); billing.funded(db, inv, on=l.load_date + timedelta(days=4)) if idx == 5 else None
        elif idx < 11:
            billing.send(db, inv, "direct", on=l.load_date + timedelta(days=2))
        elif idx == 11:
            billing.send(db, inv, "direct", on=today - timedelta(days=41))       # overdue
    # ── bills
    bills = [RecurringBill(label="Office rent", vendor="Elk Grove Plaza", amount=2400, due_day=1, account="Chase"), RecurringBill(label="Cargo insurance", vendor="Progressive", amount=1644, due_day=5, account="Chase"),
             RecurringBill(label="ELD subscription", vendor="Motive", amount=200, due_day=15, account="Amex"), RecurringBill(label="Samsara", vendor="Samsara", amount=180, due_day=20, account="Amex"), RecurringBill(label="Truck 551 loan", vendor="Volvo Financial", amount=3710, due_day=25, account="Chase", truck_id=trucks[0].id)]
    db.add_all(bills); db.flush()
    month = today.strftime("%Y-%m")
    for b in bills[:2]:
        db.add(BillPayment(bill_id=b.id, month=month, amount=b.amount, paid_at=datetime(today.year, today.month, min(b.due_day, today.day))))
    # ── maintenance and papers
    for t in trucks[:4]:
        mt.record_service(db, t.id, "Oil Change", today - timedelta(days=[60, 130, 20, 95][trucks.index(t)]), 412000 + t.id * 10 - 5000, cost=380, vendor="Chicago Freightliner")
        mt.record_odometer(db, t.id, today, 412000 + 3 * 2900 + t.id * 10 + 600, source="eld")
    db.add_all([DriverDocument(driver_id=drivers[0].id, doc_type="cdl", number="N123-4567-8901", state="IL", exp_date=today + timedelta(days=400)),
                DriverDocument(driver_id=drivers[0].id, doc_type="medical_card", exp_date=today + timedelta(days=18)),
                DriverDocument(driver_id=drivers[1].id, doc_type="cdl", number="S987-6543-2100", state="IL", exp_date=today + timedelta(days=210)),
                DriverDocument(driver_id=drivers[2].id, doc_type="medical_card", exp_date=today - timedelta(days=6)),
                TruckDocument(truck_id=trucks[0].id, doc_type="registration", exp_date=today + timedelta(days=90)), TruckDocument(truck_id=trucks[1].id, doc_type="annual_inspection", exp_date=today + timedelta(days=25)),
                TruckDocument(truck_id=trucks[2].id, doc_type="registration", exp_date=today + timedelta(days=300))])
    db.commit()

    # ── chat: every truck group has its people and a week of talk; PODs, receipts, inspections; load threads
    chat.sync_memberships(db)
    owner, dispatcher, driver_u = users["admin"], users["dispatcher"], users["driver"]
    by_name = {u.name: u for u in users["_accounts"]}
    acct = by_name.get("Dilnoza Yusupova")
    disp_u = {disp.id: dispatcher, disp2.id: by_name.get(disp2.name, dispatcher)}          # who dispatches each truck
    drv_u = {drivers[0].id: driver_u, **{d.id: by_name[d.name] for d in drivers[1:] if d.name in by_name}}
    groups = {t.id: chat.ensure_truck_conversation(db, t) for t in trucks}
    everyone = chat.ensure_company_channel(db)
    from app.models.models import Message
    def at(days_ago, hour): return datetime.combine(today - timedelta(days=days_ago), datetime.min.time()) + timedelta(hours=hour)
    def msg(conv, sender, body, days_ago, hour, kind="text"):
        if sender is None:
            m = Message(conversation_id=conv.id, sender_id=None, kind=kind, body=body); db.add(m); db.flush()
        else:
            m = chat.post_message(db, conv, sender, body, kind=kind)
        m.created_at = at(days_ago, hour); db.commit(); return m
    def photo(conv, sender, text, category, truck, days_ago, hour, load=None, lat=None, lng=None, color=(226, 232, 240), caption=None):
        m = msg(conv, sender, caption or f"{category.upper()} photo", days_ago, hour, kind="photo")
        a = chat.store_attachment(db, user=sender, data=_photo(text, color), filename=f"{category}.jpg", content_type="image/jpeg", category=category,
                                  truck_id=truck.id, load_id=load.id if load else None, taken_at=at(days_ago, hour), lat=lat, lng=lng, message=m)
        if load and category == "pod":
            chat.attach_to_load(db, a, load, "Other", "[karvan-document:POD]")
        return m

    # Company channel: the office talks to everyone
    msg(everyone, owner, "Reminder: statements go out Friday. Get your PODs in by Thursday night.", 6, 9)
    msg(everyone, dispatcher, "Blue Grace pays 45 days, we factor those. RXO and Trinity are direct, 30 days.", 6, 9.5)
    if acct: msg(everyone, acct, "Fuel receipts: photo in your truck group the same day, please. IFTA is due next month.", 5, 10)
    msg(everyone, owner, "Winter tires for 551 and 780 booked for next week at Chicago Freightliner.", 2, 16)
    msg(everyone, dispatcher, "Weekend: Islom covers Saturday, I'm on Sunday. Call, don't text, if a truck is down.", 1, 17)

    # Each truck group: last week's load closed with a POD, this week's load in progress, fuel receipts
    positions = {trucks[0].id: (39.1201, -88.5434), trucks[1].id: (40.4977, -74.4885), trucks[2].id: (40.7357, -74.1724), trucks[3].id: (41.8781, -87.6298)}
    for i, t in enumerate(trucks[:4]):
        g = groups[t.id]; d = drivers[i]; du = drv_u.get(d.id); pu = disp_u[disp.id if i % 2 == 0 else disp2.id]
        mine = loads_by_truck[t.id]; live = mine[-1]
        done = [x for x in mine if getattr(x.status, "value", x.status) == "Delivered" and x is not live]
        last_done = done[-1]
        lat, lng = positions[t.id]
        msg(g, pu, f"{d.name.split()[0]}, {last_done.po_number} delivered? I need the POD for the invoice.", 6 - i, 8)
        if du:
            msg(g, du, "Yes, signed at the receiver. Photo below.", 6 - i, 8.3)
            photo(g, du, f"PROOF OF DELIVERY  {last_done.po_number}  received in good order", "pod", t, 6 - i, 8.4, load=last_done, lat=lat, lng=lng, caption=f"POD · {last_done.po_number}")
            msg(g, pu, "Got it, invoicing today. Next one is in the app.", 6 - i, 8.7)
        msg(g, None, f"{d.name}: load #{live.po_number} dispatched", 2, 7, kind="system")
        if du:
            fuel = [("PILOT #300  EFFINGHAM, IL   DIESEL 120.0 GAL   $466.80", "Fuel · $466.80", 1, 11), ("LOVES #412  TOLEDO, OH   DIESEL 95.0 GAL   $355.30", "Fuel · $355.30", 1, 13),
                    ("TA #88  AMARILLO, TX   DIESEL 140.0 GAL   $478.80", "Fuel · $478.80", 2, 15), ("PILOT #217  GARY, IN   DIESEL 110.0 GAL   $421.30", "Fuel · $421.30", 1, 9)][i]
            msg(g, du, "Fuel stop, receipt attached.", fuel[2], fuel[3])
            photo(g, du, fuel[0], "receipt", t, fuel[2], fuel[3] + 0.1, lat=lat, lng=lng, color=(250, 250, 245), caption=f"Receipt · {fuel[1]}")
        status = getattr(live.status, "value", live.status)
        if status == "Dispatched":
            msg(g, pu, f"Pickup is {live.stops[0].title}, appointment 07:00. Check in at the guard shack.", 1, 18)
            if du: msg(g, du, "Copy. Leaving the yard at 5.", 1, 18.5)
        elif status == "En Route":
            if du: msg(g, du, f"Rolling to {live.stops[0].city}, ETA 2 hours.", 0, 6.5)
            msg(g, pu, "Pre-trip photos please before you roll.", 0, 6.6)
            if du:
                m = msg(g, du, "Inspection · 4 photos", 0, 6.9, kind="photo")
                for side in ("FRONT", "REAR", "LEFT", "RIGHT"):
                    chat.store_attachment(db, user=du, data=_photo(f"TRUCK {t.unit_number}  {side}", (203, 213, 225)), filename=f"{side.lower()}.jpg", content_type="image/jpeg", category="inspection", truck_id=t.id, taken_at=at(0, 6.9), lat=lat, lng=lng, message=m)
        elif status == "Picked-up":
            if du:
                msg(g, du, f"Loaded at {live.stops[0].title}, 22 pallets, sealed. Heading to {live.stops[1].city}.", 0, 10)
                photo(g, du, f"BILL OF LADING  {live.po_number}  22 PLT  SEAL 004871", "bol", t, 0, 10.1, load=live, lat=lat, lng=lng, caption=f"BOL · {live.po_number}")
            msg(g, pu, "Receiver closes at 16:00 tomorrow, don't be late.", 0, 10.5)
        else:
            if du:
                msg(g, du, f"Delivered {live.po_number}, clean. Where next?", 0, 9)
                photo(g, du, f"PROOF OF DELIVERY  {live.po_number}  received in good order", "pod", t, 0, 9.1, load=live, lat=lat, lng=lng, caption=f"POD · {live.po_number}")
            msg(g, pu, "Nice. Looking at a Trinity load out of Indy for tomorrow, hold on.", 0, 9.4)
    # The shop story on 328 and the empty truck
    msg(groups[trucks[1].id], owner, "Shop invoice for the brakes is $1,240, it's on 328's week.", 3, 12)
    msg(groups[trucks[4].id], owner, "322 sits until we hire. Two interviews Thursday.", 4, 15)

    # Load threads for the live loads, dispatcher and driver only talk about that load
    for i, t in enumerate(trucks[:4]):
        live = loads_by_truck[t.id][-1]; du = drv_u.get(drivers[i].id); pu = disp_u[disp.id if i % 2 == 0 else disp2.id]
        th = chat.ensure_load_conversation(db, live); chat.sync_memberships(db)
        msg(th, pu, f"{live.po_number}: {live.stops[0].city} → {live.stops[1].city}, ${live.rate:,.0f}, {live.total_miles} mi. Rate con is in the app.", 2, 7.2)
        if du: msg(th, du, "Got it.", 2, 7.5)
        if live.broker and live.broker.phone: msg(th, pu, f"Broker contact for check calls: {live.broker.name} {live.broker.phone}", 2, 7.6)
    db.commit()
