# Vehicle Detail Page — VPS Baseline Audit (Infrastructure & Deployment)

| Field | Value |
|-------|-------|
| **Audit ID** | `vehicle-detail-page-vps-baseline-2026-07` |
| **Prompt** | **33 of 36** — VPS baseline audit (read-only) |
| **Audit date** | 2026-07-24 UTC |
| **VPS host** | `srv1374778.hstgr.cloud` (masked) |
| **Public URL** | `https://app.synqdrive.eu` |
| **Auditor** | Cursor Cloud Agent |
| **Method** | SSH read-only inspection — **no processes restarted, no files modified, no migrations executed** |
| **Scope** | Deployment topology, reverse proxy, secrets/permissions, data layer, resources — baseline for Vehicle Detail production readiness |

---

## Executive Summary

This audit establishes a **read-only infrastructure baseline** on the SynqDrive production VPS prior to Vehicle Detail release (Prompts 31–32 observability/E2E are not yet deployed to this release).

**Current production state:** Application is **online and healthy** (`GET /api/v1/health` → HTTP 200 locally and publicly). However, several **operational and security findings** affect release confidence for Vehicle Detail and broader production hardening.

### Release recommendation: **CONDITIONAL NO-GO** (for Vehicle Detail on current VPS tip)

| Criterion | Result |
|-----------|--------|
| Health endpoint reachable | ✅ HTTP 200 |
| Stable process (no restart loop) | ❌ PM2 cumulative **2800 restarts** |
| Deploy from `main` / clean release tree | ❌ Feature branch + dirty working tree |
| Reverse proxy TLS + redirect | ✅ Let's Encrypt valid; HTTP→HTTPS 301 |
| HSTS | ❌ Not present in HTTPS responses |
| `/metrics` exposure | ❌ Publicly reachable without auth |
| DIMO / Mapbox / DB / Redis configured | ✅ Keys present (values masked) |
| Prisma migrations applied | ✅ Up to date (280 migrations) |
| Backups recent | ✅ Pre-deploy backup 2026-07-24 07:38 UTC |
| Vehicle Detail observability (Prompt 32) | ⚠️ Not on deployed commit `5f76e37` |

**No changes were performed on the VPS during this audit.**

---

## 1. Audit Method

### 1.1 Constraints (honored)

- No process restarts (PM2, Docker, systemd, PostgreSQL, Redis, Nginx)
- No file modifications
- No secrets printed (env values masked; only key names listed)
- No `.env` contents displayed in full
- No database migrations executed
- No containers deleted; no firewall changes
- No production data altered

### 1.2 Commands used (representative)

SSH read-only checks: `git status`, `pm2 describe`, `curl` health/metrics/headers, `nginx` config grep, `openssl s_client`, `ss -tlnp`, `prisma migrate status`, `redis-cli`, `df`, `free`, `dmesg`/`journalctl` OOM scan, file permission `ls -la` on env paths.

---

## 2. Deployment Baseline

| Item | Observed value |
|------|----------------|
| **Current symlink** | `/opt/synqdrive/current` → `/opt/synqdrive/releases/20260724084334_data-auth-rc` |
| **Commit SHA** | `5f76e37` |
| **Git branch** | `cursor/data-auth-migration-fix-26b5` (not `main`) |
| **Working tree** | **Dirty** — 3 modified tracked files + 2 untracked paths under release dir |
| **Deploy time (PM2)** | 2026-07-24T08:48:12Z |
| **PM2 process** | `synqdrive` — **online**, PID active |
| **PM2 restarts** | **2800** (cumulative) |
| **PM2 uptime (current instance)** | ~3h at audit time |
| **Backend entry** | `/opt/synqdrive/current/backend/dist/src/main.js` |
| **Frontend static** | Served via `/opt/synqdrive/current/backend/public/` (not `frontend/dist/` in release tree) |
| **Process manager** | PM2 (not systemd for app) |
| **Docker services** | `synqdrive-clickhouse` (healthy), `synqdrive-prometheus`, `synqdrive-grafana` |
| **Listen port (app)** | `*:3001` (Node) |
| **Health (local)** | `http://127.0.0.1:3001/api/v1/health` → **200** |
| **Health (public)** | `https://app.synqdrive.eu/api/v1/health` → **200** |
| **Retained releases** | 10 directories, ~**12 GB** total under `/opt/synqdrive/releases/` |
| **Shared env** | `/opt/synqdrive/shared/backend.env`, `frontend.env` symlinked into release |
| **Prisma migrations** | 280 found; **`Database schema is up to date!`** |

