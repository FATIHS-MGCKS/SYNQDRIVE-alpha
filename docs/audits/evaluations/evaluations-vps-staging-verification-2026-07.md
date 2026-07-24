# Auswertungen — VPS / Staging Verification (2026-07)

**Date (UTC):** 2026-07-24T22:15Z  
**Verifier:** Cursor Cloud Agent (SSH + HTTPS, read-only)  
**Target:** Production VPS `srv1374778.hstgr.cloud` / `https://app.synqdrive.eu`  
**Scope:** Auswertungen / Business-Insights pipeline + Prompt 52 observability readiness  
**Constraints honored:** No production data mutations; no secrets printed; no restore executed.

> **Staging note:** No separate staging hostname was found in infra or DNS checks. Verification ran against the **production VPS** that serves `app.synqdrive.eu`. Voice-related staging org IDs exist in data (`org-voice-staging-e2e`) but there is no isolated staging stack.

---

## Executive summary

| Category | Result |
|----------|--------|
| Core platform (health, TLS, Redis, Postgres, nginx) | **Bestanden** |
| Business-insights pipeline (scheduler, runs, queue) | **Bestanden** |
| Prompt 52 observability (`synqdrive_evaluations_*`) | **Nicht deployed** — PR #819 not on VPS |
| Authenticated Auswertungen API/UI smoke tests | **Nicht ausführbar** — no Clerk session in agent |
| IAM audit outbox schema drift | **Fehlgeschlagen** (platform, recurring errors) |
| Battery V2 failed jobs | **Warnung** (23 failed, unrelated to Auswertungen) |
| DB restore drill | **Nicht ausgeführt** (destructive) |

**Blockierend für Prompt-52-Observability-Verifikation:** Observability-Code ist auf `main`/VPS noch nicht deployed (commit `f5a5b4e`, PR branch `24d3faaf` offen).

**Blockierend für IAM (nicht Auswertungen):** `iam_audit_outbox.processing_status` fehlt in DB trotz aktuellem Prisma-Client.

---

## Deployed revision

| Check | Method | Result | Status |
|-------|--------|--------|--------|
| Release path | SSH `readlink /opt/synqdrive/current` | `/opt/synqdrive/releases/20260724175939_v4994` | ✅ Ausgeführt / Bestanden |
| Git branch | SSH `git rev-parse --abbrev-ref HEAD` | `main` | ✅ Ausgeführt / Bestanden |
| Git commit | SSH | `f5a5b4e33006585774cf728814404eebde3578cb` | ✅ Ausgeführt / Bestanden |
| Commit message | SSH | `fix(infra): Nginx HSTS/metrics hardening + CI typecheck drift (V4.9.809)` | ✅ Ausgeführt |
| `origin/main` at verify time | Local `git fetch` | `f5a5b4e3` (matches deployed) | ✅ Statisch |
| Prompt 52 observability (`24d3faaf`) | SSH module check | `evaluations-observability` **NOT** on VPS | ❌ Fehlgeschlagen / **Blockierend** für P52 metrics |

---

## Infrastructure checks

### Actually executed (SSH / HTTPS)

| Check | Result | Status |
|-------|--------|--------|
| Public health `GET /api/v1/health` | HTTP 200, `status: ok`, uptime ~14961s | ✅ Bestanden |
| Local health `127.0.0.1:3001/api/v1/health` | HTTP 200 | ✅ Bestanden |
| PM2 `synqdrive` | online, uptime ~4h, CPU ~2.4%, RSS ~421MB | ✅ Bestanden |
| PM2 lifetime restarts | 2803 (historical); `unstable restarts: 0` on current proc | ⚠️ Warnung (historical churn) |
| Disk `/` | 32G / 193G (17%) | ✅ Bestanden |
| Memory | 15Gi total, ~13Gi available | ✅ Bestanden |
| Load average | 1.01 / 1.05 / 1.07 | ✅ Bestanden |
| Redis | `PONG`, v7.0.15, uptime ~716k s | ✅ Bestanden |
| PostgreSQL service | `active` | ✅ Bestanden |
| nginx | `active`, `nginx -t` OK | ✅ Bestanden |
| TLS cert `app.synqdrive.eu` | Valid Let's Encrypt, expires 2026-09-20 | ✅ Bestanden |
| TLS protocol (external) | TLSv1.3 | ✅ Bestanden |
| HSTS header | `max-age=31536000; includeSubDomains` | ✅ Bestanden |
| CSP / X-Frame-Options | Present on SPA root | ✅ Bestanden |
| SPA root `/` | HTTP 200 | ✅ Bestanden |
| Route `/financial-insights` | HTTP 200 (shell) | ✅ Bestanden |

