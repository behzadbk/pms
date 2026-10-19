-- 905: ایندکس FKهای باقی‌مانده (ادامه‌ی 902) — facility.events.amenity_id و facility.service_requests.service_type_id
-- هر دو FK با ON DELETE SET NULL هستند؛ بدون ایندکس، حذف amenity یا service_type کل جدول فرزند را seq-scan می‌کند.
-- ایندکس جزئی (WHERE ... IS NOT NULL) تا سبک بماند. idempotent.
CREATE INDEX IF NOT EXISTS events_amenity_id_idx
  ON facility.events (amenity_id) WHERE amenity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS service_requests_service_type_id_idx
  ON facility.service_requests (service_type_id) WHERE service_type_id IS NOT NULL;