---

## 3. Reverse Proxy Baseline

| Item | Observed value |
|------|----------------|
| **Proxy** | Nginx 1.24.0 (Ubuntu) |
| **Site config** | `/etc/nginx/sites-enabled/synqdrive` |
| **Upstream** | `proxy_pass http://127.0.0.1:3001` |
| **TLS** | Let's Encrypt; **notBefore** 2026-06-22; **notAfter** 2026-09-20 |
| **HTTP→HTTPS** | `return 301 https://app.synqdrive.eu$request_uri` on port 80 |
| **HSTS** | **Not present** in response headers (backend HSTS hidden; Nginx does not add replacement) |
| **CSP** | Present (Nginx `add_header` with Didit frame-src allowlist) |
| **Other security headers** | `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` |
| **WebSocket/SSE** | `Upgrade` + `Connection "upgrade"` proxy headers configured |
| **Body limit** | `client_max_body_size 20m` |
| **Proxy timeouts** | read/send **300s**, connect **60s** |
| **Public ports** | 22, 80, 443 |
| **Internal-only** | PostgreSQL 5432, Redis 6379, ClickHouse 8123/9000, Prometheus 9090, Grafana 3000 (localhost) |

### Endpoint exposure (HTTP status only)

| Path | Public status |
|------|---------------|
| `/api/v1/health` | 200 |
| `/` (SPA) | 200 |
| `/metrics` | **200** (unauthenticated) |
| `/api/v1/metrics` | 401 |
| `/api/docs`, `/api/v1/debug`, `/api/v1/admin` | 404 |

---

## 4. Secrets & File Permissions

| Path | Permissions | Notes |
|------|-------------|-------|
| `/opt/synqdrive/shared/backend.env` | `-rw-------` (600) root | ✅ Appropriate |
| `/opt/synqdrive/shared/frontend.env` | `-rw-------` (600) root | ✅ Appropriate |
| `current/backend/.env` | symlink → shared | ✅ |
| `current/frontend/.env` | symlink `lrwxrwxrwx` (777) | ⚠️ Symlink world-writable (target file still 600) |

### Integration keys — presence only (values **not** shown)

| Integration | Backend env keys (sample) | Frontend env keys |
|-------------|---------------------------|-------------------|
| PostgreSQL | `DATABASE_URL` | — |
| Redis | `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DB` | — |
| DIMO | `DIMO_API_KEY`, `DIMO_CLIENT_ID`, `DIMO_PRIVATE_KEY`, `DIMO_DOMAIN`, `DIMO_WEBHOOK_*`, … | — |
| Mapbox | — | `VITE_MAPBOX_ACCESS_TOKEN`, `VITE_MAPBOX_STYLE_URL` |
| ClickHouse | `CLICKHOUSE_URL`, `CLICKHOUSE_USER`, `CLICKHOUSE_PASSWORD`, … | — |
| Clerk | `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY` | — |

### Log / history hygiene

| Check | Result |
|-------|--------|
| PM2 error log tail (200 lines) — secret patterns | **0 matches** |
| Root `.bash_history` — secret patterns | **0 matches** (or no history) |

---

## 5. Data Layer Baseline

