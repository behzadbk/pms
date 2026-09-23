#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  همین (Hamin) PMS — نصب کامل روی یک سرور خام (Ubuntu 22.04/24.04 یا Debian 12)
#
#  یک دستور:
#     git clone https://github.com/behzadbk/pms.git && cd pms
#     sudo bash install.sh                # نصب production (بدون داده‌ی نمونه)
#     sudo bash install.sh --demo         # + داده‌ی نمونه (برج آفتاب، کاربران تست، behzad/amir با رمز 1234)
#
#  کارهایی که به‌ترتیب انجام می‌دهد:
#     ۱) نصب پیش‌نیازها (curl, git, openssl, ca-certificates)
#     ۲) نصب Docker Engine + Docker Compose (اگر نصب نباشد)
#     ۳) تنظیم میرور رجیستری Docker (اختیاری — REGISTRY_MIRROR)
#     ۴) ساخت فایل .env با رمزهای تصادفی (اگر وجود نداشته باشد)
#     ۵) build ایمیج‌ها (۸ سرویس + فرانت‌اند + مایگریشن)
#     ۶) بالا آوردن PostgreSQL / RabbitMQ / Redis
#     ۷) اجرای مایگریشن‌های دیتابیس (+ داده‌ی نمونه با --demo)
#     ۸) ساخت کاربر سوپرادمین از روی .env
#     ۹) بالا آوردن ۸ سرویس، فرانت‌اند و gateway
#    ۱۰) تست سلامت همه‌ی سرویس‌ها و چاپ آدرس و اطلاعات ورود
#
#  دستورهای دیگر:
#     sudo bash install.sh update        # git pull + build دوباره + مایگریشن + ری‌استارت (داده‌ها حفظ می‌شوند)
#     sudo bash install.sh status        # وضعیت کانتینرها و سلامت سرویس‌ها
#     sudo bash install.sh logs [svc]    # لاگ زنده (مثلاً: logs identity-svc)
#     sudo bash install.sh stop | start  # توقف / شروع دوباره
#
#  متغیرهای اختیاری (قبل از دستور یا داخل .env):
#     PUBLIC_URL=https://app.example.com   آدرس عمومی سامانه (پیش‌فرض: http://<IP سرور>)
#     HTTP_PORT=80                         پورت gateway روی سرور
#     REGISTRY_MIRROR=https://...          میرور Docker Hub (برای سرورهایی که Docker Hub برایشان بسته است)
#     NPM_REGISTRY=https://...             میرور npm برای build ایمیج‌ها
# ─────────────────────────────────────────────────────────────────────────────
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

SERVICES=(identity-svc property-svc facility-svc finance-svc guard-svc notification-svc audit-svc fnb-svc)
DEMO=0
CMD="install"

c_ok=$'\e[32m'; c_warn=$'\e[33m'; c_err=$'\e[31m'; c_b=$'\e[1m'; c_0=$'\e[0m'
step() { echo; echo "${c_b}━━ [$1] $2${c_0}"; }
ok()   { echo "${c_ok}✓${c_0} $*"; }
warn() { echo "${c_warn}⚠${c_0} $*"; }
die()  { echo "${c_err}✗ $*${c_0}" >&2; exit 1; }
trap 'die "خطا در خط $LINENO — خروجی بالا را ببینید. می‌توانید بعد از رفع مشکل دوباره sudo bash install.sh را اجرا کنید (اجرای دوباره امن است)."' ERR

for a in "$@"; do
  case "$a" in
    --demo) DEMO=1 ;;
    install|update|status|logs|stop|start) CMD="$a" ;;
    -h|--help) sed -n '2,33p' "$0"; exit 0 ;;
    *) [[ "$CMD" == "logs" ]] || die "گزینه‌ی نامعتبر: $a (راهنما: bash install.sh --help)" ;;
  esac
done

[[ $EUID -eq 0 ]] || die "این اسکریپت باید با sudo اجرا شود:  sudo bash install.sh $*"

