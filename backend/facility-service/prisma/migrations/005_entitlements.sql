-- ============================================================================
-- ۰۰۵ — آفرها و سهمیه‌ی خدمات هر واحد (Entitlements)
-- ============================================================================
-- در برج‌های هتل‌مانند، هر واحد بر اساس «متراژ» تعدادی خدمت رایگان دارد و مصرف بیش از آن
-- (مازاد) طبق تعرفه به شارژ ماه بعد همان واحد اضافه می‌شود.
--
--  tiers          : سطح‌های متراژ (مثلاً «واحد ۲۴۰ متری») — واحد به بزرگ‌ترین سطحِ ≤ متراژش وصل می‌شود
--  services       : کاتالوگ خدمات (kind = quota | paid | free) با دوره‌ی سهمیه‌ (ماه/سال)
--  tariffs        : نرخ هر خدمت/نوع خدمت (تومان به‌ازای هر «step»؛ مثلاً بولینگ: ۳۰ دقیقه)
--  quotas         : سهمیه‌ی رایگان هر سطح در هر خدمت
--  usage_events   : رویداد مصرف (ثبت توسط مسئول مشاعات یا اسکن QR) + سهم سهمیه/مازاد/مبلغ
--  guest_tickets  : بلیت QR مهمان (استخر، حمام ترکی) که ساکن صادر و مسئول اسکن می‌کند
--
-- مبالغ «تومان» و عدد صحیح‌اند (همانند موتور شارژ). هیچ ساختمانی خودکار داده‌ی آفر نمی‌گیرد؛
-- الگوی «برج باران ۳» فقط با entitlement.apply_baran3_template(tenant) روی همان ساختمان اعمال می‌شود.
-- idempotent.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS entitlement;

CREATE TABLE IF NOT EXISTS entitlement.tiers (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL,
  name       text NOT NULL,
  min_area   numeric NOT NULL CHECK (min_area > 0),
  sort       integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, min_area)
);

CREATE TABLE IF NOT EXISTS entitlement.services (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  code            text NOT NULL CHECK (code ~ '^[a-z][a-z0-9_]{1,40}$'),
  title           text NOT NULL,
  kind            text NOT NULL CHECK (kind IN ('quota', 'paid', 'free')),
  unit_kind       text NOT NULL DEFAULT 'count' CHECK (unit_kind IN ('count', 'minutes', 'hours', 'people', 'days')),
  unit_label      text NOT NULL DEFAULT 'بار',
  period_type     text NOT NULL DEFAULT 'month' CHECK (period_type IN ('month', 'year')),
  supports_ticket boolean NOT NULL DEFAULT false,
  note            text,
  sort            integer NOT NULL DEFAULT 0,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS entitlement.tariffs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL,
  service_id          uuid NOT NULL REFERENCES entitlement.services(id) ON DELETE CASCADE,
  code                text NOT NULL CHECK (code ~ '^[a-z][a-z0-9_]{1,40}$'),
  title               text NOT NULL,
  unit_price          numeric NOT NULL DEFAULT 0 CHECK (unit_price >= 0),   -- تومان به‌ازای هر step
  step                numeric NOT NULL DEFAULT 1 CHECK (step > 0),           -- مثلاً ۳۰ (دقیقه) برای بولینگ
  counts_toward_quota boolean NOT NULL DEFAULT true,                          -- false ⇒ همیشه پولی، از سهمیه کم نمی‌شود
  is_default          boolean NOT NULL DEFAULT false,
  is_active           boolean NOT NULL DEFAULT true,
  sort                integer NOT NULL DEFAULT 0,
  UNIQUE (tenant_id, service_id, code)
);

