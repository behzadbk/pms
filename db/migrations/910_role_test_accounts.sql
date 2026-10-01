-- ============================================================================
-- حساب‌های تست برای هر نقش روی سرور آنلاین — «ساختمان تست» با کد مجتمع test
-- ============================================================================
-- یک بار اجرا می‌شود و مثل بقیه‌ی مایگریشن‌ها با checksum ثبت می‌شود. فقط ردیف‌های خودش را
-- می‌سازد و به داده‌ی ساختمان‌های واقعی دست نمی‌زند. رمزها اینجا فقط هش bcrypt هستند.
-- حذف همه‌ی این حساب‌ها:
--   DELETE FROM identity.tenants WHERE subdomain = 'test';
--   DELETE FROM identity.platform_admins WHERE username = 'superadmin-test';
-- با superuser اجرا می‌شود، پس RLS دور زده می‌شود.
-- ============================================================================

INSERT INTO identity.tenants (id, name, subdomain, status, tier, unit_count, floor_count, address, manager_name)
VALUES ('7e570000-0000-0000-0000-000000000001', 'ساختمان تست', 'test', 'active', 'professional', 4, 2, 'آدرس آزمایشی', 'مدیر تست')
ON CONFLICT (subdomain) DO NOTHING;

-- سوپرادمین تست — پنل پلتفرم
INSERT INTO identity.platform_admins (username, full_name, password_hash, is_active)
VALUES ('superadmin-test', 'سوپرادمین تست', '$2b$10$r84iZjea0m8XxI/LiGHpSehkv81sGCwfjWwmAf/a6G8j2OaL5wppi', true)
ON CONFLICT (username) DO NOTHING;

-- بلوک و واحدها
INSERT INTO property.buildings (id, tenant_id, name, address, total_units)
VALUES ('7e570000-0000-0000-0000-0000000000f1', '7e570000-0000-0000-0000-000000000001', 'ساختمان تست — بلوک A', 'آدرس آزمایشی', 4)
ON CONFLICT (id) DO NOTHING;

INSERT INTO property.units (id, tenant_id, building_id, unit_number, floor, area_sqm, parking_count, storage_no) VALUES
  ('7e570000-0000-0000-0000-000000000101', '7e570000-0000-0000-0000-000000000001', '7e570000-0000-0000-0000-0000000000f1', '101', 1, 110, 1, '1'),
  ('7e570000-0000-0000-0000-000000000102', '7e570000-0000-0000-0000-000000000001', '7e570000-0000-0000-0000-0000000000f1', '102', 1, 95,  1, NULL),
  ('7e570000-0000-0000-0000-000000000201', '7e570000-0000-0000-0000-000000000001', '7e570000-0000-0000-0000-0000000000f1', '201', 2, 110, 1, '2'),
  ('7e570000-0000-0000-0000-000000000202', '7e570000-0000-0000-0000-000000000001', '7e570000-0000-0000-0000-0000000000f1', '202', 2, 95,  1, NULL)
ON CONFLICT (id) DO NOTHING;

-- شخص‌ها: ساکن تست که سرپرست واحد ۱۰۱ است، و فرزندش برای تست اپ کودک
INSERT INTO residency.users (id, phone, name, birth_year) VALUES
  ('7e570000-0000-0000-0000-0000000000c1', '+989990000101', 'ساکن تست', 1365),
  ('7e570000-0000-0000-0000-0000000000c2', NULL,            'کودک تست', 1395)
ON CONFLICT (id) DO NOTHING;

