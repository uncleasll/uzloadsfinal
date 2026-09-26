# Karvan — Excel tizimini tizimga ko'chirish rejasi

Sana: 2026-09-17. Manba: `Desktop/KARVAN/crm/STATEMENTS 2025.xlsx` va yon fayllar.
Maqsad: haftalik truck statementi Excel blokidagi hisob-kitob bilan aynan bir xil chiqsin, lekin hamma narsa avtomatik bo'lsin.

## 1. Asosiy tushuncha

Birlik = **truck + hafta (shanba–juma)**. Har hafta har truck uchun bitta statement o'zi yasaladi:

```
GROSS          = shu hafta yuklar rate yig'indisi
FEE            = GROSS × truck.fee_pct            (3.5% / 7% / 12%)
DOIMIY         = truck shablonidagi qatorlar      (cargo, ELD, safety, PD, trailer, truck payment, parking, IFTA)
DIESEL         = expenses(truck, hafta, category=Fuel)
BIR MARTALIK   = expenses(truck, hafta, boshqa) + qo'lda qo'shilgan qatorlar
DRIVER PAY     = 30% × GROSS   yoki   0.55 × (odometer_end − odometer_start)   yoki   0 (o'zi haydaydi)
CARRY_IN       = o'tgan hafta net manfiy bo'lsa, shu summa
NET            = GROSS − FEE − DOIMIY − DIESEL − BIR MARTALIK − DRIVER PAY − CARRY_IN
DRIVER PAYOUT  = DRIVER PAY − haydovchi tomonidagi chegirmalar (masalan occupational health)
```

Ikki natija: **NET** (truck egasiga yoki kompaniyaga) va **DRIVER PAYOUT** (ACH bilan haydovchiga).

## 2. Ma'lumotlar modeli (backend o'zgarishlari)

Saqlanadi: `loads`, `drivers`, `trucks`, `brokers`, `dispatchers`, `expenses`, `settlements`, `settlement_items`, `settlement_adjustments`, `settlement_payments`, `payroll_carryovers`, `users`.

Qo'shiladi:

| Jadval / maydon | Nima uchun |
|---|---|
| `trucks.fee_pct`, `trucks.ownership` (company / leased / owner_operator), `trucks.owner_vendor_id` | fee foizi va net kimga ketishi |
| `truck_deductions` (truck_id, label, amount, effective_from, effective_to, active) | doimiy chegirma shabloni, tarix bilan |
| `drivers.pay_type` (percent / per_mile / none), `drivers.pay_pct` (0.30), `drivers.per_mile_rate` (0.55) | ikki pay turi, DriverProfile ning 4 turi o'rniga |
| `settlements.truck_id`, `settlements.period_start`, `settlements.period_end`, `settlements.gross`, `settlements.net`, `settlements.driver_payout`, `settlements.odometer_start`, `settlements.odometer_end`, `settlements.carry_in` | truck va hafta bo'yicha statement, hisoblangan natijalar saqlanadi |
| `settlement_lines` (settlement_id, kind: fee / template / fuel / expense / driver_pay / driver_deduction / carry_in / manual, label, amount, source_expense_id) | blokning har qatori manbasi bilan |
| `dispatchers.commission_type` (pct / flat), `dispatchers.commission_value` | 2%, 2.5%, flat 170 / 200 |
| `dispatcher_settlements` (dispatcher_id, period, gross, commission, paid) | Office sheet |
| `recurring_bills` (label, vendor, amount, due_day, account, active) va `bill_payments` (bill_id, month, paid_at, amount) | Dues sheet |
| `expenses.settlement_id` | xarajat qaysi statementga tushgani |
| `load_documents.document_type` ga `POD` | POD checkbox ishlashi |

Olib tashlanadi yoki yashiriladi: `DriverProfile.pay_type` ning flatpay / hourly, `driver_time_reports`, `driver_additional_payees`, `load_additional_payees`, `advanced_payments`, `scheduled_payroll_occurrences`, `quickpay_rate_snapshot`, extra stop, `billing_status` (faqat `invoiced` bool qoladi), `direct_billing`.

## 3. Ekranlar (6 ta)