| Component | Status |
|-----------|--------|
| **PostgreSQL** | Active (16.14); DB `synqdrive` ~**618 MB**; **10** active connections; `max_connections=100` |
| **Staging DB** | `synqdrive_staging_brake` ~376 MB (same host) |
| **Redis** | `PONG`; **1248** keys; **12.43 MB** used; `maxmemory=0` (no limit); policy `noeviction` |
| **Redis namespaces** | `bull:*` (~1245 keys), `dimo:*` (~7 keys) |
| **ClickHouse** | `http://127.0.0.1:8123/ping` → `Ok.` |
| **Backups** | `/opt/synqdrive/shared/backups/` — rolling `db-pre-deploy-*.sql.gz`; latest **2026-07-24 07:38 UTC** (~49 MB) |
| **Restore documentation** | No `README` in backup dir; only historical `pre-local-db-restore-*.sql.gz` artifact |
| **Disk** | `/` **15%** used (28G / 193G); inodes **5%** |
| **Log rotation** | Nginx logrotate (14 days); PM2 logrotate module + rotated `synqdrive-out__*.log` files present |

---

## 6. Resources Baseline

| Metric | Value |
|--------|-------|
| **Host uptime** | 7 days, 20h+ |
| **CPU cores** | 4 |
| **Load average** | 1.61, 1.51, 1.35 |
| **RAM** | 15 GiB total; ~2.5 GiB used; **13 GiB available** |
| **Swap** | **None configured** |
| **OOM events** | None found in kernel log scan |
| **Shell `ulimit -n`** | 1024 |
| **Process open files limit** | 1048576 (Node process) |
| **Node open FDs** | ~166 |
| **Node heap** | ~200 MiB size; **~91%** utilization |
| **Docker memory limits** | ClickHouse: **unlimited** (`Memory=0`) |
| **Disk I/O** | `sda` moderate utilization at audit snapshot; no saturation alert |

---

## 7. Vehicle Detail Relevance

Vehicle Detail depends on:

| Dependency | VPS baseline status |
|------------|---------------------|
| `GET …/telemetry` / `GET …/live-gps` backend | ✅ App healthy; DIMO env keys present |
| Mapbox (overview/live map) | ✅ `VITE_MAPBOX_*` present in frontend env |
| WebSocket/long-poll via Nginx | ✅ Upgrade headers configured |
| Prompt 32 Prometheus metrics (`synqdrive_vehicle_detail_*`) | ❌ **Not on deployed commit** (`5f76e37` is data-auth branch) |
| Prompt 31 E2E CI gate on production | N/A — CI runs in GitHub, not on VPS |

---

## 8. Findings Register

> **Legend:** Severity = `CRITICAL` | `HIGH` | `MEDIUM` | `LOW` | `INFO`  
> **Release Blocker** applies to **Vehicle Detail production deploy on current VPS tip** unless noted.

