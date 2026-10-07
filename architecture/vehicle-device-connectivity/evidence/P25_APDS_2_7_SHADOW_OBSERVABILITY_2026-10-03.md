# P2.5 APDS-2…7 — Production-safe dual shadow observability

| Field | Value |
|-------|-------|
| **Evidence ID** | VDC-EVID-P25-APDS-2-7-001 |
| **Branch** | `cursor/apds-shadow-observability-dafe` (from `origin/main`) |
| **Flag** | `WORKER_APD_SHADOW_ENABLED=false` (default) |
| **Production deploy** | APDS-8 flag-OFF only after gate pass |

## PR #1893 scope hygiene (read-only inventory)

| Field | Value |
|-------|-------|
| `PR1893_CURRENT_HEAD` | `fcbdbca04` (10 commits above `origin/main`) |
| `PR1893_FILE_COUNT` | **46** |
| `R9O_CODE_FILE_COUNT` | **11** (`r9-*` + migration + `snapshot-wake.module` wiring) |
| `DSC_APD_RESEARCH_FILE_COUNT` | **30** (evidence + `p25-*` ops scripts + APDS-1 policy TS) |
| `OTHER_FILE_COUNT` | **5** (dark deploy audit, TDL/dimo ledgers, `ChangesView`, schema bulk from R9) |

**Safe split (not executed — requires explicit human authorization for cherry-pick/rebase):**

| PR | Base | Contents |
|----|------|----------|
| **PR-A** | `origin/main` | R9O-1/2 code + `R9O_1_2_WAKE_FORENSIC_FOUNDATION` + TDL ledgers |
| **PR-B** | `origin/main` | DSC-2, PS1–PS3 evidence + read-only `p25-*` scripts |
| **PR-C** | `origin/main` | **This branch** — APDS-2…7 runtime (observe-only) |

`SAFE_SCOPE_SPLIT_AVAILABLE=YES` (additive branches; no history rewrite)

## Policy parity

- Corpus: `backend/scripts/ops/p25-apd-policy-parity.fixtures.json`
- Runner: `p25-apd-policy-parity-runner.mjs`
- Jest: `p25-apd-policy-parity.spec.ts`
- Core TS mirrors `p25-apd-replay-policy-core.mjs`; overlays (gap/R9/invalidation) are **shadow-only** (`p25-apd-shadow-overlay.ts`)

## Runtime architecture

1. `DimoSnapshotScheduler` — pre-poll `observePrePoll` (fail-open) → unchanged `requestSnapshot`
2. `DimoSnapshotProcessor` — post-poll `observePostPoll` when `apdShadowOpportunityId` present
3. Durable rows: `apd_shadow_reconciliation_decisions` (unique org+vehicle+opportunity+policyVersion)

## Forensic model

`FORENSIC_UNIQUE_KEY=(organizationId, vehicleId, opportunityId, policyVersion)`

`opportunityId = sha256(org|vehicle|decisionAtMs|origin)`

## APDS-7.1 Postgres closure

- Integration: `adaptive-polling-shadow.postgres.integration.spec.ts` (12 scenarios)
- CI gate: `backend/scripts/test/p25-apd-shadow-postgres-ci.sh`
- Migration gate: `backend/scripts/test/p25-apd-shadow-migration-ephemeral.sh`
- Unique index: `apd_shadow_reconciliation_decisions_org_vehicle_opportunity_policy_key` on `(organization_id, vehicle_id, opportunity_id, policy_version)`
- Tenant safety: composite FK `(organization_id, vehicle_id) → vehicles(organization_id, id)` via `vehicles_organization_id_id_key`

## Engineering result block

See `P25_APDS_2_7_ENGINEERING_RESULT` and `P25_APDS_8_FLAG_OFF_DEPLOY_RESULT` in agent completion output.

## APDS-8 — Production flag-OFF deploy (2026-10-06)

| Field | Value |
|-------|-------|
| `AUTHORIZED_DEPLOY_SHA` | `0c19eb62cef292e4e26ebeb2cf3b8f8afcbca2a2` (PR #1899 merge) |
| `PRE_PRODUCTION_SHA` | `ee9588548845c8077aa0cba0684b06eac7c9d4d2` (`20261002014651_v4994`) |
| `DEPLOY_RELEASE_ID` | `20261006064327_v4994` |
| `BACKUP` | `/opt/synqdrive/shared/backups/db-pre-deploy-20261006064327.sql.gz` |
| `MIGRATIONS_APPLIED` | `20261002120000_battery_hv_h4_charge_session_evidence_revisions`, `20261003024000_apd_shadow_reconciliation_decisions` |
| `PRODUCTION_APD_ROW_COUNT` | `0` (post-migrate + 15m observation) |
| `REPLICA_A/B_SHA` | `0c19eb62cef292e4e26ebeb2cf3b8f8afcbca2a2` |
| `WORKER_APD_SHADOW_ENABLED` | **ABSENT** in `shared/backend.env` → runtime default **OFF**; metrics `synqdrive_apd_shadow_enabled=0` on 3001/3002 |
| `OBSERVATION` | 15m window; poll counters increased; APD decisions/forensics **0** |
| `SHADOW_ACTIVATED` | **NO** |
| `APDS_9_TECHNICALLY_READY` | **YES** (schema + runtime on prod; flag OFF proven; empty forensics table) |
