# EXP-021 S4F-7E — Production DB GLOBAL kill initialization preflight (read-only)

**Audit date:** 2026-10-02 (UTC)  
**Repository `main`:** `f25336d2fb4528876edc4260f7fc972d6bfa35ac` (post merged PR #1879 S4F-7D evidence)  
**Required Production SHA:** `ee9588548845c8077aa0cba0684b06eac7c9d4d2`  
**Production release:** `20261002014651_v4994`  
**Scope:** Read-only Production VPS + Postgres + repository audit. **No** `di-v0-s4-initialize-global-kill-row.ts` execution, **no** Production DB writes, **no** deploy/restart/env/migrations/S4 flags/Tiny.

**Prior gates:** [S4F-7D](EXP021_S4F7D_DORMANT_PRODUCTION_DEPLOY_RESULT.md) dormant deploy; [S4F-7A](EXP021_S4F7A_TINY_EXECUTION_PREREQUISITES_ENGINEERING.md) kill initializer engineering.

## 1 — Live Production re-anchor

| Check | Result |
|-------|--------|
| `CURRENT_PRODUCTION_SHA` | `ee9588548845c8077aa0cba0684b06eac7c9d4d2` (**matches required**) |
| `CURRENT_PRODUCTION_RELEASE_ID` | `20261002014651_v4994` |
| `REPLICA_A_HEALTH` / `REPLICA_B_HEALTH` | **OK** / **OK** (ports 3001 / 3002) |
| `REPLICA_A_SHA` / `REPLICA_B_SHA` | `ee9588548845…` each — **inferred from** `/opt/synqdrive/current` release tree (health JSON does not expose `gitSha`; dual-replica same `current` symlink + both healthy) |
| `NO_MIXED_SHA` | **YES** |
| `SCHEDULER_SINGLE_LEADER` | **YES** (`leader_count=1`) |
| `NGINX_DUAL_UPSTREAM` | **YES** |
| `RESTART_LOOP_DETECTED` | **NO** (heuristic; no restart storm observed) |

**Block rule:** If Production SHA ≠ `ee958854…` → **BLOCK** (not triggered).

## 2 — Dormant environment (re-hashed)

| Check | Result |
|-------|--------|
| `PRODUCTION_BACKEND_ENV_SHA256` | `6ea36831d58d9182877936beaa183e5a0024b766a4c195df9d94d261c639a1d7` (**matches expected**) |
| S4 enable keys (`MASTER`, `DISCOVERY`, `WORKER`, `POSITION`, `R1`, `NATIVE`) | **MISSING** → effective **false** |
| Org / vehicle allowlists | **MISSING** → **NONE** |
| `DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE` | **MISSING** |
| `DIMO_GLOBAL_BUDGET_ENABLED` | **TRUTHY** (`EXPLICIT_ENABLED`) |
| `GLOBAL_BUDGET_ACTIVE_RUNTIME_STATE` | **CONFIRMED_ENABLED** (Redis **PONG**) |
| `REDIS_REACHABLE` | **YES** |

Unexpected truthy S4 flag or non-empty allowlist → **BLOCK** (not triggered).

## 3 — S4 zero-state (Production Postgres read-only)

| Metric | Value |
|--------|--------|
| `GLOBAL_CONTROL_ROW_COUNT` | **0** |
| `GLOBAL_CONTROL_ROW_STATE` | **MISSING** |
| `EFFECTIVE_KILL_STATE` | **KILLED_FAIL_CLOSED** (S4A control plane: missing GLOBAL → killed) |
| `S4_PIPELINE_REGISTRY_ROWS` | **0** |
| `S4_WORK_ITEM_ROWS` | **0** |
| `S4_ACTIVE_WORK_ITEM_ROWS` | **0** |
| `S4_EVIDENCE_SNAPSHOT_ROWS` | **0** |
| `S4_SHADOW_RUN_ROWS` | **0** |
| `S4_SHADOW_INTERVAL_ROWS` | **0** |

If GLOBAL existed as `KILLED` → future init would be **idempotent** (`ALREADY_KILLED`). If `NOT_KILLED` → **BLOCK** (not present).

## 4 — Production schema (`di_v0_s4_control`)

| Item | Production fact |
|------|-----------------|
| `CONTROL_TABLE_PRESENT` | **YES** |
| Columns | `id` text NOT NULL; `kill_state` text NOT NULL; `reason` text NOT NULL; `actor` text NOT NULL; `updated_at` timestamptz NOT NULL DEFAULT `now()` |
| `GLOBAL_ID_UNIQUE_AUTHORITY` | **PRIMARY KEY (`id`)** + **CHECK (`id = 'GLOBAL'`)** |
| `KILL_STATE_SCHEMA_TYPE` | `text` + **CHECK** `kill_state IN ('KILLED','NOT_KILLED')` |
| `KILL_STATE_ALLOWED_VALUES` | `KILLED`, `NOT_KILLED` |
| `REASON_COLUMN_COMPATIBLE` | **YES** (NOT NULL text — initializer supplies string) |
| `ACTOR_COLUMN_COMPATIBLE` | **YES** (NOT NULL text) |
| Foreign keys | **none** on table |
| Indexes | `di_v0_s4_control_pkey` only |
| `UNEXPECTED_CONTROL_TABLE_TRIGGER_COUNT` | **0** |

Initializer `INSERT (id, kill_state, reason, actor)` is compatible with live schema; `updated_at` defaults on insert.

## 5 — Initializer audit @ deployed SHA `ee958854…`

Files present on release tree and at `ee958854…` in git:

- `backend/scripts/ops/di-v0-s4-initialize-global-kill-row.ts`
- `backend/src/modules/vehicle-intelligence/driving-intelligence/s4a-foundation/di-v0-s4-control-kill-initializer.ts`

| Semantics | Confirmed |
|-----------|-----------|
| Missing GLOBAL | `INSERT … KILLED` → `INSERTED_KILLED` |
| Existing `KILLED` | `ALREADY_KILLED` |
| Existing `NOT_KILLED` | `REFUSED_NOT_KILLED` (exit 1) |
| Malformed / missing after race | `REFUSED_MALFORMED` |
| `ON CONFLICT DO NOTHING RETURNING` + follow-up `FOR UPDATE` | **YES** — single transaction |
| Can create `NOT_KILLED` | **NO** |
| Can UPDATE existing row | **NO** (read + insert-only path) |
| Deletes / S4 flags / provider / work items | **NO** |
| Bootstrap invocation | **NO** — `initializeDiV0S4GlobalKillRow` references: ops CLI, postgres integration tests, dormant audit allowlist only → **`INITIALIZER_BOOTSTRAP_CALL_SITE_COUNT=0`** |

## 6 — Concurrency tests (isolated PostgreSQL only)

Command (cloud agent workspace, **not** Production):

`cd backend && npm test -- --testPathPattern=di-v0-s4-control-kill-initializer.postgres`

| Test | Result |
|------|--------|
| Missing row → `INSERTED_KILLED`; repeat → `ALREADY_KILLED` | **PASS** |
| Concurrent missing row | **PASS** — outcomes `INSERTED_KILLED` + `ALREADY_KILLED`; `FINAL_GLOBAL_ROW_COUNT=1`; `FINAL_GLOBAL_STATE=KILLED` |
| Existing `NOT_KILLED` | **PASS** — `REFUSED_NOT_KILLED` |

## 7 — Operator execution path (Production safety)

Raw path today: `npx ts-node backend/scripts/ops/di-v0-s4-initialize-global-kill-row.ts` with optional `DI_S4_KILL_INIT_ACTOR` / `DI_S4_KILL_INIT_REASON`.

**No** dedicated Production wrapper script (unlike S4F-7B preflight / deploy SHA guards).

| Guard | Present on raw CLI? |
|-------|---------------------|
| Exact Production SHA | **NO** |
| Expected release ID | **NO** |
| Expected env SHA256 | **NO** |
| GLOBAL pre-state (`MISSING` or `KILLED`) | **NO** |
| Explicit human ACK | **NO** |
| Actor pin | **PARTIAL** (env var, not guarded) |
| Reason pin | **PARTIAL** (env var, not guarded) |

`PRODUCTION_EXECUTION_WRAPPER_REQUIRED=YES` — not classified as initializer defect; ops hardening gap.

**Smallest safe ops-only slice (future engineering, not executed here):**

1. `backend/scripts/ops/di-v0-s4f7e-production-global-kill-init.sh` (or equivalent) run **on VPS** against `/opt/synqdrive/current`.
2. Fail closed unless: `git rev-parse HEAD` = pinned `ee958854…` (or successor after new audit); `basename $(readlink current)` = pinned release; `sha256sum backend.env` = pinned hash; all S4 flags absent/false; allowlists absent; GLOBAL count 0 or `KILLED`; S4 table counts 0; `DI_S4_KILL_INIT_ACK=I_UNDERSTAND_PRODUCTION_GLOBAL_KILL_INIT` (or similar); required `DI_S4_KILL_INIT_ACTOR` + `DI_S4_KILL_INIT_REASON`.
3. Invoke initializer once; read back GLOBAL; re-check counts + env hash; print evidence block; **no** activation flags.

## 8 — Preferred future execution design (conceptual)

1. Verify Production SHA, release, env hash, S4 flags OFF, allowlists NONE, GLOBAL pre-state, S4 counts zero.  
2. Require explicit human ACK + pinned actor/reason.  
3. Run initializer once.  
4. Verify `id=GLOBAL`, `kill_state=KILLED`; re-prove counts, provider delta 0, env unchanged, health/topology.  
5. Stop — **no** S4/Tiny activation.

## 9 — Mutation blast radius

| Allowed delta | Value |
|---------------|--------|
| `ALLOWED_TABLE_MUTATION_COUNT` | **1** |
| `ALLOWED_TABLE` | `di_v0_s4_control` |
| `ALLOWED_ROW_ID` | `GLOBAL` |
| `ALLOWED_KILL_STATE` | `KILLED` |

No other DB/env/process mutation authorized by this initializer.

## 10 — Effective-security monotonicity

| Invariant | Value |
|-----------|--------|
| Before | `MISSING` → **KILLED_FAIL_CLOSED** |
| After intended init | explicit **`KILLED`** → still **cannot enable** S4 (requires `NOT_KILLED` + flags + allowlists + runtime) |
| `INITIALIZATION_ENABLES_S4` | **NO** |
| `INITIALIZATION_WEAKENS_FAIL_CLOSED_STATE` | **NO** |
| `INITIALIZATION_MAKES_KILL_AUTHORITY_EXPLICIT` | **YES** |
| `POST_INIT_EXPECTED_EFFECTIVE_KILL_STATE` | **KILLED** |

## 11 — Tiny gate impact

Kill-row init is **orthogonal** to frozen Tiny evaluator gate #6 (`explicitOperatorAuthorizationGate`).

Post-init expectation unchanged:

- `FROZEN_TINY_GATE_SATISFIED_COUNT=5` / `FROZEN_TINY_GATE_TOTAL=6`
- `EXPLICIT_OPERATOR_AUTHORIZATION_GATE=NOT_SATISFIED`
- `TINY_ACTIVATION_READY=NO`

## 12 — Rollback semantics

| Outcome | Handling |
|---------|----------|
| `INSERTED_KILLED` / `ALREADY_KILLED` | **Desired safe state** — do **not** delete GLOBAL row as “rollback” |
| `REFUSED_NOT_KILLED` / `REFUSED_MALFORMED` | **STOP** — investigate; remain fail-closed |
| Transaction / connection failure | **STOP** — no compensating delete |
| Post-write verification mismatch | **STOP** — preserve evidence; no opportunistic mutation |

## 13 — Readiness decision

| Field | Value |
|-------|--------|
| Initializer semantics | **SAFE** for intended `MISSING` → `KILLED` |
| Guarded Production execution path | **MISSING** |
| `DB_KILL_INITIALIZATION_READINESS` | **BLOCKED** |
| `BLOCKER` | `PRODUCTION_EXECUTION_WRAPPER_REQUIRED` |
| `FINAL_RESULT` | **BLOCKED** (preflight complete; execution not authorized) |
| `NEXT_ACTION` | `IMPLEMENT_MINIMAL_PRODUCTION_KILL_INITIALIZER_WRAPPER_WITH_EXACT_SHA_RELEASE_ENV_PRESTATE_AND_ACK_GUARDS` |

## Prohibitions observed (this task)

`PRODUCTION_MUTATION_OCCURRED=NO` · `PRODUCTION_DB_WRITE_OCCURRED=NO` · `PRODUCTION_ENV_MUTATION_OCCURRED=NO` · `PRODUCTION_RESTART_OCCURRED=NO` · `DEPLOY_OCCURRED=NO`
