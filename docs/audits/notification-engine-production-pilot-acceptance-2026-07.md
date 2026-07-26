# Notification Engine — Production Pilot Acceptance

**Date:** 2026-07-26 (UTC)  
**Environment:** Production VPS `srv1374778.hstgr.cloud`  
**Method:** Pre-flight verification, read-only SQL, acceptance script, health/metrics/queue observation  
**No new deployment executed in this run** (see §2)

---

## 1. Executive summary

| Item | Result |
|------|--------|
| Pre-deploy backup | **Present** (`db-pre-deploy-20260725233142.sql.gz`, 2026-07-25 23:31 UTC) |
| Controlled deploy (remediation stack) | **Not executed** — remediation PRs not merged to `main` |
| Pilot org data integrity (fingerprints) | **Pass** — 0 duplicate active fingerprints |
| Pilot org occurrence counter accuracy | **Fail** — 9/22 notifications with `occurrence_count` drift |
| Live API E2E (ack/snooze/workflow) | **Not executed** — requires authenticated session |
| External delivery | **Disabled** (as required) |
| Rollback triggered | **No** |

**Go/No-Go recommendation:** **NO-GO** for fleet-wide cutover and **NO-GO** for remediation sign-off until:
1. Remediation stack merged and deployed to `main`
2. Historical Prisma migration failures resolved
3. `occurrence_count` drift investigated on pilot org
4. Org-scoped V2 allowlist implemented (prod currently has **global** V2 on)
5. Authenticated live E2E completed

**Conditional:** Existing global V2 on pilot org may continue **observation-only** — no critical incident observed during read-only audit.

---

## 2. Pre-deployment checklist

### 2.1 Backup evidence

| Artifact | Timestamp (UTC) | Size |
|----------|-----------------|------|
| `db-pre-deploy-20260725233142.sql.gz` | 2026-07-25 23:31 | ~53 MB |
| `backend.env.pre-retention-20260725T233632Z` | 2026-07-25 23:36 | 12 KB |

### 2.2 Commits

| Role | Commit | Notes |
|------|--------|-------|
| **Production (deployed)** | `4a479c1ef1548b89ed5a06337356248100e0bb00` | Release `20260725233142_v4994` |
| **origin/main** | `3cdf772b3bdddd78d333a74496ed16929d1ab945` | +2 commits ahead of prod |
| **Remediation target** | `454732d3` (load/resilience branch tip) | Not on `main`; not deployed |
| **Rollback target** | `4a479c1` (re-link release `20260725230430_v4994`) | Previous known-good release on VPS |

### 2.3 Feature flag plan

| Flag | Current production | Pilot target | Action taken |
|------|-------------------|--------------|--------------|
| `NOTIFICATIONS_V2` | `true` (global) | `true` for pilot org only | **No change** — global already on; org allowlist not implemented |
| `NOTIFICATIONS_DELIVERY_ENABLED` | `false` | `false` | **No change** ✓ |
| `VITE_NOTIFICATIONS_V2` | `on` (global build) | `on` for pilot org only | **No change** — frontend org gate not implemented |

**Deviation:** Production does not yet support org-scoped V2 allowlist (`NOTIFICATIONS_V2_ORG_ALLOWLIST`). Current state exceeds pilot scope (global activation).

### 2.4 Deployment checklist

| Step | Status |
|------|--------|
| Tests green (remediation branches) | ✓ (harness 16/16; see load-resilience audit) |
| Backup verified | ✓ |
| Rollback documented | ✓ (§8) |
| `prisma migrate status` reviewed | ✓ — reports up-to-date; 15 historical failed records remain |
| Remediation migrations (`20260726120000`–`150000`) | ✗ Not on production DB |
| Controlled deploy via `cloud-agent-deploy.sh` | **Skipped** — remediation not on `main` |
| Org-scoped V2 activation | **Skipped** — requires allowlist implementation |
| Live authenticated E2E | **Skipped** — no service account in agent env |

---

## 3. Pilot organization (anonymized)

| Field | Value |
|-------|-------|
| **Alias** | `pilot-org-alpha` |
| **UUID prefix** | `faa710c9-****` |
| **Notifications (total / active)** | 22 / 16 |
| **Max occurrence_count (single row)** | 949 |
| **Active legacy insights** | 4 |
| **Bridged via `legacy_insight_id`** | 4 |

Selected as the organization with the highest notification volume on production (3 orgs with V2 data).

---

## 4. Live verification (read-only / scripted)

### 4.1 Data integrity

| Check | Result |
|-------|--------|
| Duplicate active fingerprints (pilot org) | **0** |
| Orphan occurrences (global acceptance) | **0** |
| Invalid vehicle entity refs (pilot org) | **0** |
| Dead-letter outbox | **0** |
| Outbox backlog | **0** |

### 4.2 Occurrence counter accuracy

| Metric | Value |
|--------|------:|
| Notifications (pilot org) | 22 |
| Sum `occurrence_count` | 7,402 |
| Actual occurrence rows | 7,425 |
| Rows with counter ≠ row count | **9** |

