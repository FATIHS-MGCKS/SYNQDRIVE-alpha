# EXP-021 S4F-7AS — Minimal Gate-6 OPEN / EMERGENCY_REKILL operator (engineering)

**Date (UTC):** 2026-10-09  
**Scope:** Operator tooling only — two explicit DB control modes on the existing `di_v0_s4_control` **GLOBAL** row. **No** Production execution, deploy, env mutation, or replica restart in this slice.

## Modes

| Mode | Transition | Guards |
|------|------------|--------|
| **OPEN** | `KILLED` → `NOT_KILLED` | Human Gate-6 ack + authorization, production SHA/release/env pins, five S4 flags ON, native OFF, pilot allowlists, topology/budget/APDS shadow preflight, replica attestation parity, explicit `DRY_RUN` path; **no** insert when GLOBAL row missing |
| **EMERGENCY_REKILL** | `NOT_KILLED` → `KILLED` | Emergency ack + audit fields only; **not** blocked by OPEN readiness / S4 runtime health |

The certified S4F-7F kill **initializer** is unchanged and must not be repurposed for OPEN.

## Pilot scope (exact)

| Pin | Value |
|-----|--------|
| Organization | `faa710c9-6d91-4079-a7d5-91fdccdec14a` |
| Vehicle | `c10351f8-b6a2-4258-947f-631aeaa6d359` |
| `DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE` | `2026-10-09T07:03:05.861Z` |

## Entrypoints

| Path | Role |
|------|------|
| `backend/scripts/ops/di-v0-s4-gate6-open-rekill-production.sh` | Wrapper — `DI_S4_GATE6_OPERATOR_MODE=OPEN\|EMERGENCY_REKILL` |
| `backend/scripts/ops/di-v0-s4-gate6-open-rekill-production/*` | TypeScript guards, CLI (`guards-open`, `dry-run-open`, `live-open`, `live-rekill`, `read-global`) |
| `backend/scripts/ops/lib/di-v0-s4-gate6-open-rekill-production.lib.sh` | Production preflight bridge (reuses S4F-7J / S4F-7AO topology + budget helpers) |
| `backend/src/modules/vehicle-intelligence/driving-intelligence/s4a-foundation/di-v0-s4-global-kill-transition.ts` | Transactional `SELECT … FOR UPDATE` state transitions + dry-run rollback |

## OPEN authorization contract (fail-closed)

- `DI_S4_GATE6_OPEN_ACK=YES`
- `DI_S4_GATE6_OPEN_AUTHORIZED=YES` (distinct from five-flag authorization)
- Production pins: `DI_S4_TINY_STAGING_REQUIRED_SHA`, `REQUIRED_RELEASE_ID`, `REQUIRED_PRE_ENV_SHA256`
- `DRY_RUN=1` for engineering preflight; live OPEN requires separate human Gate-6 grant (**not** satisfied in this slice)

## EMERGENCY_REKILL contract

- `DI_S4_GATE6_EMERGENCY_REKILL_ACK=YES`
- `DI_S4_GATE6_OPERATOR_REASON` / `DI_S4_GATE6_OPERATOR_ACTOR` required
- No full OPEN preflight; proves only GLOBAL row transition + audit fields

## Minimal monitoring (post-activation reference)

Use existing logs, metrics, and SQL — constants in `GATE6_MONITORING_QUERIES` / `GATE6_ABORT_CONDITIONS` in the Gate-6 lib:

- GLOBAL kill state
- Effective S4 enablement on replicas A/B (metrics attestation)
- Pilot work items / snapshots / unexpected tenant rows
- Provider budget + backpressure signals
- Replica health

**Abort:** invoke `EMERGENCY_REKILL` immediately; **no** automatic re-OPEN after rekill.

## Engineering validation

| Suite | Command |
|-------|---------|
| Operator guards + fixture wrapper | `npm run test:di:s4f7as:gate6-open-rekill-operator` (**11** cases) |
| PostgreSQL transitions | `npm run test:di:s4f7as:gate6-kill-transition:postgres` (included in S4A Postgres CI when `DI_V0_S4A_POSTGRES_INTEGRATION=1`) |

## Execution status (this slice)

| Field | Value |
|-------|--------|
| `PRODUCTION_MUTATION` | **NO** |
| `PRODUCTION_ENV_MUTATION` | **NO** |
| `PRODUCTION_RESTART` | **NO** |
| `GLOBAL_KILL` | **KILLED** (unchanged on Production) |
| `GATE6_GRANTED` | **NO** |
| `S4_ACTIVATED` | **NO** |
| `OPEN_OPERATOR_READY` | **YES** (engineering + tests; not Production-certified) |
| `EMERGENCY_REKILL_READY` | **YES** (engineering + tests; not Production-certified) |

## Next safe action

Human Gate-6 authorization + pinned Production SHA/release/env + read-only preflight on both replicas → single authorized `DRY_RUN=1` OPEN dispatch, then separate live OPEN only after explicit second grant (out of scope here).
