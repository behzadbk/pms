#!/usr/bin/env bash
# خروجی/پشتیبان کامل داده‌ی «یک ساختمان» (tenant) از دیتابیس مشترک.
#
#   scripts/export-tenant.sh <subdomain|tenant-uuid> [خروجی.tar.gz]
#
# محیط:
#   DATABASE_URL   اتصال با نقش اپلیکیشن (پیش‌فرض: app_user محلی). نقش BYPASSRLS لازم نیست و عمداً توصیه نمی‌شود:
#                  چون با app_user اجرا می‌شود، حتی اگر در این اسکریپت اشتباهی رخ دهد RLS فقط ردیف‌های همین
#                  ساختمان را برمی‌گرداند (app.current_tenant_id داخل همان تراکنش ست می‌شود).
#   LOOKUP_URL     اتصال برای پیدا کردن tenant از روی subdomain (identity.tenants بدون RLS است؛ پیش‌فرض = DATABASE_URL)
#
# خروجی: tar.gz شامل
#   schema.sql            ساختار جدول‌ها (pg_dump --schema-only، فقط اسکیماهای برنامه)
#   data/<schema>.<table>.csv   ردیف‌های همین ساختمان (COPY ... CSV HEADER)
#   tenant.csv            ردیف identity.tenants
#   manifest.json         تعداد ردیف هر جدول + زمان + نسخه‌ی فرمت
#
# ستون‌های حساس (هش رمز، توکن دعوت، PIN خروج) در خروجی نیستند. بازیابی: docs/08-TENANCY-DECISION.md بخش «بازیابی».
set -euo pipefail

TARGET="${1:-}"; [[ -n "$TARGET" ]] || { echo "usage: $0 <subdomain|tenant-uuid> [out.tar.gz]" >&2; exit 2; }
DATABASE_URL="${DATABASE_URL:-postgresql://app_user:app_user_change_me@localhost:5432/pms}"
LOOKUP_URL="${LOOKUP_URL:-$DATABASE_URL}"
SCHEMAS=(identity property residency facility finance guard notification audit fnb)
SECRET_COLS="'password_hash','exit_pin_hash','token_hash','token','code_hash'"

psql_q() { psql "$1" -X -qAt -v ON_ERROR_STOP=1 -c "$2"; }

if [[ "$TARGET" =~ ^[0-9a-fA-F-]{36}$ ]]; then
  TID="$(psql_q "$LOOKUP_URL" "SELECT id FROM identity.tenants WHERE id = '$TARGET'")"
else
  [[ "$TARGET" =~ ^[a-z0-9-]+$ ]] || { echo "subdomain نامعتبر" >&2; exit 2; }
  TID="$(psql_q "$LOOKUP_URL" "SELECT id FROM identity.tenants WHERE subdomain = '$TARGET'")"
fi
[[ -n "$TID" ]] || { echo "ساختمان پیدا نشد: $TARGET" >&2; exit 1; }
SUB="$(psql_q "$LOOKUP_URL" "SELECT subdomain FROM identity.tenants WHERE id = '$TID'")"

OUT="${2:-export-${SUB}-$(date +%Y%m%d-%H%M%S).tar.gz}"
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/data"

SCHEMA_RE="$(IFS='|'; echo "${SCHEMAS[*]}")"
# جدول‌های دارای tenant_id (بدون پارتیشن‌ها و جدول‌های موقت/توکن)
TABLES="$(psql_q "$DATABASE_URL" "
  SELECT n.nspname || '.' || cl.relname
    FROM pg_class cl JOIN pg_namespace n ON n.oid = cl.relnamespace
    JOIN pg_attribute a ON a.attrelid = cl.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped
   WHERE cl.relkind IN ('r','p') AND NOT cl.relispartition AND n.nspname ~ '^(${SCHEMA_RE})\$'
     AND NOT (n.nspname = 'identity' AND cl.relname IN ('refresh_tokens','platform_invoices','login_attempts'))
   ORDER BY 1")"

# ساختار (بدون داده)
SCHEMA_ARGS=(); for s in "${SCHEMAS[@]}"; do SCHEMA_ARGS+=(--schema="$s"); done
pg_dump "$LOOKUP_URL" --schema-only --no-owner --no-privileges "${SCHEMA_ARGS[@]}" -f "$WORK/schema.sql" 2>/dev/null \
  || echo "-- pg_dump در دسترس/مجاز نبود؛ ساختار را از migrationها بسازید (db/migrate.sh)" > "$WORK/schema.sql"

MANIFEST_ROWS=""
while IFS= read -r T; do
  [[ -n "$T" ]] || continue
  S="${T%%.*}"; N="${T#*.}"
  COLS="$(psql_q "$DATABASE_URL" "SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
            FROM information_schema.columns WHERE table_schema='$S' AND table_name='$N' AND column_name NOT IN ($SECRET_COLS)")"
  # یک تراکنش: ست‌کردن tenant (RLS) + COPY همان‌جا؛ بدون RLS هم WHERE tenant_id را داریم (دفاع دوم)
  psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 >/dev/null <<SQL
BEGIN;
SELECT set_config('app.current_tenant_id', '$TID', true);
\copy (SELECT $COLS FROM "$S"."$N" WHERE tenant_id = '$TID') TO '$WORK/data/$T.csv' WITH (FORMAT csv, HEADER true)
COMMIT;
SQL
  ROWS=$(( $(wc -l < "$WORK/data/$T.csv") - 1 ))
  MANIFEST_ROWS+="\"$T\": $ROWS, "
done <<< "$TABLES"

psql "$LOOKUP_URL" -X -q -v ON_ERROR_STOP=1 -c "\copy (SELECT * FROM identity.tenants WHERE id = '$TID') TO '$WORK/tenant.csv' WITH (FORMAT csv, HEADER true)"

printf '{ "format": "hamin-tenant-export/1", "tenant_id": "%s", "subdomain": "%s", "exported_at": "%s", "rows": { %s } }\n' \
  "$TID" "$SUB" "$(date -u +%FT%TZ)" "${MANIFEST_ROWS%, }" > "$WORK/manifest.json"

tar -C "$WORK" -czf "$OUT" .
echo "✓ $OUT  ($(du -h "$OUT" | cut -f1)) — ساختمان $SUB ($TID)"
