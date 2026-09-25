-- ۰۰۴ — حساب کارکنان (لابی‌من، آشپزخانه، کافی‌شاپ، مسئول مشاعات، نگهبانی، تأسیسات، …)
--
-- مدیر ساختمان از پنل خودش کارمند تعریف می‌کند و برای او نام کاربری/رمز می‌سازد.
-- هر کارمند نقش سیستمی 'staff' دارد و بخش (department) + دسترسی‌های اضافه (permissions)
-- مشخص می‌کند کدام پنل‌ها برایش باز شود. مثلاً کارمند آشپزخانه که یک شیفت در کافی‌شاپ
-- می‌ایستد، دسترسی 'cafe' را هم به‌صورت دستی می‌گیرد.
--
-- idempotent: اجرای دوباره مشکلی ایجاد نمی‌کند.

-- کارمند ممکن است ایمیل نداشته باشد — ورود با نام کاربری
ALTER TABLE identity.users ALTER COLUMN email DROP NOT NULL;

ALTER TABLE identity.users ADD COLUMN IF NOT EXISTS username    text;
ALTER TABLE identity.users ADD COLUMN IF NOT EXISTS phone       text;
ALTER TABLE identity.users ADD COLUMN IF NOT EXISTS national_id text;
ALTER TABLE identity.users ADD COLUMN IF NOT EXISTS department  text;
ALTER TABLE identity.users ADD COLUMN IF NOT EXISTS permissions text[] NOT NULL DEFAULT '{}';
-- اطلاعات شخصی تکمیلی: تاریخ تولد، آدرس، تماس اضطراری، تاریخ استخدام، شیفت، یادداشت
ALTER TABLE identity.users ADD COLUMN IF NOT EXISTS profile     jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE identity.users ADD COLUMN IF NOT EXISTS updated_at  timestamptz NOT NULL DEFAULT now();

-- نام کاربری در هر مجتمع یکتا (حروف کوچک)
CREATE UNIQUE INDEX IF NOT EXISTS users_tenant_username_unique
  ON identity.users (tenant_id, username) WHERE username IS NOT NULL;

-- هر کاربر باید دست‌کم یکی از ایمیل یا نام کاربری را داشته باشد
ALTER TABLE identity.users DROP CONSTRAINT IF EXISTS users_login_identifier_check;
ALTER TABLE identity.users
  ADD CONSTRAINT users_login_identifier_check CHECK (email IS NOT NULL OR username IS NOT NULL);

ALTER TABLE identity.users DROP CONSTRAINT IF EXISTS users_department_check;
ALTER TABLE identity.users
  ADD CONSTRAINT users_department_check CHECK (
    department IS NULL OR department IN ('lobby', 'amenity_desk', 'kitchen', 'cafe', 'security', 'maintenance', 'cleaning')
  );

ALTER TABLE identity.users DROP CONSTRAINT IF EXISTS users_permissions_check;
ALTER TABLE identity.users
  ADD CONSTRAINT users_permissions_check CHECK (
    permissions <@ ARRAY['lobby', 'amenity_desk', 'kitchen', 'cafe', 'security', 'maintenance']::text[]
  );
