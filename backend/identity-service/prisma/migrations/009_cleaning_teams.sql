-- ۰۰۹ — تقسیم کادر نظافت به دو تیم
--
--  cleaning        = «نظافت مجموعه»  (کادر نظافتِ خودِ ساختمان: لابی، راهرو، مشاعات) — مثل قبل، پنل کارهای نگهداری
--  cleaning_homes  = «نظافت منازل»   (تیمی که داخل واحدها نظافت می‌کند) — پنل ثبت نظافت منزل با ساعت شروع/پایان
--
-- دسترسی جدید «housekeeping» پنل «نظافت منازل» را باز می‌کند؛ پیش‌فرض بخش cleaning_homes است و مدیر
-- می‌تواند آن را به کارمند هر بخش دیگری هم بدهد.
--
-- idempotent. بخش‌ها و دسترسی‌های قبلی دست‌نخورده می‌مانند (کارمندان موجود بخش «cleaning» همان‌طور که بودند).

ALTER TABLE identity.users DROP CONSTRAINT IF EXISTS users_department_check;
ALTER TABLE identity.users
  ADD CONSTRAINT users_department_check CHECK (
    department IS NULL OR department IN
      ('lobby', 'amenity_desk', 'kitchen', 'cafe', 'security', 'maintenance', 'cleaning', 'cleaning_homes')
  );

ALTER TABLE identity.users DROP CONSTRAINT IF EXISTS users_permissions_check;
ALTER TABLE identity.users
  ADD CONSTRAINT users_permissions_check CHECK (
    permissions <@ ARRAY['lobby', 'amenity_desk', 'kitchen', 'cafe', 'security', 'maintenance', 'housekeeping']::text[]
  );
