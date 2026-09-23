# به‌روزرسانی نسخه ۲ — Audit Logging، سفارش غذای مشاعات، و طراحی Liquid Glass

مکمل `docs/ARCHITECTURE-SAAS.md`. سه ماژول جدید، سازگار با همان معماری Multi-tenant (RLS) و Topic Exchange موجود.

---

## ۱. معماری سیستم و جریان داده

### ۱.۱ سرویس‌های جدید

| سرویس | مسئولیت | پورت | Schema |
|---|---|---|---|
| **audit-svc** | دریافت، ذخیره و جستجوی لاگ‌ها + بازسازی زنجیره رویداد | 3007 | `audit` |
| **fnb-svc** | منو، موجودی لحظه‌ای، سفارش، چرخه عمر آشپزخانه | 3008 | `fnb` |

### ۱.۲ جریان لاگ‌گیری غیرمسدودکننده (Non-blocking)

اصل طراحی: **لاگ‌گیری هرگز نباید مسیر درخواست کاربر را کند یا fail کند.**

```
کلاینت (PWA)                  هر میکروسرویس                    audit-svc
    │                              │                                │
    │ ── اکشن کاربر ──────────────▶│                                │
    │                              │ ① پاسخ فوری به کاربر ─────────▶│  (لاگ هنوز ننوشته)
    │◀─────────────────────────────│                                │
    │                              │ ② fire-and-forget به RabbitMQ  │
    │                              │    routingKey: audit.<domain>  │
    │                              └──────────────────────────────▶ │
    │                                                    ③ مصرف batch (هر ۱s یا ۵۰۰ رکورد)
    │ ── لاگ‌های سمت کلاینت ────────────────────────────────────────▶│  POST /audit/client-batch
    │    (بافر محلی، ارسال دسته‌ای هر ۱۰s یا هنگام unload)          │  ④ COPY دسته‌ای در Postgres
```

**تضمین‌های کلیدی:**
- انتشار لاگ در سرویس‌های مبدأ `await` **نمی‌شود** (`.catch()` فقط لاگ محلی می‌کند) — قطعی RabbitMQ باعث خطای کاربر نمی‌شود.
- audit-svc با `prefetch(500)` و درج دسته‌ای (`INSERT ... SELECT * FROM unnest(...)`) مصرف می‌کند، نه یک INSERT به‌ازای هر رکورد.
- کلاینت PWA لاگ‌ها را در یک بافر حافظه‌ای نگه می‌دارد و با `navigator.sendBeacon` هنگام بستن تب هم می‌فرستد (بدون از دست رفتن لاگ لحظه کرش).

### ۱.۳ Correlation برای زنجیره رویداد

هر درخواست از کلاینت یک `session_id` (پایدار در طول نشست) و `trace_id` (به‌ازای هر اکشن) حمل می‌کند. این دو در header (`X-Session-Id`, `X-Trace-Id`) به همه سرویس‌ها منتقل و در هر لاگ ذخیره می‌شوند — همین چیزی است که «۵۰ تا ۱۰۰ لاگ قبل از باگ» را قابل بازسازی می‌کند.

### ۱.۴ چرخه عمر سفارش غذا (Order Lifecycle)

```
draft ──▶ placed ──▶ accepted ──▶ preparing ──▶ ready ──▶ out_for_delivery ──▶ delivered
             │           │                                        │
             └─▶ rejected└─▶ cancelled                            └─▶ (فقط برای in_unit / amenity_zone)
```

- گذارهای مجاز در سرور اعتبارسنجی می‌شوند (state machine)، نه در کلاینت.
- هر گذار یک رویداد `order.<status>` روی `pms.events` منتشر می‌کند → notification-svc اعلان Push به ساکن می‌فرستد (بدون هیچ کد جدیدی در notification-svc جز افزودن `order.*` به BINDING_PATTERNS).
- موجودی: `placed` باعث **رزرو موقت** موجودی می‌شود؛ `rejected`/`cancelled` آن را آزاد می‌کند.

### ۱.۵ به‌روزرسانی لحظه‌ای موجودی

```
ادمین رستوران ──▶ PATCH /menu-items/:id/availability ──▶ fnb-svc
                                                            │
                                    ┌───────────────────────┤
                                    ▼                       ▼
                        WebSocket (namespace /fnb-live)   RabbitMQ menu.item.updated
                        room: tenant:{id}                 (برای audit + سایر مصرف‌کننده‌ها)
                                    │
                                    ▼
                        همه کلاینت‌های باز → به‌روزرسانی آنی بدون رفرش
```

