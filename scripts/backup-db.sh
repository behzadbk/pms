#!/usr/bin/env bash
# ============================================================================
# backup-db.sh — پشتیبان روزانه‌ی دیتابیس PMS (pg_dump فرمت custom) + اعتبارسنجی
# ============================================================================
# خروجی: $BACKUP_DIR/pms-<UTC timestamp>.dump  (+ .sha256) و roles-<ts>.sql (نقش‌ها)
# پشتیبان‌های پیش از deploy (deploy-vps.sh → backups/*.sql.gz) را دست نمی‌زند و
# فقط فایل‌های همین اسکریپت (پوشه‌ی daily/) را بر اساس KEEP_DAYS پاک می‌کند.
#
# حالت‌های اتصال:
#   DATABASE_URL=postgres://postgres@host:5432/pms ./scripts/backup-db.sh   (pg_dump محلی)
#   PMS_DOCKER=1 ./scripts/backup-db.sh        (docker compose exec postgres — الگوی VPS)
# متغیرها: BACKUP_DIR (پیش‌فرض /var/lib/pms-deploy/backups/daily)، KEEP_DAYS (پیش‌فرض 14)
# ============================================================================
set -euo pipefail
umask 077
cd "$(dirname "${BASH_SOURCE[0]}")/.."

BACKUP_DIR="${BACKUP_DIR:-/var/lib/pms-deploy/backups/daily}"
KEEP_DAYS="${KEEP_DAYS:-14}"
[[ "$KEEP_DAYS" =~ ^[0-9]+$ ]] || { echo "KEEP_DAYS باید عدد باشد" >&2; exit 2; }
mkdir -p "$BACKUP_DIR"

if [[ "${PMS_DOCKER:-0}" == "1" ]]; then
  dump()  { docker compose exec -T postgres pg_dump -U postgres -d pms -Fc --no-owner; }
  roles() { docker compose exec -T postgres pg_dumpall -U postgres --roles-only; }
else
  : "${DATABASE_URL:?DATABASE_URL یا PMS_DOCKER=1 را تنظیم کنید}"
  dump()  { pg_dump "$DATABASE_URL" -Fc --no-owner; }
  roles() { pg_dumpall -d "$DATABASE_URL" --roles-only; }
fi

ts="$(date -u +%Y%m%dT%H%M%SZ)"
out="$BACKUP_DIR/pms-$ts.dump"
tmp="$out.partial"
trap 'rm -f "$tmp" "$BACKUP_DIR/roles-$ts.sql.partial"' EXIT

dump > "$tmp"
[[ -s "$tmp" ]] || { echo "✗ پشتیبان خالی است" >&2; exit 1; }
# اعتبارسنجی: فهرست آرشیو باید قابل خواندن باشد و جدول مهاجرت‌ها در آن باشد
pg_restore --list "$tmp" | grep -q 'schema_migrations' \
  || { echo "✗ آرشیو معتبر نیست (schema_migrations پیدا نشد)" >&2; exit 1; }
mv "$tmp" "$out"
( cd "$BACKUP_DIR" && sha256sum "$(basename "$out")" > "$(basename "$out").sha256" )

# نقش‌ها (app_user/platform_admin) برای ریستور لازم‌اند؛ حاوی hash رمز است → فقط 600
roles > "$BACKUP_DIR/roles-$ts.sql.partial"
mv "$BACKUP_DIR/roles-$ts.sql.partial" "$BACKUP_DIR/roles-$ts.sql"

# retention فقط روی فایل‌های همین اسکریپت
find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'pms-*.dump' -o -name 'pms-*.dump.sha256' -o -name 'roles-*.sql' \) \
  -mtime +"$KEEP_DAYS" -delete

echo "✓ $out ($(du -h "$out" | cut -f1)) — پشتیبان معتبر؛ نگهداری $KEEP_DAYS روز"
echo "  یادآوری: بدون «ریستور آزمایشی» (scripts/restore-test.sh) پشتیبان قابل اتکا نیست؛ یک نسخه را بیرون از VPS هم کپی کنید."
