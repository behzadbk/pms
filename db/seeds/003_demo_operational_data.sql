-- ============================================================================
-- داده‌ی نمونه‌ی عملیاتی برای tenant «برج آفتاب» (فقط محیط توسعه)
-- ============================================================================
-- هدف: پنل‌های واحدها/رزرو/مالی/نگهبانی/سفارش غذا با داده‌ی واقعی بالا بیایند.
-- UUIDها ثابت‌اند و همه‌ی INSERTها ON CONFLICT DO NOTHING دارند، پس اجرای مجدد
-- بی‌خطر است.
-- ============================================================================

\set tenant '11111111-1111-1111-1111-111111111111'
\set admin  '22222222-2222-2222-2222-222222222221'
\set resident '22222222-2222-2222-2222-222222222222'
\set guard  '22222222-2222-2222-2222-222222222223'

-- --- ساختمان و واحدها ------------------------------------------------------
INSERT INTO property.buildings (id, tenant_id, name, address, total_units) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', :'tenant', 'برج آفتاب — بلوک A', 'تهران، سعادت‌آباد', 120)
ON CONFLICT (id) DO NOTHING;

INSERT INTO property.units (id, tenant_id, building_id, unit_number, floor, area_sqm, ownership_status) VALUES
  ('bbbbbbbb-0000-0000-0000-000000000001', :'tenant', 'aaaaaaaa-0000-0000-0000-000000000001', '101', 1, 92.5,  'owner_occupied'),
  ('bbbbbbbb-0000-0000-0000-000000000002', :'tenant', 'aaaaaaaa-0000-0000-0000-000000000001', '102', 1, 110.0, 'rented'),
  ('bbbbbbbb-0000-0000-0000-000000000003', :'tenant', 'aaaaaaaa-0000-0000-0000-000000000001', '203', 2, 92.5,  'owner_occupied')
ON CONFLICT (id) DO NOTHING;

INSERT INTO property.user_unit_links (id, tenant_id, user_id, unit_id, relation, is_primary_contact) VALUES
  ('cccccccc-0000-0000-0000-000000000001', :'tenant', :'resident', 'bbbbbbbb-0000-0000-0000-000000000001', 'owner', true),
  ('cccccccc-0000-0000-0000-000000000002', :'tenant', :'admin',    'bbbbbbbb-0000-0000-0000-000000000003', 'owner', true)
ON CONFLICT (id) DO NOTHING;