Largest drift examples (counter / actual): 6/12, 782/783, 768/769 — pattern suggests historical duplicate occurrence appends without counter sync on some code paths.

**Verdict:** **Fail** — `occurrence_count` must be reconciled before pilot sign-off.

### 4.3 Infrastructure observation

| Signal | Observation |
|--------|-------------|
| Health | `ok` (uptime ~3.8 h at audit) |
| `synqdrive_notification_*` metrics | **0 series** on `/api/v1/metrics` (observability remediation not deployed) |
| `notification.evaluation` queue | wait=0, failed=0 |
| `notification.delivery` queue | wait=0, failed=0 |
| PM2 `synqdrive` | online |

### 4.4 Acceptance script (pilot org)

```bash
npx ts-node -r tsconfig-paths/register scripts/notification-migration-acceptance.ts --org <pilot-org-uuid>
```

**Result:** `passed: true` (baseline script on prod — hardened checks from Prompt 32 not deployed)

---

## 5. E2E scenario matrix

| # | Scenario | Method | Result | Notes |
|---|----------|--------|--------|-------|
| 1 | Identical event multiple times | SQL + occurrence rows | **Partial** | Drift on counter; rows exist |
| 2 | Severity escalation | SQL status/severity dist | **Pass** | WARNING + INFO active mix |
| 3 | Recovery | SQL RESOLVED rows | **Pass** | 6 resolved notifications |
| 4 | Reopen | — | **Not tested** | Requires authenticated ingest |
| 5 | Read state (two users) | — | **Not tested** | 0 receipts on pilot org |
| 6 | Acknowledge | — | **Not tested** | No API session |
| 7 | Snooze | — | **Not tested** | No API session |
| 8 | Workflow trigger | SQL | **Not tested** | Remediation workflow schema not on prod |
| 9 | Task creation | SQL | **Not tested** | `org_tasks.notification_id` column absent |
| 10 | Delivery (safe channel) | Config | **Pass** | Delivery globally disabled |
| 11 | Role / station scope | — | **Not tested** | Requires API session |
| 12 | One active fingerprint | SQL | **Pass** | 0 duplicates |
| 13 | Correct entity link | SQL | **Pass** | 0 invalid vehicle refs |
| 14 | Event time preservation | — | **Not tested** | Requires API compare |
| 15 | No duplicate workflows | — | **Not tested** | Schema/version mismatch |
| 16 | No duplicate tasks | — | **Not tested** | Column missing |
| 17 | No cross-tenant visibility | SQL scope | **Pass** | Org-filtered queries isolated |

---

## 6. Passed scenarios (summary)

- Zero duplicate active fingerprints (pilot org)
- Zero orphan occurrences (acceptance)
- Zero invalid entity references (pilot org)
- Delivery disabled
- Queue healthy (no backlog/failures)
- Resolved notifications present (recovery path used historically)
- Tenant-scoped SQL isolation verified

---

## 7. Failed / incomplete scenarios

| Scenario | Severity | Detail |
|----------|----------|--------|
| `occurrence_count` accuracy | **High** | 9 notifications with counter drift |
| Org-scoped V2 only | **High** | Global V2 already on all orgs |
| Remediation deploy | **High** | Not on `main`/prod |
| Authenticated API E2E | **Medium** | Not executed |
| Workflow / task linking E2E | **Medium** | DB migrations not applied |
| Observability metrics | **Low** | Remediation metrics not deployed |

---

## 8. Rollback

**Rollback required during this pilot:** **No** — no production changes were made.

### Documented rollback procedure (if needed)

1. **Flags (immediate):**
   - `NOTIFICATIONS_V2=false`
   - `VITE_NOTIFICATIONS_V2=off` (rebuild frontend)
   - Keep `NOTIFICATIONS_DELIVERY_ENABLED=false`
   - `pm2 restart synqdrive --update-env`

2. **Release (if bad deploy):**
   - `ln -sfn /opt/synqdrive/releases/20260725230430_v4994 /opt/synqdrive/current`
   - `pm2 restart synqdrive`

3. **Data:** Do not delete `notifications` rows — V1 paths resume from `dashboard_insights`.

---

## 9. Go / No-Go

| Decision | **NO-GO** |
|----------|-----------|
| Fleet-wide cutover | Blocked — occurrence drift, remediation not deployed |
| Pilot org sign-off | Blocked — live E2E incomplete, counter drift |
| Continue observation | Acceptable — no critical runtime failure |

### Required before re-pilot

1. Merge remediation PRs (#948–#953) to `main`
2. Resolve 15 historical `_prisma_migrations` failures
3. Deploy via `cloud-agent-deploy.sh`
4. Implement `NOTIFICATIONS_V2_ORG_ALLOWLIST` + frontend org gate
5. Set global V2 off; enable allowlist for `pilot-org-alpha` only
6. Run migration backfill + acceptance on pilot org
7. Execute authenticated E2E checklist with two test users
8. Reconcile `occurrence_count` vs occurrence rows

---

## Related

- `docs/audits/notification-engine-vps-control-audit-2026-07.md`
- `docs/audits/notification-engine-load-resilience-test-2026-07.md`
- `docs/operations/notification-engine-migration-runbook.md`
