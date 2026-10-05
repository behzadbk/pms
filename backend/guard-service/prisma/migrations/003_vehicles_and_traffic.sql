-- ============================================================================
-- guard-service 003 — پلاک خودروی ساکنین و گزارش تردد خودرو
-- ----------------------------------------------------------------------------
-- صفحه‌ی «تردد خودرو» و «جستجوی پلاک» نگهبانی بک‌اند نداشتند (داده‌ی ساختگی).
-- ============================================================================

CREATE TABLE IF NOT EXISTS guard.vehicles (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL,
  unit_id    uuid NOT NULL,
  plate      text NOT NULL,
  plate_norm text NOT NULL,
  owner_name text,
  label      text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, plate_norm)
);
CREATE INDEX IF NOT EXISTS vehicles_unit_idx ON guard.vehicles (tenant_id, unit_id);

CREATE TABLE IF NOT EXISTS guard.vehicle_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  plate       text NOT NULL,
  plate_norm  text NOT NULL,
  unit_id     uuid,
  vehicle_id  uuid REFERENCES guard.vehicles(id) ON DELETE SET NULL,
  direction   text NOT NULL CHECK (direction IN ('in', 'out')),
  is_guest    boolean NOT NULL DEFAULT false,
  note        text,
  recorded_by uuid NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vehicle_logs_time_idx ON guard.vehicle_logs (tenant_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS parcels_status_idx ON guard.parcels (tenant_id, status, received_at DESC);
CREATE INDEX IF NOT EXISTS parcels_unit_idx ON guard.parcels (tenant_id, unit_id);
CREATE INDEX IF NOT EXISTS guest_passes_unit_idx ON guard.guest_passes (tenant_id, unit_id, created_at DESC);
CREATE INDEX IF NOT EXISTS guest_visit_logs_time_idx ON guard.guest_visit_logs (tenant_id, entry_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON guard.vehicles, guard.vehicle_logs TO app_user, platform_admin;

DO $rls$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['vehicles', 'vehicle_logs'] LOOP
    EXECUTE format('ALTER TABLE guard.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE guard.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON guard.%I', 'tenant_isolation_' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON guard.%I USING (tenant_id = platform.current_tenant_id())'
      || ' WITH CHECK (tenant_id = platform.current_tenant_id())', 'tenant_isolation_' || t, t);
  END LOOP;
END
$rls$;
