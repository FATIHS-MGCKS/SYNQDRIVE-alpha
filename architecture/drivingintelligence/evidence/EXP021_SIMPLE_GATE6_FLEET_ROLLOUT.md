# EXP-021 — Simple Gate-6 operator + fleet rollout readiness

**Date:** 2026-10-10 (UTC)  
**Owner decision:** Drop custom Ed25519/HMAC/dispatch issuance chain; use pinned wrapper + OS authorization + existing production guards.

## A — Simplified Gate-6

| Removed from active path | Replacement |
|--------------------------|-------------|
| Ed25519 human approval JSON | Wrapper attestation + sudo root for `LIVE_OPEN` |
| Approval consumption register | N/A |
| Trusted dispatch issuance + MAC key | N/A |
| Dispatch token HMAC sidecars | N/A |
| `issue-dispatch-token` / `live-open-authorized` crypto chain | `live-open` with `evaluateSimpleLiveOpenAuthority` |

**Preserved:** GLOBAL kill orchestration, compensating REKILL, production fixture isolation, exact `backend.env` pin, five flags, native OFF, replica attestation, S4 zero-state, EMERGENCY_REKILL (wrapper action, independent of OPEN).

**OS authorization:** `DI_S4_GATE6_WRAPPER_ATTESTATION=SYNQDRIVE_GATE6_PINNED_WRAPPER_V1` (set only by `di-v0-s4-gate6-open-rekill-production.sh`). `LIVE_OPEN` requires effective root (`sudo` re-exec) + pilot vehicle confirmation. Env `OPEN_ACK` / `OPEN_AUTHORIZED` alone are **insufficient**.

**Legacy Production file:** `gate6-live-open-approval-root.key` — **no remaining backend references** in Gate-6 operator; **not deleted** on Production (code-only task).

## B — Fleet capability (Production read-only 2026-10-10)

| Vehicle ID | Org | Hardware | DIMO consent | dimo_vehicle_id | S4 eligible |
|------------|-----|----------|--------------|-----------------|-------------|
| `c10351f8-b6a2-4258-947f-631aeaa6d359` | `faa710c9-…` | LTE_R1 | yes | yes | **yes** (pilot) |
| `19fedd4b-c4e8-4de8-a125-dab293326e7e` | `faa710c9-…` | LTE_R1 | yes | yes | **yes** |
| `68868291-5478-42cd-b0c4-cc77b2a78e21` | `faa710c9-…` | LTE_R1 | yes | yes | **yes** |
| `8c850ff1-4201-432b-af2e-2711dbc7ca48` | `faa710c9-…` | LTE_R1 | yes | yes | **yes** |
| `a60c0749-a7cd-494e-b5b9-dea3c6b97d63` | `faa710c9-…` | LTE_R1 | yes | yes | **yes** |
| `c43c3b45-b911-498f-baf9-4376dd585588` | `faa710c9-…` | LTE_R1 | yes | yes | **yes** |
| `17ae4a96-f658-43d4-b262-65d4624a5320` | other org | UNKNOWN | no | no | **no** |
| `1469e60d-afba-4c35-81ad-a38b02544102` | other org | UNKNOWN | no | no | **no** |
| `staging-synthetic-vehicle` | staging | UNKNOWN | no | no | **no** |

**S4 provider path:** R1 / `RUPTELA_R1` work items with DIMO-linked vehicles; **NATIVE=OFF** excludes native provider processing.

**Parallel legacy vs S4:** GLOBAL kill gates all S4 discovery/worker paths; legacy enrichment/scoring remains until S4 outputs validated — no automatic replacement of historical scores.

## C — Rollout waves (engineering manifest)

| Wave | Vehicles | Env change (when authorized) |
|------|----------|------------------------------|
| 1 | Pilot `c10351f8-…` only | `DI_V0_S4_VEHICLE_ALLOWLIST` = wave 1 set |
| 2 | Pilot + `19fedd4b-…`, `68868291-…` | Expand allowlist; org unchanged |
| 3 | All six LTE_R1 fleet vehicles | Full eligible set |

Code authority: `di-v0-s4-fleet-rollout.lib.ts` — `evaluateRolloutWaveAllowlists` enforced at OPEN preflight.

**Health gates between waves:** trip boundaries, no duplicate work items, tenant isolation, replica/budget/redis health, S4 outputs, latency/error thresholds (`ROLLOUT_WAVE_HEALTH_CRITERIA`).

## D — Operator workflow (four actions)

1. **PREFLIGHT** — `DI_S4_GATE6_OPERATOR_MODE=PREFLIGHT`  
2. **DRY_RUN** — transactional OPEN test, rollback  
3. **LIVE_OPEN** — owner-authorized; `sudo` + pins + acks + pilot confirm  
4. **EMERGENCY_REKILL** — independent shutdown  

**Not executed in this workstream:** Production mutation, deploy, kill switch OPEN, env allowlist edits on VPS.
