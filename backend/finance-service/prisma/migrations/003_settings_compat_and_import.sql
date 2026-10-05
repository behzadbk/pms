-- ============================================================================
-- ۰۰۳ — یکدست‌سازی finance.settings + پشتیبانی ورود شارژ از فایل حسابداری
-- ============================================================================
-- idempotent. روی دیتابیس تازه، فقط ستون/قید «source» اضافه می‌شود.
-- ============================================================================

-- سازگاری: مایگریشن قدیمی «002_finance_v2» جدول settings را با شکل دیگری ساخته بود
-- (late_fee_mode = none|fixed|percent_*، late_fee_value، grace_days). اگر آن شکل هست به شکل
-- فعلی تبدیل می‌شود؛ جریمه‌ی «مبلغ ثابت» معادلی ندارد و غیرفعال می‌شود. روی دیتابیس تازه بی‌اثر است.
DO $compat$
BEGIN
  IF to_regclass('finance.settings') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                      WHERE table_schema = 'finance' AND table_name = 'settings' AND column_name = 'late_fee_enabled') THEN
    ALTER TABLE finance.settings DROP CONSTRAINT IF EXISTS settings_mode_check;
    ALTER TABLE finance.settings DROP CONSTRAINT IF EXISTS settings_value_check;
    ALTER TABLE finance.settings DROP CONSTRAINT IF EXISTS settings_grace_check;
    ALTER TABLE finance.settings DROP CONSTRAINT IF EXISTS settings_due_day_check;
    ALTER TABLE finance.settings
      ADD COLUMN late_fee_enabled    boolean NOT NULL DEFAULT false,
      ADD COLUMN late_fee_rate       numeric NOT NULL DEFAULT 0,
      ADD COLUMN late_fee_grace_days integer NOT NULL DEFAULT 0;
    UPDATE finance.settings SET
      late_fee_enabled    = late_fee_mode IN ('percent_monthly', 'percent_daily') AND late_fee_value > 0,
      late_fee_rate       = CASE WHEN late_fee_mode IN ('percent_monthly', 'percent_daily') THEN LEAST(late_fee_value, 100) ELSE 0 END,
      late_fee_grace_days = grace_days,
      late_fee_mode       = CASE late_fee_mode WHEN 'percent_daily' THEN 'per_day' ELSE 'per_month' END;
    ALTER TABLE finance.settings DROP COLUMN late_fee_value, DROP COLUMN grace_days;
    ALTER TABLE finance.settings
      ADD CONSTRAINT settings_mode_check CHECK (late_fee_mode IN ('per_month', 'per_day')),
      ADD CONSTRAINT settings_rate_check CHECK (late_fee_rate >= 0 AND late_fee_rate <= 100),
      ADD CONSTRAINT settings_grace_check CHECK (late_fee_grace_days BETWEEN 0 AND 365),
      ADD CONSTRAINT settings_due_day_check CHECK (due_day BETWEEN 1 AND 31);
  END IF;
END
$compat$;
-- منبع ردیف شارژ: issued = صدور با فرمول · import = ورود از فایل حسابداری · manual = ثبت دستی
ALTER TABLE finance.monthly_charges ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'issued';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'monthly_charges_source_check') THEN
    ALTER TABLE finance.monthly_charges ADD CONSTRAINT monthly_charges_source_check CHECK (source IN ('issued', 'import', 'manual'));
  END IF;
END $$;

