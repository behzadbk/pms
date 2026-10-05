-- ============================================================================
-- ۰۰۲ — مالی نسخه‌ی ۲: فرمول شارژ کامل، تنظیمات (دیرکرد/سررسید/موجودی اولیه)، فاکتور/هزینه،
--       و تابع جارو برای وضعیت «دیرکرد» + جریمه
-- ============================================================================
-- idempotent: اجرای دوباره بی‌خطر است. هر جدول tenant_دار در پایان RLS با WITH CHECK می‌گیرد.
-- ============================================================================

-- ─── فرمول شارژ ──────────────────────────────────────────────────────────────
ALTER TABLE finance.charge_formulas ADD COLUMN IF NOT EXISTS amount_per_person numeric NOT NULL DEFAULT 0;
UPDATE finance.charge_formulas SET base_amount = 0 WHERE base_amount IS NULL;
UPDATE finance.charge_formulas SET amount_per_sqm = 0 WHERE amount_per_sqm IS NULL;
ALTER TABLE finance.charge_formulas ALTER COLUMN base_amount SET NOT NULL;
ALTER TABLE finance.charge_formulas ALTER COLUMN amount_per_sqm SET NOT NULL;
ALTER TABLE finance.charge_formulas DROP CONSTRAINT IF EXISTS charge_formulas_calc_type_check;
ALTER TABLE finance.charge_formulas ADD CONSTRAINT charge_formulas_calc_type_check
  CHECK (calc_type IN ('fixed', 'per_area', 'per_person', 'hybrid'));
ALTER TABLE finance.charge_formulas DROP CONSTRAINT IF EXISTS charge_formulas_amounts_check;
ALTER TABLE finance.charge_formulas ADD CONSTRAINT charge_formulas_amounts_check
  CHECK (base_amount >= 0 AND amount_per_sqm >= 0 AND amount_per_person >= 0);
ALTER TABLE finance.charge_formulas ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- ─── شارژ ماهانه ─────────────────────────────────────────────────────────────
ALTER TABLE finance.monthly_charges ADD COLUMN IF NOT EXISTS paid_at   timestamptz;
ALTER TABLE finance.monthly_charges ADD COLUMN IF NOT EXISTS pay_method text;
ALTER TABLE finance.monthly_charges ADD COLUMN IF NOT EXISTS note      text;
ALTER TABLE finance.monthly_charges ADD COLUMN IF NOT EXISTS source    text NOT NULL DEFAULT 'issued';
UPDATE finance.monthly_charges SET late_fee_amount = 0 WHERE late_fee_amount IS NULL;
ALTER TABLE finance.monthly_charges ALTER COLUMN late_fee_amount SET NOT NULL;
-- دوره همیشه به شکل YYYY-MM (قبلاً صدور ماهانه '2026-04-01' ذخیره می‌کرد)
UPDATE finance.monthly_charges m SET period = left(m.period, 7)
 WHERE length(m.period) > 7
   AND NOT EXISTS (SELECT 1 FROM finance.monthly_charges x WHERE x.unit_id = m.unit_id AND x.period = left(m.period, 7));
ALTER TABLE finance.monthly_charges DROP CONSTRAINT IF EXISTS monthly_charges_status_check;
ALTER TABLE finance.monthly_charges ADD CONSTRAINT monthly_charges_status_check CHECK (status IN ('pending', 'paid', 'overdue'));
ALTER TABLE finance.monthly_charges DROP CONSTRAINT IF EXISTS monthly_charges_source_check;
ALTER TABLE finance.monthly_charges ADD CONSTRAINT monthly_charges_source_check CHECK (source IN ('issued', 'import', 'manual'));
CREATE INDEX IF NOT EXISTS monthly_charges_status_due_idx ON finance.monthly_charges (tenant_id, status, due_date);
CREATE INDEX IF NOT EXISTS monthly_charges_period_idx ON finance.monthly_charges (tenant_id, period);

