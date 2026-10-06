-- ============================================================================
-- 002 — نگهداری خودکار پارتیشن‌های ماهانه‌ی audit.event_logs
-- ============================================================================
-- مشکل: پارتیشن‌ها فقط «ماه جاری + ۳ ماه بعد» در لحظه‌ی مایگریشن ساخته می‌شدند و کرونِ
-- scripts/maintain-audit-partitions.sh در هیچ‌جای دیپلوی زمان‌بندی نشده بود. بعد از آن بازه،
-- INSERT با «no partition of relation event_logs found» رد می‌شد و لاگ‌ها بی‌صدا از دست می‌رفتند
-- (پایلوت با مایگریشن سپتامبر ۲۰۲۶ از ژانویه ۲۰۲۷ لاگ نمی‌نوشت).
--
-- راه‌حل: تابع با SECURITY DEFINER تا نقش app_user (که مالک جدول نیست) بتواند آن را صدا بزند،
-- و audit-service هنگام بالا آمدن و هر چند ساعت آن را اجرا می‌کند (PartitionMaintenanceService).
-- ============================================================================

CREATE OR REPLACE FUNCTION audit.ensure_month_partition(p_month date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = audit, pg_catalog AS $part$
DECLARE
  start_at date := date_trunc('month', p_month)::date;
  end_at   date := (date_trunc('month', p_month) + interval '1 month')::date;
  part_name text := 'event_logs_' || to_char(start_at, 'YYYY_MM');
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'audit' AND c.relname = part_name
  ) THEN
    -- DDL پویا (نام پارتیشن متغیر است) با format: %I نام شناسه را امن quote می‌کند و %L مقدارها را؛ پس تزریق SQL ممکن نیست.
    -- پارتیشن بازه‌ی [ابتدای ماه، ابتدای ماه بعد) را می‌گیرد؛ search_path تابع (بالا) ثابت شده تا SECURITY DEFINER قابل سوءاستفاده نباشد.
    EXECUTE format(
      'CREATE TABLE audit.%I PARTITION OF audit.event_logs FOR VALUES FROM (%L) TO (%L)',
      part_name, start_at, end_at);
  END IF;
END
$part$;

-- ماه جاری تا p_months_ahead ماه بعد
CREATE OR REPLACE FUNCTION audit.ensure_upcoming_partitions(p_months_ahead int DEFAULT 6)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = audit, pg_catalog AS $up$
DECLARE i int;
BEGIN
  FOR i IN 0..GREATEST(p_months_ahead, 0) LOOP
    PERFORM audit.ensure_month_partition((CURRENT_DATE + (i || ' month')::interval)::date);
  END LOOP;
END
$up$;

REVOKE ALL ON FUNCTION audit.ensure_month_partition(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION audit.ensure_upcoming_partitions(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION audit.ensure_month_partition(date) TO app_user, platform_admin;
GRANT EXECUTE ON FUNCTION audit.ensure_upcoming_partitions(int) TO app_user, platform_admin;

SELECT audit.ensure_upcoming_partitions(6);
