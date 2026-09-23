-- داده‌ی اولیه‌ی پنل سوپرادمین (محیط dev)
--
-- اجرا (بعد از 002_platform_admins_and_tiers.sql):
--   psql "$DATABASE_URL" -f prisma/seed-platform-admins.sql
--
-- دو کاربر سوپرادمین: behzad و amir — رمز عبور هر دو: 1234
-- (هش bcrypt، rounds=10 — فقط برای محیط توسعه؛ پیش از Production حتماً عوض شود)

INSERT INTO identity.platform_admins (id, username, full_name, password_hash, is_active)
VALUES
  ('33333333-3333-3333-3333-333333333331', 'behzad', 'بهزاد',
   '$2b$10$4qOFBqBYf.MCENuk5uzRb.OWbXVCiEmWWW0bhH6PAOCrzOKqDkYtS', true),
  ('33333333-3333-3333-3333-333333333332', 'amir', 'امیر',
   '$2b$10$4qOFBqBYf.MCENuk5uzRb.OWbXVCiEmWWW0bhH6PAOCrzOKqDkYtS', true)
ON CONFLICT (username) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      full_name     = EXCLUDED.full_name,
      is_active     = true;

-- --- چند ساختمان نمونه، تا لیست پنل خالی نباشد ----------------------------
UPDATE identity.tenants
   SET tier = 'professional', unit_count = 120, floor_count = 24,
       manager_name = 'آقای رضایی', manager_phone = '09121234567',
       monthly_fee = 7800000, outstanding_amount = 0, billing_status = 'settled',
       last_payment_at = CURRENT_DATE - 5, next_due_at = CURRENT_DATE + 25
 WHERE subdomain = 'borj-aftab';

INSERT INTO identity.tenants (id, name, subdomain, status, tier, unit_count, floor_count,
                              manager_name, manager_phone,
                              monthly_fee, outstanding_amount, billing_status,
                              last_payment_at, next_due_at)
VALUES
  ('11111111-1111-1111-1111-111111111112', 'مجتمع نیلوفر', 'niloofar', 'active',
   'economic', 48, 12, 'خانم کریمی', '09129876543',
   1920000, 1920000, 'due', CURRENT_DATE - 33, CURRENT_DATE + 2),
  ('11111111-1111-1111-1111-111111111113', 'ساختمان یاس', 'yas', 'active',
   'simple', 16, 5, 'آقای موسوی', '09351112233',
   400000, 800000, 'overdue', CURRENT_DATE - 71, CURRENT_DATE - 11),
  ('11111111-1111-1111-1111-111111111114', 'برج مروارید', 'morvarid', 'trial',
   'professional', 90, 18, 'آقای احمدی', '09301234567',
   5850000, 0, 'settled', NULL, CURRENT_DATE + 14)
ON CONFLICT (subdomain) DO NOTHING;
