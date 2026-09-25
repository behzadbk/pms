# PMS SaaS — سامانه مدیریت ساختمان/برج (Property Management System)

سامانه‌ی چندمستأجری (Multi-tenant) برای مدیریت برج/مجتمع مسکونی: احراز هویت و نقش‌ها، مدیریت واحدها و مالکان/ساکنان، رزرو امکانات مشترک، مالی و شارژ، نگهبانی (مهمان/پارکینگ/بسته)، اطلاع‌رسانی و تیکتینگ، سفارش غذا (F&B) داخل ساختمان، و لاگ/ممیزی متمرکز.

این مخزن خروجیِ سازمان‌یافته‌ی مستندات فنی سه بخش اصلی پروژه است (فرانت‌اند، بک‌اند، دیتابیس) که برای آپلود روی گیت‌هاب آماده شده. هدف این README ارائه‌ی یک نمای کلی سریع است؛ جزئیات کامل هر بخش در پوشه‌ی [`docs/`](./docs) آمده.

## 🚀 نصب روی سرور خام — فقط یک دستور

روی یک سرور تازه‌ی **Ubuntu 22.04 / 24.04 یا Debian 12** (حداقل ۲ هسته، ۴ گیگ رم، ۲۰ گیگ دیسک):

```bash
git clone https://github.com/behzadbk/pms.git
cd pms
sudo bash install.sh            # نصب production
# یا:
sudo bash install.sh --demo     # + داده‌ی نمونه برای تست (برج آفتاب، کاربران تست، behzad/amir با رمز 1234)
```

`install.sh` همه‌ی مراحل را به‌ترتیب و خودکار انجام می‌دهد — لازم نیست چیز دیگری دستی نصب شود:

| مرحله | کار |
|---|---|
| ۱ | نصب پیش‌نیازها: `curl`, `git`, `openssl`, `ca-certificates` |
| ۲ | نصب **Docker Engine + Docker Compose** (اول مخزن رسمی، اگر در دسترس نبود مخزن خود Ubuntu/Debian) |
| ۳ | تنظیم میرور Docker Hub — اختیاری، با `REGISTRY_MIRROR=...` |
| ۴ | ساخت فایل `.env` با رمزهای تصادفی (دیتابیس، RabbitMQ، JWT، سوپرادمین) |
| ۵ | build ایمیج‌ها: ۸ سرویس NestJS + فرانت‌اند PWA + مایگریشن |
| ۶ | بالا آوردن PostgreSQL 16، RabbitMQ و Redis |
| ۷ | اجرای همه‌ی مایگریشن‌های دیتابیس (`db/migrate.sh`) — با `--demo` داده‌ی نمونه هم اضافه می‌شود |
| ۸ | ساخت کاربر سوپرادمین از روی `.env` |
| ۹ | بالا آوردن ۸ سرویس، فرانت‌اند و gateway (nginx روی پورت ۸۰) |
| ۱۰ | تست سلامت تک‌تک سرویس‌ها و چاپ آدرس و اطلاعات ورود |

در پایان آدرس اپ، آدرس پنل سوپرادمین (`/super-admin/login`) و نام کاربری/رمز سوپرادمین چاپ می‌شود. همه‌ی رمزها در فایل `.env` هستند — از آن بکاپ بگیرید.

**دستورهای بعدی:**

```bash
sudo bash install.sh update          # git pull + build + مایگریشن + ری‌استارت (داده‌ها حفظ می‌شوند)
sudo bash install.sh status          # وضعیت کانتینرها و سلامت سرویس‌ها
sudo bash install.sh logs identity-svc
sudo bash install.sh stop | start
```

**تنظیمات اختیاری** (قبل از دستور، یا بعداً داخل `.env` و سپس `update`):

```bash
sudo PUBLIC_URL=https://app.barouco.ir HTTP_PORT=80 bash install.sh
sudo REGISTRY_MIRROR=https://docker.arvancloud.ir bash install.sh   # اگر Docker Hub روی سرور باز نمی‌شود
sudo NPM_REGISTRY=https://registry.npmjs.org bash install.sh        # میرور npm برای build
```

فایل‌های مربوط: [`install.sh`](./install.sh) · [`docker-compose.yml`](./docker-compose.yml) · [`.env.example`](./.env.example) · [`infra/docker/gateway.conf`](./infra/docker/gateway.conf)

> مسیرها پشت gateway: `/` → فرانت‌اند، `/api/<service>/…` → هر میکروسرویس (مثل Ingress در Kubernetes)، `/socket.io/` → WebSocket زنده.
> برای HTTPS یک reverse proxy (Caddy یا nginx + certbot) جلوی پورت gateway بگذارید و `PUBLIC_URL` را https کنید.

## 🪟 اجرای محلی روی ویندوز (بدون نصب)

