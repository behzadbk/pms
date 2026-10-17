/**
 * آداپتر ارسال به ERP (push).
 *
 * dispatcher دسته‌ای از رویدادهای outbox را (به ترتیب seq، همراه نسخه‌ی کامل هر رکورد) به آداپتر می‌دهد.
 * آداپتر باید آن‌ها را به زبان ERP مقصد ترجمه و ارسال کند و فقط وقتی ok=true برگرداند که کل دسته
 * با موفقیت ثبت شده باشد؛ در غیر این صورت همان دسته بعداً دوباره فرستاده می‌شود (at-least-once).
 *
 * برای افزودن یک نرم‌افزار مشخص (مثلاً «حسابفا»، «سپیدار»، «هلو»):
 *   1. فایل <name>.adapter.ts با کلاسی که ErpAdapter را پیاده می‌کند بسازید
 *      (ترجمه‌ی charge → فاکتور فروش، payment → سند دریافت، expense → فاکتور خرید/هزینه، party → طرف حساب و …)
 *   2. آن را در adapters/index.ts به ADAPTERS اضافه کنید
 *   3. connector با type=<name> و config (مثلاً کلید API یا کد حساب‌ها) در پنل ساخته می‌شود
 * باقی سیستم (صف، تلاش مجدد، گزارش، فید، Swagger) دست نمی‌خورد.
 */

export interface OutboundEvent {
  seq: number
  entity: string
  id: string
  action: 'created' | 'updated' | 'deleted'
  occurredAt: string
  /** نسخه‌ی فعلی رکورد (همان شکل API)؛ برای deleted یا رکورد غیرقابل‌دسترسی null */
  data: unknown
}

export interface ConnectorRecord {
  id: string
  tenantId: string
  name: string
  type: string
  url: string
  secret: string
  config: Record<string, unknown>
}

export interface SyncResult {
  entity: string
  id: string
  status: 'synced' | 'failed' | 'skipped'
  erpRef?: string
  message?: string
}

export interface AdapterResult {
  ok: boolean
  statusCode?: number
  error?: string
  /** اگر ERP در پاسخ شماره سندها را برگرداند، در sync_state ثبت می‌شوند */
  results?: SyncResult[]
}

export interface ErpAdapter {
  readonly type: string
  readonly label: string
  send(connector: ConnectorRecord, events: OutboundEvent[], meta: { batchId: string }): Promise<AdapterResult>
}
