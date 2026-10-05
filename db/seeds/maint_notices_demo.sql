-- ============================================================================
-- داده‌ی نمونه‌ی تیکت/نگهداری (CMMS) و اعلانات برای tenant «برج آفتاب» (فقط محیط توسعه)
-- UUIDها ثابت‌اند و INSERTها ON CONFLICT DO NOTHING دارند → اجرای مجدد بی‌خطر است.
-- ============================================================================
\set tenant '11111111-1111-1111-1111-111111111111'
\set admin  '22222222-2222-2222-2222-222222222221'
\set guard  '22222222-2222-2222-2222-222222222223'
\set tech   '22222222-2222-2222-2222-222222222224'
\set person '90000000-0000-0000-0000-000000000001'
\set unit   'bbbbbbbb-0000-0000-0000-000000001204'

-- --- تجهیزات ---------------------------------------------------------------
INSERT INTO facility.assets (id, tenant_id, name, category, location, service_interval_days) VALUES
  ('a5500000-0000-0000-0000-000000000001', :'tenant', 'آسانسور A',                    'elevator',   'لابی بلوک A',    30),
  ('a5500000-0000-0000-0000-000000000002', :'tenant', 'آسانسور B',                    'elevator',   'لابی بلوک B',    30),
  ('a5500000-0000-0000-0000-000000000003', :'tenant', 'موتورخانه مرکزی',              'hvac',       'زیرزمین',        90),
  ('a5500000-0000-0000-0000-000000000004', :'tenant', 'لوله‌کشی مشاعات پارکینگ -۱',   'plumbing',   'پارکینگ طبقه -۱', NULL),
  ('a5500000-0000-0000-0000-000000000005', :'tenant', 'سیستم اطفا حریق',              'fire',       'کل ساختمان',     365),
  ('a5500000-0000-0000-0000-000000000006', :'tenant', 'روشنایی راه‌پله طبقه ۳',        'lighting',   'راه‌پله طبقه ۳', NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO facility.service_records (id, tenant_id, asset_id, type, description, performer, cost, performed_on) VALUES
  ('5e550000-0000-0000-0000-000000000001', :'tenant', 'a5500000-0000-0000-0000-000000000002', 'service',    'سرویس ماهانه، روغن‌کاری ریل و بررسی ترمز',  'شرکت آسانسور پارس', 3500000, CURRENT_DATE - 34),
  ('5e550000-0000-0000-0000-000000000002', :'tenant', 'a5500000-0000-0000-0000-000000000002', 'repair',     'تعویض کفشک‌های راهنمای کابین',               'شرکت آسانسور پارس', 8200000, CURRENT_DATE - 96),
  ('5e550000-0000-0000-0000-000000000003', :'tenant', 'a5500000-0000-0000-0000-000000000001', 'service',    'سرویس ماهانه',                                'شرکت آسانسور پارس', 3500000, CURRENT_DATE - 12),
  ('5e550000-0000-0000-0000-000000000004', :'tenant', 'a5500000-0000-0000-0000-000000000003', 'service',    'سرویس دیگ و مشعل پیش از فصل سرما',           'تأسیسات نوین',      6000000, CURRENT_DATE - 60),
  ('5e550000-0000-0000-0000-000000000005', :'tenant', 'a5500000-0000-0000-0000-000000000006', 'replace',    'تعویض لامپ LED ۱۸ وات',                      'تکنسین نمونه',       180000, CURRENT_DATE - 145),
  ('5e550000-0000-0000-0000-000000000006', :'tenant', 'a5500000-0000-0000-0000-000000000005', 'inspection', 'شارژ و بازدید سالانه کپسول‌ها',               'ایمن‌گستر',         4400000, CURRENT_DATE - 300)
ON CONFLICT (id) DO NOTHING;

-- --- برنامه‌ی سرویس دوره‌ای -------------------------------------------------
INSERT INTO facility.maintenance_schedules (id, tenant_id, asset_id, title, interval_days, last_done, next_due, assignee_login) VALUES
  ('5c550000-0000-0000-0000-000000000001', :'tenant', 'a5500000-0000-0000-0000-000000000001', 'سرویس ماهانه',            30,  CURRENT_DATE - 12,  CURRENT_DATE + 18, NULL),
  ('5c550000-0000-0000-0000-000000000002', :'tenant', 'a5500000-0000-0000-0000-000000000002', 'سرویس ماهانه',            30,  CURRENT_DATE - 34,  CURRENT_DATE - 4,  :'tech'),
  ('5c550000-0000-0000-0000-000000000003', :'tenant', 'a5500000-0000-0000-0000-000000000003', 'بازرسی فصلی',             90,  CURRENT_DATE - 60,  CURRENT_DATE + 30, NULL),
  ('5c550000-0000-0000-0000-000000000004', :'tenant', 'a5500000-0000-0000-0000-000000000005', 'بازدید سالانه کپسول‌ها',   365, CURRENT_DATE - 300, CURRENT_DATE + 65, NULL)
ON CONFLICT (id) DO NOTHING;

-- --- تیکت‌ها -----------------------------------------------------------------
INSERT INTO facility.tickets (id, tenant_id, kind, category, asset_category, subject, body, priority, status, location, unit_id, reporter_person, reporter_login, reporter_name, asset_id, sla_due_at, created_at) VALUES
  ('7c550000-0000-0000-0000-000000000001', :'tenant', 'fault', 'گزارش خرابی', 'plumbing', 'نشتی آب در پارکینگ طبقه -۱',
   'از دیروز کف پارکینگ طبقه -۱ کنار ستون ۱۲ آب جمع شده؛ به نظر می‌رسد از لوله‌ی سقف نشت می‌کند.', 'urgent', 'open', 'پارکینگ طبقه -۱ · کنار ستون ۱۲', NULL, NULL, :'guard', 'نگهبانی شیفت شب (نگهبانی)', 'a5500000-0000-0000-0000-000000000004', now() + interval '2 hours', now() - interval '2 days'),
  ('7c550000-0000-0000-0000-000000000002', :'tenant', 'fault', 'گزارش خرابی', 'elevator', 'صدای ساییدگی آسانسور B',
   'موقع حرکت بین طبقه ۴ و ۵ صدای ساییدگی شدید می‌دهد و کابین کمی تکان می‌خورد.', 'high', 'assigned', 'آسانسور B · لابی بلوک B', :'unit', :'person', NULL, 'رضا کریمی (واحد 1204)', 'a5500000-0000-0000-0000-000000000002', now() + interval '20 hours', now() - interval '3 hours'),
  ('7c550000-0000-0000-0000-000000000003', :'tenant', 'suggestion', 'پیشنهاد', NULL, 'نصب دوربین در راهروی طبقه دوم',
   'پیشنهاد می‌کنم برای امنیت بیشتر، در راهروی طبقه دوم دوربین نصب شود.', 'low', 'open', NULL, :'unit', :'person', NULL, 'رضا کریمی (واحد 1204)', NULL, now() + interval '7 days', now() - interval '7 days')
ON CONFLICT (id) DO NOTHING;

UPDATE facility.tickets SET assignee_login = :'tech', assignee_name = 'تکنسین نمونه' WHERE id = '7c550000-0000-0000-0000-000000000002' AND assignee_login IS NULL;

INSERT INTO facility.ticket_events (id, tenant_id, ticket_id, type, text, actor_name, actor_role, created_at) VALUES
  ('e7550000-0000-0000-0000-000000000001', :'tenant', '7c550000-0000-0000-0000-000000000001', 'created', 'تیکت ثبت شد', 'نگهبانی شیفت شب', 'guard', now() - interval '2 days'),
  ('e7550000-0000-0000-0000-000000000002', :'tenant', '7c550000-0000-0000-0000-000000000002', 'created', 'تیکت ثبت شد', 'رضا کریمی (واحد 1204)', 'resident', now() - interval '3 hours'),
  ('e7550000-0000-0000-0000-000000000003', :'tenant', '7c550000-0000-0000-0000-000000000002', 'assign',  'به تکنسین نمونه ارجاع شد', 'مدیر ساختمان', 'admin', now() - interval '2 hours'),
  ('e7550000-0000-0000-0000-000000000004', :'tenant', '7c550000-0000-0000-0000-000000000003', 'created', 'تیکت ثبت شد', 'رضا کریمی (واحد 1204)', 'resident', now() - interval '7 days')
ON CONFLICT (id) DO NOTHING;

INSERT INTO facility.work_orders (id, tenant_id, title, description, asset_id, ticket_id, priority, status, assignee_login, assignee_name, due_date, created_by) VALUES
  ('0a550000-0000-0000-0000-000000000001', :'tenant', 'صدای ساییدگی آسانسور B', E'موقع حرکت بین طبقه ۴ و ۵ صدای ساییدگی شدید می‌دهد.\nمحل: آسانسور B · لابی بلوک B',
   'a5500000-0000-0000-0000-000000000002', '7c550000-0000-0000-0000-000000000002', 'high', 'open', :'tech', 'تکنسین نمونه', CURRENT_DATE + 1, :'admin')
ON CONFLICT (id) DO NOTHING;

-- --- اعلانات و نظرسنجی --------------------------------------------------------
INSERT INTO notification.announcements (id, tenant_id, kind, title, body, emergency, pinned, audience, weighted, closes_at, created_by, created_by_name, created_at) VALUES
  ('a0550000-0000-0000-0000-000000000001', :'tenant', 'announcement', 'قطعی آب — چهارشنبه', 'به دلیل تعمیرات لوله‌کشی، از ساعت ۹ تا ۱۳ آب ساختمان قطع خواهد بود.', true, true,
   ARRAY['all_residents','staff','guard'], false, NULL, :'admin', 'مدیر ساختمان', now() - interval '1 hour'),
  ('a0550000-0000-0000-0000-000000000002', :'tenant', 'announcement', 'شستشوی نمای ساختمان', 'تیم نظافت از روز شنبه کار شستشوی نما را آغاز می‌کند.', false, false,
   ARRAY['all_residents'], false, NULL, :'admin', 'مدیر ساختمان', now() - interval '1 day'),
  ('a0550000-0000-0000-0000-000000000003', :'tenant', 'poll', 'تعویض دستگاه پارکینگ هوشمند', 'لطفاً نظر خود را درباره‌ی تعویض راهبند و سیستم پلاک‌خوان پارکینگ اعلام کنید.', false, false,
   ARRAY['owners'], true, now() + interval '7 days', :'admin', 'مدیر ساختمان', now() - interval '3 days')
ON CONFLICT (id) DO NOTHING;

INSERT INTO notification.poll_questions (id, tenant_id, announcement_id, position, text, multi) VALUES
  ('b0550000-0000-0000-0000-000000000001', :'tenant', 'a0550000-0000-0000-0000-000000000003', 0, 'با تعویض دستگاه موافقید؟', false)
ON CONFLICT (id) DO NOTHING;
INSERT INTO notification.poll_options (id, tenant_id, question_id, position, label) VALUES
  ('c0550000-0000-0000-0000-000000000001', :'tenant', 'b0550000-0000-0000-0000-000000000001', 0, 'موافقم'),
  ('c0550000-0000-0000-0000-000000000002', :'tenant', 'b0550000-0000-0000-0000-000000000001', 1, 'مخالفم'),
  ('c0550000-0000-0000-0000-000000000003', :'tenant', 'b0550000-0000-0000-0000-000000000001', 2, 'نظری ندارم')
ON CONFLICT (id) DO NOTHING;
