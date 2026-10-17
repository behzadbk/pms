-- ============================================================================
-- ۰۰۷ — رویدادهای ساکنین (مافیا، فیلم، فوتبال…) و درخواست خدمات (کارواش، خانه‌داری، نظافت…)
-- ============================================================================
-- ۱) رویداد: هر ساکن می‌تواند رویداد بسازد (مثلاً «مافیا ساعت ۱۰ شب»)، مخاطب را «همه‌ی ساکنین»
--    یا «افراد/واحدهای انتخابی» تعیین کند و اگر بازی تعداد نفر لازم دارد (مثلاً ۱۲ نفر)، هر مدعو
--    «می‌آیم / نمی‌آیم» می‌زند و فهرست پر می‌شود.
--      events        : خود رویداد
--      event_rsvps   : پاسخ هر نفر (invited | going | declined) — برای مخاطب «همه» فقط وقتی ردیف
--                      ساخته می‌شود که شخص پاسخ بدهد
-- ۲) خدمات: مدیر ساختمان «نوع خدمت» را به یک دپارتمان وصل می‌کند (identity.departments).
--    ساکن زمان دلخواه را می‌زند → مدیر همان دپارتمان زمان را تأیید و کار را به کارکنان زیردست
--    می‌سپارد. هیچ داشبورد جدا برای هر خدمت نیست.
--      service_types    : کاتالوگ (عنوان، آیکون، دپارتمان مسئول)
--      service_requests : درخواست ساکن و مسیر کار
-- هیچ داده‌ی نمونه‌ای ساخته نمی‌شود (ساختمان جدید کاملاً خام شروع می‌کند). idempotent.
-- ============================================================================

CREATE TABLE IF NOT EXISTS facility.events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL,
  created_by_person uuid NOT NULL,
  host_unit_id      uuid,
  title             text NOT NULL CHECK (length(btrim(title)) BETWEEN 2 AND 80),
  kind              text NOT NULL DEFAULT 'game' CHECK (kind IN ('game', 'screening', 'sport', 'other')),
  description       text,
  place             text,
  amenity_id        uuid REFERENCES facility.amenities(id) ON DELETE SET NULL,
  starts_at         timestamptz NOT NULL,
  needed_players    integer CHECK (needed_players IS NULL OR needed_players BETWEEN 2 AND 500),
  audience          text NOT NULL DEFAULT 'all' CHECK (audience IN ('all', 'selected')),
  status            text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'cancelled')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_tenant_start_idx ON facility.events (tenant_id, starts_at);
CREATE INDEX IF NOT EXISTS events_creator_idx ON facility.events (created_by_person);

CREATE TABLE IF NOT EXISTS facility.event_rsvps (
  event_id     uuid NOT NULL REFERENCES facility.events(id) ON DELETE CASCADE,
  tenant_id    uuid NOT NULL,
  person_id    uuid NOT NULL,
  unit_id      uuid,
  status       text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'going', 'declined')),
  responded_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, person_id)
);
CREATE INDEX IF NOT EXISTS event_rsvps_person_idx ON facility.event_rsvps (person_id, status);
CREATE INDEX IF NOT EXISTS event_rsvps_tenant_id_idx ON facility.event_rsvps (tenant_id);

CREATE TABLE IF NOT EXISTS facility.service_types (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  title           text NOT NULL CHECK (length(btrim(title)) BETWEEN 2 AND 60),
  icon            text,
  description     text,
  -- identity.departments.code — دپارتمانی که درخواست به مدیرش می‌رسد
  department_code text NOT NULL CHECK (department_code ~ '^[a-z][a-z0-9_]{1,30}$'),
  is_active       boolean NOT NULL DEFAULT true,
  sort            integer NOT NULL DEFAULT 100,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, title)
);
CREATE INDEX IF NOT EXISTS service_types_tenant_id_idx ON facility.service_types (tenant_id);

CREATE TABLE IF NOT EXISTS facility.service_requests (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL,
  service_type_id  uuid REFERENCES facility.service_types(id) ON DELETE SET NULL,
  -- عنوان و دپارتمان در لحظه‌ی ثبت نگه داشته می‌شود تا ویرایش کاتالوگ تاریخچه را عوض نکند
  service_title    text NOT NULL,
  department_code  text NOT NULL,
  unit_id          uuid,
  requester_person uuid NOT NULL,
  requester_name   text,
  preferred_at     timestamptz NOT NULL,
  scheduled_at     timestamptz,
  note             text,
  status           text NOT NULL DEFAULT 'submitted'
                   CHECK (status IN ('submitted', 'scheduled', 'assigned', 'in_progress', 'done', 'rejected', 'cancelled')),
  reject_reason    text,
  -- identity.users.id
  assigned_to      uuid,
  decided_by       uuid,
  completed_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS service_requests_dept_idx ON facility.service_requests (tenant_id, department_code, status);
CREATE INDEX IF NOT EXISTS service_requests_person_idx ON facility.service_requests (requester_person, created_at DESC);
CREATE INDEX IF NOT EXISTS service_requests_assignee_idx ON facility.service_requests (assigned_to) WHERE assigned_to IS NOT NULL;

-- ── دسترسی‌ها + RLS (با WITH CHECK) ──────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON facility.events, facility.event_rsvps, facility.service_types, facility.service_requests
  TO app_user, platform_admin;

DO $rls$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['events', 'event_rsvps', 'service_types', 'service_requests'] LOOP
    EXECUTE format('ALTER TABLE facility.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE facility.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON facility.%I', 'tenant_isolation_' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON facility.%I USING (tenant_id = platform.current_tenant_id())'
      || ' WITH CHECK (tenant_id = platform.current_tenant_id())', 'tenant_isolation_' || t, t);
  END LOOP;
END
$rls$;
CREATE INDEX IF NOT EXISTS events_tenant_id_idx ON facility.events (tenant_id);
CREATE INDEX IF NOT EXISTS service_requests_tenant_id_idx ON facility.service_requests (tenant_id);