### Static only (repo / config files, not runtime-probed on VPS)

| Check | Source | Status |
|-------|--------|--------|
| Grafana dashboard `synqdrive-evaluations.json` | Repo PR #819 | 📋 Statisch — not imported on VPS during this run |
| Prometheus alerts group `synqdrive_evaluations` | `backend/monitoring/prometheus/alerts.yml` | 📋 Statisch — VPS Prometheus config not inspected (no Prometheus host access) |
| Runbook `docs/operations/evaluations-observability-runbook.md` | Repo PR #819 | 📋 Statisch — not on deployed commit |

### Not executable (missing access)

| Check | Reason | Status |
|-------|--------|--------|
| Prometheus scrape with bearer token | `METRICS_BEARER_TOKEN` not available to agent | ⛔ Nicht ausführbar |
| Grafana UI validation | No Grafana URL/credentials | ⛔ Nicht ausführbar |
| Authenticated API smoke tests | No Clerk/JWT test user session | ⛔ Nicht ausführbar |
| Cross-tenant positive case | Requires two org-scoped tokens | ⛔ Nicht ausführbar |
| DB restore drill | Destructive — explicitly skipped | ⛔ Nicht ausgeführt |

---

## Environment configuration

| Variable (name only) | Present on VPS `backend.env` | Status |
|----------------------|-------------------------------|--------|
| `DATABASE_URL` | Yes | ✅ Ausgeführt |
| `REDIS_HOST/PORT/PASSWORD/DB` | Yes | ✅ Ausgeführt |
| `METRICS_BEARER_TOKEN` | Yes | ✅ Ausgeführt (value redacted) |
| `CLICKHOUSE_URL` (+ user/db/password) | Yes | ✅ Ausgeführt |
| `NOTIFICATION_EVALUATION_*` | **Not** in grep subset | 📋 Nicht verifiziert (defaults apply) |

---

## Database & Prisma

| Check | Command / query | Result | Status |
|-------|-----------------|--------|--------|
| Prisma migrate status | `npx prisma migrate status` on VPS | **Database schema is up to date!** (263 migrations in tree) | ✅ Bestanden |
| Applied migrations count | `SELECT COUNT(*) FROM _prisma_migrations` | 280 | ✅ Ausgeführt |
| Insights tables exist | `\dt dashboard*` | `dashboard_insights`, `dashboard_insight_runs` | ✅ Bestanden |
| Required indexes | `pg_indexes` | `dashboard_insights_organization_id_is_active_idx`, `dedupe_key`, `run_id`, `type`; run table org + created_at | ✅ Bestanden |
| Query plan (insights read) | `EXPLAIN` active insights by org | **Bitmap Index Scan** on `dashboard_insights_organization_id_is_active_idx` | ✅ Bestanden |
| Insight runs 24h | aggregate | 170 runs, **0 failed**, last finish `2026-07-24 22:02:01 UTC` | ✅ Bestanden |
| Orgs with run < 2h | aggregate | (queried; scheduler active at :02/:32) | ✅ Ausgeführt |
| `tenant_insight_policies` rows | count | 0 (all orgs on defaults) | ✅ Ausgeführt |
| IAM schema drift | `processing_status` column exists? | **false** | ❌ Fehlgeschlagen |

---

## Redis & BullMQ

