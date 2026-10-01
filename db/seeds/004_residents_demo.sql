-- ============================================================================
-- داده‌ی نمونه‌ی ماژول ساکنین، خانوار و حالت والدین — «برج آفتاب»
-- ============================================================================
-- همان سناریوی فایل طراحی (Hamino - New Modules v2): واحد ۱۲۰۴ با خانوار رضا کریمی،
-- کودک «سارا» با حالت والدین ۷ تا ۱۲ سال، صف درخواست‌های عضویت از QR لابی، واحد خالی ۱۲۰۲
-- و قرارداد رو‌به‌پایان ۱۱۰۳. حساب ورود resident@borj-aftab.test همان «رضا کریمی» است.
--
-- فقط محیط توسعه. با superuser اجرا می‌شود (RLS دور زده می‌شود). اجرای دوباره بی‌خطر است.
-- ============================================================================
\set tenant '11111111-1111-1111-1111-111111111111'
\set block  'aaaaaaaa-0000-0000-0000-000000000001'

-- مشخصات ساختمان برای پنل سوپرادمین
UPDATE identity.tenants SET unit_count = GREATEST(unit_count, 12), manager_name = COALESCE(manager_name, 'علی مرادی')
 WHERE id = :'tenant';

-- ── واحدها ──────────────────────────────────────────────────────────────────
INSERT INTO property.units (id, tenant_id, building_id, unit_number, floor, area_sqm, parking_count, storage_no) VALUES
  ('bbbbbbbb-0000-0000-0000-000000001204', :'tenant', :'block', '1204', 12, 118, 2, '14'),
  ('bbbbbbbb-0000-0000-0000-000000001203', :'tenant', :'block', '1203', 12, 96,  1, '13'),
  ('bbbbbbbb-0000-0000-0000-000000001202', :'tenant', :'block', '1202', 12, 104, 1, NULL),
  ('bbbbbbbb-0000-0000-0000-000000001104', :'tenant', :'block', '1104', 11, 118, 2, '9'),
  ('bbbbbbbb-0000-0000-0000-000000001103', :'tenant', :'block', '1103', 11, 72,  1, NULL),
  ('bbbbbbbb-0000-0000-0000-000000001102', :'tenant', :'block', '1102', 11, 104, 1, '7'),
  ('bbbbbbbb-0000-0000-0000-000000000803', :'tenant', :'block', '803',  8,  88,  1, NULL)
ON CONFLICT (id) DO NOTHING;

-- ── اشخاص (یک موبایل = یک حساب) ────────────────────────────────────────────
INSERT INTO residency.users (id, phone, name, national_id, birth_year) VALUES
  ('90000000-0000-0000-0000-000000000001', '+989123456789', 'رضا کریمی',      '0012345678', 1360),
  ('90000000-0000-0000-0000-000000000002', '+989120000011', 'مینا کریمی',     NULL,         1363),
  ('90000000-0000-0000-0000-000000000003', NULL,            'سارا',           NULL,         1394),
  ('90000000-0000-0000-0000-000000000004', NULL,            'آرین',           NULL,         1399),
  ('90000000-0000-0000-0000-000000000005', '+989350000012', 'مریم رحیمی',     NULL,         NULL),
  ('90000000-0000-0000-0000-000000000006', '+989121110001', 'حسین رادمنش',    NULL,         NULL),
  ('90000000-0000-0000-0000-000000000007', '+989121110002', 'نسرین احمدی',    NULL,         1340),
  ('90000000-0000-0000-0000-000000000008', '+982188880000', 'شرکت آتی‌سازان', NULL,         NULL),
  ('90000000-0000-0000-0000-000000000009', '+989351124408', 'لیلا صادقی',     NULL,         NULL),
  ('90000000-0000-0000-0000-000000000010', '+989128801204', 'بهرام نیک‌پور',  NULL,         NULL),
  ('90000000-0000-0000-0000-000000000011', '+989214007731', 'نگار کریمی',     NULL,         NULL),
  ('90000000-0000-0000-0000-000000000012', '+989121110003', 'کامران نوری',    NULL,         NULL),
  ('90000000-0000-0000-0000-000000000013', '+989121110004', 'امید فرهادی',    NULL,         NULL),
  ('90000000-0000-0000-0000-000000000014', NULL,            'نیما فرهادی',    NULL,         1397),
  ('90000000-0000-0000-0000-000000000015', '+989121110005', 'پروین احمدی',    NULL,         1318)
ON CONFLICT (id) DO NOTHING;

-- حساب ورود ساکن نمونه = رضا کریمی (سرپرست ۱۲۰۴)
UPDATE identity.users SET person_id = '90000000-0000-0000-0000-000000000001', full_name = 'رضا کریمی', phone = '09123456789'
 WHERE id = '22222222-2222-2222-2222-222222222222' AND person_id IS NULL;

