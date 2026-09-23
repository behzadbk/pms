# مشخصات فنی سیستم جامع مدیریت ساختمان (PMS)

نسخه ۱.۰ — سند طراحی معماری، مدل داده، پشته فناوری، سناریوهای کاربری و API

---

## فهرست
1. نقش‌ها و ماتریس دسترسی
2. مدل داده (Entities & Schema)
3. پشته فناوری پیشنهادی (Tech Stack)
4. سناریوهای کاربری (User Journeys)
5. طراحی API (RESTful Endpoints)
6. نکات معماری و امنیتی

---

## ۱. نقش‌ها و ماتریس دسترسی

| ماژول | Admin | Resident/Owner | Guard/Concierge | Staff/Technical |
|---|---|---|---|---|
| مدیریت شارژ و فرمول محاسبه | CRUD کامل | مشاهده صورتحساب خود | - | مشاهده گزارش (اگر حسابدار) |
| پرداخت آنلاین | مشاهده همه | پرداخت واحد خود | - | ثبت پرداخت نقدی (اگر حسابدار) |
| صندوق و بیلان مالی | CRUD کامل | مشاهده خلاصه | - | ثبت فاکتور (اگر حسابدار) |
| اعلانات / رأی‌گیری | ایجاد و مدیریت | مشاهده و شرکت در رأی | مشاهده اعلانات اضطراری | مشاهده |
| تیکتینگ | مشاهده و پاسخ همه تیکت‌ها | ثبت تیکت، پیگیری | ثبت تیکت‌های حراستی | دریافت و بستن تیکت‌های فنی |
| رزرو مشاعات | مدیریت تقویم، تعریف قوانین | رزرو، مشاهده تقویم | مشاهده رزروهای روز (برای کنترل ورود) | - |
| CMMS (نگهداری) | تعریف دارایی، برنامه‌ریزی سرویس | مشاهده وضعیت (اگر بر او اثر دارد) | - | دریافت، انجام، بستن کار |
| مدیریت مهمان (QR) | مشاهده گزارش کلی | صدور کد مهمان | اسکن/تایید کد، ثبت ورود-خروج | - |
| مرسولات پستی | مشاهده گزارش | مشاهده و تایید دریافت | ثبت مرسوله، اعلان به ساکن | - |
| تردد خودرو و پارکینگ | مدیریت جای پارک‌ها | ثبت خودروهای خود | ثبت ورود/خروج خودرو | - |
| پروفایل واحدها | CRUD کامل همه واحدها | ویرایش پروفایل خود، خودروها، مخاطبین اضطراری | مشاهده محدود (نام ساکن، واحد) | مشاهده محدود |
| قراردادهای اجاره | CRUD و هشدار سررسید | مشاهده قرارداد خود | - | - |

اصل طراحی: هر Endpoint باید بر اساس `role` + `unit_id` (در صورت ساکن) فیلتر و Authorize شود؛ یک ساکن هرگز نباید بتواند داده واحد دیگری را بخواند حتی با تغییر ID در URL (IDOR prevention).

---

## ۲. مدل داده (Data Schema)

نکته: نوع دیتابیس پیشنهادی PostgreSQL است؛ نام‌ها snake_case و ستون‌های `id` از نوع UUID فرض شده‌اند. فیلدهای `created_at` / `updated_at` در همه جداول تلویحاً وجود دارند و برای اختصار تکرار نشده‌اند.

### ۲.۱ هسته سازمانی

```
buildings
  id, name, address, city, total_units, total_floors, tax_id, settings_json

blocks (اختیاری، برای مجتمع چند بلوکی)
  id, building_id -> buildings, name

units
  id, building_id -> buildings, block_id -> blocks (nullable),
  unit_number, floor, area_sqm, bedroom_count,
  ownership_status enum(owner_occupied, rented, vacant),
  parking_slot_ids[], storage_slot_id

users
  id, full_name, mobile, email, national_id (nullable),
  password_hash, role enum(admin, resident, guard, staff),
  is_active, last_login_at

user_unit_links   -- یک کاربر می‌تواند به چند واحد مرتبط باشد (مالک چند واحدی)
  id, user_id -> users, unit_id -> units,
  relation enum(owner, tenant, family_member),
  is_primary_contact

emergency_contacts
  id, unit_id -> units, full_name, phone, relation

vehicles
  id, unit_id -> units, plate_number, plate_reader_text,
  brand, color, parking_slot_id

lease_contracts
  id, unit_id -> units, tenant_user_id -> users,
  start_date, end_date, rent_amount, deposit_amount,
  status enum(active, expiring_soon, expired, terminated),
  document_file_url
```

