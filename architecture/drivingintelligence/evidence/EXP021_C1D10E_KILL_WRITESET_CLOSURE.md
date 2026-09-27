# EXP-021 C1D.10E — DB kill write-set + exhaustive control-plane validation (P1-E)

**Date:** 2026-09-27 · **PR:** #1810 (not merged) · **Starting head:** `1837efc7254c57975e73038febef0fcdd3e4a9bf`

> CONTROLLED AUTHORITY AND VALIDATOR CHANGE ONLY · NO RUNTIME · NO PRODUCTION WRITE

## 1. C1D.10D finding (P1-E)

C1D.10D re-seal found: `controlPlane.writesAllowedWhileDisabled=[T07]` and [S4A_CONTROL_PLANE.md](../design/s4a/S4A_CONTROL_PLANE.md) stated only T07 may write while disabled, but **T03_HEARTBEAT**, **T08_FAIL_TERMINAL** and **T09_SKIP_INELIGIBLE** lacked `CONTROL_PLANE_DB_NOT_KILLED`. The race model therefore allowed lease extension and terminal/skip writes after `kill`.

## 2. Closure

| Item | Result |
|------|--------|
| Kill semantics | `killPolicy.killedWhen` = active / missing / unreadable / malformed → **KILLED**; `writesAllowedWhileKilled` = **`[T07_FAIL_RETRYABLE]`** only |
| Transitions | T01–T06, T08–T13 include guard **`CONTROL_PLANE_DB_NOT_KILLED`**; T07 explicitly omits it (safe relinquish: `lease=CLEAR`, no S2, no evidence) |
| Write-set registry | **`authoritativeWrites`**: 19 classified writes (`AUTHORITATIVE_WRITE_CLASS_COUNT=19`, `UNCLASSIFIED_AUTHORITATIVE_WRITE_COUNT=0`) |
| Serialization | `killCheckSameTxAsAuthoritativeWrite=true`; control row `FOR UPDATE` before mutation |
| Races | **K01–K18** pinned in `fixtures.requiredKillRaceIds`; 25 historical **R01–R25** remain pinned |
| Validator | Exhaustiveness rules (missing/duplicate write, allowlist exactness, per-transition kill guard); race model honors kill modes MISSING/MALFORMED/READ_ERROR |
| Contract version | **`DI_V0_S4A_CONTRACT_V2` unchanged** (`CONTRACT_VERSION_BUMP_REQUIRED=NO` — no S2 identity / pvk / orchestration version change) |
| Suites | **65** negative (0 false accepts), **24** positive (0 false rejects) |

## 3. C1D.10D P2 reconciliation

| # | Finding | Status |
|---|---------|--------|
| 1 | Race fixtures not pinned | **CLOSED** — `requiredRaceIds` + `requiredKillRaceIds` (K01–K18) |
| 2 | S4A/DI/DIMO validators absent from GitHub CI | **CLOSED** — `.github/workflows/s4a-authority-governance.yml` |
| 3 | C1D.10C timezone evidence unscoped | **OPEN_ACCEPTED** — evidence table in C1D.10C remains; 60-day vs all-time clarified in C1D.10D only |
| 4 | `markRepairAuditEnqueued` APPLIED without `appliedAt` | **OPEN_ACCEPTED** — Trips module; 0 such rows in Production |
| 5 | Chat-block P2 count mismatch | **CLOSED** — repo evidence table (5/6/1/1) is canonical |

## 4. Non-effects

No backend runtime, Prisma schema, migration, worker, scheduler, provider call, Production write, deploy or flag change.