-- مالک‌ها روی خود واحد
UPDATE property.units SET owner_user_id = '90000000-0000-0000-0000-000000000006' WHERE id = 'bbbbbbbb-0000-0000-0000-000000001204';
UPDATE property.units SET owner_user_id = '90000000-0000-0000-0000-000000000007' WHERE id = 'bbbbbbbb-0000-0000-0000-000000001203';
UPDATE property.units SET owner_user_id = '90000000-0000-0000-0000-000000000008' WHERE id = 'bbbbbbbb-0000-0000-0000-000000001202';
UPDATE property.units SET owner_user_id = '90000000-0000-0000-0000-000000000013' WHERE id = 'bbbbbbbb-0000-0000-0000-000000001102';
UPDATE property.units SET owner_user_id = '90000000-0000-0000-0000-000000000010' WHERE id = 'bbbbbbbb-0000-0000-0000-000000000803';

-- ── عضویت‌ها ────────────────────────────────────────────────────────────────
-- (constraint trigger سرپرست تا پایان تراکنش صبر می‌کند؛ هر دستور INSERT خودش یک تراکنش است،
--  پس سرپرست هر واحد در همان دستور اعضای دیگر درج می‌شود.)
INSERT INTO residency.memberships (id, tenant_id, user_id, unit_id, role, residency, pays_charge, start_date, end_date, status, channel, title, settings, created_at) VALUES
  -- ۱۲۰۴ — مستأجر، خانوار رضا کریمی
  ('91000000-0000-0000-0000-000000000001', :'tenant', '90000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000001204', 'head',      'tenant', true,  CURRENT_DATE - 30, CURRENT_DATE + 335, 'active',  'sms',       'سرپرست خانوار', '{}', now() - interval '30 days'),
  ('91000000-0000-0000-0000-000000000002', :'tenant', '90000000-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000001204', 'adult',     'tenant', false, CURRENT_DATE - 30, NULL,              'active',  'household', 'همسر',          '{"finance_access":true}', now() - interval '29 days'),
  ('91000000-0000-0000-0000-000000000003', :'tenant', '90000000-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000001204', 'child',     'tenant', false, CURRENT_DATE - 27, NULL,              'active',  'household', 'فرزند',         '{}', now() - interval '27 days'),
  ('91000000-0000-0000-0000-000000000004', :'tenant', '90000000-0000-0000-0000-000000000004', 'bbbbbbbb-0000-0000-0000-000000001204', 'child',     'tenant', false, CURRENT_DATE - 27, NULL,              'active',  'household', 'فرزند',         '{"device":"تبلت خانه"}', now() - interval '27 days'),
  ('91000000-0000-0000-0000-000000000005', :'tenant', '90000000-0000-0000-0000-000000000005', 'bbbbbbbb-0000-0000-0000-000000001204', 'caregiver', 'tenant', false, CURRENT_DATE,      CURRENT_DATE + 50,  'invited', 'household', 'پرستار',        '{"days":"شنبه تا چهارشنبه"}', now() - interval '1 day'),
  ('91000000-0000-0000-0000-000000000006', :'tenant', '90000000-0000-0000-0000-000000000006', 'bbbbbbbb-0000-0000-0000-000000001204', 'owner_absent', 'owner_absent', false, '2023-03-21', NULL,        'active',  'manual',    'مالک',          '{}', now() - interval '400 days'),
  -- ۱۲۰۳ — مالک ساکن + سالمند
  ('91000000-0000-0000-0000-000000000007', :'tenant', '90000000-0000-0000-0000-000000000007', 'bbbbbbbb-0000-0000-0000-000000001203', 'head',      'owner',  true,  '2021-03-21', NULL,               'active',  'manual',    'سرپرست خانوار', '{}', now() - interval '900 days'),
  ('91000000-0000-0000-0000-000000000008', :'tenant', '90000000-0000-0000-0000-000000000015', 'bbbbbbbb-0000-0000-0000-000000001203', 'senior',    'owner',  false, '2021-03-21', NULL,               'active',  'manual',    'مادر',          '{"easy_mode":true}', now() - interval '900 days'),
  -- ۱۲۰۲ — خالی؛ مالک غیرساکن شرکت آتی‌سازان
  ('91000000-0000-0000-0000-000000000009', :'tenant', '90000000-0000-0000-0000-000000000008', 'bbbbbbbb-0000-0000-0000-000000001202', 'owner_absent', 'owner_absent', false, '2022-03-21', NULL,        'active',  'manual',    'مالک',          '{}', now() - interval '600 days'),
  -- ۱۱۰۳ — مستأجر، پایان قرارداد تا ۲۰ روز
  ('91000000-0000-0000-0000-000000000010', :'tenant', '90000000-0000-0000-0000-000000000012', 'bbbbbbbb-0000-0000-0000-000000001103', 'head',      'tenant', true,  CURRENT_DATE - 345, CURRENT_DATE + 20, 'active',  'sms',       'سرپرست خانوار', '{}', now() - interval '345 days'),
  -- ۱۱۰۲ — مالک ساکن + کودک
  ('91000000-0000-0000-0000-000000000011', :'tenant', '90000000-0000-0000-0000-000000000013', 'bbbbbbbb-0000-0000-0000-000000001102', 'head',      'owner',  true,  '2020-03-21', NULL,               'active',  'manual',    'سرپرست خانوار', '{}', now() - interval '1200 days'),
  ('91000000-0000-0000-0000-000000000012', :'tenant', '90000000-0000-0000-0000-000000000014', 'bbbbbbbb-0000-0000-0000-000000001102', 'child',     'owner',  false, '2020-03-21', NULL,               'active',  'household', 'فرزند',         '{}', now() - interval '1200 days'),
  -- ۸۰۳ — بهرام نیک‌پور ساکن فعلی (برای سناریوی «انتقال»)
  ('91000000-0000-0000-0000-000000000013', :'tenant', '90000000-0000-0000-0000-000000000010', 'bbbbbbbb-0000-0000-0000-000000000803', 'head',      'owner',  true,  '2022-03-21', NULL,               'active',  'manual',    'سرپرست خانوار', '{}', now() - interval '700 days')
