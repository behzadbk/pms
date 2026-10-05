-- منوی رستوران/کافی‌شاپ روی دیتابیس مشترک (قبلاً فقط در localStorage مرورگرِ مسئول بود
-- و در دستگاه ساکن دیده نمی‌شد). idempotent.

ALTER TABLE fnb.venues ADD COLUMN IF NOT EXISTS kind TEXT;
ALTER TABLE fnb.venues ADD COLUMN IF NOT EXISTS billing TEXT NOT NULL DEFAULT 'wallet';
-- venueهای قدیمیِ بدون kind (اگر وجود داشته باشند) به‌ترتیب نام رستوران فرض نمی‌شوند؛ فقط kind دارها یکتا هستند
CREATE UNIQUE INDEX IF NOT EXISTS uq_fnb_venues_tenant_kind ON fnb.venues (tenant_id, kind) WHERE kind IS NOT NULL;

ALTER TABLE fnb.menu_items ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'سایر';
ALTER TABLE fnb.menu_items ADD COLUMN IF NOT EXISTS icon TEXT NOT NULL DEFAULT 'burger';
ALTER TABLE fnb.menu_items ADD COLUMN IF NOT EXISTS color TEXT NOT NULL DEFAULT '#c9a227';
ALTER TABLE fnb.menu_items ADD COLUMN IF NOT EXISTS is_daily_special BOOLEAN NOT NULL DEFAULT false;

-- سفارش‌ها هم روی سرور: برچسب مقصد (واحد/مشاعات) و برچسب واحد سفارش‌دهنده برای نمایش در صف آشپزخانه
ALTER TABLE fnb.orders ADD COLUMN IF NOT EXISTS destination_label TEXT;
ALTER TABLE fnb.orders ADD COLUMN IF NOT EXISTS owner_label TEXT;
