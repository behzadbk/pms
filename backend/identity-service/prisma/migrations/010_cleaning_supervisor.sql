-- ۰۱۰ — «مسئول نظافت»: بخش cleaning_supervisor و دسترسی cleaning_review
--
-- مسئول نظافت بازخورد (نمره و دلیل) ساکنان از نظافت منازل را می‌بیند و در بازخورد بد اعلان می‌گیرد.
-- مدیر ساختمان هم همین را در پنل خودش دارد. idempotent؛ مقدارهای قبلی دست‌نخورده می‌مانند.

ALTER TABLE identity.users DROP CONSTRAINT IF EXISTS users_department_check;
ALTER TABLE identity.users
  ADD CONSTRAINT users_department_check CHECK (
    department IS NULL OR department IN
      ('lobby', 'amenity_desk', 'kitchen', 'cafe', 'security', 'maintenance', 'cleaning', 'cleaning_homes', 'cleaning_supervisor')
  );

ALTER TABLE identity.users DROP CONSTRAINT IF EXISTS users_permissions_check;
ALTER TABLE identity.users
  ADD CONSTRAINT users_permissions_check CHECK (
    permissions <@ ARRAY['lobby', 'amenity_desk', 'kitchen', 'cafe', 'security', 'maintenance', 'housekeeping', 'cleaning_review']::text[]
  );