### ۲.۲ ماژول مالی

```
charge_formulas
  id, building_id -> buildings, name,
  calc_type enum(fixed, per_area, per_person, hybrid, custom_formula),
  base_amount, amount_per_sqm, amount_per_person,
  formula_expression (nullable, برای حالت custom — مثلاً "base + area*2000 + occupants*50000"),
  effective_from, is_active

monthly_charges
  id, unit_id -> units, period (YYYY-MM), formula_id -> charge_formulas,
  base_amount, extra_amount, discount_amount, total_amount,
  due_date, status enum(pending, paid, partially_paid, overdue),
  late_fee_amount, generated_at

previous_debts
  id, unit_id -> units, description, amount, registered_at, is_settled

invoices          -- فاکتورهای مشاعات (هزینه‌های ساختمان، نه شارژ)
  id, building_id -> buildings, vendor_name, category
    enum(elevator, utilities, cleaning, security, repairs, insurance, other),
  amount, invoice_date, due_date, attachment_url,
  paid_from_fund boolean

transactions      -- دفترداری صندوق (کلیه گردش‌های مالی، واریز و برداشت)
  id, building_id -> buildings, type enum(income, expense),
  category, amount, related_charge_id (nullable) -> monthly_charges,
  related_invoice_id (nullable) -> invoices,
  payment_method enum(online_gateway, wallet, cash, bank_transfer),
  reference_code, description, recorded_by -> users

wallets
  id, unit_id -> units, balance

wallet_transactions
  id, wallet_id -> wallets, amount, type enum(credit, debit),
  reason, related_transaction_id -> transactions

payments
  id, monthly_charge_id -> monthly_charges (nullable),
  wallet_id -> wallets (nullable),
  amount, gateway enum(zarinpal, idpay, wallet, cash, ...),
  gateway_ref_id, status enum(initiated, success, failed, refunded),
  paid_at

receipts
  id, payment_id -> payments, receipt_number, pdf_url, issued_at
```

### ۲.۳ ارتباطات و تصمیم‌گیری

```
announcements
  id, building_id -> buildings, title, body, is_emergency,
  target_role (nullable, پیش‌فرض همه), published_by -> users, published_at

notifications      -- Push/In-app به ازای هر کاربر
  id, user_id -> users, title, body, type
    enum(charge_due, guest_arrived, parcel_received, poll_open,
         maintenance_update, announcement, contract_expiring),
  is_read, related_entity_type, related_entity_id, created_at

polls
  id, building_id -> buildings, title, description,
  weight_type enum(one_vote_per_unit, weighted_by_area, weighted_by_ownership_percent),
  starts_at, ends_at, is_closed

poll_options
  id, poll_id -> polls, label

poll_votes
  id, poll_id -> polls, option_id -> poll_options, unit_id -> units,
  voter_user_id -> users, weight, voted_at
  -- unique(poll_id, unit_id) برای جلوگیری از رأی تکراری واحد

tickets
  id, building_id -> buildings, unit_id -> units (nullable),
  created_by -> users, category enum(complaint, suggestion, report, request),
  subject, description, status enum(open, in_progress, resolved, closed),
  priority enum(low, normal, high, urgent), assigned_to -> users

ticket_comments
  id, ticket_id -> tickets, author_id -> users, body, attachment_url
```

### ۲.۴ مشاعات و نگهداری (CMMS)

```
amenities
  id, building_id -> buildings, name, type enum(pool, hall, roof_garden, gym, other),
  capacity, reservation_rules_json (حداکثر مدت، فاصله رزرو، ساعات مجاز),
  requires_approval boolean, hourly_fee

amenity_reservations
  id, amenity_id -> amenities, unit_id -> units, requested_by -> users,
  start_at, end_at, status enum(pending, confirmed, cancelled, rejected),
  fee_charged boolean

assets              -- دارایی‌های قابل نگهداری (آسانسور، موتورخانه، پکیج، پمپ...)
  id, building_id -> buildings, name, category, install_date,
  location, warranty_until

maintenance_schedules   -- سرویس‌های دوره‌ای
  id, asset_id -> assets, title, interval_days,
  last_service_date, next_due_date, responsible_vendor, checklist_json

work_orders          -- فاکتورها/خرابی‌های ثبت‌شده در CMMS
  id, building_id -> buildings, asset_id -> assets (nullable),
  source enum(scheduled, ticket, manual), related_ticket_id -> tickets (nullable),
  title, description, status enum(open, assigned, in_progress, done, cancelled),
  assigned_to -> users, cost_amount, completed_at
```

### ۲.۵ نگهبانی و امنیت

