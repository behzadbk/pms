# تاریخچه‌ی تغییرات (Changelog)

## دیباگ و QA کامل (۲۶ شهریور ۱۴۰۵) — جزئیات: docs/04-DEBUG-AND-QA-REPORT.md

- تست سناریویی API روی هر ۸ سرویس در حال اجرا (۵۷ سناریو) و تست انسانی UI در مرورگر واقعی (۱۷ سناریو) اضافه شد (`tests/`).
- امنیتی: جداسازی refresh/access token، امضای HMAC برای webhook پرداخت، حذف کلید JWT پیش‌فرض در production، کنترل نقش و مالکیت واحد در نگهبانی، اعتبارسنجی تعداد و مالکیت سفارش غذا، غیرفعال شدن سوییچر نقش و گارد نقش در فرانت، پاک شدن کش API هنگام خروج.
- عملکردی: رفع نمایش همیشگی صفحه‌ی آفلاین در PWA، رفع 500 در ثبت مرسوله (مایگریشن جدید) و صدور شارژ ماهانه، رفع 404 همیشگی webhook پرداخت، ساخت مدیر اولیه هنگام تعریف ساختمان جدید، رفع کرش با `.env.example` و ناهمخوانی کلید JWT، هدایت درست هر نقش بعد از ورود و لینک مستقیم، تبدیل خطاهای ورودی دیتابیس به 400/409.

## دیتابیس

- ساخت اولیه‌ی اسکیمای PostgreSQL 16 با ۹ migration (bootstrap, identity, property, facility, finance, guard, notification, audit, fnb).
- پیاده‌سازی و تأیید Row-Level Security برای ایزوله‌سازی چندمستأجری (fail-closed).
- افزودن محدودیت EXCLUDE برای جلوگیری از رزرو هم‌پوشان امکانات.
- افزودن تریگر عمومی ممیزی (`audit.log_change`) روی جداول کلیدی.

## بک‌اند

- build و تست واقعی هر ۸ میکروسرویس NestJS (identity, property, facility, finance, guard, notification, fnb, audit).
- رفع باگ ناسازگاری lockfile در ۳ سرویس (notification, audit, fnb) ناشی از پین‌شدن نسخه‌ی prerelease پریزما.
- افزودن تست e2e ایزوله‌سازی تنانت روی PostgreSQL واقعی (۵ سناریو).
- افزودن تست‌های unit برای منطق اعتبارسنجی رزرو (۶ سناریو).
- اعتبارسنجی ساختاری کامل مانیفست‌های Kubernetes (۲۵ فایل YAML).

## فرانت‌اند

- افزودن سه صفحه‌ی جدید: سفارش غذای ساکنین (`FoodOrder`)، نمایشگر آشپزخانه (`KitchenDisplay`)، داشبورد لاگ ادمین (`AuditLog`).
- افزودن لایه‌ی API client کامل (`client.ts`, `identity.ts`, `fnb.ts`, `audit.ts`) شامل بافر لاگ سمت کلاینت و اتصال WebSocket.
- تکمیل توکن‌های رنگ/انیمیشن Liquid Glass و افزودن پریمیتیوهای UI مشترک (`Glass.tsx`).
- تأیید build کامل پروژه (`tsc -b`, `vite build`, تولید service worker PWA).

## لایه‌ی اتصال فرانت‌اند ↔ بک‌اند (۲۰۲۶-۰۹-۱۴)

