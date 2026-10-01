-- ============================================================================
-- ۰۰۲ — صندوق اعلان داخل برنامه (in-app inbox)
-- ============================================================================
-- تا امروز اعلان‌های داخل برنامه فقط در استور کلاینت بودند و بین دستگاه‌ها مشترک نبودند.
-- ماژول ساکنین/خانوار و رزرو مشاعات اعلان‌هایشان را اینجا می‌نویسند تا والد روی گوشی
-- خودش درخواست کودک را ببیند و مسئول مشاعات درخواست رزرو را. push/SMS همچنان از مسیر
-- RabbitMQ → notification-svc ارسال می‌شود.
--
-- گیرنده یکی از این‌هاست:
--   recipient_person  ← residency.users.id (ساکن/کودک/والد — مستقل از حساب ورود)
--   recipient_login   ← identity.users.id (مدیر، کارمند مشخص)
--   recipient_role    ← 'admin' | 'guard' | 'accountant' | 'perm:amenity_desk' | 'perm:security' …
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS notification;

CREATE TABLE IF NOT EXISTS notification.inbox (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL,
  recipient_person uuid,
  recipient_login  uuid,
  recipient_role   text,
  kind             text NOT NULL,              -- مثلاً child_request، join_request، reservation_pending
  title            text NOT NULL,
  body             text,
  link             text,                       -- مسیر فرانت برای باز کردن
  ref_id           uuid,                       -- شناسه‌ی موجودیت مرتبط
  read_at          timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inbox_recipient_check CHECK (
    recipient_person IS NOT NULL OR recipient_login IS NOT NULL OR recipient_role IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS inbox_person_idx ON notification.inbox (recipient_person, created_at DESC) WHERE recipient_person IS NOT NULL;
CREATE INDEX IF NOT EXISTS inbox_login_idx ON notification.inbox (recipient_login, created_at DESC) WHERE recipient_login IS NOT NULL;
CREATE INDEX IF NOT EXISTS inbox_role_idx ON notification.inbox (tenant_id, recipient_role, created_at DESC) WHERE recipient_role IS NOT NULL;

-- خوانده‌شدن اعلان نقش‌محور برای هر کاربر جداست (همان رفتار استور کلاینت)
CREATE TABLE IF NOT EXISTS notification.inbox_reads (
  inbox_id  uuid NOT NULL REFERENCES notification.inbox(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  reader    uuid NOT NULL,                      -- identity.users.id یا residency.users.id
  read_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (inbox_id, reader)
);

GRANT USAGE ON SCHEMA notification TO app_user, platform_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON notification.inbox, notification.inbox_reads TO app_user, platform_admin;

DO $rls$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['inbox', 'inbox_reads'] LOOP
    EXECUTE format('ALTER TABLE notification.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE notification.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON notification.%I', 'tenant_isolation_' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON notification.%I USING (tenant_id = platform.current_tenant_id())'
      || ' WITH CHECK (tenant_id = platform.current_tenant_id())', 'tenant_isolation_' || t, t);
  END LOOP;
END
$rls$;
CREATE INDEX IF NOT EXISTS inbox_tenant_id_idx ON notification.inbox (tenant_id);
CREATE INDEX IF NOT EXISTS inbox_reads_tenant_id_idx ON notification.inbox_reads (tenant_id);
