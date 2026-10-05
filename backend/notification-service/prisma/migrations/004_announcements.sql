-- ============================================================================
-- ۰۰۴ — اعلانات و نظرسنجی‌ها
-- ============================================================================
-- announcements  : اعلان یا نظرسنجی؛ audience = کلیدهایی مثل all_residents | owners | tenants |
--                  staff | guard | accountant | building:<uuid> | unit:<uuid>
-- poll_questions / poll_options : ساختار نظرسنجی (تک‌گزینه‌ای یا چندگزینه‌ای)
-- poll_ballots   : هر نفر (شخص یا حساب ورود) فقط یک بار برای هر نظرسنجی
-- poll_votes     : گزینه‌های انتخاب‌شده (weight = متراژ واحد اگر نظرسنجی وزن‌دار باشد)
-- idempotent.
-- ============================================================================
CREATE TABLE IF NOT EXISTS notification.announcements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  kind            text NOT NULL DEFAULT 'announcement',
  title           text NOT NULL,
  body            text NOT NULL DEFAULT '',
  emergency       boolean NOT NULL DEFAULT false,
  pinned          boolean NOT NULL DEFAULT false,
  audience        text[] NOT NULL DEFAULT '{}',
  weighted        boolean NOT NULL DEFAULT false,
  closes_at       timestamptz,
  expires_at      timestamptz,
  created_by      uuid,
  created_by_name text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT announcements_kind_check CHECK (kind IN ('announcement','poll'))
);
CREATE INDEX IF NOT EXISTS announcements_tenant_idx ON notification.announcements (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS notification.poll_questions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  announcement_id uuid NOT NULL REFERENCES notification.announcements(id) ON DELETE CASCADE,
  position        smallint NOT NULL DEFAULT 0,
  text            text NOT NULL,
  multi           boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS poll_questions_ann_idx ON notification.poll_questions (announcement_id, position);

CREATE TABLE IF NOT EXISTS notification.poll_options (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  question_id uuid NOT NULL REFERENCES notification.poll_questions(id) ON DELETE CASCADE,
  position    smallint NOT NULL DEFAULT 0,
  label       text NOT NULL
);
CREATE INDEX IF NOT EXISTS poll_options_q_idx ON notification.poll_options (question_id, position);

CREATE TABLE IF NOT EXISTS notification.poll_ballots (
  tenant_id       uuid NOT NULL,
  announcement_id uuid NOT NULL REFERENCES notification.announcements(id) ON DELETE CASCADE,
  voter           uuid NOT NULL,
  weight          numeric NOT NULL DEFAULT 1,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (announcement_id, voter)
);

CREATE TABLE IF NOT EXISTS notification.poll_votes (
  tenant_id       uuid NOT NULL,
  announcement_id uuid NOT NULL REFERENCES notification.announcements(id) ON DELETE CASCADE,
  question_id     uuid NOT NULL REFERENCES notification.poll_questions(id) ON DELETE CASCADE,
  option_id       uuid NOT NULL REFERENCES notification.poll_options(id) ON DELETE CASCADE,
  voter           uuid NOT NULL,
  weight          numeric NOT NULL DEFAULT 1,
  PRIMARY KEY (question_id, option_id, voter)
);
CREATE INDEX IF NOT EXISTS poll_votes_ann_idx ON notification.poll_votes (announcement_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON
  notification.announcements, notification.poll_questions, notification.poll_options,
  notification.poll_ballots, notification.poll_votes TO app_user, platform_admin;

DO $rls$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['announcements','poll_questions','poll_options','poll_ballots','poll_votes'] LOOP
    EXECUTE format('ALTER TABLE notification.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE notification.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON notification.%I', 'tenant_isolation_' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON notification.%I USING (tenant_id = platform.current_tenant_id())'
      || ' WITH CHECK (tenant_id = platform.current_tenant_id())', 'tenant_isolation_' || t, t);
  END LOOP;
END
$rls$;
