# معماری نسخه تجاری SaaS — سامانه مدیریت مجتمع‌های مسکونی

نسخه ۱.۰ — نگاشت معماری Microservices، استراتژی Multi-tenant، و طراحی پنل Super-Admin.
تکمیل‌کننده `docs/SPEC.md` (مدل داده و API تک‌سرویسی اولیه) و `docs/FEATURES-DEEP-DIVE.md`.

---

## ۱. نمای کلی معماری

```
                          ┌─────────────────────────┐
   کلاینت (PWA وب/موبایل) │   Nginx Ingress Controller│  ← مسیریابی بر اساس path prefix
                          └────────────┬────────────┘
        /api/identity/*   /api/property/*   /api/facility/*   /api/finance/*   /api/guard/*
              │                 │                │                │              │
        ┌─────▼─────┐   ┌───────▼──────┐  ┌──────▼──────┐  ┌──────▼──────┐ ┌─────▼─────┐
        │ identity- │   │  property-   │  │  facility-  │  │  finance-   │ │  guard-   │
        │   svc     │   │     svc      │  │     svc     │  │     svc     │ │    svc    │
        └─────┬─────┘   └───────┬──────┘  └──────┬──────┘  └──────┬──────┘ └─────┬─────┘
              │                 │                │                │              │
              └─────────────────┴───── gRPC (sync, internal) ─────┴──────────────┘
              │
              └──────────────── RabbitMQ topic exchange `pms.events` (async) ─────┐
                                                                                    │
                                                                          ┌─────────▼─────────┐
                                                                          │ notification-svc   │
                                                                          │ (BullMQ + Redis)   │
                                                                          └────────────────────┘

   یک PostgreSQL cluster مشترک (Shared DB, هر سرویس یک schema اختصاصی + RLS برای جداسازی tenant)
   یک Redis cluster مشترک (کش، صف BullMQ، Socket.io adapter، Redlock)
```

چرا API Gateway اختصاصی (مثل Kong) در MVP نداریم: مسیریابی مبتنی بر path prefix در Nginx Ingress برای این تعداد سرویس کافی است و یک نقطه شکست/نگهداری کمتر اضافه می‌کند. اگر بعداً نیاز به rate-limiting متمرکز، API key management برای پارتنرها، یا request transformation پیچیده شد، یک BFF سبک (NestJS) یا Kong به‌عنوان لایه اضافه می‌شود — نه پیش از نیاز واقعی.

---

## ۲. تفکیک Microservices

| سرویس | مالکیت داده (schema) | ارتباط ورودی (از کلاینت) | ارتباط داخلی sync (gRPC) | رویدادهای async (RabbitMQ) |
|---|---|---|---|---|
| **identity-svc** | `identity`: tenants, users, roles, refresh_tokens | REST: login, refresh, me | متد `ValidateToken`, `GetUserRole` (فراخوانی‌شونده توسط بقیه) | publish: `user.created`, `tenant.created`, `user.role_changed` |
| **property-svc** | `property`: buildings, blocks, units, user_unit_links, vehicles, lease_contracts | REST: CRUD واحد/ساختمان | متد `GetUnitById`, `GetUnitOwnerUserId` (فراخوانی‌شونده توسط finance/facility/guard) | publish: `unit.created`, `lease.expiring_soon` |
| **facility-svc** | `facility`: amenities, booking_rules, amenity_sessions, reservations, maintenance_windows | REST: تقویم، رزرو؛ WS: به‌روزرسانی زنده تقویم | فراخوانی `property-svc.GetUnitById` برای اعتبارسنجی واحد | publish: `reservation.created`, `reservation.cancelled`, `reservation.approved` |
| **finance-svc** | `finance`: charge_formulas, monthly_charges, invoices, transactions, wallets, payments, receipts | REST: شارژ، پرداخت، صورتحساب؛ webhook درگاه | فراخوانی `property-svc.ListUnits` (صدور شارژ ماهانه) | publish: `payment.succeeded`, `charge.overdue`; subscribe: `reservation.approved` (برای صدور فاکتور بیعانه) |
| **guard-svc** | `guard`: guest_passes, guest_visit_logs, parcels, vehicle_traffic_logs, guard_logs | REST + WS: پنل نگهبانی Realtime | فراخوانی `property-svc.GetUnitOwnerUserId` (برای اعلان) | publish: `guest.checked_in`, `parcel.received`, `vehicle.logged` |
| **notification-svc** | `notification`: templates, delivery_log (بدون داده دامنه‌ای دیگر) | ندارد (فقط داخلی) | ندارد (فقط مصرف‌کننده) | subscribe: همه رویدادهای بالا → صف BullMQ → ارسال SMS/Push/Email |

