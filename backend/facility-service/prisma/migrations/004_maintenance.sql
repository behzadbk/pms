-- ============================================================================
-- ۰۰۴ — تیکت‌ها و سیستم نگهداری (CMMS): تجهیزات، سابقه‌ی سرویس، دستور کار، برنامه‌ی دوره‌ای
-- ============================================================================
-- tickets               : گزارش خرابی | انتقاد | پیشنهاد | پیام مستقیم به مدیر
-- ticket_events         : روند پیگیری و گفتگو (internal=true فقط برای مدیر/نگهداری دیده می‌شود)
-- assets                : تجهیز (آسانسور، موتورخانه، روشنایی، …)
-- service_records       : سابقه‌ی تعمیر/تعویض/سرویس/بازدید هر تجهیز
-- work_orders           : کار واگذارشده به کارمند دارای دسترسی «maintenance»
-- maintenance_schedules : سرویس دوره‌ای؛ هر روز یک job دستور کار می‌سازد
-- idempotent.
-- ============================================================================

-- ─── سازگاری با دیتابیس‌هایی که شکل قدیمی (مایگریشن ۰۰۳ منسوخ‌شده) را دارند ─────────
-- ۰۰۳ جدول‌های assets/tickets/ticket_events/service_records را با ستون‌های دیگری ساخته بود
-- (assigned_to/reported_by/…). اگر آن شکل هست، کنار گذاشته می‌شود (*_v003) و داده‌اش در پایان
-- همین فایل به جدول‌های جدید منتقل می‌شود. روی دیتابیس تازه هیچ کاری نمی‌کند.
DO $compat$
BEGIN
  IF to_regclass('facility.tickets') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                      WHERE table_schema = 'facility' AND table_name = 'tickets' AND column_name = 'assignee_login')
     AND to_regclass('facility.tickets_v003') IS NULL THEN
    ALTER TABLE facility.service_records RENAME TO service_records_v003;
    ALTER TABLE facility.ticket_events   RENAME TO ticket_events_v003;
    ALTER TABLE facility.tickets         RENAME TO tickets_v003;
    ALTER TABLE facility.assets          RENAME TO assets_v003;
    DROP INDEX IF EXISTS facility.assets_tenant_idx;
    DROP INDEX IF EXISTS facility.tickets_tenant_status_idx;
    DROP INDEX IF EXISTS facility.tickets_unit_idx;
    DROP INDEX IF EXISTS facility.ticket_events_ticket_idx;
    DROP INDEX IF EXISTS facility.service_records_asset_idx;
  END IF;
END
$compat$;

CREATE TABLE IF NOT EXISTS facility.assets (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  name                  text NOT NULL,
  category              text NOT NULL DEFAULT 'other',
  location              text,
  service_interval_days integer,
  notes                 text,
  is_active             boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assets_category_check CHECK (category IN ('elevator','lighting','plumbing','hvac','fire','electrical','door','other')),
  CONSTRAINT assets_interval_check CHECK (service_interval_days IS NULL OR service_interval_days BETWEEN 1 AND 3650)
);
CREATE INDEX IF NOT EXISTS assets_tenant_idx ON facility.assets (tenant_id, category);

CREATE SEQUENCE IF NOT EXISTS facility.ticket_no_seq;

