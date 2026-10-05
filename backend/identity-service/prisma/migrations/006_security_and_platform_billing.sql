-- ============================================================================
-- 006 — امنیت ورود + فاکتورهای اشتراک پلتفرم
-- ============================================================================
--  ۱) must_change_password: حساب‌هایی که با رمز موقت ساخته می‌شوند (مدیر ساختمان تازه‌تعریف‌شده،
--     کارمند) باید در اولین ورود رمز را عوض کنند.
--  ۲) identity.login_attempts: شمارنده‌ی تلاش ناموفق ورود برای قفل موقت (حساب + IP).
--  ۳) identity.platform_invoices: فاکتورهای اشتراک ماهانه‌ی هر مجتمع به شرکت ارائه‌دهنده
--     (جدا از دفترداری داخلی ساختمان‌ها). مثل identity.tenants عمداً بدون RLS است و فقط
--     از مسیرهای super_admin خوانده می‌شود.
-- idempotent.
-- ============================================================================

ALTER TABLE identity.users ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;
ALTER TABLE identity.users ADD COLUMN IF NOT EXISTS password_changed_at timestamptz;
ALTER TABLE identity.platform_admins ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS identity.login_attempts (
  key          text PRIMARY KEY,           -- «scope:...» هش‌شده؛ شناسه‌ی خام ذخیره نمی‌شود
  fails        integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  last_fail_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_attempts_last_fail_idx ON identity.login_attempts (last_fail_at);

CREATE TABLE IF NOT EXISTS identity.platform_invoices (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE CASCADE,
  period     text NOT NULL,                 -- ماه شمسی «۱۴۰۵-۰۷» (به‌صورت ASCII: 1405-07)
  amount     bigint NOT NULL CHECK (amount >= 0),
  status     text NOT NULL DEFAULT 'pending',
  issued_at  date NOT NULL DEFAULT CURRENT_DATE,
  due_at     date,
  paid_at    timestamptz,
  note       text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_invoices_status_check CHECK (status IN ('pending', 'paid', 'failed', 'void')),
  CONSTRAINT platform_invoices_tenant_period_unique UNIQUE (tenant_id, period)
);
CREATE INDEX IF NOT EXISTS platform_invoices_status_idx ON identity.platform_invoices (status);
CREATE INDEX IF NOT EXISTS platform_invoices_period_idx ON identity.platform_invoices (period);

GRANT SELECT, INSERT, UPDATE, DELETE ON identity.login_attempts, identity.platform_invoices TO app_user, platform_admin;
