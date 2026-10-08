#!/usr/bin/env bash
# ============================================================================
# restore-test.sh — اثبات قابل‌ریستور بودن پشتیبان: ریستور در دیتابیس موقت + بررسی‌های سلامت
# ============================================================================
# استفاده:
#   ADMIN_URL=postgres://postgres@host:5432/postgres ./scripts/restore-test.sh /path/pms-XXXX.dump [roles-XXXX.sql]
# هرگز روی دیتابیس اصلی کار نمی‌کند: دیتابیس موقت pms_restore_test می‌سازد و در پایان حذف می‌کند.
# ADMIN_URL باید به یک سرور *آزمایشی* (یا سرور اصلی با دیتابیس جدا) با دسترسی CREATEDB/CREATEROLE اشاره کند.
# ============================================================================
set -euo pipefail
DUMP="${1:?مسیر فایل .dump را بدهید}"
ROLES="${2:-}"
: "${ADMIN_URL:?ADMIN_URL (اتصال ادمین به دیتابیس postgres) را تنظیم کنید}"
SCRATCH="pms_restore_test"
[[ -f "$DUMP" ]] || { echo "فایل پیدا نشد: $DUMP" >&2; exit 2; }
[[ ! -f "$DUMP.sha256" ]] || ( cd "$(dirname "$DUMP")" && sha256sum -c "$(basename "$DUMP").sha256" >/dev/null ) \
  || { echo "✗ checksum پشتیبان نادرست است" >&2; exit 1; }

# URL دیتابیس موقت: جایگزینی نام دیتابیس در مسیر URL
SCRATCH_URL="$(printf '%s' "$ADMIN_URL" | sed -E "s#(/)[^/?]*(\?|$)#\1$SCRATCH\2#")"
q() { psql "$ADMIN_URL" -X -q -v ON_ERROR_STOP=1 "$@"; }
s() { psql "$SCRATCH_URL" -X -q -tA -v ON_ERROR_STOP=1 "$@"; }
trap 'q -c "DROP DATABASE IF EXISTS $SCRATCH" >/dev/null 2>&1 || true' EXIT

if [[ -n "$ROLES" ]]; then
  # نقش‌های موجود را نادیده می‌گیریم (CREATE ROLE دوباره خطا می‌دهد)
  psql "$ADMIN_URL" -X -q -f "$ROLES" >/dev/null 2>&1 || true
else
  for r in app_user platform_admin; do
    q -c "DO \$\$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='$r') THEN CREATE ROLE $r LOGIN; END IF; END \$\$" >/dev/null
  done
fi

q -c "DROP DATABASE IF EXISTS $SCRATCH" -c "CREATE DATABASE $SCRATCH"
pg_restore --no-owner -d "$SCRATCH_URL" --exit-on-error "$DUMP"

fail=0
chk() { if [[ "$2" == "ok" ]]; then echo "✓ $1"; else echo "✗ $1 — $2"; fail=1; fi; }

n="$(s -c "SELECT count(*) FROM platform.schema_migrations")"
[[ "$n" -ge 20 ]] && chk "مهاجرت‌های ثبت‌شده: $n" ok || chk "مهاجرت‌های ثبت‌شده" "فقط $n"

bad="$(s -c "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname IN ('identity','property','residency','facility','finance','guard','notification','audit','fnb')
    AND c.relkind IN ('r','p') AND NOT c.relispartition
    AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname='tenant_id' AND NOT a.attisdropped)
    AND NOT (n.nspname='identity' AND c.relname='platform_invoices')
    AND NOT (c.relrowsecurity AND c.relforcerowsecurity)")"
[[ "$bad" == 0 ]] && chk "RLS+FORCE روی همه‌ی جدول‌های tenant‌دار پس از ریستور" ok || chk "RLS پس از ریستور" "$bad جدول بدون FORCE"

byp="$(s -c "SELECT count(*) FROM pg_roles WHERE rolname='app_user' AND (rolbypassrls OR rolsuper)")"
[[ "$byp" == 0 ]] && chk "app_user بدون BYPASSRLS" ok || chk "app_user" "BYPASSRLS/SUPERUSER"

fn="$(s -c "SELECT count(*) FROM pg_proc WHERE proname='current_tenant_id' AND pronamespace='platform'::regnamespace")"
[[ "$fn" == 1 ]] && chk "platform.current_tenant_id() موجود" ok || chk "platform.current_tenant_id()" "یافت نشد"

t="$(s -c "SELECT count(*) FROM identity.tenants")"
echo "ℹ  تعداد tenant در پشتیبان: $t"

[[ $fail == 0 ]] && echo "── ریستور آزمایشی موفق ──" || { echo "── ریستور آزمایشی ناموفق ──"; exit 1; }
