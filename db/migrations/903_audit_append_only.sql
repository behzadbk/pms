-- ============================================================================
-- 903 — لاگ audit فقط-افزودنی (append-only) برای نقش‌های اپلیکیشن (issue #24)
-- ============================================================================
-- مشکل: 900 به همه‌ی جداول اسکیمای audit (از جمله پارتیشن‌های ماهانه‌ی event_logs_YYYY_MM) دسترسی
-- SELECT/INSERT/UPDATE/DELETE داده بود و ALTER DEFAULT PRIVILEGES همین را روی پارتیشن‌های آینده
-- (که ensure_month_partition با SECURITY DEFINER می‌سازد) هم اعمال می‌کند. پس هر باگ/تزریق SQL در سرویسی
-- که با app_user وصل است می‌توانست لاگ audit را ویرایش یا پاک کند.
-- audit-service فقط SELECT و INSERT روی audit.event_logs می‌زند (بررسی‌شده در کد) و هیچ سرویسی UPDATE/DELETE
-- نمی‌زند؛ نگهداری/حذف پارتیشن‌های قدیمی (retention) باید با نقش مالک (migrator) و DROP/DETACH PARTITION انجام شود.
-- idempotent: REVOKE روی دسترسی‌ای که وجود ندارد بی‌اثر است. داده و ساختار جدول‌ها تغییر نمی‌کند.
-- ============================================================================

REVOKE UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA audit FROM app_user, platform_admin;

-- پارتیشن‌های آینده (ساخته‌شده توسط ensure_month_partition با نقش مالک) هم دسترسی نوشتن/حذف نگیرند
ALTER DEFAULT PRIVILEGES IN SCHEMA audit REVOKE UPDATE, DELETE, TRUNCATE ON TABLES FROM app_user, platform_admin;

-- اطمینان از اینکه همچنان می‌توانند لاگ بنویسند و بخوانند
GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA audit TO app_user, platform_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA audit GRANT SELECT, INSERT ON TABLES TO app_user, platform_admin;

-- بررسی نهایی: هیچ نقش اپلیکیشنی نباید روی جدول/پارتیشن audit دسترسی UPDATE/DELETE/TRUNCATE داشته باشد
DO $$
DECLARE bad int;
BEGIN
  SELECT count(*) INTO bad
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN (VALUES ('app_user'), ('platform_admin')) AS r(role)
   WHERE n.nspname = 'audit' AND c.relkind IN ('r','p')
     AND (has_table_privilege(r.role, c.oid, 'UPDATE')
       OR has_table_privilege(r.role, c.oid, 'DELETE')
       OR has_table_privilege(r.role, c.oid, 'TRUNCATE'));
  IF bad > 0 THEN
    RAISE EXCEPTION 'audit append-only violated: % table/role pairs still have UPDATE/DELETE/TRUNCATE', bad;
  END IF;
END
$$;
