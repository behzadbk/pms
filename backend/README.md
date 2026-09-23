# backend/ — میکروسرویس‌های PMS

## وضعیت این پوشه
هر ۶ سرویس ساخته، build و smoke-test شده‌اند (اجرای واقعی `node dist/main.js` بدون
PostgreSQL/RabbitMQ/Redis در دسترس — رفتار مورد انتظار: بالا می‌آید، مسیرهای HTTP را
map می‌کند، و فقط تلاش اتصال به دیتابیس/صف با خطا retry می‌شود؛ این دقیقاً رفتاری
است که در Kubernetes باعث می‌شود Pod تا آماده‌شدن وابستگی‌ها Ready نشود).

| سرویس | نقش | دامنه پیاده‌سازی‌شده |
|---|---|---|
| `identity-service` | Auth مرکزی، صدور JWT | login، RLS، RBAC — سرویس مرجع الگو |
| `property-service` | واحدها/ساختمان‌ها | CRUD واحد + سرور gRPC واقعی (`UnitService`) برای بقیه سرویس‌ها |
| `facility-service` | رزرو مشاعات | تقویم، `booking_rules`، الگوریتم کامل `checkBookingRules`، gRPC Client به property-svc |
| `finance-service` | شارژ و پرداخت | صدور شارژ، پرداخت/webhook، مصرف‌کننده `reservation.*` |
| `guard-service` | نگهبانی | کد مهمان (صدور/تایید/check-in)، مرسولات، WebSocket Gateway زنده |
| `notification-service` | اعلانات | مصرف‌کننده Topic Exchange، صف BullMQ، Worker شبیه‌سازی SMS/Push/Email |

## معماری رویداد — نکته مهم پیاده‌سازی
`@nestjs/microservices` نسخه نصب‌شده از publish/bind روی یک Topic Exchange دلخواه
پشتیبانی نمی‌کند (فقط queue ساده). به همین دلیل انتشار و مصرف رویداد در همه سرویس‌ها
مستقیماً با `amqp-connection-manager` پیاده‌سازی شده (`src/events/events.service.ts`
برای انتشار؛ `notification-service/src/notifications/notification-events.consumer.ts`
و `finance-service/src/events-consumer/reservation-events.consumer.ts` برای مصرف) —
نه با `app.connectMicroservice(Transport.RMQ)`. این تصمیم و دلیل کامل آن در بالای
هر `events.service.ts` مستند شده است.

## ساخت سرویس هفتم (الگو برای توسعه بیشتر)
1. `npx @nestjs/cli new <service-name>` در `backend/`
2. کپی `identity-service/src/{database,health,auth}` — این سه ماژول (RLS، health probe،
   verify-only JWT) بین همه سرویس‌ها یکسان است؛ فقط `identity-service/src/auth` نسخه‌ای
   دارد که علاوه‌بر verify، `login` هم صادر می‌کند — بقیه سرویس‌ها فقط verify می‌کنند.
3. اگر سرویس باید رویداد منتشر کند: کپی `identity-service/src/events/`
4. اگر باید رویداد مصرف کند: الگوی `finance-service/src/events-consumer/reservation-events.consumer.ts`
   را برای exchange/pattern دلخواه تطبیق دهید
5. افزودن migration RLS در `prisma/migrations/001_enable_rls.sql` (نمونه در هر ۶ سرویس موجود)
6. `infra/docker/Dockerfile.nestjs` عمومی با `--build-arg SERVICE_PATH=backend/<service-name>`
   — نیازی به Dockerfile اختصاصی نیست
7. کپی `infra/k8s/base/deployment-service.template.yaml` و `migration-job.template.yaml`

## اجرای هر سرویس به‌صورت محلی
```bash
cd backend/<service-name>
cp .env.example .env   # و مقداردهی DATABASE_URL/JWT_SECRET واقعی
npm install
npm run start:dev
```
نیازمند PostgreSQL (`DATABASE_URL`)؛ RabbitMQ و Redis (فقط notification-service) اختیاری
برای بالا آمدن — بدون آن‌ها هم اجرا می‌شود، فقط اتصال صف/رویداد retry می‌کند.

## نکته دیسک هنگام نصب محلی همه سرویس‌ها
هر `node_modules` این سرویس‌ها ~۱ تا ۱.۵ گیگابایت است. اگر همه ۶ سرویس را هم‌زمان
نصب کنید (~۸ گیگابایت مجموع)، در محیط‌های محدود ممکن است به مشکل فضای دیسک بخورید —
نصب/build/حذف یکی‌یکی، یا استفاده از Docker به‌جای نصب محلی همه، توصیه می‌شود.
