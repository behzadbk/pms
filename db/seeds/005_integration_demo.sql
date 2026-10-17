-- ============================================================================
-- داده‌ی نمونه‌ی اتصال ERP — فقط محیط توسعه (migrate.sh --seed)
-- ----------------------------------------------------------------------------
-- کلید API تست برای مجتمع نمونه‌ی borj-aftab (فقط برای Swagger/Postman محلی):
--   hmn_test_11111111111111111111111111111111_sandboxkey000000000000000001
-- و یک connector نمونه که تغییرات را به گیرنده‌ی آزمایشی خود سرویس می‌فرستد
-- (POST /sandbox/erp-inbox — در production وجود ندارد).
-- ============================================================================

INSERT INTO integration.api_keys (id, tenant_id, name, key_prefix, key_hash, scopes, created_by_name)
VALUES (
  'a0000000-0000-4000-8000-000000000001',
  '11111111-1111-1111-1111-111111111111',
  'کلید تست سندباکس (ERP نمونه)',
  'hmn_test_1111',
  encode(sha256(convert_to('hmn_test_11111111111111111111111111111111_sandboxkey000000000000000001', 'UTF8')), 'hex'),
  ARRAY['read','sync'],
  'seed'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO integration.connectors (id, tenant_id, name, type, url, secret, entities, status, cursor_seq)
VALUES (
  'a0000000-0000-4000-8000-000000000002',
  '11111111-1111-1111-1111-111111111111',
  'ERP آزمایشی (گیرنده‌ی سندباکس)',
  'webhook',
  'http://localhost:3009/sandbox/erp-inbox',
  'whsec_sandbox_demo_secret',
  ARRAY['*'],
  'active',
  0
) ON CONFLICT (id) DO NOTHING;
