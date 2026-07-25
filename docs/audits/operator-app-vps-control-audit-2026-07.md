# Operator App — VPS / Production Control Audit (2026-07)

| Field | Value |
|-------|-------|
| **Audit ID** | `operator-app-vps-control-audit-2026-07` |
| **Prompt** | **41** — VPS control audit preparation |
| **Status** | **PREPARED** — runbook ready; **VPS not executed** in this prompt |
| **Target host** | `srv1374778.hstgr.cloud` (Hostinger VPS) |
| **Public URL** | `https://app.synqdrive.eu` |
| **Expected deploy layout** | `/opt/synqdrive/current` → `/opt/synqdrive/releases/<timestamp>_v4994` |
| **Deploy script** | `backend/scripts/ops/vps-deploy-release.sh` (via `.cursor/scripts/cloud-agent-deploy.sh`) |
| **Health URL** | `https://app.synqdrive.eu/api/v1/health` |
| **Repo reference audits** | `vehicle-detail-page-vps-baseline-2026-07.md`, `ai-agent-vps-control-audit-2026-07.md` |
| **Operator regression baseline** | `operator-app-production-readiness-2026-07.md` (Prompt 40) |
| **Prepared date** | 2026-07-25 UTC |

---

## Executive summary

This document is a **read-only VPS control audit runbook** for Operator App production go-live. It defines **24 control areas**, safe commands aligned with the SynqDrive VPS layout, and acceptance criteria — **without executing changes on production**.

### Hard constraints (mandatory)

| Rule | Rationale |
|------|-----------|
| **No destructive operations** | No `pm2 delete`, `docker rm`, `DROP`, `migrate reset`, file edits in `/opt/synqdrive`, or deploy during audit |
| **No secrets in output** | Never `cat` full `.env`; list key **names** only; mask values |
| **No PII in output** | No customer names, emails, plates, signatures, document filenames with tenant data |
| **No full table dumps** | Use `COUNT(*)`, `EXISTS`, bounded aggregates only |
| **No production mutations** | No handover pickup/return, task completion, uploads, or booking create/update in prod |
| **Test tenant only** | Authenticated smoke tests only with an **explicitly designated non-production test org** — if none exists, limit to **unauthenticated** HTTP status / readiness checks |

### VPS execution status (Prompt 41)

| Item | Status |
|------|--------|
| SSH key materialized in Cloud Agent | Appears configured (`CLOUD_AGENT_VPS_HOST=srv1374778.hstgr.cloud`) |
| Live VPS audit executed | **No** — deferred to authorized operator run using this runbook |
| Filled result columns below | **Pending execution** — use §25 execution log template |

---

## 0. Safe audit helpers (run on VPS as `root` or deploy user)

Load once per SSH session. These helpers enforce masking and read-only defaults.

```bash
# --- SynqDrive VPS audit helpers (read-only) ---
export SYNQ_CURRENT="${SYNQ_CURRENT:-/opt/synqdrive/current}"
export SYNQ_SHARED="${SYNQ_SHARED:-/opt/synqdrive/shared}"
export SYNQ_PUBLIC="${SYNQ_PUBLIC:-https://app.synqdrive.eu}"
export SYNQ_LOCAL_API="${SYNQ_LOCAL_API:-http://127.0.0.1:3001/api/v1}"

mask_env_file() {
  # Lists env KEY names only; never prints values
  local f="$1"
  [[ -f "$f" ]] || { echo "MISSING: $f"; return 1; }
  grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "$f" | cut -d= -f1 | sort -u
}

env_key_present() {
  local f="$1" key="$2"
  grep -q "^${key}=" "$f" 2>/dev/null && echo "SET" || echo "UNSET"
}

http_code() {
  curl -sS -o /dev/null -w '%{http_code}' "$1"
}

http_headers_sample() {
  # Security/TLS headers only — no body
  curl -sSI "$1" | grep -iE '^(HTTP/|strict-transport|content-security|x-frame|x-content-type|referrer-policy|access-control|x-ratelimit)' || true
}

redis_safe() {
  # Non-destructive Redis probes
  redis-cli -n "${REDIS_DB:-0}" "$@"
}

bullmq_counts() {
  local q="$1"
  redis_safe LLEN "bull:${q}:wait" 2>/dev/null || echo "n/a"
  redis_safe LLEN "bull:${q}:active" 2>/dev/null || echo "n/a"
  redis_safe ZCARD "bull:${q}:failed" 2>/dev/null || echo "n/a"
}

pg_count() {
  # Bounded SQL — COUNT only, no row payloads
  sudo -u postgres psql -d synqdrive -tAc "$1"
}

pm2_log_scan_secrets() {
  pm2 logs synqdrive --lines 200 --nostream 2>/dev/null \
    | grep -iE 'bearer |api[_-]?key|password=|private[_-]?key|secret' \
    | wc -l
}
```

