-- ============================================================================
-- integration-service 001 — اتصال Livo به ERP / نرم‌افزار حسابداری ساختمان
-- ----------------------------------------------------------------------------
-- جهت داده: Livo → ERP. ما داده‌ی عملیاتی و مالیِ تولیدشده در Livo (شارژ صادرشده، پرداخت،
-- فاکتور هزینه، اقلام شارژ متغیر کافه/رستوران و مازاد خدمات، واحدها، اشخاص، کارکنان) را
-- در اختیار ERP می‌گذاریم؛ ERP حسابداری را انجام می‌دهد.
--
--   api_keys     کلید دسترسی سرور‌به‌سرور ERP (هش SHA-256، خود کلید هرگز ذخیره نمی‌شود)
--   outbox       فید تغییرات: هر INSERT/UPDATE/DELETE روی جدول‌های مرتبط با trigger ثبت می‌شود
--                (بدون تغییر در کد سرویس‌های دیگر؛ ترتیب با seq تضمین است)
--   sync_state   شماره سند/وضعیتی که ERP برای هر رکورد ما گزارش می‌کند (فقط مرجع، نه داده‌ی حسابداری)
--   connectors   مقصدهای ارسال خودکار (push) به ERP با cursor روی outbox
--   deliveries   گزارش هر تلاش ارسال
--
-- همه‌ی جدول‌ها tenant_id دارند و ENABLE+FORCE RLS با WITH CHECK روی platform.current_tenant_id().
-- idempotent: اجرای دوباره بی‌خطر است.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS integration;

CREATE TABLE IF NOT EXISTS integration.api_keys (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  name          text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  key_prefix    text NOT NULL,
  key_hash      text NOT NULL UNIQUE,
  scopes        text[] NOT NULL DEFAULT ARRAY['read','sync']::text[]
                CHECK (scopes <@ ARRAY['read','sync']::text[] AND cardinality(scopes) > 0),
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  expires_at    timestamptz,
  last_used_at  timestamptz,
  last_used_ip  text,
  created_by    uuid,
  created_by_name text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  revoked_at    timestamptz
);
CREATE INDEX IF NOT EXISTS api_keys_tenant_idx ON integration.api_keys (tenant_id, status);

CREATE TABLE IF NOT EXISTS integration.outbox (
  seq          bigserial PRIMARY KEY,
  tenant_id    uuid NOT NULL,
  entity       text NOT NULL,
  entity_id    uuid NOT NULL,
  action       text NOT NULL CHECK (action IN ('created','updated','deleted')),
  occurred_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS outbox_tenant_seq_idx ON integration.outbox (tenant_id, seq);
CREATE INDEX IF NOT EXISTS outbox_entity_idx ON integration.outbox (tenant_id, entity, entity_id);

CREATE TABLE IF NOT EXISTS integration.sync_state (
  tenant_id    uuid NOT NULL,
  entity       text NOT NULL,
  entity_id    uuid NOT NULL,
  status       text NOT NULL CHECK (status IN ('synced','failed','skipped')),
  erp_ref      text,
  message      text,
  reported_by  uuid,
  synced_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, entity, entity_id)
);
CREATE INDEX IF NOT EXISTS sync_state_status_idx ON integration.sync_state (tenant_id, status);

