-- داده‌ی اولیه‌ی محیط dev — یک tenant نمونه + یک کاربر برای هر نقش (admin/resident/guard/staff)
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
   '$2b$10$Fjm6G5zzq8KYymR75QuU/On5WWQSKjm96uN1jTYgFuFp7BPmXTUoq', 'staff', true)
ON CONFLICT (tenant_id, email) DO NOTHING;