| ID | Severity | Component | Evidence | Risk | Release Blocker | Recommended action | Change made |
|----|----------|-----------|----------|------|-----------------|-------------------|-------------|
| **VPS-DEPL-001** | HIGH | Deployment / Git | `git branch --show-current` → `cursor/data-auth-migration-fix-26b5`; not `main` | Production runs unmerged feature work; drift from release process | **Yes** | Deploy only from merged `main` (or tagged release) via `vps-deploy-release.sh` after CI green | **No** |
| **VPS-DEPL-002** | HIGH | Deployment / Release tree | `git status -sb` shows modified scripts + untracked `backend/uploads` in live release dir | Unreproducible production state; hot-patch risk | **Yes** | Ensure deploy clones clean tree; never edit files in `/opt/synqdrive/releases/*` in place | **No** |
| **VPS-DEPL-003** | HIGH | PM2 / Runtime stability | `pm2 describe synqdrive` → `restarts: 2800`; error log **47k+** lines | Historical crash/restart loops; latent instability for 30s telemetry / 5s GPS polling | **Yes** | Root-cause PM2 restart history; add alert on restart count; verify IAM outbox / cron errors | **No** |
| **VPS-DEPL-004** | MEDIUM | PM2 / Uptime | Current instance uptime ~3h; deploy at 08:48 UTC | Recent deploy may mask recurring failures | No | Monitor 24–48h after next deploy; correlate with error log spikes | **No** |
| **VPS-DEPL-005** | INFO | Health checks | Local + public `/api/v1/health` → HTTP **200** | — | No | Keep post-deploy health check in deploy script | **No** |
| **VPS-DEPL-006** | LOW | Release retention | 10 releases, ~12 GB under `/opt/synqdrive/releases/` | Gradual disk growth | No | Prune releases beyond N=3–5 after successful deploy | **No** |
| **VPS-DEPL-007** | INFO | Frontend packaging | Static assets in `backend/public/` (761 B `index.html`, assets/); `frontend/dist/` absent in release | Expected deploy layout if build copies to `backend/public` | No | Document in deploy runbook; verify `index.html` age matches deploy | **No** |
| **VPS-DEPL-008** | INFO | Migrations | `npx prisma migrate status` → schema up to date (280 migrations) | — | No | Continue pre-deploy backup + migrate in deploy script | **No** |
| **VPS-DEPL-009** | MEDIUM | Vehicle Detail observability | Deployed commit `5f76e37` predates Prompt 32 metrics branch | No production metrics/logs for vehicle-detail SLOs | **Yes** (for VD observability gate) | Merge + deploy observability branch; verify `/metrics` exposes `synqdrive_vehicle_detail_*` | **No** |
| **VPS-RPXY-001** | MEDIUM | Nginx / TLS | `curl -sI https://app.synqdrive.eu/` — no `Strict-Transport-Security` header | Browser downgrade / SSL-stripping risk reduced without HSTS | No | Add `add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;` in Nginx 443 server block | **No** |
| **VPS-RPXY-002** | HIGH | Nginx / Metrics exposure | `curl` `https://app.synqdrive.eu/metrics` → **200** | Internal metrics (incl. future vehicle-detail series) leaked publicly | **Yes** | Restrict `/metrics` to localhost or IP allowlist; or require auth at Nginx | **No** |
| **VPS-RPXY-003** | INFO | TLS certificate | Let's Encrypt valid until **2026-09-20** | — | No | Certbot auto-renewal monitoring | **No** |
| **VPS-RPXY-004** | INFO | HTTP redirect | `http://app.synqdrive.eu/` → **301** → HTTPS | — | No | — | **No** |
| **VPS-RPXY-005** | INFO | Security headers | CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy present | — | No | Review CSP `connect-src` breadth (`http: https:`) periodically | **No** |
| **VPS-RPXY-006** | INFO | WebSocket proxy | Nginx `Upgrade` / `Connection upgrade` on `/` location | — | No | — | **No** |
| **VPS-RPXY-007** | INFO | Proxy limits | `client_max_body_size 20m`; timeouts 300s/60s | — | No | — | **No** |
| **VPS-RPXY-008** | LOW | CORS | OPTIONS to `/api/v1/health` from foreign origin — no ACAO headers | May be intentional (app CORS on API routes only) | No | Confirm `CORS_ORIGINS` matches production SPA origin | **No** |
| **VPS-RPXY-009** | INFO | Admin/debug surface | `/api/docs`, `/api/v1/debug`, `/api/v1/admin` → 404 | Reduced attack surface | No | — | **No** |
| **VPS-SEC-001** | INFO | Secrets / backend.env | Mode **600** on `/opt/synqdrive/shared/backend.env` | — | No | — | **No** |
| **VPS-SEC-002** | LOW | Secrets / symlink perms | `frontend/.env` symlink mode **777** | Misleading permissions; low direct risk if target 600 | No | Recreate symlink with `ln -sfn` (normal permissions) on next deploy | **No** |
| **VPS-SEC-003** | INFO | Integrations | DIMO, Mapbox, DB, Redis, ClickHouse keys **present** (names only) | Required for Vehicle Detail map + telemetry | No | Rotate keys on schedule; never log values | **No** |
| **VPS-SEC-004** | INFO | Log hygiene | No secret patterns in PM2 error log tail | — | No | Keep structured redaction (Prompt 32) after deploy | **No** |
| **VPS-DATA-001** | INFO | PostgreSQL | Active; 10/100 connections; 618 MB | Healthy headroom | No | Monitor connection pool under fleet-map load | **No** |
| **VPS-DATA-002** | MEDIUM | Redis memory | `maxmemory=0`, `noeviction`, 1248 keys | OOM risk if Redis grows unbounded | No | Set `maxmemory` + `allkeys-lru` or monitor memory | **No** |
| **VPS-DATA-003** | INFO | Redis namespaces | `bull:*` (job queues), `dimo:*` (cache/integration) | — | No | — | **No** |
| **VPS-DATA-004** | INFO | Backups | Latest pre-deploy backup **2026-07-24 07:38 UTC** | — | No | Verify backup restore drill quarterly | **No** |
| **VPS-DATA-005** | MEDIUM | DR documentation | No restore runbook in `/opt/synqdrive/shared/backups/` | Slower incident recovery | No | Add `RESTORE.md` with tested procedure (no secrets) | **No** |
| **VPS-DATA-006** | INFO | ClickHouse | Local ping OK; container healthy 7d | — | No | — | **No** |
| **VPS-DATA-007** | INFO | Disk / inodes | 15% disk, 5% inodes | — | No | Release pruning (VPS-DEPL-006) | **No** |
| **VPS-RES-001** | MEDIUM | Memory / swap | **0 B swap** on 15 GiB RAM host | Memory pressure → OOM kill without swap buffer | No | Add modest swap or set container/PM2 memory alerts | **No** |
| **VPS-RES-002** | INFO | CPU load | Load ~1.5 on 4 cores | Acceptable | No | — | **No** |
| **VPS-RES-003** | MEDIUM | Node heap | Heap usage **~91%** (~182 MiB used) | GC pressure; latency spikes on telemetry paths | No | Monitor after deploy; consider `--max-old-space-size` if growth continues | **No** |
| **VPS-RES-004** | INFO | OOM | No kernel OOM events found | — | No | — | **No** |
| **VPS-RES-005** | LOW | Docker limits | ClickHouse/Prometheus/Grafana **no memory cap** | Noisy neighbor on shared host | No | Set Docker `mem_limit` for observability stack | **No** |
| **VPS-RES-006** | MEDIUM | Application errors | PM2 error tail: recurring `IamAuditOutboxRepository.recoverStaleProcessing` Prisma errors | Background job failures; may contribute to restarts | No | Investigate IAM outbox schema/data; fix before next prod deploy | **No** |

