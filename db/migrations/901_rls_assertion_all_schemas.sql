-- ============================================================================
-- 901_rls_assertion_all_schemas.sql
-- بررسی نهایی RLS برای «همه‌ی» اسکیماهای tenant‌دار (از جمله residency).
-- ============================================================================
-- 900_grants_and_indexes.sql اسکیمای residency را بررسی نمی‌کرد و جدول‌هایی که
-- بعد از 900 اضافه شدند (مثل residency.*) تحت آن assertion نبودند.
-- این فایل فقط‌خواندنی و idempotent است؛ هیچ ساختاری را تغییر نمی‌دهد و اگر
-- جدول tenant‌داری بدون ENABLE+FORCE RLS یا بدون policy دارای WITH CHECK باشد،
-- مایگریشن (و در نتیجه deploy) fail می‌شود.
--
-- استثنای آگاهانه (allowlist): identity.platform_invoices — صورتحساب اشتراک
-- پلتفرم است و توسط پنل سوپرادمین روی همه‌ی tenantها خوانده می‌شود.
-- ============================================================================
DO $$
DECLARE
  no_rls text;
  no_policy text;
  bad_policy text;
BEGIN
  -- ۱) ENABLE + FORCE روی هر جدول دارای tenant_id
  SELECT string_agg(n.nspname || '.' || c.relname, ', ' ORDER BY n.nspname, c.relname)
    INTO no_rls
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname IN ('identity','property','residency','facility','finance','guard','notification','audit','fnb')
     AND c.relkind IN ('r','p')
     AND c.relispartition = false
     AND EXISTS (SELECT 1 FROM pg_attribute a
                  WHERE a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped)
     AND NOT (n.nspname = 'identity' AND c.relname = 'platform_invoices')
     AND (c.relrowsecurity = false OR c.relforcerowsecurity = false);
  IF no_rls IS NOT NULL THEN
    RAISE EXCEPTION 'جدول(های) tenant‌دار بدون ENABLE+FORCE RLS: %', no_rls;
  END IF;

  -- ۲) حداقل یک policy که هم USING و هم WITH CHECK دارد و از platform.current_tenant_id() استفاده می‌کند
  SELECT string_agg(n.nspname || '.' || c.relname, ', ' ORDER BY n.nspname, c.relname)
    INTO no_policy
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname IN ('identity','property','residency','facility','finance','guard','notification','audit','fnb')
     AND c.relkind IN ('r','p')
     AND c.relispartition = false
     AND EXISTS (SELECT 1 FROM pg_attribute a
                  WHERE a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped)
     AND NOT (n.nspname = 'identity' AND c.relname = 'platform_invoices')
     AND NOT EXISTS (
           SELECT 1 FROM pg_policy p
            WHERE p.polrelid = c.oid
              AND p.polpermissive
              -- polcmd: '*' = policy برای همه‌ی دستورها، 'a' = فقط INSERT. policyِ ایمن باید حداقل درج را با WITH CHECK پوشش بدهد
              -- (USING فقط خواندن/تغییر ردیف‌های موجود را فیلتر می‌کند و جلوی جعل tenant_id در INSERT را نمی‌گیرد).
              AND p.polcmd IN ('*', 'a')
              AND pg_get_expr(p.polwithcheck, p.polrelid) LIKE '%platform.current_tenant_id()%');
  IF no_policy IS NOT NULL THEN
    RAISE EXCEPTION 'جدول(های) tenant‌دار بدون policy دارای WITH CHECK مبتنی بر platform.current_tenant_id(): %', no_policy;
  END IF;

  -- ۲ب) هیچ policy ای نباید مستقیم از current_setting استفاده کند (fail-open در مقدار خالی)
  SELECT string_agg(p.polrelid::regclass || '.' || p.polname, ', ')
    INTO bad_policy
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname IN ('identity','property','residency','facility','finance','guard','notification','audit','fnb')
     AND (pg_get_expr(p.polqual, p.polrelid) LIKE '%current_setting%'
          OR pg_get_expr(p.polwithcheck, p.polrelid) LIKE '%current_setting%');
  IF bad_policy IS NOT NULL THEN
    RAISE EXCEPTION 'policy با current_setting مستقیم (به‌جای platform.current_tenant_id()): %', bad_policy;
  END IF;

  -- ۳) app_user نباید BYPASSRLS/SUPERUSER باشد
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user' AND (rolbypassrls OR rolsuper)) THEN
    RAISE EXCEPTION 'app_user نباید BYPASSRLS یا SUPERUSER باشد';
  END IF;
END
$$;
