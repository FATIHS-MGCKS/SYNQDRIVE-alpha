# Vehicle Detail Page — Controlled Production Deployment Report

| Field | Value |
|-------|-------|
| **Report ID** | `vehicle-detail-page-production-deploy-2026-07` |
| **Prompt** | **35 of 36** — Controlled production deployment |
| **Deployment time (UTC)** | 2026-07-24T12:29:36Z (release id) / 2026-07-24T12:34Z (PM2 restart) |
| **Deployed commit** | `4e16a3864c5b0b2eccdcb5708bdfbb0bf1c1bb34` (`4e16a386`) |
| **Branch** | `main` |
| **Release directory** | `/opt/synqdrive/releases/20260724122936_v4994` |
| **Rollback target** | `/opt/synqdrive/releases/20260724084334_data-auth-rc` — commit `5f76e37` |
| **Method** | Official `cloud-agent-deploy.sh` → `vps-deploy-release.sh` |
| **Downtime** | ~1s PM2 restart (no container deletion) |
| **Rollback executed** | **No** — deployment successful |

---

## 1. Prerequisite Gate

| Prerequisite | Status | Evidence |
|--------------|--------|----------|
| P0 findings closed | ✅ | Remediation Prompts 1–30 merged; security negative matrix 62 tests pass |
| P1 closed or accepted | ✅ | See §1.1 |
| CI / unit tests green | ✅ | Backend `test:vehicle-detail:verify` pass; frontend 182 unit tests pass |
| Backend security tests green | ✅ | `test:vehicles:security` 62/62 + `test:vehicle-detail:security` 8/8 |
| Playwright green | ✅ | `vehicle-detail-flow` + `vehicle-detail-a11y` 33/33 desktop |
| VPS baseline blockers | ⚠️ Partial | Clean `main` deploy fixes DEPL-001/002/009; PM2 cumulative restarts accepted P1 |
| Documented commit SHA | ✅ | `4e16a386` |
| No uncommitted production changes | ✅ | Release tree clean except untracked `backend/uploads` (symlink target) |

### 1.1 Formally accepted P1 items

| ID | Item | Acceptance rationale |
|----|------|----------------------|
| VD-RT-009 / VPS-DEPL-003 | PM2 cumulative **2801** restarts | Pre-existing; deploy added +1 controlled restart; monitor 24h |
| VD-RT-002 | GPS 5s continues on Documents tab | Intentional V4.6.44+ badge UX; documented in runtime audit |
| VPS-RPXY-002 | `/metrics` path serves SPA; Prometheus at `/api/v1/metrics` (401 without token) | Pre-existing routing; metrics auth enforced on API path |

---

## 2. Pre-Deployment State (2026-07-24T12:14 UTC)

| Item | Value |
|------|-------|
| Previous release | `20260724084334_data-auth-rc` |
| Previous commit | `5f76e37` (`cursor/data-auth-migration-fix-26b5`) |
| Previous working tree | **Dirty** (modified scripts in release dir) |
| Health baseline | Local + public **200** |
| PM2 restarts (pre) | **2800** |
| Latest DB backup (pre) | `db-pre-deploy-20260724073759.sql.gz` (2026-07-24 07:38 UTC) |
| Prisma migrations | Up to date (no pending on old release) |
| Env keys validated | DATABASE_URL, REDIS_*, DIMO_*, MAPBOX/VITE_MAPBOX_*, CLERK_*, CLICKHOUSE_* present (values not logged) |

---

## 3. Migration Assessment

| Step | Result |
|------|--------|
| Schema diff in release | No new migration files vs production DB |
| `prisma migrate deploy` (deploy script) | **263 migrations found — No pending migrations to apply** |
| Dry run / staging | Production DB already at head; deploy script backup ran first |

**Migrations executed during this deploy:** **None** (not required).

---

## 4. Deployment Steps

| Step | Time (UTC) | Result |
|------|------------|--------|
| 1. Pre-deploy DB backup | ~12:29 | ✅ `db-pre-deploy-20260724122936.sql.gz` created |
| 2. Clone `main` from GitHub | ~12:29 | ✅ Release `20260724122936_v4994` |
| 3. Link shared env (`backend.env`, `frontend.env`) | ~12:29 | ✅ |
| 4. `npm ci` + `prisma generate` (backend) | ~12:30 | ✅ |
| 5. `prisma migrate deploy` | ~12:32 | ✅ No pending |
| 6. `npm run build` (backend) | ~12:33 | ✅ |
| 7. `npm ci` + `npm run build` (frontend → `backend/public`) | ~12:34 | ✅ |
| 8. Symlink `/opt/synqdrive/current` | ~12:34 | ✅ |
| 9. `pm2 restart synqdrive --update-env` | ~12:34 | ✅ Single controlled restart |
| 10. Health check (script) | ~12:34 | ✅ Local health OK |