Fallback برای کلاینت بدون WebSocket: `GET /menus/:id?since=<timestamp>` هر ۲۰ ثانیه.

---

## ۲. مدل داده (PostgreSQL)

همه جداول `tenant_id` + RLS Policy دارند (مطابق بخش ۳ سند معماری).

### ۲.۱ Schema `audit`

```sql
-- جدول اصلی لاگ — پارتیشن‌بندی ماهانه چون سریع‌ترین رشد را دارد
CREATE TABLE audit.event_logs (
  id            BIGSERIAL,
  tenant_id     UUID NOT NULL,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  session_id    UUID NOT NULL,        -- کلید بازسازی زنجیره
  trace_id      UUID,
  user_id       UUID,
  actor_role    TEXT,                 -- admin | resident | guard | staff | super_admin | system
  source        TEXT NOT NULL,        -- client | identity-svc | fnb-svc | ...
  level         TEXT NOT NULL,        -- debug | info | warn | error
  action        TEXT NOT NULL,        -- 'order.place', 'auth.login', 'reservation.create'
  http_method   TEXT,
  http_path     TEXT,
  status_code   INT,
  duration_ms   INT,
  device        JSONB,                -- { os, os_version, browser, browser_version, model, viewport, is_pwa }
  request_body  JSONB,                -- پس از عبور از redact (بخش ۲.۲)
  response_body JSONB,
  error_stack   TEXT,
  PRIMARY KEY (id, occurred_at)
) PARTITION BY RANGE (occurred_at);

CREATE INDEX ON audit.event_logs (tenant_id, occurred_at DESC);
CREATE INDEX ON audit.event_logs (session_id, occurred_at);   -- برای Event Chaining
CREATE INDEX ON audit.event_logs (tenant_id, level, occurred_at DESC) WHERE level IN ('warn','error');
CREATE INDEX ON audit.event_logs USING gin (device jsonb_path_ops);

-- نگهداری: پارتیشن‌های قدیمی‌تر از ۹۰ روز به Object Storage آرشیو و DROP می‌شوند (Cron Job).
```

**نکته امنیتی (`۲.۲ Redaction`):** پیش از درج، فیلدهای حساس (`password`, `token`, `authorization`, `card_number`, `national_id`) در `request_body`/`response_body` با `"[REDACTED]"` جایگزین می‌شوند. این کار در audit-svc انجام می‌شود، نه در کلاینت — تا حتی اگر یک سرویس اشتباهاً چیزی بفرستد، در دیتابیس ذخیره نشود.

### ۲.۲ Schema `fnb`

