# دیتابیس — اسکیمای PostgreSQL برای PMS

وضعیت: **از روی خودِ ریپو ساخته و به‌صورت end-to-end روی یک PostgreSQL 16 واقعی
تأیید شد** (۱۲ مایگریشن اجرا شد، idempotency و `--reset` تست شد، ۱۷ تست RLS و
constraint سبز شد). نقطه‌ی ورود: `db/migrate.sh`.

## چرا این مرحله لازم بود

تا پیش از این، دیتابیس فقط به‌صورت یک `03-database.tar.gz` جدا از ریپو وجود
داشت و ساختِ آن از روی خود پروژه ممکن نبود. سه مشکل واقعی پیدا و رفع شد:

1. **DDL جداول identity اصلاً وجود نداشت.** `001_enable_rls.sql` فرض می‌کرد
   `prisma migrate deploy` جدول‌های `identity.tenants` / `users` /
   `refresh_tokens` را ساخته، ولی سرویس‌ها از `pg` خام استفاده می‌کنند و Prisma
   هرگز اجرا نمی‌شود — پس روی دیتابیس خالی مایگریشن با
   «relation identity.users does not exist» می‌شکست. فایل جدید
   `backend/identity-service/prisma/migrations/000_init_identity.sql` این را می‌سازد.
2. **پالیسی‌ها فقط `USING` داشتند، بدون `WITH CHECK`.** یعنی خواندن ایزوله بود
   اما یک سرویس می‌توانست ردیفی با `tenant_id` تنانت دیگر **بنویسد**. حالا هر
   پالیسی هر دو را دارد و این مورد تست هم شده.
3. **پارتیشن audit هاردکد شده بود (`event_logs_2026_09`).** از ماه بعد هر
   INSERT لاگ با «no partition of relation found» رد می‌شد. جایگزین:
   `audit.ensure_month_partition(date)` + ساخت خودکار ماه جاری و ۳ ماه بعد.

همچنین باگ شناخته‌شده‌ی connection بازیافتی (مقدار `app.current_tenant_id` بعد از
COMMIT به `''` برمی‌گشت و `::uuid` خطای ۵۰۰ می‌داد) در سطح دیتابیس رفع شد:
همه‌ی پالیسی‌ها به‌جای cast مستقیم از `platform.current_tenant_id()` استفاده
می‌کنند که با `NULLIF` رشته‌ی خالی را به NULL تبدیل می‌کند → صفر ردیف، نه خطا.

## ساختار

```
db/
  migrate.sh            رانر مایگریشن‌ها با ردیابی در platform.schema_migrations
                        (--seed / --status / --reset)
  test-rls.py           ۱۷ تست واقعی ایزوله‌سازی و constraint با نقش app_user
  docker-compose.yml    Postgres 16 محلی + سرویس migrate
  Dockerfile            تصویر alpine+psql (هم برای compose، هم K8s Job)
  .env.example
  migrations/
    000_bootstrap.sql            اکستنشن‌ها، نقش‌ها، اسکیمای platform،
                                 platform.current_tenant_id()، جدول ردیابی
    900_grants_and_indexes.sql   GRANTها + ALTER DEFAULT PRIVILEGES،
                                 ایندکس tenant_id، و بررسی نهایی
  seeds/
    003_demo_operational_data.sql  واحدها، امکانات، شارژ، پرداخت، نگهبانی، منوی کافه

backend/<svc>/prisma/migrations/   مایگریشن‌های دامنه‌ای هر سرویس (سر جای خودشان)
infra/k8s/base/migration-job.db.yaml  یک Job واحد به‌جای ۸ Job جداگانه
```

ترتیب اجرا داخل `migrate.sh` تعریف شده است: bootstrap → identity (000/001/002)
→ property → facility → finance → guard → notification → audit → fnb → hardening.

## مدل امنیتی

- یک PostgreSQL مشترک، یک اسکیما به‌ازای هر دامنه (۸ اسکیمای دامنه‌ای + `platform`).
- دو نقش: `app_user` (همه‌ی سرویس‌ها، `NOBYPASSRLS`) و `platform_admin`
  (`BYPASSRLS`، فقط مایگریشن و گزارش‌های سوپرادمین).
- هر جدول `tenant_id`دار: `ENABLE` + `FORCE ROW LEVEL SECURITY` و پالیسی
  `tenant_isolation_<table>` با `USING` **و** `WITH CHECK`.
- هر تراکنش باید با `SET LOCAL app.current_tenant_id = '<uuid>'` شروع شود
  (`DatabaseService.withTenant`). بدون آن → صفر ردیف (fail closed).
- استثنا: `identity.tenants` (جستجوی subdomain در لحظه لاگین) و
  `identity.platform_admins` (سطح پلتفرم) عمداً RLS ندارند.
- `900` در پایان اگر جدول `tenant_id`داری بدون RLS کامل ببیند، مایگریشن را
  **می‌شکند** — یعنی فراموش‌کردن RLS روی جدول جدید دیگر بی‌صدا نشتی نمی‌سازد.

## موارد تأییدشده روی PostgreSQL 16 واقعی

| # | تست | نتیجه |
|---|---|---|
| ۱ | دیتابیس خالی → ۱۲ مایگریشن بدون خطا | ✓ |
| ۲ | اجرای دوباره = no-op (ردیابی checksum) | ✓ |
| ۳ | `--reset` و ساخت کامل از صفر | ✓ |
| ۴ | `app_user` بدون tenant context → صفر ردیف، بدون خطا | ✓ |
| ۵ | tenant A فقط داده‌ی خودش؛ tenant B صفر ردیف (۵ اسکیما) | ✓ |
| ۶ | connection بازیافتی بعد از COMMIT خطای uuid نمی‌دهد | ✓ |
| ۷ | جعل `tenant_id` در INSERT مسدود (`WITH CHECK`) | ✓ |
| ۸ | رزرو هم‌پوشان روی همان امکانات رد می‌شود (EXCLUDE) | ✓ |
| ۹ | `app_user` نه DDL می‌زند نه RLS را خاموش می‌کند | ✓ |
| ۱۰ | seedها idempotent و داده‌ی لاگین درست | ✓ |
| ۱۱ | پارتیشن‌های ماهانه audit ساخته می‌شوند | ✓ |

اجرای تست‌ها:
```bash
APP_DATABASE_URL="postgres://app_user:<pass>@localhost:5432/pms" python3 db/test-rls.py
```

## شروع سریع

```bash
createdb pms
cd db && DATABASE_URL="postgres://postgres@localhost:5432/pms" ./migrate.sh --seed
```
یا با داکر: `docker compose up -d postgres && docker compose run --rm migrate --seed`

## کارهای باقی‌مانده

- رمزهای `app_user_change_me` / `platform_admin_change_me` فقط برای local‌اند —
  با `APP_USER_PASSWORD` / `PLATFORM_ADMIN_PASSWORD` یا K8s Secret عوض شوند.
- مسیر داکر (`docker compose up`) در این سشن اجرا نشد (داکر در سندباکس نبود)؛
  خود مایگریشن با Postgres واقعی تست شد. یک بار روی ماشین خودت اجرا کن.
- Cron ماهانه برای `audit.ensure_month_partition` در Production.
- سرویس‌ها هنوز `app.current_user_id` را ست نمی‌کنند (تابعش آماده است).
- جدول‌های اطلاعیه/نظرسنجی/تیکت هنوز در دیتابیس نیستند — کد فعلی
  notification-service فقط `delivery_log` را می‌نویسد؛ هر وقت آن ماژول‌ها
  پیاده شدند، مایگریشن جدید لازم دارند.
