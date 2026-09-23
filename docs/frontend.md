# فرانت‌اند — سفارش غذا، داشبورد لاگ، Kitchen Display، لایه API

وضعیت: هر سه صفحه‌ی باقی‌مانده‌ی این بخش ساخته شدند، لایه‌ی API client برای اتصال به بک‌اند (audit-svc/fnb-svc/identity-svc) اضافه شد، و توکن‌های Liquid Glass تکمیل شدند. کل پروژه (نصب واقعی وابستگی‌ها + `tsc -b` + `vite build` کامل با سرویس‌ورکر PWA) در یک سندباکس ابری واقعاً اجرا و تأیید شد — نه فقط بررسی نحوی.

## ۱) صفحه‌ی طراحی وارد‌شده از Claude Design

کاربر فایل `PMS Mobile v2 - Standalone.html` را از یک پروژه‌ی Claude Design (کانواس چندصفحه‌ای) مستقیماً در چت attach کرد — چون اتصال مستقیم ابزار DesignSync در آن نشست Cowork (غیرتعاملی) به دلیل نیاز به `/design-login` تعاملی ممکن نبود. فایل decode (gzip+base64) و کد JSX/منطق آن استخراج شد: یک پروتوتایپ تعاملی کامل با ۴ نقش (resident/admin/guard/staff)، حالت تیره، «حالت آسان» (بزرگ‌نمایی برای کاربران مسن‌تر) و کنترل سطح انیمیشن. توکن‌های رنگ آن (`--pri`, `--bg`, `--ok`, `--warn`, `--bad`, ...) دقیقاً با `src/styles/liquid-glass.css` موجود هم‌خانواده بودند (همان طراح/جلسه).

جریان **سفارش غذا** در این فایل به‌طور کامل طراحی شده بود (منو، سبد، انتخاب مقصد تحویل، پیگیری سفارش ۵ مرحله‌ای) و صفحه‌ی `ResidentFoodOrder` مستقیماً بر اساس همین طراحی پیاده‌سازی شد. Kitchen Display و داشبورد لاگ در فایل طراحی نبودند (خارج از scope آن پروتوتایپ موبایل) — این دو بر اساس کانسپت‌های بخش ۴.۳/۴.۴ سند `docs/UPDATE-V2-AUDIT-FNB-DESIGN.md` و با همان زبان بصری Liquid Glass ساخته شدند تا هر سه صفحه‌ی جدید یک‌دست باشند.

## ۲) صفحات جدید

- **`src/pages/resident/FoodOrder.tsx`** — تب رستوران/کافی‌شاپ، دسته‌بندی منو، افزودن/تغییر تعداد آیتم، Bottom Sheet سبد با انتخاب مقصد (واحد من / منطقه‌ی مشاعات + یادداشت مکان)، نمایش روش تسویه (کیف پول یا شارژ ماهانه بسته به `venue.billing`)، و صفحه‌ی پیگیری سفارش با تایم‌لاین ۵ مرحله‌ای (شبیه‌سازی پیشرفت خودکار هر ۳٫۲ ثانیه — در تولید با `subscribeFnbLive`/`order.status.changed` جایگزین می‌شود).
- **`src/pages/staff/KitchenDisplay.tsx`** — بورد Kanban سه‌ستونه (جدید/در حال آماده‌سازی/آماده تحویل) با دکمه‌های لمسی بزرگ (حداقل ۵۶px)، تایمر هر کارت که پس از عبور از `prepTimeMinutes` قرمز می‌شود، طبق اصول طراحی تبلت آشپزخانه در سند.
- **`src/pages/admin/AuditLog.tsx`** — نوار فیلتر چسبان (سطح/سرویس/جستجو)، نمودار حجم لاگ (recharts)، ردیف‌های رنگ‌کدشده، و پنل کشویی «زنجیره رویداد» که همه‌ی لاگ‌های یک `session_id` را حول رویداد انتخابی نمایش می‌دهد (Event Chaining، دقیقاً بخش ۳.۱ سند).

