# identity-service (سرویس مرجع)

این سرویس یک پیاده‌سازی **واقعی و build-شده** از الگوی معماری تعریف‌شده در
`docs/ARCHITECTURE-SAAS.md` است — نه صرفاً یک اسکلت خالی. هدف آن نشان‌دادن ۴ الگوی
اصلی است که باید در هر ۵ سرویس دیگر (property, facility, finance, guard, notification)
هم عیناً تکرار شود:

1. **الگوی RLS Multi-tenant** — `src/database/database.service.ts` متد `withTenant()`
   را پیاده‌سازی می‌کند: هر Query داخل یک تراکنش با `SET LOCAL app.current_tenant_id`
   اجرا می‌شود. `prisma/migrations/001_enable_rls.sql` Policy مربوطه را در دیتابیس می‌سازد.
2. **Auth + RBAC** — `src/auth/`: JWT Strategy، `@Public()` برای مسیرهای بدون احراز هویت
   (health، login)، `@Roles()` + `RolesGuard` برای کنترل دسترسی نقش‌محور مکمل RLS.
3. **انتشار Event روی RabbitMQ** — `src/events/events.service.ts` envelope استاندارد
   سند معماری (`event_id`, `event_type`, `tenant_id`, `trace_id`) را می‌سازد و روی
   Topic Exchange مشترک `pms.events` منتشر می‌کند.
4. **Health Probes برای K8s** — `src/health/`: `/health/live` و `/health/ready`
   (این دو مسیر دقیقاً همان‌هایی هستند که در `infra/k8s/base/deployment.identity-svc.yaml`
   به‌عنوان livenessProbe/readinessProbe استفاده شده‌اند).

## چرا `pg` به‌جای `@prisma/client` در کد اجراشونده؟
`prisma/schema.prisma` به‌عنوان مستند مرجع مدل داده نگه داشته شده (و در Production باید
با `prisma generate` واقعی استفاده شود)، اما کد اجراشونده این تحویل عمداً از پکیج `pg`
مستقیم استفاده می‌کند تا بدون نیاز به دانلود Prisma Engine Binary (که در برخی
شبکه‌های محدود/CI Runner در دسترس نیست) قابل `npm run build` و اجرا باشد. منطق RLS و
تراکنش در هر دو حالت کاملاً یکسان است — فقط لایه I/O متفاوت است.

## اجرا (Local)
```bash
cp .env.example .env    # مقادیر واقعی DATABASE_URL و RABBITMQ_URL را ست کنید
npm install
npm run build
npm run start:dev
```
بدون PostgreSQL و RabbitMQ در دسترس، سرویس بالا می‌آید ولی `/health/ready` و اتصال
RabbitMQ خطا می‌دهند (رفتار صحیح و مورد انتظار — دقیقاً همین رفتار در K8s باعث می‌شود
Pod تا وصل‌شدن دیتابیس، Ready علامت‌گذاری نشود و ترافیک نگیرد).

## نسخه‌سازی برای بقیه سرویس‌ها
برای ساخت `property-service`، `facility-service` و... همین پوشه را کپی کنید،
`DatabaseModule`/`HealthModule`/الگوی Auth را نگه دارید، و فقط ماژول‌های دامنه‌ای
(`users` در اینجا) را با ماژول‌های واقعی آن سرویس (مثلاً `units`, `reservations`)
جایگزین کنید. مدل داده هر سرویس در `docs/SPEC.md` و `docs/FEATURES-DEEP-DIVE.md`
مستند شده است.
