-- این migration دستی، مکمل migrationهای تولیدشده توسط Prisma است؛
-- Prisma به‌تنهایی RLS Policy نمی‌سازد، پس این بخش همیشه به‌صورت SQL خام اجرا می‌شود.
-- اجرا: بعد از `prisma migrate deploy`، به‌عنوان یک migration جداگانه یا در K8s Migration Job (بخش ۷ سند اصلی).

CREATE SCHEMA IF NOT EXISTS identity;

-- نقش اپلیکیشن (بدون BYPASSRLS) — Connection Pool اصلی سرویس‌ها فقط با این نقش وصل می‌شود
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user LOGIN PASSWORD 'CHANGE_ME_IN_SECRET';
  END IF;
END
$$;

-- نقش مخصوص پنل Super-Admin (پرس‌وجوهای cross-tenant) — با احتیاط و فقط برای گزارش‌گیری
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'platform_admin') THEN
    CREATE ROLE platform_admin LOGIN PASSWORD 'CHANGE_ME_IN_SECRET' BYPASSRLS;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA identity TO app_user, platform_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA identity TO app_user, platform_admin;

-- توجه: جدول identity.tenants عمداً RLS ندارد — چون در لحظه لاگین (پیش از شناخته‌شدن
-- tenant) باید بتوان آن را با subdomain جستجو کرد (به همین دلیل AuthService از
-- withPlatformAccess برای این یک query خاص استفاده می‌کند، نه withTenant).



-- همین الگو (ENABLE ROW LEVEL SECURITY + CREATE POLICY tenant_isolation_<table>)
-- باید برای هر جدول دامنه‌ای در بقیه ۵ سرویس هم تکرار شود.

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
     WHERE n.nspname = 'identity'
       AND c.relkind IN ('r', 'p')
       AND c.relispartition = false
       AND EXISTS (SELECT 1 FROM pg_attribute a
                    WHERE a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped)
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', 'identity', t);
    EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY', 'identity', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', 'tenant_isolation_' || t, 'identity', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I.%I USING (tenant_id = platform.current_tenant_id())'
      || ' WITH CHECK (tenant_id = platform.current_tenant_id())',
      'tenant_isolation_' || t, 'identity', t);
  END LOOP;
END
$rls$;
