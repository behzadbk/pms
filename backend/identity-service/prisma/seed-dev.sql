-- داده‌ی اولیه‌ی محیط dev — یک tenant نمونه + یک کاربر برای هر نقش (admin/resident/guard/staff/accountant)
-- تا بشود از صفحه‌ی ورود فرانت‌اند واقعاً لاگین کرد.
--
-- اجرا (بعد از migrate):
--   psql "$DATABASE_URL" -f prisma/seed-dev.sql
--
-- رمز عبور همه‌ی کاربران زیر: Passw0rd!   (هش bcrypt همین رمز، rounds=10)

INSERT INTO identity.tenants (id, name, subdomain, status)
VALUES ('11111111-1111-1111-1111-111111111111', 'برج آفتاب', 'borj-aftab', 'active')
ON CONFLICT (subdomain) DO NOTHING;

INSERT INTO identity.users (id, tenant_id, full_name, email, password_hash, role, is_active)
VALUES
  ('22222222-2222-2222-2222-222222222221', '11111111-1111-1111-1111-111111111111',
   'مدیر ساختمان', 'admin@borj-aftab.test',
   '$2b$10$Fjm6G5zzq8KYymR75QuU/On5WWQSKjm96uN1jTYgFuFp7BPmXTUoq', 'admin', true),
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111',
   'ساکن نمونه', 'resident@borj-aftab.test',
   '$2b$10$Fjm6G5zzq8KYymR75QuU/On5WWQSKjm96uN1jTYgFuFp7BPmXTUoq', 'resident', true),
  ('22222222-2222-2222-2222-222222222223', '11111111-1111-1111-1111-111111111111',
   'نگهبان نمونه', 'guard@borj-aftab.test',
   '$2b$10$Fjm6G5zzq8KYymR75QuU/On5WWQSKjm96uN1jTYgFuFp7BPmXTUoq', 'guard', true),
  ('22222222-2222-2222-2222-222222222224', '11111111-1111-1111-1111-111111111111',
   'تکنسین نمونه', 'staff@borj-aftab.test',
   '$2b$10$Fjm6G5zzq8KYymR75QuU/On5WWQSKjm96uN1jTYgFuFp7BPmXTUoq', 'staff', true),
  ('22222222-2222-2222-2222-222222222225', '11111111-1111-1111-1111-111111111111',
   'حسابدار نمونه', 'accountant@borj-aftab.test',
   '$2b$10$Fjm6G5zzq8KYymR75QuU/On5WWQSKjm96uN1jTYgFuFp7BPmXTUoq', 'accountant', true)
ON CONFLICT (tenant_id, email) DO NOTHING;

-- ── کارکنان نمونه (مایگریشن 004): ورود با نام کاربری، رمز همه Passw0rd! ──
-- kitchen علاوه بر آشپزخانه، دسترسی دستی کافی‌شاپ هم دارد (نمونه‌ی جابه‌جایی شیفت)
UPDATE identity.users SET username = 'tech', department = 'maintenance'
 WHERE id = '22222222-2222-2222-2222-222222222224' AND username IS NULL;

INSERT INTO identity.users (id, tenant_id, full_name, username, password_hash, role, department, permissions, phone, profile, is_active)
VALUES
  ('33333333-3333-3333-3333-333333333301', '11111111-1111-1111-1111-111111111111',
   'رضا لابی‌من', 'lobby', '$2b$10$Fjm6G5zzq8KYymR75QuU/On5WWQSKjm96uN1jTYgFuFp7BPmXTUoq',
   'staff', 'lobby', '{}', '09120000001', '{"shift":"morning"}', true),
  ('33333333-3333-3333-3333-333333333302', '11111111-1111-1111-1111-111111111111',
   'مریم آشپز', 'kitchen', '$2b$10$Fjm6G5zzq8KYymR75QuU/On5WWQSKjm96uN1jTYgFuFp7BPmXTUoq',
   'staff', 'kitchen', '{cafe}', '09120000002', '{"shift":"rotating"}', true),
  ('33333333-3333-3333-3333-333333333303', '11111111-1111-1111-1111-111111111111',
   'سارا باریستا', 'cafe', '$2b$10$Fjm6G5zzq8KYymR75QuU/On5WWQSKjm96uN1jTYgFuFp7BPmXTUoq',
   'staff', 'cafe', '{}', '09120000003', '{"shift":"evening"}', true),
  ('33333333-3333-3333-3333-333333333304', '11111111-1111-1111-1111-111111111111',
   'علی مسئول مشاعات', 'amenity', '$2b$10$Fjm6G5zzq8KYymR75QuU/On5WWQSKjm96uN1jTYgFuFp7BPmXTUoq',
   'staff', 'amenity_desk', '{}', '09120000004', '{"shift":"morning"}', true)
ON CONFLICT (id) DO NOTHING;
