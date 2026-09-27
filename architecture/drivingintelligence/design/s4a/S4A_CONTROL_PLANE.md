# S4A — Control plane, allowlists, DB kill row, pipeline retirement (P1-D, C1D.10C)

**Contract:** `controlPlane`, `pipelineRetirement`, `activationGates` in [`s4a-contract.v2.json`](s4a-contract.v2.json) · **Parent:** [S4A_CONTRACT_DESIGN.md](S4A_CONTRACT_DESIGN.md) · **Evidence:** [EXP021_C1D10C_AUTHORITY_CLOSURE.md](../../evidence/EXP021_C1D10C_AUTHORITY_CLOSURE.md) · **Validator scenarios:** `fixtures.controlPlaneScenarios` (23), races R15–R21

> DESIGN ONLY · nothing here is read by any code today. The S4A slice creates the tables, S4B+ reads them. No flag, allowlist or row exists in Production.

**Why this file exists.** C1D.10A specified one "kill switch open" guard backed by an env flag. C1D.10B (P1-D) found that per-channel flags, allowlist semantics and the DB kill row were not formally specified. This file freezes them.

## 1. Flags (all default OFF)

Parsing follows the repository convention `parseBooleanEnv(value, false)` (as in `backend/src/config/driving-intelligence-v2.config.ts`). A missing, empty or unrecognized value keeps the default `false`. Only `1`/`true`/`yes`/`on` (case-insensitive) enable a flag.

| Flag | Kind | Gates | Default |
|------|------|-------|---------|
| `DI_V0_S4_MASTER_ENABLED` | master | every S4 actor | `false` |
| `DI_V0_S4_DISCOVERY_ENABLED` | role | T01 (discovery) | `false` |
| `DI_V0_S4_WORKER_ENABLED` | role | T02, T04, T05, T06, T13 | `false` |
| `DI_V0_S4_POSITION_ENABLED` | channel, **mandatory** | every executable run | `false` |
| `DI_V0_S4_R1_ENABLED` | channel, optional | R1 outcome: off → `DISABLED` | `false` |
| `DI_V0_S4_NATIVE_ENABLED` | channel, optional | native outcome: off → `DISABLED` | `false` |

**Position is mandatory.** `DI_V0_S4_POSITION_ENABLED=false` means no executable S4 run: discovery creates nothing and claims are refused. R1 and native are optional. Their flag state enters `channelEnablement` in the pipeline version key, so enabling a channel creates a new pvk and never reinterprets existing items. A channel flag that is off forces its outcome to `DISABLED`; `NOT_APPLICABLE` is reserved for "flag on, family does not apply" (validator `channelRunScenarios`).

## 2. Effective enablement

```
effectiveEnabled(role, workItem) =
      MASTER
  AND ROLE_FLAG(role)                       -- DISCOVERY for T01, WORKER for T02/T04/T05/T06/T13
  AND POSITION
  AND workItem.organization_id ∈ orgAllowlist
  AND workItem.vehicle_id      ∈ vehicleAllowlist
  AND vehicles.organization_id(workItem.vehicle_id) = workItem.organization_id
  AND dbKillState = NOT_KILLED
```

Maintenance actors (reaper T10, drift watcher T11, retirement reaper T12) require `MASTER AND dbKillState = NOT_KILLED`.

**While KILLED** (`kill_state=KILLED`, or row missing / unreadable / malformed — all fail closed), **no authoritative S4 mutation may proceed** except **`T07_FAIL_RETRYABLE`** by the current lease holder with a still-valid fence. T07 is a safe relinquish only: it **clears** the lease and moves to `FAILED_RETRYABLE` with retry backoff. It must **not** extend the lease, claim work, pin evidence, persist S2, complete, fail terminal, skip, supersede, create a successor, or perform provider I/O. Every other transition **T01–T06** and **T08–T13** carries guard `CONTROL_PLANE_DB_NOT_KILLED` and is rejected when killed (contract races **K01–K18**, validator-enforced write-set in `authoritativeWrites` + `killPolicy`). **AMENDED BY C1D.10E (2026-09-27):** C1D.10C incorrectly allowed T03 heartbeat, T08 and T09 while killed; closed in contract v2 amendment without bumping execution identity.

No DB value can turn any env term from false to true: `dbCanEnable=false`. Operator updates to `di_v0_s4_control` use a separate write class (`W_CONTROL_ROW_OPERATOR_UPDATE`) and serialize against holder transactions via `FOR UPDATE` on the control row.

## 3. Allowlists (independent, intersection)

