-- ============================================================================
-- 010 — عملیات پنل سوپرادمین: لاگ فعالیت، تنظیمات، یادداشت ساختمان، نقش و ۲FA، تعلیق
-- ============================================================================
--  ۱) identity.platform_audit_log  — چه کسی، چه زمانی، چه کاری (append-only؛ UPDATE/DELETE ممنوع)
--  ۲) identity.platform_settings   — تنظیمات پلتفرم (مهلت پرداخت، تعلیق خودکار، قیمت هر سطح، ...)
--  ۳) identity.platform_tenant_notes — یادداشت/تماس/بازدید هر ساختمان (CRM سبک)
--  ۴) platform_admins.role / totp_*  — نقش (owner|support|sales) و ورود دومرحله‌ای (TOTP)
--  ۵) tenants.suspended_at / suspend_reason / trial_ends_at — چرخه‌ی عمر ساختمان
--
-- نکته‌ی عمدی: ستون ساختمان در جدول‌های این فایل «building_id» است نه «tenant_id»؛ چون
-- (الف) مایگریشن 901 هر جدول دارای tenant_id را مجبور به RLS می‌کند و این جدول‌ها سطح پلتفرم‌اند،
-- (ب) export-tenant همه‌ی جدول‌های دارای tenant_id را در خروجی ساختمان می‌گذارد و لاگ/یادداشت
--     داخلی ما نباید به مشتری برسد.
-- مثل 907: فقط platform_admin (pool دوم، withPlatformAccess) به این جدول‌ها دسترسی دارد، نه app_user.
-- idempotent.
-- ============================================================================

-- --- نقش و ۲FA سوپرادمین ---------------------------------------------------
ALTER TABLE identity.platform_admins ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'owner';
ALTER TABLE identity.platform_admins ADD COLUMN IF NOT EXISTS totp_secret_enc text;
ALTER TABLE identity.platform_admins ADD COLUMN IF NOT EXISTS totp_enabled boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'platform_admins_role_check') THEN
    ALTER TABLE identity.platform_admins
      ADD CONSTRAINT platform_admins_role_check CHECK (role IN ('owner', 'support', 'sales'));
  END IF;
END $$;

-- --- چرخه‌ی عمر ساختمان ---------------------------------------------------
ALTER TABLE identity.tenants ADD COLUMN IF NOT EXISTS suspended_at timestamptz;
ALTER TABLE identity.tenants ADD COLUMN IF NOT EXISTS suspend_reason text;
ALTER TABLE identity.tenants ADD COLUMN IF NOT EXISTS trial_ends_at date;

-- --- لاگ فعالیت سوپرادمین --------------------------------------------------
CREATE TABLE IF NOT EXISTS identity.platform_audit_log (
  id             bigserial PRIMARY KEY,
  at             timestamptz NOT NULL DEFAULT now(),
  admin_id       uuid,                      -- null برای کارهای خودکار سیستم
  admin_username text NOT NULL,             -- 'system' برای زمان‌بند
  action         text NOT NULL,             -- مثل building.suspend، invoice.status، admin.create
  building_id    uuid,                      -- ساختمانِ هدف (اگر دارد) — بدون FK تا با حذف ساختمان لاگ نماند بی‌سرپرست از بین نرود
  target         text,
  detail         jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip             text
);
CREATE INDEX IF NOT EXISTS platform_audit_log_at_idx       ON identity.platform_audit_log (at DESC);
CREATE INDEX IF NOT EXISTS platform_audit_log_building_idx ON identity.platform_audit_log (building_id, at DESC);
CREATE INDEX IF NOT EXISTS platform_audit_log_admin_idx    ON identity.platform_audit_log (admin_username, at DESC);

-- --- تنظیمات پلتفرم --------------------------------------------------------
CREATE TABLE IF NOT EXISTS identity.platform_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

-- --- یادداشت‌های ساختمان (CRM سبک) -----------------------------------------
CREATE TABLE IF NOT EXISTS identity.platform_tenant_notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE CASCADE,
  kind        text NOT NULL DEFAULT 'note',
  body        text NOT NULL,
  author      text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_tenant_notes_kind_check CHECK (kind IN ('note', 'call', 'visit', 'sales')),
  CONSTRAINT platform_tenant_notes_body_check CHECK (length(body) BETWEEN 1 AND 2000)
);
CREATE INDEX IF NOT EXISTS platform_tenant_notes_building_idx ON identity.platform_tenant_notes (building_id, created_at DESC);

-- --- دسترسی‌ها --------------------------------------------------------------
REVOKE ALL ON identity.platform_audit_log, identity.platform_settings, identity.platform_tenant_notes FROM app_user;
GRANT SELECT, INSERT ON identity.platform_audit_log TO platform_admin;            -- append-only
GRANT SELECT, INSERT, UPDATE, DELETE ON identity.platform_settings, identity.platform_tenant_notes TO platform_admin;
GRANT USAGE, SELECT ON SEQUENCE identity.platform_audit_log_id_seq TO platform_admin;
REVOKE UPDATE, DELETE, TRUNCATE ON identity.platform_audit_log FROM platform_admin;

-- --- تضمین ------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['identity.platform_audit_log','identity.platform_settings','identity.platform_tenant_notes'] LOOP
    IF has_table_privilege('app_user', t, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
      RAISE EXCEPTION '010: app_user نباید به % دسترسی داشته باشد', t;
    END IF;
  END LOOP;
  IF has_table_privilege('platform_admin', 'identity.platform_audit_log', 'UPDATE,DELETE,TRUNCATE') THEN
    RAISE EXCEPTION '010: لاگ فعالیت سوپرادمین باید append-only باشد';
  END IF;
END $$;
