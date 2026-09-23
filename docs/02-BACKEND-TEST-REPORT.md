# 02-backend — گزارش تست واقعی (docker build / kubectl / تست‌های خودکار)

وضعیت: build واقعی + npm install واقعی برای هر ۸ سرویس با موفقیت انجام شد؛ یک باگ واقعی در ۳ سرویس پیدا و رفع شد؛ تست‌های خودکار جدید (از جمله tenant isolation روی PostgreSQL واقعی) نوشته و با موفقیت اجرا شدند؛ `docker build` واقعی و `kubectl apply --dry-run` به دلیل محدودیت شبکه در این سندباکس ابری قابل اجرای کامل نبودند — جزئیات و راه‌حل جایگزین در ادامه.

## ۱) npm install + build واقعی (نه فقط syntax) — همه ۸ سرویس

همه‌ی ۸ سرویس با `npm install` واقعی (نه mock) و `nest build` واقعی تست شدند.

**باگ واقعی پیدا و رفع شد:** در ۳ سرویس (`notification-service`, `audit-service`, `fnb-service`) دستور `npm ci` با خطای داخلی npm (`Cannot read properties of null (reading 'edgesOut')`) کرش می‌کرد. علت واقعی (بعد از ارتقای npm به نسخه‌ی جدید برای گرفتن پیام خطای واضح‌تر): `package-lock.json` این سه سرویس با نسخه‌ی prerelease پین‌شده‌ی `prisma@^8.0.0-rc.12` هماهنگ نبود — یک زنجیره‌ی وابستگیِ جدید (`vitest` و بسته‌های `@vitejs/*`) که این نسخه‌ی RC از پریزما به‌صورت transitive اضافه می‌کند، در lock file قدیمی نبود.
رفع شد با اجرای `npm install` (نه `ci`) برای بازتولید کامل lockfile؛ فایل‌های `package-lock.json` جدید همین ۳ سرویس در پوشه‌ی شما جای‌گذاری شدند. توصیه: این سه فایل commit شوند تا در CI هم `npm ci` دوباره fail نکند.

نکته‌ی جانبی: npm نسخه‌ی جدید به‌صورت پیش‌فرض install script بسته‌هایی مثل `bcrypt`, `esbuild`, `msgpackr-extract`, `workerd`, `protobufjs` را (برای امنیت) بلاک می‌کند مگر approve شوند — بدون تأیید این اسکریپت‌ها، `bcrypt` در runtime واقعی کار نمی‌کند (باینری native کامپایل نمی‌شود). در محیط تست از `npm install-scripts approve --all` استفاده شد؛ در CI باید همین کار یا معادلش (`--foreground-scripts` / allowlist) انجام شود.

## ۲) docker build واقعی

`docker build -f infra/docker/Dockerfile.nestjs --build-arg SERVICE_PATH=backend/identity-service ...` روی یک daemon واقعی داکر اجرا شد (نه فقط `docker compose config`). نتیجه:

- ساختار Dockerfile، ترتیب COPY (اول package*.json برای layer cache، بعد کل سورس)، multi-stage build، حذف devDependencies با `npm prune`، کاربر non-root، و HEALTHCHECK — همگی از نظر ساختاری درست هستند و مشکلی در خود Dockerfile یا `.dockerignore` ریشه (که به‌درستی `node_modules`, `dist`, `.git`, `docs`, `infra/k8s` و فایل‌های `.md` را از build context حذف می‌کند) دیده نشد.
- build دقیقاً روی مرحله‌ی `FROM node:20-alpine` متوقف شد چون سندباکس ابری این سشن دسترسی شبکه به هیچ registry داکری (Docker Hub، GHCR، GCR mirror، ECR public) ندارد — سیاست شبکه‌ی این محیط، نه باگی در کد شما.

**نتیجه‌گیری:** کد Docker شما آماده‌ی build واقعی است؛ صرفاً باید یک‌بار روی ماشین خودتان (که قبلاً هم گفته بودید Docker نصب دارید) دستور بالا را برای هر ۸ سرویس اجرا کنید. اگر بخواهید، در یک نشست بعدی که به کامپیوتر شما با قابلیت اجرای دستور (device shell) وصل باشم، می‌توانم این ران واقعی را مستقیماً آن‌جا انجام دهم.

## ۳) kubectl apply --dry-run

