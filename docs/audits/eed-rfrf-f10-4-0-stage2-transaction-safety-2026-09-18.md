# RFRF F10.4.0 — Stage-2 transaction / recovery safety closure

**Evidence ID:** EED-EV-0067  
**Class:** OPS+DOC  
**Date:** 2026-09-18  
**Maturity:** PROVEN_BY_TOOLING_TEST  

## Summary

| Field | Value |
|-------|-------|
| **RFRF_F10_4_0_STAGE2_TRANSACTION_SAFETY** | PASS (tooling) |
| **STAGE_2_EXECUTED** | NO |
| **STAGE_2_START_AUTHORIZED** | NO |
| **READY_FOR_STAGE2_AUTHORIZATION_GATE** | NO (requires F10.4.1 boundary audit + operator authorization) |
| **PRODUCTION_MUTATED** | NO |

Hardened RFRF staged enablement so **Stages 1–6** share one transactional controller (`rfrf_stage_transaction_run`) with recovery armed before first mutation, byte-identical env restore, dual-replica recovery restart, PRE/POST cross-workstream completeness, and immediate EXP-021/VDC survival gates. Stage-2 recovery restores **Stage 1** (not Stage 0). Stage-2 rollback path upgraded for `--from-stage 2`.

## Production baseline (unchanged)

| Role | Value |
|------|-------|
| **PRODUCTION_RUNTIME_SHA** | `ca7bad8826871376a58efaa874f12992b88c4a04` |
| **PRODUCTION_RELEASE** | `20260918085306_v4994` |
| **RFRF_PRODUCTION_STAGE** | 1 |
| **CUTOVER_AT** | `2026-09-18T10:25:41.000Z` |
| **VDC pilot T0** | `2026-09-18T09:33:25.000Z` |

Tooling developed on main `c3da35301aae4cc3a8f807edf73b3dd6d4261eb3` — **not deployed** to Production in this workstream.

## Stage-2 expected authority (rollout lib)

| Flag | Stage 2 |
|------|---------|
| `RAW_FUEL_REFUEL_FALLBACK_ENABLED` | true |
| `RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED` | false/absent |
| `RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED` | false/absent |
| `RFRF_FALLBACK_PROMOTION_EXECUTION_AUTHORIZED` | false/absent |
| `RFRF_FALLBACK_G2_HANDOFF_AUTHORIZED` | false/absent |
| `RAW_FUEL_REFUEL_FALLBACK_CUTOVER_AT` | required valid (immutable vs Stage 1) |

**Required predecessor:** Stage 1 only (`current + 1`).

## Stage-2 runtime semantics (master-only)

Verified via `raw-fuel-refuel-fallback-runtime.service.ts` and unit test `master=true persist=false detects but does not persist`:

| Reachability | Answer |
|--------------|--------|
| Raw detector / dark execution | YES |
| Candidate persistence | NO |
| Fallback VEE | NO |
| Convergence | NO |
| Promotion | NO |
| G2 handoff | NO |

## Transaction / recovery

| Contract | Result |
|----------|--------|
| Generic stage transaction | YES (stages 1–6) |
| Stage-1 regression preserved | YES |
| Recovery armed before first mutation | YES |
| Recovery restores previous stage | YES |
| Stage-2 recovery target | Stage 1 |
| Cutover mutation on Stage-2 enable | NO |
| SIGKILL limitation documented | YES |

## F10.4.1 boundary audit (tooling contract only)

| Field | Value |
|-------|-------|
| **STAGE2_BOUNDARY_AUDIT_REQUIRED** | YES |
| **CUTOVER_AGE_AT_STAGE1_MUTATION_SECONDS** | 48 |

No live Production boundary audit performed in F10.4.0.

## Validation

- `backend/scripts/test/rfrf-f10-stage1-restart-safety-tests.sh` — PASS  
- `backend/scripts/test/rfrf-f10-stage2-transaction-safety-tests.sh` — PASS  
- `backend/scripts/test/rfrf-f10-stage2-authority-matrix-tests.sh` — PASS  
- `backend/scripts/test/rfrf-f10-stage2-rollback-fixture-tests.sh` — PASS  
- F10 operational tooling gate — run in PR CI  

## F10.4.0.1 review corrections (same evidence record)

| Finding | Fix |
|---------|-----|
| Stage-2 dry-run test vacuous | PRE/POST env SHA captured before/after dry-run; backup/restart markers |
| Rollback dry-run skipped source-stage verify | Dry-run validates exact `--from-stage` matrix before PASS |
| Rollback partial restart mixed authority | Fail-closed convergence: restore pre-mutation when no replica converged; stop stale replica when one converged |
| Exact PRE stage gate | `rfrf_assert_exact_pre_stage_before_mutation` before backup/mutation (stages 1–6) |

Stage 2 **NOT executed**. Stage 2 **NOT authorized**.

- **EED-EV-0066** — Stage-1 Production execution  
- **EED-EV-0065** — Stage-1 transaction / evidence completeness  

## Explicit non-changes

- RFRF business runtime semantics unchanged  
- EXP-021 runtime unchanged  
- VDC runtime unchanged  
- Prisma schema / migrations unchanged  
