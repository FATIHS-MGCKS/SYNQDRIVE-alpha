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