جزئیات کامل در [README.md](./README.md#لایهی-اتصال-فرانتاند--بکاند-۲۰۲۶-۰۹-۱۴).

- رفع ناسازگاری قرارداد لاگین: فرانت‌اند `{ phone, password }` می‌فرستاد در حالی که `LoginDto` بک‌اند `{ email, password, tenantSubdomain }` می‌خواست.
- افزودن شیء `user` (`id`, `fullName`, `role`, `tenantId`) به پاسخ لاگین — قبلاً فرانت‌اند انتظارش را داشت ولی بک‌اند برنمی‌گرداند.
- پیاده‌سازی `GET /auth/me` و `POST /auth/refresh` در `identity-service` — هر دو از سمت فرانت‌اند صدا زده می‌شدند ولی روی بک‌اند وجود نداشتند.
- افزودن `AuthContext` و صفحه‌ی ورود واقعی (`/login`) به فرانت‌اند، به‌همراه محافظ مسیر `RequireAuth` و بازیابی نشست بعد از رفرش صفحه.
- همگام‌سازی `RoleContext` با نقش کاربر لاگین‌شده (به‌جای مقدار ثابت `'admin'`) و افزودن دکمه‌ی خروج به سایدبار.
- افزودن ذخیره‌سازی refresh token در کلاینت (`getRefreshToken`/`setRefreshToken`).
- افزودن پروکسی dev سرور Vite برای `/api/<service>` به پورت محلی هر سرویس — بازتولید همان نگاشت Ingress، بدون نیاز به Nginx محلی.
- قابل‌تنظیم کردن CORS با متغیر محیطی `CORS_ORIGIN` در هر ۸ سرویس (رفتار پیش‌فرض بدون مقداردهی تغییر نکرده).
- افزودن `seed-dev.sql` (یک tenant + یک کاربر برای هر نقش) و `frontend/.env.example` برای تست واقعی جریان ورود.
- توجه: این تغییرات فقط با esbuild از نظر سینتکس چک شدند؛ `tsc -b`/`vite build`/`nest build` واقعی هنوز اجرا نشده.

## پنل سوپر ادمین (۲۰۲۶-۰۹-۱۴)

جزئیات کامل در [docs/03-SUPERADMIN.md](./docs/03-SUPERADMIN.md) و [README.md](./README.md#پنل-سوپر-ادمین--ورود-ساختمانها-و-سطحبندی-سرویس-۲۰۲۶-۰۹-۱۴).

### افزوده شد

- **جدول `identity.platform_admins`** — کاربران سطح پلتفرم که به هیچ tenant‌ای تعلق ندارند (بدون `tenant_id` و بدون RLS مجتمع). دو کاربر اولیه‌ی dev: `behzad` و `amir` با رمز `1234`.
- **migration `002_platform_admins_and_tiers.sql`** — علاوه بر جدول بالا، ستون‌های سطح سرویس (`tier`، `unit_count`، `floor_count`، `address`، `manager_name`، `manager_phone`) و تسویه‌ی اشتراک (`monthly_fee`، `outstanding_amount`، `billing_status`، `last_payment_at`، `next_due_at`) روی `identity.tenants`، به‌همراه CHECK constraint و ایندکس.
- **`seed-platform-admins.sql`** — دو کاربر سوپرادمین + سه ساختمان نمونه با سطوح و وضعیت‌های مالی متفاوت.
- **`POST /auth/platform-login`** — ورود سوپرادمین با `{ username, password }` (بدون `tenantSubdomain`). توکن صادرشده `tenant_id: null` و `role: 'super_admin'` دارد.
- **ماژول `platform` در identity-service** — `GET /platform/tiers`، `GET|POST /platform/buildings`، `GET|PATCH /platform/buildings/:id` و `PATCH /platform/buildings/:id/settle`؛ همگی پشت `@Roles('super_admin')`.
- **ماتریس سطوح سرویس** — ساده (۸ ماژول) / اقتصادی (۱۲) / حرفه‌ای (۱۹)، با قیمت پایه‌ی ۲۵٬۰۰۰ / ۴۰٬۰۰۰ / ۶۵٬۰۰۰ تومان به ازای هر واحد در ماه. تعریف در دو فایل هم‌نسخه: `backend/identity-service/src/platform/tiers.ts` و `frontend/src/lib/tiers.ts`.
- **صفحه‌ی ورود سوپرادمین** (`/super-admin/login`) — جدا از صفحه‌ی ورود ساکنین/مدیر ساختمان.
- **صفحه‌ی ساختمان‌ها** (`/super-admin/buildings`) — لیست پروژه‌ها با نام، سطح، تعداد واحد/طبقه، مبلغ اشتراک، وضعیت مالی (تسویه‌شده / سررسید نزدیک / معوق + مانده بدهی + سررسید بعدی) و وضعیت مجتمع؛ به‌همراه کارت‌های خلاصه (تعداد ساختمان، مجموع واحدها، MRR، کل مانده بدهی)، فیلتر سطح/وضعیت مالی، جستجو و اکشن «ثبت تسویه».
- **فرم تعریف برج/ساختمان جدید** — با انتخاب سطح، فهرست ماژول‌های همان سطح نمایش داده می‌شود و مبلغ اشتراک پیشنهادی (قیمت پایه × تعداد واحد) خودکار محاسبه و قابل override می‌شود.
- **گارد `RequireSuperAdmin`** — علاوه بر لاگین، نقش کاربر را هم چک می‌کند؛ کاربر لاگین‌نشده روی `/super-admin/*` به `/super-admin/login` می‌رود نه `/login`.
- **`docs/03-SUPERADMIN.md`** — سند کامل بخش سوپرادمین.

### تغییر کرد

- `GET /auth/me` و `POST /auth/refresh` حالا هم کاربر مجتمع و هم سوپرادمین (`tenant_id: null`) را پشتیبانی می‌کنند.
- `AuthContext` متد `loginPlatform` گرفت؛ `AuthUser.tenantId` به `string | null` تغییر کرد.
- صفحه‌ی «پلن‌های اشتراک» به «سطوح سرویس» بازنویسی شد — سه کارت سطح + جدول مقایسه‌ی کامل ۱۹ قابلیت.
- خروج از حساب و ریدایرکت صفحه‌ی اصلی حالا نقش‌آگاه‌اند (سوپرادمین به پنل خودش برمی‌گردد).
- `prisma/schema.prisma` با مدل `PlatformAdmin` و فیلدهای جدید `Tenant` به‌روز شد.
- لاگین مجتمع: شرط `status !== 'active'` به رد صریح `suspended`/`cancelled` تغییر کرد تا مجتمع‌های در دوره‌ی آزمایشی (`trial`) هم بتوانند وارد شوند.

### رفع شد

دو خطای کامپایل از قبل موجود که جلسه‌ی قبل (که فقط esbuild زده بود) نگرفته بود:

- `frontend/src/App.tsx` — `type ReactElement` اشتباهاً از `react-router-dom` import شده بود (`TS2305`)؛ به `react` منتقل شد.
- `backend/identity-service/src/auth/auth.service.ts` — اینترفیس `AuthResult` export نشده بود و با `declaration: true` خطای `TS4053` می‌داد.

### وضعیت تأیید

- فرانت‌اند: `npm install` + `tsc -b --force` (صفر خطا) + `vite build` کامل با تولید service worker (۴۴ ورودی precache) + `oxlint`.
- بک‌اند: `npm install` + `nest build` (صفر خطا).
- end-to-end روی PostgreSQL 16 واقعی: migration و seed، ورود هر دو کاربر، رد رمز اشتباه (۴۰۱)، `/auth/me`، لیست و خلاصه‌ی ساختمان‌ها، ساخت ساختمان جدید با محاسبه‌ی خودکار اشتراک (اقتصادی × ۳۰ واحد = ۱٬۲۰۰٬۰۰۰)، رد subdomain تکراری (۴۰۹) و سطح نامعتبر (۴۰۰)، ۴۰۳ برای توکن مدیر ساختمان، ۴۰۱ بدون توکن، و ثبت تسویه.

### باقی‌مانده

- اعمال feature flagهای سطح سرویس داخل پنل خود مجتمع‌ها (مخفی کردن منوی نگهبانی برای یک ساختمان «ساده») — ماتریس آماده است، فقط باید `tier` در `/auth/me` برگردد و در `nav.ts` فیلتر شود.
- داشبورد پلتفرم (`/super-admin`) و صفحه‌ی تراکنش‌ها هنوز از `mockData.ts` می‌خوانند.
- مدیریت کاربران سوپرادمین از داخل پنل (افزودن/حذف) — فعلاً فقط از طریق SQL.

## ساخت واقعی دیتابیس از روی ریپو (۲۰۲۶-۰۹-۱۴)

جزئیات کامل در [docs/database.md](./docs/database.md) و [README.md](./README.md#ساخت-واقعی-دیتابیس-از-روی-ریپو-۲۰۲۶-۰۹-۱۴).

### رفع شد

- **DDL جداول `identity` اصلاً وجود نداشت.** `001_enable_rls.sql` فرض کرده بود `prisma migrate deploy` جدول‌های `identity.tenants` / `users` / `refresh_tokens` را ساخته، ولی سرویس‌ها از `pg` خام استفاده می‌کنند و Prisma هرگز اجرا نمی‌شود؛ در نتیجه ساخت دیتابیس از روی ریپو روی دیتابیس خالی با `relation "identity.users" does not exist` می‌شکست. فایل جدید `000_init_identity.sql` اضافه شد.
- **پالیسی‌های RLS فقط `USING` داشتند، بدون `WITH CHECK`** — خواندن ایزوله بود ولی یک سرویس می‌توانست ردیفی با `tenant_id` تنانت دیگر بنویسد. همه‌ی پالیسی‌ها حالا هر دو را دارند.
- **پارتیشن audit هاردکد بود** (`event_logs_2026_09`) — از ماه بعد هر INSERT لاگ با `no partition of relation found` رد می‌شد. جایگزین: تابع `audit.ensure_month_partition(date)` + ساخت خودکار ماه جاری و ۳ ماه بعد.
- **باگ connection بازیافتی** (از سشن ۰۲-backend): بعد از COMMIT مقدار `app.current_tenant_id` به `''` برمی‌گشت و `''::uuid` خطای ۵۰۰ می‌داد. حالا همه‌ی پالیسی‌ها از `platform.current_tenant_id()` استفاده می‌کنند که با `NULLIF` رشته‌ی خالی را به `NULL` تبدیل می‌کند → صفر ردیف، نه خطا.

### افزوده شد

- **پوشه‌ی `db/`** — نقطه‌ی واحد ساخت دیتابیس:
  - `migrate.sh` — اجرای ۱۲ مایگریشن به ترتیب، با ردیابی نام و checksum در `platform.schema_migrations`؛ فلگ‌های `--seed` / `--status` / `--reset`.
  - `migrations/000_bootstrap.sql` — اکستنشن‌ها، نقش‌های `app_user`/`platform_admin`، اسکیمای `platform`، توابع `current_tenant_id()`/`current_user_id()`، جدول ردیابی.
  - `migrations/900_grants_and_indexes.sql` — GRANTها + `ALTER DEFAULT PRIVILEGES` روی هر ۸ اسکیما، ایندکس `tenant_id` روی همه‌ی جداول تنانت‌دار، و یک بررسی نهایی که اگر جدول `tenant_id`داری بدون RLS کامل بماند **مایگریشن را می‌شکند**.
  - `seeds/003_demo_operational_data.sql` — ۳ واحد، ۳ امکانات مشترک + قوانین رزرو، ۲ شارژ ماهانه + ۱ پرداخت، مجوز مهمان و بسته، منوی کافه، یک رکورد لاگ (همگی idempotent).
  - `test-rls.py` — ۱۷ تست واقعی ایزوله‌سازی و constraint با نقش `app_user`.
  - `docker-compose.yml` + `Dockerfile` + `.env.example`.
  - `README.md` مخصوص پوشه‌ی دیتابیس.
- **`backend/identity-service/prisma/migrations/000_init_identity.sql`** — جداول `identity.tenants` / `users` / `refresh_tokens` با CHECK constraintها، unique `(tenant_id, email)` و ایندکس‌ها.
- **`infra/k8s/base/migration-job.db.yaml`** — یک Job واحد مایگریشن به‌جای ۸ Job جداگانه‌ی هر سرویس.

### تغییر کرد

- بخش RLS هر ۸ مایگریشن سرویس بازنویسی شد: یک بلوک `DO` که هر جدولِ دارای ستون `tenant_id` را در آن اسکیما sweep می‌کند و `ENABLE` + `FORCE ROW LEVEL SECURITY` و پالیسی را با `DROP POLICY IF EXISTS` اعمال می‌کند — یعنی idempotent است و جدول‌های جدید آینده هم خودکار پوشش می‌گیرند.
- `docs/database.md` و `README.md` (ساختار مخزن `pms-db/` → `db/`، جدول وضعیت، بخش اجرای محلی) به‌روزرسانی شدند.

### وضعیت تأیید

روی یک PostgreSQL 16 واقعی:

- دیتابیس خالی → هر ۱۲ مایگریشن بدون خطا؛ اجرای دوباره no-op؛ `--reset` و ساخت کامل از صفر.
- `app_user` بدون tenant context → صفر ردیف، بدون خطا (fail-closed).
- tenant A فقط داده‌ی خودش را می‌بیند؛ tenant B صفر ردیف — در پنج اسکیما (property، finance، guard، fnb، facility).
- جعل `tenant_id` در INSERT مسدود شد (`new row violates row-level security policy`).
- رزرو هم‌پوشان روی همان امکانات با EXCLUDE رد شد.
- `app_user` نتوانست DDL بزند و نتوانست RLS را خاموش کند.
- seedها idempotent و داده‌ی لاگین درست؛ پارتیشن‌های ماهانه‌ی audit ساخته شدند.
- **نتیجه: ۱۷ تست قبول / ۰ رد.**

### باقی‌مانده

- مسیر داکر (`docker compose up`) هنوز اجرا نشده (داکر در سندباکس نبود) — یک بار روی ماشین خودتان.
- Cron ماهانه برای `audit.ensure_month_partition` در Production.
- سرویس‌ها هنوز `app.current_user_id` را ست نمی‌کنند (تابعش در دیتابیس آماده است).
- جدول‌های اطلاعیه/نظرسنجی/تیکت هنوز در دیتابیس نیستند؛ کد فعلی notification-service فقط `delivery_log` را می‌نویسد.
- رمزهای `app_user_change_me` / `platform_admin_change_me` فقط local‌اند و باید با `APP_USER_PASSWORD` / `PLATFORM_ADMIN_PASSWORD` عوض شوند.