**Forbidden commands during audit**

```text
cat /opt/synqdrive/shared/backend.env
printenv | grep -i key
psql ... SELECT * FROM ...
pg_dump (unless pre-approved maintenance — not part of control audit)
pm2 restart / stop / delete
prisma migrate dev / reset
npm run prisma:migrate:deploy (mutating)
Any POST .../handover/pickup|return
Any document upload multipart POST with real files
```

---

## 1. Audit checklist (24 areas)

| # | Area | Primary evidence | Pass criteria (summary) | Executed | Result |
|---|------|------------------|-------------------------|----------|--------|
| 1 | Deployment version | Release dir name, `package.json` | Clean release symlink; version matches expected deploy | ☐ | |
| 2 | Commit SHA | `git rev-parse` in release | Matches merged `main` commit for Operator release | ☐ | |
| 3 | Container / services | `pm2`, `docker ps` | `synqdrive` online; observability containers healthy | ☐ | |
| 4 | Reverse proxy | Nginx site config | Upstream `127.0.0.1:3001`; SSE/upload timeouts sane | ☐ | |
| 5 | TLS | `openssl s_client`, curl headers | Valid cert; HTTP→HTTPS; HSTS at edge | ☐ | |
| 6 | Environment | Key **presence** in `backend.env` / `frontend.env` | Operator deps configured (Clerk, Redis, storage, OCR) — values masked | ☐ | |
| 7 | Database | `prisma migrate status`, bounded counts | Schema up to date; handover/task tables exist | ☐ | |
| 8 | Redis | `PING`, keyspace summary | Reachable; BullMQ namespaces present | ☐ | |
| 9 | BullMQ / queues | Queue depth counts | No runaway backlog on `document.extraction`, notifications | ☐ | |
| 10 | Storage | Symlinks + disk usage | `shared/storage/documents`, uploads symlinked; disk < 85% | ☐ | |
| 11 | Upload worker | Readiness `documentExtraction` | Workers enabled; storage provider reachable | ☐ | |
| 12 | OCR worker | Mistral OCR flags in readiness | `mistralOcrConfigured: true` when uploads expected | ☐ | |
| 13 | Notifications / outbox | Queue counts + table counts | `notification.*` queues bounded; outbox not growing unbounded | ☐ | |
| 14 | Health checks | `/health`, `/health/readiness` | HTTP 200; postgres/redis/workers ok | ☐ | |
| 15 | Logs | PM2 log tail scan | No secret leaks; no sustained handover error storm | ☐ | |
| 16 | Metrics | Local Prometheus / `/api/v1/metrics` | Scrape auth enforced; Operator-relevant metrics optional | ☐ | |
| 17 | Backups | `/opt/synqdrive/shared/backups` | Recent `db-pre-deploy-*.sql.gz` exists | ☐ | |
| 18 | Retention jobs | Scheduler logs / config keys | `DATA_RETENTION_ENABLED` + document/IAM retention schedulers active | ☐ | |
| 19 | Security headers | curl `-I` public routes | CSP, X-Frame-Options, nosniff; `/metrics` not public | ☐ | |
| 20 | Rate limits | Response headers + config | Global `X-RateLimit-*`; `operator_app` upload multiplier configured | ☐ | |
| 21 | Operator API smoke | HTTP status matrix | SPA `/operator` serves; API routes reject unauth; **no write smoke** | ☐ | |
| 22 | Tenant isolation | Cross-org probe (test JWT only) | Foreign `orgId` → 403/404; no data leakage in status codes | ☐ | |
| 23 | Audit events | IAM / handover audit tables (counts) | Outbox processors running; recent audit volume plausible | ☐ | |
| 24 | Rollback readiness | Prior release retained | Previous release dir exists; backup + documented rollback path | ☐ | |

---

## 2. Control area details and safe commands

### 1 — Deployment version

**Goal:** Confirm which release is live and that deploy layout matches `vps-deploy-release.sh`.

