CREATE SCHEMA IF NOT EXISTS finance;

CREATE TABLE IF NOT EXISTS finance.charge_formulas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  name TEXT NOT NULL,
  calc_type TEXT NOT NULL DEFAULT 'hybrid', -- fixed | per_area | per_person | hybrid
  base_amount NUMERIC DEFAULT 0,
  amount_per_sqm NUMERIC DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS finance.monthly_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  unit_id UUID NOT NULL,
  period TEXT NOT NULL, -- 'YYYY-MM'
  formula_id UUID REFERENCES finance.charge_formulas(id),
  base_amount NUMERIC NOT NULL,
  late_fee_amount NUMERIC DEFAULT 0,
  total_amount NUMERIC NOT NULL,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | paid | overdue
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (unit_id, period)
);

CREATE TABLE IF NOT EXISTS finance.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  monthly_charge_id UUID REFERENCES finance.monthly_charges(id),
  amount NUMERIC NOT NULL,
  gateway TEXT NOT NULL DEFAULT 'zarinpal',
  gateway_ref_id TEXT,
  status TEXT NOT NULL DEFAULT 'initiated', -- initiated | success | failed | refunded
  idempotency_key TEXT UNIQUE,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

GRANT USAGE ON SCHEMA finance TO app_user, platform_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA finance TO app_user, platform_admin;

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
     WHERE n.nspname = 'finance'
       AND c.relkind IN ('r', 'p')
       AND c.relispartition = false
       AND EXISTS (SELECT 1 FROM pg_attribute a
                    WHERE a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped)
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', 'finance', t);
    EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY', 'finance', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', 'tenant_isolation_' || t, 'finance', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I.%I USING (tenant_id = platform.current_tenant_id())'
      || ' WITH CHECK (tenant_id = platform.current_tenant_id())',
      'tenant_isolation_' || t, 'finance', t);
  END LOOP;
END
$rls$;
