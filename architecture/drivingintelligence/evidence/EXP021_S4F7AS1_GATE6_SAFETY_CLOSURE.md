# EXP-021 S4F-7AS.1 — Gate-6 OPEN / REKILL safety closure

**Date (UTC):** 2026-10-09  
**PR:** #1949 (engineering)  
**Scope:** Close P0 safety gaps on S4F-7AS operator — **no** Production execution.

## P0 — Post-commit recovery

- Live OPEN uses CLI command `live-open-authorized` only (wrapper-issued one-shot dispatch digest).
- After commit, orchestration verifies GLOBAL `NOT_KILLED`.
- On post-read failure or unexpected state, compensating `EMERGENCY_REKILL` runs inside orchestration; success requires proven `KILLED`.
- `CRITICAL_RECOVERY_STATE=YES` when KILLED cannot be proven — never treat `FAIL_CLOSED` alone as deactivated runtime proof.
- No automatic OPEN retry; OPEN and REKILL outcomes logged separately.
- Successful live OPEN emits `GLOBAL_KILL_OPENED=YES` (not `S4_ACTIVATION_OCCURRED=NO`).

## P0 — CLI authority bypass closed

- `live-open` direct subcommand → `DIRECT_CLI_LIVE_OPEN_FORBIDDEN=YES`.
- `live-open-authorized` re-evaluates full Gate-6 guards + dispatch digest + non-empty audit fields before DB mutation.

## P0 — Production test isolation

- Canonical `SYNQDRIVE_BACKEND_ENV_CANONICAL` via `readlink -f` (symlink bypass closed).
- Production path rejects `DI_S4F7J_FIXTURE_MODE`, `DI_S4F7AS_FIXTURE_*` metrics bodies, and related harness env vars.
- Fixture metrics fetch disabled on canonical Production `backend.env`.

## Tests

- `npm run test:di:s4f7as:gate6-open-rekill-operator` — orchestration recovery + authority + CLI bypass (22).
- S4A Postgres CI includes kill-transition integration (+9 cases).

## Status

| Field | Value |
|-------|--------|
| `PRODUCTION_MUTATION` | **NO** |
| `GATE6_GRANTED` | **NO** |
| `GLOBAL_KILL` | **KILLED** (Production unchanged) |
