# اتصال Livo به ERP / نرم‌افزار حسابداری

Livo نرم‌افزار حسابداری نیست. هر چیزی که در همین تولید می‌شود و بار مالی دارد — شارژ صادرشده‌ی هر واحد، پرداخت‌ها، فاکتورهای هزینه‌ی ساختمان، **شارژ متغیر** (کافه/رستوران و مازاد آفرها مثل ساعت نظافت) — به همراه اطلاعات پایه (واحدها، اشخاص، کارکنان) **به ERP مجموعه فرستاده می‌شود** و سند حسابداری در خود ERP ثبت می‌شود.

جهت داده فقط **Livo → ERP** است. Livo هیچ‌وقت در ERP چیزی را ویرایش نمی‌کند؛ ERP فقط می‌تواند «شماره سندی» را که ثبت کرده به Livo گزارش دهد تا در پنل دیده شود.

سرویس: `backend/integration-service` (پورت ۳۰۰۹، پشت gateway روی `/api/integration`).

| | آدرس |
|---|---|
| مستندات و فضای تست Swagger برای تیم ERP | `https://<دامنه>/api/integration/docs` |
| فایل OpenAPI (برای Postman / تولید SDK) | `https://<دامنه>/api/integration/docs/openapi.json` — نسخه‌ی آفلاین: `backend/integration-service/openapi.json` |
| مستندات endpointهای پنل (JWT) | `https://<دامنه>/api/integration/admin-docs` |
| صفحه‌ی مدیریت در اپ | پنل مدیر: `/admin/erp` · پنل حسابدار: `/accountant/erp` (منوی «بیشتر» ← «اتصال ERP») |

---

## ۱. دو روش اتصال

```
                         ┌──────────────── Livo ─────────────────┐
  پنل مدیر/حسابدار ──▶  │  finance / fnb / entitlement / ...       │
                         │        │ هر INSERT/UPDATE/DELETE           │
                         │        ▼ (trigger دیتابیس)                │
                         │  integration.outbox  (فید ترتیبی seq)    │
                         │     │                         │          │
                         │     │ (۱) Pull                │ (۲) Push │
                         └─────┼─────────────────────────┼──────────┘
                               ▼                         ▼
              ERP با X-API-Key می‌خواند       Livo دسته‌ها را POST می‌کند (HMAC)
              GET /v1/charges, /v1/changes…   به آدرس ERP، با تلاش مجدد خودکار
                               │                         │
                               └──── POST /v1/sync ◀─────┘  (شماره سند ERP → پنل Livo)
```

| روش | مناسب برای | چطور |
|---|---|---|
| **Pull** — ERP می‌خواند | ERP نصب‌شده داخل شبکه‌ی مجموعه (هلو، سپیدار، همکاران سیستم و…) یا میان‌افزار؛ نیازی به باز کردن پورت روی ERP نیست | مدیر/حسابدار در پنل «کلید API» می‌سازد؛ ERP با هدر `X-API-Key` داده را می‌خواند و برای تغییرات جدید `GET /v1/changes` را poll می‌کند |
| **Push** — Livo می‌فرستد | ERP آنلاین یا هر سرویسی که یک آدرس https برای دریافت دارد | در پنل «مقصد ارسال» (آدرس ERP) ثبت می‌شود؛ هر تغییر حداکثر ۱۵ ثانیه بعد دسته‌ای و امضاشده POST می‌شود |

هر دو روش هم‌زمان قابل استفاده‌اند و هر دو از **یک فید و یک شکل داده** می‌خوانند.

---

## ۲. داده‌هایی که در اختیار ERP قرار می‌گیرد