---

## 9. Summary Counts

| Severity | Count |
|----------|-------|
| CRITICAL | 0 |
| HIGH | 4 |
| MEDIUM | 8 |
| LOW | 3 |
| INFO | 15 |

| Release blockers (Vehicle Detail on current tip) | Count |
|--------------------------------------------------|-------|
| **Yes** | **4** (VPS-DEPL-001, VPS-DEPL-002, VPS-DEPL-003, VPS-RPXY-002, VPS-DEPL-009) |

---

## 10. Recommended Pre-Deploy Checklist (Vehicle Detail)

1. Merge Vehicle Detail branches (E2E Prompt 31, observability Prompt 32) to `main`.
2. Run GitHub workflow `Vehicle Detail — Production Readiness CI` green on release commit.
3. Deploy via `cloud-agent-deploy.sh` / `vps-deploy-release.sh` from **clean** `main` checkout.
4. Post-deploy verify: health 200, `backend/public/index.html` timestamp, PM2 restarts **not incrementing**.
5. Restrict `/metrics` at Nginx before exposing `synqdrive_vehicle_detail_*` publicly.
6. Add HSTS header at Nginx.
7. Investigate PM2 restart root cause and IAM outbox errors.

---

## 11. Audit Attestation

| Statement | Value |
|-----------|-------|
| Production data modified | **No** |
| Processes restarted | **No** |
| Files changed on VPS | **No** |
| Secrets exposed in this document | **No** (masked / names only) |
| Changes doc updated | Yes — `ChangesView` V4.9.804 |
| Architektur updated | **No** (infra audit only; no architecture change) |

---

*End of audit `vehicle-detail-page-vps-baseline-2026-07`.*
