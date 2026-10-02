# EXP-021 S4F-7 — Tiny operator authorization preflight (read-only)

**Audit date:** 2026-10-01 (UTC)  
**Repository main:** `8415aeb549d8c6a6872b8884dca33be6ea9a7cd7` (merged PR #1868 S4F-6)  
**Production SHA reference:** `8fa531b275bc4dca02c09b279c0d2b806e544007`  
**Production release reference:** `20261001035130_v4994`  
**Scope:** Read-only repository + Production inspection. **No** operator authorization grant, **no** S4/Tiny activation, **no** Production mutation.

## Step 1 — Re-anchor

| Check | Result |
|-------|--------|
| `origin/main` | `8415aeb549d8c6a6872b8884dca33be6ea9a7cd7` |
| PR #1868 | **MERGED** (merge commit = main tip) |
| S4F-6 authority on main | `CURRENT_STATE.md` + `EXP021_S4F6_GLOBAL_BUDGET_PRODUCTION_ROLLOUT_RESULT.md` present; Tiny row shows **5/6** gates, global budget **SATISFIED** |
| Frozen evaluator | `backend/src/modules/vehicle-intelligence/driving-intelligence/s4f-observability/di-v0-s4f-activation-evidence.ts` |
| `frozenTinyActivationGateKeys()` | six gates (replay, rehash, backpressure, global budget, location governance note, explicit operator authorization) |
| S4A control plane | `di-v0-s4a-control-plane.ts` + `architecture/drivingintelligence/design/s4a/S4A_CONTROL_PLANE.md` |
| Drift vs expected main | **None** on S4A–S4F implementation between Production SHA and `8415aeb54…` (intervening commits are S4F-5/5.1/5.2/6 **documentation only**) |

## Step 2 — Frozen Tiny gates (recomputed)

Evidence inputs (repository authority + S4F-2/S4F-3/S4F-6; **not** copied from `CURRENT_STATE` alone):

| Gate | Evidence input | Evaluator |
|------|----------------|-----------|
| `replayDeserializerGate` | `DI-GAP-S4-REPLAY-DESERIALIZER-001:CLOSED` (S4F-3) | **SATISFIED** |
| `snapshotRehashGate` | `SNAPSHOT_REHASH_VERIFICATION:IMPLEMENTED` (S4F-3) | **SATISFIED** |
| `providerBackpressureGate` | `DI-GAP-S4-PROVIDER-BACKPRESSURE-001:CLOSED` (S4F-2) | **SATISFIED** |
| `providerGlobalBudgetEnabledGate` | S4F-6: `EXPLICIT_ENABLED` + `CONFIRMED_ENABLED` on Production SHA `8fa531b27…` | **SATISFIED** |
| `locationRetentionGovernanceGate` | `DI-GAP-S4-LOCATION-RETENTION-001:GOVERNANCE_NOTE` (S4F-3) | **SATISFIED** |
| `explicitOperatorAuthorizationGate` | Human gate; **not granted** in this task | **NOT_SATISFIED** (`UNKNOWN`/`DENIED` → fail-closed) |

**Current:** `FROZEN_TINY_GATE_SATISFIED_COUNT=5`, `TINY_ACTIVATION_READY=NO`, `finalState=NOT_READY`.

**Hypothetical simulation only** (`explicitOperatorAuthorization='GRANTED'`, other five unchanged):

```ts
evaluateDiV0S4fTinyActivationReadiness({
  replayDeserializerGap: 'CLOSED',
  snapshotRehashVerification: 'IMPLEMENTED',
  providerBackpressureGap: 'CLOSED',
  providerGlobalBudgetEnabled: 'ENABLED',
  locationRetentionGovernanceNote: 'PRESENT',
  explicitOperatorAuthorization: 'GRANTED',
});
// → finalState=READY, tinyActivationReady=true
```

`HYPOTHETICAL_AFTER_HUMAN_GRANT=READY` — **not** recorded as actual authorization.

## Step 3 — Runtime reachability (S4A–S4F code audit)

| Question | Answer |
|----------|--------|
| `DiV0S4bOrchestrationModule` in active Nest graph? | **NO** — `backend/src/app.module.ts` has **no** `DiV0S4*` imports (enforced by `di-v0-s4f-dormant-audit.spec.ts`, `di-v0-s4b-dormant-audit.spec.ts`, `di-v0-s4c-dormant-audit.spec.ts`) |
| S4 discovery scheduled in Production? | **NO** — schedulers exist only inside `DiV0S4bOrchestrationModule` (not registered) |
| S4 worker / claim loop? | **NO** (same) |
| S4C provider acquisition from Production runtime? | **NO** — `registerDiV0S4cExecutor` is a **composition helper only**; not wired into AppModule |
| S4E drift watcher / T10/T12 maintenance? | **NO** — `DiV0S4eDriftWatcherModule` **DEFINED_NOT_REGISTERED** |
| S4F runtime? | **NO** — `DiV0S4fObservabilityModule` **DEFINED_NOT_REGISTERED** |
| Modules **DEFINED_NOT_REGISTERED** | **S4B, S4C (executor registration), S4E, S4F** (S4D is library/replay harness; no Nest module in AppModule) |
| Imports required before activation | At minimum: register `DiV0S4bOrchestrationModule` + `DiV0S4eDriftWatcherModule` (or equivalent consolidated DI module), wire `registerDiV0S4cExecutor` with DIMO ports, optional S4F reconciliation scheduler; ensure scheduler leader registry names are active |
| Can SHA `8fa531b27…` execute S4 by env/DB only? | **NO** — code is present on disk in release tree but **not loaded** by running Nest process |
| `OPERATOR_AUTHORIZATION_ALONE_CAN_ACTIVATE_S4` | **NO** |

## Step 4 — Control-plane activation semantics (frozen S4A)

**Effective enablement** (`evaluateDiV0S4Enablement`):  
`MASTER ∧ ROLE_FLAG ∧ POSITION ∧ org∈allowlist ∧ vehicle∈allowlist ∧ vehicle.org=workItem.org ∧ DB NOT_KILLED`.

| Flag / rule | Default | Production (2026-10-01 read-only) |
|-------------|---------|-------------------------------------|
| `DI_V0_S4_MASTER_ENABLED` | `false` | **unset** → **false** |
| `DI_V0_S4_DISCOVERY_ENABLED` | `false` | **unset** → **false** |
| `DI_V0_S4_WORKER_ENABLED` | `false` | **unset** → **false** |
| `DI_V0_S4_POSITION_ENABLED` | `false` | **unset** → **false** |
| `DI_V0_S4_R1_ENABLED` | `false` | **unset** → **false** |
| `DI_V0_S4_NATIVE_ENABLED` | `false` | **unset** → **false** |
| Org allowlist | empty = **NONE** | **unset** → **NONE** |
| Vehicle allowlist | empty = **NONE** | **unset** → **NONE** |
| Wildcard | forbidden | n/a |
| Malformed list | whole list → **NONE** | n/a |
| `dbCanEnable` | **false** (DB cannot enable when env off) | n/a |
| DB kill row | missing / unreadable / malformed → **KILLED** | **`di_v0_s4_control` exists; `GLOBAL` row missing** → **KILLED** |

**Minimal control-plane for exactly one vehicle (hypothetical — not applied):**

- `DI_V0_S4_MASTER_ENABLED=true`
- `DI_V0_S4_DISCOVERY_ENABLED=true`, `DI_V0_S4_WORKER_ENABLED=true`
- `DI_V0_S4_POSITION_ENABLED=true` (mandatory)
- `DI_V0_S4_R1_ENABLED=true` for recommended Tiny channel set (see Step 8); `DI_V0_S4_NATIVE_ENABLED=false`
- `DI_V0_S4_ORGANIZATION_ALLOWLIST=faa710c9-6d91-4079-a7d5-91fdccdec14a`
- `DI_V0_S4_VEHICLE_ALLOWLIST=<single vehicle id>`
- `di_v0_s4_control` row `kill_state=NOT_KILLED` with operator actor/reason (separate human action)
- Rolling PM2 restart after env change (Nest loads env at bootstrap)
- **Plus** runtime module registration (Step 3) — env alone insufficient on current Production process

## Step 5 — Read-only Production baseline (2026-10-01)

Method: SSH `synqdrive-admin@srv1374778.hstgr.cloud`, `sudo -n` for `backend.env` and `psql` as `postgres`. No secrets printed.

### Deployment / runtime

| Field | Value |
|-------|--------|
| Release | `20261001035130_v4994` (`/opt/synqdrive/current` → this release) |
| `PRODUCTION_SHA` | `8fa531b275bc4dca02c09b279c0d2b806e544007` (S4F-5.2 / S4F-6 frozen evidence; no contradictory deploy marker in release tree) |
| Replica A/B health | **OK** (`localhost:3001` / `:3002` → HTTP 200, `status=ok`) |
| Mixed SHA | **NO** (shared `current` symlink; S4F-6 `NO_MIXED_SHA=YES`) |
| PM2 | `synqdrive` + `synqdrive-b` online, ~14h uptime, 0 restarts since S4F-6 rollout window |
| Scheduler single leader | **YES** (S4F-6 post-rollout frozen block; readiness postgres/redis **ok**) |
| Nginx dual upstream | **YES** (S4F-6; health via public URL HTTP 200) |

### S4 env (sudo grep of `backend.env`)

| Variable | State |
|----------|--------|
| `DIMO_GLOBAL_BUDGET_ENABLED` | `true` (S4F-6) |
| All `DI_V0_S4_*` flags | **absent** → parsed **false** |
| Allowlists | **absent** → **NONE** |

### DB control + S4 persistence

| Metric | Count / state |
|--------|----------------|
| `di_v0_s4_control` table | **exists** |
| `GLOBAL` kill row | **missing** → **KILLED** (fail-closed) |
| `di_v0_s4_pipeline_versions` | **0** rows |
| `di_v0_s4_work_items` | **0** total, **0** active/nonterminal |
| `di_v0_s4_evidence_snapshots` | **0** |
| S2 runs with S4 execution identity prefix | **0** |
| `di_v0_shadow_intervals` | **0** |
| `S4_RUNTIME_ACTIVE` | **NO** |
| `SHADOW_ACTIVATION_OCCURRED` | **NO** (no S4-attributed S2 rows) |

## Step 6 — Schema / deploy prerequisites

| Compare | Result |
|---------|--------|
| `8fa531b27…` vs `8415aeb54…` backend S4 code | **Identical** (no implementation commits between SHAs) |
| `CODE_DEPLOY_REQUIRED_BEFORE_TINY_EXECUTION` | **NO** for new S4 **code** on main tip |
| `MIGRATION_REQUIRED_BEFORE_TINY_EXECUTION` | **NO** — Production already has `di_v0_s4_*` tables (empty) |
| **Engineering prerequisite** | **YES** — Nest **runtime registration** + S4C DIMO port wiring + **NO_BACKFILL containment** (Step 9) before controlled Tiny execution |

## Step 7 — First Tiny candidate (read-only DB)

**Organization:** F.S Mobility Service — `faa710c9-6d91-4079-a7d5-91fdccdec14a`

Deterministic ranking (RUPTELA_R1, completed trips in 30d, stable identity):

| Rank | Vehicle | ID | 30d completed trips | Notes |
|------|---------|-----|---------------------|--------|
| 1 | **KS MS 661** | `c10351f8-b6a2-4258-947f-631aeaa6d359` | 165 | Strong S3A/R1 fleet evidence (C1D.10A); R1 serial pattern; no cohort enrollment gap (unlike WOB L 7503) |
| 2 | WOB L 7503 | `19fedd4b-c4e8-4de8-a125-dab293326e7e` | 120 | Historical `enrollment_not_found` on live EXP-021 arm |
| 3 | HMÜ C 215 | `8c850ff1-4201-432b-af2e-2711dbc7ca48` | 77 | Valid R1 |
| 4 | KS MX 2024 | `a60c0749-a7cd-494e-b5b9-dea3c6b97d63` | 40 | Cohort study vehicle; more operational ambiguity |

**Selected first Tiny vehicle:** `c10351f8-b6a2-4258-947f-631aeaa6d359` (**KS MS 661**, Audi A4, **RUPTELA_R1**).  
`FIRST_TINY_RECENT_COMPLETED_TRIP_PRESENT=YES` (example latest trip id `7f6f7e27-d181-441f-aa28-1f5eb010aac3`).

**Secondary (not first Tiny):** Tesla **KS FH 660E** — `68868291-5478-42cd-b0c4-cc77b2a78e21`, **API_SYNTHETIC** — for later cross-family validation only (C1D.10A native-readiness gap).

## Step 8 — Minimal channel set

Authority:

- POSITION is **mandatory** for any executable S4 run (`DI_V0_S4_POSITION_ENABLED` required).
- R1 five-field adapter is **shadow-ready** for `RUPTELA_R1` (S3B / S4C matrix tests).
- Native channel: with `nativeEnabled=true`, `buildDiV0S4cNativeChannelInput` returns **`NOT_READY` / `READINESS_AUTHORITY_NONE`** for RUPTELA (DI-GAP-S4-NATIVE-READINESS-001).

**`RECOMMENDED_FIRST_TINY_CHANNEL_SET=POSITION + R1_OBD`** with `DI_V0_S4_POSITION_ENABLED=true`, `DI_V0_S4_R1_ENABLED=true`, `DI_V0_S4_NATIVE_ENABLED=false`.

## Step 9 — Blast radius / backfill

Discovery (`di-v0-s4b-discovery.service.ts`):

- Scopes to **intersection** of org + vehicle allowlists.
- Selects **all** `COMPLETED` trips past **24h** quiet period (`settlementQuietPeriodSeconds=86400`) without an active PRIMARY for the current pipeline version key, **oldest anchor first**, batch default **50** per pass.
- For KS MS 661 alone: **498** quiet-period-eligible historical trips (read-only Production DB count, 2026-10-01) — **not** a single-trip bound.

| Risk | Assessment |
|------|------------|
| `BACKFILL_POSSIBLE_WITH_PROPOSED_CONTROL_PLANE` | **YES** (intrinsic to current discovery SQL) |
| `NO_BACKFILL_CONTAINMENT_REQUIRED` | **YES** — need an engineering control (e.g. trip-id ceiling, discovery watermark, or one-shot operator window) **before** enabling discovery on Production |
| Provider acquisition | Only if worker + S4C registered and work items claimed |
| 10d drift horizon | S4E T11 scans work items within `driftHorizonSeconds=864000` (report-only mismatch in S4F when dormant) |
| Redis / budget | Global budget enabled (S4F-6); backpressure certification satisfied; Redis reachable on Production |
| DB kill | Missing row blocks all authoritative transitions except safe T07 semantics when killed |

**`TINY_ACTIVATION_READY=YES` (evaluator) ≠ `S4_RUNTIME_ACTIVE=YES`** — evaluator readiness is evidence-only; runtime remains dormant until module registration + control plane + execution slice.

## Step 10 — Emergency rollback / kill (verify only)

Ranked authoritative stop mechanisms:

1. **DB `di_v0_s4_control.kill_state=KILLED`** (or delete row → fail-closed **KILLED**) — takes effect on **next gated transaction**; no PM2 restart required for in-flight lease relinquish (T07 path).
2. **`DI_V0_S4_MASTER_ENABLED=false`** — requires **PM2 rolling restart** (env read at bootstrap).
3. **Role flags OFF** — same restart requirement.
4. **Empty allowlists** — same restart requirement; effective **NONE**.

Production today: env S4 flags off + missing kill row ⇒ **already fail-closed KILLED** for authoritative writes.

## Step 11 — Human authorization recording (next slice, not this task)

Operator authorization must **not** be inferred from deploy, env, or merge state.

Recommended artifact: **`EXP021_S4F8_EXPLICIT_OPERATOR_AUTHORIZATION_RECORD.md`** (or signed ticket reference) containing a frozen block:

```
EXP021_S4F8_OPERATOR_AUTHORIZATION_RECORD=
AUTHORIZATION_STATE=GRANTED
AUTHORIZED_BY=<human identity>
AUTHORIZED_AT=<UTC timestamp>
SCOPE_ORGANIZATION_ID=faa710c9-6d91-4079-a7d5-91fdccdec14a
SCOPE_VEHICLE_ID=c10351f8-b6a2-4258-947f-631aeaa6d359
SCOPE_CHANNEL_SET=POSITION+R1_OBD
PRODUCTION_SHA_BOUND=8fa531b275bc4dca02c09b279c0d2b806e544007
RUNTIME_REGISTRATION_SLICE=<git SHA when S4 modules registered>
NO_BACKFILL_CONTAINMENT=<watermark / trip bound id>
REVOCATION_PROCEDURE=<link to kill path>
```

Only after that record exists should `explicitOperatorAuthorization='GRANTED'` appear in **evaluator evidence** (still separate from enabling Production flags).

## Step 12 — Next action class

**`NEXT_ACTION_CLASS=ENGINEERING_OR_DEPLOY_PREREQUISITE_BEFORE_HUMAN_AUTHORIZATION`**

Rationale: granting the human gate in evidence is low risk, but **executable** Tiny Shadow requires (1) AppModule registration + S4C wiring, (2) `NOT_KILLED` DB row + scoped env allowlists, (3) **NO_BACKFILL containment**, (4) then human authorization record, (5) controlled activation runbook — in that order.

---

## Frozen result block

```
EXP021_S4F7_TINY_OPERATOR_AUTHORIZATION_PREFLIGHT_RESULT=
STARTING_MAIN_SHA=8415aeb549d8c6a6872b8884dca33be6ea9a7cd7
PRODUCTION_SHA_REFERENCE=8fa531b275bc4dca02c09b279c0d2b806e544007
PRODUCTION_RELEASE_REFERENCE=20261001035130_v4994
REPLAY_DESERIALIZER_GATE=SATISFIED
SNAPSHOT_REHASH_GATE=SATISFIED
PROVIDER_BACKPRESSURE_GATE=SATISFIED
PROVIDER_GLOBAL_BUDGET_ENABLED_GATE=SATISFIED
LOCATION_RETENTION_GOVERNANCE_GATE=SATISFIED
EXPLICIT_OPERATOR_AUTHORIZATION_GATE=NOT_SATISFIED
FROZEN_TINY_GATE_SATISFIED_COUNT=5
FROZEN_TINY_GATE_TOTAL=6
CURRENT_TINY_ACTIVATION_READY=NO
HYPOTHETICAL_OPERATOR_GRANT_EVALUATOR_STATE=READY
HYPOTHETICAL_6_OF_6_READY=YES
S4B_RUNTIME_REGISTERED=NO
S4_DISCOVERY_RUNTIME_REACHABLE=NO
S4_WORKER_RUNTIME_REACHABLE=NO
S4C_PROVIDER_ACQUISITION_RUNTIME_REACHABLE=NO
S4E_DRIFT_WATCHER_RUNTIME_REACHABLE=NO
S4_MAINTENANCE_RUNTIME_REACHABLE=NO
S4F_RUNTIME_REGISTERED=NO
OPERATOR_AUTHORIZATION_ALONE_CAN_ACTIVATE_S4=NO
PRODUCTION_S4_MASTER_STATE=OFF
PRODUCTION_S4_DISCOVERY_STATE=OFF
PRODUCTION_S4_WORKER_STATE=OFF
PRODUCTION_S4_POSITION_STATE=OFF
PRODUCTION_S4_R1_STATE=OFF
PRODUCTION_S4_NATIVE_STATE=OFF
PRODUCTION_ORG_ALLOWLIST_STATE=NONE
PRODUCTION_VEHICLE_ALLOWLIST_STATE=NONE
PRODUCTION_DB_CONTROL_ROW_STATE=MISSING
PRODUCTION_DB_KILL_STATE=KILLED_FAIL_CLOSED
PRODUCTION_S4_PIPELINE_REGISTRY_ROWS=0
PRODUCTION_S4_WORK_ITEM_ROWS=0
PRODUCTION_S4_ACTIVE_WORK_ITEM_ROWS=0
PRODUCTION_S4_EVIDENCE_SNAPSHOT_ROWS=0
PRODUCTION_S4_SHADOW_RUN_ROWS=0
PRODUCTION_S4_SHADOW_INTERVAL_ROWS=0
CODE_DEPLOY_REQUIRED_BEFORE_TINY_EXECUTION=NO
MIGRATION_REQUIRED_BEFORE_TINY_EXECUTION=NO
FIRST_TINY_ORGANIZATION_ID=faa710c9-6d91-4079-a7d5-91fdccdec14a
FIRST_TINY_VEHICLE_ID=c10351f8-b6a2-4258-947f-631aeaa6d359
FIRST_TINY_VEHICLE_LABEL=KS MS 661
FIRST_TINY_SOURCE_FAMILY=RUPTELA_R1
FIRST_TINY_ELIGIBILITY=SELECTED
FIRST_TINY_RECENT_COMPLETED_TRIP_PRESENT=YES
SECONDARY_TESLA_CANDIDATE_FOUND=YES
SECONDARY_TESLA_VEHICLE_ID=68868291-5478-42cd-b0c4-cc77b2a78e21
RECOMMENDED_FIRST_TINY_CHANNEL_SET=POSITION+R1_OBD
BACKFILL_POSSIBLE_WITH_PROPOSED_CONTROL_PLANE=YES
NO_BACKFILL_CONTAINMENT_REQUIRED=YES
FASTEST_AUTHORITATIVE_KILL_PATH=DB_GLOBAL_KILL_OR_MISSING_ROW_FAIL_CLOSED
KILL_PATH_REQUIRES_RESTART=ENV_MASTER_OFF_REQUIRES_RESTART
HUMAN_AUTHORIZATION_RECORDING_MECHANISM=EXP021_S4F8_EXPLICIT_OPERATOR_AUTHORIZATION_RECORD
HUMAN_AUTHORIZATION_GRANTED_IN_THIS_TASK=NO
PRODUCTION_MUTATION_OCCURRED=NO
NEXT_ACTION_CLASS=ENGINEERING_OR_DEPLOY_PREREQUISITE_BEFORE_HUMAN_AUTHORIZATION
FINAL_RESULT=PASS
BLOCKERS=RUNTIME_NOT_REGISTERED;DB_KILL_ROW_MISSING;NO_BACKFILL_CONTAINMENT_ABSENT
NEXT_ACTION=Implement S4 runtime registration + discovery trip-bound containment slice; then S4F-8 human authorization record; then controlled Tiny activation runbook (separate tasks)
```

## Addendum (S4F-7A, 2026-10-01) — deploy prerequisite wording correction

S4F-7 correctly recorded that S4B–F were **not** Nest-registered on Production at `8fa531b27…`. The field `CODE_DEPLOY_REQUIRED_BEFORE_TINY_EXECUTION=NO` referred to **absence of new S4 core algorithm/schema** on main, not absence of a **deploy** carrying runtime wiring.

| Qualified field | Value |
|-----------------|--------|
| `NEW_S4_SCHEMA_REQUIRED_BEFORE_TINY_EXECUTION` | **NO** |
| `EXISTING_S4_FEATURE_IMPLEMENTATION_PRESENT` | **YES** (main) |
| `NEW_RUNTIME_WIRING_CODE_CHANGE_REQUIRED` | **YES** (S4F-7A) |
| `NEW_PRODUCTION_DEPLOY_REQUIRED_BEFORE_TINY_EXECUTION` | **YES** |
| `CURRENT_PRODUCTION_RUNTIME_WIRING_PRESENT` | **NO** (until dormant deploy preflight) |
| `MIGRATION_REQUIRED_BEFORE_TINY_EXECUTION` | **NO** |

Evidence: [EXP021_S4F7A_TINY_EXECUTION_PREREQUISITES_ENGINEERING.md](./EXP021_S4F7A_TINY_EXECUTION_PREREQUISITES_ENGINEERING.md).
