-- ============================================================================
-- ۰۰۲ — رزرو مشاعات نسخه‌ی ۲ (مرجع: RESIDENTS.md + طراحی «رزرو مشاعات»)
-- ============================================================================
-- amenities:    + max_hours، slot_hours (ساعت‌های قابل رزرو به وقت تهران)، icon، rule_text
--               needs_approval همان requires_approval قبلی است (نام قبلی حفظ شد تا کد قدیمی نشکند)
-- reservations: + user_id (residency.users)، reject_reason، decided_by/at، source
--               وضعیت‌ها یکدست شد: pending | confirmed | rejected | cancelled
--               ('pending_approval' قبلی → 'pending')
-- تداخل زمانی همچنان در خود دیتابیس با EXCLUDE ممنوع است (برای pending و confirmed).
-- idempotent.
-- ============================================================================

ALTER TABLE facility.amenities ADD COLUMN IF NOT EXISTS max_hours  integer NOT NULL DEFAULT 1;
ALTER TABLE facility.amenities ADD COLUMN IF NOT EXISTS slot_hours integer[] NOT NULL DEFAULT '{8,9,10,11,16,17,18,19,20}';
ALTER TABLE facility.amenities ADD COLUMN IF NOT EXISTS icon       text;
ALTER TABLE facility.amenities ADD COLUMN IF NOT EXISTS rule_text  text;
ALTER TABLE facility.amenities ADD COLUMN IF NOT EXISTS is_active  boolean NOT NULL DEFAULT true;
UPDATE facility.amenities SET requires_approval = false WHERE requires_approval IS NULL;
ALTER TABLE facility.amenities ALTER COLUMN requires_approval SET NOT NULL;
ALTER TABLE facility.amenities DROP CONSTRAINT IF EXISTS amenities_max_hours_check;
ALTER TABLE facility.amenities ADD CONSTRAINT amenities_max_hours_check CHECK (max_hours BETWEEN 1 AND 12);
ALTER TABLE facility.amenities DROP CONSTRAINT IF EXISTS amenities_capacity_check;
ALTER TABLE facility.amenities ADD CONSTRAINT amenities_capacity_check CHECK (capacity IS NULL OR capacity > 0);

ALTER TABLE facility.reservations ADD COLUMN IF NOT EXISTS user_id       uuid;
ALTER TABLE facility.reservations ADD COLUMN IF NOT EXISTS reject_reason text;
ALTER TABLE facility.reservations ADD COLUMN IF NOT EXISTS decided_by    uuid;
ALTER TABLE facility.reservations ADD COLUMN IF NOT EXISTS decided_at    timestamptz;
ALTER TABLE facility.reservations ADD COLUMN IF NOT EXISTS source        text NOT NULL DEFAULT 'app';

-- یکدست‌سازی وضعیت؛ ترتیب مهم است: اول constraint قدیمی برداشته شود، بعد داده، بعد constraint جدید
ALTER TABLE facility.reservations DROP CONSTRAINT IF EXISTS no_overlapping_reservations;
ALTER TABLE facility.reservations DROP CONSTRAINT IF EXISTS reservations_status_check;
UPDATE facility.reservations SET status = 'pending' WHERE status = 'pending_approval';
ALTER TABLE facility.reservations ADD CONSTRAINT reservations_status_check
  CHECK (status IN ('pending', 'confirmed', 'rejected', 'cancelled'));
ALTER TABLE facility.reservations DROP CONSTRAINT IF EXISTS reservations_source_check;
ALTER TABLE facility.reservations ADD CONSTRAINT reservations_source_check
  CHECK (source IN ('app', 'manual', 'child_request'));
ALTER TABLE facility.reservations DROP CONSTRAINT IF EXISTS reservations_range_check;
ALTER TABLE facility.reservations ADD CONSTRAINT reservations_range_check CHECK (end_at > start_at);
ALTER TABLE facility.reservations DROP CONSTRAINT IF EXISTS reservations_reject_reason_check;
ALTER TABLE facility.reservations ADD CONSTRAINT reservations_reject_reason_check
  CHECK (status <> 'rejected' OR reject_reason IS NOT NULL);
ALTER TABLE facility.reservations ADD CONSTRAINT no_overlapping_reservations EXCLUDE USING gist (
  amenity_id WITH =,
  tstzrange(start_at, end_at) WITH &&
) WHERE (status IN ('confirmed', 'pending'));

CREATE INDEX IF NOT EXISTS reservations_amenity_start_idx ON facility.reservations (amenity_id, start_at);
CREATE INDEX IF NOT EXISTS reservations_status_idx ON facility.reservations (tenant_id, status, start_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA facility TO app_user, platform_admin;