dc() { docker compose --env-file "$ROOT/.env" -f "$ROOT/docker-compose.yml" "$@"; }

# ─────────────────────────────── ۱) پیش‌نیازها ───────────────────────────────
install_prereqs() {
  step 1/10 "پیش‌نیازهای سیستم"
  if command -v apt-get >/dev/null; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -y -qq
    apt-get install -y -qq ca-certificates curl git openssl >/dev/null
    ok "curl, git, openssl, ca-certificates"
  else
    for b in curl git openssl; do command -v "$b" >/dev/null || die "$b نصب نیست و این سیستم apt ندارد — دستی نصب کنید"; done
    ok "پیش‌نیازها از قبل نصب‌اند"
  fi
}

# ─────────────────────────────── ۲) Docker ───────────────────────────────
install_docker() {
  step 2/10 "Docker Engine + Docker Compose"
  if command -v docker >/dev/null && docker compose version >/dev/null 2>&1; then
    ok "از قبل نصب است: $(docker --version | cut -d, -f1) / compose $(docker compose version --short)"
  else
    command -v apt-get >/dev/null || die "نصب خودکار Docker فقط روی Ubuntu/Debian پشتیبانی می‌شود — Docker و Compose را دستی نصب کنید و دوباره اجرا کنید"
    echo "  تلاش ۱: اسکریپت رسمی get.docker.com …"
    if curl -fsSL --max-time 30 https://get.docker.com -o /tmp/get-docker.sh && sh /tmp/get-docker.sh >/tmp/get-docker.log 2>&1; then
      ok "Docker از مخزن رسمی نصب شد"
    else
      warn "مخزن رسمی Docker در دسترس نبود — نصب از مخزن خود توزیع (docker.io)"
      apt-get install -y -qq docker.io >/dev/null
      apt-get install -y -qq docker-compose-v2 >/dev/null 2>&1 \
        || apt-get install -y -qq docker-compose-plugin >/dev/null 2>&1 \
        || die "پلاگین docker compose نصب نشد — روی Ubuntu 22.04 به بالا بسته‌ی docker-compose-v2 موجود است"
      ok "Docker از مخزن توزیع نصب شد"
    fi
  fi
  systemctl enable --now docker >/dev/null 2>&1 || service docker start >/dev/null 2>&1 || true
  docker info >/dev/null 2>&1 || die "سرویس Docker بالا نیامد (systemctl status docker را ببینید)"
}

# ─────────────────────────────── ۳) میرور رجیستری ───────────────────────────────
configure_mirror() {
  step 3/10 "میرور Docker Hub (اختیاری)"
  local mirror="${REGISTRY_MIRROR:-}"
  [[ -z "$mirror" && -f .env ]] && mirror="$(grep -E '^REGISTRY_MIRROR=' .env | cut -d= -f2- || true)"
  if [[ -z "$mirror" ]]; then ok "تنظیم نشده — مستقیم از Docker Hub"; return; fi
  if grep -qs "$mirror" /etc/docker/daemon.json; then ok "از قبل تنظیم است: $mirror"; return; fi
  [[ -f /etc/docker/daemon.json ]] && cp /etc/docker/daemon.json "/etc/docker/daemon.json.bak.$(date +%s)"
  mkdir -p /etc/docker
  printf '{\n  "registry-mirrors": ["%s"]\n}\n' "$mirror" > /etc/docker/daemon.json
  systemctl restart docker
  ok "میرور تنظیم شد: $mirror (نسخه‌ی قبلی daemon.json بکاپ شد)"
}

# ─────────────────────────────── ۴) فایل .env ───────────────────────────────
rand() { openssl rand -hex "${1:-24}"; }