| موجودیت (`entity`) | endpoint | معادل در ERP |
|---|---|---|
| `building` | `GET /v1/buildings` | شعبه / مرکز هزینه |
| `unit` | `GET /v1/units` | طرف حساب یا مرکز هزینه‌ی واحد؛ `payerPartyId` = پرداخت‌کننده‌ی شارژ |
| `party` | `GET /v1/parties` | اشخاص (مالک، مستأجر، مالک غیرساکن). کودکان و مراقب موقت **ارسال نمی‌شوند** |
| `staff` | `GET /v1/staff` | پرسنل (برای حقوق‌ودستمزد) |
| `charge` | `GET /v1/charges` | **فاکتور فروش** / سند بدهکار واحد. `lines` = ردیف‌ها با `type`: `fixed`، `variable` (کافه `fnb` و مازاد خدمات `service_overage`)، `late_fee`، `adjustment`. جمع ردیف‌ها همیشه = `totalAmount` |
| `payment` | `GET /v1/payments` | **سند دریافت** (فقط `status=success` قطعی است؛ `method`: online، cash، card_to_card، bank_transfer، cheque) |
| `expense` | `GET /v1/expenses` (+ `/attachment`) | **فاکتور خرید / هزینه** ساختمان با ردیف‌ها و فایل پیوست |
| `fnb_order` | `GET /v1/fnb-orders` | جزئیات سفارش‌های کافه/رستوران که روی شارژ متغیر واحد می‌نشیند |
| `service_usage` | `GET /v1/service-usages` | جزئیات مصرف خدمات: سهم سهمیه‌ی رایگان و مازاد قابل‌پرداخت |

**قراردادها:** مبالغ **تومان** (عدد صحیح) · `period` ماه **شمسی** `YYYY-MM` · تاریخ‌ها ISO-8601 · شناسه‌ها UUID پایدار ·
فهرست‌ها `{ data, meta: { page, pageSize, total, hasMore } }` با `pageSize` تا ۵۰۰ · تکی `{ data }`.

> نکته‌ی ثبت سند: `charge` را یک‌بار ثبت کنید و در `updated` فقط وضعیت/جریمه را به‌روز کنید. `fnb_order` و `service_usage` جزئیات **همان** ردیف `variable` داخل `charge` هستند — اگر از `lines` شارژ سند می‌زنید، آن‌ها را دوباره ثبت نکنید.

---

## ۳. راهنمای تیم ERP — روش Pull

### گام ۱: کلید
مدیر یا حسابدار ساختمان: پنل ← «اتصال ERP» ← «ساخت کلید». کلید (`hmn_live_…`) **فقط یک بار** نمایش داده می‌شود.
دسترسی `read` = خواندن، `sync` = گزارش شماره سند.

```bash
curl https://<دامنه>/api/integration/v1/ping -H "X-API-Key: hmn_live_..."
```

### گام ۲: همگام‌سازی اولیه
1. `GET /v1/ping` ← مقدار `latestSeq` را **قبل از شروع** ذخیره کنید.
2. هر منبع را صفحه‌به‌صفحه بخوانید (`?page=1&pageSize=500` تا `hasMore=false`): واحدها و اشخاص ← شارژها ← پرداخت‌ها ← هزینه‌ها.
3. از این پس فقط فید تغییرات را از `latestSeq` ذخیره‌شده بخوانید (تغییرات حین گام ۲ از دست نمی‌رود).

### گام ۳: همگام‌سازی افزایشی
```
GET /v1/changes?since=<cursor>&limit=500&entities=charge,payment,expense
→ { events: [ { seq, entity, id, action, occurredAt, data } ], nextCursor, hasMore, latestSeq }
```
- `data` نسخه‌ی **فعلی** رکورد است (همان شکل endpoint)؛ برای `deleted` مقدار `null`.
- هر رویداد را پردازش کنید، بعد `nextCursor` را ذخیره کنید؛ تا `hasMore=true` بلافاصله ادامه دهید، سپس هر ۳۰–۶۰ ثانیه poll کنید.
- پردازش باید **idempotent** باشد (کلید یکتا: `entity` + `id`).

### گام ۴: گزارش نتیجه
```http
POST /v1/sync
{ "items": [
  { "entity": "charge",  "id": "…", "status": "synced", "erpRef": "SF-1405-001234" },
  { "entity": "payment", "id": "…", "status": "failed", "message": "حساب بانک تعریف نشده" }
] }
```
موارد `failed` در پنل «اتصال ERP» Livo به حسابدار نشان داده می‌شود.

