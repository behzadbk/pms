#!/usr/bin/env bash
# اجرای هر ۸ سرویس روی پورت‌های محلی (بعد از nest build) — برای تست e2e
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export DATABASE_URL="${DATABASE_URL:-postgresql://app_user:testpass@localhost:5432/pms}"
export JWT_SECRET="${JWT_SECRET:-local_e2e_secret_32_chars_minimum_xx}"
export PAYMENT_WEBHOOK_SECRET="${PAYMENT_WEBHOOK_SECRET:-local_webhook_secret}"
export PROPERTY_SVC_GRPC_URL="${PROPERTY_SVC_GRPC_URL:-localhost:50052}"
export REDIS_HOST="${REDIS_HOST:-localhost}" RABBITMQ_URL="${RABBITMQ_URL:-amqp://guest:guest@localhost:5672}"
i=1
for s in identity property facility finance guard notification audit fnb; do
  (cd "$ROOT/backend/$s-service" && PORT=300$i nohup node dist/main > "/tmp/svc-$s.log" 2>&1 &)
  i=$((i+1))
done
sleep 9
for p in 3001 3002 3003 3004 3005 3006 3007 3008; do
  printf '%s %s\n' "$p" "$(curl -s -m3 localhost:$p/health/live >/dev/null && echo up || echo DOWN)"
done