make_env() {
  step 4/10 "فایل تنظیمات .env"
  if [[ -f .env ]]; then
    ok ".env از قبل وجود دارد — رمزهای فعلی حفظ می‌شوند"
    return
  fi
  local ip public
  ip="$(hostname -I 2>/dev/null | awk '{print $1}')"; ip="${ip:-localhost}"
  public="${PUBLIC_URL:-http://$ip}"
  [[ "${HTTP_PORT:-80}" != "80" && -z "${PUBLIC_URL:-}" ]] && public="$public:${HTTP_PORT}"
  umask 077
  cat > .env <<EOF
# ساخته‌شده توسط install.sh در $(date '+%Y-%m-%d %H:%M') — این فایل رمزها را دارد؛ commit نکنید و از آن بکاپ بگیرید.
PUBLIC_URL=$public
HTTP_PORT=${HTTP_PORT:-80}

POSTGRES_PASSWORD=$(rand)
APP_USER_PASSWORD=$(rand)
PLATFORM_ADMIN_PASSWORD=$(rand)
RABBITMQ_USER=pms
RABBITMQ_PASSWORD=$(rand)
JWT_SECRET=$(rand 32)
PAYMENT_WEBHOOK_SECRET=$(rand)

SUPERADMIN_USERNAME=admin
SUPERADMIN_PASSWORD=$(rand 8)

VITE_VAPID_PUBLIC_KEY=
REGISTRY_MIRROR=${REGISTRY_MIRROR:-}
NPM_REGISTRY=${NPM_REGISTRY:-}
EOF
  umask 022
  ok ".env با رمزهای تصادفی ساخته شد (PUBLIC_URL=$public)"
}

# ─────────────────────────────── ۵) build ───────────────────────────────
build_images() {
  step 5/10 "build ایمیج‌ها (بار اول ۵ تا ۱۵ دقیقه طول می‌کشد)"
  dc pull --quiet postgres rabbitmq redis gateway
  dc --profile tools build migrate
  dc build
  ok "همه‌ی ایمیج‌ها آماده‌اند"
}

# ─────────────────────────────── ۶) زیرساخت ───────────────────────────────
start_infra() {
  step 6/10 "PostgreSQL / RabbitMQ / Redis"
  dc up -d --wait postgres rabbitmq redis
  ok "زیرساخت سالم و آماده است"
}

# ─────────────────────────────── ۷) مایگریشن ───────────────────────────────
run_migrations() {
  step 7/10 "مایگریشن دیتابیس"
  if [[ $DEMO -eq 1 ]]; then
    dc --profile tools run --rm migrate --seed
    warn "داده‌ی نمونه اضافه شد — فقط برای تست/دمو؛ روی سرور مشتری واقعی از --demo استفاده نکنید"
  else
    dc --profile tools run --rm migrate
  fi
  ok "دیتابیس به‌روز است"
}

# ─────────────────────────────── ۸) سوپرادمین ───────────────────────────────
create_superadmin() {
  step 8/10 "کاربر سوپرادمین"
  # shellcheck disable=SC1091
  set -a; . ./.env; set +a
  dc exec -T postgres psql -U postgres -d pms -v ON_ERROR_STOP=1 \
     -v u="$SUPERADMIN_USERNAME" -v p="$SUPERADMIN_PASSWORD" >/dev/null <<'SQL'
INSERT INTO identity.platform_admins (username, full_name, password_hash, is_active)
VALUES (:'u', 'مدیر سامانه', crypt(:'p', gen_salt('bf', 10)), true)
ON CONFLICT (username) DO UPDATE
  SET password_hash = EXCLUDED.password_hash, is_active = true;
SQL
  ok "سوپرادمین «$SUPERADMIN_USERNAME» آماده است (رمز از .env)"
}

# ─────────────────────────────── ۹) سرویس‌ها ───────────────────────────────
start_apps() {
  step 9/10 "۸ سرویس + فرانت‌اند + gateway"
  dc up -d --remove-orphans "${SERVICES[@]}" frontend gateway
  echo "  منتظر سالم شدن سرویس‌ها…"
  dc up -d --wait --wait-timeout 180 "${SERVICES[@]}" frontend \
    || warn "بعضی سرویس‌ها هنوز سالم گزارش نشده‌اند — مرحله‌ی بعد جزئیات را نشان می‌دهد"
  ok "کانتینرها بالا هستند"
}

