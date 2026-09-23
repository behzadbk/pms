-- ============================================================================
-- 000_bootstrap — پایه‌ی کل دیتابیس PMS
-- ============================================================================
-- این فایل باید *اولین* مایگریشنی باشد که روی یک دیتابیس خالی اجرا می‌شود.
-- کارهایش:
--   ۱) اکستنشن‌های موردنیاز
--   ۲) نقش‌های دیتابیسی app_user (بدون BYPASSRLS) و platform_admin (با BYPASSRLS)
--   ۳) اسکیمای platform + تابع کلیدی platform.current_tenant_id()
--   ۴) جدول ردیابی مایگریشن‌ها platform.schema_migrations
--
-- نکته امنیتی: رمزهای زیر فقط placeholder محیط توسعه‌اند. در هر محیط غیر-local
-- باید از طریق متغیرهای APP_USER_PASSWORD / PLATFORM_ADMIN_PASSWORD (migrate.sh)
-- یا K8s Secret مقداردهی شوند.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS btree_gist; -- EXCLUDE constraint رزروها

-- --- نقش‌ها ---------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user LOGIN PASSWORD 'app_user_change_me' NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'platform_admin') THEN
    CREATE ROLE platform_admin LOGIN PASSWORD 'platform_admin_change_me' BYPASSRLS;
  END IF;
END
$$;

-- --- اسکیمای سطح پلتفرم ---------------------------------------------------
CREATE SCHEMA IF NOT EXISTS platform;
GRANT USAGE ON SCHEMA platform TO app_user, platform_admin;

-- tenant جاری از روی متغیر session خوانده می‌شود.
-- نکته‌ی مهم (باگ واقعی که در سشن تست بک‌اند پیدا شد): وقتی یک connection از
-- Pool قبلاً با SET LOCAL مقدار گرفته باشد، پس از COMMIT مقدارش به '' (رشته خالی)
-- برمی‌گردد نه NULL؛ ::uuid روی رشته‌ی خالی خطای 500 می‌داد. NULLIF این را به
-- NULL تبدیل می‌کند و نتیجه‌اش «صفر ردیف» است، یعنی رفتار fail-closed درست.
CREATE OR REPLACE FUNCTION platform.current_tenant_id() RETURNS uuid
  LANGUAGE sql STABLE PARALLEL SAFE
AS $$ SELECT NULLIF(current_setting('app.current_tenant_id', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION platform.current_user_id() RETURNS uuid
  LANGUAGE sql STABLE PARALLEL SAFE
AS $$ SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid $$;

GRANT EXECUTE ON FUNCTION platform.current_tenant_id(), platform.current_user_id()
  TO app_user, platform_admin;

-- --- ردیابی مایگریشن‌ها ---------------------------------------------------
CREATE TABLE IF NOT EXISTS platform.schema_migrations (
  filename    text PRIMARY KEY,
  checksum    text NOT NULL,
  applied_at  timestamptz NOT NULL DEFAULT now(),
  duration_ms integer
);