ON CONFLICT (id) DO NOTHING;

-- صف درخواست‌های عضویت (QR لابی)
INSERT INTO residency.memberships (id, tenant_id, user_id, unit_id, role, residency, pays_charge, start_date, status, channel, created_at) VALUES
  ('91000000-0000-0000-0000-000000000021', :'tenant', '90000000-0000-0000-0000-000000000009', 'bbbbbbbb-0000-0000-0000-000000001104', 'head',  'tenant', true,  CURRENT_DATE, 'pending_approval', 'qr_lobby', now() - interval '2 hours'),
  ('91000000-0000-0000-0000-000000000022', :'tenant', '90000000-0000-0000-0000-000000000010', 'bbbbbbbb-0000-0000-0000-000000001202', 'head',  'tenant', true,  CURRENT_DATE, 'pending_approval', 'qr_lobby', now() - interval '1 day'),
  ('91000000-0000-0000-0000-000000000023', :'tenant', '90000000-0000-0000-0000-000000000011', 'bbbbbbbb-0000-0000-0000-000000001204', 'adult', 'tenant', false, CURRENT_DATE, 'pending_head',     'qr_lobby', now() - interval '3 hours')
ON CONFLICT (id) DO NOTHING;

-- دعوت پرستار (۷ روز)
INSERT INTO residency.invites (id, tenant_id, membership_id, token, channel, expires_at) VALUES
  ('92000000-0000-0000-0000-000000000001', :'tenant', '91000000-0000-0000-0000-000000000005', 'demo-invite-maryam', 'sms', now() + interval '6 days')
ON CONFLICT (id) DO NOTHING;

-- ── حالت والدین ─────────────────────────────────────────────────────────────
INSERT INTO residency.parent_controls (membership_id, tenant_id, preset, modules, monthly_cap, quiet_hours, weekly_report, exit_lock, lobby_alert) VALUES
  ('91000000-0000-0000-0000-000000000003', :'tenant', 'c12', '{"food":1,"amenity":1,"guest":0,"ticket":1,"parcel":2,"notice":2}', 500000,  '{"from":"22:00","to":"07:00"}', true, true, false),
  ('91000000-0000-0000-0000-000000000004', :'tenant', 'u7',  '{"food":0,"amenity":0,"guest":0,"ticket":0,"parcel":0,"notice":0}', 0,       '{"from":"22:00","to":"07:00"}', true, true, false),
  ('91000000-0000-0000-0000-000000000012', :'tenant', 't17', '{"food":2,"amenity":1,"guest":1,"ticket":2,"parcel":2,"notice":2}', 1500000, NULL,                              true, false, false)
ON CONFLICT (membership_id) DO NOTHING;

-- سارا این ماه ۲۸۰ هزار تومان خرج کرده (مانده‌ی سقف ۲۲۰ هزار — مثل فایل طراحی)
INSERT INTO residency.child_spend (id, tenant_id, child_membership_id, unit_id, amount, type, description, created_at) VALUES
  ('93000000-0000-0000-0000-000000000001', :'tenant', '91000000-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000001204', 280000, 'order', 'کافی‌شاپ ساختمان', date_trunc('month', now()) + interval '1 day')
ON CONFLICT (id) DO NOTHING;