از [Releases → windows-portable](https://github.com/behzadbk/pms/releases/tag/windows-portable) فایل `Hamin-PMS-windows.zip` را دانلود کنید، در مسیری مثل `C:\Hamin` اکسترکت کنید و `start.bat` را اجرا کنید — دیتابیس، ۸ سرویس و اپ بدون نصب هیچ برنامه‌ای روی `http://localhost:8080` بالا می‌آیند. راهنما: [`windows/README.txt`](./windows/README.txt).

این زیپ را workflow «Windows portable» بعد از هر تغییر کد خودکار می‌سازد و قبل از انتشار، روی یک ویندوز واقعی اجرا و ورود ساختمان و سوپرادمین را تست می‌کند.

## نمای کلی معماری

```
                        ┌─────────────────────────┐
                        │      Frontend (PWA)      │
                        │  React + Vite + TS       │
                        │  Liquid Glass Design      │
                        └────────────┬─────────────┘
                                     │ REST + WebSocket
                                     ▼
                        ┌─────────────────────────┐
                        │        Ingress            │
                        └────────────┬─────────────┘
        ┌───────────┬───────────┬────┴─────┬───────────┬───────────┐
        ▼           ▼           ▼          ▼           ▼           ▼
   identity-svc property-svc facility-svc finance-svc guard-svc notification-svc
        │           │           │          │           │           │
        └─────┬─────┴─────┬─────┴────┬─────┴─────┬─────┴─────┬─────┘
              ▼           ▼          ▼           ▼           ▼
                    fnb-svc      audit-svc   (۸ سرویس NestJS)
                                     │
                                     ▼
                       ┌─────────────────────────┐
                       │   PostgreSQL 16 (RLS)     │
                       │  یک اسکیمای per-domain    │
                       └─────────────────────────┘
```

- **مدل چندمستأجری:** یک پایگاه‌داده مشترک با Row-Level Security؛ هر تنانت فقط با `SET LOCAL app.current_tenant_id` داده‌ی خودش را می‌بیند (fail-closed).
- **بک‌اند:** ۸ میکروسرویس NestJS مستقل (identity, property, facility, finance, guard, notification, fnb, audit).
- **فرانت‌اند:** یک PWA واحد با نقش‌های resident/admin/guard/staff/superadmin و زبان بصری Liquid Glass.

## ساختار پیشنهادی مخزن

```
.
├── README.md
├── docs/
│   ├── frontend.md       ← گزارش کامل بخش فرانت‌اند
│   ├── backend.md        ← گزارش کامل بخش بک‌اند و تست‌ها
│   └── database.md       ← گزارش کامل اسکیمای دیتابیس
├── frontend/             ← کد PWA (React/Vite/TS) — از پروژه‌ی موجود کاربر
├── backend/              ← ۸ میکروسرویس NestJS — از پروژه‌ی موجود کاربر
├── db/                   ← نقطه‌ی ساخت دیتابیس: migrate.sh، migrationهای مشترک، seed، docker-compose
└── infra/                ← Dockerfileها و مانیفست‌های Kubernetes
```

> نکته: این خروجی شامل خودِ کد سورس نیست (کد از قبل در سیستم شما و در پروژه‌های جداگانه‌ی چت وجود دارد)؛ این پوشه صرفاً مستندسازی سه‌بخشی را در قالب استاندارد گیت‌هاب (`README.md` + `docs/`) کنار هم می‌گذارد تا مستقیماً کنار کد واقعی commit شود.

## وضعیت فعلی هر بخش

| بخش | وضعیت | جزئیات |
|---|---|---|
| دیتابیس (`db/`) | ✅ از روی خودِ ریپو قابل ساخت شد و روی PostgreSQL ۱۶ واقعی تأیید شد — ۱۲ migration، idempotent، ۱۷ تست RLS/constraint سبز. سه باگ واقعی رفع شد (نبودِ DDL جداول identity، پالیسی بدون `WITH CHECK`، پارتیشن هاردکد audit) — [جزئیات پایین‌تر](#ساخت-واقعی-دیتابیس-از-روی-ریپو-۲۰۲۶-۰۹-۱۴) | [docs/database.md](./docs/database.md) |
| بک‌اند (۸ سرویس NestJS) | ✅ build و تست واقعی هر ۸ سرویس؛ یک باگ lockfile در ۳ سرویس رفع شد؛ تست‌های خودکار جدید نوشته و پاس شدند. `docker build`/`kubectl` به‌دلیل محدودیت شبکه‌ی سندباکس فقط تا حد اعتبارسنجی ساختاری پیش رفت | [docs/backend.md](./docs/backend.md) |
| فرانت‌اند (PWA) | ✅ سه صفحه‌ی جدید (سفارش غذا، Kitchen Display، داشبورد لاگ) + لایه‌ی API client ساخته شد؛ کل پروژه build شد (`tsc -b` + `vite build` + service worker) | [docs/frontend.md](./docs/frontend.md) |
| لایه‌ی اتصال (auth/env/CORS) | ✅ احراز هویت واقعی end-to-end، پروکسی dev برای `/api/<service>`، CORS قابل‌تنظیم و seed داده‌ی ورود — [جزئیات پایین‌تر](#لایهی-اتصال-فرانتاند--بکاند-۲۰۲۶-۰۹-۱۴) | این فایل |
| پنل سوپر ادمین | ✅ ورود جدا (`/super-admin/login`)، لیست ساختمان‌ها با وضعیت مالی اشتراک، تعریف برج جدید و سطح‌بندی ساده/اقتصادی/حرفه‌ای — build و تست end-to-end واقعی روی PostgreSQL | [docs/03-SUPERADMIN.md](./docs/03-SUPERADMIN.md) |

---

## لایه‌ی اتصال فرانت‌اند ↔ بک‌اند (۲۰۲۶-۰۹-۱۴)

تا پیش از این، فرانت‌اند و بک‌اند دو نیمه‌ی جدا بودند: فرانت‌اند هیچ‌وقت لاگین نمی‌کرد (نقش کاربر یک `useState` با مقدار ثابت `'admin'` بود)، هیچ صفحه‌ی ورودی وجود نداشت، و قراردادِ لاگینِ دو طرف با هم نمی‌خواند. این بخش، **زیرساخت اتصال** را وصل می‌کند — نه داده‌ی صفحات را (آن هنوز `mockData.ts` است؛ رجوع به «کارهای باقی‌مانده»).

### ۱) ناسازگاری‌های واقعی که پیدا و رفع شد

| مورد | قبل | بعد |
|---|---|---|
| بدنه‌ی درخواست لاگین | فرانت‌اند `{ phone, password }` می‌فرستاد | `{ email, password, tenantSubdomain }` — مطابق `LoginDto` بک‌اند |
| پاسخ لاگین | بک‌اند فقط `{ accessToken, refreshToken }` برمی‌گرداند، ولی تایپ `LoginResponse` فرانت‌اند `user` هم می‌خواست (مقدارش `undefined` می‌شد) | پاسخ شامل `user: { id, fullName, role, tenantId }` |
| `GET /auth/me` | فرانت‌اند صدایش می‌زد؛ روی بک‌اند **وجود نداشت** | پیاده‌سازی شد (پشت `JwtAuthGuard`) |
| `POST /auth/refresh` | فرانت‌اند صدایش می‌زد؛ روی بک‌اند **وجود نداشت** | پیاده‌سازی شد (`@Public`، توکن از body اعتبارسنجی می‌شود) |
| مسیر `/api/...` در dev | به خود dev سرور Vite می‌خورد و ۴۰۴ می‌گرفت (Ingress فقط در K8s بود) | پروکسی dev در `vite.config.ts` به پورت هر سرویس |

### ۲) احراز هویت (auth)

- **بک‌اند `identity-service`:** متد `login` حالا `full_name` را هم می‌خواند و کاربر کامل را برمی‌گرداند؛ متدهای `refresh` (اعتبارسنجی refresh token و صدور جفت توکن جدید) و `me` (پروفایل کاربر جاری از دیتابیس، در محدوده‌ی RLS همان tenant) اضافه شدند؛ منطق مشترک در دو helper خصوصی `issueTokens` و `fetchUser` جمع شد.
- **فرانت‌اند:** `AuthContext` جدید وضعیت واقعی کاربر را نگه می‌دارد و بعد از رفرش صفحه با `GET /auth/me` نشست را از روی `accessToken` ذخیره‌شده بازیابی می‌کند (توکن نامعتبر ⇒ پاک می‌شود). صفحه‌ی `/login` واقعی (subdomain مجتمع + ایمیل + رمز) اضافه شد و همه‌ی مسیرهای داخلی پشت `RequireAuth` رفتند — بدون نشست معتبر، کاربر به `/login` هدایت می‌شود.
- **نقش‌ها:** `RoleContext` دیگر `'admin'` ثابت نیست؛ نقش از کاربرِ لاگین‌شده می‌آید (سوییچر نقش سایدبار برای پیش‌نمایش دموی پنل‌های دیگر باقی ماند). دکمه‌ی **خروج** به سایدبار اضافه شد و نام واقعی کاربر جای persona دموی `mockData` را می‌گیرد.
- **refresh token** حالا در `localStorage` ذخیره می‌شود (`setRefreshToken`/`getRefreshToken`) تا صدور خودکار توکن جدید بعداً قابل اضافه‌شدن باشد.

### ۳) مسیر‌دهی API و متغیرهای محیطی (env)

`vite.config.ts` یک `server.proxy` گرفت که دقیقاً همان نگاشت `infra/k8s/base/ingress.yaml` را در dev بازتولید می‌کند (حذف پیشوند `/api/<service>` و ارسال بقیه‌ی مسیر به سرویس مقصد):

| پیشوند | سرویس | پورت محلی |
|---|---|---|
| `/api/identity` | identity-svc | ۳۰۰۱ |
| `/api/property` | property-svc | ۳۰۰۲ |
| `/api/facility` | facility-svc | ۳۰۰۳ |
| `/api/finance` | finance-svc | ۳۰۰۴ |
| `/api/guard` | guard-svc | ۳۰۰۵ |
| `/api/audit` | audit-svc | ۳۰۰۷ |
| `/api/fnb` | fnb-svc | ۳۰۰۸ |

`ws: true` برای همه فعال است (تقویم زنده‌ی facility و پنل زنده‌ی guard). `notification-service` (۳۰۰۶) عمداً نیست — endpoint عمومی ندارد و فقط مصرف‌کننده‌ی صف داخلی است. `VITE_API_BASE_URL` همچنان برای override دستی کار می‌کند (نمونه در `frontend/.env.example`) ولی در حالت عادی نیازی به مقداردهی ندارد.

### ۴) CORS

هر ۸ سرویس قبلاً `app.enableCors()` بدون پارامتر داشتند: برای dev باز بود ولی برای production قابل محدودکردن نبود. حالا هر ۸ سرویس یکسان این را دارند:

```ts
app.enableCors({
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim()) : true,
  credentials: true,
})
```

بدون مقداردهی `CORS_ORIGIN` رفتار قبلی (همه‌ی مبداها) حفظ می‌شود؛ در production باید به دامنه‌ی واقعی فرانت‌اند محدود شود.

### ۵) داده‌ی اولیه برای تست ورود

`backend/identity-service/prisma/seed-dev.sql` یک tenant نمونه (`borj-aftab`) و یک کاربر برای هر نقش می‌سازد (هش bcrypt واقعی، `ON CONFLICT DO NOTHING`، UUIDهای ثابت تا اجرای دوباره بی‌خطر باشد).

### فایل‌های تغییر‌یافته و جدید

| فایل | نوع | تغییر |
|---|---|---|
| `backend/identity-service/src/auth/auth.service.ts` | ویرایش | بازگشت کاربر کامل در `login`؛ افزودن `refresh` و `me`؛ helperهای `issueTokens`/`fetchUser` |
| `backend/identity-service/src/auth/auth.controller.ts` | ویرایش | افزودن `POST /auth/refresh` و `GET /auth/me` |
| `backend/identity-service/src/auth/dto/refresh.dto.ts` | جدید | DTO اعتبارسنجی `refreshToken` |
| `backend/identity-service/prisma/seed-dev.sql` | جدید | tenant + یک کاربر برای هر نقش |
| `backend/identity-service/.env.example` | ویرایش | افزودن `CORS_ORIGIN` |
| `backend/*/src/main.ts` (هر ۸ سرویس) | ویرایش | CORS قابل‌تنظیم با `CORS_ORIGIN` |
| `frontend/src/context/AuthContext.tsx` | جدید | وضعیت نشست، `login`/`logout`، بازیابی نشست با `getMe()` |
| `frontend/src/pages/Login.tsx` | جدید | صفحه‌ی ورود (subdomain / ایمیل / رمز) |
| `frontend/src/App.tsx` | ویرایش | `AuthProvider`، مسیر `/login`، محافظ `RequireAuth` |
| `frontend/src/context/RoleContext.tsx` | ویرایش | همگام‌سازی نقش با کاربر لاگین‌شده |
| `frontend/src/components/Layout.tsx` | ویرایش | دکمه‌ی خروج + نمایش نام واقعی کاربر |
| `frontend/src/lib/api/identity.ts` | ویرایش | امضای `login(email, password, tenantSubdomain)`، تایپ `AuthUser`، ذخیره/پاک‌کردن refresh token |
| `frontend/src/lib/api/client.ts` | ویرایش | `getRefreshToken`/`setRefreshToken` |
| `frontend/vite.config.ts` | ویرایش | پروکسی dev برای `/api/<service>` |
| `frontend/.env.example` | جدید | مستندسازی `VITE_API_BASE_URL` |
| `README.md` | ویرایش | همین بخش + راهنمای اجرای محلی |

### وضعیت تأیید

تغییرات با **esbuild** از نظر سینتکس چک شدند (هر ۲۱ فایل پاس). برخلاف جلسه‌ی قبل، `tsc -b` / `vite build` / `nest build` واقعی این بار اجرا **نشد** (روی این ماشین ویندوز شل مستقیم در دسترس نبود و همه‌چیز از طریق پل فایل انجام شد). قبل از commit، یک‌بار build واقعی بزنید:

```bash
cd frontend && npm install && npm run build
cd ../backend/identity-service && npm install && npm run build
```

## پنل سوپر ادمین — ورود، ساختمان‌ها و سطح‌بندی سرویس (۲۰۲۶-۰۹-۱۴)

پیش از این، صفحات `superadmin/*` فقط پوسته بودند و از `mockData.ts` می‌خواندند؛ هیچ راه ورودی هم برای سوپرادمین وجود نداشت. این بخش، پنل سطح پلتفرم را واقعی می‌کند. سند کامل: [docs/03-SUPERADMIN.md](./docs/03-SUPERADMIN.md).

### ۱) کاربران سطح پلتفرم

سوپرادمین‌ها در جدول جدید `identity.platform_admins` نگهداری می‌شوند، نه در `identity.users`. دلیل: این کاربر به هیچ tenant‌ای تعلق ندارد، پس نه `tenant_id` دارد و نه باید زیر RLS مربوط به یک مجتمع برود. توکن صادرشده برای او `tenant_id: null` و `role: 'super_admin'` دارد، و `GET /auth/me` و `POST /auth/refresh` هر دو حالت (کاربر مجتمع / سوپرادمین) را تشخیص می‌دهند.

دو کاربر اولیه‌ی dev: `behzad` و `amir` (رمز هر دو `1234`).

### ۲) سطوح سرویس

سطح هر ساختمان تعیین می‌کند کدام ماژول‌ها برایش فعال باشد. ماتریس در دو فایل هم‌نسخه است (`backend/identity-service/src/platform/tiers.ts` و `frontend/src/lib/tiers.ts`).

| سطح | برای چه ساختمان‌هایی | ماژول‌ها | قیمت پایه |
|---|---|---|---|
| **ساده** | ساختمان‌هایی که هیچ مشاعاتی ندارند و فقط شفافیت مالی و ثبت خرابی می‌خواهند | شفافیت مالی و صندوق، ثبت و صدور شارژ، پرداخت آنلاین شارژ، ثبت گزارش خرابی، ثبت خریدها و هزینه‌ها، سرویس‌های دوره‌ای، برنامه نظافت، اطلاعیه‌ها (۸) | ۲۵٬۰۰۰ تومان / واحد / ماه |
| **اقتصادی** | چند مشاعات دارند (سینما، باشگاه) اما لابی، نگهبانی و تأسیسات ندارند | همه‌ی موارد ساده + رزرو مشاعات، قوانین رزرو هوشمند، تقویم بصری زنده، رأی‌گیری (۱۲) | ۴۰٬۰۰۰ تومان / واحد / ماه |
| **حرفه‌ای** | برج‌های کامل با لابی، نگهبانی ۲۴ ساعته و تأسیسات | همه‌ی موارد اقتصادی + پنل نگهبانی/لابی، کد مهمان (QR)، مرسولات پستی، تردد خودرو و پارکینگ، سفارش غذا و کافی‌شاپ، مدیریت تأسیسات (CMMS)، داشبورد لاگ (۱۹) | ۶۵٬۰۰۰ تومان / واحد / ماه |

مبلغ اشتراک پیشنهادی هنگام تعریف ساختمان = قیمت پایه × تعداد واحد (قابل تغییر دستی در همان فرم).

### ۳) وضعیت مالی

منظور از «وضعیت مالی» در لیست ساختمان‌ها، **تسویه‌ی اشتراک نرم‌افزار با ما** است — نه وصول شارژ داخلی ساکنین. ستون‌های جدید روی `identity.tenants`: `monthly_fee`، `outstanding_amount`، `billing_status` (`settled` / `due` / `overdue`)، `last_payment_at`، `next_due_at`.

### ۴) Endpointهای جدید (identity-service)

| متد | مسیر | دسترسی |
|---|---|---|
| POST | `/auth/platform-login` | عمومی — `{ username, password }` |
| GET | `/platform/tiers` | `super_admin` |
| GET | `/platform/buildings` | `super_admin` — لیست + خلاصه (MRR، مانده بدهی، تفکیک سطوح) |
| GET | `/platform/buildings/:id` | `super_admin` |
| POST | `/platform/buildings` | `super_admin` — تعریف برج/ساختمان جدید |
| PATCH | `/platform/buildings/:id` | `super_admin` |
| PATCH | `/platform/buildings/:id/settle` | `super_admin` — ثبت تسویه‌ی اشتراک |

همه‌ی مسیرهای `/platform/*` علاوه بر `JwtAuthGuard` با `@Roles('super_admin')` محافظت می‌شوند؛ توکن یک مدیر ساختمان عادی روی آن‌ها ۴۰۳ می‌گیرد (تست شد).

### ۵) صفحات جدید فرانت‌اند

| مسیر | صفحه |
|---|---|
| `/super-admin/login` | ورود سوپرادمین (نام کاربری/رمز، بدون subdomain) |
| `/super-admin/buildings` | لیست ساختمان‌ها + فیلتر سطح/وضعیت مالی + فرم تعریف برج جدید |
| `/super-admin/plans` | سطوح سرویس و جدول مقایسه‌ی کامل قابلیت‌ها |

گارد `RequireSuperAdmin` در `App.tsx` علاوه بر لاگین، نقش کاربر را هم چک می‌کند و کاربر لاگین‌نشده روی مسیرهای `/super-admin/*` به `/super-admin/login` هدایت می‌شود، نه `/login`.

### ۶) فایل‌های تغییر‌یافته و جدید

| فایل | نوع |
|---|---|
| `backend/identity-service/prisma/migrations/002_platform_admins_and_tiers.sql` | جدید |
| `backend/identity-service/prisma/seed-platform-admins.sql` | جدید |
| `backend/identity-service/prisma/schema.prisma` | ویرایش — مدل `PlatformAdmin` و فیلدهای جدید `Tenant` |
| `backend/identity-service/src/platform/` (tiers، service، controller، module، ۲ DTO) | جدید |
| `backend/identity-service/src/auth/dto/platform-login.dto.ts` | جدید |
| `backend/identity-service/src/auth/auth.service.ts` | ویرایش — `platformLogin` + پشتیبانی `tenant_id: null` در `me`/`refresh` |
| `backend/identity-service/src/auth/auth.controller.ts` | ویرایش — مسیر `platform-login` |
| `backend/identity-service/src/app.module.ts` | ویرایش — `PlatformModule` |
| `frontend/src/lib/tiers.ts` | جدید — ماتریس سطوح سمت کلاینت |
| `frontend/src/lib/api/platform.ts` | جدید |
| `frontend/src/pages/superadmin/Login.tsx`، `Buildings.tsx`، `NewBuildingDialog.tsx` | جدید |
| `frontend/src/pages/superadmin/Plans.tsx` | بازنویسی — جدول مقایسه‌ی سطوح |
| `frontend/src/App.tsx` | ویرایش — مسیرها، `RequireSuperAdmin`، `HomeRedirect` |
| `frontend/src/context/AuthContext.tsx` | ویرایش — `loginPlatform` |
| `frontend/src/lib/nav.ts`، `src/components/Layout.tsx`، `src/lib/api/identity.ts`، `src/lib/api/index.ts` | ویرایش |
| `docs/03-SUPERADMIN.md` | جدید |

### ۷) وضعیت تأیید

برخلاف جلسه‌ی قبل، این بار build واقعی اجرا شد:

- فرانت‌اند: `npm install` + `tsc -b --force` (صفر خطا) + `vite build` کامل با تولید service worker (۴۴ ورودی precache) + `oxlint`.
- بک‌اند: `npm install` + `nest build` (صفر خطا).
- end-to-end روی یک PostgreSQL 16 واقعی: اجرای migration و seed، ورود `behzad/1234` و `amir/1234`، رد رمز اشتباه (۴۰۱)، `GET /auth/me`، لیست ساختمان‌ها و خلاصه، ساخت ساختمان جدید با محاسبه‌ی خودکار اشتراک (اقتصادی × ۳۰ واحد = ۱٬۲۰۰٬۰۰۰)، رد subdomain تکراری (۴۰۹)، رد سطح نامعتبر (۴۰۰)، ۴۰۳ برای توکن مدیر ساختمان، ۴۰۱ بدون توکن، و ثبت تسویه.

در همین build، **دو خطای کامپایل از قبل موجود** پیدا و رفع شد که جلسه‌ی قبل (که فقط esbuild زده بود) نگرفته بود:

- `frontend/src/App.tsx` — `type ReactElement` از `react-router-dom` import شده بود؛ به `react` منتقل شد.
- `backend/identity-service/src/auth/auth.service.ts` — اینترفیس `AuthResult` export نشده بود و با `declaration: true` خطای `TS4053` می‌داد.

## ساخت واقعی دیتابیس از روی ریپو (۲۰۲۶-۰۹-۱۴)

تا پیش از این، دیتابیس فقط به‌صورت یک آرشیو جدا (`03-database.tar.gz`) وجود داشت
و **از روی خود ریپو قابل ساخت نبود**. در این مرحله دیتابیس از روی همین مخزن روی
یک PostgreSQL 16 واقعی ساخته، اجرا و تست شد.

### ۱) سه باگ واقعی که پیدا و رفع شد

| # | مشکل | اثر واقعی | رفع |
|---|---|---|---|
| ۱ | DDL جداول `identity` هیچ‌جا وجود نداشت | `001_enable_rls.sql` فرض می‌کرد Prisma جدول‌ها را ساخته، ولی سرویس‌ها از `pg` خام استفاده می‌کنند و Prisma هرگز اجرا نمی‌شود → روی دیتابیس خالی با `relation "identity.users" does not exist` می‌شکست | فایل جدید `backend/identity-service/prisma/migrations/000_init_identity.sql` |
| ۲ | پالیسی‌های RLS فقط `USING` داشتند، بدون `WITH CHECK` | خواندن ایزوله بود ولی یک سرویس می‌توانست ردیفی با `tenant_id` تنانت دیگر **بنویسد** | همه‌ی پالیسی‌ها حالا `USING` + `WITH CHECK` دارند (تست‌شده) |
| ۳ | پارتیشن audit هاردکد بود (`event_logs_2026_09`) | از ماه بعد هر INSERT لاگ با `no partition of relation found` رد می‌شد | تابع `audit.ensure_month_partition(date)` + ساخت خودکار ماه جاری و ۳ ماه بعد |

به‌علاوه باگ شناخته‌شده‌ی connection بازیافتی (مقدار `app.current_tenant_id` بعد
از COMMIT به `''` برمی‌گشت و `''::uuid` خطای ۵۰۰ می‌داد) این‌بار در سطح خود
دیتابیس رفع شد: همه‌ی پالیسی‌ها به‌جای cast مستقیم از
`platform.current_tenant_id()` استفاده می‌کنند که با `NULLIF` رشته‌ی خالی را به
`NULL` تبدیل می‌کند → صفر ردیف، نه خطا.

### ۲) پوشه‌ی جدید `db/`

```
db/
  migrate.sh            رانر مایگریشن‌ها با ردیابی نام+checksum در platform.schema_migrations
                        (--seed / --status / --reset)
  test-rls.py           ۱۷ تست واقعی ایزوله‌سازی و constraint با نقش app_user
  docker-compose.yml    Postgres 16 محلی + سرویس migrate
  Dockerfile            تصویر alpine+psql — هم برای compose، هم K8s Job
  .env.example
  migrations/000_bootstrap.sql            اکستنشن‌ها، نقش‌های app_user/platform_admin،
                                          اسکیمای platform، توابع current_tenant_id()/current_user_id()،
                                          جدول ردیابی مایگریشن‌ها
  migrations/900_grants_and_indexes.sql   GRANTها + ALTER DEFAULT PRIVILEGES روی هر ۸ اسکیما،
                                          ایندکس tenant_id، و بررسی نهایی
  seeds/003_demo_operational_data.sql     واحدها، امکانات + قوانین رزرو، شارژ ماهانه،
                                          پرداخت، مجوز مهمان، بسته، منوی کافه، یک رکورد لاگ
```

مایگریشن‌های دامنه‌ای هر سرویس سر جای خودشان در
`backend/<svc>/prisma/migrations/` ماندند؛ `migrate.sh` فقط آن‌ها را به ترتیب
درست اجرا می‌کند:

`000_bootstrap` → identity (`000`/`001`/`002`) → property → facility → finance →
guard → notification → audit → fnb → `900_grants_and_indexes`

بخش RLS همه‌ی ۸ سرویس بازنویسی شد تا idempotent باشد: یک بلوک `DO` که هر جدولِ
دارای ستون `tenant_id` در آن اسکیما را sweep می‌کند و `ENABLE` + `FORCE ROW LEVEL
SECURITY` و پالیسی را با `DROP POLICY IF EXISTS` اعمال می‌کند. نتیجه: اگر سرویسی
در آینده جدول جدیدی اضافه کند، خودکار RLS می‌گیرد.

مرحله‌ی `900` در پایان اگر جدول `tenant_id`داری بدون RLS کامل ببیند، **مایگریشن
را می‌شکند** — یعنی فراموش‌کردن RLS روی جدول جدید دیگر بی‌صدا نشتی نمی‌سازد.

### ۳) مدل امنیتی (بدون تغییر در طراحی، حالا تست‌شده)

- یک PostgreSQL مشترک، یک اسکیما به‌ازای هر دامنه (۸ دامنه + `platform`).
- `app_user` (همه‌ی سرویس‌ها، `NOBYPASSRLS`) و `platform_admin` (`BYPASSRLS`؛ فقط
  مایگریشن و گزارش‌های سوپرادمین).
- هر تراکنش باید با `SET LOCAL app.current_tenant_id = '<uuid>'` شروع شود
  (`DatabaseService.withTenant`). بدون آن → صفر ردیف (fail closed).
- استثنا: `identity.tenants` (جستجوی subdomain در لحظه‌ی لاگین) و
  `identity.platform_admins` (سطح پلتفرم) عمداً RLS ندارند.
- `migrate.sh` باید با نقش superuser/owner اجرا شود، نه `app_user` (چون RLS
  `FORCE` شده است).

### ۴) وضعیت تأیید — روی PostgreSQL 16 واقعی

| # | تست | نتیجه |
|---|---|---|
| ۱ | دیتابیس خالی → ۱۲ مایگریشن بدون خطا | ✓ |
| ۲ | اجرای دوباره = no-op (ردیابی checksum) | ✓ |
| ۳ | `--reset` و ساخت کامل از صفر | ✓ |
| ۴ | `app_user` بدون tenant context → صفر ردیف، بدون خطا | ✓ |
| ۵ | tenant A فقط داده‌ی خودش؛ tenant B صفر ردیف (property/finance/guard/fnb/facility) | ✓ |
| ۶ | connection بازیافتی بعد از COMMIT خطای uuid نمی‌دهد | ✓ |
| ۷ | جعل `tenant_id` در INSERT مسدود می‌شود (`WITH CHECK`) | ✓ |
| ۸ | رزرو هم‌پوشان روی همان امکانات رد می‌شود (EXCLUDE) | ✓ |
| ۹ | `app_user` نه DDL می‌زند نه RLS را خاموش می‌کند | ✓ |
| ۱۰ | seedها idempotent و داده‌ی لاگین درست | ✓ |
| ۱۱ | پارتیشن‌های ماهانه‌ی audit ساخته می‌شوند | ✓ |

```bash
APP_DATABASE_URL="postgres://app_user:<pass>@localhost:5432/pms" python3 db/test-rls.py
# نتیجه: ۱۷ قبول / ۰ رد
```

مسیر داکر (`docker compose up`) در آن سشن اجرا نشد (داکر در سندباکس نبود)؛ خودِ
منطق مایگریشن با Postgres واقعی تست شد.

### ۵) فایل‌های تغییر‌یافته و جدید

**جدید**

- `db/migrate.sh`، `db/README.md`، `db/Dockerfile`، `db/docker-compose.yml`، `db/.env.example`، `db/test-rls.py`
- `db/migrations/000_bootstrap.sql`، `db/migrations/900_grants_and_indexes.sql`
- `db/seeds/003_demo_operational_data.sql`
- `backend/identity-service/prisma/migrations/000_init_identity.sql`
- `infra/k8s/base/migration-job.db.yaml` — یک Job واحد به‌جای ۸ Job جداگانه

**تغییر‌یافته**

- بخش RLS هر ۸ مایگریشن سرویس (`identity`, `property`, `facility`, `finance`, `guard`, `notification`, `audit`, `fnb`) — idempotent + `WITH CHECK` + `FORCE RLS` + استفاده از `platform.current_tenant_id()`
- `backend/audit-service/prisma/migrations/001_audit_schema.sql` — پارتیشن هاردکد → `audit.ensure_month_partition()`
- `docs/database.md`

---

## اجرای محلی end-to-end (فرانت‌اند + identity-service)

```bash
# ۱) دیتابیس — یک دستور، همه‌ی migrationها + داده‌ی نمونه
createdb pms   # یا با داکر: cd db && docker compose up -d postgres
cd db
DATABASE_URL="postgres://postgres@localhost:5432/pms" ./migrate.sh --seed
# --seed داده‌ی dev را هم می‌سازد: tenant «برج آفتاب» + یک کاربر برای هر نقش،
# کاربران سوپرادمین behzad/amir، و داده‌ی عملیاتی (واحد، امکانات، شارژ، منوی کافه).
# بدون --seed فقط ساختار ساخته می‌شود. اجرای دوباره بی‌خطر است (no-op).
cd ..

# ۲) identity-service
cd backend/identity-service
cp .env.example .env   # DATABASE_URL/JWT_SECRET را با مقادیر خودتان جایگزین کنید
npm install
npm run start:dev   # روی پورت ۳۰۰۱

# ۳) بقیه‌ی سرویس‌ها (اختیاری برای صفحات دیگر) — همین الگو با DATABASE_URL و PORT خودشان

# ۴) فرانت‌اند
cd frontend
npm install
npm run dev   # پورت ۵۱۷۳ — پروکسی /api/* را vite.config.ts مدیریت می‌کند
```

سپس در فرم ورود:

| فیلد | مقدار |
|---|---|
| مجتمع (subdomain) | `borj-aftab` |
| ایمیل | `admin@borj-aftab.test` (یا `resident@` / `guard@` / `staff@` / `accountant@borj-aftab.test`) |
| یا نام کاربری کارکنان | `lobby` · `kitchen` · `cafe` · `amenity` · `tech` |
| رمز عبور | `Passw0rd!` |

و برای پنل سوپر ادمین در آدرس `http://localhost:5173/super-admin/login`:

| فیلد | مقدار |
|---|---|
| نام کاربری | `behzad` یا `amir` |
| رمز عبور | `1234` |

> این اطلاعات فقط برای dev است؛ `seed-dev.sql` و `seed-platform-admins.sql` نباید روی محیط واقعی اجرا شوند و رمز `1234` باید پیش از هر دیپلوی عوض شود.

## گام‌های بعدی (خلاصه‌ی اولویت‌بندی‌شده از هر سه بخش)

۱. سه فایل `package-lock.json` رفع‌شده (notification/audit/fnb) در بک‌اند commit شوند.
۲. `npm install` روی پوشه‌ی frontend اجرا شود تا `socket.io-client` جدید نصب شود.
۳. اتصال داده‌ی ~۲۰ صفحه‌ی باقی‌مانده (داشبوردها، مالی، رزرو، تیکت، واحدها، نگهبانی، داشبورد و تراکنش‌های سوپرادمین) به API واقعی و حذف `mockData.ts` — زیرساخت auth/env/CORS، صفحات fnb/audit و صفحه‌ی ساختمان‌های سوپرادمین از قبل وصل‌اند.
۴. صدور خودکار `accessToken` جدید با refresh token هنگام دریافت ۴۰۱ (توکن ذخیره می‌شود ولی interceptor خودکار هنوز نوشته نشده).
۵. اعمال RBAC سمت فرانت‌اند روی بقیه‌ی مسیرها (مسیرهای `/super-admin/*` با `RequireSuperAdmin` محافظت شدند، اما بقیه‌ی نقش‌ها هنوز می‌توانند URL پنل نقش دیگر را باز کنند؛ داده‌ها سمت سرور محافظت‌شده‌اند).
۵.۱. اعمال feature flagهای سطح سرویس داخل پنل خود مجتمع‌ها — یعنی مخفی کردن منوی نگهبانی/مشاعات برای یک ساختمان «ساده». ماتریس آماده است؛ فقط باید `tier` مجتمع در `/auth/me` برگردانده و در `nav.ts` فیلتر شود.
۶. اجرای واقعی `docker build` برای هر ۸ سرویس روی محیطی با دسترسی شبکه به رجیستری داکر (یا در CI).
۷. تست `kubectl apply --dry-run=server` روی یک کلاستر واقعی (kind/minikube یا CI).
۸. override کردن پسوردهای پیش‌فرض دیتابیس (`app_user_change_me`, `platform_admin_change_me`) با `APP_USER_PASSWORD`/`PLATFORM_ADMIN_PASSWORD` و تنظیم `CORS_ORIGIN` قبل از هر دیپلوی غیر-local.
۹. approve کردن install scriptهای بسته‌های native (`bcrypt` و مشابه) در پایپلاین CI.
۱۰. گسترش تست‌های tenant-isolation در سطح *اپلیکیشن* به بقیه‌ی سرویس‌ها (سطح دیتابیس با `db/test-rls.py` پوشش داده شد).
۱۱. یک اجرای واقعی `cd db && docker compose up -d postgres && docker compose run --rm migrate --seed` روی ماشین خودتان (مسیر داکر هنوز اجرا نشده).
۱۲. تنظیم Cron ماهانه برای `audit.ensure_month_partition` در محیط Production.
۱۳. ست کردن `app.current_user_id` در `DatabaseService.withTenant` (تابعش در دیتابیس آماده است) تا ممیزی بداند «چه کسی».
۱۴. جدول‌های اطلاعیه/نظرسنجی/تیکت هنوز در دیتابیس نیستند — کد فعلی notification-service فقط `delivery_log` را می‌نویسد؛ هر وقت آن ماژول‌ها پیاده شدند، migration جدید لازم دارند.

## پشته‌ی فناوری

- **فرانت‌اند:** React + TypeScript + Vite، PWA (service worker)، recharts، socket.io-client، طراحی Liquid Glass
- **بک‌اند:** NestJS (۸ میکروسرویس مستقل)، Prisma
- **دیتابیس:** PostgreSQL 16، Row-Level Security، migration اسکریپت سفارشی (`migrate.sh`)
- **زیرساخت:** Docker (multi-stage builds)، Kubernetes (Deployment برای هر سرویس + یک migration Job واحد)، Ingress مشترک

## لایسنس

این بخش را بسته به تصمیم خودتان تکمیل کنید (مثلاً MIT یا خصوصی/Proprietary).
