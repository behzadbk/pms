-- ============================================================================
-- 907 — بستن دسترسی app_user به جدول‌های سطح پلتفرم (issue #17 آیتم ۱)
-- ============================================================================
-- identity.platform_admins (حساب سوپرادمین‌ها) و identity.platform_invoices
-- (صورتحساب همه‌ی ساختمان‌ها) RLS ندارند. تا اینجا app_user (مشترک بین همه‌ی سرویس‌ها)
-- روی آن‌ها SELECT/INSERT/UPDATE/DELETE داشت؛ یک باگ SQL-injection/IDOR در هر سرویس
-- می‌توانست آن‌ها را بخواند یا پاک کند.
--
-- بعد از این مایگریشن فقط platform_admin (BYPASSRLS، فقط از pool دوم PLATFORM_DATABASE_URL
-- در withPlatformAccess) به این دو جدول دسترسی دارد.
--
-- ⚠ ترتیب استقرار: فقط بعد از این‌که PR #74 (pool دوم) مرج و روی VPS فعال شد
--   (PLATFORM_DATABASE_URL + PLATFORM_ADMIN_PASSWORD اعمال‌شده). وگرنه
--   ورود سوپرادمین و پنل پلتفرم (identity-service) خطای permission denied می‌دهد.
-- بازگشت: GRANT SELECT, INSERT, UPDATE, DELETE ON identity.platform_admins,
--         identity.platform_invoices TO app_user;
-- idempotent: REVOKE/GRANT تکراری بی‌اثر است.
-- ============================================================================

REVOKE ALL ON identity.platform_admins   FROM app_user;
REVOKE ALL ON identity.platform_invoices FROM app_user;

-- platform_admin صراحتاً دسترسی دارد (قبلاً از 900 بود؛ اینجا مستقل از آن تضمین می‌شود)
GRANT SELECT, INSERT, UPDATE, DELETE ON identity.platform_admins, identity.platform_invoices TO platform_admin;

-- sequence‌های این جدول‌ها (اگر وجود دارند) هم از app_user گرفته شود
DO $$
DECLARE s record;
BEGIN
  FOR s IN
    SELECT n.nspname, c.relname
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_depend d ON d.objid = c.oid AND d.deptype IN ('a','i')
      JOIN pg_class t ON t.oid = d.refobjid
     WHERE c.relkind = 'S' AND n.nspname = 'identity' AND t.relname IN ('platform_admins','platform_invoices')
  LOOP
    EXECUTE format('REVOKE ALL ON SEQUENCE %I.%I FROM app_user', s.nspname, s.relname);
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %I.%I TO platform_admin', s.nspname, s.relname);
  END LOOP;
END $$;

-- تضمین: app_user هیچ دسترسی‌ای روی این دو جدول ندارد
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['identity.platform_admins','identity.platform_invoices'] LOOP
    IF has_table_privilege('app_user', t, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
      RAISE EXCEPTION '907: app_user هنوز به % دسترسی دارد', t;
    END IF;
  END LOOP;
END $$;
