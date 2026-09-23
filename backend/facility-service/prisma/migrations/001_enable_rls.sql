CREATE SCHEMA IF NOT EXISTS facility;
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS facility.amenities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'other',
  capacity INT,
  requires_approval BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS facility.booking_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  amenity_id UUID REFERENCES facility.amenities(id),
  max_bookings_per_unit_per_period INT NOT NULL DEFAULT 4,
  period_type TEXT NOT NULL DEFAULT 'month', -- day | week | month
  min_advance_hours INT NOT NULL DEFAULT 12,
  max_advance_days INT NOT NULL DEFAULT 14,
  deposit_amount NUMERIC DEFAULT 0,
  cancellation_window_hours INT DEFAULT 24,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS facility.reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  amenity_id UUID REFERENCES facility.amenities(id),
  unit_id UUID NOT NULL,
  requested_by UUID NOT NULL,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed', -- pending_approval | confirmed | cancelled | rejected
  applied_rule_id UUID REFERENCES facility.booking_rules(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  -- جلوگیری از Double Booking در سطح دیتابیس (بخش ۴ سند ARCHITECTURE-SAAS.md) —
  -- ضامن نهایی، مستقل از هر race condition در Application Layer یا Redis lock
  CONSTRAINT no_overlapping_reservations EXCLUDE USING gist (
    amenity_id WITH =,
    tstzrange(start_at, end_at) WITH &&
  ) WHERE (status IN ('confirmed', 'pending_approval'))
);

GRANT USAGE ON SCHEMA facility TO app_user, platform_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA facility TO app_user, platform_admin;

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
     WHERE n.nspname = 'facility'
       AND c.relkind IN ('r', 'p')
       AND c.relispartition = false
       AND EXISTS (SELECT 1 FROM pg_attribute a
                    WHERE a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped)
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', 'facility', t);
    EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY', 'facility', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', 'tenant_isolation_' || t, 'facility', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I.%I USING (tenant_id = platform.current_tenant_id())'
      || ' WITH CHECK (tenant_id = platform.current_tenant_id())',
      'tenant_isolation_' || t, 'facility', t);
  END LOOP;
END
$rls$;
