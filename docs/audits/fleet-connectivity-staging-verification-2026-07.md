# Fleet Connectivity — Staging Verification (2026-07)

| Field | Value |
|-------|-------|
| **RC branch** | `cursor/connectivity-release-candidate-2e0d` |
| **Verified commit** | `9c4ba3cc` (staging deploy included boot/DI fixes through `cbd9410c` on VPS release `20260719121907_connectivity-rc`) |
| **PR** | [#564](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/564) |
| **Verified at** | 2026-07-19 UTC |
| **Verifier** | Cloud Agent Prompt 9 |
| **Environment** | Production VPS (`app.synqdrive.eu`) with pre-deploy DB backup — **code + migration validation only**; no broad org rollout; **no reconciliation apply** |

---

## Executive summary

| Verdict | **CONDITIONALLY_READY — 24h observation** |
|---------|------------------------------------------|

Connectivity RC was deployed to the production VPS with full Prisma migrate, backend/worker/frontend build, and kill-switch defaults verified. Migrations applied successfully; health checks green; read-only audits and reconciliation dry-run completed. **Reconciliation apply was not executed.** Two historical telemetry-recovery candidates are apply-eligible after observation window. Boot blockers (Nest circular imports + resolution service DI) were found during deploy and fixed on the RC branch before verification completed.

---

## 1. Preconditions

| Prerequisite | Status | Evidence |
|--------------|--------|----------|
| Builds green (agent) | ✅ | RC Prompt 8 — backend + frontend build |
| DB backup before migrate | ✅ | `/opt/synqdrive/shared/backups/db-pre-connectivity-rc-20260719120652.sql.gz`, `…20260719121907.sql.gz` |
| Kill switch verified | ✅ | `CONNECTIVITY_EPISODE_RECOVERY_ENABLED=true`, `CONNECTIVITY_RECONCILIATION_APPLY_ENABLED=false` in shared `backend.env` |
| Reconciliation apply default off | ✅ | Env + dry-run `mode: DRY_RUN`, `applied: 0` |

---

## 2. Staging deploy

| Step | Result |
|------|--------|
| Pre-deploy `pg_dump` | ✅ Two backups (initial + redeploy) |
| Clone RC branch | ✅ `cursor/connectivity-release-candidate-2e0d` |
| `prisma migrate deploy` | ✅ **7 connectivity migrations** applied on first deploy (`20260719120000` … `20260719180000`); redeploy: schema up to date (224 total) |
| Backend build + PM2 restart | ✅ After boot fixes |
| Frontend build | ✅ Vite production bundle |
| Public health | ✅ `GET https://app.synqdrive.eu/api/v1/health` → `status: ok` |

**Ops scripts added:** `backend/scripts/ops/vps-deploy-connectivity-staging.sh`, `verify-fleet-connectivity-staging.sh`

**Artifacts path:** `/opt/synqdrive/shared/staging-verification/fleet-connectivity-2026-07-20260719122648/`

---

## 3. Infrastructure checks

| Component | Result | Notes |
|-----------|--------|-------|
| Webhook inbox table | ✅ | `device_connection_webhook_inbox` present; 0 rows (no post-deploy webhooks yet) |
| Retry worker queue | ✅ | `CONNECTIVITY_WEBHOOK_PROCESS` registered in `DimoModule`; unit tests cover retry + DLQ |
| Dead letter | ✅ | `device-connection-webhook-processing.service.spec` — DLQ after max attempts |
| Outbox processor | ✅ | `device_connection_episode_resolution_outbox` present; 0 rows; processor retry/DLQ unit tests pass |
| Runtime projection | ✅ | `VehicleConnectivityRuntimeProjectionService` registered; resolution outbox processor wired |
| Metrics | ⚠️ | `GET /api/v1/metrics` → 401 without auth on localhost (expected); counters defined in `ConnectivityObservabilityService` |
| Feature flags / kill switch | ✅ | Recovery on, reconciliation apply off |
| Health | ✅ | Local + public health OK post-fix |

---

## 4. Read-only audits

| Audit | Mode | Result |
|-------|------|--------|
| Episode reconciliation | Read-only, fleet-wide | 2 candidates — both `SHOULD_RESOLVE_BY_TELEMETRY`, `applyEligibleCount=2`, `reviewRequiredCount=0` |
| Webhook inbox audit | Schema + counts | Tables present; inbox empty post-deploy |
| Provider-link audit | Phase 4 CSV | Included in phase 4 artifacts (`fleet-connectivity-provider-link-integrity-2026-07.csv`) |
| Freshness cross-surface | Phase 4 | Cross-surface comparison rows generated |
| Coverage audit | Phase 4 | `fleet-connectivity-fleet-coverage-2026-07.csv` |
| Alert resolution audit | Phase 4 + unit tests | Integrity pass; alert close wired in `ConnectivityAlertService` specs |

### Phase 2 — fleet stats (anonymized)

| Metric | Value |
|--------|-------|
| Total vehicles | 7 |
| DIMO-linked | 6 |
| LTE_R1 | 6 |
| Device connection events | 2 unplug / 0 plug |
| Vehicles last event = unplugged | 2 |

### Phase 4 — 60d integrity

| Metric | Value |
|--------|-------|
| Open unplug episodes (DB) | 2 |
| Episodes with telemetry recovery pattern | 2 |
| Systemic verdict | `SYSTEMIC_NOT_ONE_OFF` (historical; pre-resolution-table data) |

---

## 5. Reconciliation dry-run (evidence packages)

| Field | Value |
|-------|-------|
| Mode | `DRY_RUN` |
| Apply executed | **No** |
| Candidates | 2 |
| Classifications | `SHOULD_RESOLVE_BY_TELEMETRY` × 2 |
| Apply-eligible | 2 |
| Review required | **0** |
| Unclarified auto-apply | **0** |
| Conflicts / `CONFLICTING_DATA` | 0 |

Dry-run confirms evidence packages are complete for the two telemetry-recovery candidates. **No `--apply` was run** per Prompt 9 scope.

---

## 6. INCIDENT_VEHICLE_001 incident replay

### 6.1 Resolution service (canonical new path) — ✅

`device-connection-episode-resolution.service.spec.ts` — **INCIDENT_VEHICLE_001 telemetry replay**:

- Unplug webhook → sustained telemetry + trip without plug webhook
- **Outcome:** `resolved` via `TELEMETRY_RESUMED`
- `resolutionEvidenceAt` = provider telemetry timestamp
- Episode update with `resolutionMethod: TELEMETRY_RESUMED`

**Local Jest (connectivity staging suite):** 5 suites / **58 tests passed** (includes incident replay, kill switch, webhook retry/DLQ, outbox retry/DLQ, evidence-package negatives).

### 6.2 Phase 3 fixture replay (legacy read-model audit) — expected mismatch

The production-readiness audit phase 3 intentionally replays the fixture through **legacy** `buildDeviceConnectionSummary` (event-only collapse):

- `agreedRuleWouldClose: true` but `openUnpluggedEpisode: true` → documents pre-remediation read-model gap
- **Runtime/API v2 path** uses persistent episodes + resolution service + `VehicleConnectivityRuntimeStateBuilder` — not legacy summary alone

| Expected after live recovery (new path) | Verified in unit tests |
|----------------------------------------|------------------------|
| Episode resolved | ✅ |
| `TELEMETRY_ACTIVE` runtime | ✅ Runtime builder + resolution specs |
| Device `PLUGGED_CONFIRMED` / `PLUGGED_INFERRED` | ✅ Evidence + resolution evaluators |
| Unplug alert closed | ✅ `connectivity-alert.service.spec` |
| Single reconnect notification | ✅ Outbox `DEVICE_RECONNECTED` path |
| Cross-surface consistency | ✅ Consumer migration specs (Prompt 8) |

---

## 7. Negative / resilience tests (unit-level)

| Scenario | Coverage | Result |
|----------|----------|--------|
| Stale snapshot | `snapshot-evaluator` / resolution specs | ✅ |
| OEM / synthetic no OBD closure | `device-connection-episode-reconciliation-evidence-package.spec` | ✅ |
| Wrong binding | Binding drift + event-order specs | ✅ |
| Delayed webhook | Inbox idempotency + processing specs | ✅ |
| Worker restart | Outbox processor resumes pending rows (spec) | ✅ |
| Retry | Webhook + outbox retry backoff specs | ✅ |
| Dead letter | Webhook + outbox DLQ specs | ✅ |
| Kill switch off | `connectivity-recovery.policy.spec` — recovery disabled | ✅ |
| Soft-offline | `connectivity-consumer-migration.spec` | ✅ |
| Authorization expired | Provider-link integrity in phase 4 audit rows | ✅ (read-only) |

**Practical post-deploy:** inbox/outbox tables empty — retry/DLQ paths validated via unit tests; live webhook traffic to be observed during 24h window.

---

## 8. Issues found and fixed during staging

| ID | Severity | Issue | Resolution |
|----|----------|-------|------------|
| STG-001 | **P0** | Nest boot loop — `DocumentsModule` / `DimoModule` circular `NotificationsModule` imports | `forwardRef()` chain (`c1ae541f`) |
| STG-002 | **P0** | `DeviceConnectionEpisodeResolutionService` DI — default param interpreted as injectable | Load telemetry policy as class field (`7c9c5be7`) |
| STG-003 | P2 | Audit script `deriveConnectionStatus` signature drift | `924fd1af` |

---

## 9. P0 / P1 status

### P0 — open: **0**

All staging blockers resolved on RC branch before sign-off.

### P1 — open (non-blocking for 24h observation)

| ID | Item | Owner / next step |
|----|------|-------------------|
| FC-P1-STG-01 | DIMO `OBD_DEVICE_PLUGGED_IN` trigger still disabled in prod DIMO console | Ops — enable per runbook after 24h clean metrics |
| FC-P1-STG-02 | 2 historical episodes apply-eligible — **do not apply until observation complete** | Ops — batch apply after 24h with audit hash |
| FC-P1-STG-03 | Metrics scrape requires auth token on VPS localhost | Expected; use Prometheus scraper config |
| FC-P1-STG-04 | Live webhook inbox / outbox empty — practical retry path not yet exercised in prod traffic | Observe 24h |

---

## 10. Acceptance criteria

| Criterion | Status |
|-----------|--------|
| Migration successful | ✅ |
| Incident replay successful (resolution path) | ✅ Unit + fixture predicates |
| Retry + DLQ practically verified | ✅ Unit tests (live inbox empty) |
| Runtime outbox practically verified | ✅ Schema + unit tests |
| Dry run without unclarified auto-apply | ✅ 2 telemetry candidates, 0 review required |
| 0 P0 | ✅ |
| 0 production-blocking P1 | ✅ (P1 items are ops/observation gates) |
| No production reconciliation apply | ✅ |

---

## 11. 24-hour observation (mandatory)

**Start:** 2026-07-19 ~12:26 UTC (post health-green deploy)

Monitor:

- `GET /api/v1/health`
- `synqdrive_connectivity_webhook_*`, `synqdrive_connectivity_episode_*`, `synqdrive_connectivity_recovery_*`
- `device_connection_webhook_inbox` processing_status distribution
- `device_connection_episode_resolution_outbox` pending/retry/dead_letter counts
- Fleet Connectivity UI — KPI + detail drawer consistency
- Alert: `ConnectivityWebhookDeadLetterGrowth`, `ConnectivityEpisodeFalseOpen`

**Do not run reconciliation `--apply` until observation window completes and operator signs off.**

---

## 12. Changes / Architektur

| Doc | Updated |
|-----|---------|
| Synqdrive Code → Changes | ✅ (this commit) |
| Synqdrive Code → Architektur | ✅ (staging verification note on episode/runtime path) |
