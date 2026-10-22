-- ============================================================================
-- 906 — دسترسی موقت کارکنان: identity.user_permission_grants  (issue #52، تأیید مالک ۱۴۰۵/۰۷)
-- ============================================================================
-- identity.users.permissions دائمی می‌ماند (text[] با CHECK). این جدول فقط دسترسی «موقت» را نگه می‌دارد.
--   • دسترسی معتبر = ردیفی با  revoked_at IS NULL AND now() >= starts_at AND now() < expires_at
--     (انقضا هنگام «خواندن» چک می‌شود؛ job پاکسازی نداریم؛ ردیف‌ها برای سابقه‌ی حسابرسی می‌مانند).
--   • لغو زودهنگام = پر کردن revoked_at (نه DELETE).
--   • بکاند هنگام ساخت JWT / چک نقش، users.permissions را با این جدول union می‌کند.
--   • مقادیر مجاز permission همان لیست users_permissions_check (009) است؛ اگر آن لیست بزرگ شود،
--     CHECK این جدول هم باید با یک مایگریشن جدید به‌روز شود.
-- idempotent؛ هیچ مایگریشن اعمال‌شده‌ای ویرایش نمی‌شود.
-- ============================================================================

CREATE TABLE IF NOT EXISTS identity.user_permission_grants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES identity.users(id)   ON DELETE CASCADE,
  permission  text NOT NULL CHECK (
    permission IN ('lobby', 'amenity_desk', 'kitchen', 'cafe', 'security', 'maintenance', 'service_desk')
  ),
  granted_by  uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  starts_at   timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_permission_grants_window_check CHECK (expires_at > starts_at)
);

CREATE INDEX IF NOT EXISTS user_permission_grants_tenant_id_idx
  ON identity.user_permission_grants (tenant_id);
-- مسیر داغ: «دسترسی‌های فعال این کاربر» (user_id هم FK را پوشش می‌دهد)
CREATE INDEX IF NOT EXISTS user_permission_grants_active_idx
  ON identity.user_permission_grants (user_id, permission, expires_at) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS user_permission_grants_expires_at_idx
  ON identity.user_permission_grants (expires_at) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS user_permission_grants_granted_by_idx
  ON identity.user_permission_grants (granted_by) WHERE granted_by IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON identity.user_permission_grants TO app_user, platform_admin;
ALTER TABLE identity.user_permission_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.user_permission_grants FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_user_permission_grants ON identity.user_permission_grants;
CREATE POLICY tenant_isolation_user_permission_grants ON identity.user_permission_grants
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());
