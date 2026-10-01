-- ============================================================================
-- ۰۰۵ — ساکنین، خانوار و حالت والدین (مرجع: design_handoff_hamino_v5/RESIDENTS.md)
-- ============================================================================
-- مدل:
--   residency.users              ← «هر شماره موبایل یک حساب»؛ سطح پلتفرم (بدون tenant_id)،
--                                   چون یک نفر می‌تواند در چند واحد و چند ساختمان عضو باشد.
--   property.units (+ستون‌ها)    ← parking_count، storage_no، owner_user_id، occupancy
--   residency.memberships        ← عضویت شخص در واحد (نقش، نوع سکونت، وضعیت)
--   residency.invites            ← لینک دعوت ۷ روزه
--   residency.parent_controls    ← حالت والدین کودک
--   residency.child_requests     ← درخواست کودک که منتظر تأیید والد است (۳۰ دقیقه)
--   residency.child_spend        ← دفتر خرج کودک (برای سقف ماهانه)
--   residency.family_login_codes ← کد ۶ رقمی/QR یک‌بارمصرف ۵ دقیقه‌ای
--   residency.move_outs          ← تخلیه‌ی زمان‌بندی‌شده
--   residency.building_settings  ← توکن QR لابی هر ساختمان
--
-- «ساختمان» در API همان tenant است (identity.tenants)؛ property.buildings بلوک‌های داخل آن است.
--
-- قواعدی که خود دیتابیس تضمین می‌کند (مستقل از کد سرویس):
--   * یکتا بودن موبایل                               → UNIQUE روی residency.users.phone
--   * حداکثر یک سرپرست زنده در هر واحد               → UNIQUE INDEX جزئی
--   * «دقیقاً یک» سرپرست وقتی واحد ساکن دارد          → CONSTRAINT TRIGGER با تأخیر تا COMMIT
--     (برای این‌که واگذاری سرپرستی در یک تراکنش — اول تنزل، بعد ارتقا — مجاز باشد)
--   * پرستار بدون تاریخ پایان ثبت نمی‌شود              → CHECK
--   * مالک غیرساکن ⇔ residency = owner_absent          → CHECK
--   * وضعیت اشغال واحد همیشه با عضویت‌ها هم‌خوان است   → TRIGGER
--
-- idempotent: اجرای دوباره بی‌خطر است.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS residency;

-- ── ۱) حساب شخص (یک موبایل = یک حساب) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS residency.users (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- E.164 (مثلاً +989123456789). کودکی که سیم‌کارت ندارد موبایل ندارد (ورود با کد خانواده).
  phone                text,
  name                 text NOT NULL,
  national_id          text,
  -- سال تولد شمسی (مثلاً ۱۳۹۴) — همان چیزی که والد در فرم وارد می‌کند
  birth_year           integer,
  status               text NOT NULL DEFAULT 'active',
  merged_into          uuid REFERENCES residency.users(id),
  -- هر توکنی که قبل از این لحظه صادر شده باطل است (خروج از همه‌ی دستگاه‌ها / مسدودسازی / تخلیه)
  sessions_valid_after timestamptz NOT NULL DEFAULT '-infinity',
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT residency_users_status_check CHECK (status IN ('active', 'blocked', 'merged')),
  CONSTRAINT residency_users_phone_e164 CHECK (phone IS NULL OR phone ~ '^\+[1-9][0-9]{7,14}$'),
  CONSTRAINT residency_users_birth_year_check CHECK (birth_year IS NULL OR birth_year BETWEEN 1300 AND 1500),
  CONSTRAINT residency_users_national_id_check CHECK (national_id IS NULL OR national_id ~ '^[0-9]{10}$')
);
CREATE UNIQUE INDEX IF NOT EXISTS residency_users_phone_unique ON residency.users (phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS residency_users_national_id_idx ON residency.users (national_id) WHERE national_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS residency_users_name_idx ON residency.users (name);

-- حساب ورود (ایمیل/نام کاربری در هر مجتمع) به شخص وصل می‌شود
ALTER TABLE identity.users ADD COLUMN IF NOT EXISTS person_id uuid REFERENCES residency.users(id);
ALTER TABLE identity.users ADD COLUMN IF NOT EXISTS sessions_valid_after timestamptz NOT NULL DEFAULT '-infinity';
CREATE INDEX IF NOT EXISTS users_person_idx ON identity.users (person_id) WHERE person_id IS NOT NULL;

-- ── ۲) واحد ────────────────────────────────────────────────────────────────
ALTER TABLE property.units ADD COLUMN IF NOT EXISTS parking_count integer NOT NULL DEFAULT 0;
ALTER TABLE property.units ADD COLUMN IF NOT EXISTS storage_no    text;
ALTER TABLE property.units ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES residency.users(id);
ALTER TABLE property.units ADD COLUMN IF NOT EXISTS occupancy     text NOT NULL DEFAULT 'vacant';
ALTER TABLE property.units DROP CONSTRAINT IF EXISTS units_occupancy_check;
ALTER TABLE property.units ADD CONSTRAINT units_occupancy_check CHECK (occupancy IN ('vacant', 'owner', 'tenant'));
ALTER TABLE property.units DROP CONSTRAINT IF EXISTS units_parking_check;
ALTER TABLE property.units ADD CONSTRAINT units_parking_check CHECK (parking_count >= 0);
CREATE UNIQUE INDEX IF NOT EXISTS units_tenant_number_unique ON property.units (tenant_id, unit_number);