-- --- امکانات مشترک و قوانین رزرو --------------------------------------------
INSERT INTO facility.amenities (id, tenant_id, name, type, capacity, requires_approval) VALUES
  ('dddddddd-0000-0000-0000-000000000001', :'tenant', 'سالن ورزشی', 'gym', 15, false),
  ('dddddddd-0000-0000-0000-000000000002', :'tenant', 'سالن اجتماعات', 'hall', 60, true),
  ('dddddddd-0000-0000-0000-000000000003', :'tenant', 'سینما', 'cinema', 20, false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO facility.booking_rules (id, tenant_id, amenity_id, max_bookings_per_unit_per_period,
                                    period_type, min_advance_hours, max_advance_days, deposit_amount) VALUES
  ('eeeeeeee-0000-0000-0000-000000000001', :'tenant', 'dddddddd-0000-0000-0000-000000000001', 8, 'month', 6,  14, 0),
  ('eeeeeeee-0000-0000-0000-000000000002', :'tenant', 'dddddddd-0000-0000-0000-000000000002', 1, 'month', 48, 30, 2000000)
ON CONFLICT (id) DO NOTHING;

INSERT INTO facility.reservations (id, tenant_id, amenity_id, unit_id, requested_by, start_at, end_at, status, applied_rule_id) VALUES
  ('ffffffff-0000-0000-0000-000000000001', :'tenant', 'dddddddd-0000-0000-0000-000000000001',
   'bbbbbbbb-0000-0000-0000-000000000001', :'resident',
   date_trunc('day', now()) + interval '1 day 18 hours',
   date_trunc('day', now()) + interval '1 day 19 hours',
   'confirmed', 'eeeeeeee-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- --- مالی: فرمول شارژ، شارژ ماهانه، پرداخت ----------------------------------
INSERT INTO finance.charge_formulas (id, tenant_id, name, calc_type, base_amount, amount_per_sqm) VALUES
  ('a1a1a1a1-0000-0000-0000-000000000001', :'tenant', 'شارژ پایه ۱۴۰۵', 'hybrid', 1500000, 25000)
ON CONFLICT (id) DO NOTHING;

INSERT INTO finance.monthly_charges (id, tenant_id, unit_id, period, formula_id, base_amount, total_amount, due_date, status) VALUES
  ('b1b1b1b1-0000-0000-0000-000000000001', :'tenant', 'bbbbbbbb-0000-0000-0000-000000000001',
   to_char(now(), 'YYYY-MM'), 'a1a1a1a1-0000-0000-0000-000000000001', 3812500, 3812500, CURRENT_DATE + 10, 'pending'),
  ('b1b1b1b1-0000-0000-0000-000000000002', :'tenant', 'bbbbbbbb-0000-0000-0000-000000000002',
   to_char(now(), 'YYYY-MM'), 'a1a1a1a1-0000-0000-0000-000000000001', 4250000, 4250000, CURRENT_DATE + 10, 'paid')
ON CONFLICT (id) DO NOTHING;

INSERT INTO finance.payments (id, tenant_id, monthly_charge_id, amount, gateway, status, idempotency_key, paid_at) VALUES
  ('c1c1c1c1-0000-0000-0000-000000000001', :'tenant', 'b1b1b1b1-0000-0000-0000-000000000002',
   4250000, 'zarinpal', 'success', 'seed-demo-payment-1', now() - interval '2 days')
ON CONFLICT (id) DO NOTHING;

-- --- نگهبانی ---------------------------------------------------------------
INSERT INTO guard.guest_passes (id, tenant_id, unit_id, issued_by, guest_name, code, valid_until, max_uses, status) VALUES
  ('d1d1d1d1-0000-0000-0000-000000000001', :'tenant', 'bbbbbbbb-0000-0000-0000-000000000001', :'resident',
   'مهمان نمونه', 'PMS-DEMO-001', now() + interval '2 days', 2, 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO guard.parcels (id, tenant_id, unit_id, courier_company, tracking_code, received_by, status) VALUES
  ('e1e1e1e1-0000-0000-0000-000000000001', :'tenant', 'bbbbbbbb-0000-0000-0000-000000000001',
   'تیپاکس', 'TPX-99120', :'guard', 'pending_pickup')
ON CONFLICT (id) DO NOTHING;

-- --- کافه/رستوران داخل مجتمع ------------------------------------------------
INSERT INTO fnb.venues (id, tenant_id, name, is_open, opens_at, closes_at, prep_time_minutes) VALUES
  ('f1f1f1f1-0000-0000-0000-000000000001', :'tenant', 'کافه لابی', true, '08:00', '23:00', 20)
ON CONFLICT (id) DO NOTHING;

INSERT INTO fnb.menu_categories (id, tenant_id, venue_id, name, sort_order) VALUES
  ('f2f2f2f2-0000-0000-0000-000000000001', :'tenant', 'f1f1f1f1-0000-0000-0000-000000000001', 'نوشیدنی گرم', 1),
  ('f2f2f2f2-0000-0000-0000-000000000002', :'tenant', 'f1f1f1f1-0000-0000-0000-000000000001', 'غذای اصلی', 2)
ON CONFLICT (id) DO NOTHING;

INSERT INTO fnb.menu_items (id, tenant_id, venue_id, category_id, name, description, price, availability, stock_count) VALUES
  ('f3f3f3f3-0000-0000-0000-000000000001', :'tenant', 'f1f1f1f1-0000-0000-0000-000000000001',
   'f2f2f2f2-0000-0000-0000-000000000001', 'اسپرسو', 'تک‌شات', 65000, 'available', NULL),
  ('f3f3f3f3-0000-0000-0000-000000000002', :'tenant', 'f1f1f1f1-0000-0000-0000-000000000001',
   'f2f2f2f2-0000-0000-0000-000000000002', 'کباب کوبیده', 'دو سیخ با برنج', 420000, 'available', 25)
ON CONFLICT (id) DO NOTHING;

INSERT INTO fnb.delivery_zones (id, tenant_id, name, zone_type, amenity_id, surcharge) VALUES
  ('f4f4f4f4-0000-0000-0000-000000000001', :'tenant', 'تحویل در واحد', 'in_unit', NULL, 0),
  ('f4f4f4f4-0000-0000-0000-000000000002', :'tenant', 'سالن ورزشی', 'amenity_zone',
   'dddddddd-0000-0000-0000-000000000001', 30000)
ON CONFLICT (id) DO NOTHING;

-- --- یک لاگ نمونه در audit --------------------------------------------------
INSERT INTO audit.event_logs (tenant_id, session_id, user_id, actor_role, source, level, action,
                              http_method, http_path, status_code, duration_ms)
SELECT :'tenant', gen_random_uuid(), :'admin', 'admin', 'identity-svc', 'info', 'auth.login',
       'POST', '/auth/login', 200, 41
WHERE NOT EXISTS (SELECT 1 FROM audit.event_logs WHERE action = 'auth.login' AND tenant_id = :'tenant');