CREATE TABLE IF NOT EXISTS facility.tickets (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL,
  no               integer NOT NULL DEFAULT nextval('facility.ticket_no_seq'),
  kind             text NOT NULL DEFAULT 'fault',
  category         text NOT NULL DEFAULT 'گزارش خرابی',
  asset_category   text,
  subject          text NOT NULL,
  body             text NOT NULL DEFAULT '',
  priority         text NOT NULL DEFAULT 'normal',
  status           text NOT NULL DEFAULT 'open',
  location         text,
  unit_id          uuid,
  reporter_person  uuid,
  reporter_login   uuid,
  reporter_name    text,
  asset_id         uuid REFERENCES facility.assets(id) ON DELETE SET NULL,
  assignee_login   uuid,
  assignee_name    text,
  attachments      jsonb NOT NULL DEFAULT '[]'::jsonb,
  sla_due_at       timestamptz,
  first_response_at timestamptz,
  resolved_at      timestamptz,
  closed_at        timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tickets_kind_check     CHECK (kind IN ('fault','criticism','suggestion','direct')),
  CONSTRAINT tickets_priority_check CHECK (priority IN ('low','normal','high','urgent')),
  CONSTRAINT tickets_status_check   CHECK (status IN ('open','assigned','in_progress','resolved','closed'))
);
CREATE INDEX IF NOT EXISTS tickets_tenant_status_idx ON facility.tickets (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS tickets_unit_idx     ON facility.tickets (unit_id) WHERE unit_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS tickets_assignee_idx ON facility.tickets (assignee_login) WHERE assignee_login IS NOT NULL;
CREATE INDEX IF NOT EXISTS tickets_asset_idx    ON facility.tickets (asset_id) WHERE asset_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS facility.ticket_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL,
  ticket_id  uuid NOT NULL REFERENCES facility.tickets(id) ON DELETE CASCADE,
  type       text NOT NULL DEFAULT 'note',      -- created | status | assign | comment | asset | service | note
  text       text NOT NULL,
  actor_name text,
  actor_role text,
  internal   boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ticket_events_ticket_idx ON facility.ticket_events (ticket_id, created_at);

CREATE TABLE IF NOT EXISTS facility.maintenance_schedules (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL,
  asset_id       uuid NOT NULL REFERENCES facility.assets(id) ON DELETE CASCADE,
  title          text NOT NULL,
  interval_days  integer NOT NULL,
  lead_days      integer NOT NULL DEFAULT 3,       -- چند روز مانده به سررسید دستور کار ساخته شود
  last_done      date,
  next_due       date NOT NULL,
  assignee_login uuid,
  priority       text NOT NULL DEFAULT 'normal',
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT schedules_interval_check CHECK (interval_days BETWEEN 1 AND 3650),
  CONSTRAINT schedules_priority_check CHECK (priority IN ('low','normal','high','urgent'))
);
CREATE INDEX IF NOT EXISTS schedules_tenant_idx ON facility.maintenance_schedules (tenant_id, next_due);

CREATE TABLE IF NOT EXISTS facility.work_orders (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL,
  title          text NOT NULL,
  description    text,
  asset_id       uuid REFERENCES facility.assets(id) ON DELETE SET NULL,
  ticket_id      uuid REFERENCES facility.tickets(id) ON DELETE SET NULL,
  schedule_id    uuid REFERENCES facility.maintenance_schedules(id) ON DELETE SET NULL,
  priority       text NOT NULL DEFAULT 'normal',
  status         text NOT NULL DEFAULT 'open',
  assignee_login uuid,
  assignee_name  text,
  due_date       date,
  completed_at   timestamptz,
  result_note    text,
  created_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wo_priority_check CHECK (priority IN ('low','normal','high','urgent')),
  CONSTRAINT wo_status_check   CHECK (status IN ('open','in_progress','done','cancelled'))
);
CREATE INDEX IF NOT EXISTS wo_tenant_idx   ON facility.work_orders (tenant_id, status, due_date);
CREATE INDEX IF NOT EXISTS wo_assignee_idx ON facility.work_orders (assignee_login) WHERE assignee_login IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS wo_one_open_per_schedule
  ON facility.work_orders (schedule_id) WHERE schedule_id IS NOT NULL AND status IN ('open','in_progress');

CREATE TABLE IF NOT EXISTS facility.service_records (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  asset_id      uuid NOT NULL REFERENCES facility.assets(id) ON DELETE CASCADE,
  ticket_id     uuid REFERENCES facility.tickets(id) ON DELETE SET NULL,
  work_order_id uuid REFERENCES facility.work_orders(id) ON DELETE SET NULL,
  type          text NOT NULL DEFAULT 'service',
  description   text NOT NULL,
  performer     text NOT NULL DEFAULT '',
  cost          numeric NOT NULL DEFAULT 0,
  performed_on  date NOT NULL DEFAULT CURRENT_DATE,
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_type_check CHECK (type IN ('repair','replace','service','inspection')),
  CONSTRAINT service_cost_check CHECK (cost >= 0)
);
CREATE INDEX IF NOT EXISTS service_asset_idx ON facility.service_records (asset_id, performed_on DESC);

GRANT USAGE ON SEQUENCE facility.ticket_no_seq TO app_user, platform_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  facility.assets, facility.tickets, facility.ticket_events, facility.maintenance_schedules,
  facility.work_orders, facility.service_records TO app_user, platform_admin;

DO $rls$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['assets','tickets','ticket_events','maintenance_schedules','work_orders','service_records'] LOOP
    EXECUTE format('ALTER TABLE facility.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE facility.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON facility.%I', 'tenant_isolation_' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON facility.%I USING (tenant_id = platform.current_tenant_id())'
      || ' WITH CHECK (tenant_id = platform.current_tenant_id())', 'tenant_isolation_' || t, t);
  END LOOP;
END
$rls$;

-- ─── انتقال داده‌ی شکل قدیمی (فقط اگر ۰۰۳ قبلاً اجرا شده بود) ─────────────────────
DO $copy$
BEGIN
  IF to_regclass('facility.tickets_v003') IS NOT NULL THEN
    INSERT INTO facility.assets (id, tenant_id, name, category, location, service_interval_days, is_active, created_at)
      SELECT id, tenant_id, name, category, NULLIF(location, '—'), service_interval_days, is_active, created_at FROM facility.assets_v003
      ON CONFLICT (id) DO NOTHING;
    INSERT INTO facility.tickets (id, tenant_id, kind, category, subject, body, priority, status, location, unit_id, reporter_name, reporter_login,
                                  asset_id, assignee_login, resolved_at, created_at, updated_at)
      SELECT id, tenant_id, kind, COALESCE(category, 'گزارش خرابی'), subject, body, priority, status, location, unit_id, reporter, reported_by,
             asset_id, assigned_to, resolved_at, created_at, updated_at FROM facility.tickets_v003
      ON CONFLICT (id) DO NOTHING;
    INSERT INTO facility.ticket_events (id, tenant_id, ticket_id, type, text, created_at)
      SELECT id, tenant_id, ticket_id, 'note', text, created_at FROM facility.ticket_events_v003
      ON CONFLICT (id) DO NOTHING;
    INSERT INTO facility.service_records (id, tenant_id, asset_id, ticket_id, type, description, performer, cost, performed_on, created_by, created_at)
      SELECT id, tenant_id, asset_id, ticket_id, type, description, performer, cost, performed_on, created_by, created_at FROM facility.service_records_v003
      ON CONFLICT (id) DO NOTHING;
    DROP TABLE facility.service_records_v003, facility.ticket_events_v003, facility.tickets_v003, facility.assets_v003;
  END IF;
END
$copy$;
