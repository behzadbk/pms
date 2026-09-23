-- Schema و RLS برای fnb-svc — بخش ۲.۲ سند docs/UPDATE-V2-AUDIT-FNB-DESIGN.md
CREATE SCHEMA IF NOT EXISTS fnb;

CREATE TABLE IF NOT EXISTS fnb.venues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL,
  name TEXT NOT NULL, is_open BOOLEAN DEFAULT true,
  opens_at TIME, closes_at TIME, prep_time_minutes INT DEFAULT 20
);

CREATE TABLE IF NOT EXISTS fnb.menu_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL,
  venue_id UUID REFERENCES fnb.venues, name TEXT NOT NULL, sort_order INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS fnb.menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL,
  venue_id UUID REFERENCES fnb.venues,
  category_id UUID REFERENCES fnb.menu_categories,
  name TEXT NOT NULL, description TEXT, image_url TEXT,
  price NUMERIC(12,0) NOT NULL,
  availability TEXT NOT NULL DEFAULT 'available'
    CHECK (availability IN ('available','sold_out','hidden')),
  stock_count INT,            -- NULL = نامحدود
  reserved_count INT NOT NULL DEFAULT 0,
  dietary_tags TEXT[] DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_menu_items_venue ON fnb.menu_items (venue_id, availability);

CREATE TABLE IF NOT EXISTS fnb.item_option_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL,
  item_id UUID REFERENCES fnb.menu_items ON DELETE CASCADE,
  name TEXT NOT NULL, min_select INT DEFAULT 0, max_select INT DEFAULT 1
);
CREATE TABLE IF NOT EXISTS fnb.item_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL,
  group_id UUID REFERENCES fnb.item_option_groups ON DELETE CASCADE,
  name TEXT NOT NULL, price_delta NUMERIC(12,0) DEFAULT 0, is_available BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS fnb.delivery_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL,
  name TEXT NOT NULL,
  zone_type TEXT NOT NULL CHECK (zone_type IN ('in_unit','amenity_zone')),
  amenity_id UUID,           -- ارجاع منطقی به facility.amenities (بدون FK بین‌سرویسی)
  is_active BOOLEAN DEFAULT true,
  surcharge NUMERIC(12,0) DEFAULT 0
);

CREATE TABLE IF NOT EXISTS fnb.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL,
  order_number TEXT, venue_id UUID REFERENCES fnb.venues,
  unit_id UUID NOT NULL, ordered_by UUID NOT NULL,
  delivery_type TEXT NOT NULL CHECK (delivery_type IN ('in_unit','amenity_zone')),
  delivery_zone_id UUID REFERENCES fnb.delivery_zones,
  delivery_note TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  subtotal NUMERIC(12,0), surcharge NUMERIC(12,0) DEFAULT 0, total NUMERIC(12,0),
  payment_id UUID,           -- ارجاع منطقی به finance.payments
  placed_at TIMESTAMPTZ, ready_at TIMESTAMPTZ, delivered_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  UNIQUE (tenant_id, order_number)
);
CREATE INDEX IF NOT EXISTS idx_orders_status ON fnb.orders (tenant_id, status, placed_at DESC);

CREATE TABLE IF NOT EXISTS fnb.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL,
  order_id UUID REFERENCES fnb.orders ON DELETE CASCADE,
  item_id UUID REFERENCES fnb.menu_items,
  item_name_snapshot TEXT NOT NULL,   -- snapshot: تغییر بعدی منو فاکتور گذشته را عوض نکند
  unit_price NUMERIC(12,0) NOT NULL, quantity INT NOT NULL,
  selected_options JSONB, line_total NUMERIC(12,0) NOT NULL
);

CREATE TABLE IF NOT EXISTS fnb.order_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL,
  order_id UUID REFERENCES fnb.orders ON DELETE CASCADE,
  from_status TEXT, to_status TEXT NOT NULL, changed_by UUID,
  changed_at TIMESTAMPTZ DEFAULT now()
);

-- RLS روی همه جداول
GRANT USAGE ON SCHEMA fnb TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA fnb TO app_user;

-- --- تضمین وجود تابع کمکی tenant جاری (اگر 000_bootstrap اجرا نشده باشد) ----
CREATE SCHEMA IF NOT EXISTS platform;
CREATE OR REPLACE FUNCTION platform.current_tenant_id() RETURNS uuid
  LANGUAGE sql STABLE PARALLEL SAFE
AS $fn$ SELECT NULLIF(current_setting('app.current_tenant_id', true), '')::uuid $fn$;
GRANT USAGE ON SCHEMA platform TO app_user, platform_admin;
GRANT EXECUTE ON FUNCTION platform.current_tenant_id() TO app_user, platform_admin;

-- ============================================================================
-- ایزوله‌سازی tenant — idempotent، fail-closed، با WITH CHECK
-- ============================================================================
-- روی هر جدولِ این اسکیما که ستون tenant_id دارد اعمال می‌شود:
--   * ENABLE + FORCE ROW LEVEL SECURITY
--   * پالیسی tenant_isolation_<table> با USING و WITH CHECK
-- WITH CHECK جلوی جعل tenant_id در INSERT/UPDATE را می‌گیرد (پیش‌تر فقط USING
-- بود، یعنی نوشتن با tenant_id دیگران مسدود نمی‌شد).
-- DROP POLICY IF EXISTS باعث می‌شود اجرای مجدد مایگریشن بی‌خطا باشد.
DO $rls$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'fnb'
       AND c.relkind IN ('r', 'p')
       AND c.relispartition = false
       AND EXISTS (SELECT 1 FROM pg_attribute a
                    WHERE a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped)
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', 'fnb', t);
    EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY', 'fnb', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', 'tenant_isolation_' || t, 'fnb', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I.%I USING (tenant_id = platform.current_tenant_id())'
      || ' WITH CHECK (tenant_id = platform.current_tenant_id())',
      'tenant_isolation_' || t, 'fnb', t);
  END LOOP;
END
$rls$;
