# ماژول‌های جدید — Audit Logging، سفارش غذای مشاعات، و ری‌دیزاین Liquid Glass

نسخه ۱.۰ — تکمیل‌کننده `docs/ARCHITECTURE-SAAS.md`. سند طراحی (Architecture/Schema/API/UI)، نه پیاده‌سازی — کد در صورت درخواست جداگانه اضافه می‌شود.

---

## ۱. معماری سیستم و جریان داده

### ۱.۱ سرویس‌های جدید (سازگار با الگوی ۶ میکروسرویس موجود)

| سرویس جدید | مالکیت داده | دلیل تفکیک |
|---|---|---|
| **audit-log-svc** | MongoDB: `logs` (append-only) | حجم نوشتار بسیار بالا و schema انعطاف‌پذیر؛ نباید روی PostgreSQL تراکنشی اصلی فشار بیاورد |
| **amenity-order-svc** | PostgreSQL schema `amenity_order`: menu, orders | دامنه تجاری مجزا از facility-svc (رزرو ≠ سفارش)؛ اما برای zoneهای تحویل به amenities از facility-svc می‌خواند (gRPC) |

### ۱.۲ Non-blocking Logging — جریان داده

```
[هر سرویس / کلاینت موبایل]
      │  (async, fire-and-forget — هرگز منتظر پاسخ نمی‌ماند)
      ▼
POST /logs/ingest  →  audit-log-svc  →  صف داخلی (BullMQ) → Batch insert به MongoDB
      │
      └─ اگر audit-log-svc یا MongoDB پایین باشد: پیام در صف Redis باقی می‌ماند
         (Retry با backoff)؛ درخواست اصلی کاربر هرگز block یا fail نمی‌شود.
```
اصل کلیدی: **لاگ‌گیری هرگز نباید مسیر اصلی درخواست را کند یا متوقف کند.** به همین دلیل:
- کلاینت/سرویس فراخوان، پاسخ `202 Accepted` را بدون انتظار برای نوشتن واقعی دریافت می‌کند.
- Batch insert (هر ۵۰۰ رکورد یا هر ۲ ثانیه، هرکدام زودتر) به‌جای insert تک‌به‌تک — کاهش فشار I/O.
- هر رویداد دامنه‌ای که سرویس‌های دیگر روی `pms.events` منتشر می‌کنند (بخش ۲ سند معماری اصلی) هم به‌صورت موازی توسط audit-log-svc مصرف و لاگ می‌شود — یعنی نیازی نیست هر سرویس جداگانه audit-log-svc را صدا بزند؛ رویدادهای دامنه‌ای خودکار لاگ می‌شوند و فقط اکشن‌های UI/کلاینت (کلیک، ناوبری، خطای فرانت) از طریق `/logs/ingest` مستقیم ارسال می‌شوند.

### ۱.۳ Order Lifecycle — چرخه سفارش غذا

```
CART → PLACED → CONFIRMED (آشپزخانه) → PREPARING → READY
                                                       │
                                    ┌──────────────────┴──────────────────┐
                                    ▼                                     ▼
                       OUT_FOR_DELIVERY (In-Unit/Zone)         AWAITING_PICKUP (Zone self-serve)
                                    │                                     │
                                    ▼                                     ▼
                              DELIVERED  ─────────────────────────►  COMPLETED
                                    │
                         (در هر مرحله) CANCELLED — با ثبت دلیل و بازگشت وجه در صورت پرداخت آنلاین
```
- هر تغییر state → `PATCH /orders/{id}/status` → رویداد `order.status_changed` روی `pms.events` منتشر می‌شود → **WebSocket** (همان الگوی `GuardGateway` در guard-svc) بلادرنگ به داشبورد آشپزخانه و اپ کاربر push می‌کند.
- Realtime موجودی منو هم از همین الگو استفاده می‌کند: `PATCH /menu-items/{id}/availability` → رویداد `menu.item.updated` → WebSocket broadcast به همه کلاینت‌های در حال مرور منو (بدون رفرش صفحه).

---

## ۲. مدل داده (Database Schema)

### ۲.۱ Logs — MongoDB (`audit-log-svc`)