### نمونه‌ی کد (Node.js)
```js
const BASE = 'https://<دامنه>/api/integration'
const H = { 'X-API-Key': process.env.LIVO_KEY }
let cursor = await loadCursor()              // از دیتابیس خودتان
for (;;) {
  const r = await fetch(`${BASE}/v1/changes?since=${cursor}&limit=500`, { headers: H }).then((r) => r.json())
  const results = []
  for (const ev of r.data.events) {
    const ref = await postToErp(ev)          // ترجمه به فاکتور فروش / سند دریافت / …
    if (ref) results.push({ entity: ev.entity, id: ev.id, status: 'synced', erpRef: ref })
  }
  if (results.length) await fetch(`${BASE}/v1/sync`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ items: results }) })
  cursor = r.data.nextCursor; await saveCursor(cursor)
  if (!r.data.hasMore) await new Promise((s) => setTimeout(s, 30_000))
}
```

---

## ۴. راهنمای تیم ERP — روش Push

Livo به آدرس ثبت‌شده POST می‌کند:

```http
POST https://erp.example.com/livo/inbox
Content-Type: application/json
X-Livo-Signature: t=1791902409,v1=89e755c5…
X-Livo-Batch: 4201-4250
X-Livo-Tenant: <tenant id>
X-Livo-Connector: <connector id>

{ "batchId": "4201-4250", "connector": {…}, "tenantId": "…", "currency": "IRT",
  "events": [ { "seq": 4201, "entity": "charge", "id": "…", "action": "created", "occurredAt": "…", "data": { … } } ] }
```

- **امضا را بررسی کنید:** `hex(HMAC_SHA256(secret, t + "." + rawBody)) == v1` و `t` حداکثر ۵ دقیقه قدیمی باشد. `secret` هنگام ساخت مقصد در پنل یک بار نمایش داده می‌شود.
- پاسخ **2xx** = دسته پذیرفته شد و دسته‌ی بعد ارسال می‌شود. هر پاسخ دیگر یا timeout (۱۵ ثانیه) = همان دسته بعداً دوباره ارسال می‌شود (۱۰ث، ۲۰ث، ۴۰ث… تا سقف ۱ ساعت). ترتیب `seq` حفظ می‌شود.
- ممکن است دسته‌ای تکراری برسد (at-least-once) → با `X-Livo-Batch` یا `entity+id` تکراری را نادیده بگیرید.
- در همان پاسخ می‌توانید شماره سندها را برگردانید تا در پنل Livo ثبت شود:
  ```json
  { "results": [ { "entity": "charge", "id": "…", "status": "synced", "erpRef": "SF-1234" } ] }
  ```

اعتبارسنجی امضا در PHP:
```php
function livo_verify(string $secret, string $header, string $raw): bool {
    parse_str(str_replace(',', '&', $header), $p);
    if (empty($p['t']) || empty($p['v1']) || abs(time() - (int)$p['t']) > 300) return false;
    return hash_equals(hash_hmac('sha256', $p['t'] . '.' . $raw, $secret), $p['v1']);
}
```

### امنیت مقصد
در production فقط آدرس **https عمومی** پذیرفته می‌شود (آدرس شبکه‌ی داخلی، localhost، IP خصوصی و دامنه‌ای که به IP داخلی resolve شود رد می‌شود — جلوگیری از SSRF). برای ERP داخل شبکه‌ی مجتمع از روش Pull استفاده کنید. در نصب on-premise می‌توان با `ERP_ALLOW_INSECURE_URLS=true` این محدودیت را برداشت.

---

## ۵. فضای تست

| | |
|---|---|
| Swagger با Try it out | `/api/integration/docs` ← دکمه‌ی **Authorize** ← کلید تست |
| کلید تست (فقط محیط توسعه، `migrate.sh --seed`) | `hmn_test_11111111111111111111111111111111_sandboxkey000000000000000001` (مجتمع نمونه‌ی borj-aftab) |
| ERP آزمایشی (گیرنده‌ی push) | connector نمونه‌ی seed همه‌ی تغییرات را به `POST /sandbox/erp-inbox` خود سرویس می‌فرستد؛ امضا را بررسی می‌کند و برای هر رکورد شماره سند `ERP-TEST-<seq>` برمی‌گرداند. مشاهده: `GET /api/integration/sandbox/erp-inbox` (در production وجود ندارد) |
| Postman | در Postman: Import ← Link ← `…/api/integration/docs/openapi.json` |
| تست خودکار | پایین (بخش ۷) |