```sql
CREATE TABLE fnb.venues (            -- رستوران/کافه داخل مجتمع
  id UUID PRIMARY KEY, tenant_id UUID NOT NULL,
  name TEXT, is_open BOOLEAN DEFAULT true,
  opens_at TIME, closes_at TIME, prep_time_minutes INT DEFAULT 20
);

CREATE TABLE fnb.menu_categories (
  id UUID PRIMARY KEY, tenant_id UUID NOT NULL,
  venue_id UUID REFERENCES fnb.venues, name TEXT, sort_order INT
);

CREATE TABLE fnb.menu_items (
  id UUID PRIMARY KEY, tenant_id UUID NOT NULL,
  venue_id UUID REFERENCES fnb.venues,
  category_id UUID REFERENCES fnb.menu_categories,
  name TEXT, description TEXT, image_url TEXT,
  price NUMERIC(12,0) NOT NULL,
  availability TEXT NOT NULL DEFAULT 'available',  -- available | sold_out | hidden
  stock_count INT,                  -- NULL = نامحدود؛ عدد = شمارش‌شونده
  reserved_count INT DEFAULT 0,     -- رزرو موقت سفارش‌های در جریان
  dietary_tags TEXT[],              -- vegetarian | vegan | gluten_free | spicy
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE fnb.item_option_groups (   -- مثلاً «اندازه»، «افزودنی»
  id UUID PRIMARY KEY, tenant_id UUID NOT NULL,
  item_id UUID REFERENCES fnb.menu_items,
  name TEXT, min_select INT DEFAULT 0, max_select INT DEFAULT 1
);
CREATE TABLE fnb.item_options (
  id UUID PRIMARY KEY, tenant_id UUID NOT NULL,
  group_id UUID REFERENCES fnb.item_option_groups,
  name TEXT, price_delta NUMERIC(12,0) DEFAULT 0, is_available BOOLEAN DEFAULT true
);

CREATE TABLE fnb.delivery_zones (   -- مقصدهای تحویل داخل مجتمع
  id UUID PRIMARY KEY, tenant_id UUID NOT NULL,
  name TEXT,                        -- «استخر»، «سینما»، «سالن بدنسازی»، «روف‌گاردن»
  zone_type TEXT NOT NULL,          -- in_unit | amenity_zone
  amenity_id UUID,                  -- ارجاع منطقی به facility.amenities (سرویس دیگر — بدون FK فیزیکی)
  is_active BOOLEAN DEFAULT true,
  surcharge NUMERIC(12,0) DEFAULT 0
);

CREATE TABLE fnb.orders (
  id UUID PRIMARY KEY, tenant_id UUID NOT NULL,
  order_number TEXT UNIQUE,
  venue_id UUID REFERENCES fnb.venues,
  unit_id UUID NOT NULL,            -- ارجاع منطقی به property.units
  ordered_by UUID NOT NULL,
  delivery_type TEXT NOT NULL,      -- in_unit | amenity_zone
  delivery_zone_id UUID REFERENCES fnb.delivery_zones,
  delivery_note TEXT,               -- «تخت شماره ۷ کنار استخر»
  status TEXT NOT NULL DEFAULT 'draft',
  subtotal NUMERIC(12,0), surcharge NUMERIC(12,0), total NUMERIC(12,0),
  payment_id UUID,                  -- ارجاع منطقی به finance.payments
  placed_at TIMESTAMPTZ, ready_at TIMESTAMPTZ, delivered_at TIMESTAMPTZ,
  cancellation_reason TEXT
);
CREATE INDEX ON fnb.orders (tenant_id, status, placed_at DESC);

CREATE TABLE fnb.order_items (
  id UUID PRIMARY KEY, tenant_id UUID NOT NULL,
  order_id UUID REFERENCES fnb.orders ON DELETE CASCADE,
  item_id UUID REFERENCES fnb.menu_items,
  item_name_snapshot TEXT,          -- عنوان و قیمت در لحظه سفارش snapshot می‌شود
  unit_price NUMERIC(12,0), quantity INT, selected_options JSONB, line_total NUMERIC(12,0)
);

CREATE TABLE fnb.order_status_history (
  id UUID PRIMARY KEY, tenant_id UUID NOT NULL,
  order_id UUID REFERENCES fnb.orders,
  from_status TEXT, to_status TEXT, changed_by UUID, changed_at TIMESTAMPTZ DEFAULT now()
);
```

**چرا snapshot قیمت/نام؟** اگر ادمین بعداً قیمت را عوض کند، فاکتورهای گذشته نباید تغییر کنند.

---

## ۳. API Endpoints

### ۳.۱ Audit / Logging

```
POST   /api/audit/client-batch            -- دریافت دسته‌ای لاگ کلاینت (بدنه: { logs: [...] })
                                             پاسخ فوری 202 Accepted، پردازش async

GET    /api/audit/logs                    -- جستجوی داشبورد
       ?from=&to=&level=error&user_id=&action=&source=&status_code=&q=<full-text>
       &device_os=iOS&device_browser=Safari&page=&limit=
       → { data: [...], meta: { total, page, limit } }

GET    /api/audit/logs/:id                -- جزئیات کامل یک لاگ

GET    /api/audit/logs/:id/context        -- ★ Event Chaining
       ?before=50&after=20
       → { target: {...}, before: [...], after: [...], session_id }
       -- بازسازی زنجیره: تمام لاگ‌های همان session_id در پنجره زمانی اطراف رویداد هدف.
       -- پیاده‌سازی: window function روی ایندکس (session_id, occurred_at) — نه اسکن کامل جدول.

GET    /api/audit/sessions/:sessionId     -- کل نشست (برای بازپخش کامل مسیر کاربر)
GET    /api/audit/stats                   -- نرخ خطا، توزیع دستگاه/مرورگر، اکشن‌های پرخطا
```

### ۳.۲ منو و موجودی لحظه‌ای