```javascript
// Collection: logs  — Index: { trace_id: 1, sequence: 1 }, { tenant_id: 1, timestamp: -1 }, TTL index روی timestamp (مثلاً ۹۰ روز)
{
  _id: ObjectId,
  trace_id: "uuid",        // برای زنجیره‌سازی رویدادهای مرتبط با یک session/درخواست
  sequence: 10234,          // شمارنده سراسری صعودی — پایه Event Chaining (بخش ۱.۳ پایین)
  tenant_id: "uuid" | null,
  user_id: "uuid" | null,
  session_id: "uuid",
  timestamp: ISODate,
  action: "order.place" | "menu.view" | "auth.login" | "ui.click" | "...",
  entity_type: "order" | "reservation" | "charge" | "...",
  entity_id: "uuid" | null,
  device: {
    platform: "iOS" | "Android" | "Web",
    os_version: "17.4",
    browser: "Safari" | "Chrome" | null,
    app_version: "2.3.1",
    device_model: "iPhone15,3" | null,
  },
  request: { method: "POST", path: "/orders", payload_summary: {...} },
  response: { status: 201, duration_ms: 142, error: null },
  level: "info" | "warn" | "error",
}
```
چرا MongoDB نه PostgreSQL: نوشتار حجیم و پرتکرار، schema متغیر بین انواع action، و نیازی به JOIN رابطه‌ای ندارد — دقیقاً کاربرد کلاسیک NoSQL. `sequence` عددی سراسری (نه فقط timestamp) تضمین می‌کند ترتیب دقیق رویدادها حتی در milliseconds برابر حفظ شود — پایه بازیابی «۵۰ تا ۱۰۰ رویداد قبل از یک باگ».

### ۲.۲ Menu / Amenity Zones / Orders — PostgreSQL (schema: `amenity_order`)

```
vendors                      -- رستوران‌ها/فروشندگان داخل مجتمع
  id, tenant_id, name, is_active, prep_time_minutes_avg

menu_categories
  id, vendor_id -> vendors, name, sort_order

menu_items
  id, vendor_id -> vendors, category_id -> menu_categories,
  name, description, price, photo_url,
  availability enum(available, sold_out), 
  availability_updated_at, availability_updated_by -> users

delivery_zones                -- "In-Unit" و zoneهای مشاع (استخر، سینما، باشگاه)
  id, tenant_id, type enum(in_unit, amenity_zone),
  amenity_id -> amenities (nullable, ارجاع gRPC به facility-svc در صورت amenity_zone),
  label, is_active

orders
  id, tenant_id, unit_id, ordered_by -> users,
  vendor_id -> vendors, delivery_zone_id -> delivery_zones,
  zone_detail (nullable, مثلاً "لانگ‌چیر شماره ۱۲" داخل استخر),
  status enum(placed, confirmed, preparing, ready, out_for_delivery, awaiting_pickup, delivered, completed, cancelled),
  subtotal, delivery_fee, total, payment_status enum(pending, paid, refunded),
  placed_at, estimated_ready_at, cancelled_reason

order_items
  id, order_id -> orders, menu_item_id -> menu_items,
  quantity, unit_price, notes

order_status_history            -- برای Audit سفارش (جدا از audit-log-svc، چون این تاریخچه تجاری است نه لاگ فنی)
  id, order_id -> orders, status, changed_by -> users, changed_at
```

---

## ۳. API اصلی

### Logging
```
POST /logs/ingest                  -- fire-and-forget، پاسخ فوری 202
GET  /logs/search?tenant_id=&user_id=&action=&level=&from=&to=&page=
GET  /logs/context/{trace_id}?before=50&after=50
     -- بازیابی ۵۰ رویداد قبل و ۵۰ رویداد بعد از یک trace_id بر اساس sequence سراسری
     -- (نه timestamp) برای بازسازی دقیق زنجیره رویدادهای منجر به یک باگ
```

### منو و موجودی Real-time
```
GET   /vendors/{id}/menu
PATCH /menu-items/{id}/availability     body: { availability: "sold_out" }
WS    room: menu:{vendorId}             event: menu.item.updated
```

### سفارش‌گذاری
```
GET  /delivery-zones?tenant_id=
POST /orders             body: { vendorId, deliveryZoneId, zoneDetail?, items: [{menuItemId, qty}] }
GET  /orders/{id}
PATCH /orders/{id}/status   body: { status }      -- توسط آشپزخانه/نگهبانی
GET  /units/{unitId}/orders?status=
WS   room: kitchen:{vendorId}           event: order.status_changed
WS   room: unit:{unitId}                event: order.status_changed
```
قواعد کلی (auth، pagination، Idempotency-Key، فرمت خطا) طبق بخش ۵ سند `docs/SPEC.md` عیناً روی این Endpointها هم اعمال می‌شود.

---

## ۴. UI/UX و سیستم رنگ

### ۴.۱ زبان طراحی — Liquid Glass