```bash
readlink -f /opt/synqdrive/current
basename "$(readlink -f /opt/synqdrive/current)"
ls -1dt /opt/synqdrive/releases/* 2>/dev/null | head -5
node -p "require('${SYNQ_CURRENT}/backend/package.json').version"
test -f "${SYNQ_CURRENT}/backend/dist/src/main.js" && echo "dist:ok" || echo "dist:MISSING"
test -f "${SYNQ_CURRENT}/backend/public/index.html" && echo "spa:ok" || echo "spa:MISSING"
```

**Expected:** `current` → `releases/<YYYYMMDDHHMMSS>_v4994`; backend `0.1.0`; `dist/src/main.js` present; SPA in `backend/public/`.

---

### 2 — Commit SHA

**Goal:** Verify production commit without exposing repo credentials.

```bash
git -C "${SYNQ_CURRENT}" rev-parse HEAD
git -C "${SYNQ_CURRENT}" rev-parse --short HEAD
git -C "${SYNQ_CURRENT}" log -1 --format='%h %s' 2>/dev/null || true
git -C "${SYNQ_CURRENT}" status -sb 2>/dev/null | head -5
```

**Pass:** SHA matches intended `main` release containing Operator Prompts 38–40.  
**Fail:** Dirty working tree in release dir; branch not `main`; SHA behind expected Operator merge.

---

### 3 — Container / services

```bash
pm2 describe synqdrive | grep -E 'status|restarts|uptime|exec cwd|script path'
pm2 jlist 2>/dev/null | jq -r '.[] | select(.name=="synqdrive") | {status, pm_uptime, restart_time, monit}' 2>/dev/null || pm2 list
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null | grep -E 'clickhouse|prometheus|grafana|NAMES' || true
ss -tlnp | grep -E ':3001|:5432|:6379|:8123|:9090|:3000' || true
```

**Pass:** PM2 `synqdrive` status `online`; restarts not in a tight loop; ClickHouse/Prometheus/Grafana up if monitoring enabled.

---

### 4 — Reverse proxy

```bash
nginx -v 2>&1
nginx -t 2>&1
grep -nE 'server_name|proxy_pass|client_max_body_size|proxy_read_timeout|Upgrade|location' \
  /etc/nginx/sites-enabled/synqdrive 2>/dev/null | head -40
```

**Expected (from prior baselines):** `proxy_pass http://127.0.0.1:3001`; `client_max_body_size 20m`; WebSocket `Upgrade` headers; Operator uploads need ≥10m body limit.

**Hardening reference:** `backend/scripts/ops/nginx-synqdrive-hardening.snippet` (`location = /metrics { return 404; }`, HSTS).

---

### 5 — TLS

```bash
http_headers_sample "${SYNQ_PUBLIC}/"
http_code "http://app.synqdrive.eu/"   # expect 301
echo | openssl s_client -connect app.synqdrive.eu:443 -servername app.synqdrive.eu 2>/dev/null \
  | openssl x509 -noout -dates -subject 2>/dev/null
```

**Pass:** HTTPS 200; valid cert dates; HSTS present at edge (per hardening snippet); HTTP redirects to HTTPS.

---

### 6 — Environment (presence only)

```bash
ls -la "${SYNQ_SHARED}/backend.env" "${SYNQ_SHARED}/frontend.env"
mask_env_file "${SYNQ_SHARED}/backend.env" | wc -l
mask_env_file "${SYNQ_SHARED}/frontend.env" | wc -l

# Operator-critical keys — SET/UNSET only
for k in DATABASE_URL REDIS_HOST REDIS_PORT REDIS_PASSWORD CLERK_SECRET_KEY CLERK_PUBLISHABLE_KEY \
  NODE_ENV LOG_LEVEL DATA_RETENTION_ENABLED DOCUMENT_EXTRACTION_ENABLED MISTRAL_API_KEY \
  DOCUMENT_AI_ENABLED STORAGE_PROVIDER; do
  printf '%s=%s\n' "$k" "$(env_key_present "${SYNQ_SHARED}/backend.env" "$k")"
done

for k in VITE_API_BASE_URL VITE_CLERK_PUBLISHABLE_KEY; do
  printf '%s=%s\n' "$k" "$(env_key_present "${SYNQ_SHARED}/frontend.env" "$k")"
done
```

