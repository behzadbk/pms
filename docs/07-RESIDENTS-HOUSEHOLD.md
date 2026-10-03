# ۰۷ — ساکنین، خانوار، حالت والدین و رزرو مشاعات

مرجع طراحی: `Hamino - New Modules v2.dc.html` و `design_handoff_hamino_v5/RESIDENTS.md`.
همه‌ی این بخش‌ها **روی دیتابیس واقعی** کار می‌کنند (نه استور کلاینت).

## نقشه‌ی کد

| لایه | فایل |
|---|---|
| مایگریشن ساکنین/خانوار/حالت والدین | `backend/identity-service/prisma/migrations/005_residents_household.sql` |
| مایگریشن رزرو مشاعات نسخه‌ی ۲ | `backend/facility-service/prisma/migrations/002_amenity_reservations_v2.sql` |
| صندوق اعلان داخل برنامه | `backend/notification-service/prisma/migrations/002_inbox.sql` |
| داده‌ی نمونه | `db/seeds/004_residents_demo.sql` |
| API ساکنین (identity-svc) | `backend/identity-service/src/residents/` |
| API رزرو (facility-svc) | `backend/facility-service/src/reservations/bookings.controller.ts`, `slots.ts` |
| فرانت | `frontend/src/pages/admin/residents/`, `pages/superadmin/Residents.tsx`, `pages/resident/household/`, `pages/resident/Book.tsx`, `pages/child/ChildApp.tsx`, `pages/public/Join.tsx`, `components/hm.tsx`, `context/PermissionsContext.tsx`, `lib/nav.ts` |
| تست‌ها | `tests/e2e_residents.py` (۱۱۸ سناریوی API)، `tests/ui_residents.mjs` (۲۸ سناریوی مرورگر)، jest در هر دو سرویس |

## مدل داده

- «ساختمان» در API همان tenant است (`identity.tenants`)؛ `property.buildings` بلوک‌های داخل آن است.
- `residency.users` حساب شخص است: **یک موبایل = یک حساب** (E.164، UNIQUE). سطح پلتفرم است و `tenant_id` ندارد، چون یک نفر در چند ساختمان عضو می‌شود. حساب ورود (`identity.users`) با `person_id` به آن وصل است.
- `property.units` ستون‌های `parking_count`, `storage_no`, `owner_user_id`, `occupancy` گرفت. occupancy را trigger از روی عضویت‌های زنده نگه می‌دارد.
- `residency.memberships`, `invites`, `parent_controls`, `child_requests`, `child_spend`, `family_login_codes`, `move_outs`, `building_settings` — همه با RLS کامل (`ENABLE` + `FORCE` + `WITH CHECK`).
- `facility.amenities` + `max_hours`, `slot_hours`, `rule_text`؛ `facility.reservations` + `user_id`, `reject_reason`, `decided_by`. وضعیت‌ها یکدست شد: `pending | confirmed | rejected | cancelled`. تداخل با `EXCLUDE` ممنوع است.

### قواعدی که خود دیتابیس تضمین می‌کند
- حداکثر یک سرپرست زنده در هر واحد (UNIQUE INDEX جزئی) و «دقیقاً یک» سرپرست وقتی واحد ساکن دارد (CONSTRAINT TRIGGER با تأخیر تا COMMIT، تا واگذاری در یک تراکنش مجاز باشد).
- پرستار بدون `end_date` ثبت نمی‌شود؛ `owner_absent` ⇔ نوع سکونت مالک غیرساکن.
- نقشه‌ی ماژول‌های حالت والدین فقط کلیدهای مجاز و مقادیر ۰/۱/۲.

## قواعد بک‌اند

