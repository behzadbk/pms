#!/usr/bin/env bash
# Host-managed entry point: install a reviewed copy in /usr/local/sbin.
set -Eeuo pipefail
umask 077

CONFIG="${PMS_DEPLOY_CONFIG:-/etc/pms-deploy.conf}"
[[ -f "$CONFIG" ]] || { echo "Missing deployment configuration: $CONFIG" >&2; exit 1; }
# This file is owned by the server administrator, never by a GitHub checkout.
source "$CONFIG"
: "${STATE_DIR:?}" "${RELEASES_DIR:?}" "${ENV_FILE:?}" "${REPOSITORY:?}" "${PUBLIC_URL:?}"
BRANCH="${BRANCH:-main}"
BOOTSTRAP_DIR="${BOOTSTRAP_DIR:-/etc/pms-deploy/bootstrap}"
RETRY=0
case "${1:-}" in '' ) ;; --retry ) RETRY=1 ;; * ) echo 'Usage: deploy-vps.sh [--retry]' >&2; exit 2 ;; esac

mkdir -p "$STATE_DIR" "$RELEASES_DIR" "$STATE_DIR/backups"
exec 9>"$STATE_DIR/deploy.lock"
flock -n 9 || { echo 'Another deployment is running.'; exit 0; }
export GIT_TERMINAL_PROMPT=0 COMPOSE_PARALLEL_LIMIT=1
MIRROR="$STATE_DIR/repo.git"
target=''
activated=0
previous=''
rollback_file="$STATE_DIR/rollback-images.json"

compose_at() {
  local directory="$1"; shift
  docker compose -p pms --project-directory "$directory" --env-file "$ENV_FILE" \
    -f "$directory/docker-compose.yml" "$@"
}

failed() {
  local result="${1:-$?}"
  trap - ERR TERM INT
  echo "Deployment failed (exit $result), commit ${target:-unknown}." >&2
  [[ -z "$target" ]] || printf '%s\n' "$target" > "$STATE_DIR/failed-sha"
  if [[ "$activated" == 1 && -n "$previous" ]]; then
    echo 'Restoring the previous application images; database migrations are not reversed.' >&2
    if compose_at "$previous" -f "$rollback_file" up -d --no-build --remove-orphans --wait --wait-timeout 180; then
      echo 'Previous application images restored.' >&2
    else
      echo 'ROLLBACK FAILED: inspect pms-deploy.service and Docker service logs.' >&2
    fi
  fi
  exit "$result"
}
trap failed ERR
trap 'failed 143' TERM
trap 'failed 130' INT

if [[ ! -d "$MIRROR" ]]; then
  git clone --bare --quiet --single-branch --branch "$BRANCH" "$REPOSITORY" "$MIRROR"
fi
git --git-dir="$MIRROR" fetch --quiet origin "+refs/heads/$BRANCH:refs/heads/$BRANCH"
target="$(git --git-dir="$MIRROR" rev-parse "refs/heads/$BRANCH")"
[[ "$target" =~ ^[0-9a-f]{40}$ ]]
if [[ -f "$STATE_DIR/deployed-sha" && "$(cat "$STATE_DIR/deployed-sha")" == "$target" ]]; then
  echo "Already deployed $target."
  exit 0
fi
if [[ "$RETRY" == 0 && -f "$STATE_DIR/failed-sha" && "$(cat "$STATE_DIR/failed-sha")" == "$target" ]]; then
  echo "Commit $target previously failed; publish a fix or run pms-deploy --retry." >&2
  exit 1
fi

previous="$(cat "$STATE_DIR/current-release")"
[[ -f "$previous/docker-compose.yml" && -f "$ENV_FILE" ]]
release="$RELEASES_DIR/$target"
mkdir -p "$release"
git --git-dir="$MIRROR" archive "$target" | tar -x -C "$release"

