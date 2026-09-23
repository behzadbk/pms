-- ============================================================================
-- 002 — پنل سوپرادمین: کاربران سطح پلتفرم + سطح‌بندی و وضعیت مالی ساختمان‌ها
-- ============================================================================
-- اجرا (بعد از 001_enable_rls.sql):
--   psql "$DATABASE_URL" -f prisma/migrations/002_platform_admins_and_tiers.sql
--
-- دو تغییر اصلی:
--   ۱) جدول identity.platform_admins — کاربران سوپرادمین که به هیچ tenant‌ای
--      تعلق ندارند (tenant_id ندارند) و پنل فروش/مدیریت مشتریان را می‌بینند.
--      این جدول عمداً RLS ندارد چون سطح پلتفرم است، نه سطح مجتمع.
--   ۲) ستون‌های سطح سرویس (tier) و تسویه‌ی اشتراک روی identity.tenants.
-- ============================================================================

CREATE TABLE IF NOT EXISTS identity.platform_admins (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username      text NOT NULL UNIQUE,
  full_name     text NOT NULL,
  password_hash text NOT NULL,
  is_active     boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON identity.platform_admins TO app_user, platform_admin;

-- --- سطح سرویس و مشخصات پروژه -------------------------------------------
ALTER TABLE identity.tenants ADD COLUMN IF NOT EXISTS tier text NOT NULL DEFAULT 'simple';
ALTER TABLE identity.tenants ADD COLUMN IF NOT EXISTS unit_count integer NOT NULL DEFAULT 0;
ALTER TABLE identity.tenants ADD COLUMN IF NOT EXISTS floor_count integer;
ALTER TABLE identity.tenants ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE identity.tenants ADD COLUMN IF NOT EXISTS manager_name text;
ALTER TABLE identity.tenants ADD COLUMN IF NOT EXISTS manager_phone text;

-- --- تسویه‌ی اشتراک با ما (وضعیت مالی در لیست ساختمان‌ها) ------------------
-- billing_status: settled (تسویه) | due (سررسید نزدیک) | overdue (معوق)
ALTER TABLE identity.tenants ADD COLUMN IF NOT EXISTS monthly_fee bigint NOT NULL DEFAULT 0;
ALTER TABLE identity.tenants ADD COLUMN IF NOT EXISTS outstanding_amount bigint NOT NULL DEFAULT 0;
ALTER TABLE identity.tenants ADD COLUMN IF NOT EXISTS billing_status text NOT NULL DEFAULT 'settled';
ALTER TABLE identity.tenants ADD COLUMN IF NOT EXISTS last_payment_at date;
ALTER TABLE identity.tenants ADD COLUMN IF NOT EXISTS next_due_at date;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenants_tier_check') THEN
    ALTER TABLE identity.tenants
      ADD CONSTRAINT tenants_tier_check CHECK (tier IN ('simple', 'economic', 'professional'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenants_billing_status_check') THEN
    ALTER TABLE identity.tenants
      ADD CONSTRAINT tenants_billing_status_check CHECK (billing_status IN ('settled', 'due', 'overdue'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS tenants_tier_idx ON identity.tenants (tier);
CREATE INDEX IF NOT EXISTS tenants_billing_status_idx ON identity.tenants (billing_status);