-- ── QR لابی ────────────────────────────────────────────────────────────────
INSERT INTO residency.building_settings (tenant_id, lobby_token) VALUES (:'tenant', 'borj-aftab-lobby-demo')
ON CONFLICT (tenant_id) DO NOTHING;

-- ── مشاعات (نسخه‌ی ۲) ──────────────────────────────────────────────────────
INSERT INTO facility.amenities (id, tenant_id, name, type, capacity, requires_approval, max_hours, icon, rule_text) VALUES
  ('dddddddd-0000-0000-0000-000000000004', :'tenant', 'استخر',     'pool',        4, true, 1, 'pool',   'حداکثر ۱ ساعت · ۴ نفر · نیاز به تأیید مسئول مشاعات'),
  ('dddddddd-0000-0000-0000-000000000005', :'tenant', 'روف‌گاردن', 'roof_garden', 20, true, 3, 'deck',  'حداکثر ۳ ساعت · نیاز به تأیید')
ON CONFLICT (id) DO NOTHING;
UPDATE facility.amenities SET name = 'باشگاه', icon = 'fitness_center', max_hours = 1,
       rule_text = 'رزرو فوری، بدون نیاز به تأیید · ۱ ساعت'
 WHERE id = 'dddddddd-0000-0000-0000-000000000001';
UPDATE facility.amenities SET icon = 'groups', max_hours = 3, rule_text = 'حداکثر ۳ ساعت · نیاز به تأیید مسئول مشاعات'
 WHERE id = 'dddddddd-0000-0000-0000-000000000002';
UPDATE facility.amenities SET is_active = false WHERE id = 'dddddddd-0000-0000-0000-000000000003' AND icon IS NULL;
UPDATE facility.amenities SET icon = 'movie' WHERE id = 'dddddddd-0000-0000-0000-000000000003';

-- ساعت‌های پُر امروز در استخر: ۱۰ (در انتظار تأیید) و ۱۸ (قطعی) — به وقت تهران
INSERT INTO facility.reservations (id, tenant_id, amenity_id, unit_id, requested_by, user_id, start_at, end_at, status) VALUES
  ('ffffffff-0000-0000-0000-000000000011', :'tenant', 'dddddddd-0000-0000-0000-000000000004', 'bbbbbbbb-0000-0000-0000-000000001103',
   '22222222-2222-2222-2222-222222222221', '90000000-0000-0000-0000-000000000012',
   ((now() AT TIME ZONE 'Asia/Tehran')::date + time '10:00') AT TIME ZONE 'Asia/Tehran',
   ((now() AT TIME ZONE 'Asia/Tehran')::date + time '11:00') AT TIME ZONE 'Asia/Tehran', 'pending'),
  ('ffffffff-0000-0000-0000-000000000012', :'tenant', 'dddddddd-0000-0000-0000-000000000004', 'bbbbbbbb-0000-0000-0000-000000001203',
   '22222222-2222-2222-2222-222222222221', '90000000-0000-0000-0000-000000000007',
   ((now() AT TIME ZONE 'Asia/Tehran')::date + time '18:00') AT TIME ZONE 'Asia/Tehran',
   ((now() AT TIME ZONE 'Asia/Tehran')::date + time '19:00') AT TIME ZONE 'Asia/Tehran', 'confirmed')
ON CONFLICT (id) DO NOTHING;

-- ── تاریخچه‌ی نمونه در audit (برای «پرونده شخص» سوپرادمین) ───────────────────
-- تاریخچه‌ی نمونه تا ۳۰ روز قبل است؛ پارتیشن ماه‌های اخیر را مطمئن کن
SELECT audit.ensure_month_partition(d::date) FROM generate_series(CURRENT_DATE - 62, CURRENT_DATE, interval '1 month') d;
SELECT audit.ensure_month_partition((now() - interval '30 days')::date);
INSERT INTO audit.event_logs (tenant_id, occurred_at, session_id, source, level, action, actor_role, request_body)
SELECT :'tenant', ts, gen_random_uuid(), 'identity-svc', 'info', act, role, body::jsonb
  FROM (VALUES
    (now() - interval '30 days', 'membership.created', 'system',
     '{"summary":"ثبت از طریق لینک دعوت","subject_user_id":"90000000-0000-0000-0000-000000000001","seed":true}'),
    (now() - interval '27 days', 'membership.created', 'resident',
     '{"summary":"رضا کریمی «سارا» را با حالت والدین اضافه کرد","subject_user_id":"90000000-0000-0000-0000-000000000001","seed":true}')
  ) v(ts, act, role, body)
 WHERE NOT EXISTS (SELECT 1 FROM audit.event_logs WHERE request_body->>'seed' = 'true' AND tenant_id = :'tenant');