CREATE TABLE IF NOT EXISTS entitlement.quotas (
  tenant_id  uuid NOT NULL,
  tier_id    uuid NOT NULL REFERENCES entitlement.tiers(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES entitlement.services(id) ON DELETE CASCADE,
  included   numeric NOT NULL CHECK (included >= 0),
  PRIMARY KEY (tier_id, service_id)
);

CREATE TABLE IF NOT EXISTS entitlement.guest_tickets (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL,
  unit_id          uuid NOT NULL,
  service_id       uuid NOT NULL REFERENCES entitlement.services(id),
  guest_name       text NOT NULL,
  token            text NOT NULL,
  valid_until      timestamptz NOT NULL,
  status           text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'used', 'void')),
  issued_by        uuid,
  used_at          timestamptz,
  used_by          uuid,
  usage_event_id   uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, token),
  CHECK (status <> 'used' OR used_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS guest_tickets_unit_idx ON entitlement.guest_tickets (tenant_id, unit_id, created_at DESC);

CREATE TABLE IF NOT EXISTS entitlement.usage_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL,
  unit_id          uuid NOT NULL,
  service_id       uuid NOT NULL REFERENCES entitlement.services(id),
  tariff_id        uuid REFERENCES entitlement.tariffs(id),
  quantity         numeric(12, 2) NOT NULL CHECK (quantity > 0),
  -- نرخ لحظه‌ی ثبت (snapshot): ویرایش بعدی تعرفه روی رویدادهای قبلی اثر نمی‌گذارد
  unit_price       numeric NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  step             numeric NOT NULL DEFAULT 1 CHECK (step > 0),
  counts_toward_quota boolean NOT NULL DEFAULT true,
  occurred_at      timestamptz NOT NULL DEFAULT now(),
  period           text NOT NULL CHECK (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),   -- ماه شمسی رویداد (وقت تهران)
  source           text NOT NULL DEFAULT 'desk' CHECK (source IN ('desk', 'qr_guest')),
  ticket_id        uuid,
  recorded_by      uuid,
  note             text,
  status           text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'void')),
  void_reason      text,
  voided_at        timestamptz,
  voided_by        uuid,
  -- سهم‌بندی (توسط موتور محاسبه می‌شود؛ مرتب‌سازی زمانی در هر دوره‌ی سهمیه)
  quota_qty        numeric(12, 2) NOT NULL DEFAULT 0,      -- بخشی که از سهمیه‌ی رایگان پوشش داده شد
  overage_qty      numeric(12, 2) NOT NULL DEFAULT 0,      -- بخش مازاد
  amount           numeric NOT NULL DEFAULT 0 CHECK (amount >= 0),   -- تومانِ مازاد
  -- اضافه‌شدن به شارژ
  billed_charge_id uuid,
  billed_at        timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS usage_events_unit_period_idx ON entitlement.usage_events (tenant_id, unit_id, period);
CREATE INDEX IF NOT EXISTS usage_events_unit_service_idx ON entitlement.usage_events (unit_id, service_id, occurred_at);
CREATE INDEX IF NOT EXISTS usage_events_unbilled_idx ON entitlement.usage_events (tenant_id, unit_id)
  WHERE status = 'active' AND billed_charge_id IS NULL AND amount > 0;
CREATE UNIQUE INDEX IF NOT EXISTS usage_events_ticket_uniq ON entitlement.usage_events (ticket_id) WHERE ticket_id IS NOT NULL AND status = 'active';

-- --- دسترسی‌ها + ایندکس tenant + RLS (مستقل از 900 تا روی دیتابیس‌های موجود هم کامل شود) -------------
GRANT USAGE ON SCHEMA entitlement TO app_user, platform_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA entitlement TO app_user, platform_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA entitlement GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user, platform_admin;

DO $rls$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'entitlement'
       AND c.relkind IN ('r', 'p')
       AND c.relispartition = false
       AND EXISTS (SELECT 1 FROM pg_attribute a
                    WHERE a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped)
  LOOP
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON entitlement.%I (tenant_id)', t || '_tenant_id_idx', t);
    EXECUTE format('ALTER TABLE entitlement.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE entitlement.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON entitlement.%I', 'tenant_isolation_' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON entitlement.%I USING (tenant_id = platform.current_tenant_id())'
      || ' WITH CHECK (tenant_id = platform.current_tenant_id())',
      'tenant_isolation_' || t, t);
  END LOOP;
END
$rls$;