### چرا gRPC برای داخلی و REST برای بیرونی؟
- **REST بیرونی**: کلاینت‌های وب/موبایل/Postman و مستندسازی OpenAPI ساده‌تر؛ سازگاری با کش HTTP و Ingress.
- **gRPC داخلی**: تماس‌های sync بین سرویس‌ها (مثل «آیا این واحد معتبر است؟») باید latency پایین و type-safety (از طریق `.proto`) داشته باشند؛ برخلاف event، اینجا پاسخ فوری لازم است و REST/JSON overhead بی‌مورد است.
- **RabbitMQ برای async**: رویدادهایی که چند مصرف‌کننده دارند یا نباید مسیر اصلی درخواست را کند کنند (مثل ارسال پیامک بعد از پرداخت) — Publisher منتظر Consumer نمی‌ماند؛ Topic Exchange `pms.events` با routing key به شکل `<domain>.<event>` (مثل `payment.succeeded`) به هر سرویس اجازه subscribe انتخابی می‌دهد.

### قرارداد Event مشترک (envelope استاندارد روی RabbitMQ)
```json
{
  "event_id": "uuid",
  "event_type": "payment.succeeded",
  "tenant_id": "uuid",
  "occurred_at": "2026-09-02T10:00:00Z",
  "payload": { "...": "..." },
  "trace_id": "uuid"   // برای پیگیری end-to-end در لاگ‌ها
}
```

---

## ۳. استراتژی Multi-tenancy (Row-Level Security)

### تصمیم: Shared Database + Shared Schema + RLS (نه Database-per-tenant)
برای مقیاس اولیه SaaS (ده‌ها تا چند صد مجتمع)، مدل RLS ساده‌ترین مدل عملیاتی است (یک migration، یک backup، یک connection pool). اگر یک مشتری بزرگ (Enterprise) به ایزوله‌سازی فیزیکی نیاز داشت، مسیر ارتقا به schema-per-tenant یا database-per-tenant برای همان یک مشتری باز می‌ماند، بدون تغییر در بقیه سیستم.

### پیاده‌سازی RLS در PostgreSQL

```sql
-- هر جدول دامنه‌ای، ستون tenant_id دارد (tenant = building/complex در این محصول)
ALTER TABLE monthly_charges ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON monthly_charges
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- یک اپراتور سطح دیتابیس (superuser/owner) از RLS معاف است؛
-- اپلیکیشن باید با یک نقش محدود (app_user) به دیتابیس وصل شود که BYPASSRLS ندارد.
```

### تزریق tenant_id در هر Request (سطح NestJS)