1. **Hafta doskasi** `/` — hafta tanlanadi. Har truck bir qator: haydovchi, yuklar soni, gross, chegirmalar, driver pay, net, carry, POD yetishmayapti, holat (draft / tayyor / to'langan). Pastda jami. Bu dashboard.
2. **Yuklar** `/loads` — bitta jadval, bitta forma: truck, haydovchi (truckdan o'zi keladi), dispatcher, broker, load#, PU sana, DEL sana, qayerdan, qayerga, rate, POD. Yuk saqlanganda truckning shu haftasiga tushadi.
3. **Statement** `/trucks/:id/weeks/:period` — Excel bloki ko'rinishida. Qatorlar avtomatik, qo'lda qator qo'shish mumkin, odometer kiritiladi, "Tayyor" → PDF → ACH raqami → "To'langan". To'langandan keyin qulflanadi.
4. **Xarajatlar** `/expenses` — bitta ledger: sana, truck, kategoriya, summa, manba. Comdata CSV import. Fuel qatorlari statementga o'zi tushadi.
5. **Dispatcherlar** `/dispatchers` — hafta bo'yicha har dispatcherning gross i va haqi, to'landi belgisi.
6. **Sozlamalar** `/settings` — trucklar (shablon bilan), haydovchilar (pay turi bilan), brokerlar, dispatcherlar, oylik to'lovlar.

Menyu shu 6 ta. Boshqa hech narsa.

## 4. Qurish tartibi

| Bosqich | Ish | Natija |
|---|---|---|
| 1 | Backend: truck shabloni, driver pay turi, settlement ga truck va davr, `settlement_lines`, "generate week" servisi, carry-in | `POST /weeks/{period}/generate` bitta truck yoki hammasi uchun statement yasaydi; testlar Excel dagi 328, 780, 301 bloklarini aynan takrorlaydi |
| 2 | Frontend: Hafta doskasi + Statement ekrani | Egaga Excel o'rniga ishlatish mumkin bo'lgan minimal tizim |
| 3 | Yuklar va Xarajatlar ekranlarini soddalashtirish, Comdata import, POD | Kiritish oqimi bir marta |
| 4 | Dispatcher haqi, oylik to'lovlar, Sozlamalar | Office va Dues sheetlari yopiladi |
| 5 | Eski modullarni menyudan olib tashlash, migratsiya, 2025 Excel ni import qilish skripti | Excel to'liq almashadi |

Har bosqich alohida ishga tushiriladi va tekshiriladi. Birinchi bosqich Excel dagi uchta real blok bilan test qilinadi: 328 (per mile, 3.5%), 780 (30%, 3.5%), 301 (o'zi haydaydi, 12%, carry-in).

## 5. Qaror kutayotgan savollar

- Per mile: Excel da bitta stavka × jami mil. Loaded / empty ajratmaymiz. Tasdiqlaysizmi?
- Carry-in: manfiy net **har doim** keyingi haftaga o'tadimi, yoki egasi qaror qiladimi? (Excel da 784 o'tkazgan, 328 o'tkazmagan.)
- Occupational health kabi haydovchi tomonidagi chegirmalar: haydovchida doimiy ro'yxat bo'lsinmi?
- Eastern Green ikkinchi kompaniya sifatida shu tizimga kiradimi, yoki hozircha yo'q?

## 6. Holat (2026-09-17)

| Bosqich | Holat | Qayerda |
|---|---|---|
| 1 Backend: truck shabloni, driver pay, haftalik statement, carry-in | Tayyor, Excel bloklari testda aynan takrorlanadi | `backend/app/services/weekly_statement.py`, `backend/app/api/v1/endpoints/weeks.py`, migratsiya 019 |
| 2 Hafta doskasi va Statement ekrani | Tayyor | `frontend/src/pages/WeekBoardPage.tsx`, `StatementPage.tsx` |
| 3 Tez yuk qo'shish, Comdata import, POD | Tayyor | `QuickLoadModal.tsx`, `backend/app/services/comdata_import.py` |
| 4 Dispatcher haqi, oylik to'lovlar, Sozlamalar | Tayyor | `DispatchersPage.tsx`, `BillsPage.tsx`, `SettingsPage.tsx`, migratsiya 020 |
| 5 Menyu, Excel import | Tayyor. Eski modullar "More" ostida | `backend/scripts/import_statements_excel.py`, migratsiya 021 |

Qabul qilingan qarorlar:
- Per mile = bitta stavka × (odometer end − start). Loaded/empty ajratilmaydi.
- Manfiy net avtomatik keyingi haftaga o'tadi; statementda o'chirish mumkin; truckda umuman o'chirish mumkin.
- Haydovchi tomonidagi chegirmalar (occupational health) haydovchida doimiy ro'yxat.
- Yuk qaysi haftaga tushishi: `loads.statement_week` (shanba) bo'lsa o'sha, bo'lmasa pickup sanasi haftasi.
- Excel import har blokning chegirmalarini aynan qo'lda qator sifatida yozadi va statementni "paid" qilib qulflaydi; shablon faqat importdan keyingi haftalarga amal qiladi.

Ishga tushirish:
```bash
cd backend && alembic upgrade head
python scripts/import_statements_excel.py "/path/STATEMENTS 2025.xlsx"            # dry run
python scripts/import_statements_excel.py "/path/STATEMENTS 2025.xlsx" --apply    # yozadi
```

## 7. Ko'p kompaniyali mahsulot va qolgan ikki fayl (2026-09-17, kechqurun)

- `companies` + `company_id` (migratsiya 022), avtomatik ajratish `backend/app/core/tenant.py`, ro'yxatdan o'tish `/api/v1/auth/register`, Settings → Company (nom, hafta boshlanish kuni).
- Yuklarda loaded / deadhead mil, board va statementda mil va RPM.
- Xarajat importi bitta tugma: Comdata, Pilot fuel, EZPass/Bestpass toll, format sarlavhadan aniqlanadi (`backend/app/services/expense_imports.py`).
- Eastern Green gross board importi: `backend/scripts/import_gross_board_excel.py --company N --vehicles "Fleet Command Center.xlsx"`. Ularning haftasi yakshanbadan boshlanadi (`week_start_day=6`).
- Texnik xizmat (migratsiya 023): odometer jurnali, servislar, intervallar, muddat holati. Statementdagi odometer end jurnalga o'zi yoziladi. Ekran: Maintenance.
- Tekshiruv: 68 backend test, frontend build, brauzer. Eastern Green scratch import: 551 yuk, 10 truck, 84 fuel, 209 toll, haftalik gross Excel bilan mos.
- Dashboard (`/dashboard`, `GET /api/v1/dashboard`): shu hafta gross / chegirmalar / haydovchi to'lovlari / net / yuklar / RPM, o'tgan hafta bilan foiz farqi; to'lash kerak bo'lganlar (ready statementlar, dispatcherlar, oylik to'lovlar, servis); 8 haftalik gross va net grafigi; shu haftadagi trucklar. Bosh sahifa endi shu. Eski dashboard o'chirildi.

## 8. UI tozalash (2026-09-19)

- Sidebar oq, guruhlangan (Pay / Fleet / System), 12px yozuv, lucide ikonkalar, foydalanuvchi menyusi va "Collapse" pastda. Desktopda yuqori bar yo'q.
- Umumiy qismlar `frontend/src/components/ui/`: `PageShell` (sahifa ramkasi), `Drawer` + `DrawerTabs` (o'ng panel), `Field` / `Section` / `Grid` (formalar), `UnitDocuments` (truck va trailer hujjatlari).
- Drivers, Trucks, Trailers, Brokers, My company shu qolipda qayta yozildi: bitta jadval, qatorga bosilsa o'ng panel, panelda Details / (Pay yoki Statement rules) / Documents. Truck-haydovchi biriktirish faqat Trucks sahifasida; Drivers sahifasi uni trucklardan o'qiydi.
- Loads sahifasi: bitta `LoadForm` yaratish va tahrirlash uchun, panel faqat ko'rish. Yuk to'langan hafta, settlement yoki invoice orqali qulflanadi, "Delivered" holati qulflamaydi.
- Dashboard davr tanlaydi: This week, Last week, Last 4 / 13 weeks, This month, Last month, This year, Custom (ikkita sana). Server ikki uchni to'liq statement haftalariga yaxlitlaydi (`GET /api/v1/dashboard?from=&to=`). Hamma raqam, "gross qayerga ketdi" doirasi, brokerlar va trucklar shu davr bo'yicha; "Needs your attention" esa har doim hozirgi holat. Trend grafigida hover bilan haftaning to'liq rasmi, KPI kartalarida 8 haftalik sparkline.

## 9. Ekotizim 1-bosqich: roller, taklif, security (2026-09-26)

- Roller: `admin` (egasi), `accountant`, `dispatcher`, `driver`. `users.driver_id`, `users.phone` (migratsiya 024). Haydovchi akkaunti `drivers` yozuviga bog'lanadi.
- Taklif: Settings → Team → Invite. Link 7 kun, bir marta ishlaydi (`/invite/:token`). Qabul qilgan odam parol qo'yadi va kiradi. Haydovchi `/driver` ga tushadi, ofisga kira olmaydi (backend 403, frontend redirect).
- Security: `/api/*` tokensiz 401 (login, register, invite preview/accept, health ochiq). Token: ofis 7 kun, haydovchi 30 kun. Kompaniyasiz akkaunt kira olmaydi. Login urinishlari: 8 ta/daqiqa, keyin 429. Deploy vaqtida standart parolli userlar yaratish olib tashlandi, login sahifasidagi demo tugmalar ham.
- Eslatma: production dagi eski `admin@karvan.com` kabi kompaniyasiz akkauntlar endi kira olmaydi. Egasi `/register` orqali kompaniya ochadi va jamoani taklif qiladi.

## 10. Ekotizim 2-bosqich: chat va hujjatlar (2026-09-26)

- Jadvallar (migratsiya 025): `conversations` (company / truck / load), `conversation_members` (joined_at / left_at tarixi, last_read), `messages` (client_id bilan offline qayta yuborish xavfsiz, client_created_at va created_at ikkalasi), `attachments` (rasm/fayl, taken_at, received_at, lat/lng, sha256, stamp matni).
- A'zolik o'zi sinxronlanadi: ofis hamma guruhda, truck guruhida hozirgi haydovchi. Haydovchi almashsa eskisi "left" bo'ladi, xabarlari qoladi. Birinchi to'ldirishda "joined" yozilmaydi.
- Rasmga muhr: `app/services/photo_stamp.py` pastiga qora tasma: "Karvan · sana vaqt · kim" va "Truck · Load · turi · GPS". Rasm JPEG ga aylanadi, 2000px gacha.
- Fayl saqlash: `app/services/storage.py`. `STORAGE_BACKEND=local` (dev) yoki `supabase` (prod: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_BUCKET`). Render diski deploy da o'chadi, prod da Supabase Storage bucket ochib env qo'yish kerak. Fayllar `/api/v1/files/{id}` orqali token bilan olinadi.
- Chatdagi rasm yukka POD sifatida biriktiriladi (`POST /chat/attachments/{id}/to-load`), statementda POD belgisi chiqadi, merged PDF ga kiradi.
- Ofis UI: `/chat` sahifasi (ro'yxat, thread, fayl yuborish, a'zolar tarixi, "Save as POD"), sidebar da o'qilmaganlar soni. Har 5 soniyada yangilanadi; WebSocket keyin.
- Haydovchi API: `/api/v1/chat/*` va `/api/v1/files/*` driver roliga ochiq. Driver app 3-bosqichda.

## 11. Ekotizim 3-bosqich: driver app (2026-09-26)

- Backend `/api/v1/driver/*` (faqat driver roli): `me` (truck, hozirgi yuk, keyingilar, shu hafta), `loads`, `loads/{id}/status` (New → Dispatched → En Route → Picked-up → Delivered, Delivered uchun POD shart), `loads/{id}/photos` (POD/BOL/lumper/scale: muhrlanadi, yukka biriktiriladi, truck chatiga tushadi), `inspections` (bir nechta rasm, pre_trip/post_trip/damage/breakdown), `expenses` (chek + summa → xarajat jurnali, truckka), `odometer`, `statement` (oxirgi 4 hafta, haydovchi qatorlari bilan).
- Hamma yozuvda `client_id`: qayta yuborilsa ikkilanmaydi.
- Frontend `frontend/src/driver/`: PWA (`public/manifest.webmanifest`, `public/sw.js`, ikonkalar), `/driver` ostida 4 tab: Today, Loads, Chat, My week. Kamera to'g'ridan-to'g'ri ochiladi, rasm telefonda kichraytiriladi, GPS fonda o'qiladi.
- Offline: `driver/outbox.ts` IndexedDB navbati. Har amal avval navbatga yoziladi, keyin tartib bilan yuboriladi; signal yo'q bo'lsa kutadi, qaytganda o'zi ketadi; server rad etsa (4xx) tashlab yuboradi va aytadi. Yuqorida "No signal / Sending N items" tasmasi. Ekranlar oxirgi ma'lumotni localStorage da saqlaydi, signalsiz ham ochiladi.
- Tekshirildi: brauzerda telefon o'lchamida to'liq oqim (accept → on my way → loaded → POD → delivered), ofis chatida iz, yukda POD belgisi, haydovchi haftasi.

## 12. Ekotizim 4-bosqich: dispatcher workspace (2026-09-26)

- `GET /api/v1/dispatch/board`: har truck uchun holat (free / no_driver / Dispatched / En Route / Picked-up), hozirgi yuk va keyingi to'xtash, navbatdagi yuklar, chat id, oxirgi faollik, oxirgi GPS (haydovchi rasmidan). Truck biriktirilmagan ochiq yuklar ro'yxati va hisoblar.
- `GET /api/v1/dispatch/my-week`: dispatcher faqat o'z qatorini ko'radi (gross, komissiya, to'langan-to'lanmagan).
- Dispatcher roli: yuklar ro'yxatida faqat o'z yuklari, yaratgan yuki avtomatik uniki. Pul va sozlama yo'llari 403 (`DISPATCHER_DENY` main.py da): weeks, bills, dashboard, expenses, maintenance, company, rules, invitations, legacy modullar.
- Frontend: `/dispatch` sahifasi (truck kartalari, filtr, "Load" tugmasi truckka yuk ochadi, "Needs a truck" ro'yxatidan truckka biriktirish, Chat tugmasi o'sha truck thread'iga). Dispatcher menyusi: Dispatch, Loads, Chat, Fleet (Drivers, Trucks, Trailers, Brokers), My pay. Ofis yo'llariga kirsa `/dispatch` ga qaytadi. Eski `DispatchBoardPage` o'chirildi.

## 13. Ekotizim 5-bosqich: truck holati va vaqtincha haydovchi (2026-09-26)

- `trucks.status` (active / in_shop / out_of_service), `status_note`, `status_since`; `driver_assignments` (driver, truck, start_date, end_date, reason) — migratsiya 027.
- `app/services/fleet.py`: `effective_driver(truck, on)` (sanali biriktirish doimiy haydovchidan ustun), `effective_truck(driver, on)`, `idle_drivers` (trucki yo'q yoki trucki ishlamayapti), `set_truck_status` (truck chatiga system xabar), `assign` (bitta haydovchi ikki truckda bo'lmaydi: eski ochiq biriktirish yopiladi), `end_assignment`, `truck_history`.
- Ulanishlar: statement haydovchisi = yuklar haydovchisi, bo'lmasa o'sha haftaning effective haydovchisi; truck chat guruhida effective haydovchi; driver app "mening truckim" = effective truck (vaqtincha bo'lsa belgilanadi, truck ishlamasa qizil ogohlantirish); haydovchi "Breakdown" yuborsa truck avtomatik `in_shop`.
- API `/api/v1/fleet/*`: `PUT trucks/{id}/status`, `GET idle-drivers`, `POST assignments`, `POST assignments/{id}/end`, `GET trucks/{id}/history`. Dispatch doskasida `idle_drivers` va `counts.down`.
- UI: Dispatch doskasida "Drivers without a truck" paneli → "Put on a truck" (bo'sh truck, muddat, sabab); truck kartasida In shop / Out of service va TEMP belgisi. Trucks sahifasida "Status & drivers" tabi: holat + izoh, vaqtincha biriktirishlar tarixi, "End today".