-- ============================================================================
-- الگوی «برج باران ۳» (برگه‌ی «آفرهای خدمات» + «نرخ خدمات سال ۱۴۰۵»)
-- ============================================================================
-- فقط وقتی اجرا می‌شود که مدیر همان ساختمان بخواهد (دکمه‌ی «اعمال الگو») یا در seed توسعه.
-- نرخ‌های برگه ریال است؛ اینجا به تومان (÷۱۰) نوشته شده‌اند.
-- p_overwrite = false : ردیف‌های موجود (که شاید مدیر ویرایش کرده) دست نمی‌خورند.
-- ============================================================================
CREATE OR REPLACE FUNCTION entitlement.apply_baran3_template(p_tenant uuid, p_overwrite boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
AS $fn$
DECLARE
  tpl jsonb := $json$
  {
    "areas": [240, 245, 260, 280, 305, 315, 340, 490, 700],
    "services": [
      {"code": "banquet", "title": "سالن ضیافت (ظرفیت ۱۰۰ نفر)", "kind": "quota", "unit_kind": "count", "unit_label": "نوبت", "period": "year",
       "note": "دفعات رایگان در سال؛ مازاد به‌ازای هر روز رزرو", "sort": 10,
       "tariffs": [{"code": "entry", "title": "ورودی سالن ضیافت", "price": 5000000, "step": 1, "default": true}],
       "quotas": [2, 2, 2, 3, 3, 3, 4, 5, 7]},
      {"code": "carwash", "title": "کارواش", "kind": "quota", "unit_kind": "count", "unit_label": "نوبت", "period": "month",
       "note": "سواری و شاسی‌بلند از سهمیه کم می‌شوند؛ موتور و دوچرخه همیشه پولی‌اند", "sort": 20,
       "tariffs": [
         {"code": "sedan", "title": "ماشین سواری", "price": 200000, "step": 1, "default": true},
         {"code": "suv", "title": "ماشین شاسی‌بلند", "price": 250000, "step": 1},
         {"code": "motorcycle", "title": "موتورسیکلت", "price": 100000, "step": 1, "counts": false},
         {"code": "bicycle", "title": "دوچرخه", "price": 50000, "step": 1, "counts": false}],
       "quotas": [2, 2, 2, 3, 3, 3, 4, 5, 7]},
      {"code": "pool_guest", "title": "مهمان استخر و مجموعه‌ی آبی", "kind": "quota", "unit_kind": "people", "unit_label": "نفر", "period": "month",
       "supports_ticket": true,
       "note": "جمع مهمانان تایم عمومی و رزرو خانوادگی؛ حضور مهمان همراه مالک الزامی است", "sort": 30,
       "tariffs": [{"code": "guest", "title": "مهمان مازاد (هر نفر)", "price": 400000, "step": 1, "default": true}],
       "quotas": [4, 4, 4, 5, 5, 5, 6, 8, 12]},
      {"code": "housekeeping", "title": "خانه‌داری", "kind": "quota", "unit_kind": "hours", "unit_label": "ساعت", "period": "month",
       "note": "ساعت‌های رایگان مشترک بین شیفت‌ها؛ مازاد بر اساس شیفت", "sort": 40,
       "tariffs": [
         {"code": "day", "title": "ساعت ۸ تا ۱۶", "price": 150000, "step": 1, "default": true},
         {"code": "overtime", "title": "اضافه‌کاری ساعت ۱۶ تا ۲۲", "price": 180000, "step": 1},
         {"code": "night", "title": "شب‌کاری ساعت ۲۲ تا ۲۴", "price": 200000, "step": 1}],
       "quotas": [17, 17, 18, 19, 21, 22, 23, 34, 48]},
      {"code": "bowling", "title": "بولینگ", "kind": "quota", "unit_kind": "minutes", "unit_label": "دقیقه", "period": "month",
       "note": "مازاد به‌ازای هر سانس ۳۰ دقیقه‌ای (حداکثر ۴ نفر در هر لاین)؛ حضور مهمان همراه مالک الزامی است", "sort": 50,
       "tariffs": [{"code": "session30", "title": "هر سانس ۳۰ دقیقه", "price": 100000, "step": 30, "default": true}],
       "quotas": [123, 123, 130, 140, 153, 158, 170, 245, 350]},

      {"code": "cinema_private", "title": "سینما (اکران خصوصی)", "kind": "paid", "unit_kind": "count", "unit_label": "فیلم", "sort": 60,
       "tariffs": [{"code": "film", "title": "رزرو اختصاصی هر فیلم", "price": 500000, "step": 1, "default": true}]},
      {"code": "barber", "title": "آرایشگاه مردانه", "kind": "paid", "unit_kind": "count", "unit_label": "مورد", "sort": 70,
       "note": "رزرو ۲۴ ساعت قبل با هماهنگی پذیرش",
       "tariffs": [
         {"code": "haircut", "title": "اصلاح و کوتاهی مو", "price": 500000, "step": 1, "default": true},
         {"code": "blowdry", "title": "سشوار مو", "price": 250000, "step": 1},
         {"code": "color", "title": "رنگ مو آقایان", "price": 250000, "step": 1}]},
      {"code": "turkish_bath_guest", "title": "حمام ترکی (مهمان)", "kind": "paid", "unit_kind": "people", "unit_label": "نفر", "supports_ticket": true, "sort": 80,
       "note": "برای ساکنان رایگان؛ حضور مهمان همراه مالک الزامی است",
       "tariffs": [
         {"code": "guest", "title": "هر نفر مهمان", "price": 500000, "step": 1, "default": true},
         {"code": "hygiene_pack", "title": "پک بهداشتی", "price": 70000, "step": 1, "counts": false}]},
      {"code": "swim_class", "title": "کلاس آموزشی شنا", "kind": "paid", "unit_kind": "count", "unit_label": "جلسه", "sort": 90,
       "note": "دوره‌های ۱۰ جلسه‌ای با مربی خصوصی",
       "tariffs": [{"code": "session", "title": "هر جلسه", "price": 400000, "step": 1, "default": true}]},
      {"code": "fashion_hall", "title": "سالن ضیافت برای شو لباس", "kind": "paid", "unit_kind": "days", "unit_label": "روز", "sort": 100,
       "tariffs": [{"code": "day", "title": "هر روز", "price": 25000000, "step": 1, "default": true}]},
      {"code": "special_event_hall", "title": "لابی و رستوران برای مراسم خاص", "kind": "paid", "unit_kind": "days", "unit_label": "روز", "sort": 110,
       "tariffs": [{"code": "day", "title": "هر روز", "price": 30000000, "step": 1, "default": true}]},
      {"code": "fruit_party", "title": "میوه‌آرایی مهمانی", "kind": "paid", "unit_kind": "count", "unit_label": "عدد", "sort": 120,
       "tariffs": [
         {"code": "vip", "title": "VIP", "price": 7000000, "step": 1},
         {"code": "plain", "title": "ساده", "price": 5000000, "step": 1, "default": true}]},
      {"code": "fruit_person", "title": "میوه‌آرایی (نفری)", "kind": "paid", "unit_kind": "people", "unit_label": "نفر", "sort": 130,
       "tariffs": [
         {"code": "vip", "title": "VIP", "price": 200000, "step": 1},
         {"code": "plain", "title": "ساده", "price": 100000, "step": 1, "default": true}]},
      {"code": "ev_charge", "title": "شارژ خودرو برقی", "kind": "paid", "unit_kind": "hours", "unit_label": "ساعت", "sort": 140,
       "tariffs": [{"code": "hour", "title": "هر ساعت", "price": 10500, "step": 1, "default": true}]},
      {"code": "ceremony_staff", "title": "اضافه‌کار تشریفات", "kind": "paid", "unit_kind": "hours", "unit_label": "ساعت", "sort": 150,
       "tariffs": [
         {"code": "manager", "title": "مدیریت برج", "price": 320000, "step": 1},
         {"code": "chef", "title": "سرآشپز / مدیر تشریفات / سرپرست خدمات", "price": 250000, "step": 1},
         {"code": "staff", "title": "نیروی تشریفات (خدمات / خانه‌دار)", "price": 200000, "step": 1, "default": true}]},

      {"code": "kids_club", "title": "مهدکودک", "kind": "free", "unit_kind": "hours", "unit_label": "ساعت", "sort": 200,
       "note": "رایگان تا اطلاع ثانوی؛ تایم کاری ۹ تا ۲۱"},
      {"code": "restaurant_booking", "title": "رزرو رستوران", "kind": "free", "unit_kind": "count", "unit_label": "نوبت", "sort": 210,
       "note": "رزرو رایگان؛ ظرفیت ۸۰ نفر"},
      {"code": "cinema_public", "title": "سینما (اکران عمومی)", "kind": "free", "unit_kind": "count", "unit_label": "نوبت", "sort": 220,
       "note": "اکران عمومی رایگان"},
      {"code": "billiard", "title": "بیلیارد", "kind": "free", "unit_kind": "hours", "unit_label": "ساعت", "sort": 230,
       "note": "رایگان؛ حضور مهمان همراه مالک الزامی است"},
      {"code": "snooker", "title": "اسنوکر", "kind": "free", "unit_kind": "hours", "unit_label": "ساعت", "sort": 240,
       "note": "رایگان؛ حضور مهمان همراه مالک الزامی است"}
    ]
  }
  $json$::jsonb;
  s jsonb;
  tf jsonb;
  area numeric;
  idx int;
  v_tier uuid;
  v_service uuid;
  n_tiers int := 0;
  n_services int := 0;
  n_tariffs int := 0;
  n_quotas int := 0;
  rc int;
BEGIN
  IF p_tenant IS NULL THEN
    RAISE EXCEPTION 'tenant الزامی است';
  END IF;

  -- ۱) سطح‌های متراژ
  idx := 0;
  FOR area IN SELECT (a)::numeric FROM jsonb_array_elements_text(tpl -> 'areas') AS a LOOP
    idx := idx + 1;
    INSERT INTO entitlement.tiers (tenant_id, name, min_area, sort)
    VALUES (p_tenant, 'واحد ' || translate(area::text, '0123456789', '۰۱۲۳۴۵۶۷۸۹') || ' متری', area, idx)
    ON CONFLICT (tenant_id, min_area) DO UPDATE
      SET name = CASE WHEN p_overwrite THEN EXCLUDED.name ELSE entitlement.tiers.name END,
          sort = CASE WHEN p_overwrite THEN EXCLUDED.sort ELSE entitlement.tiers.sort END;
    GET DIAGNOSTICS rc = ROW_COUNT;
    n_tiers := n_tiers + rc;
  END LOOP;

  -- ۲) خدمات + تعرفه‌ها + سهمیه‌ها
  FOR s IN SELECT * FROM jsonb_array_elements(tpl -> 'services') LOOP
    INSERT INTO entitlement.services (tenant_id, code, title, kind, unit_kind, unit_label, period_type, supports_ticket, note, sort)
    VALUES (p_tenant, s ->> 'code', s ->> 'title', s ->> 'kind', s ->> 'unit_kind', s ->> 'unit_label',
            COALESCE(s ->> 'period', 'month'), COALESCE((s ->> 'supports_ticket')::boolean, false), s ->> 'note', COALESCE((s ->> 'sort')::int, 0))
    ON CONFLICT (tenant_id, code) DO UPDATE
      SET title = CASE WHEN p_overwrite THEN EXCLUDED.title ELSE entitlement.services.title END,
          kind = CASE WHEN p_overwrite THEN EXCLUDED.kind ELSE entitlement.services.kind END,
          unit_kind = CASE WHEN p_overwrite THEN EXCLUDED.unit_kind ELSE entitlement.services.unit_kind END,
          unit_label = CASE WHEN p_overwrite THEN EXCLUDED.unit_label ELSE entitlement.services.unit_label END,
          period_type = CASE WHEN p_overwrite THEN EXCLUDED.period_type ELSE entitlement.services.period_type END,
          supports_ticket = CASE WHEN p_overwrite THEN EXCLUDED.supports_ticket ELSE entitlement.services.supports_ticket END,
          note = CASE WHEN p_overwrite THEN EXCLUDED.note ELSE entitlement.services.note END,
          sort = CASE WHEN p_overwrite THEN EXCLUDED.sort ELSE entitlement.services.sort END
    RETURNING id INTO v_service;
    n_services := n_services + 1;

    idx := 0;
    FOR tf IN SELECT * FROM jsonb_array_elements(COALESCE(s -> 'tariffs', '[]'::jsonb)) LOOP
      idx := idx + 1;
      INSERT INTO entitlement.tariffs (tenant_id, service_id, code, title, unit_price, step, counts_toward_quota, is_default, sort)
      VALUES (p_tenant, v_service, tf ->> 'code', tf ->> 'title', (tf ->> 'price')::numeric, COALESCE((tf ->> 'step')::numeric, 1),
              COALESCE((tf ->> 'counts')::boolean, true), COALESCE((tf ->> 'default')::boolean, false), idx)
      -- الگوی p_overwrite در همه‌ی upsertهای این تابع: اگر false باشد ردیفِ موجود دست‌نخورده می‌ماند
      -- (اعمال مجدد قالب، ویرایش‌های دستیِ مدیر را پاک نمی‌کند)؛ اگر true باشد مقدارِ قالب برنده است.
      ON CONFLICT (tenant_id, service_id, code) DO UPDATE
        SET title = CASE WHEN p_overwrite THEN EXCLUDED.title ELSE entitlement.tariffs.title END,
            unit_price = CASE WHEN p_overwrite THEN EXCLUDED.unit_price ELSE entitlement.tariffs.unit_price END,
            step = CASE WHEN p_overwrite THEN EXCLUDED.step ELSE entitlement.tariffs.step END,
            counts_toward_quota = CASE WHEN p_overwrite THEN EXCLUDED.counts_toward_quota ELSE entitlement.tariffs.counts_toward_quota END,
            is_default = CASE WHEN p_overwrite THEN EXCLUDED.is_default ELSE entitlement.tariffs.is_default END,
            sort = CASE WHEN p_overwrite THEN EXCLUDED.sort ELSE entitlement.tariffs.sort END;
      n_tariffs := n_tariffs + 1;
    END LOOP;

    -- quotas در قالب یک آرایه‌ی «موقعیتی» است: عنصر i-ام سهمیه‌ی سطحِ i-ام از tpl.areas است
    -- (idx از ۱ شروع می‌شود و با idx-1 به اندیس صفرمحور JSON نگاشت می‌شود)؛ پس ترتیب areas مهم است.
    IF s -> 'quotas' IS NOT NULL THEN
      idx := 0;
      FOR area IN SELECT (a)::numeric FROM jsonb_array_elements_text(tpl -> 'areas') AS a LOOP
        idx := idx + 1;
        SELECT id INTO v_tier FROM entitlement.tiers WHERE tenant_id = p_tenant AND min_area = area;
        INSERT INTO entitlement.quotas (tenant_id, tier_id, service_id, included)
        VALUES (p_tenant, v_tier, v_service, ((s -> 'quotas') ->> (idx - 1))::numeric)
        ON CONFLICT (tier_id, service_id) DO UPDATE
          SET included = CASE WHEN p_overwrite THEN EXCLUDED.included ELSE entitlement.quotas.included END;
        n_quotas := n_quotas + 1;
      END LOOP;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('tiers', n_tiers, 'services', n_services, 'tariffs', n_tariffs, 'quotas', n_quotas);
END
$fn$;

GRANT EXECUTE ON FUNCTION entitlement.apply_baran3_template(uuid, boolean) TO app_user, platform_admin;

-- --- بررسی نهایی همین اسکیما: هر جدول tenant‌دار باید RLS کامل داشته باشد ----------------------------
DO $$
DECLARE bad text;
BEGIN
  SELECT string_agg(c.relname, ', ') INTO bad
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'entitlement' AND c.relkind = 'r'
     AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity
          OR NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid
                          AND pg_get_expr(p.polwithcheck, p.polrelid) LIKE '%platform.current_tenant_id()%'));
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'جدول(های) entitlement بدون RLS کامل: %', bad;
  END IF;
END
$$;