| قاعده | پیاده‌سازی |
|---|---|
| تخلیه در تاریخ | امروز/گذشته فوراً؛ آینده در `move_outs` و اجرای خودکار (housekeeping). عضویت‌ها ended، نشست‌ها باطل، رزروهای آینده لغو، مالک مطلع، واحد خالی. |
| QR لابی | همیشه `pending_approval`؛ بعد از تأیید مدیر اگر واحد سرپرست دارد `pending_head`. |
| کودک | مالی و مجمع همیشه پنهان. خرید از شارژ واحد تا سقف ماهانه؛ «با تأیید» یا بالای سقف → `child_request` ۳۰ دقیقه‌ای به سرپرست و بزرگسالان. تأیید سفارش بالای سقف، سقف همان ماه را به اندازه‌ی لازم بالا می‌برد (مثل طراحی). |
| پرستار | در `end_date` خودکار ended و نشست باطل. |
| ۱۸ سالگی | اعلان پیشنهاد تبدیل به بزرگسال به سرپرست (یک بار). |
| تماس اضطراری | `POST /me/emergency` برای همه‌ی نقش‌ها، حتی در ساعت سکوت. |
| رزرو | تداخل → 409؛ `needs_approval` → pending و اعلان به `perm:amenity_desk` و `admin`؛ وگرنه confirmed. |
| ممیزی | هر تغییر عضویت، حالت والدین و رزرو داخل همان تراکنش در `audit.event_logs` نوشته می‌شود. |
| نشست | `sessions_valid_after` روی شخص و حساب ورود: خروج از همه‌ی دستگاه‌ها، مسدودی و تخلیه در identity-svc فوراً، در بقیه حداکثر تا انقضای ۱۵ دقیقه‌ای توکن؛ refresh هم رد می‌شود. |

کارهای زمان‌دار (`HousekeepingService`) هر ۵ دقیقه روی همه‌ی ساختمان‌ها و پیش از خواندن‌های مهم اجرا می‌شوند. `RESIDENTS_HOUSEKEEPING=off` خاموشش می‌کند؛ `RESIDENTS_HOUSEKEEPING_THROTTLE_MS` فاصله‌ی اجرای «تنبل» است.

## API

همه زیر `/api/identity` جز رزرو که زیر `/api/facility` است. بدنه‌ها snake_case و تاریخ‌ها ISO میلادی؛ فرانت شمسی نمایش می‌دهد (`lib/jalali.ts`).

- مدیر (فقط ساختمان خودش؛ سوپرادمین با `building_id`):
  `GET /buildings/:id/units?filter=&q=` · `GET /units/:id` · `POST /units/:id/residents` · `PATCH /memberships/:id` (ارتقا به head = واگذاری) · `POST /units/:id/invite` (ارسال دوباره = توکن تازه) · `POST /invites/:id/cancel` · `GET|POST /units/:id/move-out` · `GET /buildings/:id/join-requests` · `POST /join-requests/:id/approve|reject|transfer|remind-head` · `POST /buildings/:id/residents/import` (xlsx/csv) · `GET /buildings/:id/residents/import/template` · `GET /buildings/:id/lobby-qr`
- سوپرادمین: `GET /admin/residents?building_id=&q=` · `GET /admin/users/:id` · `POST /admin/users/:id/logout-all|block|unblock|merge`
- سرپرست: `GET /me/household` · `POST /me/household/members` · `DELETE /me/household/members/:id` · `POST /me/household/members/:id/resend-invite` · `POST /me/household/transfer-head` · `GET|PUT /me/household/members/:id/parent-control` · `POST /me/household/members/:id/login-code` · `POST /me/household/join-requests/:id/approve|reject` · `GET /me/child-requests` · `POST /child-requests/:id/approve|reject`
- کودک و همه: `POST /auth/family-code` · `GET /me/permissions` · `POST|GET /me/child/requests` · `POST /me/exit-unlock` · `POST /me/emergency` · `GET /me/notifications` · `POST /me/notifications/:id/read|read-all`
- عمومی: `GET|POST /join/:token` (QR لابی) · `GET /invites/:token` · `POST /invites/:token/accept`
- رزرو: `GET /amenities/:id/slots?date=` · `POST /reservations` · `GET /reservations?status=` · `GET /me/reservations` · `POST /reservations/:id/approve|reject`

توکن دعوت هرگز در پاسخ API به مدیر برنمی‌گردد (فقط در رویداد `invite.sent` برای پیامک).

## فرانت

- **نوار پایین:** حداکثر ۴ تب + «بیشتر» (`lib/nav.ts` → `MAX_TABS`). بخش‌های پنجم به بعد و «حساب و ظاهر» در `/more`؛ وقتی یکی از آن‌ها باز است «بیشتر» روشن است. لنز با فنر بین تب‌ها می‌لغزد.
  - ساکن: خانه، غذا، تیکت‌ها، اعلانات، بیشتر (رزرو مشاعات، خانواده، …)
  - مدیر: داشبورد، ساکنین، تیکت‌ها، اعلانات، بیشتر (کارکنان، رزروها، …)
  - کودک: خانه، اعلانات
