-- ============================================================================
-- 006 — قوانین برج: مهلت بدهکاری و محدودیت بخش‌ها/مشاعات برای واحد بدهکار
-- ============================================================================
-- مدیر ساختمان در پنل «قوانین و برج» تعیین می‌کند:
--   • واحد بعد از چند روز از سررسید شارژ «بدهکار» حساب شود (debtor_grace_days)
--   • کدام بخش‌ها یا کدام مشاع برای واحد بدهکار بسته باشد (debtor_restrictions)
--
-- کلیدهای debtor_restrictions (مقدار true یعنی «محدود برای واحد بدهکار»):
--   module:food · module:guest · module:amenity (همه‌ی مشاعات)
--   amenity:<uuid>                                (فقط همان مشاع)
-- بخش‌های مالی، اعلانات، تیکت، مرسوله و تماس اضطراری هرگز قابل محدودسازی نیستند
-- (ساکن بدهکار باید بتواند شارژ را بپردازد و به کمک اضطراری دسترسی داشته باشد).
--
-- محدودیت را سرویس‌ها از همین توابع می‌خوانند تا یک منبع حقیقت باشد:
--   residency.unit_overdue_days(unit)       بیشترین روز تأخیر شارژ پرداخت‌نشده
--   residency.unit_is_debtor(unit)          تأخیر ≥ مهلت ساختمان (و حداقل ۱ روز)
--   residency.unit_restricted(unit, scope)  بدهکار است و scope هم محدود شده است
-- ============================================================================

CREATE TABLE IF NOT EXISTS residency.building_rules (
  tenant_id            uuid PRIMARY KEY REFERENCES identity.tenants(id) ON DELETE CASCADE,
  debtor_grace_days    integer NOT NULL DEFAULT 30,
  debtor_restrictions  jsonb   NOT NULL DEFAULT '{}'::jsonb,
  updated_by           uuid,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT building_rules_grace_check CHECK (debtor_grace_days BETWEEN 0 AND 365),
  CONSTRAINT building_rules_restrictions_check CHECK (jsonb_typeof(debtor_restrictions) = 'object')
);

-- ── توابع مشترک (SECURITY INVOKER: RLS همان tenant جاری اعمال می‌شود) ────────

CREATE OR REPLACE FUNCTION residency.unit_overdue_days(p_unit uuid) RETURNS integer
LANGUAGE sql STABLE AS $fn$
  SELECT COALESCE(max(((now() AT TIME ZONE 'Asia/Tehran')::date - c.due_date)), 0)::integer
    FROM finance.monthly_charges c
   WHERE c.unit_id = p_unit
     AND c.status IN ('pending', 'overdue')
     AND c.due_date IS NOT NULL
     AND c.due_date < (now() AT TIME ZONE 'Asia/Tehran')::date
$fn$;

CREATE OR REPLACE FUNCTION residency.unit_is_debtor(p_unit uuid) RETURNS boolean
LANGUAGE sql STABLE AS $fn$
  SELECT d > 0 AND d >= COALESCE(
           (SELECT r.debtor_grace_days FROM residency.building_rules r
             WHERE r.tenant_id = (SELECT u.tenant_id FROM property.units u WHERE u.id = p_unit)), 30)
    FROM (SELECT residency.unit_overdue_days(p_unit) AS d) x
$fn$;

CREATE OR REPLACE FUNCTION residency.unit_restricted(p_unit uuid, p_scope text) RETURNS boolean
LANGUAGE sql STABLE AS $fn$
  SELECT COALESCE((
           SELECT (r.debtor_restrictions ->> p_scope)::boolean
             FROM residency.building_rules r
            WHERE r.tenant_id = (SELECT u.tenant_id FROM property.units u WHERE u.id = p_unit)
         ), false)
         AND residency.unit_is_debtor(p_unit)
$fn$;

-- ── دسترسی و RLS ───────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON residency.building_rules TO app_user, platform_admin;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA residency TO app_user, platform_admin;

ALTER TABLE residency.building_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE residency.building_rules FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_building_rules ON residency.building_rules;
CREATE POLICY tenant_isolation_building_rules ON residency.building_rules
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());
CREATE INDEX IF NOT EXISTS building_rules_tenant_id_idx ON residency.building_rules (tenant_id);