کلید تست (`hmn_test_`) در `NODE_ENV=production` پذیرفته نمی‌شود.

---

## ۶. معماری و افزودن نرم‌افزار جدید

| فایل | نقش |
|---|---|
| `prisma/migrations/001_integration_schema.sql` | schema `integration` (کلیدها، outbox، sync_state، connectorها، گزارش ارسال) + trigger روی ۹ جدول. RLS کامل (ENABLE+FORCE، WITH CHECK)؛ trigger هرگز نوشتن اصلی را خراب نمی‌کند (خطا فقط WARNING) |
| `src/erp/entities.ts` | تعریف یکجای شکل هر موجودیت — هم pull، هم فید، هم push از همین استفاده می‌کنند |
| `src/erp/erp.controller.ts` | API عمومی ERP (`/v1`) با کلید |
| `src/erp/admin.controller.ts` | پنل (`/admin`) با JWT — فقط `admin` و `accountant` |
| `src/erp/dispatcher.service.ts` | صف ارسال خودکار: cursor روی outbox، backoff، گزارش |
| `src/erp/adapters/` | آداپترها. فعلاً `webhook` (JSON + HMAC، برای هر ERP یا میان‌افزار) |

**کلید API:** قالب `hmn_<live|test>_<tenant-id>_<۴۰ نویسه>`؛ tenant داخل کلید است تا جست‌وجوی هش داخل RLS همان مجتمع انجام شود (نیازی به دور زدن RLS نیست). فقط SHA-256 ذخیره می‌شود.

**افزودن آداپتر اختصاصی** (مثلاً حسابفا/سپیدار با API خودشان): یک کلاس `ErpAdapter` در `src/erp/adapters/<name>.adapter.ts` که رویدادها را به فاکتور فروش/سند دریافت/فاکتور خرید آن نرم‌افزار ترجمه کند، و ثبت در `adapters/index.ts`. صف، تلاش مجدد، گزارش و پنل دست نمی‌خورند. برای این کار مستندات API همان نرم‌افزار لازم است.

**تنظیمات:**

| متغیر | پیش‌فرض | |
|---|---|---|
| `ERP_DISPATCH_INTERVAL_SEC` | `15` | فاصله‌ی بررسی صف ارسال؛ `0` = ارسال خودکار خاموش |
| `ERP_ALLOW_INSECURE_URLS` | `false` | اجازه‌ی http/شبکه‌ی داخلی برای مقصد (on-premise) |
| `SWAGGER_SERVERS` | `.` (نسبی به صفحه‌ی مستندات) | سرورهای نمایش‌داده‌شده در Swagger |

سرویس با `replicas: 1` اجرا می‌شود (dispatcher داخل همین پروسه است).

---

## ۷. تأیید

روی PostgreSQL 16 واقعی (`db/migrate.sh --reset --seed`، اجرای دوباره بی‌اثر):

```bash
cd backend/integration-service
npm run build && npm test                                   # ۱۸ تست واحد: کلید، امضا، ردیف‌های شارژ، محافظ SSRF
DATABASE_URL=postgres://app_user:<pw>@localhost:5432/pms npm run test:e2e   # ۲۱ تست e2e روی سرویس build‌شده
```

تست e2e پوشش می‌دهد: احراز هویت کلید (بدون کلید، قالب غلط، رمز غلط، JWT کاربر رد می‌شود، scope، ابطال)، همه‌ی endpointهای داده، جمع ردیف‌های شارژ = مبلغ کل، حذف کودکان و ساکنین، **ایزوله‌سازی مجتمع‌ها با RLS** (کلید مجتمع دیگر هیچ داده‌ای نمی‌بیند)، ظاهر شدن یک UPDATE واقعی در فید، صفحه‌بندی cursor بدون فاصله، گزارش شماره سند، و مسیر کامل push: ساخت مقصد ← تست امضا ← backfill ← خطای ERP (cursor جلو نمی‌رود، backoff) ← تلاش مجدد موفق ← فیلتر موجودیت ← ثبت شماره سند از پاسخ ERP ← گزارش ارسال.
