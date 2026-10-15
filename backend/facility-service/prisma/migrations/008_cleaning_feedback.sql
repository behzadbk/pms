-- ============================================================================
-- ۰۰۸ — بازخورد ساکن از نظافت منزل (نمره‌ی ۱ تا ۵ + دلیل)
-- ============================================================================
-- بعد از هر نظافتِ ثبت‌شده، ساکن واحد می‌تواند ستاره بدهد. ۴ و ۵ فقط نمره است؛ ۱ تا ۳ باید دلیل آماده
-- (reasons: کدهای ثابت) یا متن آزاد داشته باشد. بازخوردِ بد برای مدیر و «مسئول نظافت» اعلان می‌شود.
-- هر نظافت فقط یک بازخورد دارد. idempotent.
-- ============================================================================

CREATE TABLE IF NOT EXISTS entitlement.cleaning_feedback (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL,
  session_id uuid NOT NULL UNIQUE REFERENCES entitlement.cleaning_sessions(id),
  unit_id    uuid NOT NULL,
  cleaner_id uuid NOT NULL,                       -- identity.users.id نظافتچی (کپی از جلسه برای گزارش سریع)
  rating     smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  reasons    text[] NOT NULL DEFAULT '{}',
  comment    text,
  rated_by   uuid NOT NULL,                       -- identity.users.id ساکن
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (rating >= 4 OR cardinality(reasons) > 0 OR comment IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS cleaning_feedback_cleaner_idx ON entitlement.cleaning_feedback (tenant_id, cleaner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS cleaning_feedback_unit_idx ON entitlement.cleaning_feedback (tenant_id, unit_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON entitlement.cleaning_feedback TO app_user, platform_admin;

ALTER TABLE entitlement.cleaning_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE entitlement.cleaning_feedback FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_cleaning_feedback ON entitlement.cleaning_feedback;
CREATE POLICY tenant_isolation_cleaning_feedback ON entitlement.cleaning_feedback
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());
CREATE INDEX IF NOT EXISTS cleaning_feedback_tenant_id_idx ON entitlement.cleaning_feedback (tenant_id);

DO $$
DECLARE bad text;
BEGIN
  SELECT string_agg(c.relname, ', ') INTO bad
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'entitlement' AND c.relkind = 'r'
     AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity
          OR NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid
                          AND pg_get_expr(p.polwithcheck, p.polrelid) LIKE '%platform.current_tenant_id()%'));
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'جدول(های) entitlement بدون RLS کامل: %', bad;
  END IF;
END
$$;