| Queue | wait | active | failed | Status |
|-------|------|--------|--------|--------|
| `notification.evaluation` | 0 | 0 | 0 | ✅ Bestanden |
| `notification.delivery` | 0 | 0 | 0 | ✅ Bestanden |
| `document.extraction` | 0 | 0 | 0 | ✅ Bestanden |
| `battery.v2` | 0 | — | **23** | ⚠️ Warnung |

Redis keys for `bull:notification.evaluation:*` present (scheduled + completed jobs). Coalesce job IDs use org-scoped patterns (read-only observation).

---

## Scheduler, workers, cron

| Component | Evidence | Status |
|-----------|----------|--------|
| Nest `@Cron` insights scheduler | Logs at 22:02 UTC: `Insights run [scheduled_active]` for 3 orgs, published counts | ✅ Bestanden |
| `notification.evaluation` worker | PM2 single `synqdrive` process; queue draining; structured `notification.evaluation.run_completed` logs | ✅ Bestanden |
| System cron (root) | Empty crontab — schedulers in-process | ✅ Ausgeführt |
| Recurring `[Scheduler] Error: Custom Id cannot contain :` | Every ~30s in PM2 logs | ❌ Fehlgeschlagen (likely BullMQ job id sanitization; see battery v2 correlation in logs) |
| IAM audit outbox scheduler | `processing_status` column missing — errors every 15–30s | ❌ Fehlgeschlagen (IAM, not Auswertungen) |

**Forecast jobs:** No dedicated forecast worker/module on deployed commit. Forecast UI fallback expected (MoM proxy only). **N/A / Bestanden (expected gap).**

---

## Observability (Prompt 52)

| Check | Result | Status |
|-------|--------|--------|
| `synqdrive_evaluations_*` on `/api/v1/metrics` | 0 matches (unauthenticated scrape blocked anyway) | ❌ Nicht deployed |
| Metrics endpoint auth | HTTP 401 without bearer (local + public) | ✅ Bestanden (hardening works) |
| Structured logs `evaluations.*` | Not present in deployed code | ❌ Nicht deployed |
| Existing `notification.evaluation` logs | Present (`run_duration`, `run_completed`) | ✅ Bestanden |

---

## Logs sample (redacted, read-only)

**Positive — insights pipeline:**
```
BusinessInsightsService: Insights run [scheduled_active] for org …: N candidates → M grouped → K published
notification.evaluation.run_completed (structured JSON)
```

**Negative — platform noise (non-blocking for insights data):**
```
IamAuditOutboxSchedulerService: iam audit outbox poll failed
  → column iam_audit_outbox.processing_status does not exist
[Scheduler]: Error: Custom Id cannot contain :
BatteryV2Processor: worker_failed (HANDLER_FAILED) — separate subsystem
```

---

## Backups & restore

| Check | Result | Status |
|-------|--------|--------|
| Pre-deploy DB backups | 21 files under `/opt/synqdrive/shared/backups/` | ✅ Ausgeführt / Bestanden |
| Latest backup | `db-pre-deploy-20260724175939.sql.gz` (matches current release) | ✅ Bestanden |
| Restore test | **Not executed** (would require isolated DB / downtime) | ⛔ Nicht ausgeführt |

---

## Smoke tests

### Executed without authentication (safe, read-only)

| Test | Endpoint | HTTP | Expected | Status |
|------|----------|------|----------|--------|
| Metrics scrape | `GET /api/v1/metrics` | 401 | Reject anonymous | ✅ Bestanden |
| Summary API | `GET …/organizations/test-org/dashboard-insights/summary` | 401 | Auth required | ✅ Bestanden |
| Insights list | `GET …/dashboard-insights` | 401 | Auth required | ✅ Bestanden |
| Data analyse | `GET …/data-analyse` | 404 | Route/auth (no session) | ✅ Bestanden (blocked) |
| Cross-tenant negative | `GET …/organizations/org-does-not-exist-000/…/summary` | 401 | No data leak without auth | ✅ Bestanden |

### Not executable (requires authenticated session)