```
guest_passes
  id, unit_id -> units, issued_by -> users, guest_name, guest_phone (nullable),
  code (QR/OTP), valid_from, valid_until, max_uses, uses_count,
  status enum(active, used, expired, revoked)

guest_visit_logs
  id, guest_pass_id -> guest_passes (nullable, برای مهمان بدون کد از قبل),
  unit_id -> units, guest_name, checked_in_by -> users,
  entry_at, exit_at, notes

parcels
  id, unit_id -> units, courier_company, tracking_code (nullable),
  received_by -> users, received_at, photo_url,
  status enum(pending_pickup, picked_up), picked_up_at, notified_at

vehicle_traffic_logs
  id, building_id -> buildings, plate_number, unit_id -> units (nullable),
  direction enum(in, out), recorded_by -> users, recorded_at, parking_slot_id
```

### دیاگرام رابطه‌ای خلاصه (متنی)

```
buildings 1─* units 1─* user_unit_links *─1 users
units 1─* monthly_charges 1─* payments
units 1─* guest_passes 1─* guest_visit_logs
units 1─* vehicles
units 1─* amenity_reservations *─1 amenities
buildings 1─* assets 1─* maintenance_schedules
buildings 1─* work_orders
buildings 1─* tickets 1─* ticket_comments
buildings 1─* polls 1─* poll_options 1─* poll_votes
```

---

## ۳. پشته فناوری پیشنهادی (Tech Stack)

با توجه به این‌که پروژه شامل وب (پنل مدیریت/حسابداری)، اپ موبایل (ساکن و نگهبان) و نیاز به کار آفلاین محدود (مثلاً اسکن QR توسط نگهبان در نقاط با اینترنت ضعیف) است:

### بک‌اند
- **زبان/فریم‌ورک:** Node.js + **NestJS** (TypeScript) — ساختار ماژولار NestJS دقیقاً با ماژول‌های این پروژه (Financial, Booking, Security...) هم‌راستاست و برای تیم‌های کوچک نگهداری آسان‌تری نسبت به میکروسرویس کامل دارد.
  - جایگزین سبک‌تر: Express.js + TypeScript در صورت تمایل به سادگی بیشتر.
- **ORM:** Prisma (type-safe، migration ساده، خوب برای PostgreSQL)
- **دیتابیس اصلی:** PostgreSQL (تراکنش‌های مالی نیاز به ACID دارند)
- **کش/صف:** Redis (کش، صف اعلان‌ها با BullMQ، rate-limiting)
- **احراز هویت:** JWT (access + refresh token) + OTP پیامکی برای ورود ساکنین
- **پرداخت:** درگاه‌های ایرانی مانند زرین‌پال / آیدی‌پی (webhook-based confirmation، idempotency key الزامی)
- **فایل/عکس:** ذخیره‌سازی S3-compatible (مثل Arvan Cloud Object Storage یا Liara) برای عکس مرسولات، فاکتورها، مدارک قرارداد
- **Realtime:** WebSocket (Socket.io) یا Server-Sent Events برای اعلان لحظه‌ای ورود مهمان/مرسوله به نگهبانی و ساکن

### فرانت‌اند وب (پنل Admin و پنل ساکن دسکتاپ)
- **React 18 + TypeScript + Vite**
- **TailwindCSS** + کتابخانه کامپوننت shadcn/ui (سبک، قابل شخصی‌سازی، سازگار با RTL)
- **React Query (TanStack Query)** برای مدیریت state سرور و کش
- **React Router** برای مسیریابی
- **Zod** برای اعتبارسنجی فرم‌ها (به اشتراک با بک‌اند از طریق schema مشترک در صورت مونوریپو)
- پشتیبانی کامل RTL و فونت وزیرمتن (هم‌راستا با کارهای قبلی)

### موبایل (ساکن، نگهبان)
با توجه به تجربه قبلی در ساخت PWA آفلاین (پروژه دستیار دامپزشکی)، دو مسیر معقول است:
1. **PWA پیشرفته** (سریع‌تر برای توسعه، یک کدبیس با وب) — برای نگهبان که نیاز به اسکن QR و کارکرد نیمه‌آفلاین دارد، PWA با Service Worker و صف همگام‌سازی (background sync) کافی است.
2. **React Native (Expo)** — اگر نیاز به push notification قدرتمند، دسترسی کامل به دوربین/بلوتوث یا انتشار در استورها باشد؛ کد مشترک منطق با React وب (هوک‌ها و کتابخانه‌های مشترک).

پیشنهاد عملی: شروع با **PWA مشترک با ریسپانسیو کامل** برای MVP (هزینه/زمان کمتر)، و مهاجرت پنل نگهبان/ساکن به React Native در فاز بعد اگر نیاز به قابلیت‌های Native (مثل push بهتر) احساس شد.

