-- ============================================================================
-- 904 — یکتایی مناطق تحویل fnb.delivery_zones (issue #45)
-- ============================================================================
-- هدف: syncZonesWithAmenities (PR #42) روی هر GET /fnb/zones اجرا می‌شود و بدون قید یکتایی، دو درخواست هم‌زمان
-- می‌توانند منطقه‌ی تکراری بسازند. idempotent و بدون حذف سفارش:
--   1) تکراری‌های موجود ادغام می‌شوند: سفارش‌ها به ردیف نگه‌داشته‌شده منتقل و ردیف‌های اضافه حذف می‌شوند.
--   2) دو ایندکس یکتا:
--        - (tenant_id, amenity_id) برای مناطقِ مرتبط با مشاع
--        - (tenant_id, lower(name)) فقط برای مناطقِ فعال (منطقه‌ی غیرفعال می‌تواند هم‌نام باشد؛ کد فعلی
--          فقط تکراری فعال را رد می‌کند)
-- ============================================================================

-- ۱) ادغام: برای هر (tenant, amenity_id) یک ردیف نگه داشته می‌شود؛ اولویت: بیشترین سفارش، سپس فعال، سپس id
WITH ranked AS (
  SELECT z.id, z.tenant_id, z.amenity_id,
         first_value(z.id) OVER w AS keep_id,
         row_number()    OVER w AS rn
    FROM fnb.delivery_zones z
   WHERE z.amenity_id IS NOT NULL
  WINDOW w AS (PARTITION BY z.tenant_id, z.amenity_id
               ORDER BY (SELECT count(*) FROM fnb.orders o WHERE o.delivery_zone_id = z.id) DESC,
                        z.is_active DESC NULLS LAST, z.id)
), repoint AS (
  UPDATE fnb.orders o SET delivery_zone_id = r.keep_id
    FROM ranked r WHERE r.rn > 1 AND o.delivery_zone_id = r.id
  RETURNING 1
)
-- (CTEهای تغییردهنده حتی اگر مصرف نشوند کامل اجرا می‌شوند؛ FK در پایان همین statement بررسی می‌شود)
DELETE FROM fnb.delivery_zones z USING ranked r
 WHERE r.rn > 1 AND z.id = r.id;


-- تکراری‌های هم‌نامِ فعال (بدون مشاع): فقط غیرفعال می‌شوند، حذف نمی‌شوند
UPDATE fnb.delivery_zones z SET is_active = false
 WHERE z.is_active
   AND z.id <> (SELECT min(z2.id::text)::uuid FROM fnb.delivery_zones z2
                 WHERE z2.tenant_id = z.tenant_id AND z2.is_active AND lower(z2.name) = lower(z.name));

-- ۲) ایندکس‌های یکتا
CREATE UNIQUE INDEX IF NOT EXISTS uq_delivery_zones_amenity
  ON fnb.delivery_zones (tenant_id, amenity_id) WHERE amenity_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_delivery_zones_active_name
  ON fnb.delivery_zones (tenant_id, lower(name)) WHERE is_active;