**Operator note:** Frontend route `/operator/*` uses same Clerk session as Rental — no separate Operator env block required. Upload source `operator_app` is a request field, not an env var (`document-upload-rate-limit.service.ts`).

---

### 7 — Database

```bash
cd "${SYNQ_CURRENT}/backend"
# Uses linked .env — do NOT echo DATABASE_URL
npx prisma migrate status 2>&1 | tail -20

# Bounded schema probes (no PII)
pg_count "SELECT COUNT(*) FROM _prisma_migrations;"
pg_count "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='booking_handover_protocols');"
pg_count "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='org_tasks');"
pg_count "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='iam_audit_outbox');"
pg_count "SELECT pg_size_pretty(pg_database_size('synqdrive'));"
pg_count "SELECT count(*) FROM pg_stat_activity WHERE datname='synqdrive';"
```

**Pass:** `Database schema is up to date!`; handover + task + IAM outbox tables exist; connection count reasonable vs `max_connections`.

---

### 8 — Redis

```bash
redis_safe PING
redis_safe INFO memory | grep -E 'used_memory_human|maxmemory|maxmemory_policy'
redis_safe DBSIZE
redis_safe --scan --pattern 'bull:*' 2>/dev/null | awk -F: '{print $1":"$2}' | sort -u | head -30
```

**Pass:** `PONG`; memory within host limits; `bull:*` namespaces present.

---

### 9 — BullMQ / queues

Operator-relevant and platform queues (counts only):

```bash
for q in document.extraction notification.evaluation notification.delivery task.automation \
  booking.document.generation dimo.snapshot.poll battery.v2; do
  echo "== $q =="
  echo -n "wait="; bullmq_counts "$q" | head -1
  echo -n "active="; bullmq_counts "$q" | sed -n '2p'
  echo -n "failed="; bullmq_counts "$q" | tail -1
done
```

**Pass:** `document.extraction` wait/active not sustained high; failed jobs not climbing without bound.

Queue name source: `backend/src/workers/queues/queue-names.ts`.

---

### 10 — Storage

```bash
ls -la "${SYNQ_CURRENT}/backend/uploads" "${SYNQ_CURRENT}/backend/storage/documents" 2>/dev/null
df -h / /opt/synqdrive 2>/dev/null
du -sh /opt/synqdrive/shared/storage/documents /opt/synqdrive/shared/backups /opt/synqdrive/releases 2>/dev/null
```

**Pass:** Documents path symlinked to `/opt/synqdrive/shared/storage/documents`; root disk < 85% (deploy script aborts at 90%).

---

### 11 — Upload worker

```bash
curl -sf "${SYNQ_LOCAL_API}/health/readiness" | jq '.checks.documentExtraction, .checks.workers' 2>/dev/null \
  || curl -sf "${SYNQ_LOCAL_API}/health/readiness"
```

**Expected readiness fields:** `workers.status=ok`, `documentExtraction.status=ok`, optional `waitingJobs` / `activeJobs` counts (no file paths).

---

### 12 — OCR worker

```bash
curl -sf "${SYNQ_LOCAL_API}/health/readiness" | jq '.checks.documentExtraction.details' 2>/dev/null \
  || curl -sf "${SYNQ_LOCAL_API}/health/readiness" | grep -o 'mistral[^,}]*' || true
```

**Pass:** `mistralOcrConfigured: true` and `aiExtractionConfigured: true` when Operator AI upload is in scope.

Implementation: `DocumentExtractionHealthService` + `MistralOcrService`.

---

### 13 — Notifications / outbox

```bash
# Queue depths
for q in notification.evaluation notification.delivery; do
  echo "== $q failed =="; redis_safe ZCARD "bull:${q}:failed"
done

# Table counts only — no row content
pg_count "SELECT COUNT(*) FROM notifications WHERE created_at > NOW() - INTERVAL '24 hours';" 2>/dev/null || echo "notifications: n/a"
pg_count "SELECT COUNT(*) FROM iam_audit_outbox WHERE status='PENDING';" 2>/dev/null || echo "iam_outbox: n/a"
pg_count "SELECT COUNT(*) FROM task_automation_outbox WHERE status='PENDING';" 2>/dev/null || echo "task_outbox: n/a"
```

**Pass:** Pending outbox counts stable or draining; notification queues not in sustained failure growth.

---

### 14 — Health checks

