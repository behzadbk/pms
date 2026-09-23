# اپ موبایل (Android / iOS) — Capacitor

همان فرانت‌اند React (پوشه‌ی `frontend`) داخل یک اپ نیتیو بسته‌بندی شده است. فایل‌های رابط کاربری **داخل خود اپ** هستند و فقط درخواست‌های API به سرور می‌روند.

| مورد | مقدار |
|---|---|
| شناسه‌ی اپ | `ir.barouco.pms` |
| نام اپ | مدیریت ساختمان |
| آدرس API | `https://api.barouco.ir/api` — در `frontend/.env.mobile` |
| اندروید | حداقل Android 7 (API 24) |
| iOS | حداقل iOS 15 |
| پلاگین‌ها | App (دکمه Back اندروید)، StatusBar، SplashScreen |

## فایل‌های اضافه/تغییر داده‌شده

- `frontend/capacitor.config.ts` — تنظیمات اپ
- `frontend/.env.mobile` — آدرس سرور API برای نسخه‌ی موبایل
- `frontend/android/` و `frontend/ios/` — پروژه‌های نیتیو (آیکون و Splash از `public/icons` ساخته شده‌اند)
- `frontend/src/lib/native.ts` + `main.tsx` — راه‌اندازی StatusBar/Splash/Back button فقط داخل اپ
- `frontend/vite.config.ts` — در `--mode mobile` سرویس‌ورکر PWA ساخته نمی‌شود (داخل اپ لازم نیست و باعث کش ماندن نسخه‌ی قدیمی می‌شود). نسخه‌ی وب/PWA بدون تغییر است.
- `frontend/package.json` — اسکریپت‌های `mobile:build`، `mobile:android`، `mobile:ios`
- `.github/workflows/mobile.yml` — ساخت خودکار APK و IPA در GitHub Actions

## روش ۱ — ساخت خودکار در GitHub (بدون نصب چیزی)

1. تغییرات را commit و به `github.com/behzadbk/pms1` push کنید.
2. در GitHub: تب **Actions** ← **Mobile apps** ← **Run workflow** (یا خودکار با push روی main).
3. بعد از پایان (حدود ۱۰ دقیقه)، از پایین صفحه‌ی اجرا در بخش **Artifacts**:
   - `android-apk` ← فایل `app-debug.apk` مستقیماً روی گوشی اندروید نصب می‌شود.
   - `ios-ipa-unsigned` ← IPA بدون امضا (توضیح پایین).

آدرس API را هنگام Run workflow هم می‌توانید عوض کنید.

### APK امضاشده برای انتشار (بازار / مایکت / گوگل‌پلی)
یک‌بار روی کامپیوتر خودتان کلید بسازید و **آن را جای امن نگه دارید** (بدون این فایل آپدیت اپ منتشرشده ممکن نیست):
```
keytool -genkey -v -keystore release.keystore -alias pms -keyalg RSA -keysize 2048 -validity 10000
```
سپس در GitHub ← Settings ← Secrets and variables ← Actions این‌ها را اضافه کنید:
`ANDROID_KEYSTORE_BASE64` (محتوای base64 فایل)، `ANDROID_KEYSTORE_PASSWORD`، `ANDROID_KEY_ALIAS`، `ANDROID_KEY_PASSWORD`.
از آن به بعد خروجی شامل `app-release.apk` و `app-release.aab` هم هست.

## روش ۲ — ساخت روی ویندوز خودتان (Android Studio)

```
cd frontend
npm install
npm run mobile:android      # build + sync + باز شدن Android Studio
```
در Android Studio: **Build ← Build App Bundle(s) / APK(s) ← Build APK(s)**.
یا بدون باز کردن Android Studio: `cd android && gradlew.bat assembleDebug` ← خروجی در `android/app/build/outputs/apk/debug/`.

## iOS — نکات مهم

- ساخت اپ iOS **فقط روی macOS با Xcode** ممکن است؛ workflow بالا این کار را روی مک‌های GitHub انجام می‌دهد.
- IPA بدون امضا مستقیم روی آیفون نصب نمی‌شود. گزینه‌ها:
  - **Sideloadly / AltStore** روی ویندوز: IPA را با Apple ID شخصی امضا و نصب می‌کند (رایگان، اعتبار ۷ روزه، برای تست).
  - **حساب Apple Developer** (سالانه ۹۹ دلار) برای TestFlight/App Store — برای حساب‌های ایرانی معمولاً محدودیت تحریم وجود دارد.
  - فروشگاه‌های ایرانی iOS (مثل سیبچه/اناردونی) که امضا را خودشان انجام می‌دهند.
  - جایگزین کم‌هزینه: همان **PWA** (Safari ← Share ← Add to Home Screen) که از قبل آماده است.
- اگر حساب Developer گرفتید، روی مک: `npm run mobile:ios` ← در Xcode تیم امضا را انتخاب ← Product ← Archive.

## پیش‌نیازهای سمت سرور (بدون این‌ها اپ لاگین نمی‌کند)

1. **سرور API با HTTPS** روی `api.barouco.ir` (یا هر آدرسی که در `.env.mobile` بگذارید) که مسیرهای `/api/<service>` را مثل Ingress به میکروسرویس‌ها برساند.
   ⚠️ هاست اشتراکی DirectAdmin/cPanel معمولاً **Node.js دائمی، PostgreSQL، Redis/RabbitMQ و Docker** را پشتیبانی نمی‌کند، پس بک‌اند NestJS روی آن اجرا نمی‌شود. دامنه‌ی `barouco.ir` قابل استفاده است، ولی بک‌اند به یک **VPS** (یا سرور ابری با Docker/K8s) نیاز دارد؛ فقط یک رکورد DNS از نوع A برای `api.barouco.ir` در DirectAdmin به IP آن VPS بسازید.
2. **CORS**: متغیر `CORS_ORIGIN` همه‌ی سرویس‌ها باید مبدأهای اپ را هم بپذیرد:
   - اندروید: `https://localhost`
   - iOS: `capacitor://localhost`
3. نوتیفیکیشن Push داخل اپ نیتیو از Web Push پشتیبانی نمی‌کند؛ برای Push واقعی باید `@capacitor/push-notifications` + Firebase (اندروید) / APNs (iOS) اضافه شود — هنوز انجام نشده.

## وضعیت تأیید

- انجام‌شده واقعی: `npm install` + `tsc -b` (صفر خطا) + `vite build --mode mobile` (آدرس API در باندل، بدون service worker) + `cap add android/ios` + `cap sync` + ساخت آیکون‌ها + `oxlint` (فقط ۲ هشدار قدیمی).
- **انجام نشده**: اجرای Gradle/Xcode. محیط ابری که این کار در آن انجام شد به مخازن Google/Maven دسترسی نداشت، پس خود APK آن‌جا ساخته نشد؛ اولین ساخت واقعی در GitHub Actions یا Android Studio انجام می‌شود.