-- ── ۳) عضویت ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS residency.memberships (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  user_id     uuid NOT NULL REFERENCES residency.users(id),
  unit_id     uuid NOT NULL REFERENCES property.units(id),
  role        text NOT NULL,
  residency   text NOT NULL,
  pays_charge boolean NOT NULL DEFAULT false,
  start_date  date NOT NULL DEFAULT CURRENT_DATE,
  end_date    date,                       -- پایان اجاره / پایان دسترسی پرستار
  status      text NOT NULL DEFAULT 'invited',
  invited_by  uuid,                       -- residency.users.id یا identity.users.id (مدیر)
  channel     text NOT NULL DEFAULT 'manual',
  -- عنوان نمایشی نسبت (همسر، فرزند …) و تنظیمات جزئی (حالت ساده‌ی سالمند، دسترسی مالی بزرگسال، روزهای حضور پرستار)
  title       text,
  settings    jsonb NOT NULL DEFAULT '{}'::jsonb,
  ended_at    timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT memberships_role_check CHECK (role IN ('head', 'adult', 'child', 'caregiver', 'senior', 'owner_absent')),
  CONSTRAINT memberships_residency_check CHECK (residency IN ('owner', 'tenant', 'owner_absent')),
  CONSTRAINT memberships_status_check CHECK (status IN ('invited', 'pending_approval', 'pending_head', 'active', 'ended')),
  CONSTRAINT memberships_channel_check CHECK (channel IN ('sms', 'qr_lobby', 'excel', 'manual', 'household')),
  -- قاعده ۹: پرستار/کمک‌کار تاریخ پایان اجباری دارد
  CONSTRAINT memberships_caregiver_end_check CHECK (role <> 'caregiver' OR end_date IS NOT NULL),
  -- قاعده ۳: مالک غیرساکن نقش و نوع سکونت مخصوص خودش را دارد
  CONSTRAINT memberships_owner_absent_check CHECK ((role = 'owner_absent') = (residency = 'owner_absent')),
  CONSTRAINT memberships_dates_check CHECK (end_date IS NULL OR end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS memberships_unit_idx ON residency.memberships (unit_id);
CREATE INDEX IF NOT EXISTS memberships_user_idx ON residency.memberships (user_id);
-- هر شخص در هر واحد حداکثر یک عضویت زنده
CREATE UNIQUE INDEX IF NOT EXISTS memberships_live_unique
  ON residency.memberships (unit_id, user_id) WHERE status <> 'ended';
-- قاعده ۲ (نیمه‌ی «حداکثر»): هر واحد حداکثر یک سرپرست زنده (دعوت‌شده یا فعال)
CREATE UNIQUE INDEX IF NOT EXISTS memberships_one_head
  ON residency.memberships (unit_id) WHERE role = 'head' AND status IN ('invited', 'active');

-- قاعده ۲ (نیمه‌ی «دست‌کم»): اگر واحد ساکن زنده دارد، باید سرپرست زنده هم داشته باشد.
-- DEFERRABLE INITIALLY DEFERRED → در پایان تراکنش بررسی می‌شود؛ پس واگذاری سرپرستی
-- (اول سرپرست قبلی بزرگسال می‌شود، بعد نفر جدید سرپرست) در یک تراکنش مجاز است،
-- اما حذف سرپرست بدون واگذاری در COMMIT رد می‌شود.
CREATE OR REPLACE FUNCTION residency.assert_unit_head() RETURNS trigger
LANGUAGE plpgsql AS $fn$
DECLARE
  v_unit uuid := COALESCE(NEW.unit_id, OLD.unit_id);
  v_live int;
  v_heads int;
BEGIN
  SELECT count(*) FILTER (WHERE role <> 'owner_absent'),
         count(*) FILTER (WHERE role = 'head')
    INTO v_live, v_heads
    FROM residency.memberships
   WHERE unit_id = v_unit AND status IN ('invited', 'active');
  IF v_live > 0 AND v_heads <> 1 THEN
    RAISE EXCEPTION 'هر واحد باید دقیقاً یک سرپرست داشته باشد؛ ابتدا سرپرستی را واگذار کنید'
      USING ERRCODE = 'P0001', HINT = 'unit_head_required';
  END IF;
  RETURN NULL;
END
$fn$;
DROP TRIGGER IF EXISTS memberships_unit_head ON residency.memberships;
CREATE CONSTRAINT TRIGGER memberships_unit_head
  AFTER INSERT OR UPDATE OR DELETE ON residency.memberships
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION residency.assert_unit_head();

-- وضعیت اشغال واحد از روی عضویت‌های زنده (دعوت‌شده/فعال) محاسبه می‌شود.
-- مالک غیرساکن شمرده نمی‌شود (قاعده ۳) → واحد «خالی» یا «اجاره‌ای» می‌ماند.
CREATE OR REPLACE FUNCTION residency.refresh_unit_occupancy(p_unit uuid) RETURNS void
LANGUAGE sql AS $fn$
  UPDATE property.units u
     SET occupancy = COALESCE((
           SELECT CASE WHEN bool_or(m.residency = 'tenant') THEN 'tenant' ELSE 'owner' END
             FROM residency.memberships m
            WHERE m.unit_id = u.id AND m.status IN ('invited', 'active') AND m.role <> 'owner_absent'
           HAVING count(*) > 0), 'vacant')
   WHERE u.id = p_unit;
$fn$;
CREATE OR REPLACE FUNCTION residency.memberships_occupancy_trg() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN PERFORM residency.refresh_unit_occupancy(OLD.unit_id); END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN PERFORM residency.refresh_unit_occupancy(NEW.unit_id); END IF;
  RETURN NULL;
END
$fn$;
DROP TRIGGER IF EXISTS memberships_occupancy ON residency.memberships;
CREATE TRIGGER memberships_occupancy
  AFTER INSERT OR UPDATE OR DELETE ON residency.memberships
  FOR EACH ROW EXECUTE FUNCTION residency.memberships_occupancy_trg();

-- ── ۴) دعوت ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS residency.invites (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  membership_id uuid NOT NULL REFERENCES residency.memberships(id) ON DELETE CASCADE,
  token         text NOT NULL UNIQUE,
  channel       text NOT NULL DEFAULT 'sms',
  expires_at    timestamptz NOT NULL DEFAULT now() + interval '7 days',
  used_at       timestamptz,
  revoked_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invites_channel_check CHECK (channel IN ('sms', 'qr_lobby', 'excel', 'manual'))
);
CREATE INDEX IF NOT EXISTS invites_membership_idx ON residency.invites (membership_id);

-- ── ۵) حالت والدین ─────────────────────────────────────────────────────────
-- CHECK نمی‌تواند زیرپرس‌وجو داشته باشد؛ اعتبارسنجی نقشه‌ی ماژول‌ها در یک تابع IMMUTABLE
CREATE OR REPLACE FUNCTION residency.valid_module_map(m jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT jsonb_typeof(m) = 'object'
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_each(m) e
        WHERE e.key NOT IN ('food', 'amenity', 'guest', 'ticket', 'parcel', 'notice')
           OR jsonb_typeof(e.value) <> 'number'
           OR (e.value)::text NOT IN ('0', '1', '2'))