```bash
http_code "${SYNQ_LOCAL_API}/health"
http_code "${SYNQ_PUBLIC}/api/v1/health"
curl -sf "${SYNQ_LOCAL_API}/health" | jq '{status, uptime}' 2>/dev/null
curl -sf "${SYNQ_LOCAL_API}/health/readiness" | jq '{status, checks: (.checks | keys)}' 2>/dev/null
```

**Pass:** Liveness 200; readiness `status=ok` (or `degraded` only if optional ClickHouse — document cause).

---

### 15 — Logs

```bash
pm2 logs synqdrive --lines 100 --nostream 2>/dev/null \
  | grep -iE 'handover|operator|document.extraction|ERROR' | tail -20
echo "secret_pattern_hits=$(pm2_log_scan_secrets)"
journalctl -u nginx --since '24 hours ago' -p err --no-pager 2>/dev/null | tail -10 || true
```

**Pass:** No secret patterns in PM2 tail; handover errors not spiking; redact any vehicle/booking IDs in manual notes.

---

### 16 — Metrics

```bash
http_code "${SYNQ_PUBLIC}/metrics"          # expect 404 after hardening
http_code "${SYNQ_PUBLIC}/api/v1/metrics"   # expect 401 without bearer
curl -sf http://127.0.0.1:9090/-/healthy 2>/dev/null && echo prometheus:ok || echo prometheus:n/a
curl -sf http://127.0.0.1:3000/api/health 2>/dev/null && echo grafana:ok || echo grafana:n/a
```

**Reference dashboards:** `backend/monitoring/grafana/dashboards/synqdrive-ops.json`.

---

### 17 — Backups

```bash
ls -lt "${SYNQ_SHARED}/backups/" 2>/dev/null | head -10
du -sh "${SYNQ_SHARED}/backups/"* 2>/dev/null | tail -5
```

**Pass:** Recent `db-pre-deploy-*.sql.gz` from last deploy (created in `vps-deploy-release.sh` step 1).

---

### 18 — Retention jobs

```bash
for k in DATA_RETENTION_ENABLED RETENTION_AUDIT_LOG_DAYS DOCUMENT_RETENTION_ENABLED \
  LEGAL_DOCUMENT_RETENTION_ENABLED IAM_DATA_RETENTION_ENABLED BATTERY_V2_RETENTION_ENABLED; do
  printf '%s=%s\n' "$k" "$(env_key_present "${SYNQ_SHARED}/backend.env" "$k")"
done

pm2 logs synqdrive --lines 300 --nostream 2>/dev/null \
  | grep -iE 'DataRetention|DocumentRetention|IamDataRetention|retention' | tail -15
```

**Reference:** `backend/scripts/ops/README.md` — `DataRetentionScheduler` nightly 03:30 UTC.

---

### 19 — Security headers

```bash
for path in / /operator /api/v1/health; do
  echo "=== ${SYNQ_PUBLIC}${path} ==="
  http_headers_sample "${SYNQ_PUBLIC}${path}"
done
```

**Pass:** CSP + `X-Frame-Options` + `X-Content-Type-Options` on app routes; `/metrics` not publicly scrapeable.

---

### 20 — Rate limits

```bash
http_headers_sample "${SYNQ_PUBLIC}/api/v1/health" | grep -i ratelimit || true

# Config presence (not values)
for k in DOCUMENT_UPLOAD_RATE_LIMIT_ENABLED DOCUMENT_UPLOAD_RATE_LIMIT_OPERATOR_MULTIPLIER \
  DOCUMENT_UPLOAD_RATE_LIMIT_WINDOW_MS; do
  printf '%s=%s\n' "$k" "$(env_key_present "${SYNQ_SHARED}/backend.env" "$k")"
done
```

**Expected:** Global throttler 200 req/min/IP (`app.module.ts`); response headers `X-RateLimit-Limit-global: 200`; `operator_app` uploads use `uploadRateLimitOperatorMultiplier`.

---

### 21 — Operator API smoke tests (read-only)

**Do not** execute pickup/return handover, task completion, or document upload in production unless using a **dedicated test tenant** approved for field trials.

#### 21a — Unauthenticated (safe everywhere)

