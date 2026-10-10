-- ============================================================================
-- fnb-service 004 — صورتحساب سفارش‌های کافه/رستوران روی «شارژ متغیر» واحد
-- ----------------------------------------------------------------------------
-- سفارشِ «تحویل‌شده» مبلغش (total = جمع اقلام + هزینه‌ی تحویل) هنگام صدور شارژ ماه بعد
-- به شارژ واحد اضافه می‌شود (کنار مازاد آفرها)، دقیقاً مثل مازاد مصرف خدمات.
--   billed_charge_id / billed_at : سفارش در کدام شارژ نشسته (فریز؛ دوباره حساب نمی‌شود)
--   bill_exempt                  : سفارش‌های تحویل‌شده‌ی «قبل از» این قابلیت هرگز به‌صورت
--                                  عطف‌به‌ماسبق روی شارژ نمی‌نشینند
-- ارجاع billed_charge_id به finance.monthly_charges منطقی است (بدون FK بین‌سرویسی).
-- idempotent — RLS جدول orders از قبل برقرار است.
-- ============================================================================

-- سوابق قبلی فقط وقتی معاف می‌شوند که این مایگریشن ستون را «تازه» می‌سازد (اجرای دوباره بی‌اثر است)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'fnb' AND table_name = 'orders' AND column_name = 'bill_exempt') THEN
    ALTER TABLE fnb.orders ADD COLUMN billed_charge_id uuid;
    ALTER TABLE fnb.orders ADD COLUMN billed_at timestamptz;
    ALTER TABLE fnb.orders ADD COLUMN bill_exempt boolean NOT NULL DEFAULT false;
    UPDATE fnb.orders SET bill_exempt = true WHERE status = 'delivered';
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS orders_unbilled_idx ON fnb.orders (tenant_id, unit_id)
  WHERE status = 'delivered' AND billed_charge_id IS NULL AND bill_exempt = false;
