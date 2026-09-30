#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
docker compose exec -T postgres psql -U postgres -d pms -v ON_ERROR_STOP=1 <<'SQL'
SELECT audit.ensure_month_partition((CURRENT_DATE + (i || ' month')::interval)::date)
FROM generate_series(0, 3) AS months(i);
SQL