```bash
# SPA shell (static)
http_code "${SYNQ_PUBLIC}/operator"
http_code "${SYNQ_PUBLIC}/operator/tasks"

# API must reject without JWT
http_code "${SYNQ_PUBLIC}/api/v1/organizations/00000000-0000-4000-8000-000000000001/bookings/today/pickups"
http_code "${SYNQ_PUBLIC}/api/v1/organizations/00000000-0000-4000-8000-000000000001/bookings/00000000-0000-4000-8000-000000000002/handover"
http_code -X POST "${SYNQ_PUBLIC}/api/v1/organizations/00000000-0000-4000-8000-000000000001/bookings/00000000-0000-4000-8000-000000000002/handover/pickup"
```

**Pass:** SPA routes **200** (or 304); org-scoped API **401/403** without token; handover POST **401/403** (never 200 without auth).

#### 21b — Authenticated (test tenant only)

Prerequisites: short-lived Clerk JWT for **test org**; `ORG_ID` and `BOOKING_ID` from test tenant only.

```bash
# Export TOKEN and ORG_ID locally — never log TOKEN
# curl -sf -H "Authorization: Bearer ${TOKEN}" \
#   "${SYNQ_PUBLIC}/api/v1/organizations/${ORG_ID}/profile" | jq '{id, businessType, role: .membership.role}'

# Read-only list endpoints — use minimal page size; do not export response to audit log if it contains PII
# curl -sf -H "Authorization: Bearer ${TOKEN}" \
#   "${SYNQ_PUBLIC}/api/v1/organizations/${ORG_ID}/bookings/today/pickups?limit=1" -o /dev/null -w '%{http_code}\n'

# curl -sf -H "Authorization: Bearer ${TOKEN}" \
#   "${SYNQ_PUBLIC}/api/v1/organizations/${ORG_ID}/tasks?limit=1" -o /dev/null -w '%{http_code}\n'
```

**Pass:** HTTP 200 for authorized operator role; **403** for `DRIVER` or missing `bookings.read` / `tasks.read` as per org policy.

#### Operator backend routes (reference — no separate Operator API)

| Operation | Method | Path |
|-----------|--------|------|
| Today pickups | GET | `/api/v1/organizations/:orgId/bookings/today/pickups` |
| Today returns | GET | `/api/v1/organizations/:orgId/bookings/today/returns` |
| Handover read | GET | `/api/v1/organizations/:orgId/bookings/:id/handover` |
| Pickup handover | POST | `.../bookings/:id/handover/pickup` — **blocked in prod audit** |
| Return handover | POST | `.../bookings/:id/handover/return` — **blocked in prod audit** |
| Tasks | GET/PATCH | `/api/v1/organizations/:orgId/tasks/...` |
| Document extraction | POST | `/api/v1/document-extractions` — **blocked in prod audit** |

Frontend: `/operator/*` (`App.tsx`); deep links `?vehicleId=`, `?bookingId=`, `/operator/bookings/:id`.

---

### 22 — Tenant isolation

Use synthetic UUIDs without real tenant data for unauth probes. With test JWT, only cross-org **status codes**:

```bash
# Unauthenticated — must not return 200 with data
http_code "${SYNQ_PUBLIC}/api/v1/organizations/00000000-0000-4000-8000-000000000099/bookings"

# With TEST_TOKEN for ORG_A only — foreign org must be 403 or 404 (record code only, not body)
# http_code with Authorization header → org B booking id
```

**Pass:** No cross-tenant 200 on foreign `orgId`; list/detail never leaks other org existence via different error shape (document if inconsistent).

---

### 23 — Audit events

```bash
pg_count "SELECT COUNT(*) FROM audit_logs WHERE created_at > NOW() - INTERVAL '24 hours';" 2>/dev/null || echo "audit_logs: n/a"
pg_count "SELECT status, COUNT(*) FROM iam_audit_outbox GROUP BY status;" 2>/dev/null || echo "iam_outbox: n/a"
pg_count "SELECT COUNT(*) FROM booking_handover_protocols WHERE created_at > NOW() - INTERVAL '7 days';" 2>/dev/null
```

**Pass:** IAM outbox not stuck in `PENDING`; handover audit volume plausible (count only).

**Do not** `SELECT` signature columns or `customer_signature_data_url`.

---

### 24 — Rollback readiness

```bash
ls -1dt /opt/synqdrive/releases/* 2>/dev/null | head -3
test -L /opt/synqdrive/current && echo "current_symlink:ok"
ls -lt "${SYNQ_SHARED}/backups/" 2>/dev/null | head -3
pm2 describe synqdrive | grep -E 'exec cwd|script path'
```

**Rollback procedure (document only — do not run unless incident):**