### زیرساخت
- Docker + docker-compose برای توسعه محلی (API + Postgres + Redis در یک دستور بالا می‌آیند)
- CI ساده با GitHub Actions (lint, test, build)
- میزبانی: هر VPS ایرانی/خارجی با پشتیبانی Docker، یا Liara/ArvanCloud برای سادگی دیپلوی

### خلاصه در یک نگاه

| لایه | فناوری |
|---|---|
| فرانت وب | React + TS + Vite + Tailwind + shadcn/ui |
| موبایل | PWA مشترک → (فاز ۲) React Native/Expo |
| بک‌اند | NestJS (Node.js + TypeScript) |
| ORM | Prisma |
| دیتابیس | PostgreSQL |
| کش/صف | Redis + BullMQ |
| Realtime | Socket.io |
| فایل | S3-compatible storage |
| پرداخت | زرین‌پال / آیدی‌پی webhook |

---

## ۴. سناریوهای کاربری (User Journeys)

### ۴.۱ جریان پرداخت شارژ توسط ساکن

```
1. ساکن وارد اپ/پنل می‌شود (JWT معتبر یا OTP)
2. Dashboard → درخواست GET /units/{unitId}/charges?status=pending,overdue
3. سیستم لیست شارژهای معوق + جریمه دیرکرد محاسبه‌شده را نمایش می‌دهد
4. ساکن یک یا چند شارژ را انتخاب و "پرداخت" را می‌زند
5. Frontend → POST /payments/initiate { charge_ids: [...], amount }
6. Backend:
   a. جمع مبلغ را نهایی می‌کند (idempotency key تولید می‌شود)
   b. رکورد payments با status=initiated ایجاد می‌کند
   c. با درگاه (زرین‌پال) تماس می‌گیرد و authority/redirect_url می‌گیرد
7. ساکن به درگاه پرداخت هدایت می‌شود و پرداخت را انجام می‌دهد
8. درگاه کاربر را به callback_url برمی‌گرداند + webhook async به بک‌اند می‌زند
9. Backend (webhook handler):
   a. تراکنش را نزد درگاه verify می‌کند (جلوگیری از جعل)
   b. payments.status = success
   c. monthly_charges مرتبط را status=paid می‌کند
   d. رکورد transactions (income) در دفترداری صندوق ثبت می‌شود
   e. رسید PDF تولید و در receipts ذخیره می‌شود
   f. Notification به ساکن ("پرداخت شما موفق بود") + به مدیر ارسال می‌شود
10. ساکن در صفحه نتیجه، وضعیت موفق + دکمه دانلود رسید را می‌بیند

حالت خطا: اگر verify ناموفق بود → payments.status=failed، شارژ همچنان pending می‌ماند،
پیام شفاف نمایش داده می‌شود ("پرداخت ناموفق بود، مبلغی کسر نشده")
```

### ۴.۲ جریان ثبت ورود مهمان با کد QR

```
مرحله صدور (توسط ساکن):
1. ساکن در اپ → "دعوت مهمان" → نام مهمان + بازه اعتبار (مثلاً امروز، یا هفته جاری) را وارد می‌کند
2. Frontend → POST /units/{unitId}/guest-passes { guest_name, valid_from, valid_until, max_uses }
3. Backend یک کد یکتا (OTP ۶ رقمی یا توکن QR) تولید و رکورد guest_passes با status=active می‌سازد
4. کد به صورت QR در اپ نمایش داده می‌شود و/یا با پیامک برای مهمان ارسال می‌شود

مرحله ورود (توسط نگهبان):
5. مهمان در لابی، QR را نشان می‌دهد یا کد را اعلام می‌کند
6. نگهبان در پنل خود → اسکن QR یا وارد کردن کد دستی
   GET /guest-passes/verify?code=XXXXXX
7. Backend بررسی می‌کند: کد معتبر است؟ منقضی نشده؟ uses_count < max_uses؟
   - اگر PWA آفلاین باشد و اینترنت لحظه قطع باشد، کد و بازه اعتبار (نه اعتبارسنجی سرور)
     به صورت لوکال cache شده و در صف sync قرار می‌گیرد؛ به محض اتصال مجدد verify نهایی می‌شود.
8. در صورت معتبر بودن:
   a. POST /guest-passes/{id}/check-in ثبت می‌شود → guest_visit_logs رکورد جدید
   b. uses_count++ ؛ اگر uses_count == max_uses → status=used
   c. Notification فوری (WebSocket/Push) به ساکن: "مهمان شما [نام] وارد شد"
9. اگر کد نامعتبر/منقضی باشد، نگهبان پیام خطای واضح می‌بیند و می‌تواند
   با تماس یا تیکت داخلی از ساکن تاییدیه دستی بگیرد (مسیر جایگزین دستی)

مرحله خروج (اختیاری، برای گزارش‌گیری):
10. نگهبان هنگام خروج مهمان → POST /guest-visit-logs/{id}/check-out → exit_at ثبت می‌شود
```