# Preserve the production fixes already deployed before GitHub write access was
# available. A patch is skipped once its exact change is present upstream.
# Conflicting upstream changes stop deployment instead of being overwritten.
shopt -s nullglob
for patch_file in "$BOOTSTRAP_DIR"/*.patch; do
  if (cd "$release" && GIT_CEILING_DIRECTORIES="$RELEASES_DIR" git apply --check "$patch_file" 2>/dev/null); then
    (cd "$release" && GIT_CEILING_DIRECTORIES="$RELEASES_DIR" git apply "$patch_file")
  elif (cd "$release" && GIT_CEILING_DIRECTORIES="$RELEASES_DIR" git apply --reverse --check "$patch_file" 2>/dev/null); then
    :
  else
    echo "Production bootstrap patch conflicts: $patch_file" >&2
    false
  fi
done
ln -sfn "$ENV_FILE" "$release/.env"
compose_at "$release" config --quiet

# Save image IDs, including the original installation's images, before builds
# update any tags. Inspect output (which includes secrets) stays inside Python.
python3 - "$rollback_file" <<'PY'
import json, subprocess, sys
ids = subprocess.check_output(['docker', 'ps', '--filter', 'label=com.docker.compose.project=pms', '--format', '{{.ID}}'], text=True).split()
services = {}
if ids:
    for container in json.loads(subprocess.check_output(['docker', 'inspect', *ids])):
        name = container['Config']['Labels']['com.docker.compose.service']
        services[name] = {'image': container['Image']}
with open(sys.argv[1], 'w') as f:
    json.dump({'services': services}, f)
PY

echo "Building commit $target."
# Reclaim disposable cache when space is tight; running images and volumes stay.
available_kb="$(df -Pk "$RELEASES_DIR" | awk 'NR==2 {print $4}')"
if (( available_kb < 8 * 1024 * 1024 )); then
  docker builder prune -f --keep-storage 4GB
fi
compose_at "$release" --profile tools build migrate
# Rebuild only changed applications; shared build/config changes rebuild all.
build_all=1
build_services=()
if [[ -f "$STATE_DIR/deployed-sha" ]]; then
  deployed="$(cat "$STATE_DIR/deployed-sha")"
  if git --git-dir="$MIRROR" cat-file -e "$deployed^{commit}" 2>/dev/null; then
    build_all=0
    while IFS= read -r changed; do
      case "$changed" in
        frontend/*) build_services+=(frontend) ;;
        backend/*-service/*)
          domain="${changed#backend/}"; domain="${domain%%/*}"
          build_services+=("${domain%-service}-svc") ;;
        docker-compose.yml|infra/docker/*|install.sh|libs/*) build_all=1 ;;
      esac
    done < <(git --git-dir="$MIRROR" diff --name-only "$deployed" "$target")
  fi
fi
if [[ "$build_all" == 1 ]]; then
  compose_at "$release" build
elif (( ${#build_services[@]} )); then
  mapfile -t build_services < <(printf '%s\n' "${build_services[@]}" | sort -u)
  compose_at "$release" build "${build_services[@]}"
fi
compose_at "$release" up -d --wait postgres rabbitmq redis

backup="$STATE_DIR/backups/$target-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
compose_at "$previous" exec -T postgres pg_dump -U postgres -d pms | gzip > "$backup"
[[ -s "$backup" ]]
gzip -t "$backup"
compose_at "$release" --profile tools run --rm migrate

activated=1
compose_at "$release" up -d --no-build --remove-orphans --wait --wait-timeout 240
for service in identity property facility finance guard notification audit fnb; do
  curl --fail --silent --show-error --retry 5 --retry-all-errors --retry-delay 3 --max-time 20 \
    "http://127.0.0.1:8080/api/$service/health/ready" > /dev/null
done
curl --fail --silent --show-error --retry 5 --retry-all-errors --retry-delay 3 --max-time 20 \
  "$PUBLIC_URL/super-admin/login" > /dev/null

printf '%s\n' "$release" > "$STATE_DIR/current-release.next"
mv "$STATE_DIR/current-release.next" "$STATE_DIR/current-release"
printf '%s\n' "$target" > "$STATE_DIR/deployed-sha.next"
mv "$STATE_DIR/deployed-sha.next" "$STATE_DIR/deployed-sha"
ln -sfn "$release" "$(dirname "$RELEASES_DIR")/current"
rm -f "$STATE_DIR/failed-sha"
activated=0
echo "Successfully deployed $target to $PUBLIC_URL."

# Keep two previous source releases. Database backups are never deleted here.
python3 - "$RELEASES_DIR" "$release" "$previous" <<'PY' || echo 'Warning: old source release cleanup failed.' >&2
from pathlib import Path
import shutil, sys
root = Path(sys.argv[1])
keep = {Path(sys.argv[2]), Path(sys.argv[3])}
releases = sorted((p for p in root.iterdir() if p.is_dir() and len(p.name) == 40 and all(c in '0123456789abcdef' for c in p.name)), key=lambda p: p.stat().st_mtime, reverse=True)
keep.update(releases[:3])
for path in releases:
    if path not in keep:
        shutil.rmtree(path)
PY
