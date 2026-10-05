-- ============================================================================
-- ۰۰۳ — مدیریت مشاعات توسط مسئول مشاعات: تعریف مشاع، تایم‌تیبل هفتگی، تعطیلی‌ها
-- ============================================================================
-- amenity_schedule : برای هر مشاع و هر روز هفته (۰=شنبه … ۶=جمعه) ساعت‌های قابل رزرو.
--                    اگر یک مشاع هیچ ردیفی نداشته باشد، slot_hours قدیمی برای همه‌ی روزها
--                    اعمال می‌شود (سازگار با داده‌ی موجود)؛ اگر ردیف داشته باشد، روزِ بدون
--                    ردیف یا با hours خالی «تعطیل» است.
-- amenity_closures : تعطیلی بازه‌ای (تعمیرات، مراسم، تعطیلات) برای یک مشاع یا همه (amenity_id NULL).
-- idempotent.
-- ============================================================================

ALTER TABLE facility.amenities ADD COLUMN IF NOT EXISTS description       text;
ALTER TABLE facility.amenities ADD COLUMN IF NOT EXISTS max_advance_days  integer NOT NULL DEFAULT 14;
ALTER TABLE facility.amenities DROP CONSTRAINT IF EXISTS amenities_advance_check;
ALTER TABLE facility.amenities ADD CONSTRAINT amenities_advance_check CHECK (max_advance_days BETWEEN 1 AND 90);

CREATE TABLE IF NOT EXISTS facility.amenity_schedule (
  tenant_id  uuid     NOT NULL,
  amenity_id uuid     NOT NULL REFERENCES facility.amenities(id) ON DELETE CASCADE,
  weekday    smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  hours      smallint[] NOT NULL DEFAULT '{}',
  PRIMARY KEY (amenity_id, weekday)
);

CREATE TABLE IF NOT EXISTS facility.amenity_closures (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL,
  amenity_id uuid REFERENCES facility.amenities(id) ON DELETE CASCADE,
  date_from  date NOT NULL,
  date_to    date NOT NULL,
  reason     text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT amenity_closures_range CHECK (date_to >= date_from)
);
CREATE INDEX IF NOT EXISTS amenity_closures_idx ON facility.amenity_closures (tenant_id, date_from, date_to);
CREATE INDEX IF NOT EXISTS amenity_schedule_tenant_idx ON facility.amenity_schedule (tenant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON facility.amenity_schedule, facility.amenity_closures TO app_user, platform_admin;

DO $rls$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['amenity_schedule', 'amenity_closures'] LOOP
    EXECUTE format('ALTER TABLE facility.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE facility.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON facility.%I', 'tenant_isolation_' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON facility.%I USING (tenant_id = platform.current_tenant_id())'
      || ' WITH CHECK (tenant_id = platform.current_tenant_id())', 'tenant_isolation_' || t, t);
  END LOOP;
END
$rls$;
