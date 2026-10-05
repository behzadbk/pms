-- تیکت (گزارش خرابی/انتقاد/پیشنهاد/پیام مستقیم) و CMMS (تجهیزات + سابقه‌ی سرویس) — جایگزین استور localStorage فرانت
CREATE TABLE IF NOT EXISTS facility.assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  location TEXT NOT NULL DEFAULT '—',
  service_interval_days INT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT assets_category_chk CHECK (category IN ('elevator','lighting','plumbing','hvac','fire','electrical','door','other'))
);

CREATE TABLE IF NOT EXISTS facility.tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  kind TEXT NOT NULL DEFAULT 'fault',
  subject TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  category TEXT,
  priority TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'open',
  location TEXT,
  unit_id UUID,
  reporter TEXT,
  reported_by UUID,
  asset_id UUID REFERENCES facility.assets(id) ON DELETE SET NULL,
  assigned_to UUID,
  due_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  CONSTRAINT tickets_kind_chk CHECK (kind IN ('fault','criticism','suggestion','direct')),
  CONSTRAINT tickets_priority_chk CHECK (priority IN ('low','normal','high','urgent')),
  CONSTRAINT tickets_status_chk CHECK (status IN ('open','in_progress','resolved'))
);
CREATE INDEX IF NOT EXISTS tickets_tenant_status_idx ON facility.tickets (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS tickets_unit_idx ON facility.tickets (unit_id);

CREATE TABLE IF NOT EXISTS facility.ticket_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  ticket_id UUID NOT NULL REFERENCES facility.tickets(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  actor UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ticket_events_ticket_idx ON facility.ticket_events (ticket_id, created_at);

CREATE TABLE IF NOT EXISTS facility.service_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  asset_id UUID NOT NULL REFERENCES facility.assets(id) ON DELETE CASCADE,
  ticket_id UUID REFERENCES facility.tickets(id) ON DELETE SET NULL,
  type TEXT NOT NULL DEFAULT 'repair',
  description TEXT NOT NULL,
  performer TEXT NOT NULL,
  cost NUMERIC NOT NULL DEFAULT 0,
  performed_on DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT service_type_chk CHECK (type IN ('repair','replace','service','inspection')),
  CONSTRAINT service_cost_chk CHECK (cost >= 0)
);
CREATE INDEX IF NOT EXISTS service_records_asset_idx ON facility.service_records (asset_id, performed_on DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA facility TO app_user, platform_admin;

DO $rls$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['assets','tickets','ticket_events','service_records'] LOOP
    EXECUTE format('ALTER TABLE facility.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE facility.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON facility.%I', 'tenant_isolation_' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON facility.%I USING (tenant_id = platform.current_tenant_id())'
      || ' WITH CHECK (tenant_id = platform.current_tenant_id())',
      'tenant_isolation_' || t, t);
  END LOOP;
END
$rls$;
