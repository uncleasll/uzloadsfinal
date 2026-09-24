# Karvan ekotizimi — g'oya (2026-09-24)

Maqsad: trucking kompaniya uchun bitta platforma. Ofis, dispatcher va haydovchi bitta tizimda, Telegram, Excel va qog'oz yo'q.

## 1. Uchta yuz, bitta backend

| Kim | Qayerda | Nima qiladi |
|---|---|---|
| Egasi / buxgalter | Web (hozirgi Karvan) | Haftalik statement, yuklar, xarajatlar, dispatcher haqi, oylik to'lovlar, texnik xizmat, dashboard, chat |
| Dispatcher | Web, o'z roli bilan | Yuk kiritish, haydovchiga berish, rate con yuklash, haydovchi bilan chat, bo'sh trucklarni ko'rish |
| Haydovchi | Telefon (PWA, keyin native) | Bugungi yuk, holat, POD va cheklar, truck rasmi, odometer, o'z statementi, chat |

Roller: `owner`, `accountant`, `dispatcher`, `driver`. Har bir haydovchi va dispatcher o'z akkaunti bilan kiradi, `drivers` / `dispatchers` yozuviga bog'lanadi.

## 2. Chat (Telegram o'rnida)

- Har truck uchun doimiy guruh: ofis + dispatcher + shu truckdagi haydovchi(lar).
- Har yuk uchun thread: rate con, manzil, POD, xabarlar shu yerda.
- Umumiy kompaniya kanali (e'lonlar).
- Matn, rasm, ovozli xabar, fayl.
- **Tarix o'chmaydi.** Haydovchi ketsa guruhdan chiqariladi, lekin uning xabarlari qoladi. Guruh a'zoligi tarixi saqlanadi: kim qachon qo'shildi, qachon chiqdi (`chat_memberships` jadvali, `joined_at` / `left_at`). Yangi haydovchi kelganda o'sha guruhga qo'shiladi va truck tarixini ko'radi.
- O'qildi belgisi, bildirishnoma (app ichida, keyin push va SMS).

## 3. Rasm va hujjatlar

- Har rasm **vaqt va joy muhri** bilan: EXIF emas, ilova o'zi yozadi (server vaqti, GPS, kim, qaysi truck/yuk). Rasm ustiga ham bosiladi, ma'lumot bazasida ham turadi.
- **Truck tekshiruvi (inspection):** haydovchi smenani boshlaganda va yuk tugaganda truckni old, orqa, ikki yon, trailer, ichki tomondan suratga oladi. Shablon: 6–8 rasm, bir marta bosish. Tarixda truck bo'yicha ko'rinadi, zarar da'volarida dalil.
- Yuk hujjatlari: POD, BOL, lumper cheki, scale ticket, fuel cheki. Haydovchi suratga oladi, tizim **PDF ga yig'adi** (bir yukning hammasi bitta PDF, broker uchun invoice paketi).
- Cheklar avtomatik xarajatga aylanadi (summa, sana, truck; keyin OCR bilan o'qish).

## 4. Offline

- Haydovchi ilovasi internet bo'lmaganda ham ishlaydi: rasm, holat, xabar telefonda navbatga tushadi (IndexedDB), internet chiqqanda o'zi yuboradi.
- Har elementda `client_id` bo'ladi, ikki marta yuborilmaydi.
- Vaqt muhri offline paytdagi telefon vaqti + serverga yetgan vaqt, ikkalasi saqlanadi.

## 5. Buzilgan truck, bo'sh haydovchi

- Truck holati: `active`, `in_shop`, `out_of_service`. Buzilganda haydovchi ilovadan "truck buzildi" deb belgilaydi, rasm va izoh bilan; ofisga bildirishnoma.
- Bo'sh haydovchilar ro'yxati: qaysi haydovchi truck kutyapti, qachondan beri.
- Haydovchini boshqa truckka **vaqtincha** o'tkazish: `driver_assignments` (driver, truck, from, to). Haftalik statement shu davrga qarab hisoblaydi (haydovchi pay o'sha truckka tushadi).
- Truck sahifasida tarix: kim qachon haydagan.

## 6. Samsara (ELD) integratsiyasi

- API orqali: truck joylashuvi (jonli xarita), odometer (statementga o'zi tushadi, qo'lda kiritish yo'q), HOS (haydovchi soatlari), yoqilg'i, DTC xatolar.
- Haydovchi ilovasida: o'z HOS qoldig'i, bugungi mil.
- Ofis: xaritada hamma trucklar, yuk ETA.
- Kompaniya Settings da Samsara API token kiritadi; truck VIN bo'yicha bog'lanadi.

## 7. Yana nimalar mantiqiy

- Broker invoice va factoring: PDF paket, to'langanini kuzatish, aging.
- Hujjat muddati eslatmalari: CDL, medical, registration, insurance, annual inspection.
- IFTA chorak hisoboti (Samsara mil + fuel importlari).
- Haydovchi onboarding: ilovadan hujjat yuklash, ofis tasdiqlaydi.
- Buxgalterga eksport (CSV / QuickBooks).

## 8. Qurish tartibi

1. **Roller, kirish, security.** User rollari, ofisdan taklif (link/SMS), haydovchi → `drivers`, dispatcher → `dispatchers` bog'lash, token muddati, 401, rate limit. Bu poydevor.
2. **Chat va hujjat modeli.** `conversations`, `messages`, `attachments`, `chat_memberships`; rasm saqlash (S3 turidagi storage), vaqt/joy muhri, PDF yig'ish.
3. **Driver app (PWA).** Bugungi yuk, holat, POD/chek, truck inspection, offline navbat, chat, o'z statementi.
4. **Dispatcher workspace.** Yuklar doskasi, haydovchiga berish, bo'sh trucklar, chat.
5. **Truck holati va vaqtincha haydovchi.** `in_shop`, `driver_assignments`, statement shu bo'yicha.
6. **Samsara.** Joylashuv, odometer, HOS.
7. Invoice/factoring, eslatmalar, IFTA, eksport. Eski "More" modullarini o'chirish.

Har bosqich alohida deploy qilinadi. UI qoidasi o'zgarmaydi: sodda, bitta qarashda tushunarli, overkill yo'q.
