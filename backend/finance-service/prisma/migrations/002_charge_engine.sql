-- ============================================================================
-- ۰۰۲ — موتور شارژ: فرمول قابل‌تعریف، تنظیمات مالی/جریمه دیرکرد، فاکتور هزینه‌ها
-- ============================================================================
--  * charge_formulas : ضرایب (پایه + متراژ + نفرات + اقلام ثابت) و «اعمال از دوره»
--  * monthly_charges : ردیف‌های ثبت وصول، ریز محاسبه، تاریخ آخرین محاسبه‌ی جریمه
--  * settings        : تنظیمات هر ساختمان (روز سررسید، جریمه دیرکرد — پیش‌فرض غیرفعال)
--  * expense_invoices: فاکتور/هزینه‌ی ساختمان (دسته، فروشنده، مبلغ، پیوست اختیاری)
--  * payments        : روش پرداخت و ثبت‌کننده برای ثبت دستی حسابداری
-- همه‌ی تاریخ‌ها از نوع DATE هستند و به‌صورت 'YYYY-MM-DD' (بدون منطقه‌ی زمانی) رد و بدل می‌شوند.
-- period همیشه «شمسی» به‌صورت 'YYYY-MM' است (مثلاً 1405-07 = مهر ۱۴۰۵).
-- idempotent.
-- ============================================================================

ALTER TABLE finance.charge_formulas
  ADD COLUMN IF NOT EXISTS per_resident_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fixed_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS effective_from text,
  ADD COLUMN IF NOT EXISTS round_to numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE finance.charge_formulas ALTER COLUMN base_amount SET DEFAULT 0;
UPDATE finance.charge_formulas SET base_amount = 0 WHERE base_amount IS NULL;
UPDATE finance.charge_formulas SET amount_per_sqm = 0 WHERE amount_per_sqm IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'charge_formulas_effective_from_check') THEN
    ALTER TABLE finance.charge_formulas
      ADD CONSTRAINT charge_formulas_effective_from_check
      CHECK (effective_from IS NULL OR effective_from ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'charge_formulas_amounts_check') THEN
    ALTER TABLE finance.charge_formulas
      ADD CONSTRAINT charge_formulas_amounts_check
      CHECK (base_amount >= 0 AND amount_per_sqm >= 0 AND per_resident_amount >= 0 AND round_to >= 1);
  END IF;
END $$;

ALTER TABLE finance.monthly_charges
  ADD COLUMN IF NOT EXISTS breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS pay_method text,
  ADD COLUMN IF NOT EXISTS late_fee_waived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS late_fee_through date,
  ADD COLUMN IF NOT EXISTS overdue_notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE finance.monthly_charges SET late_fee_amount = 0 WHERE late_fee_amount IS NULL;
ALTER TABLE finance.monthly_charges ALTER COLUMN late_fee_amount SET DEFAULT 0;
ALTER TABLE finance.monthly_charges ALTER COLUMN late_fee_amount SET NOT NULL;

-- شارژهای پرداخت‌شده‌ی قدیمی: زمان پرداخت از جدول payments
UPDATE finance.monthly_charges c
   SET paid_at = p.paid_at, pay_method = COALESCE(c.pay_method, 'online')
  FROM finance.payments p
 WHERE p.monthly_charge_id = c.id AND p.status = 'success' AND c.status = 'paid' AND c.paid_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'monthly_charges_status_check') THEN
    ALTER TABLE finance.monthly_charges
      ADD CONSTRAINT monthly_charges_status_check CHECK (status IN ('pending', 'paid', 'overdue'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS monthly_charges_period_idx ON finance.monthly_charges (tenant_id, period);
CREATE INDEX IF NOT EXISTS monthly_charges_due_idx ON finance.monthly_charges (tenant_id, status, due_date);
CREATE INDEX IF NOT EXISTS monthly_charges_unit_idx ON finance.monthly_charges (unit_id);

ALTER TABLE finance.payments
  ADD COLUMN IF NOT EXISTS method text,              -- online | cash | card_to_card | bank_transfer | cheque
  ADD COLUMN IF NOT EXISTS reference text,           -- شماره پیگیری / رسید (ثبت دستی)
  ADD COLUMN IF NOT EXISTS recorded_by uuid,         -- identity.users.id کاربر ثبت‌کننده (ثبت دستی)
  ADD COLUMN IF NOT EXISTS note text;
CREATE INDEX IF NOT EXISTS payments_charge_idx ON finance.payments (monthly_charge_id);

CREATE TABLE IF NOT EXISTS finance.settings (
  tenant_id            uuid PRIMARY KEY,
  due_day              integer NOT NULL DEFAULT 10 CHECK (due_day BETWEEN 1 AND 31),
  -- جریمه‌ی دیرکرد: تصمیم مالک/مدیر ساختمان است؛ پیش‌فرض غیرفعال و نرخ صفر
  late_fee_enabled     boolean NOT NULL DEFAULT false,
  late_fee_mode        text NOT NULL DEFAULT 'per_month' CHECK (late_fee_mode IN ('per_month', 'per_day')),
  late_fee_rate        numeric NOT NULL DEFAULT 0 CHECK (late_fee_rate >= 0 AND late_fee_rate <= 100),
  late_fee_grace_days  integer NOT NULL DEFAULT 0 CHECK (late_fee_grace_days >= 0 AND late_fee_grace_days <= 365),
  late_fee_cap_percent numeric CHECK (late_fee_cap_percent IS NULL OR (late_fee_cap_percent >= 0 AND late_fee_cap_percent <= 1000)),
  opening_balance      numeric NOT NULL DEFAULT 0,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  updated_by           uuid
);

CREATE TABLE IF NOT EXISTS finance.expense_invoices (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL,
  number           text NOT NULL,
  vendor           text NOT NULL,
  category         text NOT NULL,
  description      text NOT NULL,
  items            jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{title, qty, unit_price}]
  amount           numeric NOT NULL CHECK (amount > 0),
  invoice_date     date NOT NULL,
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  paid_on          date,
  pay_method       text,
  attachment_name  text,
  attachment_mime  text,
  attachment_data  bytea,
  registered_by    uuid,
  registered_by_name text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, number),
  CHECK (status = 'pending' OR paid_on IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS expense_invoices_date_idx ON finance.expense_invoices (tenant_id, invoice_date DESC);
CREATE INDEX IF NOT EXISTS expense_invoices_paid_idx ON finance.expense_invoices (tenant_id, paid_on) WHERE status = 'paid';

GRANT USAGE ON SCHEMA finance TO app_user, platform_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA finance TO app_user, platform_admin;

-- ایزوله‌سازی tenant (همان الگوی 001) — روی جدول‌های جدید اعمال می‌شود
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
