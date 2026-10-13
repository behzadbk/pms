-- داده‌ی آزمون e2e اتصال ERP روی مجتمع نمونه‌ی borj-aftab.
-- با نقش app_user و tenant ست‌شده اجرا می‌شود تا trigger و RLS واقعی تست شوند. idempotent (شناسه‌های ثابت).
SELECT set_config('app.current_tenant_id', '11111111-1111-1111-1111-111111111111', false);

-- شارژ با breakdown کامل: پایه + متراژ + نفرات + شارژ متغیر کافه + جریمه
INSERT INTO finance.monthly_charges (id, tenant_id, unit_id, period, base_amount, late_fee_amount, total_amount, due_date, status, breakdown)
VALUES ('e2e00000-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-0000-0000-0000-000000001204',
        '1405-07', 3412000, 150000, 3562000, '2026-10-01', 'overdue',
        '{"base": 1000000, "area": 1800000, "residents": 600000, "fixed_items": [],
          "raw_total": 3400000, "round_to": 1000, "total": 3412000, "inputs": {"area": 120, "residents": 4},
          "overage": {"total": 12000, "items": [{"kind": "fnb", "service": "کافه لابی", "variant": null, "period": "1405-07", "quantity": 1, "unit_label": "سفارش", "amount": 12000}]}}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO finance.payments (id, tenant_id, monthly_charge_id, amount, status, method, reference, paid_at)
VALUES ('e2e00000-0000-4000-8000-000000000002', '11111111-1111-1111-1111-111111111111', 'e2e00000-0000-4000-8000-000000000001',
        1000000, 'success', 'card_to_card', 'TRX-778812', now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO finance.expense_invoices (id, tenant_id, number, vendor, category, description, items, amount, invoice_date, status, paid_on, pay_method, registered_by_name)
VALUES ('e2e00000-0000-4000-8000-000000000003', '11111111-1111-1111-1111-111111111111', 'E2E-EXP-1', 'تأسیسات پارس', 'تعمیرات',
        'تعویض پمپ آب طبقه‌ی منفی یک', '[{"title": "پمپ آب", "qty": 1, "unit_price": 8500000}, {"title": "دستمزد", "qty": 2, "unit_price": 750000}]',
        10000000, '2026-10-05', 'paid', '2026-10-06', 'bank_transfer', 'حسابدار نمونه')
ON CONFLICT (id) DO NOTHING;

INSERT INTO fnb.orders (id, tenant_id, order_number, venue_id, unit_id, ordered_by, delivery_type, status, subtotal, surcharge, total, placed_at, delivered_at)
VALUES ('e2e00000-0000-4000-8000-000000000004', '11111111-1111-1111-1111-111111111111', 'E2E-1001', 'f1f1f1f1-0000-0000-0000-000000000001',
        'bbbbbbbb-0000-0000-0000-000000001204', 'bbbbbbbb-0000-0000-0000-000000001204', 'in_unit', 'delivered', 240000, 20000, 260000, now(), now())
ON CONFLICT (id) DO NOTHING;
INSERT INTO fnb.order_items (id, tenant_id, order_id, item_name_snapshot, unit_price, quantity, line_total)
VALUES ('e2e00000-0000-4000-8000-000000000005', '11111111-1111-1111-1111-111111111111', 'e2e00000-0000-4000-8000-000000000004', 'کاپوچینو', 120000, 2, 240000)
ON CONFLICT (id) DO NOTHING;

INSERT INTO entitlement.services (id, tenant_id, code, title, kind, unit_kind, unit_label, period_type)
VALUES ('e2e00000-0000-4000-8000-000000000006', '11111111-1111-1111-1111-111111111111', 'e2e_cleaning', 'نظافت داخل واحد', 'quota', 'hours', 'ساعت', 'month')
ON CONFLICT (id) DO NOTHING;
INSERT INTO entitlement.tariffs (id, tenant_id, service_id, code, title, unit_price, step)
VALUES ('e2e00000-0000-4000-8000-000000000007', '11111111-1111-1111-1111-111111111111', 'e2e00000-0000-4000-8000-000000000006', 'hourly', 'ساعتی', 400000, 1)
ON CONFLICT (id) DO NOTHING;
INSERT INTO entitlement.usage_events (id, tenant_id, unit_id, service_id, tariff_id, quantity, unit_price, step, period, quota_qty, overage_qty, amount, status, source)
VALUES ('e2e00000-0000-4000-8000-000000000008', '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-0000-0000-0000-000000001204',
        'e2e00000-0000-4000-8000-000000000006', 'e2e00000-0000-4000-8000-000000000007', 3, 400000, 1, '1405-07', 2, 1, 400000, 'active', 'desk')
ON CONFLICT (id) DO NOTHING;
