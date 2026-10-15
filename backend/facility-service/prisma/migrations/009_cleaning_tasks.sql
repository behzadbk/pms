-- ============================================================================
-- ۰۰۹ — کارهای نظافت: درخواست ساکن، برنامه‌ی مسئول نظافت و واگذاری به کادر
-- ============================================================================
-- دپارتمان نظافت یک مسئول دارد. درخواست نظافت منزل (از ساکن) و کارهایی که خودِ مسئول می‌چیند
-- (نظافت منزل، مشاعات برج، کار موردی) همه یک «کار» (cleaning_tasks) هستند:
--   new → assigned (مسئول به یکی از کادر واگذار می‌کند) → in_progress → done  |  cancelled
-- نظافتچی فقط کارهای واگذارشده به خودش را انجام می‌دهد. کار از نوع «منزل» با ثبت ساعت (cleaning_sessions) و
-- کسر از سهمیه‌ی آفر انجام می‌شود؛ مشاعات و موردی فقط زمان کار را ثبت می‌کنند (بدون سهمیه/شارژ).
-- idempotent.
-- ============================================================================

CREATE TABLE IF NOT EXISTS entitlement.cleaning_tasks (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL,
  kind           text NOT NULL CHECK (kind IN ('unit', 'common', 'custom')),
  unit_id        uuid,                                  -- فقط kind='unit'
  title          text NOT NULL CHECK (char_length(title) BETWEEN 2 AND 120),
  details        text CHECK (details IS NULL OR char_length(details) <= 500),
  source         text NOT NULL DEFAULT 'supervisor' CHECK (source IN ('resident', 'supervisor')),
  requested_by   uuid NOT NULL,                         -- identity.users.id (ساکن یا مسئول)
  want_date      date,                                  -- روز دلخواه ساکن / برنامه‌ی مسئول
  want_slot      text NOT NULL DEFAULT 'any' CHECK (want_slot IN ('any', 'morning', 'afternoon', 'evening')),
  status         text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'assigned', 'in_progress', 'done', 'cancelled')),
  assignee_id    uuid,                                  -- identity.users.id نظافتچی
  assigned_by    uuid,
  assigned_at    timestamptz,
  session_id     uuid,                                  -- cleaning_sessions.id (kind='unit')
  started_at     timestamptz,                           -- kind≠'unit'
  done_at        timestamptz,
  done_note      text CHECK (done_note IS NULL OR char_length(done_note) <= 200),
  cancel_reason  text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (kind <> 'unit' OR unit_id IS NOT NULL),
  CHECK (status IN ('new', 'cancelled') OR assignee_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS cleaning_tasks_status_idx   ON entitlement.cleaning_tasks (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS cleaning_tasks_assignee_idx ON entitlement.cleaning_tasks (tenant_id, assignee_id, status);
CREATE INDEX IF NOT EXISTS cleaning_tasks_unit_idx     ON entitlement.cleaning_tasks (tenant_id, unit_id, created_at DESC);

ALTER TABLE entitlement.cleaning_sessions ADD COLUMN IF NOT EXISTS task_id uuid;
CREATE INDEX IF NOT EXISTS cleaning_sessions_task_idx ON entitlement.cleaning_sessions (task_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON entitlement.cleaning_tasks TO app_user, platform_admin;

ALTER TABLE entitlement.cleaning_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE entitlement.cleaning_tasks FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_cleaning_tasks ON entitlement.cleaning_tasks;
CREATE POLICY tenant_isolation_cleaning_tasks ON entitlement.cleaning_tasks
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());
CREATE INDEX IF NOT EXISTS cleaning_tasks_tenant_id_idx ON entitlement.cleaning_tasks (tenant_id);

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