`DI_V0_S4_ORGANIZATION_ALLOWLIST` and `DI_V0_S4_VEHICLE_ALLOWLIST`: comma-separated exact IDs matching `^[A-Za-z0-9_-]{1,128}$`. All 13 Production organization and vehicle IDs match this pattern, including the 2 non-UUID IDs. Both lists must admit the item.

| Situation | Result |
|-----------|--------|
| org list empty | **NONE** (never ALL) |
| vehicle list empty | **NONE** |
| both empty | NONE |
| org allowed, vehicle not allowed | disabled |
| vehicle allowed, org not allowed | disabled |
| any malformed entry (pattern mismatch, whitespace inside, `*`) | the **whole list is invalid → NONE** |
| duplicate entries | set semantics (harmless) |
| vehicle belongs to a different org than the work item's org | disabled (vehicle-org match term) |
| wildcard | forbidden; a future contract version must introduce it explicitly |

Matching uses the repository-resolved `organization_id` (trip → vehicle → organization), never a caller-supplied value.

## 4. DB kill row (disable-only)

Table `di_v0_s4_control` (created by S4A, **no seed row**):

| Column | Type |
|--------|------|
| `id` | text PK, `CHECK (id = 'GLOBAL')` |
| `kill_state` | text NOT NULL, `CHECK (kill_state IN ('KILLED','NOT_KILLED'))` |
| `reason` | text NOT NULL |
| `actor` | text NOT NULL |
| `updated_at` | timestamptz NOT NULL DEFAULT now() |

| Rule | Value |
|------|-------|
| row can disable S4 | yes (`KILLED`) |
| row can enable S4 when env is OFF | **no**: the row has no enable column; it is one AND-term |
| missing row / read error / parse error / unknown value | **KILLED** (fail closed) |
| where read | inside **every** authoritative transition's transaction (all T01–T13 except T07 omits the kill guard but T07 still runs inside a tx); `SELECT … FOR UPDATE` on `di_v0_s4_control` before mutation |
| cache | may only report KILLED; a cache never re-enables after a kill |
| scope | global: one row read by both replicas, so a committed kill applies to every replica's next gated transaction |
| writer | operator SQL runbook only; no API, no customer path |
| audit | `reason`, `actor`, `updated_at` on every write |

Because the migration seeds nothing, a freshly migrated database is effectively KILLED. Activation needs a separate, authorized operator insert of `NOT_KILLED` **in addition to** env flags and allowlists.

`DB_KILL_ROW_DISABLE_ONLY = YES` · `DB_KILL_ROW_READ_FAILURE_FAILS_CLOSED = YES`

## 5. Pipeline-version registry and retirement

Table `di_v0_s4_pipeline_versions` (`pipeline_version_key` PK, `manifest` jsonb, `status` ACTIVE|RETIRED, `registered_at`, `retired_at`, `retired_by`, `retired_reason`). Work items reference it by FK. A trigger forbids RETIRED→ACTIVE.

| Question | Answer |
|----------|--------|
| who registers | discovery upserts ACTIVE for its own pvk before T01 |
| who retires | an operator runbook sets RETIRED (audited) when no supported replica will ever run that pvk again |
| who detects | the leader-guarded retirement reaper (S4E) scans non-terminal items whose pvk is RETIRED |
| transition | T12_RETIRE: PENDING / FAILED_RETRYABLE / expired-LEASED → SUPERSEDED(`PIPELINE_RETIRED`), epoch +1, **no successor** |
| a valid lease exists | T12 waits until the lease expires (race R21) |
| evidence and S2 history | preserved (supersession never deletes) |
| successor work | none automatically; the new pvk's discovery creates its own PRIMARY (the active-PRIMARY unique is per pvk) |
| cross-version processing | impossible: T02/T04/T06 require `PIPELINE_VERSION_MATCH` and an ACTIVE registry row |

**Temporarily no replica** (registry ACTIVE, no running replica computes the key, for example mid-rollout) is not retirement: the item waits unchanged, and S4F exposes a liveness metric. **Retired** is an explicit registry fact. The two are never inferred from each other.

## 6. Activation gates (contract `activationGates`)

| Gate | Requires |
|------|----------|
| S4A dormant schema merge | S2 tables empty, all flags default OFF, no runtime caller |
| Replay-capable shadow | DI-GAP-S4-REPLAY-DESERIALIZER-001 closed, snapshot re-hash verification implemented |
| Tiny activation | the above, DI-GAP-S4-PROVIDER-BACKPRESSURE-001 closed, location retention governance note, explicit operator authorization |
| Native channel enable | DI-GAP-S4-NATIVE-READINESS-001 and DIM-GAP-007 closed, channel policy V2 |