-- حساب‌های ورود با نام کاربری
INSERT INTO identity.users (id, tenant_id, full_name, username, password_hash, role, department, phone, person_id) VALUES
  ('7e570000-0000-0000-0000-0000000000a1', '7e570000-0000-0000-0000-000000000001', 'مدیر تست', 't-admin', '$2b$10$YcfKI6nODkQY9o9FssThk.sE8DljJn8.qcrAY4CtcCBP1UTD0NhdK', 'admin', NULL, NULL, NULL),
  ('7e570000-0000-0000-0000-0000000000a2', '7e570000-0000-0000-0000-000000000001', 'حسابدار تست', 't-accountant', '$2b$10$wBsP1ng5CtJuHqX.ztefqO3GB6P5S4m5EWtKBUflzsqxV45k2HshS', 'accountant', NULL, NULL, NULL),
  ('7e570000-0000-0000-0000-0000000000a3', '7e570000-0000-0000-0000-000000000001', 'نگهبان تست', 't-guard', '$2b$10$emUkJtRlleQTy24MNDEVeO3wFYWrEPp46XZ6esh0w2KH5Dcq0lc1y', 'guard', NULL, NULL, NULL),
  ('7e570000-0000-0000-0000-0000000000a4', '7e570000-0000-0000-0000-000000000001', 'ساکن تست', 't-resident', '$2b$10$n50dYijiWNTq.YPcKo7I9enOu9J1G1.692ktXKjhjt5kFW2raJFR.', 'resident', NULL, '09990000101', '7e570000-0000-0000-0000-0000000000c1'),
  ('7e570000-0000-0000-0000-0000000000b1', '7e570000-0000-0000-0000-000000000001', 'کارمند لابی — تست', 't-lobby', '$2b$10$eIU/0a6QowkJNBbfW909WOD6Db3dy3ZGeGA1w0neygUKxnyxiDZRO', 'staff', 'lobby', NULL, NULL),
  ('7e570000-0000-0000-0000-0000000000b2', '7e570000-0000-0000-0000-000000000001', 'مسئول مشاعات — تست', 't-amenity', '$2b$10$G.i8OSmOBrZdN83RCyG0lOqn30Y50E2MRTwAeLbqBM7lxUMhe8hti', 'staff', 'amenity_desk', NULL, NULL),
  ('7e570000-0000-0000-0000-0000000000b3', '7e570000-0000-0000-0000-000000000001', 'آشپزخانه — تست', 't-kitchen', '$2b$10$pwSBgeBtIQOFNi3Ed0uo5OcpS2HLOyeRGCA/ffoMR4MMeD0UV0ZRO', 'staff', 'kitchen', NULL, NULL),
  ('7e570000-0000-0000-0000-0000000000b4', '7e570000-0000-0000-0000-000000000001', 'کافی‌شاپ — تست', 't-cafe', '$2b$10$uo1WM9uBksIsOIDnex.mu.qrIpQ.MyH5GiD7lrm4AOHYpMVi60Zzm', 'staff', 'cafe', NULL, NULL),
  ('7e570000-0000-0000-0000-0000000000b5', '7e570000-0000-0000-0000-000000000001', 'امنیت — تست', 't-security', '$2b$10$x0CJObaEydxzoDoPfPqqheZ.H1UmupzTy97M3aylrzYsWbJuQwutG', 'staff', 'security', NULL, NULL),
  ('7e570000-0000-0000-0000-0000000000b6', '7e570000-0000-0000-0000-000000000001', 'تأسیسات — تست', 't-maintenance', '$2b$10$hx6yWzwtOXAge7d61JaHiOOZSi6FL0yrmnj7adgIHDhIEVO6oBdQ.', 'staff', 'maintenance', NULL, NULL),
  ('7e570000-0000-0000-0000-0000000000b7', '7e570000-0000-0000-0000-000000000001', 'نظافت — تست', 't-cleaning', '$2b$10$ToC9xybmhTueMpFAJ3wHTOiiYVaynUZV6.0CqKtarXaM5own7.NCK', 'staff', 'cleaning', NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- عضویت‌ها: سرپرست و کودک در یک دستور، به خاطر constraint trigger «دقیقاً یک سرپرست»
INSERT INTO residency.memberships (id, tenant_id, user_id, unit_id, role, residency, pays_charge, start_date, status, channel, title, settings) VALUES
  ('7e570000-0000-0000-0000-0000000000d1', '7e570000-0000-0000-0000-000000000001', '7e570000-0000-0000-0000-0000000000c1', '7e570000-0000-0000-0000-000000000101', 'head',  'owner', true,  CURRENT_DATE, 'active', 'manual',    'سرپرست خانوار', '{"finance_access":true}'),
  ('7e570000-0000-0000-0000-0000000000d2', '7e570000-0000-0000-0000-000000000001', '7e570000-0000-0000-0000-0000000000c2', '7e570000-0000-0000-0000-000000000101', 'child', 'owner', false, CURRENT_DATE, 'active', 'household', 'فرزند',         '{}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO residency.parent_controls (membership_id, tenant_id, preset, modules, monthly_cap, quiet_hours, weekly_report, exit_lock, lobby_alert) VALUES
  ('7e570000-0000-0000-0000-0000000000d2', '7e570000-0000-0000-0000-000000000001', 'c12', '{"food":1,"amenity":1,"guest":0,"ticket":1,"parcel":2,"notice":2}', 500000, '{"from":"22:00","to":"07:00"}', true, true, false)
ON CONFLICT (membership_id) DO NOTHING;

UPDATE property.units SET owner_user_id = '7e570000-0000-0000-0000-0000000000c1'
 WHERE id = '7e570000-0000-0000-0000-000000000101' AND owner_user_id IS NULL;

INSERT INTO property.user_unit_links (id, tenant_id, user_id, unit_id, relation, is_primary_contact)
VALUES ('7e570000-0000-0000-0000-0000000000e1', '7e570000-0000-0000-0000-000000000001', '7e570000-0000-0000-0000-0000000000a4', '7e570000-0000-0000-0000-000000000101', 'owner', true)
ON CONFLICT (id) DO NOTHING;