1. `ln -sfn /opt/synqdrive/releases/<PREVIOUS_RELEASE> /opt/synqdrive/current`
2. `cd /opt/synqdrive/current/backend && pm2 restart synqdrive --update-env`
3. Verify `curl -sf http://127.0.0.1:3001/api/v1/health`
4. DB rollback only with DBA approval — forward migrations preferred

---

## 3. Required access

| Access | Purpose | Who |
|--------|---------|-----|
| SSH `root@srv1374778.hstgr.cloud` (or Tailscale `mein-vps.internal`) | VPS read-only inspection | Ops / release engineer |
| `CLOUD_AGENT_SSH_PRIVATE_KEY` in Cursor Secrets | Cloud Agent deploy/audit automation | CI/CD owner |
| Clerk dashboard (test user) | Optional authenticated smoke | QA — test tenant only |
| Grafana `localhost:3000` via SSH tunnel | Metrics dashboards | Ops |
| PostgreSQL **read-only** role (optional) | Safer than `postgres` superuser for audits | DBA |

**Not required for read-only audit:** Stripe/DIMO write keys, production handover permissions on live bookings.

---

## 4. Risks

| ID | Severity | Risk | Mitigation |
|----|----------|------|------------|
| VPS-OP-01 | **CRITICAL** | Accidental handover/upload in prod during smoke | Use §21a only; block POST handover without test tenant |
| VPS-OP-02 | **HIGH** | Secret leakage via `cat .env` or log paste | Use `mask_env_file`; never commit audit transcripts with tokens |
| VPS-OP-03 | **HIGH** | PII in audit notes from `today/pickups` JSON | Record HTTP status only; `limit=1` + no body in report |
| VPS-OP-04 | **HIGH** | PM2 restart storm (historical ↺2800+) | Check restart count; do not restart during audit |
| VPS-OP-05 | **MEDIUM** | Operator code not on prod commit | Compare SHA vs Operator merge; deploy via `cloud-agent-deploy.sh` |
| VPS-OP-06 | **MEDIUM** | `document.extraction` backlog blocks Operator AI upload | Monitor queue §9–§12 before go-live |
| VPS-OP-07 | **MEDIUM** | Public `/metrics` exposure | Apply `nginx-synqdrive-hardening.snippet` |
| VPS-OP-08 | **LOW** | Missing test tenant blocks auth smoke | Document BLOCKED; rely on CI E2E (`test:operator:e2e`) |
| VPS-OP-09 | **LOW** | Disk full prevents deploy rollback | Monitor `df`; backups in `shared/backups` |

---

## 5. Execution from Cloud Agent (when authorized)

```bash
# Local agent — SSH read-only session (no deploy)
bash .cursor/scripts/cloud-agent-verify-vps.sh
ssh -o BatchMode=yes root@srv1374778.hstgr.cloud 'bash -s' < /path/to/operator-vps-audit-readonly.sh

# Full deploy (NOT part of audit — separate change window)
# git push origin main && bash .cursor/scripts/cloud-agent-deploy.sh
```

Split §2 commands into `operator-vps-audit-readonly.sh` on first live run if desired.

---

## 6. Post-execution verdict template

| Criterion | Result |
|-----------|--------|
| Operator frontend on prod commit | ☐ PASS / ☐ FAIL |
| Handover API reachable (read paths) | ☐ PASS / ☐ FAIL |
| Workers + OCR pipeline healthy | ☐ PASS / ☐ FAIL |
| No prod write smoke executed | ☐ CONFIRMED |
| Tenant isolation spot-check | ☐ PASS / ☐ BLOCKED |
| Rollback path verified | ☐ PASS / ☐ FAIL |

**Overall:** ☐ **GO** / ☐ **CONDITIONAL GO** / ☐ **NO-GO**

---

## 7. References

- Deploy: `backend/scripts/ops/vps-deploy-release.sh`
- Operator architecture: `frontend/src/master/components/ArchitekturView.tsx` (Operator WebApp)
- Operator CI: `npm run test:operator`, `npm run test:operator:e2e`
- Prompt 40 regression: `docs/audits/operator-app-production-readiness-2026-07.md`
- Prior VPS baselines: `docs/audits/vehicle-detail-page-vps-baseline-2026-07.md`, `docs/audits/ai-agent-vps-control-audit-2026-07.md`

---

*Prepared in Prompt 41. No VPS commands executed. No secrets or PII collected.*