---

## ۵. طراحی API (RESTful Endpoints)

### ۵.۱ ماژول مالی

```
GET    /buildings/{buildingId}/charge-formulas
POST   /buildings/{buildingId}/charge-formulas
PATCH  /charge-formulas/{id}
DELETE /charge-formulas/{id}

POST   /buildings/{buildingId}/charges/generate-monthly
        body: { period: "2026-09", formula_id }
        -- بر اساس فرمول فعال، برای همه واحدها monthly_charges می‌سازد (Job/Queue)

GET    /units/{unitId}/charges?status=pending&from=2026-01&to=2026-08
GET    /charges/{id}
PATCH  /charges/{id}            -- اصلاح دستی توسط ادمین (تخفیف، اصلاح مبلغ)

POST   /payments/initiate       body: { charge_ids[], amount, gateway }
POST   /payments/webhook/{gateway}     -- callback از درگاه (بدون auth کاربر، امضا اعتبارسنجی می‌شود)
GET    /payments/{id}
GET    /units/{unitId}/receipts
GET    /receipts/{id}/pdf

GET    /units/{unitId}/wallet
POST   /units/{unitId}/wallet/top-up      body: { amount, gateway }
GET    /units/{unitId}/wallet/transactions

POST   /buildings/{buildingId}/invoices        -- ثبت فاکتور هزینه مشاعات
GET    /buildings/{buildingId}/invoices?category=elevator&from=&to=

GET    /buildings/{buildingId}/transactions?type=income&from=&to=
GET    /buildings/{buildingId}/reports/balance-sheet?period=2026-08
GET    /buildings/{buildingId}/reports/debts-outstanding
```

### ۵.۲ ماژول رزرو مشاعات

```
GET    /buildings/{buildingId}/amenities
POST   /buildings/{buildingId}/amenities                -- تعریف مشاع جدید (Admin)
PATCH  /amenities/{id}

GET    /amenities/{id}/availability?date=2026-09-05     -- بازه‌های آزاد/رزرو شده روز
POST   /amenities/{id}/reservations
        body: { unit_id, start_at, end_at }
        -- سرور تداخل زمانی و قوانین (حداکثر مدت، فاصله لازم) را چک می‌کند
GET    /units/{unitId}/reservations?status=confirmed
PATCH  /reservations/{id}/cancel
POST   /reservations/{id}/approve      -- در صورت requires_approval=true (Admin)
POST   /reservations/{id}/reject
```

### ۵.۳ سایر ماژول‌های کلیدی (خلاصه)

```
# تیکتینگ
POST   /tickets                         GET /tickets?status=open&assigned_to=me
PATCH  /tickets/{id}                    POST /tickets/{id}/comments

# CMMS
GET    /buildings/{buildingId}/assets
GET    /buildings/{buildingId}/maintenance-schedules?due_before=2026-09-15
POST   /work-orders                     PATCH /work-orders/{id}/status

# مهمان و نگهبانی
POST   /units/{unitId}/guest-passes
GET    /guest-passes/verify?code=
POST   /guest-passes/{id}/check-in
POST   /guest-visit-logs/{id}/check-out
POST   /units/{unitId}/parcels
POST   /parcels/{id}/pickup-confirm
POST   /vehicle-traffic-logs

# رأی‌گیری و اعلانات
POST   /buildings/{buildingId}/polls    POST /polls/{id}/vote
POST   /buildings/{buildingId}/announcements
GET    /users/me/notifications
```

### قواعد کلی طراحی API
- Auth: `Authorization: Bearer <JWT>` روی همه route ها به جز `/auth/*` و `payments/webhook/*`
- تمام لیست‌ها: pagination با `?page=&limit=` و پاسخ به شکل `{ data, meta: { total, page, limit } }`
- خطاها: فرمت یکسان `{ error: { code, message, details? } }` با HTTP status صحیح (400/401/403/404/409/422)
- عملیات مالی حساس (initiate payment، generate-monthly، webhook) باید `Idempotency-Key` header بپذیرند
- نسخه‌بندی API: پیشوند `/api/v1/...`

---

## ۶. نکات معماری و امنیتی