$fn$;

CREATE TABLE IF NOT EXISTS residency.parent_controls (
  membership_id uuid PRIMARY KEY REFERENCES residency.memberships(id) ON DELETE CASCADE,
  tenant_id     uuid NOT NULL,
  preset        text NOT NULL DEFAULT 'c12',
  -- 0 پنهان | 1 با تأیید | 2 آزاد
  modules       jsonb NOT NULL DEFAULT '{"food":1,"amenity":1,"guest":0,"ticket":1,"parcel":2,"notice":2}'::jsonb,
  monthly_cap   bigint NOT NULL DEFAULT 500000,       -- تومان
  quiet_hours   jsonb DEFAULT '{"from":"22:00","to":"07:00"}'::jsonb,   -- null = خاموش
  weekly_report boolean NOT NULL DEFAULT true,
  exit_lock     boolean NOT NULL DEFAULT true,
  lobby_alert   boolean NOT NULL DEFAULT false,
  exit_pin_hash text,                                  -- رمز والد برای خروج از حساب کودک
  updated_by    uuid,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT parent_controls_preset_check CHECK (preset IN ('u7', 'c12', 't17', 'custom')),
  CONSTRAINT parent_controls_cap_check CHECK (monthly_cap >= 0),
  CONSTRAINT parent_controls_modules_check CHECK (residency.valid_module_map(modules)),
  CONSTRAINT parent_controls_quiet_check CHECK (
    quiet_hours IS NULL OR (quiet_hours ? 'from' AND quiet_hours ? 'to'
      AND quiet_hours->>'from' ~ '^[0-2][0-9]:[0-5][0-9]$' AND quiet_hours->>'to' ~ '^[0-2][0-9]:[0-5][0-9]$'))
);

