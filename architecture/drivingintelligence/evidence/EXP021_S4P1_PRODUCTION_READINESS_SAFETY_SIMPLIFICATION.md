# EXP021-S4P1 — Production readiness & safety simplification audit

**Date (UTC):** 2026-10-11  
**Base:** `origin/main` @ audit time (`7266dbefc197e912947cd2aefe95941440161114`)  
**Production:** READ-ONLY (no deploy, no env mutation, no LIVE_OPEN in this slice)  
**Post–Wave-3 state (external):** `GLOBAL_KILL=KILLED` after EMERGENCY_REKILL containment (2026-10-11T21:05:52Z)

## Executive conclusion

DI V0 S4, when enabled, is a **shadow execution plane** scoped by env allowlists, `di_v0_s4_control.GLOBAL`, and DIMO **POST_TRIP_ENRICHMENT / BACKGROUND** budget routing. It **reads** completed `vehicle_trips` for discovery and **writes** only `di_v0_s4_*` tables plus evidence snapshots. It does **not** implement Trip FSM transitions, legacy driving-score persistence, Battery V2, APDS shadow schedulers, RFRF/EED, or rental billing.

The failed Wave-3 **human 24h supervision safety gate** was an **operational triage policy** applied after LIVE_OPEN, **not** a Gate-6 code requirement. Gate-6 retains **technical** guards (allowlists, kill row, budget, replica attestation, pins). **EMERGENCY_REKILL** is **operator-invoked** (tested in engineering); there is **no** automatic rekill on metric threshold in application code.

**Recommended regular production model:** one owner authorization per rollout change → pinned SHA/env verification → unattended operation with **automated** metrics/alerts → **documented** incident playbooks → **manual** EMERGENCY_REKILL when abort conditions are met → multi-day observation using **real** trip traffic (inconclusive if no traffic).

---

## Phase 1 — Runtime impact classification

| Surface | Active when | Primary code | R/W | Classification | Evidence |
|--------|-------------|--------------|-----|----------------|----------|
| **S4A foundation** | `DI_V0_S4_*` flags + `NOT_KILLED` | `s4a-foundation/di-v0-s4a-work-item.repository.ts` | Writes `di_v0_s4_work_items`, `di_v0_s4_evidence_snapshots`, boundary seq; reads `vehicle_trips`, `vehicles`, kill row | **ISOLATED_SHADOW_WRITE** (trips read-only) | `createWorkItem` T01; discovery SELECT `vehicle_trips` L143–167 `di-v0-s4b-discovery.service.ts` |
| **S4B discovery** | `discoveryEnabled` + leader `di_v0_s4_discovery` | `s4b-orchestration/di-v0-s4b-discovery.service.ts` | Read trips; write work items only | **ISOLATED_SHADOW_WRITE** | L37–39 comment; L88–95 `createWorkItem` |
| **S4B claim loop** | Per-replica `di_v0-s4_claim_loop` | `s4b-orchestration/di-v0-s4b-claim-loop.ts` | Lease/work-item state machine | **ISOLATED_SHADOW_WRITE** | Schedulers in `di-v0-s4b-*.scheduler.ts` |
| **S4C acquisition/compute** | `worker`/`position`/`r1` flags | `s4c-executor/di-v0-s4c-executor.ts` | DIMO HF via `runDimo`; `pinEvidence` + `completeWithS2` | **ISOLATED_SHADOW_WRITE** + **SHARED_PROVIDER_BUDGET_EFFECT** | L101–104 `POST_TRIP_ENRICHMENT`; L170–185 persist |
| **S4D replay** | Invoked from S4C when routing `REPLAY` | `s4d-replay/di-v0-s4d-pinned-replay.ts` | Re-reads pinned evidence; no AppModule import | **ISOLATED_SHADOW_WRITE** (library) | `s4d-replay/__tests__/di-v0-s4d-dormant-audit.spec.ts` L8–11 |
| **S4E drift / maintenance** | Schedulers in `DiV0S4eDriftWatcherModule` | `s4e-drift-watcher/*.ts` | Work-item lifecycle / horizon maintenance | **ISOLATED_SHADOW_WRITE** | Wired via `di-v0-s4-runtime.module.ts` L21–22 |
| **S4F observability** | Reconciliation service | `s4f-observability/di-v0-s4f-reconciliation.service.ts` | **Read-only** SQL aggregates | **UNKNOWN** (diagnostic only; no customer API found) | L50 comment L50 |
| **Gate-6 operator** | Shell/CLI only | `scripts/ops/di-v0-s4-gate6-open-rekill-production*` | Mutates `di_v0_s4_control.GLOBAL` only | **BUSINESS_STATE_MUTATION** (kill flag only) | `di-v0-s4-global-kill-transition.ts` |
| **Canonical trips / FSM** | Legacy DI path always | `trip-behavior-enrichment.processor.ts` (outside S4) | **Not S4** | N/A for S4 | `CURRENT_STATE.md` production path |
| **Driving scores / events** | Legacy enrichment | `TripBehaviorEvent`, impact engine | **Not written by S4** | **CUSTOMER_VISIBLE_EFFECT** (legacy only) | No S4 controller; no `TripBehavior` in `s4c-executor/` |
| **Battery V2** | Separate module | `battery-health/*` | **No S4 import** | **UNKNOWN** (no coupling in S4 tree) | Grep: no `battery` under `s4*` |
| **APDS shadow** | `adaptive-polling-shadow/*` | Separate schedulers | **No S4 import** in `driving-intelligence/s4*` | **UNKNOWN** (parallel subsystem) | Grep: no `apd-shadow` under S4 packages |
| **RFRF/EED** | `energy-events/*` | Separate | **No S4 import** | **UNKNOWN** | Module boundary in `CURRENT_STATE.md` |

