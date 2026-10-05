-- ============================================================================
-- ۰۰۳ — Web Push واقعی (VAPID)
-- ============================================================================
-- push_subscriptions : اشتراک هر دستگاه/مرورگر (endpoint یکتا). گیرنده با همان منطق inbox
--                      تعیین می‌شود: person_id | login_id | role | perms.
-- push_config        : کلید VAPID (یک ردیف، توسط سرویس در اولین اجرا ساخته می‌شود؛
--                      برای ثابت ماندن اشتراک‌ها باید بین ری‌استارت‌ها حفظ شود).
-- trigger            : هر ردیف جدید inbox (از هر سرویسی) → NOTIFY inbox_new تا
--                      notification-svc بلافاصله push بفرستد.
-- idempotent.
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS notification;

CREATE TABLE IF NOT EXISTS notification.push_subscriptions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  login_id    uuid,
  person_id   uuid,
  role        text NOT NULL,
  perms       text[] NOT NULL DEFAULT '{}',
  endpoint    text NOT NULL UNIQUE,
  p256dh      text NOT NULL,
  auth        text NOT NULL,
  user_agent  text,
  failures    integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  last_sent_at timestamptz
);
CREATE INDEX IF NOT EXISTS push_subs_tenant_idx ON notification.push_subscriptions (tenant_id);
CREATE INDEX IF NOT EXISTS push_subs_person_idx ON notification.push_subscriptions (person_id) WHERE person_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS push_subs_login_idx  ON notification.push_subscriptions (login_id)  WHERE login_id IS NOT NULL;

-- پیکربندی سراسری (بدون tenant — RLS ندارد؛ فقط سرویس می‌خواند)
CREATE TABLE IF NOT EXISTS notification.push_config (
  id          smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  public_key  text NOT NULL,
  private_key text NOT NULL,
  subject     text NOT NULL DEFAULT 'mailto:admin@hamin.app',
  created_at  timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON notification.push_subscriptions TO app_user, platform_admin;
GRANT SELECT, INSERT ON notification.push_config TO app_user, platform_admin;

ALTER TABLE notification.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification.push_subscriptions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_push_subscriptions ON notification.push_subscriptions;
CREATE POLICY tenant_isolation_push_subscriptions ON notification.push_subscriptions
  USING (tenant_id = platform.current_tenant_id()) WITH CHECK (tenant_id = platform.current_tenant_id());

CREATE OR REPLACE FUNCTION notification.inbox_notify() RETURNS trigger
  LANGUAGE plpgsql AS $fn$
BEGIN
  PERFORM pg_notify('inbox_new', NEW.tenant_id::text || ':' || NEW.id::text);
  RETURN NEW;
END
$fn$;
DROP TRIGGER IF EXISTS inbox_notify_trg ON notification.inbox;
CREATE TRIGGER inbox_notify_trg AFTER INSERT ON notification.inbox
  FOR EACH ROW EXECUTE FUNCTION notification.inbox_notify();
