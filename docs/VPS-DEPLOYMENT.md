# VPS deployment

Production URL: https://pms.asaantechlab.ir

Server: `185.204.169.195`, project directory: `/opt/pms`.

Verified on 30 September 2026: the public HTTPS login page and frontend assets
return HTTP 200, all eight API readiness endpoints report healthy database
connections, incorrect admin credentials return HTTP 401, and the generated
admin account can sign in and read the authenticated buildings API.

The Docker Compose stack runs PostgreSQL, RabbitMQ, Redis, eight API services,
the frontend, and an nginx gateway. The gateway binds to `127.0.0.1:8080`.
Host Caddy serves ports 80 and 443 and manages the origin TLS certificate and
renewal. The ArvanCloud DNS record uses HTTPS for its origin connection.

Production settings in `/opt/pms/.env`:

```dotenv
PUBLIC_URL=https://pms.asaantechlab.ir
HTTP_PORT=8080
HTTP_BIND_ADDRESS=127.0.0.1
```

Passwords are generated during installation and stored only in the server's
restricted `.env` file. Production installation does not load demo accounts.
The superadmin signs in at `/super-admin/login` using `SUPERADMIN_USERNAME`
and `SUPERADMIN_PASSWORD` from that file.

Docker builds use Node 24 because the locked Prisma dependencies require
Node 22.18 or later. Limit build concurrency on this 4 GB server:

```bash
cd /opt/pms
COMPOSE_PARALLEL_LIMIT=1 bash install.sh update
bash install.sh status
docker compose logs --tail 100 identity-svc
systemctl status caddy
```

Keep the Node version and gateway binding changes when updating the checkout.
The Caddy configuration is `/etc/caddy/Caddyfile`; the repository copy is
`infra/docker/Caddyfile`. Validate it before reloading:

```bash
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy
```

Docker services and Caddy restart automatically after a reboot. Persistent
database and broker data live in Docker volumes. Preserve those volumes and
the `.env` file; do not use `docker compose down -v` on production.

`/etc/cron.d/pms-audit-partitions` runs `scripts/maintain-audit-partitions.sh`
weekly to keep the current and next three audit log partitions available.

## Automatic deployment

The VPS watches the public GitHub repository's `main` branch with a systemd
timer. Each check runs one minute after the previous check/deployment finishes.
No GitHub write access, Actions secrets, or inbound webhook are needed. Other
branches do not deploy to production. If several pushes arrive during a build,
the next check deploys the newest `main` commit.

The host-managed `/usr/local/sbin/pms-deploy` script fetches source into
`/var/lib/pms-deploy/repo.git`, prepares `/opt/pms/releases/<commit>`, rebuilds
only changed applications (all applications when shared build settings change),
backs up PostgreSQL, runs migrations, starts the stack, and checks all eight
database readiness endpoints plus the public HTTPS login page. A commit is
recorded as deployed only after these checks pass. The production `.env` and
Docker volumes are shared across releases. Deployment does not reset the admin
password or add demo data.

If application activation or health checks fail, the previous image IDs are
restored. Database migrations are **not** automatically reversed; backups are
kept under `/var/lib/pms-deploy/backups/`. A failed commit is held until a new
commit arrives or an administrator explicitly retries it.

Temporary patches under `/etc/pms-deploy/bootstrap/` supported releases before
the production fixes were committed. Patches are skipped when their exact
changes are already in GitHub; conflicting changes stop deployment for review.
Remove these patches once the repository contains the production fixes.

Manual installation and updates share the watcher's deployment lock and limit
build concurrency to one, preventing overlapping builds on this 4 GB server.
The watcher successfully deployed upstream commit `ff60ad2` on 30 September
2026 and confirmed that an unchanged commit does not rebuild.

Useful commands on the VPS:

```bash
systemctl list-timers pms-deploy.timer
journalctl -u pms-deploy.service -n 100 --no-pager
cat /var/lib/pms-deploy/deployed-sha
cat /var/lib/pms-deploy/current-release
systemctl start pms-deploy.service
/usr/local/sbin/pms-deploy --retry
systemctl disable --now pms-deploy.timer   # stop future automatic updates
```

Configuration is `/etc/pms-deploy.conf`. The current source release is also
available through `/opt/pms/current` after the first automatic deployment.
To inspect the live stack, use the directory printed by `current-release`,
then run `docker compose -p pms --env-file /opt/pms/.env ps` there. Preserve the
shared `.env`, database volumes, backups, and state directory.

The repository copies of the script, configuration example, and systemd units
are in `scripts/deploy-vps.sh` and `infra/systemd/`. Updating the deployment
engine itself requires reviewing and reinstalling the host copy; ordinary
application pushes cannot silently replace the deployment engine.

Deployment failure tests use real temporary Git repositories with mocked
Docker and HTTP calls: `python3 tests/test_vps_deploy.py` on Linux.
