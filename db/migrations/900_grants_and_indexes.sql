-- ============================================================================
-- 900 — دسترسی‌ها، ایندکس‌های tenant و بررسی نهایی سلامت اسکیما
-- ============================================================================
-- این فایل همیشه *آخرین* مایگریشن است و روی همه‌ی اسکیماهای دامنه‌ای sweep می‌کند،
-- تا اگر سرویسی در آینده جدول جدیدی اضافه کرد، از قلم نیفتد.
-- ============================================================================

DO $$
DECLARE s text;
BEGIN
  FOREACH s IN ARRAY ARRAY['identity','property','facility','finance','guard','notification','audit','fnb']
  LOOP
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO app_user, platform_admin', s);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO app_user, platform_admin', s);
    EXECUTE format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA %I TO app_user, platform_admin', s);
    -- جداولی که *بعداً* ساخته می‌شوند هم خودکار دسترسی بگیرند
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user, platform_admin', s);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT USAGE, SELECT ON SEQUENCES TO app_user, platform_admin', s);
  END LOOP;
END
$$;

-- app_user نباید بتواند ساختار دیتابیس را عوض کند
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- --- ایندکس tenant_id روی هر جدول tenant‌دار --------------------------------
-- هر Query اپلیکیشن به‌خاطر RLS یک شرط tenant_id = ... دارد؛ بدون این ایندکس‌ها
-- با رشد داده‌ها همه‌ی آن‌ها به Seq Scan می‌افتند.
DO $$
DECLARE r record; idx text;
BEGIN
  FOR r IN
    SELECT n.nspname AS sch, c.relname AS tbl
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname IN ('identity','property','facility','finance','guard','notification','audit','fnb')
       AND c.relkind IN ('r','p')
       AND c.relispartition = false
       AND EXISTS (SELECT 1 FROM pg_attribute a
                    WHERE a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped)
  LOOP
    idx := r.tbl || '_tenant_id_idx';
    IF NOT EXISTS (SELECT 1 FROM pg_class i JOIN pg_namespace n2 ON n2.oid = i.relnamespace
                    WHERE n2.nspname = r.sch AND i.relname = idx) THEN
      EXECUTE format('CREATE INDEX %I ON %I.%I (tenant_id)', idx, r.sch, r.tbl);
    END IF;
  END LOOP;
END
$$;

-- --- بررسی نهایی: هیچ جدول tenant‌داری بدون RLS نماند -----------------------
DO $$
DECLARE missing text;
BEGIN
  SELECT string_agg(n.nspname || '.' || c.relname, ', ')
    INTO missing
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname IN ('identity','property','facility','finance','guard','notification','audit','fnb')
     AND c.relkind IN ('r','p')
     AND c.relispartition = false
     AND EXISTS (SELECT 1 FROM pg_attribute a
                  WHERE a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped)
     AND (c.relrowsecurity = false OR c.relforcerowsecurity = false);

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'جدول(های) tenant‌دار بدون RLS کامل: %', missing;
  END IF;
END
$$;