-- ─── تنظیمات مالی هر ساختمان (یک ردیف برای هر tenant) ───────────────────────────
-- نرخ جریمه‌ی دیرکرد تصمیم مدیر ساختمان است؛ پیش‌فرض «بدون جریمه» (none) تا چیزی از خودمان فرض نشود.
--   fixed            : مبلغ ثابت (late_fee_value تومان) پس از پایان مهلت
--   percent_monthly  : late_fee_value درصدِ مبلغ پایه به‌ازای هر ۳۰ روز (یا کسری از آن) تأخیر
--   percent_daily    : late_fee_value درصدِ مبلغ پایه به‌ازای هر روز تأخیر
CREATE TABLE IF NOT EXISTS finance.settings (
  tenant_id            uuid PRIMARY KEY,
  late_fee_mode        text NOT NULL DEFAULT 'none',
  late_fee_value       numeric NOT NULL DEFAULT 0,
  late_fee_cap_percent numeric,
  grace_days           integer NOT NULL DEFAULT 0,
  due_day              integer NOT NULL DEFAULT 10,
  opening_balance      numeric NOT NULL DEFAULT 0,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  updated_by           uuid,
  CONSTRAINT settings_mode_check CHECK (late_fee_mode IN ('none', 'fixed', 'percent_monthly', 'percent_daily')),
  CONSTRAINT settings_value_check CHECK (late_fee_value >= 0 AND (late_fee_cap_percent IS NULL OR late_fee_cap_percent >= 0)),
  CONSTRAINT settings_grace_check CHECK (grace_days BETWEEN 0 AND 365),
  CONSTRAINT settings_due_day_check CHECK (due_day BETWEEN 1 AND 28)
);

-- ─── فاکتور / هزینه‌ی ساختمان ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS finance.invoices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  number          text NOT NULL,
  vendor          text NOT NULL,
  category        text NOT NULL,
  description     text NOT NULL DEFAULT '',
  items           jsonb NOT NULL DEFAULT '[]'::jsonb,
  amount          numeric NOT NULL CHECK (amount >= 0),
  issued_at       date NOT NULL,
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('paid', 'pending')),
  method          text,
  attachment_name text,
  paid_at         timestamptz,
  registered_by   uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, number)
);
CREATE INDEX IF NOT EXISTS invoices_issued_idx ON finance.invoices (tenant_id, issued_at DESC);

-- ─── جارو: وضعیت دیرکرد + جریمه ─────────────────────────────────────────────────
-- شارژهای pending/overdue با due_date گذشته (به وقت تهران) → overdue؛ late_fee_amount طبق تنظیمات
-- همان ساختمان دوباره محاسبه می‌شود (idempotent؛ هر بار از روی روزهای تأخیر). total = base + late_fee.
-- با SET LOCAL app.current_tenant_id صدا زده می‌شود (RLS برای نقش app_user برقرار است).
CREATE OR REPLACE FUNCTION finance.sweep_overdue(p_tenant uuid, p_today date DEFAULT (now() AT TIME ZONE 'Asia/Tehran')::date)
RETURNS integer LANGUAGE plpgsql AS $sweep$
DECLARE n integer;
BEGIN
  WITH calc AS (
    SELECT c.id, c.base_amount,
           GREATEST(p_today - c.due_date - COALESCE(s.grace_days, 0), 0) AS eff_days,
           COALESCE(s.late_fee_mode, 'none') AS mode,
           COALESCE(s.late_fee_value, 0) AS val,
           s.late_fee_cap_percent AS cap
      FROM finance.monthly_charges c
      LEFT JOIN finance.settings s ON s.tenant_id = c.tenant_id
     WHERE c.tenant_id = p_tenant
       AND c.status IN ('pending', 'overdue')
       AND c.due_date IS NOT NULL
       AND c.due_date < p_today
  ), fee AS (
    SELECT id,
           ROUND(LEAST(
             CASE mode
               WHEN 'fixed'           THEN CASE WHEN eff_days > 0 THEN val ELSE 0 END
               WHEN 'percent_monthly' THEN base_amount * val / 100 * CEIL(eff_days / 30.0)
               WHEN 'percent_daily'   THEN base_amount * val / 100 * eff_days
               ELSE 0
             END,
             CASE WHEN cap IS NULL THEN 'Infinity'::numeric ELSE base_amount * cap / 100 END
           )) AS late_fee
      FROM calc
  )
  UPDATE finance.monthly_charges c
     SET status = 'overdue', late_fee_amount = f.late_fee, total_amount = c.base_amount + f.late_fee
    FROM fee f
   WHERE c.id = f.id
     AND (c.status <> 'overdue' OR c.late_fee_amount IS DISTINCT FROM f.late_fee);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END
$sweep$;
GRANT EXECUTE ON FUNCTION finance.sweep_overdue(uuid, date) TO app_user, platform_admin;

GRANT USAGE ON SCHEMA finance TO app_user, platform_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA finance TO app_user, platform_admin;

-- ─── RLS روی جدول‌های جدید (همان الگوی 001) ────────────────────────────────────
DO $rls$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'finance' AND c.relkind IN ('r', 'p') AND c.relispartition = false
       AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped)
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