- **جداسازی چندمستأجری (Multi-tenant):** اگر قرار است این محصول برای چند ساختمان/برج مختلف (چند مشتری) فروخته شود، همه جداول باید `building_id` داشته باشند (که در schema بالا رعایت شده) و در سطح query middleware اعمال isolation انجام شود.
- **Audit Log:** برای اقدامات مالی و تغییر داده حساس (تغییر فرمول شارژ، حذف بدهی، صدور دستی رسید) یک جدول `audit_logs (actor_id, action, entity, entity_id, diff_json, created_at)` توصیه می‌شود.
- **جریمه دیرکرد:** به‌صورت job روزانه (cron) محاسبه و روی `monthly_charges.late_fee_amount` به‌روزرسانی شود، نه در لحظه نمایش (برای گزارش‌گیری قابل‌اعتماد).
- **امنیت کد مهمان:** کدها باید کوتاه‌مدت و single/limited-use باشند؛ از الگوریتم OTP قابل‌حدس‌نزدن (نه شماره ترتیبی) استفاده شود؛ همه ورود/خروج‌ها لاگ می‌شوند.
- **دسترسی نگهبان به داده:** نگهبان نباید به اطلاعات مالی یا شخصی حساس ساکنین دسترسی داشته باشد؛ فقط نام، واحد و کدهای معتبر مهمان/مرسوله.
- **Rate limiting** روی endpointهای verify کد مهمان و login برای جلوگیری از brute-force.

---

## ۷. بخش‌های متمایزکننده (Deep-Dive)

سه قابلیت زیر به‌عنوان مزیت رقابتی محصول در نظر گرفته شده‌اند و نسبت به ماژول‌های پایه (بخش‌های ۱ تا ۶) با جزئیات بیشتری طراحی شده‌اند: (۷.۱) قوانین رزرو هوشمند مشاعات، (۷.۲) تقویم بصری زنده، (۷.۳) تسهیل کار نگهبانی و شفافیت مالی.

### ۷.۱ سیستم قوانین رزرو هوشمند مشاعات

#### مدل داده

```
amenities   (تکمیل نسخه بخش ۲.۴)
  id, building_id -> buildings, name, type,
  capacity, image_url, requires_approval, hourly_fee,
  is_active

booking_rules            -- هر مشاع می‌تواند چند قانون فعال هم‌زمان داشته باشد
  id, amenity_id -> amenities,
  max_bookings_per_unit_per_period int,       -- مثلاً ۲
  period_type enum(day, week, month),         -- بازه‌ی همان سقف بالا
  min_advance_hours int,                      -- حداقل فاصله تا لحظه رزرو (مثلاً ۱۲ ساعت)
  max_advance_days int,                       -- حداکثر فاصله تا لحظه رزرو (مثلاً ۳ روز)
  min_slot_minutes int, max_slot_minutes int, -- حداقل/حداکثر طول هر رزرو
  cancellation_window_hours int,              -- تا چند ساعت قبل، کنسلی بدون جریمه است
  deposit_amount int (nullable),              -- بیعانه به تومان؛ null یعنی بدون بیعانه
  deposit_refund_policy enum(full_if_cancelled_in_window, partial_50, non_refundable),
  is_active, effective_from

amenity_sessions          -- سانس‌بندی (مردانه/زنانه/خانوادگی/آزاد)
  id, amenity_id -> amenities,
  day_of_week int(0-6), start_time, end_time,
  session_type enum(general, male_only, female_only, family),
  max_occupancy int

reservations   (تکمیل نسخه بخش ۲.۴ amenity_reservations)
  id, amenity_id -> amenities, session_id -> amenity_sessions (nullable),
  unit_id -> units, requested_by -> users,
  start_at, end_at, party_size int,
  status enum(pending_approval, confirmed, cancelled_by_user, cancelled_by_admin, rejected, completed, no_show),
  deposit_status enum(none, held, captured, refunded, forfeited),
  deposit_payment_id -> payments (nullable),
  cancelled_at, cancel_reason
```

نکته طراحی: `booking_rules` از `amenities` جدا نگه داشته شده تا مدیر بتواند بدون تغییر رکورد اصلی مشاع، نسخه‌های مختلف قانون را در طول زمان تعریف/غیرفعال کند (تاریخچه قوانین حفظ می‌شود).

#### منطق تجاری — الگوریتم اعتبارسنجی رزرو (اجرا هم در فرانت برای UX آنی، هم الزاماً در بک‌اند به‌عنوان منبع حقیقت)