هر سه صفحه به nav.ts/App.tsx اضافه شدند (`/resident/food-order`, `/staff/kitchen`, `/admin/logs`) و فعلاً با داده‌ی mock در `mockData.ts` کار می‌کنند (venues/menuItems/deliveryZones/kitchenQueue/auditLogs/auditVolume).

## ۳) لایه‌ی API client — `src/lib/api/`

- `client.ts` — fetch wrapper مشترک: هدرهای `X-Session-Id`/`X-Trace-Id` برای Correlation (بخش ۱.۳ سند)، JWT از localStorage، `ApiError` تایپ‌شده. مسیر پایه از `VITE_API_BASE_URL` یا پیش‌فرض `/api` (پشت همان Ingress مستند در `docs/ARCHITECTURE-SAAS.md`).
- `identity.ts` — login/refresh/logout/me (پایه‌ی احراز هویت برای بقیه‌ی کلاینت‌ها).
- `fnb.ts` — منو، سفارش (با `Idempotency-Key` اجباری طبق سند)، صف آشپزخانه، و اتصال WebSocket lazy به `/fnb-live` (`socket.io-client` — به `package.json` اضافه شد).
- `audit.ts` — جستجوی لاگ، Event Chaining (`getLogContext`)، و **بافر لاگ سمت کلاینت غیرمسدودکننده** (`enqueueClientLog`) با flush هر ۱۰ ثانیه و `navigator.sendBeacon` روی `pagehide` — دقیقاً طبق بخش ۱.۲ سند.

صفحات جدید هنوز به این لایه wire نشده‌اند (هنوز از mock می‌خوانند) — چون بک‌اند واقعی (audit-svc/fnb-svc، طبق [docs/backend.md](./backend.md) قبلاً build و تست شده) در آن سشن در دسترس نبود تا اتصال end-to-end تأیید شود. سوییچ به API واقعی، جایگزینی import از `mockData` با فراخوانی `fnbApi`/`auditApi` در همان کامپوننت‌هاست — تغییر کوچک و موضعی.

## ۴) توکن‌های Liquid Glass

`liquid-glass.css` تکمیل شد: `--lg-success-soft`, `--lg-warning-soft`, `--lg-danger-soft` (کم بودند) + `--lg-easy-scale` و `[data-lg-motion='off']` برای هماهنگی با «حالت آسان»/کنترل انیمیشن که در فایل طراحی وارد‌شده دیده شد. یک پریمیتیو مشترک جدید `src/components/ui/Glass.tsx` (`GlassCard`, `GlassPill`, `GlassSheet`, `GlassToast`) ساخته شد که هر سه صفحه‌ی جدید از آن استفاده می‌کنند.

## ۵) عمداً در آن چت انجام نشد

- **مهاجرت صفحات موجود** (۲۰+ صفحه‌ی admin/resident/guard/staff/superadmin) به Liquid Glass — فایل طراحی وارد‌شده در واقع بازطراحی کامل صفحات اصلی (خانه/رزرو/تیکت/نگهبانی) را هم نشان می‌دهد؛ این یک کار مستقل و بزرگ است که باید در یک چت جدا و با تأیید کاربر روی هر صفحه انجام شود، نه به‌صورت کورکورانه در کنار ۳ صفحه‌ی درخواستی.
- اتصال واقعی صفحات به بک‌اند (نیاز به یک سشن با دسترسی هم‌زمان به بک‌اند در حال اجرا و فرانت‌اند).

## ۶) تأیید فنی

`npm install` واقعی (افزودن `socket.io-client`) + `npx tsc -b --force` (صفر خطا) + `npx vite build` کامل (شامل تولید واقعی service worker با ۴۴ ورودی precache) در یک کپی از پروژه در سندباکس ابری اجرا شد. `npx oxlint src` هم بدون خطا. فایل‌های تغییریافته مستقیماً در پوشه‌ی `frontend` روی سیستم کاربر نوشته شدند؛ لازم است کاربر یک‌بار `npm install` را در پوشه‌ی frontend اجرا کند تا `node_modules` او هم `socket.io-client` تازه را داشته باشد (lockfile از قبل به‌روز شده).