```
GET    /api/fnb/venues
GET    /api/fnb/venues/:id/menu           -- منوی کامل + وضعیت لحظه‌ای هر آیتم
PATCH  /api/fnb/menu-items/:id/availability
       body: { availability: 'available' | 'sold_out', stock_count?: number }
       → broadcast آنی روی WebSocket + رویداد menu.item.updated
PATCH  /api/fnb/menu-items/bulk-availability   -- «همه چیز تمام شد» با یک درخواست
POST   /api/fnb/menu-items                -- CRUD ادمین رستوران
GET    /api/fnb/delivery-zones            -- مناطق فعال تحویل (استخر/سینما/...)

WS     namespace /fnb-live, room tenant:{tenantId}
       events: menu.item.updated | venue.status.changed | order.status.changed
```

### ۳.۳ سفارش

```
POST   /api/fnb/orders                    -- ثبت سفارش
       body: { venueId, unitId, deliveryType, deliveryZoneId?, deliveryNote?, items: [...] }
       -- سرور: اعتبارسنجی موجودی → رزرو موقت → محاسبه مجدد قیمت (هرگز به قیمت کلاینت اعتماد نمی‌شود)
       Header: Idempotency-Key (اجباری — جلوگیری از سفارش تکراری با دابل‌تپ موبایل)

GET    /api/fnb/orders/:id
GET    /api/fnb/units/:unitId/orders       -- تاریخچه سفارش ساکن
POST   /api/fnb/orders/:id/cancel          -- فقط تا وضعیت accepted
PATCH  /api/fnb/orders/:id/status          -- آشپزخانه (Roles: staff, admin)
       body: { status: 'accepted'|'preparing'|'ready'|'out_for_delivery'|'delivered'|'rejected' }
GET    /api/fnb/kitchen/queue              -- صف زنده آشپزخانه (Roles: staff, admin)
```

---

## ۴. طراحی UI/UX و سیستم رنگ

### ۴.۱ زبان طراحی: Liquid Glass

| اصل | مقدار |
|---|---|
| بلور پس‌زمینه | `backdrop-filter: blur(24px) saturate(180%)` |
| شفافیت سطح | Light: `rgba(255,255,255,0.65)` · Dark: `rgba(22,28,38,0.55)` |
| لبه شیشه | `1px solid rgba(255,255,255,0.35)` (Light) · `rgba(255,255,255,0.10)` (Dark) |
| گردی گوشه | `20px` کارت · `28px` شیت · `999px` دکمه قرص‌شکل |
| سایه | `0 8px 32px rgba(16,32,52,0.10)` — نرم و پخش، نه سایه تیز |
| انیمیشن | `cubic-bezier(0.32, 0.72, 0, 1)` · ۲۰۰–۳۰۰ms · فقط `transform`/`opacity` |
| حرکت سیال | Sheetها با drag اسنپ می‌شوند؛ ترنزیشن صفحات با اسلاید + fade هم‌زمان |

**قواعد اجرایی مهم:**
- `backdrop-filter` روی موبایل گران است — فقط روی لایه‌های ثابت (Bottom Bar، Header، Modal) استفاده شود، **نه** روی آیتم‌های لیست اسکرول‌شونده.
- همیشه یک `background-color` مات به‌عنوان fallback تعریف شود (`@supports not (backdrop-filter: blur(1px))`).
- احترام به `prefers-reduced-motion: reduce` → غیرفعال‌سازی انیمیشن‌های حرکتی.
- کنتراست متن روی شیشه باید حداقل WCAG AA (۴.۵:۱) باشد؛ روی پس‌زمینه تصویری از یک لایه `scrim` تیره/روشن استفاده شود.

### ۴.۲ پالت رنگ (توکن‌های عملکردی)

**Light Mode**