```
function validateBooking(unitId, amenityId, startAt, endAt, partySize):

  rule = getActiveRule(amenityId)
  now = currentTime()

  # ۱. بازه پیش‌سفارش
  hoursUntilStart = (startAt - now) in hours
  if hoursUntilStart < rule.min_advance_hours:
      reject("این مشاع را حداقل {rule.min_advance_hours} ساعت قبل باید رزرو کنید")
  if hoursUntilStart > rule.max_advance_days * 24:
      reject("رزرو این مشاع حداکثر از {rule.max_advance_days} روز قبل امکان‌پذیر است")

  # ۲. طول بازه
  durationMinutes = (endAt - startAt) in minutes
  if durationMinutes < rule.min_slot_minutes or durationMinutes > rule.max_slot_minutes:
      reject("طول زمان رزرو خارج از محدوده مجاز است")

  # ۳. سقف تعداد رزرو واحد در بازه
  periodStart, periodEnd = boundsOf(rule.period_type, startAt)   # مثلاً اول تا آخر ماه جاری
  existingCount = countReservations(unitId, amenityId,
                    status in [pending_approval, confirmed],
                    between periodStart and periodEnd)
  if existingCount >= rule.max_bookings_per_unit_per_period:
      reject("سقف رزرو شما برای این مشاع در این بازه تکمیل شده است")

  # ۴. سانس و ظرفیت
  session = findSession(amenityId, dayOfWeek(startAt), startAt.time)
  if session and partySize > session.max_occupancy_remaining:
      reject("ظرفیت این سانس تکمیل است")

  # ۵. تداخل زمانی (Double booking guard) — چک نهایی و اتمیک در سطح دیتابیس
  overlap = existsReservation(amenityId,
              status in [pending_approval, confirmed],
              timeRangeOverlaps(startAt, endAt))
  if overlap:
      reject("این بازه پیش‌تر رزرو شده است")
      # در بک‌اند: این چک باید داخل یک transaction با
      # UNIQUE constraint یا Exclusion Constraint روی (amenity_id, tsrange)
      # در PostgreSQL انجام شود تا race condition دو رزرو هم‌زمان رخ ندهد.

  # ۶. بیعانه
  if rule.deposit_amount > 0:
      status = "pending_approval" if amenity.requires_approval else "pending_payment"
  else:
      status = "pending_approval" if amenity.requires_approval else "confirmed"

  return { ok: true, status, requiresDeposit: rule.deposit_amount > 0 }
```

منطق کنسل‌سازی بیعانه:
```
function cancelReservation(reservationId, actor):
  res = getReservation(reservationId)
  hoursBeforeStart = (res.start_at - now()) in hours

  if res.deposit_status == "held" or res.deposit_status == "captured":
      if hoursBeforeStart >= rule.cancellation_window_hours:
          refundDeposit(res)               # طبق deposit_refund_policy
      else:
          if rule.deposit_refund_policy == "partial_50": refundDeposit(res, 0.5)
          elif rule.deposit_refund_policy == "full_if_cancelled_in_window": forfeitDeposit(res)
          else: forfeitDeposit(res)

  res.status = "cancelled_by_user" if actor.role == "resident" else "cancelled_by_admin"
```

### ۷.۲ تقویم بصری زنده مشاعات

#### رویکرد Real-Time
- هر تغییر وضعیت یک اسلات (رزرو جدید، تایید، کنسلی، تغییر به حالت تعمیر) یک رویداد از طریق Socket.io روی room اختصاصی `amenity:{amenityId}:{date}` broadcast می‌شود.
- کلاینت (React) به این room subscribe می‌کند و state تقویم را به‌صورت incremental به‌روز می‌کند؛ نیازی به polling نیست.
- برای جلوگیری قطعی از Double Booking، تکیه‌گاه اصلی همان Exclusion Constraint سطح دیتابیس است (بخش ۷.۱)؛ WebSocket صرفاً برای تجربه کاربری آنی (نه صحت نهایی داده) استفاده می‌شود — اگر دو نفر هم‌زمان یک اسلات سبز را انتخاب کنند، نفر دوم هنگام submit با خطای "قبلاً رزرو شد" مواجه و UI بلافاصله sync می‌شود.

#### وضعیت‌های رنگی اسلات
```
available          -> سبز    (خالی، قابل رزرو)
pending_approval    -> زرد    (رزرو شده ولی منتظر تایید مدیر)
confirmed           -> قرمز/نارنجی  (قطعی — اشغال)
maintenance         -> خاکستری (خارج از سرویس)
past                -> خاکستری کم‌رنگ (گذشته، غیرقابل انتخاب)
```

#### API تقویم
```
GET  /amenities/{id}/calendar?view=day|week|month&date=2026-09-05
     -> { amenity, rule_summary, slots: [{ start_at, end_at, status, unit_label?, session_type }] }

WS   subscribe: amenity:{amenityId}:{YYYY-MM-DD}
     events: slot.booked, slot.cancelled, slot.status_changed
```