| Test | Reason | Status |
|------|--------|--------|
| Summary API payload (KPIs, stale flag) | No Clerk JWT | ⛔ Nicht ausführbar |
| Filters / drill-down UI | No browser session | ⛔ Nicht ausführbar |
| Datenqualitätsstatus / Empfehlungen | No org-scoped token | ⛔ Nicht ausführbar |
| Forecast fallback behavior | No logged-in Auswertungen session | ⛔ Nicht ausführbar |
| Role matrix (ORG_ADMIN vs operator) | No test users | ⛔ Nicht ausführbar |
| Cross-tenant positive + negative with real org IDs | No tokens | ⛔ Nicht ausführbar |

### Commands for operator follow-up (copy-paste)

```bash
# 1) After merging PR #819 — deploy then verify metrics (replace token locally, never commit)
curl -sS -H "Authorization: Bearer $METRICS_BEARER_TOKEN" \
  https://app.synqdrive.eu/api/v1/metrics | grep -c synqdrive_evaluations_

# 2) Authenticated summary (replace ORG_ID and CLERK_JWT)
curl -sS -H "Authorization: Bearer $CLERK_JWT" \
  "https://app.synqdrive.eu/api/v1/organizations/$ORG_ID/dashboard-insights/summary" | jq .

# 3) Cross-tenant negative — token for org A must not read org B (expect 403/404)
curl -sS -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $CLERK_JWT_ORG_A" \
  "https://app.synqdrive.eu/api/v1/organizations/$ORG_ID_B/dashboard-insights"

# 4) IAM drift check (read-only)
sudo -u postgres psql -d synqdrive -tAc \
  "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='iam_audit_outbox' AND column_name='processing_status');"
```

---

## Blocking issues

| ID | Issue | Impact | Severity |
|----|-------|--------|----------|
| B1 | **Prompt 52 observability not deployed** (`evaluations-observability` absent on VPS) | Cannot validate `synqdrive_evaluations_*`, dashboard, alerts in prod | **Blockierend** for P52 sign-off |
| B2 | **IAM `processing_status` schema drift** | Audit outbox scheduler fails continuously | Blockierend for IAM; noise in logs |
| B3 | **Authenticated smoke tests not run** | Auswertungen functional E2E unproven in this audit | Blockierend for full UAT sign-off |

## Non-blocking warnings

| ID | Issue | Notes |
|----|-------|-------|
| W1 | PM2 lifetime restarts 2803 | Current process stable 4h+ |
| W2 | `battery.v2` failed jobs = 23 | Separate from Auswertungen |
| W3 | Scheduler `Custom Id cannot contain :` | Investigate BullMQ job ID sanitization (battery v2 adjacent logs) |
| W4 | No dedicated staging environment | Prod VPS used as staging surrogate |

---

## Safe next steps

1. **Merge PR #819** (observability) → `git push origin main` → `bash .cursor/scripts/cloud-agent-deploy.sh`
2. **Post-deploy:** run metrics grep command above; confirm `synqdrive_evaluations_*` counters increment after one scheduler cycle (`:02` or `:32` UTC)
3. **Import Grafana dashboard** `synqdrive-evaluations` and reload Prometheus `alerts.yml` on monitoring host
4. **Fix IAM migration drift:** apply missing `iam_audit_outbox.processing_status` migration on VPS (ops window; backup exists)
5. **Run authenticated smoke matrix** with staging/test org Clerk users (Summary, filters, drill-down, roles, cross-tenant)
6. **Optional:** schedule quarterly restore drill to isolated DB from latest `db-pre-deploy-*.sql.gz`

---

## Verification matrix (legend)

| Symbol | Meaning |
|--------|---------|
| ✅ Ausgeführt / Bestanden | Check run and passed |
| ❌ Ausgeführt / Fehlgeschlagen | Check run and failed |
| ⚠️ | Passed with warnings |
| 📋 Statisch | Repo/config review only |
| ⛔ Nicht ausführbar | Missing credentials or destructive |

---

**Changes / Architektur:** This audit document only; no code architecture change. Recommend Changes entry V4.9.727 when committed.
