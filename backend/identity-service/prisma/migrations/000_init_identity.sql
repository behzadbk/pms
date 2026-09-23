-- ============================================================================
-- 000 — جداول پایه‌ی identity (این DDL تا امروز در ریپو وجود نداشت)
-- ============================================================================
-- تا پیش از این، ساخت identity.tenants / identity.users / identity.refresh_tokens
-- بر عهده‌ی `prisma migrate deploy` فرض شده بود، اما سرویس‌ها از `pg` خام استفاده
-- می‌کنند و Prisma هرگز اجرا نمی‌شود؛ در نتیجه 001_enable_rls.sql روی دیتابیس
-- خالی با خطای «relation identity.users does not exist» می‌شکست.
-- این فایل دقیقاً همان مدلی را می‌سازد که prisma/schema.prisma توصیف می‌کند.
--
-- ترتیب اجرا: 000 → 001_enable_rls → 002_platform_admins_and_tiers
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS identity;

-- tenant = حساب مشتری (یک مجتمع/برج). عمداً بدون RLS، چون در لحظه‌ی لاگین باید
-- پیش از شناخته‌شدن tenant با subdomain جستجو شود.
CREATE TABLE IF NOT EXISTS identity.tenants (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  subdomain  text NOT NULL UNIQUE,
  status     text NOT NULL DEFAULT 'trial',
  plan_id    text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenants_status_check CHECK (status IN ('active', 'trial', 'suspended', 'cancelled'))
);

CREATE TABLE IF NOT EXISTS identity.users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE CASCADE,
  full_name     text NOT NULL,
  email         text NOT NULL,
  password_hash text NOT NULL,
  role          text NOT NULL,
  is_active     boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_role_check CHECK (role IN ('admin', 'resident', 'guard', 'staff')),
  CONSTRAINT users_tenant_email_unique UNIQUE (tenant_id, email)
);
CREATE INDEX IF NOT EXISTS users_tenant_idx ON identity.users (tenant_id);

CREATE TABLE IF NOT EXISTS identity.refresh_tokens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL,
  user_id    uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked    boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS refresh_tokens_user_idx ON identity.refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS refresh_tokens_hash_idx ON identity.refresh_tokens (token_hash);