- **شِل از روی `/me/permissions`:** بخش پنهان از تب، کاشی و لینک مستقیم حذف می‌شود (`RequireModule` به خانه برمی‌گرداند). اپ کودک هر ۱۵ ثانیه و با هر بازگشت به اپ نقشه را دوباره می‌خواند.
- **ورود کودک:** صفحه‌ی ورود → «ورود با کد خانواده»، یا اسکن QR که لینک `/family-login?t=…&k=…` است و با دوربین معمولی گوشی هم باز می‌شود. قفل خروج با رمز والد.
- زنگوله‌ی اعلان، صندوق سرور (`notification.inbox`) را هم نشان می‌دهد.
- صف «درخواست‌های رزرو منتظر تأیید» از سرور، بالای صفحه‌ی رزروهای مدیر و میز مسئول مشاعات.

## اصلاح هدر موبایل
`Layout.tsx`: `pt-safe` روی `<header>` و `h-14` روی ردیف داخلی؛ هدر کشویی همین‌طور (`pt-safe` بیرون، `h-16` داخل). `viewport-fit=cover` از قبل در `index.html` بود.

## محدودیت‌های فعلی
- منو و صف آشپزخانه هنوز روی استور کلاینت‌اند؛ سفارش کودک بعد از تأیید روی همان دستگاه والد وارد صف می‌شود و رویداد `child.order_approved` برای اتصال fnb-svc منتشر می‌شود. نشستن مبلغ روی شارژ واحد هم با رویداد است (`child.order_*`) و finance-svc هنوز مصرفش نمی‌کند.
- خودروهای واحد جدول ندارند (فهرست خالی نمایش داده می‌شود).
- ورود ساکن هنوز با رمز است (نام کاربری = موبایل بعد از پذیرش دعوت)؛ OTP پیامکی نیامده است.

## اجرای تست‌ها
```bash
cd db && ./migrate.sh --reset                      # دیتابیس تازه + داده‌ی نمونه
bash tests/run-all-services.sh                     # یا فقط identity (3001) و facility (3003)
DATABASE_URL=postgres://postgres@localhost:5432/pms python3 tests/e2e_residents.py
cd frontend && npx vite &                          # سپس:
BASE=http://localhost:5173 node tests/ui_residents.mjs   # پیش از اجرا دوباره --reset
```

---

## افزودن: ساخت واحد، حذف ساکن و «قوانین و برج» (۱۴۰۵-۰۷)

**ریشه‌ی «ثبت ساکن ممکن نیست»:** ساختمان تازه واحدی نداشت و هیچ API/UIای برای ساخت واحد نبود؛ نمای سوپرادمین فقط‌خواندنی بود.

- **واحدها:** `POST /buildings/:id/units` (تکی)، `POST /buildings/:id/units/bulk` (`floors × units_per_floor`، شماره‌ی طبقه‌ای ۳۰۱…، تکراری‌ها نادیده)، `PATCH/DELETE /units/:id` (حذف فقط بدون سابقه، وگرنه ۴۰۹).
- **حذف ساکن:** `DELETE /memberships/:id` (پایان عضویت + قطع نشست‌ها/دعوت‌ها؛ سرپرستِ دارای عضو دیگر → ۴۰۹).
- **سوپرادمین:** همان صفحه‌های مدیر زیر `/super-admin/residents/:buildingId/…` با دسترسی کامل (`SuperAdminBuildingScope` → `?building_id=` خودکار).
- **قوانین برج** (`/admin/rules`، مهاجرت `006_building_rules.sql`): مهلت بدهکاری (۰–۳۶۵ روز، پیش‌فرض ۳۰) + برای هر بخش (`module:food|guest|amenity`) یا مشاع (`amenity:<id>`) حالت رادیویی «آزاد / بسته برای بدهکار». تابع‌های SQL `residency.unit_is_debtor / unit_restricted` منبع حقیقت‌اند. مالی، تیکت، اعلانات، مرسوله و اضطراری هرگز بسته نمی‌شوند.
- **اِعمال سمت سرور:** رزرو مشاع (facility)، مهمان (guard)، سفارش غذا (fnb)، درخواست کودک؛ کد خطا `debtor_restricted` (۴۰۳). در `/me/permissions` مقدار `locked` + `debtor` + `locked_amenities`.
- **ادغام پنل:** «قوانین رزرو هوشمند» به تب دوم «قوانین و برج» رفت (`/admin/amenity-rules` ریدایرکت می‌شود).
- **تست:** `tests/e2e_tower_rules.py` (۴۶ سناریو).
- **توجه:** ویرایشگر سانس/سقف رزرو (تب دوم) هنوز به store محلی/mock وصل است، نه سرور. همچنین بررسی دسترسی guard-service برای مدل جدید `residency.memberships` اصلاح شد.