**Shared resources:** DIMO telemetry GraphQL (budget category `POST_TRIP_ENRICHMENT`, priority `BACKGROUND`) — `di-v0-s4c-executor.ts` L101–103; failure `PROVIDER_BUDGET_UNAVAILABLE` — `di-v0-s4c-position-failure-map.ts`.

**Customer-visible:** No HTTP controllers reference `di_v0_s4` (repository search). S4 outputs are internal evidence + work items until a future publication layer exists.

---

## Phase 2 — Safety gate review (Wave-3)

| Requirement | In Gate-6 code? | Source |
|-------------|-----------------|--------|
| Org/vehicle allowlists (Wave 3 five-vehicle set) | **YES** | `di-v0-s4-fleet-rollout.lib.ts` `ROLLOUT_WAVE_VEHICLE_IDS[3]`; guards `evaluateRolloutWaveAllowlists` |
| Sold vehicle 187336 / `a60c0749-…` excluded | **YES** | `S4_SOLD_OR_REMOVED_FLEET_VEHICLE_IDS`; spec `di-v0-s4-fleet-rollout.lib.spec.ts` |
| `GLOBAL_KILL` + EMERGENCY_REKILL | **YES** | `di-v0-s4-global-kill-transition.ts`; operator `EMERGENCY_REKILL` mode |
| DIMO budget enforcement | **YES** (runtime + preflight) | S4C `runDimo`; Gate-6 `budgetConfigOk` / `budgetRuntimeOk` |
| Replica SHA/env/fingerprint pins | **YES** | `evaluateGate6CoreGuards` L171–225 `di-v0-s4-gate6-open-rekill-production.lib.ts` |
| Named human 24h on-call | **NO** | Not in Gate-6 lib; introduced in **post-LIVE_OPEN agent triage** (owner policy), not operator script |
| Alert delivery to human | **NO** (not a code gate) | Prometheus/Grafana stack may exist on VPS; **not proven** in this audit |
| Automatic emergency shutdown on alert | **NO** | `GATE6_ABORT_CONDITIONS` are **manual** playbook strings L60–68; rekill is **operator CLI** |
| Ed25519 human approval file (historical) | **Separate path** | Documented in S4F-7AX evidence; **simple** live authority uses `OPEN_ACK` + `OPEN_AUTHORIZED` — `di-v0-s4-gate6-simple-live-authority.lib.ts` |

**Retain:** All technical rows above.  
**Do not require by default:** Continuous human supervision; inventing monitoring PASS without delivery proof.

---

## Phase 3 — Simplified operating model (target)

1. **Owner authorization** — single explicit grant per rollout (SHA, env hash, wave, vehicle set).
2. **Technical preflight** — `DI_S4_GATE6_OPERATOR_MODE=PREFLIGHT` then optional `DRY_RUN` (transactional rollback).
3. **LIVE_OPEN** — once per authorization; pins unchanged.
4. **Unattended operation** — schedulers + metrics (`synqdrive_di_v0_s4_runtime_config_attestation_info`, S4F snapshots, SQL in `GATE6_MONITORING_QUERIES`).
5. **Alerts** — wire existing observability to thresholds (kill state, budget, backlog, replica health); **human response** to alerts, not continuous attendance.
6. **Containment** — `EMERGENCY_REKILL` on abort conditions (`GATE6_ABORT_CONDITIONS`); verify `KILLED` in DB.
7. **Pilot exit** — T0 + 24h **observation window** using real trips; mark **INCONCLUSIVE** if no qualifying traffic.

No new approval cryptography or parallel control plane in this model.

---

## Phase 4 — Engineering delta (this PR)

| Change | Justification |
|--------|----------------|
| This evidence document | Canonical audit record |
| `di-v0-s4p1-safety-gate-contract.spec.ts` | Regression: abort/monitoring strings stay technical; five-vehicle + sold exclusion |
| `research/CHANGE_LEDGER.md` entry | Authority traceability |

**Not changed:** Production env, kill state, allowlists, APDS, Battery, Gate-6 runtime behavior.

---

## Phase 5 — Verification commands

```bash
cd backend && npm run test:di:s4f7as:gate6-open-rekill-operator
```

---

## Blockers for “regular production feature” without further work

1. **Publication path** — S4 evidence not customer-facing; product boundary still shadow.
2. **Alert wiring** — abort conditions documented; **automated paging not audited** in repo.
3. **Release attestation** — `SYNQDRIVE_DEPLOYED_GIT_SHA` env marker stale vs runtime (P4B16 planned); orthogonal to S4 kill but affects APDS ops identity checks.