### ۷.۳ تسهیل کار نگهبانی و شفافیت مالی

#### مدل داده — یکپارچه‌سازی لاگ‌های نگهبانی

```
guard_logs      -- جدول یکپارچه برای گزارش‌گیری سریع در پنل نگهبانی (علاوه بر جداول تخصصی بخش ۲.۵)
  id, building_id -> buildings, type enum(guest_entry, parcel, vehicle_in, vehicle_out),
  actor_guard_id -> users, unit_id -> units (nullable),
  ref_table, ref_id,      -- اشاره به رکورد اصلی (guest_visit_logs / parcels / vehicle_traffic_logs)
  summary_text,           -- برای نمایش سریع در فید بدون join ("مهمان آرش محمدی - واحد ۱۲")
  created_at

-- شفافیت مالی: تفکیک مالک/مستأجر روی صورتحساب
monthly_charges  (افزوده به بخش ۲.۲)
  + payer_type enum(owner, tenant)     -- بر اساس lease_contracts فعال واحد تعیین می‌شود
  + owner_share_amount, tenant_share_amount   -- برای هزینه‌هایی که طبق قرارداد تفکیک می‌شوند (مثلاً شارژ ثابت با مالک، مصرفی با مستأجر)

expense_categories
  id, building_id -> buildings, name, color_hex     -- برای نمودار دایره‌ای شفافیت مالی
invoices  (بخش ۲.۲) + category_id -> expense_categories
```

#### منطق تجاری — پنل فوق‌ساده نگهبانی
```
function guardQuickAction(input):
  # ورودی یکی از این سه حالت است: کد QR اسکن‌شده، شماره پلاک تایپ‌شده، یا بارکد مرسوله
  case input.type:
    "guest_code":
        pass = findActiveGuestPass(input.code)
        if not pass or pass.status != "active" or now() > pass.valid_until:
            return { ok: false, message: "کد نامعتبر یا منقضی" }
        checkIn(pass); notify(pass.unit_id, "مهمان شما وارد شد")
        return { ok: true, guest: pass.guest_name, unit: pass.unit_id }

    "plate_number":
        vehicle = findVehicleByPlate(input.plate)   # جست‌وجوی فازی روی چند رقم آخر هم پشتیبانی شود
        logTraffic(vehicle?.unit_id, input.plate, direction=input.direction)
        return { ok: true, unit: vehicle?.unit_id ?? "خودروی ناشناس — ثبت به‌عنوان مهمان" }

    "parcel_barcode":
        parcel = createParcel(input.unit_id, input.courier, photo=input.photo)
        notify(parcel.unit_id, "مرسوله جدید شما در نگهبانی است")
        return { ok: true, parcelId: parcel.id }

  # اصل طراحی UX: هر سه حالت باید در حداکثر یک تاچ اضافه (تایید) به نتیجه برسند؛
  # فرم‌های چندمرحله‌ای برای نگهبان ممنوع است.
```

#### منطق تجاری — شفافیت مالی (تفکیک مالک/مستأجر)
```
function splitChargeAmount(unitId, chargeAmount, chargeCategory):
  contract = getActiveLeaseContract(unitId)
  if not contract:
      return { owner_share: chargeAmount, tenant_share: 0 }   # واحد بدون مستأجر -> کامل با مالک

  splitRule = building.settings.charge_split_rules[chargeCategory]
  # مثال قرارداد رایج ایران: شارژ ثابت ساختمان با مالک، هزینه‌های مصرفی (آب/برق مشاعات) با مستأجر
  if splitRule == "tenant_pays_all": return { owner_share: 0, tenant_share: chargeAmount }
  if splitRule == "owner_pays_all":  return { owner_share: chargeAmount, tenant_share: 0 }
  if splitRule == "percent":         return { owner_share: chargeAmount * splitRule.owner_pct,
                                                tenant_share: chargeAmount * (1 - splitRule.owner_pct) }
```

#### API نگهبانی و شفافیت مالی
```
POST /guard/quick-action           body: { type: guest_code|plate_number|parcel_barcode, ... }
GET  /guard/feed?since=timestamp   -- فید زنده آخرین اقدامات (برای نمایش در پنل نگهبانی)

GET  /units/{unitId}/finance/breakdown?period=2026-06     -- نمودار دایره‌ای هزینه‌های ساختمان
GET  /units/{unitId}/finance/charge-split?period=2026-06  -- سهم مالک/مستأجر
GET  /units/{unitId}/finance/invoices                     -- لیست فاکتور/رسید قابل دانلود
GET  /invoices/{id}/pdf
```
