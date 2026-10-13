-- ============================================================================
-- ۰۰۷ — جلسه‌های نظافت منزل (پنل «نظافت منازل»)
-- ============================================================================
-- نظافتچیِ تیم «نظافت منازل» واحد را انتخاب می‌کند، ساعت شروع و پایان را ثبت می‌کند (دکمه‌ی شروع/پایان
-- یا ثبت دستی) و مدت کار از سهمیه‌ی ساعتِ «خانه‌داری» همان واحد کم می‌شود؛ بخش مازاد طبق نرخ شیفت
-- محاسبه و مثل بقیه‌ی آفرها به شارژ ماه بعد واحد اضافه می‌شود.
--
-- خودِ «مصرف» همچنان در entitlement.usage_events (موتور آفرها) ثبت می‌شود تا سهم‌بندی، گزارش‌ها،
-- شارژ ماه بعد و اعلان ساکن هیچ مسیر موازی نداشته باشد. این جدول فقط «ساعت شروع/پایان و کارمند» را نگه می‌دارد.
--
--  running   : نظافت در جریان (هنوز مصرفی ثبت نشده)
--  done      : پایان‌یافته؛ usage_event_id مصرف ثبت‌شده است
--  cancelled : شروعِ اشتباه که پیش از پایان لغو شد (هیچ مصرفی ثبت نشده)
--  void      : پس از ثبت، باطل شد (مصرف مرتبط هم باطل شده)
--
-- idempotent.
-- ============================================================================

CREATE TABLE IF NOT EXISTS entitlement.cleaning_sessions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL,
  unit_id        uuid NOT NULL,
  cleaner_id     uuid NOT NULL,                       -- identity.users.id کارمند
  started_at     timestamptz NOT NULL,
  ended_at       timestamptz,
  status         text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'done', 'cancelled', 'void')),
  entry          text NOT NULL DEFAULT 'timer' CHECK (entry IN ('timer', 'manual')),
  note           text,
  usage_event_id uuid REFERENCES entitlement.usage_events(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (ended_at IS NULL OR ended_at > started_at),
  CHECK (status NOT IN ('done', 'void') OR (ended_at IS NOT NULL AND usage_event_id IS NOT NULL))
);

-- هر نظافتچی در هر لحظه فقط یک نظافتِ در جریان دارد
CREATE UNIQUE INDEX IF NOT EXISTS cleaning_sessions_one_running_idx
  ON entitlement.cleaning_sessions (cleaner_id) WHERE status = 'running';
CREATE INDEX IF NOT EXISTS cleaning_sessions_cleaner_idx ON entitlement.cleaning_sessions (tenant_id, cleaner_id, started_at DESC);
CREATE INDEX IF NOT EXISTS cleaning_sessions_unit_idx ON entitlement.cleaning_sessions (tenant_id, unit_id, started_at DESC);

-- منبعِ مصرفِ جدید: «cleaner» (ثبت توسط نظافتچی)
DO $src$
DECLARE c text;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'entitlement.usage_events'::regclass AND contype = 'c'
       AND pg_get_constraintdef(oid) LIKE '%source%'
  LOOP
    EXECUTE format('ALTER TABLE entitlement.usage_events DROP CONSTRAINT %I', c);
  END LOOP;
  ALTER TABLE entitlement.usage_events
    ADD CONSTRAINT usage_events_source_check CHECK (source IN ('desk', 'qr_guest', 'cleaner'));
END
$src$;

-- --- دسترسی‌ها + RLS (مستقل از 900، مثل 005) ---------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON entitlement.cleaning_sessions TO app_user, platform_admin;

ALTER TABLE entitlement.cleaning_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE entitlement.cleaning_sessions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_cleaning_sessions ON entitlement.cleaning_sessions;
CREATE POLICY tenant_isolation_cleaning_sessions ON entitlement.cleaning_sessions
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());
CREATE INDEX IF NOT EXISTS cleaning_sessions_tenant_id_idx ON entitlement.cleaning_sessions (tenant_id);

-- --- بررسی نهایی: هر جدول tenant‌دارِ این اسکیما باید RLS کامل داشته باشد --------------------------------
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