| توکن | HEX | کاربرد |
|---|---|---|
| `--bg-base` | `#F4F6F9` | پس‌زمینه صفحه |
| `--bg-elevated` | `#FFFFFF` | کارت مات |
| `--surface-glass` | `rgba(255,255,255,0.65)` | لایه شیشه‌ای |
| `--glass-tint` | `rgba(198,214,235,0.28)` | ته‌رنگ سرد شیشه |
| `--glass-border` | `rgba(255,255,255,0.55)` | لبه براق شیشه |
| `--primary` | `#0E5C63` | اکشن اصلی، حالت فعال |
| `--primary-hover` | `#0B4B51` | حالت فشرده |
| `--primary-soft` | `#DCEEF0` | پس‌زمینه Badge/Chip |
| `--accent` | `#C9A227` | برنز لوکس — تأکید، امتیاز، نشان VIP |
| `--accent-soft` | `#F7EFD8` | پس‌زمینه تأکید |
| `--text-primary` | `#141C26` | متن اصلی |
| `--text-secondary` | `#5B6878` | متن فرعی |
| `--text-tertiary` | `#8D99A8` | متن کم‌اهمیت |
| `--success` | `#1B8A5A` | موجود، تحویل‌شده |
| `--warning` | `#B8860B` | در حال آماده‌سازی |
| `--danger` | `#C0392B` | ناموجود، لغو، خطا |
| `--border-hairline` | `rgba(20,28,38,0.08)` | جداکننده |

**Dark Mode**

| توکن | HEX | کاربرد |
|---|---|---|
| `--bg-base` | `#0B1017` | پس‌زمینه صفحه |
| `--bg-elevated` | `#151C26` | کارت مات |
| `--surface-glass` | `rgba(22,28,38,0.55)` | لایه شیشه‌ای |
| `--glass-tint` | `rgba(90,120,155,0.18)` | ته‌رنگ سرد شیشه |
| `--glass-border` | `rgba(255,255,255,0.10)` | لبه شیشه |
| `--primary` | `#2FB3BD` | اکشن اصلی (روشن‌تر برای کنتراست روی تیره) |
| `--primary-hover` | `#48C6CF` | حالت فشرده |
| `--primary-soft` | `rgba(47,179,189,0.16)` | پس‌زمینه Badge |
| `--accent` | `#E3BC4E` | برنز روشن‌شده |
| `--accent-soft` | `rgba(227,188,78,0.16)` | پس‌زمینه تأکید |
| `--text-primary` | `#EEF2F7` | متن اصلی |
| `--text-secondary` | `#9AA7B7` | متن فرعی |
| `--text-tertiary` | `#6B7889` | متن کم‌اهمیت |
| `--success` | `#3DBE84` | موجود، تحویل‌شده |
| `--warning` | `#D9A441` | در حال آماده‌سازی |
| `--danger` | `#E45C4A` | ناموجود، لغو، خطا |
| `--border-hairline` | `rgba(255,255,255,0.08)` | جداکننده |

**دلیل انتخاب:** پایه سبز-آبی عمیق (teal) + تأکید برنز، به‌جای آبی/بنفش پیش‌فرض اپ‌های SaaS — حس لوکس هتلی می‌دهد و با پالت فعلی پروژه (navy/turquoise/brass) هم‌خانواده است، پس مهاجرت تدریجی ممکن است.

### ۴.۳ کانسپت داشبورد ادمین — لاگ‌ها

```
┌────────────────────────────────────────────────────────────┐
│ [بازه زمانی▾] [سطح: خطا▾] [سرویس▾] [دستگاه▾]  🔍 جستجو    │  ← نوار فیلتر شیشه‌ای چسبان
├────────────────────────────────────────────────────────────┤
│ ▁▃▅█▃▁▂  نمودار حجم لاگ در زمان — کلیک روی ستون = zoom     │  ← انتخاب بازه بصری
├────────────────────────────────────────────────────────────┤
│ 🔴 14:32:07  order.place      خطای ۵۰۰   Safari/iOS 17.4   │
│ 🟡 14:32:06  menu.fetch       ۳۴۰ms      Safari/iOS 17.4   │  ← ردیف‌های رنگ‌کدشده
│ 🟢 14:31:58  auth.refresh     ۲۰۰                          │
└────────────────────────────────────────────────────────────┘
        ↓ کلیک روی یک ردیف → پنل کشویی راست
┌───────────────── جزئیات + زنجیره رویداد ──────────────────┐
│ [خلاصه] [Request] [Response] [Device] [زنجیره ۵۰ لاگ قبل] │
│                                                            │
│ Timeline عمودی نشست کاربر — رویداد هدف برجسته و وسط:      │
│   ...                                                      │
│   14:31:58  auth.refresh          ✓                        │
│   14:32:06  menu.fetch            ✓ ۳۴۰ms                  │
│ ▶ 14:32:07  order.place           ✗ ۵۰۰  ← رویداد هدف     │
│   14:32:09  order.retry           ✗ ۵۰۰                    │
│ [دانلود JSON نشست]  [کپی trace_id]                        │
└────────────────────────────────────────────────────────────┘
```