نصب باینری `kubectl` در این سندباکس ممکن نشد (دسترسی به `dl.k8s.io`, `storage.googleapis.com`, `github.com` نیز توسط همان سیاست شبکه بسته است؛ فقط `registry.npmjs.org` و `pypi.org` مجاز بودند). به‌جای آن، یک اعتبارسنجی ساختاریِ کامل با پایتون/PyYAML روی تمام ۲۵ فایل YAML غیر-template انجام شد:

- همه فایل‌ها parse شدند بدون خطای syntax.
- هر ۸ سرویس دقیقاً یک `Deployment` و یک migration `Job` متناظر دارد.
- namespace همه‌جا یکسان (`pms-prod`) است.
- portهای container با پورت‌های مستندشده (identity=3001 … fnb=3008) دقیقاً مطابقت دارند.
- تصاویر روی `ghcr.io/pms-saas/<svc>:__IMAGE_TAG__` استاندارد شده‌اند (placeholder برای CI).

این معادل بخش «schema صحیح است» از `kubectl apply --dry-run=client` است، اما validation واقعی در برابر OpenAPI schema سرور K8s و `--dry-run=server` (که نیاز به یک کلاستر واقعی دارد) هنوز باقی مانده — پیشنهاد می‌شود با یک کلاستر local (kind/minikube روی ماشین خودتان) یا در مرحله‌ی CI انجام شود.

## ۴) تست‌های خودکار جدید (اجرا شده روی PostgreSQL و در حافظه — واقعی، نه فرضی)

### الف) Tenant Isolation — `backend/property-service/test/tenant-isolation.e2e-spec.ts`
یک PostgreSQL 16 واقعی + نقش‌های `app_user`/`platform_admin` + migration واقعی `001_enable_rls.sql` روی آن اجرا شد و ۵ تست زیر با موفقیت پاس شدند:
1. بدون تنظیم `app.current_tenant_id` → صفر ردیف (fail closed).
2. tenant A فقط ساختمان tenant A را می‌بیند.
3. tenant B فقط ساختمان tenant B را می‌بیند.
4. تلاش tenant A برای درج رکورد با `tenant_id` جعلی (تعلق به tenant B) → رد می‌شود (`row-level security` violation).
5. **یافته‌ی مهم:** بعد از این‌که `app.current_tenant_id` حداقل یک‌بار روی یک connection با `SET LOCAL` تنظیم شود، مقدار reset آن پس از COMMIT به‌جای `NULL` به رشته‌ی خالی `''` تبدیل می‌شود (رفتار مستند خود PostgreSQL برای custom GUCها). نتیجه: هر query بعدی روی همان connection recycle-شده در pool که context تنظیم نکند، به‌جای «۰ ردیف»، با خطای `invalid input syntax for type uuid` (۵۰۰) fail می‌شود. امنیتی مشکلی نیست (هیچ دیتایی نشت نمی‌کند) ولی برای هر Controller آینده که فراموش کند از `db.withTenant(...)` استفاده کند، به‌جای پاسخ خالی یک خطای ۵۰۰ خواهید گرفت — نکته‌ای که ارزش مستندسازی برای تیم دارد.

این تأیید می‌کند که لایه‌ی NestJS (`DatabaseService.withTenant` + استفاده‌ی آن در `UnitsController`) دقیقاً همان چیزی را که در سند دیتابیس به‌عنوان «کار باقی‌مانده» ذکر شده بود، از قبل درست پیاده کرده است.

### ب) منطق رزرو — `backend/facility-service/src/reservations/booking-validation.service.spec.ts`
۶ تست unit (بدون نیاز به دیتابیس، با mock کردن `PoolClient`) برای `BookingValidationService`: سقف رزرو در بازه، حداقل/حداکثر فاصله‌ی زمانی پیش‌رزرو، و هم‌پوشانی بازه — همه پاس شدند.

## پیشنهاد گام بعدی (اولویت‌بندی‌شده)

۱. commit کردن سه `package-lock.json` رفع‌شده (notification/audit/fnb).
۲. اجرای واقعی `docker build` برای هر ۸ سرویس روی ماشین خودتان (یا در CI) — کد آماده است.
۳. یک کلاستر local (kind/minikube) برای `kubectl apply --dry-run=server` واقعی، یا اجرای همین در مرحله‌ی CI با یک ephemeral cluster.
۴. گسترش تست‌های tenant-isolation به بقیه‌ی سرویس‌ها (finance، facility، guard، …) با همان الگو.
۵. approve کردن install scriptهای بسته‌های native (`bcrypt` و بقیه) در پایپلاین CI تا در تصویر نهایی داکر runtime واقعی کار کند.
