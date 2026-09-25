# PMS SaaS — سامانه مدیریت ساختمان/برج (Property Management System)

سامانه‌ی چندمستأجری (Multi-tenant) برای مدیریت برج/مجتمع مسکونی: احراز هویت و نقش‌ها، مدیریت واحدها و مالکان/ساکنان، رزرو امکانات مشترک، مالی و شارژ، نگهبانی (مهمان/پارکینگ/بسته)، اطلاع‌رسانی و تیکتینگ، سفارش غذا (F&B) داخل ساختمان، و لاگ/ممیزی متمرکز.

نام محصول: **«همین» (Hamin)** — یک اپ (PWA + اندروید/iOS) برای مدیر ساختمان، حسابداری، ساکنین، کارکنان (لابی، آشپزخانه، کافی‌شاپ، مشاعات، نگهبانی، تأسیسات) و مدیر پلتفرم.

این README نمای کلی پروژه است: هر نقش چه می‌بیند، داده کجا ذخیره می‌شود، چطور نصب و اجرا کنید و وضعیت هر بخش. جزئیات فنی هر مرحله در پوشه‌ی [`docs/`](./docs) آمده و تاریخچه‌ی تغییرات در [`CHANGELOG.md`](./CHANGELOG.md).

**فهرست:**
[نصب روی سرور](#-نصب-روی-سرور-خام--فقط-یک-دستور) ·
[اجرای ویندوز](#-اجرای-محلی-روی-ویندوز-بدون-نصب) ·
[نقش‌ها و پنل‌ها](#نقشها-و-پنلها--هر-کاربر-چه-میبیند) ·
[کارکنان و دسترسی‌ها](#کارکنان-و-دسترسیها) ·
[گردش کارهای اصلی](#گردش-کارهای-اصلی) ·
[داده کجا ذخیره می‌شود](#داده-کجا-ذخیره-میشود) ·
[حساب‌های تست](#حسابهای-تست) ·
[معماری](#نمای-کلی-معماری) ·
[مستندات](#فهرست-مستندات) ·
[وضعیت بخش‌ها](#وضعیت-فعلی-هر-بخش) ·
[گام‌های بعدی](#گامهای-بعدی-خلاصهی-اولویتبندیشده)

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

## نقش‌ها و پنل‌ها — هر کاربر چه می‌بیند

هر کاربر بعد از ورود فقط پنل نقش خودش را می‌بیند. اگر آدرس پنل نقش دیگری را دستی وارد کند، به خانه‌ی خودش برگردانده می‌شود. سمت سرور هم هر endpoint با `@Roles` محافظت شده است.

| نقش | چه کسی | ورود با | خانه |
|---|---|---|---|
| **مدیر ساختمان** (`admin`) | مدیر مجتمع | ایمیل | `/admin` |
| **حسابداری** (`accountant`) | حسابدار ساختمان | ایمیل | `/accountant` |
| **ساکن / مالک / مستأجر** (`resident`) | ساکنین واحدها | ایمیل | `/resident` |
| **کارکنان** (`staff`) | لابی‌من، آشپزخانه، کافی‌شاپ، مسئول مشاعات، نگهبانی، تأسیسات، نظافت | **نام کاربری** که مدیر می‌سازد | پنل بخش اصلی کارمند |
| **نگهبانی** (`guard`) | حساب قدیمی نگهبانی (کارکنان جدید نگهبانی از مسیر «کارکنان» ساخته می‌شوند) | ایمیل | `/guard` |
| **مدیر پلتفرم** (`super_admin`) | شما (فروشنده‌ی نرم‌افزار) | نام کاربری، صفحه‌ی جدا `/super-admin/login` | `/super-admin/buildings` |

### پنل مدیر ساختمان

| بخش | امکانات |
|---|---|
| داشبورد | موجودی صندوق، مطالبات معوق، روند درآمد و هزینه، تیکت‌های اخیر |
| گزارش مالی | **فقط مشاهده**: خلاصه‌ی مالی، لیست فاکتورها با **جزئیات هر فاکتور**، وضعیت وصول شارژ هر دوره. ثبت و صدور با حسابداری است. |
| تیکت‌ها | باز کردن هر تیکت (متن، گزارش‌دهنده، **محل**، روند پیگیری)، تغییر وضعیت، **تشخیص هوشمند تجهیز** (مثلاً «آسانسور B»)، **آخرین سرویس/تعویض** و سابقه‌ی همان تجهیز، هشدار گذشتن موعد سرویس دوره‌ای، ثبت تعمیر/تعویض |
| اعلانات و رأی‌گیری | فرم اعلان (عادی یا فوری) و **فرم‌ساز نظرسنجی** (چند سؤال، گزینه‌ی دلخواه، تک/چندگزینه‌ای، مهلت، وزن متراژی). **مخاطب**: همه‌ی ساکنین، مالکین، مستأجرین، استف، نگهبانی، حسابداری، بلوک‌ها یا واحدهای مشخص. پس از انتشار، اعلان داخل برنامه می‌رود. |
| رزرو مشاعات | تقویم زنده، تایید یا **عدم تایید با دلیل**، **ثبت دستی رزرو** (هماهنگی تلفنی). مسئولیت اصلی با «مسئول مشاعات» است و مدیر ناظر است. |
| قوانین رزرو هوشمند | افزودن، ویرایش و حذف مشاع؛ سقف رزرو هر واحد، بازه‌ی پیش‌رزرو، طول رزرو، مهلت کنسلی، بیعانه و سیاست بازگشت، نیاز به تایید، سانس‌بندی هفتگی (مردانه/زنانه/خانوادگی) |
| واحدها | پروفایل واحدها، مالک/مستأجر، متراژ، نفرات |
| **کارکنان** | افزودن، ویرایش، غیرفعال‌سازی و حذف کارکنان؛ اطلاعات شخصی؛ بخش و شیفت؛ **دسترسی دستی**؛ ساخت نام کاربری و رمز. [جزئیات](#کارکنان-و-دسترسیها) |
| داشبورد لاگ | لاگ متمرکز رفتار کاربران و خطاها (audit-service) |

### پنل حسابداری

- **داشبورد مالی:** موجودی صندوق، درصد وصول شارژ، معوقات، فاکتورهای پرداخت‌نشده، هزینه به تفکیک دسته.
- **شارژ و مطالبات:** فرمول (ثابت / متراژی / نفری / ترکیبی)، پیش‌نمایش و **صدور شارژ ماهانه** (که برای ساکنین اعلان می‌شود)، ثبت وصول، ویرایش و جریمه‌ی دیرکرد.
- **صندوق و فاکتورها:** **ثبت فاکتور** با اقلام، پیوست تصویر، وضعیت پرداخت و گردش صندوق.
- سمت سرور: `POST /charges/generate-monthly` فقط با نقش `accountant` کار می‌کند و مدیر 403 می‌گیرد.

### پنل ساکن / مستأجر

- **شارژ و پرداخت** و **شفافیت مالی** (هزینه‌های ساختمان، سهم مالک و مستأجر).
- **سفارش غذا و کافی‌شاپ:**
  - منو همان چیزی است که آشپزخانه یا کافی‌شاپ تنظیم کرده: عکس، غذای روز، ناموجود.
  - تحویل به واحد یا مشاعات.
  - بعد از ثبت فقط پیام **«سفارش شما ثبت شد»** نمایش داده می‌شود و **وضعیت واقعی** سفارش از آشپزخانه دنبال می‌شود.
- **رزرو مشاعات:** طبق قوانین فعال هر مشاع. در «رزروهای من» دلیل عدم تایید و رزروهایی که مدیریت دستی ثبت کرده هم نمایش داده می‌شود.
- **تیکت‌های من:**
  - اول **موضوع** انتخاب می‌شود: گزارش خرابی، انتقاد، پیشنهاد یا پیام مستقیم به مدیر.
  - برای خرابی، محل به‌صورت پیش‌فرض **واحد و طبقه‌ی خود ساکن** است و «جای دیگر» اجازه‌ی انتخاب طبقه و بخش را می‌دهد. گزینه‌ی «فوری» هم هست.
- **اعلانات و نظرسنجی** (شرکت در رأی‌گیری)، **صدور کد مهمان** و زنگوله‌ی اعلان‌ها.

### پنل کارکنان

کارمند فقط پنل‌هایی را می‌بیند که دسترسی‌شان را دارد (جدول بخش بعد):

| پنل | امکانات |
|---|---|
| **میز لابی** | پذیرش مهمان با کد یا پلاک، ثبت و تحویل مرسوله |
| **میز مسئول مشاعات** | تایید یا رد رزروها با دلیل، ثبت دستی رزرو، تقویم زنده. اعلان «درخواست رزرو جدید» به این بخش می‌رسد. |
| **سفارش‌های رستوران / کافی‌شاپ** | صف زنده‌ی Kanban برای تبلت (سفارش جدید، در حال آماده‌سازی، آماده، تحویل، یا رد). با «آماده شد» برای ساکن اعلان می‌رود. |
| **منوی رستوران / کافی‌شاپ** | افزودن، ویرایش و حذف آیتم؛ **عکس**؛ **قیمت اختیاری**؛ دسته؛ «اعلام ناموجود» و «مخفی از منو»؛ **غذای روز** که برای همه‌ی ساکنین اعلان می‌رود |
| **نگهبانی** | مهمان، مرسولات، تردد خودرو |
| **تأسیسات** | کارهای نگهداری، برنامه‌ی سرویس دوره‌ای. اعلان تیکت خرابی جدید به این بخش هم می‌رسد. |
| **اعلانات** | برای همه‌ی کارکنان |

### پنل مدیر پلتفرم (سوپرادمین)

لیست ساختمان‌ها با وضعیت مالی اشتراک، تعریف برج جدید همراه با حساب مدیر اولیه، و سطح سرویس (ساده / اقتصادی / حرفه‌ای). جزئیات: [docs/03-SUPERADMIN.md](./docs/03-SUPERADMIN.md)

## کارکنان و دسترسی‌ها

مدیر برای هر کارمند یک **بخش** انتخاب می‌کند. هر بخش دسترسی‌های پیش‌فرض خودش را دارد. مدیر می‌تواند **دسترسی دستی** اضافه کند، مثلاً کارمند آشپزخانه‌ای که یک شیفت در کافی‌شاپ می‌ایستد تیک «کافی‌شاپ» را هم می‌گیرد.

| بخش (`department`) | دسترسی پیش‌فرض (`permissions`) | پنل‌هایی که باز می‌شود |
|---|---|---|
| لابی‌من (`lobby`) | `lobby` | میز لابی |
| مسئول مشاعات (`amenity_desk`) | `amenity_desk` | میز مسئول مشاعات |
| آشپزخانه / رستوران (`kitchen`) | `kitchen` | سفارش‌ها و منوی رستوران |
| کافی‌شاپ (`cafe`) | `cafe` | سفارش‌ها و منوی کافی‌شاپ |
| نگهبانی (`security`) | `security` | مهمان، مرسولات، تردد |
| تأسیسات (`maintenance`) | `maintenance` | کارهای نگهداری، سرویس دوره‌ای |
| نظافت (`cleaning`) | `maintenance` | کارهای نگهداری |

- **دسترسی مؤثر** = پیش‌فرض بخش ∪ دسترسی دستی. بک‌اند آن را در `login` و `/auth/me` برمی‌گرداند و منوی فرانت از روی آن ساخته می‌شود.
- **اطلاعات هر کارمند:** نام، کد ملی، موبایل، تاریخ تولد، آدرس، تماس اضطراری، تاریخ شروع کار، شیفت (صبح/عصر/شب/چرخشی) و یادداشت مدیر.
- **حساب ورود:**
  - نام کاربری در هر مجتمع یکتاست. رمز فقط یک بار، هنگام ساخت، نمایش داده می‌شود و بعداً فقط قابل تغییر است.
  - کارمند **غیرفعال** نمی‌تواند وارد شود و نشستش هم تمدید نمی‌شود.
  - API کارکنان فقط حساب‌های `role='staff'` را لمس می‌کند و نمی‌تواند مدیر، ساکن یا حسابدار را تغییر دهد.
- **کد:**
  - `backend/identity-service/src/users/` (API `/users/staff`)
  - `backend/identity-service/prisma/migrations/004_staff_accounts.sql`
  - `frontend/src/lib/staff.ts` (بخش‌ها و منو)
  - `frontend/src/pages/admin/Staff.tsx`

## گردش کارهای اصلی

```
رزرو مشاعات
  ساکن رزرو می‌کند ──(مشاع نیاز به تایید دارد)──► اعلان به «مسئول مشاعات» و مدیر
  مسئول مشاعات: تایید ─► اعلان «تایید شد» به همان واحد
                 عدم تایید + دلیل ─► اعلان با دلیل + نمایش در «رزروهای من»
  ثبت دستی (تلفنی) توسط مسئول مشاعات/مدیر ─► رزرو قطعی + اعلان به واحد

سفارش غذا
  ساکن سفارش می‌دهد ─► «سفارش شما ثبت شد» ─► صف رستوران یا کافی‌شاپ (+ اعلان به همان بخش)
  آشپزخانه: پذیرش ─► آماده‌سازی ─► آماده شد (اعلان به ساکن) ─► تحویل
  غذای روز در مدیریت منو ─► اعلان به همه‌ی ساکنین + برچسب بالای منو

تیکت خرابی
  ساکن: موضوع «خرابی» + محل (پیش‌فرض واحد/طبقه‌ی خودش) ─► اعلان به مدیر و تأسیسات
  مدیر: باز کردن تیکت ─► تشخیص تجهیز + آخرین سرویس/تعویض + سابقه
        ─► ثبت تعمیر/تعویض ─► در سابقه‌ی تجهیز می‌ماند (دفعه‌ی بعد تاریخش دیده می‌شود)
        ─► تغییر وضعیت ─► اعلان به ساکن

اعلان و نظرسنجی
  مدیر: فرم اعلان / فرم‌ساز نظرسنجی + انتخاب مخاطب ─► اعلان داخل برنامه فقط برای همان مخاطبان
  مخاطبان در «اعلانات» رأی می‌دهند (هر نفر یک بار) ─► نتیجه برای مدیر زنده است

مالی
  حسابداری: صدور شارژ ماهانه (اعلان به ساکنین) · ثبت وصول · ثبت فاکتور
  مدیر: فقط گزارش + جزئیات فاکتور
```

## داده کجا ذخیره می‌شود

**مهم برای تست:** همه‌ی بخش‌ها هنوز به API بک‌اند وصل نیستند. بخش‌هایی که API ندارند روی یک **استور مشترک سمت کلاینت** (`frontend/src/lib/store.ts`) کار می‌کنند. این استور در `localStorage` همان مرورگر ذخیره می‌شود، با رفرش از بین نمی‌رود و بین تب‌های همان مرورگر همگام است. اما **بین دو دستگاه یا دو کاربر روی دستگاه‌های مختلف مشترک نیست.**

| بخش | ذخیره‌سازی | توضیح |
|---|---|---|
| ورود، نقش‌ها، توکن | ✅ دیتابیس (identity-service) | |
| **کارکنان** (حساب، بخش، دسترسی، اطلاعات شخصی) | ✅ دیتابیس (identity-service) | `/users/staff` |
| ساختمان‌ها و اشتراک (سوپرادمین) | ✅ دیتابیس (identity-service) | `/platform/*` |
| لاگ و ممیزی | ✅ دیتابیس (audit-service) | |
| قوانین رزرو، رزروها، ثبت دستی/رد | ⏳ استور کلاینت | facility-service برای قوانین و رزرو endpoint دارد؛ اتصال این صفحات مانده است |
| اعلانات، نظرسنجی، اعلان‌های داخل برنامه | ⏳ استور کلاینت | جدول آن‌ها هنوز در دیتابیس نیست |
| تیکت، تجهیزات و سابقه‌ی سرویس | ⏳ استور کلاینت | جدول آن‌ها هنوز در دیتابیس نیست |
| منوی رستوران/کافی‌شاپ و سفارش‌ها | ⏳ استور کلاینت | fnb-service برای منو و سفارش endpoint دارد؛ اتصال مانده است |
| فاکتورها، صدور شارژ، گردش صندوق | ⏳ استور کلاینت | finance-service برای صدور شارژ endpoint دارد |

برای برگرداندن داده‌ی نمونه‌ی بخش‌های ⏳، در کنسول مرورگر `localStorage.removeItem('hamin.demo-store')` را بزنید و صفحه را رفرش کنید. اکشن‌های `store.ts` (`publishAnnouncement`، `decideReservation`، `placeFnbOrder`، `addInvoice`، …) طوری نوشته شده‌اند که برای اتصال به API فقط بدنه‌شان با `fetch` عوض شود.

## حساب‌های تست

بعد از `./migrate.sh --seed` (یا `install.sh --demo` یا نسخه‌ی ویندوز). مجتمع: `borj-aftab`، رمز همه: `Passw0rd!`

| نقش | ایمیل / نام کاربری |
|---|---|
| مدیر ساختمان | `admin@borj-aftab.test` |
| حسابداری | `accountant@borj-aftab.test` |
| ساکن (واحد ۱۲، طبقه ۳، بلوک A) | `resident@borj-aftab.test` |
| نگهبانی | `guard@borj-aftab.test` |
| لابی‌من | `lobby` |
| آشپزخانه (+ دسترسی دستی کافی‌شاپ) | `kitchen` |
| کافی‌شاپ | `cafe` |
| مسئول مشاعات | `amenity` |
| تأسیسات | `tech` (همان `staff@borj-aftab.test`) |
| مدیر پلتفرم | `behzad` یا `amir` با رمز `1234` در `/super-admin/login` |

> این حساب‌ها فقط برای محیط توسعه و دمو هستند. روی سرور واقعی از `install.sh` بدون `--demo` استفاده کنید.

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
- **فرانت‌اند:** یک PWA واحد (+ اپ اندروید/iOS با Capacitor) با نقش‌های admin / accountant / resident / staff / guard / super_admin. منوی کارکنان بر اساس دسترسی‌هایشان ساخته می‌شود.

## ساختار مخزن

```
.
├── README.md · CHANGELOG.md
├── install.sh · docker-compose.yml   ← نصب یک‌دستوری روی سرور
├── docs/                             ← مستندات (فهرست پایین)
├── frontend/                         ← PWA (React/Vite/TS) + اپ اندروید/iOS (Capacitor)
│   └── src/
│       ├── pages/{admin,accountant,resident,staff,guard,superadmin,shared}/
│       ├── lib/store.ts              ← استور مشترک بخش‌هایی که هنوز API ندارند
│       ├── lib/staff.ts · lib/access.ts   ← بخش‌ها، دسترسی‌ها و منوی کارکنان
│       └── lib/api/                  ← کلاینت API هر سرویس
├── backend/                          ← ۸ میکروسرویس NestJS
├── db/                               ← migrate.sh، مایگریشن‌های مشترک، seed، تست RLS
├── infra/                            ← Dockerfileها و مانیفست‌های Kubernetes
├── windows/                          ← نسخه‌ی قابل‌حمل ویندوز (start.bat)
└── tests/                            ← تست API (e2e_api.py) و تست UI در مرورگر
```

## فهرست مستندات

| سند | موضوع |
|---|---|
| [docs/SPEC.md](./docs/SPEC.md) · [ARCHITECTURE-SAAS.md](./docs/ARCHITECTURE-SAAS.md) | مشخصات اولیه و معماری SaaS |
| [docs/FEATURES-DEEP-DIVE.md](./docs/FEATURES-DEEP-DIVE.md) · [NEW-MODULES-SPEC.md](./docs/NEW-MODULES-SPEC.md) | رزرو هوشمند، تقویم زنده، شفافیت مالی؛ ماژول‌های جدید |
| [docs/UPDATE-V2-AUDIT-FNB-DESIGN.md](./docs/UPDATE-V2-AUDIT-FNB-DESIGN.md) | طراحی لاگ متمرکز و سفارش غذا |
| [docs/frontend.md](./docs/frontend.md) · [backend.md](./docs/backend.md) · [database.md](./docs/database.md) | گزارش فرانت‌اند، بک‌اند و دیتابیس |
| [docs/02-BACKEND-TEST-REPORT.md](./docs/02-BACKEND-TEST-REPORT.md) | تست‌های بک‌اند |
| [docs/03-SUPERADMIN.md](./docs/03-SUPERADMIN.md) | پنل سوپرادمین و سطح‌بندی سرویس |
| [docs/04-DEBUG-AND-QA-REPORT.md](./docs/04-DEBUG-AND-QA-REPORT.md) | دیباگ و QA کامل + چک‌لیست پیش از تحویل |
| [docs/05-ADMIN-PANEL-FIXES.md](./docs/05-ADMIN-PANEL-FIXES.md) | اصلاحات پنل مدیر (قوانین رزرو، رزرو دستی، اعلان و نظرسنجی، تیکت هوشمند) + نقش حسابداری |
| [docs/06-STAFF-PANELS.md](./docs/06-STAFF-PANELS.md) | کارکنان، دسترسی‌ها، پنل‌های اختصاصی، منوی رستوران/کافی‌شاپ |
| [docs/MOBILE-APP.md](./docs/MOBILE-APP.md) | ساخت اپ اندروید/iOS |

## وضعیت فعلی هر بخش

| بخش | وضعیت | جزئیات |
|---|---|---|
| دیتابیس (`db/`) | ✅ از روی خودِ ریپو قابل ساخت شد و روی PostgreSQL ۱۶ واقعی تأیید شد — ۱۲ migration، idempotent، ۱۷ تست RLS/constraint سبز. سه باگ واقعی رفع شد (نبودِ DDL جداول identity، پالیسی بدون `WITH CHECK`، پارتیشن هاردکد audit) — [جزئیات پایین‌تر](#ساخت-واقعی-دیتابیس-از-روی-ریپو-۲۰۲۶-۰۹-۱۴) | [docs/database.md](./docs/database.md) |
| بک‌اند (۸ سرویس NestJS) | ✅ build و تست واقعی هر ۸ سرویس؛ یک باگ lockfile در ۳ سرویس رفع شد؛ تست‌های خودکار جدید نوشته و پاس شدند. `docker build`/`kubectl` به‌دلیل محدودیت شبکه‌ی سندباکس فقط تا حد اعتبارسنجی ساختاری پیش رفت | [docs/backend.md](./docs/backend.md) |
| فرانت‌اند (PWA) | ✅ سه صفحه‌ی جدید (سفارش غذا، Kitchen Display، داشبورد لاگ) + لایه‌ی API client ساخته شد؛ کل پروژه build شد (`tsc -b` + `vite build` + service worker) | [docs/frontend.md](./docs/frontend.md) |
| لایه‌ی اتصال (auth/env/CORS) | ✅ احراز هویت واقعی end-to-end، پروکسی dev برای `/api/<service>`، CORS قابل‌تنظیم و seed داده‌ی ورود — [جزئیات پایین‌تر](#لایهی-اتصال-فرانتاند--بکاند-۲۰۲۶-۰۹-۱۴) | این فایل |
| پنل سوپر ادمین | ✅ ورود جدا (`/super-admin/login`)، لیست ساختمان‌ها با وضعیت مالی اشتراک، تعریف برج جدید و سطح‌بندی ساده/اقتصادی/حرفه‌ای — build و تست end-to-end واقعی روی PostgreSQL | [docs/03-SUPERADMIN.md](./docs/03-SUPERADMIN.md) |
| پنل مدیر ساختمان + حسابداری | ✅ قوانین رزرو قابل ویرایش، رزرو دستی و رد با دلیل، اعلان و فرم‌ساز نظرسنجی با مخاطب، تیکت با تشخیص تجهیز و سابقه‌ی سرویس، نقش حسابداری. ۳۶ سناریوی مرورگر سبز. بخش‌های ⏳ روی استور کلاینت‌اند. | [docs/05-ADMIN-PANEL-FIXES.md](./docs/05-ADMIN-PANEL-FIXES.md) |
| کارکنان و پنل‌های اختصاصی | ✅ حساب کارکنان **واقعی** در دیتابیس (مایگریشن 004، `/users/staff`، ورود با نام کاربری)، پنل بر اساس دسترسی، منوی رستوران/کافی‌شاپ، اصلاح سفارش و تیکت ساکن. ۳۶ سناریوی مرورگر روی بک‌اند واقعی سبز. | [docs/06-STAFF-PANELS.md](./docs/06-STAFF-PANELS.md) |

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

## گام‌های بعدی (خلاصه‌ی اولویت‌بندی‌شده)

**اولویت اول: اشتراکی شدن داده بین دستگاه‌ها** (بخش‌های ⏳ در [داده کجا ذخیره می‌شود](#داده-کجا-ذخیره-میشود)):

- الف. اتصال منو و سفارش‌ها به fnb-service. endpointها موجودند، فقط ویرایش و حذف آیتم و عکس اضافه شود. این کار لازم است تا تبلت آشپزخانه سفارش گوشی ساکن را ببیند.
- ب. اتصال قوانین رزرو و رزروها به facility-service و افزودن endpoint تایید و رد با دلیل و ثبت دستی.
- ج. جدول و API برای تیکت، تجهیزات و سابقه‌ی سرویس، اعلان و نظرسنجی (notification-service یا یک سرویس جدید)، و فاکتور (finance-service).
- د. پروفایل واقعی واحد ساکن (واحد، طبقه، بلوک، مالک یا مستأجر) از property-service در `/auth/me`. فعلاً ساکن نمونه ثابت «واحد ۱۲، طبقه ۳، بلوک A» است.

**بقیه‌ی موارد (از مراحل قبل):**


۱. سه فایل `package-lock.json` رفع‌شده (notification/audit/fnb) در بک‌اند commit شوند.
۲. `npm install` روی پوشه‌ی frontend اجرا شود تا `socket.io-client` جدید نصب شود.
۳. اتصال داده‌ی ~۲۰ صفحه‌ی باقی‌مانده (داشبوردها، مالی، رزرو، تیکت، واحدها، نگهبانی، داشبورد و تراکنش‌های سوپرادمین) به API واقعی و حذف `mockData.ts` — زیرساخت auth/env/CORS، صفحات fnb/audit و صفحه‌ی ساختمان‌های سوپرادمین از قبل وصل‌اند.
۴. صدور خودکار `accessToken` جدید با refresh token هنگام دریافت ۴۰۱ (توکن ذخیره می‌شود ولی interceptor خودکار هنوز نوشته نشده).
۵. ~~اعمال RBAC سمت فرانت‌اند~~ — انجام شد: هر مسیر با `RequireRole` محافظت می‌شود و پنل‌های کارکنان علاوه بر نقش، دسترسی بخش (`RequirePermission`) هم لازم دارند.
۵.۱. اعمال feature flagهای سطح سرویس داخل پنل خود مجتمع‌ها — یعنی مخفی کردن منوی نگهبانی/مشاعات برای یک ساختمان «ساده». ماتریس آماده است؛ فقط باید `tier` مجتمع در `/auth/me` برگردانده و در `nav.ts` فیلتر شود.
۶. اجرای واقعی `docker build` برای هر ۸ سرویس روی محیطی با دسترسی شبکه به رجیستری داکر (یا در CI).
۷. تست `kubectl apply --dry-run=server` روی یک کلاستر واقعی (kind/minikube یا CI).
۸. override کردن پسوردهای پیش‌فرض دیتابیس (`app_user_change_me`, `platform_admin_change_me`) با `APP_USER_PASSWORD`/`PLATFORM_ADMIN_PASSWORD` و تنظیم `CORS_ORIGIN` قبل از هر دیپلوی غیر-local.
۹. approve کردن install scriptهای بسته‌های native (`bcrypt` و مشابه) در پایپلاین CI.
۱۰. گسترش تست‌های tenant-isolation در سطح *اپلیکیشن* به بقیه‌ی سرویس‌ها (سطح دیتابیس با `db/test-rls.py` پوشش داده شد).
۱۱. یک اجرای واقعی `cd db && docker compose up -d postgres && docker compose run --rm migrate --seed` روی ماشین خودتان (مسیر داکر هنوز اجرا نشده).
۱۲. تنظیم Cron ماهانه برای `audit.ensure_month_partition` در محیط Production.
۱۳. ست کردن `app.current_user_id` در `DatabaseService.withTenant` (تابعش در دیتابیس آماده است) تا ممیزی بداند «چه کسی».
۱۴. جدول‌های اطلاعیه/نظرسنجی/تیکت هنوز در دیتابیس نیستند (رابط کاربری آن‌ها کامل است و روی استور کلاینت کار می‌کند؛ مورد «ج» بالا).

## پشته‌ی فناوری

- **فرانت‌اند:** React + TypeScript + Vite، PWA (service worker)، recharts، socket.io-client، طراحی Liquid Glass
- **بک‌اند:** NestJS (۸ میکروسرویس مستقل)، Prisma
- **دیتابیس:** PostgreSQL 16، Row-Level Security، migration اسکریپت سفارشی (`migrate.sh`)
- **زیرساخت:** Docker (multi-stage builds)، Kubernetes (Deployment برای هر سرویس + یک migration Job واحد)، Ingress مشترک

## لایسنس

این بخش را بسته به تصمیم خودتان تکمیل کنید (مثلاً MIT یا خصوصی/Proprietary).