-- ── ۶) درخواست کودک و دفتر خرج ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS residency.child_requests (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL,
  child_membership_id uuid NOT NULL REFERENCES residency.memberships(id) ON DELETE CASCADE,
  type                text NOT NULL,
  payload             jsonb NOT NULL DEFAULT '{}'::jsonb,
  amount              bigint,
  reason              text,          -- چرا تأیید لازم شد: approval | over_cap
  status              text NOT NULL DEFAULT 'pending',
  expires_at          timestamptz NOT NULL DEFAULT now() + interval '30 minutes',
  decided_by          uuid,
  decided_at          timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT child_requests_type_check CHECK (type IN ('order', 'amenity', 'guest', 'ticket')),
  CONSTRAINT child_requests_status_check CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  CONSTRAINT child_requests_amount_check CHECK (amount IS NULL OR amount >= 0)
);
CREATE INDEX IF NOT EXISTS child_requests_child_idx ON residency.child_requests (child_membership_id, status);

CREATE TABLE IF NOT EXISTS residency.child_spend (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL,
  child_membership_id uuid NOT NULL REFERENCES residency.memberships(id) ON DELETE CASCADE,
  unit_id             uuid NOT NULL,
  amount              bigint NOT NULL CHECK (amount >= 0),
  type                text NOT NULL DEFAULT 'order',
  request_id          uuid REFERENCES residency.child_requests(id),
  description         text,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS child_spend_child_idx ON residency.child_spend (child_membership_id, created_at);

-- ── ۷) کد ورود خانواده (یک‌بارمصرف، ۵ دقیقه) ──────────────────────────────
CREATE TABLE IF NOT EXISTS residency.family_login_codes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  membership_id uuid NOT NULL REFERENCES residency.memberships(id) ON DELETE CASCADE,
  code          text NOT NULL CHECK (code ~ '^[0-9]{6}$'),
  qr_token      text NOT NULL UNIQUE,
  expires_at    timestamptz NOT NULL DEFAULT now() + interval '5 minutes',
  used_at       timestamptz,
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS family_login_codes_code_idx ON residency.family_login_codes (code) WHERE used_at IS NULL;