```typescript
// tenant.middleware.ts — بعد از اعتبارسنجی JWT، پیش از رسیدن به هر Handler
@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  async use(req: Request, res: Response, next: NextFunction) {
    const tenantId = req.user?.tenant_id // از JWT claim
    if (!tenantId) throw new UnauthorizedException()

    // هر Request باید در یک تراکنش دیتابیس اجرا شود که ابتدا tenant را ست می‌کند
    req.dbTransaction = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${tenantId}'`)
      return tx
    })
    next()
  }
}
```

نکات حیاتی عملیاتی:
- `SET LOCAL` فقط در محدوده همان تراکنش معتبر است — پس هر Request باید در یک تراکنش دیتابیس بسته‌بندی شود، نه یک Connection بلندمدت مشترک (مهم هنگام استفاده از PgBouncer در حالت `transaction pooling`؛ حالت `session pooling` برای این الگو مناسب‌تر یا نیاز به تنظیم دقیق‌تر دارد).
- `super_admin` (پنل SaaS) یک نقش دیتابیسی جدا با `BYPASSRLS` محدود به query‌های cross-tenant گزارش‌گیری دارد؛ هرگز از همان اتصال اپلیکیشن معمولی استفاده نمی‌کند.
- تست خودکار (CI) باید شامل یک تست باشد که تأیید کند کاربر Tenant A هرگز نمی‌تواند رکورد Tenant B را حتی با تغییر دستی ID در URL بخواند (تست IDOR در سطح RLS، نه فقط در سطح Controller).

---

## ۴. جلوگیری از Race Condition در رزرو مشاعات (تکمیل بخش ۷.۱ سند قبلی)

دو لایه دفاعی مکمل هم (نه جایگزین هم):

1. **Redis Distributed Lock (Redlock)** پیش از اجرای `validateReservation`:
   ```
   lockKey = "lock:amenity:{amenityId}:{slotStart}-{slotEnd}"
   acquire lock (TTL=5s) → اجرای validate + insert → release lock
   ```
   این لایه اکثر برخوردهای هم‌زمان را در همان لحظه با پیام کاربرپسند رد می‌کند (UX سریع).

2. **PostgreSQL Exclusion Constraint** (ضامن نهایی صحت داده، حتی اگر لایه ۱ به هر دلیل عبور کند):
   ```sql
   CREATE EXTENSION IF NOT EXISTS btree_gist;

   ALTER TABLE reservations
     ADD CONSTRAINT no_overlapping_reservations
     EXCLUDE USING gist (
       amenity_id WITH =,
       tstzrange(start_at, end_at) WITH &&
     ) WHERE (status IN ('confirmed', 'pending_approval'));
   ```
   اگر Insert همزمان دومی از لایه ۱ عبور کند (مثلاً به‌خاطر خرابی موقت Redis)، دیتابیس با خطای Constraint Violation آن را رد می‌کند و سرویس پاسخ ۴۰۹ برمی‌گرداند.

---

## ۵. پنل Super-Admin (مدیریت SaaS)

نقش جدید و مجزا از ۴ نقش موجود (Admin/Resident/Guard/Staff که همگی «داخل یک tenant» عمل می‌کنند). Super-Admin در سطح فراتر از tenant قرار دارد و تنها متعلق به شرکت ارائه‌دهنده محصول است.

### قابلیت‌ها
- **مدیریت Tenants**: ایجاد/تعلیق/حذف مجتمع مشتری، تعیین پلن اشتراک، مشاهده تعداد واحد/کاربر فعال هر tenant.
- **پلن‌های اشتراک (Subscription Plans)**: تعریف پلن (تعداد واحد مجاز، ماژول‌های فعال، قیمت ماهانه/سالانه)، تمدید خودکار، هشدار انقضا.
- **تراکنش‌های کل سیستم**: صورتحساب SaaS به هر tenant (جدا از دفترداری داخلی خود ساختمان که در finance-svc است) — این یک `platform_billing` schema مجزا در identity-svc یا یک billing-svc سبک جداگانه است، **نه** بخشی از `finance-svc` (چون finance-svc داده مالی خود ساختمان را نگه می‌دارد، نه رابطه تجاری شرکت با مشتری).
- **مشاهده Health/Usage**: تعداد رزرو/تیکت/پرداخت هر tenant در بازه اخیر (Read-only، از طریق یک Read Replica یا Materialized View تجمیعی، برای اینکه بار گزارش‌گیری روی دیتابیس عملیاتی اثر نگذارد).

### مدل داده (schema جدید: `platform`)
```
platform_tenants
  id, name, subdomain, status enum(active, suspended, trial, cancelled),
  plan_id -> platform_plans, created_at, unit_count_limit

platform_plans
  id, name, monthly_price, max_units, included_modules[]

platform_subscriptions
  id, tenant_id -> platform_tenants, plan_id -> platform_plans,
  status enum(active, past_due, cancelled), current_period_end, gateway_customer_id

