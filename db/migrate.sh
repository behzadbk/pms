#!/usr/bin/env bash
# ============================================================================
# migrate.sh — تنها نقطه‌ی ساخت و به‌روزرسانی دیتابیس PMS
# ============================================================================
# مایگریشن‌ها را به ترتیب اجرا می‌کند و در platform.schema_migrations ثبت می‌کند،
# پس اجرای دوباره بی‌خطر است (no-op).
#
# استفاده:
#   ./migrate.sh                 اجرای مایگریشن‌های اجرانشده
#   ./migrate.sh --seed          مایگریشن + داده‌ی نمونه‌ی محیط توسعه
#   ./migrate.sh --status        فقط گزارش وضعیت
#   ./migrate.sh --reset         حذف کامل و ساخت دوباره (فقط محیط local!)
#
# متغیرها:
#   DATABASE_URL  (پیش‌فرض: postgres://postgres@localhost:5432/pms)
#   APP_USER_PASSWORD / PLATFORM_ADMIN_PASSWORD  رمز نقش‌های اپلیکیشن
#
# نکته: این اسکریپت باید با نقشی اجرا شود که superuser یا owner دیتابیس است
# (نه app_user) — چون RLS روی جداول FORCE شده است.
# ============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATABASE_URL="${DATABASE_URL:-postgres://postgres@localhost:5432/pms}"
export PGOPTIONS="${PGOPTIONS:--c client_min_messages=warning}"
PSQL=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -X -q)

# ترتیب اجرا — وابستگی‌ها از بالا به پایین
MIGRATIONS=(
  "db/migrations/000_bootstrap.sql"
  "backend/identity-service/prisma/migrations/000_init_identity.sql"
  "backend/identity-service/prisma/migrations/001_enable_rls.sql"
  "backend/identity-service/prisma/migrations/002_platform_admins_and_tiers.sql"
  "backend/identity-service/prisma/migrations/003_accountant_role.sql"
  "backend/property-service/prisma/migrations/001_enable_rls.sql"
  "backend/facility-service/prisma/migrations/001_enable_rls.sql"
  "backend/finance-service/prisma/migrations/001_enable_rls.sql"
  "backend/guard-service/prisma/migrations/001_enable_rls.sql"
  "backend/guard-service/prisma/migrations/002_parcels_photo_url.sql"
  "backend/notification-service/prisma/migrations/001_enable_rls.sql"
  "backend/audit-service/prisma/migrations/001_audit_schema.sql"
  "backend/fnb-service/prisma/migrations/001_fnb_schema.sql"
  "db/migrations/900_grants_and_indexes.sql"
)

SEEDS=(
  "backend/identity-service/prisma/seed-dev.sql"
  "backend/identity-service/prisma/seed-platform-admins.sql"
  "db/seeds/003_demo_operational_data.sql"
)

log() { printf '%s\n' "$*"; }

ensure_tracking() {
  "${PSQL[@]}" -c "CREATE SCHEMA IF NOT EXISTS platform;
    CREATE TABLE IF NOT EXISTS platform.schema_migrations (
      filename text PRIMARY KEY, checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now(), duration_ms integer);" >/dev/null
}

checksum() { sha256sum "$1" | cut -d' ' -f1; }

apply_one() {
  local rel="$1" abs="$ROOT/$1"
  [[ -f "$abs" ]] || { log "✗ فایل پیدا نشد: $rel"; exit 1; }
  local sum; sum="$(checksum "$abs")"
  local recorded
  recorded="$("${PSQL[@]}" -tAc "SELECT checksum FROM platform.schema_migrations WHERE filename = '$rel'")"
  if [[ -n "$recorded" ]]; then
    if [[ "$recorded" != "$sum" ]]; then
      log "⚠  $rel از زمان اجرا تغییر کرده است (checksum متفاوت) — نادیده گرفته شد"
    else
      log "•  $rel (قبلاً اجرا شده)"
    fi
    return
  fi
  local t0 t1
  t0=$(date +%s%3N)
  "${PSQL[@]}" -f "$abs" >/dev/null
  t1=$(date +%s%3N)
  "${PSQL[@]}" -c "INSERT INTO platform.schema_migrations (filename, checksum, duration_ms)
                   VALUES ('$rel', '$sum', $((t1 - t0)))" >/dev/null
  log "✓  $rel  ($((t1 - t0))ms)"
}

set_role_passwords() {
  [[ -n "${APP_USER_PASSWORD:-}" ]] && \
    "${PSQL[@]}" -c "ALTER ROLE app_user PASSWORD '${APP_USER_PASSWORD}'" >/dev/null && \
    log "✓  رمز app_user از متغیر محیطی اعمال شد"
  [[ -n "${PLATFORM_ADMIN_PASSWORD:-}" ]] && \
    "${PSQL[@]}" -c "ALTER ROLE platform_admin PASSWORD '${PLATFORM_ADMIN_PASSWORD}'" >/dev/null && \
    log "✓  رمز platform_admin از متغیر محیطی اعمال شد"
  return 0
}

cmd_status() {
  ensure_tracking
  log "── وضعیت مایگریشن‌ها ──"
  for m in "${MIGRATIONS[@]}"; do
    local applied
    applied="$("${PSQL[@]}" -tAc "SELECT applied_at FROM platform.schema_migrations WHERE filename = '$m'")"
    if [[ -n "$applied" ]]; then log "✓  $m  ($applied)"; else log "⌛ $m  (اجرا نشده)"; fi
  done
}

cmd_migrate() {
  ensure_tracking
  log "── اجرای مایگریشن‌ها روی $DATABASE_URL ──"
  for m in "${MIGRATIONS[@]}"; do apply_one "$m"; done
  set_role_passwords
  log "── دیتابیس آماده است ──"
}

cmd_seed() {
  log "── داده‌ی نمونه (فقط محیط توسعه) ──"
  for s in "${SEEDS[@]}"; do
    "${PSQL[@]}" -f "$ROOT/$s" >/dev/null
    log "✓  $s"
  done
}

case "${1:-}" in
  --status) cmd_status ;;
  --seed)   cmd_migrate; cmd_seed ;;
  --reset)
    log "⚠  حذف کامل اسکیماها…"
    "${PSQL[@]}" -c "DROP SCHEMA IF EXISTS identity, property, facility, finance, guard, notification, audit, fnb, platform CASCADE" >/dev/null
    cmd_migrate; cmd_seed ;;
  "")       cmd_migrate ;;
  *)        log "گزینه نامعتبر: $1"; exit 1 ;;
esac