-- ── ۸) تخلیه ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS residency.move_outs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  unit_id       uuid NOT NULL REFERENCES property.units(id),
  move_out_date date NOT NULL,
  status        text NOT NULL DEFAULT 'scheduled',
  blockers      jsonb NOT NULL DEFAULT '{}'::jsonb,
  requested_by  uuid,
  executed_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT move_outs_status_check CHECK (status IN ('scheduled', 'done', 'cancelled'))
);
CREATE UNIQUE INDEX IF NOT EXISTS move_outs_one_scheduled ON residency.move_outs (unit_id) WHERE status = 'scheduled';

-- ── ۹) تنظیمات ساختمان (QR لابی) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS residency.building_settings (
  tenant_id   uuid PRIMARY KEY REFERENCES identity.tenants(id) ON DELETE CASCADE,
  lobby_token text NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ── ۱۰) سطح دسترسی ماژول برای کودک (استفاده‌ی مشترک identity و facility) ──
-- 0 پنهان | 1 با تأیید | 2 آزاد. برای غیرکودک همیشه 2 (قواعد نقش‌های دیگر در سرویس است).
CREATE OR REPLACE FUNCTION residency.child_module_level(p_membership uuid, p_module text) RETURNS int
LANGUAGE sql STABLE AS $fn$
  SELECT COALESCE((pc.modules ->> p_module)::int, 0)
    FROM residency.parent_controls pc
   WHERE pc.membership_id = p_membership
$fn$;

-- آیا الان (به وقت تهران) در ساعت سکوت کودک هستیم؟ بازه‌ی شبانه (۲۲ تا ۷) را درست حساب می‌کند.
CREATE OR REPLACE FUNCTION residency.in_quiet_hours(p_membership uuid, p_at timestamptz DEFAULT now()) RETURNS boolean
LANGUAGE sql STABLE AS $fn$
  SELECT COALESCE((
    SELECT CASE
             WHEN (q->>'from')::time <= (q->>'to')::time
               THEN t >= (q->>'from')::time AND t < (q->>'to')::time
             ELSE t >= (q->>'from')::time OR t < (q->>'to')::time
           END
      FROM (SELECT pc.quiet_hours AS q, (p_at AT TIME ZONE 'Asia/Tehran')::time AS t
              FROM residency.parent_controls pc
             WHERE pc.membership_id = p_membership AND pc.quiet_hours IS NOT NULL) x
  ), false)
$fn$;

-- ── ۱۱) دسترسی و RLS ───────────────────────────────────────────────────────
GRANT USAGE ON SCHEMA residency TO app_user, platform_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA residency TO app_user, platform_admin;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA residency TO app_user, platform_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA residency GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user, platform_admin;

-- residency.users عمداً RLS ندارد (مثل identity.tenants): حساب شخص سطح پلتفرم است و
-- یک نفر در چند ساختمان عضو است. سرویس فقط از طریق عضویت‌های همان tenant به آن می‌رسد.
DO $rls$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'residency'
       AND c.relkind IN ('r', 'p')
       AND c.relispartition = false
       AND EXISTS (SELECT 1 FROM pg_attribute a
                    WHERE a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped)
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', 'residency', t);
    EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY', 'residency', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', 'tenant_isolation_' || t, 'residency', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I.%I USING (tenant_id = platform.current_tenant_id())'
      || ' WITH CHECK (tenant_id = platform.current_tenant_id())',
      'tenant_isolation_' || t, 'residency', t);
    IF NOT EXISTS (SELECT 1 FROM pg_class i JOIN pg_namespace n2 ON n2.oid = i.relnamespace
                    WHERE n2.nspname = 'residency' AND i.relname = t || '_tenant_id_idx') THEN
      EXECUTE format('CREATE INDEX %I ON residency.%I (tenant_id)', t || '_tenant_id_idx', t);
    END IF;
  END LOOP;
END
$rls$;