CREATE TABLE IF NOT EXISTS integration.connectors (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  name            text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  type            text NOT NULL DEFAULT 'webhook',
  url             text NOT NULL,
  secret          text NOT NULL,
  config          jsonb NOT NULL DEFAULT '{}'::jsonb,
  entities        text[] NOT NULL DEFAULT ARRAY['*']::text[],
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused')),
  cursor_seq      bigint NOT NULL DEFAULT 0,
  batch_size      integer NOT NULL DEFAULT 50 CHECK (batch_size BETWEEN 1 AND 500),
  failure_count   integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz,
  last_status     text,
  last_error      text,
  last_success_at timestamptz,
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS connectors_tenant_idx ON integration.connectors (tenant_id, status);

CREATE TABLE IF NOT EXISTS integration.deliveries (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  connector_id  uuid NOT NULL REFERENCES integration.connectors(id) ON DELETE CASCADE,
  from_seq      bigint NOT NULL,
  to_seq        bigint NOT NULL,
  event_count   integer NOT NULL,
  attempt       integer NOT NULL,
  success       boolean NOT NULL,
  status_code   integer,
  error         text,
  duration_ms   integer,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS deliveries_connector_idx ON integration.deliveries (connector_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- capture trigger: هر تغییر را در outbox ثبت می‌کند.
-- هرگز نباید نوشتن اصلی (پرداخت، صدور شارژ، …) را به‌خاطر لایه‌ی اتصال خراب کند → خطا فقط WARNING.
-- SECURITY DEFINER لازم نیست: trigger در همان تراکنش و با همان tenant نویسنده اجرا می‌شود
-- و RLS (WITH CHECK) فقط ردیف همان tenant را می‌پذیرد.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION integration.capture() RETURNS trigger
LANGUAGE plpgsql AS $fn$
DECLARE
  r record;
BEGIN
  IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;
  BEGIN
    INSERT INTO integration.outbox (tenant_id, entity, entity_id, action)
    VALUES (r.tenant_id, TG_ARGV[0], r.id,
            CASE TG_OP WHEN 'INSERT' THEN 'created' WHEN 'UPDATE' THEN 'updated' ELSE 'deleted' END);
  EXCEPTION WHEN others THEN
    RAISE WARNING 'integration.capture(%): %', TG_ARGV[0], SQLERRM;
  END;
  RETURN NULL;
END
$fn$;

-- (جدول، نام موجودیت در API، ستون‌هایی که تغییرشان مهم است؛ NULL = همه)
DO $tr$
DECLARE
  spec record;
BEGIN
  FOR spec IN
    SELECT * FROM (VALUES
      ('property',    'buildings',        'building',      NULL::text),
      ('property',    'units',            'unit',          NULL),
      ('residency',   'memberships',      'party',         NULL),
      ('identity',    'users',            'staff',         'full_name, phone, national_id, role, department, is_active, email, username'),
      ('finance',     'monthly_charges',  'charge',        NULL),
      ('finance',     'payments',         'payment',       NULL),
      ('finance',     'expense_invoices', 'expense',       NULL),
      ('fnb',         'orders',           'fnb_order',     'status, total, subtotal, surcharge, unit_id, billed_charge_id, bill_exempt, cancellation_reason'),
      ('entitlement', 'usage_events',     'service_usage', NULL)
    ) AS t(sch, tbl, entity, cols)
  LOOP
    IF to_regclass(spec.sch || '.' || spec.tbl) IS NULL THEN
      RAISE NOTICE 'integration: جدول %.% وجود ندارد — trigger ساخته نشد', spec.sch, spec.tbl;
      CONTINUE;
    END IF;
    EXECUTE format('DROP TRIGGER IF EXISTS integration_capture ON %I.%I', spec.sch, spec.tbl);
    IF spec.cols IS NULL THEN
      EXECUTE format(
        'CREATE TRIGGER integration_capture AFTER INSERT OR UPDATE OR DELETE ON %I.%I '
        || 'FOR EACH ROW EXECUTE FUNCTION integration.capture(%L)', spec.sch, spec.tbl, spec.entity);
    ELSE
      -- بدون این فیلتر هر ورود کاربر (last_login_at) یا تغییر وضعیت آشپزخانه یک رویداد بی‌معنی می‌ساخت
      EXECUTE format(
        'CREATE TRIGGER integration_capture AFTER INSERT OR DELETE OR UPDATE OF %s ON %I.%I '
        || 'FOR EACH ROW EXECUTE FUNCTION integration.capture(%L)', spec.cols, spec.sch, spec.tbl, spec.entity);
    END IF;
  END LOOP;
END
$tr$;

-- ---------------------------------------------------------------------------
-- دسترسی و RLS
-- ---------------------------------------------------------------------------
GRANT USAGE ON SCHEMA integration TO app_user, platform_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA integration TO app_user, platform_admin;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA integration TO app_user, platform_admin;
-- outbox فقط-افزودنی برای اپلیکیشن (مثل audit): ویرایش/حذف تاریخچه‌ی تغییرات ممکن نیست
REVOKE UPDATE, DELETE ON integration.outbox FROM app_user;

-- integration-service داده‌ی سرویس‌های دیگر را فقط می‌خواند
DO $g$
DECLARE s text;
BEGIN
  FOREACH s IN ARRAY ARRAY['property','residency','identity','finance','fnb','entitlement'] LOOP
    IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = s) THEN
      EXECUTE format('GRANT USAGE ON SCHEMA %I TO app_user', s);
      EXECUTE format('GRANT SELECT ON ALL TABLES IN SCHEMA %I TO app_user', s);
    END IF;
  END LOOP;
END
$g$;

DO $rls$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'integration' AND c.relkind IN ('r','p') AND c.relispartition = false
       AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped)
  LOOP
    EXECUTE format('ALTER TABLE integration.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE integration.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON integration.%I', 'tenant_isolation_' || t, t);
    EXECUTE format('CREATE POLICY %I ON integration.%I USING (tenant_id = platform.current_tenant_id())'
                   || ' WITH CHECK (tenant_id = platform.current_tenant_id())', 'tenant_isolation_' || t, t);
  END LOOP;
END
$rls$;

-- همان تضمین 901 برای این schema: هیچ جدول tenant‌دار بدون RLS نماند
DO $chk$
DECLARE bad text;
BEGIN
  SELECT string_agg(c.relname, ', ') INTO bad
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'integration' AND c.relkind IN ('r','p')
     AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped)
     AND (c.relrowsecurity = false OR c.relforcerowsecurity = false);
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'integration: جدول بدون RLS: %', bad;
  END IF;
END
$chk$;
