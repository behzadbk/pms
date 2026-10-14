-- ============================================================================
-- ۰۰۹ — دپارتمان‌های پویا (تعریف توسط مدیر ساختمان)
-- ============================================================================
-- تا امروز «بخش» کارمند یکی از ۷ مقدار ثابت بود (CHECK روی identity.users.department).
-- حالا مدیر ساختمان خودش دپارتمان تعریف می‌کند (مثلاً «تأسیسات»، «کارواش»، «خانه‌داری»)،
-- برای هر دپارتمان یک «مدیر دپارتمان» تعیین می‌کند و بعد کارکنان زیردست را به آن اضافه می‌کند.
-- مدیر دپارتمان درخواست‌های خدماتیِ آن دپارتمان را می‌گیرد، زمان را تأیید می‌کند و کار را
-- بین کارکنان زیردست تقسیم می‌کند (facility.service_requests).
--
--  • ۷ بخش قدیمی به‌صورت «دپارتمان سیستمی» (is_system) برای هر ساختمان ساخته می‌شوند تا
--    پنل‌های لابی/آشپزخانه/… مثل قبل کار کنند؛ حذف‌شدنی نیستند.
--  • دپارتمان سفارشی فقط پنل «درخواست‌های خدمات» (permission = service_desk) را می‌دهد.
--  • users.department همان code دپارتمان است (متن) — CHECK ثابت برداشته شد.
-- idempotent.
-- ============================================================================

CREATE TABLE IF NOT EXISTS identity.departments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE CASCADE,
  code            text NOT NULL CHECK (code ~ '^[a-z][a-z0-9_]{1,30}$'),
  name            text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 60),
  icon            text,
  is_system       boolean NOT NULL DEFAULT false,
  manager_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  is_active       boolean NOT NULL DEFAULT true,
  sort            integer NOT NULL DEFAULT 100,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);
CREATE INDEX IF NOT EXISTS departments_tenant_id_idx ON identity.departments (tenant_id);
CREATE INDEX IF NOT EXISTS departments_manager_idx ON identity.departments (manager_user_id) WHERE manager_user_id IS NOT NULL;

-- ── دپارتمان‌های سیستمی برای ساختمان‌های موجود (قبل از فعال‌سازی RLS تا مالک جدول هم بتواند بنویسد) ──
INSERT INTO identity.departments (tenant_id, code, name, is_system, sort)
SELECT t.id, d.code, d.name, true, d.sort
  FROM identity.tenants t
 CROSS JOIN (VALUES
   ('lobby',        'لابی‌من',            10),
   ('amenity_desk', 'مسئول مشاعات',       20),
   ('kitchen',      'آشپزخانه / رستوران', 30),
   ('cafe',         'کافی‌شاپ',           40),
   ('security',     'نگهبانی',            50),
   ('maintenance',  'تأسیسات',            60),
   ('cleaning',     'نظافت',              70)
 ) AS d(code, name, sort)
ON CONFLICT (tenant_id, code) DO NOTHING;

-- ── بخش ثابت برداشته شد؛ فقط شکل code اعتبارسنجی می‌شود (وجود دپارتمان را سرویس چک می‌کند) ──
ALTER TABLE identity.users DROP CONSTRAINT IF EXISTS users_department_check;
ALTER TABLE identity.users
  ADD CONSTRAINT users_department_check CHECK (department IS NULL OR department ~ '^[a-z][a-z0-9_]{1,30}$');

-- ── دسترسی جدید «service_desk» (پنل درخواست‌های خدمات) ──
ALTER TABLE identity.users DROP CONSTRAINT IF EXISTS users_permissions_check;
ALTER TABLE identity.users
  ADD CONSTRAINT users_permissions_check CHECK (
    permissions <@ ARRAY['lobby', 'amenity_desk', 'kitchen', 'cafe', 'security', 'maintenance', 'service_desk']::text[]
  );

-- ── دسترسی‌ها + RLS (با WITH CHECK، مثل بقیه‌ی جدول‌های tenant‌دار) ──
GRANT SELECT, INSERT, UPDATE, DELETE ON identity.departments TO app_user, platform_admin;
ALTER TABLE identity.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.departments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_departments ON identity.departments;
CREATE POLICY tenant_isolation_departments ON identity.departments
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());