### ۴.۴ کانسپت داشبورد آشپزخانه (Kitchen Display)

```
┌── سفارش‌های جدید ──┬── در حال آماده‌سازی ──┬── آماده تحویل ──┐
│ #1043  ⏱ ۰۲:۱۴     │ #1041  ⏱ ۰۸:۳۰       │ #1039           │
│ استخر — تخت ۷      │ واحد ۱۲              │ سینما           │
│ ۲× برگر            │ ۱× پاستا             │ ۳× نوشیدنی      │
│ [پذیرش] [رد]       │ [آماده شد]           │ [تحویل شد]      │
└────────────────────┴──────────────────────┴─────────────────┘
```
- ستون‌های Kanban، کارت‌ها با drag یا دکمه بین ستون‌ها جابه‌جا می‌شوند (هر جابه‌جایی = یک PATCH status).
- تایمر هر کارت پس از عبور از `prep_time_minutes` قرمز می‌شود.
- طراحی برای تبلت آشپزخانه: فونت درشت، هدف لمسی ≥ ۵۶px، بدون منوی تودرتو.

### ۴.۵ جریان موبایل سفارش غذا

```
منو (لیست شیشه‌ای)
  → آیتم ناموجود: خاکستری + برچسب «تمام شد» + غیرقابل لمس (بدون حذف از لیست)
  → افزودن به سبد: انیمیشن پرواز آیتم به آیکون سبد + هپتیک سبک
سبد (Bottom Sheet شیشه‌ای، drag برای بستن)
  → انتخاب مقصد: دو کارت بزرگ [واحد من] / [مناطق مشاعات ▾]
  → انتخاب زون: استخر / سینما / بدنسازی / روف‌گاردن + فیلد یادداشت («تخت شماره ۷»)
پرداخت → ردیابی زنده وضعیت (نوار پیشرفت ۵ مرحله‌ای، به‌روزرسانی از WebSocket)
```

---

## ۵. یکپارچگی با معماری موجود

| مورد | تصمیم |
|---|---|
| Multi-tenancy | همان RLS؛ `tenant_id` + Policy روی همه جداول جدید |
| رویدادها | همان Exchange `pms.events`؛ الگوهای جدید `audit.*`, `order.*`, `menu.*` |
| اعلان‌ها | notification-svc فقط `order.*` به `BINDING_PATTERNS` اضافه می‌کند — بدون تغییر منطق |
| پرداخت | fnb-svc از `finance-svc` استفاده می‌کند (کیف پول/درگاه)، درگاه جدید اضافه نمی‌شود |
| مناطق تحویل | `fnb.delivery_zones.amenity_id` به `facility.amenities` ارجاع منطقی دارد (بدون FK بین‌سرویسی) |
| K8s | دو Deployment جدید از همان `deployment-service.template.yaml` + دو مسیر جدید در Ingress |


---

## ۶. وضعیت پیاده‌سازی این سند

| بخش | وضعیت |
|---|---|
| `backend/audit-service` | ✅ کد کامل، build و اجرا تست‌شده (پورت 3007) — درج دسته‌ای غیرمسدودکننده، redaction، Event Chaining، مصرف‌کننده `#` روی Exchange |
| `backend/fnb-service` | ✅ کد کامل، build و اجرا تست‌شده (پورت 3008) — منو، تغییر موجودی با broadcast آنی، سفارش با رزرو موجودی و state machine |
| `frontend/src/styles/liquid-glass.css` | ✅ توکن‌های Light/Dark، کلاس `.lg-glass`، fallback با `@supports`، احترام به `prefers-reduced-motion` |
| `notification-service` | ✅ الگوی `order.*` و Handlerهای وضعیت سفارش اضافه شد |
| K8s + CI/CD | ✅ Deployment/Service/HPA، Migration Job، مسیر Ingress و ماتریس CI برای هر دو سرویس جدید |
| صفحات UI (سفارش غذا، داشبورد لاگ، Kitchen Display) | ⏳ هنوز پیاده‌سازی نشده — فقط کانسپت در بخش ۴.۳ تا ۴.۵ |
| مهاجرت صفحات موجود به Liquid Glass | ⏳ عمداً انجام نشده تا صفحات فعلی نشکنند؛ توکن‌ها آماده استفاده‌اند |
