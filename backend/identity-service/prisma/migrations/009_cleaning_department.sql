-- ۰۰۹ — دپارتمان نظافت با «مسئول نظافت»
--
-- فقط یک دپارتمان نظافت (cleaning) داریم؛ همه‌ی کادر نظافت زیر نظر یک مسئول‌اند. مدیر ساختمان هنگام ثبت
-- کارکنان مشخص می‌کند کدام عضو «مسئول دپارتمان» است (ستون is_dept_head — حداکثر یکی در هر دپارتمان هر مجتمع).
-- مسئول دسترسی مشتق «cleaning_supervisor» را می‌گیرد (پنل نظارت و تقسیم کار)؛ کادر دسترسی «housekeeping»
-- (پنل کارهای واگذارشده با ثبت ساعت) را از پیش‌فرض بخش می‌گیرد.
--
-- idempotent. اگر قبلاً بخش‌های آزمایشی cleaning_homes / cleaning_supervisor ساخته شده بود به cleaning برمی‌گردند
-- (مسئول سابق، مسئول دپارتمان می‌شود).

ALTER TABLE identity.users ADD COLUMN IF NOT EXISTS is_dept_head boolean NOT NULL DEFAULT false;

ALTER TABLE identity.users DROP CONSTRAINT IF EXISTS users_department_check;
ALTER TABLE identity.users DROP CONSTRAINT IF EXISTS users_permissions_check;

UPDATE identity.users SET is_dept_head = true  WHERE department = 'cleaning_supervisor';
UPDATE identity.users SET department = 'cleaning' WHERE department IN ('cleaning_homes', 'cleaning_supervisor');
UPDATE identity.users SET permissions = array_remove(array_remove(permissions, 'cleaning_review'), 'cleaning_supervisor');

ALTER TABLE identity.users
  ADD CONSTRAINT users_department_check CHECK (
    department IS NULL OR department IN
      ('lobby', 'amenity_desk', 'kitchen', 'cafe', 'security', 'maintenance', 'cleaning')
  );

ALTER TABLE identity.users
  ADD CONSTRAINT users_permissions_check CHECK (
    permissions <@ ARRAY['lobby', 'amenity_desk', 'kitchen', 'cafe', 'security', 'maintenance', 'housekeeping']::text[]
  );

-- هر دپارتمان در هر مجتمع حداکثر یک مسئول دارد
CREATE UNIQUE INDEX IF NOT EXISTS users_one_dept_head
  ON identity.users (tenant_id, department)
  WHERE is_dept_head AND role = 'staff';
