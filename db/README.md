# db — ساخت و مدیریت دیتابیس PMS

این پوشه تنها نقطه‌ی ساخت دیتابیس است. مایگریشن‌های هر سرویس سر جای خودشان
(`backend/<svc>/prisma/migrations/`) می‌مانند؛ `migrate.sh` فقط آن‌ها را به
ترتیب درست و به‌صورت ردیابی‌شده اجرا می‌کند، به‌علاوه‌ی دو فایل مشترک این پوشه.

## اجرای سریع (بدون داکر)

```bash
createdb pms
cd db
DATABASE_URL="postgres://postgres@localhost:5432/pms" ./migrate.sh --seed
```

## اجرا با داکر

```bash
cd db
cp .env.example .env
docker compose up -d postgres
docker compose run --rm migrate --seed
```

## دستورها

| دستور | کار |
|---|---|
| `./migrate.sh` | مایگریشن‌های اجرانشده را اجرا می‌کند |
| `./migrate.sh --seed` | مایگریشن + داده‌ی نمونه‌ی محیط توسعه |
| `./migrate.sh --status` | گزارش وضعیت هر مایگریشن |
| `./migrate.sh --reset` | حذف کامل اسکیماها و ساخت دوباره (فقط local) |
| `python3 test-rls.py` | تست واقعی ایزوله‌سازی tenant و constraintها |

اجرای دوباره بی‌خطر است: هر فایل با نام و checksum در `platform.schema_migrations`
ثبت می‌شود. اگر فایلی بعد از اجرا تغییر کند، اسکریپت هشدار می‌دهد و آن را دوباره
اجرا **نمی‌کند** (برای تغییر، یک مایگریشن جدید اضافه کنید).

> `migrate.sh` باید با نقش superuser یا owner دیتابیس اجرا شود، نه `app_user` —
> چون RLS روی جداول `FORCE` شده است.

## ترتیب مایگریشن‌ها

| # | فایل | کار |
|---|---|---|
| 1 | `db/migrations/000_bootstrap.sql` | اکستنشن‌ها، نقش‌های `app_user`/`platform_admin`، اسکیمای `platform`، تابع `platform.current_tenant_id()`، جدول ردیابی |
| 2 | `backend/identity-service/.../000_init_identity.sql` | جداول `identity.tenants` / `users` / `refresh_tokens` |
| 3 | `.../001_enable_rls.sql` (identity) | RLS و پالیسی‌های identity |
| 4 | `.../002_platform_admins_and_tiers.sql` | `platform_admins` + ستون‌های سطح سرویس و تسویه |
| 5–11 | مایگریشن‌های property / facility / finance / guard / notification / audit / fnb | جداول و RLS هر دامنه |
| 12 | `db/migrations/900_grants_and_indexes.sql` | دسترسی‌ها، `ALTER DEFAULT PRIVILEGES`، ایندکس `tenant_id`، و بررسی نهایی |

مرحله ۱۲ در پایان بررسی می‌کند که هیچ جدول `tenant_id`داری بدون RLS کامل نمانده
باشد و در غیر این صورت با خطا متوقف می‌شود — یعنی اگر سرویسی در آینده جدول جدیدی
اضافه کند و RLS یادش برود، مایگریشن می‌شکند نه اینکه بی‌صدا نشتی ایجاد شود.

## مدل امنیتی

- یک PostgreSQL مشترک، یک اسکیما برای هر دامنه.
- دو نقش: `app_user` (همه‌ی سرویس‌ها، `NOBYPASSRLS`) و `platform_admin`
  (`BYPASSRLS`، فقط مایگریشن و گزارش‌گیری سوپرادمین).
- هر جدول `tenant_id`دار: `ENABLE` + `FORCE ROW LEVEL SECURITY` و پالیسی
  `tenant_isolation_<table>` با **هم `USING` و هم `WITH CHECK`**.
- هر تراکنش باید با `SET LOCAL app.current_tenant_id = '<uuid>'` شروع شود
  (`DatabaseService.withTenant`). بدون آن → صفر ردیف، نه خطا.
- استثناها: `identity.tenants` (برای جستجوی subdomain در لحظه لاگین) و
  `identity.platform_admins` (سطح پلتفرم) عمداً RLS ندارند.

## داده‌ی نمونه (`--seed`)

- چهار ساختمان: برج آفتاب / مجتمع نیلوفر / ساختمان یاس / برج مروارید
- کاربران tenant «برج آفتاب»: `admin@borj-aftab.test` و … — رمز `Passw0rd!`
- سوپرادمین‌ها: `behzad` و `amir` — رمز `1234`
- داده‌ی عملیاتی: ۳ واحد، ۳ امکانات مشترک + قوانین رزرو، ۲ شارژ ماهانه + ۱ پرداخت،
  ۱ مجوز مهمان + ۱ بسته، منوی کافه و یک رکورد لاگ

**فقط برای محیط توسعه.** پیش از هر دیپلوی واقعی، رمزهای `app_user` /
`platform_admin` را با `APP_USER_PASSWORD` / `PLATFORM_ADMIN_PASSWORD` عوض کنید.

## پارتیشن‌های audit

`audit.event_logs` ماهانه پارتیشن می‌شود. تابع
`audit.ensure_month_partition(date)` پارتیشن یک ماه را می‌سازد؛ مایگریشن ماه جاری
و ۳ ماه بعد را ایجاد می‌کند. برای Production یک Cron ماهانه بگذارید:

```sql
SELECT audit.ensure_month_partition((CURRENT_DATE + interval '2 month')::date);
```