**Deploy script exit code:** 7 (public health verify retry in agent script — manual verify **200**).

---

## 5. Post-Deployment Verification (2026-07-24T12:35 UTC)

### 5.1 Commit & process

| Check | Result |
|-------|--------|
| Running commit | `4e16a386` on `main` |
| Working tree | Clean (only `?? backend/uploads` untracked — expected shared uploads mount) |
| PM2 status | **online** |
| PM2 uptime | ~19s post-restart |
| PM2 restarts | **2801** (+1 from deploy) |
| Node heap | 232.7 MiB / **84.8%** usage |

### 5.2 Health checks

| Endpoint | Status |
|----------|--------|
| `http://127.0.0.1:3001/api/v1/health` | **200** `{"status":"ok"}` |
| `https://app.synqdrive.eu/api/v1/health` | **200** |
| `https://app.synqdrive.eu/` (SPA) | **200** |
| `backend/public/index.html` | Present (761 B, 2026-07-24 12:34) |

### 5.3 Data layer

| Component | Status |
|-----------|--------|
| PostgreSQL | Active; connections normal |
| Redis | `PONG` |
| Pre-deploy backup | `db-pre-deploy-20260724122936.sql.gz` available |

### 5.4 Reverse proxy

| Check | Result |
|-------|--------|
| Nginx TLS | ✅ HTTPS 200 |
| HTTP→HTTPS | ✅ (unchanged) |
| Security headers | ✅ CSP, X-Frame-Options, etc. |

### 5.5 Observability

| Check | Result |
|-------|--------|
| `/api/v1/metrics` | **401** without bearer (expected — auth required) |
| `/metrics` (root) | Serves SPA (not Prometheus scrape path) |
| Vehicle-detail metrics code | ✅ Deployed in `vehicles/observability/` |

Metrics will populate on `/api/v1/metrics` after authenticated scrape or first instrumented requests.

### 5.6 Smoke tests (non-destructive)

| Test | Method | Result |
|------|--------|--------|
| Unauth telemetry probe | `GET …/telemetry` zero UUID | **401** ✅ |
| Unauth live-gps probe | `GET …/live-gps` zero UUID | **401** ✅ |
| Tenant isolation | No cross-org data in probes | ✅ |
| E2E suite (pre-deploy CI) | Playwright mocked API 33 tests | ✅ Pass on `4e16a386` |
| Status mutation / cleaning | Covered by E2E tests 7–10 | ✅ Pass (Radix dropdown + confirm dialog) |
| Live/last-known display | E2E tests 12–17 | ✅ Pass |
| Tab switch | E2E test 6 (all tabs) | ✅ Pass |
| Mobile smoke | `vehicle-detail-mobile.spec.ts` | ✅ Part of release CI |
| Polling behavior | `vehicle-detail-runtime-audit.spec.ts` RT-1–6 | ✅ Pass pre-deploy |

**Authenticated production UI smoke** (live vehicle, real DIMO) was **not** executed in this agent session to avoid cross-tenant data exposure. Recommend operator verification in staging or with a designated test org.

---

## 6. Rollback Procedure (not executed)

If rollback required:

```bash
# On VPS as root
ln -sfn /opt/synqdrive/releases/20260724084334_data-auth-rc /opt/synqdrive/current
pm2 restart synqdrive --update-env
curl -sf http://127.0.0.1:3001/api/v1/health
```

Database restore only if migration had been applied (not applicable this deploy).

---

## 7. Findings

| ID | Severity | Finding | Action |
|----|----------|---------|--------|
| DEPLOY-001 | INFO | Deploy successful from `main` `4e16a386` | Monitor 24h |
| DEPLOY-002 | INFO | No migrations applied | None |
| DEPLOY-003 | LOW | PM2 cumulative restarts **2801** | Investigate IAM outbox errors; alert on restart spike |
| DEPLOY-004 | INFO | `/metrics` serves SPA; use `/api/v1/metrics` with bearer | Document in ops runbook |
| DEPLOY-005 | INFO | Deploy script health verify exit 7 | Transient; public health confirmed 200 |

---

## 8. Release Contents Summary

Vehicle Detail remediation **Prompts 1–34** consolidated to `main`:

- Polling lifecycle, request control, store race fixes, URL sync, map behavior
- Mobile readiness, a11y tab bar, unit test suite, backend security matrix
- Playwright E2E (31–34), observability metrics, CI workflow, VPS audits

---

## 9. Attestation

| Statement | Value |
|-----------|-------|
| Destructive VPS actions | **None** (no container/volume deletion) |
| Hotfixes on VPS | **None** |
| Secrets logged | **No** |
| **Changes** updated | Yes — V4.9.806 |
| **Architektur** updated | **No** (deploy report only) |

---

*End of report `vehicle-detail-page-production-deploy-2026-07`.*
