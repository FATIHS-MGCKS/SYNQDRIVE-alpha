# Data Authorization — Staging Runtime Verification (2026-07)

| Field | Value |
|-------|-------|
| **RC branch** | `cursor/data-auth-monitoring-ci-26b5` |
| **Target commit** | `31a1548c` (`31a1548c32ef7c9854faea73a2693bf309d3decb`) |
| **PR** | [#749](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/749) |
| **Verified at** | 2026-07-24 UTC |
| **Verifier** | Cloud Agent Prompt 42 |
| **Environment** | Production VPS (`srv1374778.hstgr.cloud` / `app.synqdrive.eu`) — **isolated RC deploy attempt + read-only infra checks**; no real provider grant revocations; no production data deletion |

---

## Executive summary

| Verdict | **NO-GO for production rollout** |
|---------|----------------------------------|

Data Authorization RC staging deploy **failed at Prisma migration** `20260723230000_privacy_domain_foundation` due to a schema type mismatch (`organization_id` UUID vs `organizations.id` TEXT). The production symlink was **not switched** — live traffic remains on commit `51069d1`. Privacy-domain tables, enforcement policies, deny-switch, revocation orchestrator, and `data_auth_*` Prometheus metrics are **not present** on the running backend. Fifteen controlled runtime scenarios could not execute. Local CI gates (monitoring verify, production safety, coverage) pass on the RC branch.

---

## 1. Preconditions (before any change)

| Prerequisite | Status | Evidence |
|--------------|--------|----------|
| Current Git commit documented | ✅ | Production: `51069d1` (`/opt/synqdrive/releases/20260723224943_v4994`); RC target: `31a1548c` |
| Backup status verified | ✅ | `db-pre-data-auth-rc-20260724025941.sql.gz` (51.7 MB); prior `db-pre-deploy-20260723224943.sql.gz` |
| Restore procedure reviewed | ✅ | `pg_restore` / `gunzip \| psql` from shared backups; symlink rollback to prior release |
| Running processes captured | ✅ | PM2: `synqdrive` online (uptime ~4h at check); `pm2-logrotate` online; Grafana :3000, Prometheus :9090 |
| Rollback steps defined | ✅ | `ln -sfn /opt/synqdrive/releases/20260723224943_v4994 /opt/synqdrive/current && pm2 restart synqdrive`; DB restore only if schema corruption (not required — migration failed before FK) |
| Test tenant identified | ✅ | Synthetic fixture via `createDataAuthPostgresFixture` (isolated org A/B); **not executed** — privacy schema missing |
| No real PII in tests | ✅ | Runtime script uses synthetic UUIDs only; no real provider grant revocations |

### Rollback reference

```
# Code rollback (already effective — symlink never switched)
ln -sfn /opt/synqdrive/releases/20260723224943_v4994 /opt/synqdrive/current
pm2 restart synqdrive

# DB rollback (only if needed — not required for this failure)
gunzip -c /opt/synqdrive/shared/backups/db-pre-data-auth-rc-20260724025941.sql.gz | sudo -u postgres psql synqdrive

# Clear failed migration blocker (required before retry)
cd /opt/synqdrive/current/backend
npx prisma migrate resolve --rolled-back 20260723230000_privacy_domain_foundation
```

---

## 2. Staging deploy attempt

| Step | Result | Notes |
|------|--------|-------|
| Pre-deploy `pg_dump` | ✅ | `db-pre-data-auth-rc-20260724025941.sql.gz` |
| Safety env defaults appended | ✅ | `DATA_AUTH_DECISION_DEV_BYPASS=false`, `DATA_AUTH_DECISION_ENFORCEMENT_ENABLED=true`, `DATA_AUTH_DECISION_GLOBAL_DENY=false`, `RETENTION_DELETION_SCHEDULER_DRY_RUN=true` |
| Clone RC branch | ✅ | `/opt/synqdrive/releases/20260724025941_data-auth-rc` @ `31a1548c` |
| `prisma migrate deploy` | ❌ | **Failed** on `20260723230000_privacy_domain_foundation` |
| Backend build + PM2 switch | ⏭️ | Not reached (deploy aborted at migrate) |
| Symlink switch to RC | ⏭️ | **Not performed** — `/opt/synqdrive/current` → `20260723224943_v4994` |

### Migration failure detail

```
ERROR: foreign key constraint "processing_activities_organization_id_fkey" cannot be implemented
DETAIL: Key columns "organization_id" and "id" are of incompatible types: uuid and text.
```

Root cause: privacy-domain migrations declare `organization_id UUID` while production `organizations.id` is `TEXT` (Prisma `String @id`). Prisma schema correctly uses `String` for `organizationId`; hand-written migration SQL uses `UUID`.

**Failed migration state:** `_prisma_migrations` row for `20260723230000_privacy_domain_foundation` — `finished_at` NULL, `rolled_back_at` NULL. **17 privacy/data-auth migrations pending** after foundation.

**Partial schema:** No `processing_*`, `enforcement_policies`, `deny_switch_entries`, or `authorization_decision_events` tables created (failure occurred at FK creation).

---

## 3. Infrastructure checks

| Component | Result | Notes |
|-----------|--------|-------|
| **PostgreSQL** | ✅ | 263 applied migrations on live release; DB reachable |
| **Redis** | ✅ | `PONG` on :6379 |
| **PM2 / Backend** | ✅ | `synqdrive` online on :3001; public health `https://app.synqdrive.eu/api/v1/health` → `status: ok` |
| **ClickHouse** | ⚠️ | `CLICKHOUSE_URL` configured in shared env; `npm run clickhouse:ping:url` failed (`.env` parse: `share: unbound variable` — script/env issue, not connectivity proof) |
| **Queues (Bull)** | ✅ | Active `bull:battery.v2:*`, `bull:dimo.tire.recalculation:*` keys present — workers operational on current release |
| **Prometheus** | ✅ | `/-/healthy` on :9090 |
| **Grafana** | ✅ | Listening on :3000 |
| **Build/commit consistency** | ❌ | Live backend `51069d1`; RC `31a1548c` not deployed |
| **Policy cache** | ⏭️ | Privacy resolver tables absent — not testable |
| **Decision logs** | ⏭️ | `authorization_decision_events` table absent |
| **Enforcement coverage** | ⏭️ | Runtime registry not on live backend; CI baseline passes locally |
| **Revocation orchestrator** | ⏭️ | `data_authorization_revocation_workflows` table absent |
| **Deny-switch** | ⏭️ | `deny_switch_entries` table absent |
| **Monitoring (`data_auth_*`)** | ❌ | Metrics endpoint HTTP 200 but **0** `data_auth_*` series (old binary) |
| **Alerting (`synqdrive_data_auth`)** | ❌ | Prometheus rule groups on VPS do not include `synqdrive_data_auth` (bundled in RC only) |
| **Legacy tables** | ✅ | `org_data_authorizations`, `vehicle_provider_consents` present (pre-privacy-domain) |

### Disk

Root filesystem 10% used (19G / 193G) — adequate for backup/restore.

---

## 4. Local / CI verification (agent workspace, commit `31a1548c`)

| Check | Result |
|-------|--------|
| `verify-data-auth-monitoring.sh` | ✅ Pass |
| `data-auth-production-safety-check.sh` | ✅ Pass (coverage 14/14, CI gate 6/6) |
| `data-auth-metrics.service.spec` | ✅ 2/2 |
| Frontend `test:data-auth` | ✅ 58/58 (from Prompt 41) |

These validate **code readiness** but do not substitute for VPS runtime verification.

---

## 5. Controlled runtime scenarios (15 tests)

Script: `backend/scripts/ops/run-data-auth-staging-runtime-tests.ts`

**Execution blocked** — script could not compile/run on VPS RC release (TypeScript errors against non-generated Prisma client for privacy models; `node_modules` from incomplete deploy). Even if compiled, `probeDataAuthDatabase()` would return false (privacy schema missing).

| # | Scenario | Status | Detail |
|---|----------|--------|--------|
| 1 | Allowed telemetry processed | ⏭️ skip | Privacy schema not deployed |
| 2 | Denied telemetry not persisted | ⏭️ skip | Privacy schema not deployed |
| 3 | Trips not created on DENY | ⏭️ skip | Privacy schema not deployed |
| 4 | Health not derived on DENY | ⏭️ skip | Privacy schema not deployed |
| 5 | Misuse not evaluated on DENY | ⏭️ skip | Privacy schema not deployed |
| 6 | Alerts not generated on DENY | ⏭️ skip | Privacy schema not deployed |
| 7 | AI/MCP access blocked | ⏭️ skip | Privacy schema not deployed |
| 8 | Revocation activates immediate DENY | ⏭️ skip | Privacy schema not deployed |
| 9 | Queue jobs stop | ⏭️ skip | Privacy schema not deployed |
| 10 | Provider status remains consistent | ⏭️ skip | Privacy schema not deployed |
| 11 | Caches invalidated | ⏭️ skip | Privacy schema not deployed |
| 12 | Decision events created | ⏭️ skip | Privacy schema not deployed |
| 13 | Old workers detected | ⏭️ skip | Privacy schema not deployed |
| 14 | Coverage switches correctly | ⏭️ skip | Privacy schema not deployed |
| 15 | Monitoring alerts on test failures | ⏭️ skip | `synqdrive_data_auth` alerts not loaded on VPS |

**Summary:** 0 pass, 0 fail, **15 skip** (blocked by migration failure).

---

## 6. Security compliance

| Rule | Status |
|------|--------|
| Secrets not logged | ✅ |
| Full `.env` not logged | ✅ (key names only) |
| ClickHouse runtime form verified first | ⚠️ Ping script failed; URL keys present |
| No unverified Docker assumptions | ✅ (native Postgres/Redis on VPS) |
| No production data deleted | ✅ |
| No real provider grants revoked | ✅ |

---

## 7. Open blockers

| ID | Blocker | Severity | Remediation |
|----|---------|----------|-------------|
| B1 | Privacy migrations use `UUID` for `organization_id`; production `organizations.id` is `TEXT` | **Critical** | Regenerate or fix migrations `20260723230000` … `20260724130000` to use `TEXT` for all `organization_id` FK columns matching Prisma `String` |
| B2 | Failed migration row blocks `prisma migrate deploy` | **Critical** | `prisma migrate resolve --rolled-back 20260723230000_privacy_domain_foundation` after B1 fix |
| B3 | RC release not built (`npm ci` + `prisma generate` incomplete) | High | Full RC deploy after B1/B2 |
| B4 | `synqdrive_data_auth` alerts not on VPS Prometheus | Medium | Reload Prometheus config post-deploy |
| B5 | ClickHouse ping script `.env` parse error | Low | Fix `clickhouse-ping-url.sh` quoting for values containing `share` |

---

## 8. GO / NO-GO decision

| Decision | **NO-GO** |
|----------|-----------|

**Rationale:**

1. Privacy-domain schema cannot apply on production PostgreSQL without migration type fix.
2. Live backend remains on pre-data-auth commit `51069d1` — no enforcement, deny-switch, revocation orchestrator, or observability.
3. Zero of 15 runtime scenarios executed successfully.
4. `data_auth_*` metrics and `synqdrive_data_auth` alerts absent on running stack.

**Conditions for GO (re-verification required):**

1. Fix `organization_id` column types in privacy migrations (TEXT, not UUID).
2. Resolve failed migration; apply all 17 pending privacy/data-auth migrations.
3. Complete RC deploy (build, PM2 switch, health check).
4. Re-run `verify-data-auth-staging.sh` and `run-data-auth-staging-runtime-tests.ts` — all 15 scenarios pass.
5. Confirm `data_auth_*` metrics and `synqdrive_data_auth` alert group on VPS Prometheus.

---

## 9. Artifacts

| Artifact | Path |
|----------|------|
| RC release (not live) | `/opt/synqdrive/releases/20260724025941_data-auth-rc` |
| Pre-RC DB backup | `/opt/synqdrive/shared/backups/db-pre-data-auth-rc-20260724025941.sql.gz` |
| Deploy script | `backend/scripts/ops/vps-deploy-data-auth-staging.sh` |
| Verify script | `backend/scripts/ops/verify-data-auth-staging.sh` |
| Runtime tests | `backend/scripts/ops/run-data-auth-staging-runtime-tests.ts` |

Staging verification artifacts directory was **not created** (`verify-data-auth-staging.sh` not executed — blocked by failed deploy).

---

## 10. References

- `docs/architecture/data-auth-monitoring-ci-2026-07.md`
- `docs/runbooks/data-authorization-production-rollout.md`
- `docs/runbooks/data-authorization-incidents.md`
- Migration: `backend/prisma/migrations/20260723230000_privacy_domain_foundation/migration.sql`