# ─────────────────────────────── ۱۰) تست سلامت ───────────────────────────────
health_check() {
  step 10/10 "تست سلامت از طریق gateway"
  # shellcheck disable=SC1091
  set -a; . ./.env; set +a
  local base="http://127.0.0.1:${HTTP_PORT:-80}" fail=0 code name
  for s in "${SERVICES[@]}"; do
    name="${s%-svc}"
    code="000"
    for _ in $(seq 1 20); do
      code="$(curl -s -o /dev/null -w '%{http_code}' "$base/api/$name/health/live" || true)"
      [[ "$code" == "200" ]] && break; sleep 3
    done
    if [[ "$code" == "200" ]]; then ok "$s"; else warn "$s → HTTP $code   (لاگ: sudo bash install.sh logs $s)"; fail=1; fi
  done
  code="$(curl -s -o /dev/null -w '%{http_code}' "$base/" || true)"
  if [[ "$code" == "200" ]]; then ok "frontend"; else warn "frontend → HTTP $code"; fail=1; fi
  return $fail
}

summary() {
  # shellcheck disable=SC1091
  set -a; . ./.env; set +a
  cat <<EOF

${c_b}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c_0}
${c_ok}سامانه‌ی «همین» نصب شد.${c_0}

  اپلیکیشن:            $PUBLIC_URL
  پنل سوپرادمین:       $PUBLIC_URL/super-admin/login
     نام کاربری:       $SUPERADMIN_USERNAME
     رمز عبور:         $SUPERADMIN_PASSWORD
EOF
  if [[ $DEMO -eq 1 ]]; then cat <<EOF

  داده‌ی نمونه (--demo):
     ورود ساختمان:     مجتمع borj-aftab — admin@borj-aftab.test / Passw0rd!
                       (resident@ / guard@ / staff@borj-aftab.test هم همین رمز)
     سوپرادمین دمو:    behzad / 1234  و  amir / 1234
EOF
  fi
  cat <<EOF

  همه‌ی رمزها در فایل .env هستند — از آن بکاپ بگیرید.
  وضعیت: sudo bash install.sh status    لاگ: sudo bash install.sh logs <service>
  برای HTTPS یک reverse proxy (مثل Caddy/nginx + certbot) جلوی پورت ${HTTP_PORT:-80} بگذارید
  و PUBLIC_URL را در .env به آدرس https تغییر دهید، سپس: sudo bash install.sh update
${c_b}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c_0}
EOF
}

# ─────────────────────────────── اجرا ───────────────────────────────
case "$CMD" in
  install)
    install_prereqs; install_docker; configure_mirror; make_env
    build_images; start_infra; run_migrations; create_superadmin; start_apps
    health_check || warn "نصب انجام شد ولی بعضی تست‌های سلامت رد شدند — موارد بالا را بررسی کنید"
    summary ;;
  update)
    [[ -f .env ]] || die ".env پیدا نشد — اول sudo bash install.sh را اجرا کنید"
    step 0 "git pull"; git pull --ff-only || warn "git pull انجام نشد — با کد فعلی ادامه می‌دهیم"
    configure_mirror; build_images; start_infra; run_migrations; create_superadmin; start_apps
    health_check || true ;;
  status)
    dc ps; health_check || true ;;
  logs)
    shift_args=(); for a in "$@"; do [[ "$a" == "logs" ]] || shift_args+=("$a"); done
    dc logs -f --tail 200 "${shift_args[@]}" ;;
  stop)  dc stop; ok "متوقف شد (داده‌ها حفظ می‌شوند)" ;;
  start) dc up -d; ok "شروع شد" ;;
esac