| پارامتر | مقدار |
|---|---|
| Backdrop blur | `blur(24px) saturate(160%)` روی لایه‌های شناور (کارت سفارش، مودال، نوار پایین) |
| ضخامت لبه شیشه | `1px solid` با رنگ `--glass-border` (زیر) + یک `inset` highlight ظریف بالا-چپ برای شبیه‌سازی انعکاس نور |
| شعاع گوشه | مقیاس ۱۲ / ۲۰ / ۲۸px (کارت کوچک / کارت اصلی / Sheet تمام‌صفحه) |
| سایه | چندلایه، پخش‌شده و نرم: `0 8px 32px rgba(0,0,0,.12), 0 1px 1px rgba(255,255,255,.4) inset` |
| انیمیشن | Spring نه Ease — `type: spring, stiffness: 300, damping: 28` (framer-motion، همان کتابخانه فعلاً نصب‌شده در فرانت‌اند) برای ورود Sheet/کارت؛ `stiffness: 500, damping: 30` برای تعامل لمسی سریع (toggle موجودی) |
| حرکت پس‌زمینه | گرادیان‌های محو نور (`radial-gradient`) که با اسکرول یا Parallax لایه‌ای خفیف جابه‌جا می‌شوند — عمق بصری بدون افت کارایی |

### ۴.۲ پالت رنگ — Light / Dark (HEX دقیق)

| Token | نقش | Light | Dark |
|---|---|---|---|
| `--color-bg` | پس‌زمینه صفحه | `#F4F6F8` | `#0B141C` |
| `--color-surface` | سطح کارت غیرشیشه‌ای (fallback) | `#FFFFFF` | `#101B24` |
| `--color-glass-tint` | تینت پایه پنل شیشه‌ای | `rgba(255,255,255,0.45)` | `rgba(20,32,42,0.45)` |
| `--color-glass-border` | لبه پنل شیشه‌ای | `rgba(255,255,255,0.65)` | `rgba(255,255,255,0.10)` |
| `--color-primary` | برند اصلی، CTA اولیه | `#0E6E68` | `#3BC9C1` |
| `--color-primary-ink` | متن روی primary روشن | `#FFFFFF` | `#04211E` |
| `--color-accent` | لهجه لوکس (طلایی مات) | `#B8912F` | `#E4C567` |
| `--color-text-primary` | متن اصلی | `#10202B` | `#EAF2F2` |
| `--color-text-muted` | متن ثانویه | `#5B6B76` | `#8FA3AC` |
| `--color-success` | تایید/موجود | `#1E9E71` | `#3FD79A` |
| `--color-warning` | ناموجود/در انتظار | `#C08A2E` | `#E8B34A` |
| `--color-danger` | خطا/لغو | `#C1443A` | `#EF6A5D` |

نکته پیوستگی برند: `--color-primary` و `--color-accent` تکامل‌یافته همان `--color-tile` و `--color-brass` فعلی پروژه هستند (نه جایگزینی کامل) — هویت بصری موجود حفظ می‌شود، فقط برای عمق/شفافیت لازم حالت Glass تنظیم‌دقیق (fine-tune) شده‌اند.

### ۴.۳ مفهوم داشبورد ادمین (Logs & Kitchen)

- **Log Explorer**: نوار فیلتر شناور شیشه‌ای بالای صفحه (tenant/user/action/level/بازه زمانی) + جدول رویدادها با رنگ‌بندی `level` (خطا=قرمز کم‌رنگ، هشدار=کهربایی). کلیک روی هر ردیف → Panel کناری شیشه‌ای باز می‌شود و ۵۰ رویداد قبل/بعد را روی یک Timeline عمودی نشان می‌دهد (نقطه فعلی برجسته با halo رنگی).
- **Kitchen Board**: نمای Kanban شیشه‌ای با ستون‌های دقیقاً منطبق بر state machine بخش ۱.۳ (Placed → Confirmed → Preparing → Ready → …)؛ هر کارت سفارش با drag یا یک تپ به ستون بعد منتقل می‌شود و بلادرنگ (WebSocket) روی اپ ساکن هم به‌روز می‌شود. Toggle موجودی منو در یک پنل کناری جدا با سوییچ‌های بزرگ لمسی (Available/Sold Out) و بازتاب فوری روی همه کلاینت‌ها.

---

*این سند طراحی است. برای افزودن این سه ماژول به کد واقعی پروژه (مثل کاری که برای میکروسرویس‌های قبلی انجام شد)، درخواست جداگانه بدهید.*
