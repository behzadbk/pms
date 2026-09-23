-- Schema و RLS برای audit-svc — بخش ۲.۱ سند docs/UPDATE-V2-AUDIT-FNB-DESIGN.md
CREATE SCHEMA IF NOT EXISTS audit;

CREATE TABLE IF NOT EXISTS audit.event_logs (
  id            BIGSERIAL,
  tenant_id     UUID NOT NULL,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  session_id    UUID NOT NULL,
  trace_id      UUID,
  user_id       UUID,
  actor_role    TEXT,
  source        TEXT NOT NULL,
  level         TEXT NOT NULL CHECK (level IN ('debug','info','warn','error')),
  action        TEXT NOT NULL,
  http_method   TEXT,
  http_path     TEXT,
  status_code   INT,
  duration_ms   INT,
  device        JSONB,
  request_body  JSONB,
  response_body JSONB,
  error_stack   TEXT,
  PRIMARY KEY (id, occurred_at)
) PARTITION BY RANGE (occurred_at);

-- پارتیشن‌ها ماهانه‌اند و پس از ۹۰ روز آرشیو/DROP می‌شوند.
-- پیش‌تر پارتیشن به‌صورت هاردکد (2026_09) ساخته می‌شد؛ یعنی از ماه بعد هر INSERT
-- با خطای «no partition of relation found» رد می‌شد. این تابع جایگزین آن است و
-- می‌تواند هم در مایگریشن و هم از یک Cron Job ماهانه صدا زده شود.
CREATE OR REPLACE FUNCTION audit.ensure_month_partition(p_month date)
RETURNS void LANGUAGE plpgsql AS $part$
DECLARE
  start_at date := date_trunc('month', p_month)::date;
  end_at   date := (date_trunc('month', p_month) + interval '1 month')::date;
  part_name text := 'event_logs_' || to_char(start_at, 'YYYY_MM');
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'audit' AND c.relname = part_name
  ) THEN
    EXECUTE format(
      'CREATE TABLE audit.%I PARTITION OF audit.event_logs FOR VALUES FROM (%L) TO (%L)',
      part_name, start_at, end_at);
  END IF;
END
$part$;

-- ماه جاری + ۳ ماه آینده، تا نبودِ Cron Job باعث قطع شدن لاگ‌ها نشود
DO $$
DECLARE i int;
BEGIN
  FOR i IN 0..3 LOOP
    PERFORM audit.ensure_month_partition((CURRENT_DATE + (i || ' month')::interval)::date);
  END LOOP;
END
$$;

CREATE INDEX IF NOT EXISTS idx_logs_tenant_time ON audit.event_logs (tenant_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_session ON audit.event_logs (session_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_logs_errors ON audit.event_logs (tenant_id, level, occurred_at DESC)
  WHERE level IN ('warn','error');
CREATE INDEX IF NOT EXISTS idx_logs_device ON audit.event_logs USING gin (device jsonb_path_ops);


GRANT USAGE ON SCHEMA audit TO app_user;
GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA audit TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA audit TO app_user;

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
     WHERE n.nspname = 'audit'
       AND c.relkind IN ('r', 'p')
       AND c.relispartition = false
       AND EXISTS (SELECT 1 FROM pg_attribute a
                    WHERE a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped)
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', 'audit', t);
    EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY', 'audit', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', 'tenant_isolation_' || t, 'audit', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I.%I USING (tenant_id = platform.current_tenant_id())'
      || ' WITH CHECK (tenant_id = platform.current_tenant_id())',
      'tenant_isolation_' || t, 'audit', t);
  END LOOP;
END
$rls$;
