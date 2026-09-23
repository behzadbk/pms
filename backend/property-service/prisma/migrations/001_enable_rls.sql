CREATE SCHEMA IF NOT EXISTS property;

CREATE TABLE IF NOT EXISTS property.buildings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  name TEXT NOT NULL,
  address TEXT,
  total_units INT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS property.units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  building_id UUID REFERENCES property.buildings(id),
  unit_number TEXT NOT NULL,
  floor INT,
  area_sqm NUMERIC,
  ownership_status TEXT DEFAULT 'owner_occupied',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS property.user_unit_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL,
  unit_id UUID REFERENCES property.units(id),
  relation TEXT NOT NULL DEFAULT 'owner', -- owner | tenant | family_member
  is_primary_contact BOOLEAN DEFAULT true
);

GRANT USAGE ON SCHEMA property TO app_user, platform_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA property TO app_user, platform_admin;

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
     WHERE n.nspname = 'property'
       AND c.relkind IN ('r', 'p')
       AND c.relispartition = false
       AND EXISTS (SELECT 1 FROM pg_attribute a
                    WHERE a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped)
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', 'property', t);
    EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY', 'property', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', 'tenant_isolation_' || t, 'property', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I.%I USING (tenant_id = platform.current_tenant_id())'
      || ' WITH CHECK (tenant_id = platform.current_tenant_id())',
      'tenant_isolation_' || t, 'property', t);
  END LOOP;
END
$rls$;
