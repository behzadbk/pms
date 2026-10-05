-- ============================================================================
-- fnb-service 002 — مدیریت رستوران/کافی‌شاپ، منو و مناطق تحویل
-- ----------------------------------------------------------------------------
-- تا اینجا هیچ endpointی برای ساخت مجموعه‌ی غذایی نبود. این مایگریشن ستون‌های
-- لازم را اضافه می‌کند (idempotent): نوع مجموعه، فعال/غیرفعال، تحویل، حداقل سفارش،
-- زمان آماده‌سازی هر آیتم، غذای روز، شماره‌ی سفارش ترتیبی و شخص سفارش‌دهنده.
-- ============================================================================

DO $m$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'fnb' AND table_name = 'venues' AND column_name = 'kind') THEN
    ALTER TABLE fnb.venues ADD COLUMN kind text NOT NULL DEFAULT 'restaurant';
    -- مجموعه‌هایی که پیش‌تر ساخته شده‌اند: اگر نامشان کافه/کافی‌شاپ است، نوعشان cafe شود
    UPDATE fnb.venues SET kind = 'cafe' WHERE name ~ 'کافه|کافی|cafe|coffee';
  END IF;
END
$m$;
ALTER TABLE fnb.venues DROP CONSTRAINT IF EXISTS venues_kind_check;
ALTER TABLE fnb.venues ADD CONSTRAINT venues_kind_check CHECK (kind IN ('restaurant', 'cafe'));
ALTER TABLE fnb.venues ADD COLUMN IF NOT EXISTS description      text;
ALTER TABLE fnb.venues ADD COLUMN IF NOT EXISTS is_active        boolean NOT NULL DEFAULT true;
ALTER TABLE fnb.venues ADD COLUMN IF NOT EXISTS accepts_delivery boolean NOT NULL DEFAULT true;
ALTER TABLE fnb.venues ADD COLUMN IF NOT EXISTS min_order        numeric(12,0) NOT NULL DEFAULT 0;
ALTER TABLE fnb.venues ADD COLUMN IF NOT EXISTS created_at       timestamptz NOT NULL DEFAULT now();
ALTER TABLE fnb.venues ALTER COLUMN is_open SET DEFAULT true;
UPDATE fnb.venues SET is_open = true WHERE is_open IS NULL;
ALTER TABLE fnb.venues ALTER COLUMN prep_time_minutes SET NOT NULL;
ALTER TABLE fnb.venues DROP CONSTRAINT IF EXISTS venues_prep_check;
ALTER TABLE fnb.venues ADD CONSTRAINT venues_prep_check CHECK (prep_time_minutes BETWEEN 1 AND 240);
ALTER TABLE fnb.venues DROP CONSTRAINT IF EXISTS venues_min_order_check;
ALTER TABLE fnb.venues ADD CONSTRAINT venues_min_order_check CHECK (min_order >= 0);

ALTER TABLE fnb.menu_items ADD COLUMN IF NOT EXISTS prep_time_minutes integer;
ALTER TABLE fnb.menu_items ADD COLUMN IF NOT EXISTS is_daily_special  boolean NOT NULL DEFAULT false;
ALTER TABLE fnb.menu_items ADD COLUMN IF NOT EXISTS created_at        timestamptz NOT NULL DEFAULT now();
ALTER TABLE fnb.menu_items DROP CONSTRAINT IF EXISTS menu_items_price_check;
ALTER TABLE fnb.menu_items ADD CONSTRAINT menu_items_price_check CHECK (price >= 0);
CREATE UNIQUE INDEX IF NOT EXISTS menu_categories_venue_name_uq ON fnb.menu_categories (venue_id, name);
CREATE INDEX IF NOT EXISTS menu_items_category_idx ON fnb.menu_items (category_id);

ALTER TABLE fnb.delivery_zones ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE fnb.delivery_zones ALTER COLUMN is_active SET DEFAULT true;
ALTER TABLE fnb.delivery_zones ALTER COLUMN surcharge SET DEFAULT 0;

-- شخص سفارش‌دهنده (residency.users.id) برای ارسال اعلان؛ ordered_by همان حساب ورود است
ALTER TABLE fnb.orders ADD COLUMN IF NOT EXISTS person_id uuid;

-- شماره‌ی سفارش ترتیبی (قبلاً از Date.now استفاده می‌شد و می‌توانست تکراری شود)
CREATE SEQUENCE IF NOT EXISTS fnb.order_number_seq START 1001;
GRANT USAGE, SELECT ON SEQUENCE fnb.order_number_seq TO app_user, platform_admin;
GRANT USAGE ON SCHEMA fnb TO platform_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA fnb TO app_user, platform_admin;