platform_invoices
  id, tenant_id -> platform_tenants, amount, period, status, paid_at
```

این schema به‌طور طبیعی باید در **identity-svc گسترش یابد** (چون identity-svc از قبل مالک مفهوم Tenant است) یا در فاز رشد به یک `billing-svc` مستقل تفکیک شود؛ برای MVP، افزودن به identity-svc از overhead یک سرویس جدید جلوگیری می‌کند.

---

## ۶. تبدیل فرانت‌اند به PWA

- **ابزار**: `vite-plugin-pwa` (بر پایه Workbox) — تولید خودکار `manifest.json` و service worker از کانفیگ Vite، بدون نیاز به نوشتن دستی service worker.
- **استراتژی کش**:
  - Assets استاتیک (JS/CSS/فونت): `CacheFirst` (تغییر نمی‌کنند چون فایل‌نام‌ها hash دارند)
  - درخواست‌های GET به API (مثل تقویم، لیست شارژ): `NetworkFirst` با fallback به کش برای Offline محدود
  - صفحه اصلی: `NetworkFirst` با یک صفحه Offline سفارشی در صورت شکست کامل اتصال
- **نصب روی گوشی**: `manifest.json` با آیکون‌های ۱۹۲/۵۱۲px، `display: standalone`، `theme_color` هماهنگ با پالت طراحی فعلی (navy `#16324F`).
- **Push Notification**: در PWA (به‌ویژه iOS 16.4+) از Web Push API + یک Service Worker `push` event handler استفاده می‌شود؛ سرور (notification-svc) با VAPID keys به Push Service مرورگر پیام می‌فرستد. برای iOS، PWA باید از طریق «Add to Home Screen» نصب شده باشد تا Push کار کند — این محدودیت پلتفرم است، نه پیاده‌سازی.
- جزئیات پیاده‌سازی واقعی (کد) در ادامه همین تحویل، در پروژه `frontend/` اعمال شده است.

---

## ۷. زیرساخت K8s و CI/CD — خلاصه تصمیمات

جزئیات کامل YAML/Dockerfile در پوشه‌های `infra/docker/` و `infra/k8s/` است. خلاصه تصمیمات معماری زیرساخت:

- **Dockerize**: هر NestJS service یک Multi-stage Dockerfile مشترک الگو دارد (build stage با devDependencies → runtime stage فقط با production deps و خروجی `dist/`)؛ Frontend PWA در stage build با Vite ساخته و در stage نهایی توسط Nginx سرو می‌شود.
- **Database**: توصیه اصلی برای Production، **Managed PostgreSQL** (مثل RDS/Cloud SQL/Neon) به‌جای StatefulSet خودگردان در K8s — نگهداری backup/HA/patching دیتابیس stateful در K8s هزینه عملیاتی بالایی دارد که در فاز اولیه توجیه ندارد. یک مانیفست StatefulSet جایگزین (برای محیط self-hosted/on-premise) هم ارائه شده.
- **Migrations**: یک K8s `Job` (نه بخشی از Deployment) که پیش از rollout جدید یک‌بار `prisma migrate deploy` را اجرا می‌کند؛ Deployment با `initContainers` یا یک مرحله جدا در CI/CD منتظر موفقیت این Job می‌ماند.
- **Ingress**: یک Ingress با مسیرهای `/api/identity`, `/api/property`, `/api/facility`, `/api/finance`, `/api/guard` به Service مربوطه، و `/` به frontend PWA.
- **Secrets**: مقادیر حساس (connection string دیتابیس، JWT signing key، کلید درگاه پرداخت) در K8s `Secret` (نه ConfigMap)؛ در Production واقعی توصیه به External Secrets Operator + Vault/Cloud Secret Manager به‌جای Secret خام در manifest.
- **CI/CD**: هر push به `main` → تست → build ایمیج → push به Registry با تگ `git-sha` → apply مانیفست K8s با `kubectl set image` (یا Helm در فاز بعد برای مدیریت نسخه‌های چندگانه).
