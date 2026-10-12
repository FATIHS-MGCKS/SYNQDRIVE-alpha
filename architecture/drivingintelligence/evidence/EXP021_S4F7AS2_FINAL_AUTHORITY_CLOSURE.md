# EXP-021 S4F-7AS.2 — Final OPEN authority and unknown-commit closure

**Date (UTC):** 2026-10-09  
**PR:** #1949 (engineering)  
**Scope:** Close P0-A unknown OPEN commit recovery and P0-B CLI authority boundary — **no** Production execution.

## P0-A — Unknown OPEN commit

- `runOpenTransaction` / `runRekillTransaction` classify `SUCCESS`, `REFUSED`, or `COMMIT_OUTCOME_UNKNOWN` on transaction exceptions.
- On `COMMIT_OUTCOME_UNKNOWN`, OPEN is **never** retried automatically.
- Recovery uses independent `readGlobalKillState` queries; `attemptCompensatingRekillToKilled` runs EMERGENCY_REKILL when not proven `KILLED`, with explicit exception capture on the compensating path.
- Success outcomes require proven `KILLED` via post-read; otherwise `CRITICAL_RECOVERY_STATE` (nonzero exit).
- Distinct outcomes: `OPEN_COMMIT_UNKNOWN_ALREADY_KILLED` vs `OPEN_COMMIT_UNKNOWN_REKILL_VERIFIED_KILLED`.

## P0-B — CLI authority boundary

- Removed env-computable dispatch digest (`DI_S4_GATE6_LIVE_OPEN_DISPATCH_DIGEST` / `NONCE`) from authority path; keys blocked on Production canonical path.
- Wrapper issues HMAC one-shot dispatch token file (`issue-dispatch-token`); `live-open-authorized` consumes token once then re-verifies trusted Production pins from filesystem `realpath` env hash + DB GLOBAL `KILLED` prestate + Gate-6 guards.
- `EMERGENCY_REKILL` (`live-rekill`) unchanged — no OPEN readiness required.

## Tests

- `npm run test:di:s4f7as:gate6-open-rekill-operator` — orchestration unknown-commit matrix, dispatch token one-shot, trusted path resolution, CLI bypass rejection.
- S4A Postgres CI — full integration suite unchanged contract.

## Status

| Field | Value |
|-------|--------|
| `PRODUCTION_MUTATION` | **NO** |
| `GATE6_GRANTED` | **NO** |
| `GLOBAL_KILL` | **KILLED** (Production unchanged) |
