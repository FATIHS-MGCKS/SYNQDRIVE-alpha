# EXP-021 S4F-7AL — One-shot S4F-7Y live staging preflight & human hold point (non-executable runbook)

**Date (UTC):** 2026-10-08  
**Authority:** `STARTING_MAIN_SHA=abfc97c0b3866657be1532c0fe89b63dbc7a8ed0` (includes S4F-7AK / #1939)  
**Certified tool:** `ed78748bc9493cdc8da56000e333e4940114f9f1`  
**This document does not authorize execution.** It is a **human-operated** checklist for a **single** future attempt. **Stop** if any gate fails.

**Read-only preflight log:** `/opt/cursor/artifacts/s4f7al-production-readonly-preflight.log`  
**Engineering tests (agent):** `npm run test:di:s4f7v:fresh-tiny-staging-wrapper` — **131** PASS @ S4F-7AL slice.

---

## A. Hard prohibitions (this workstream and until new human grant)

| Rule | Status |
|------|--------|
| `DRY_RUN=0` in this slice | **FORBIDDEN** |
| Production env write / restart | **FORBIDDEN** |
| Mint JIT / `AUTHORIZED_*` / `DI_S4F7Y_LIVE_STAGING_AUTHORIZED` | **FORBIDDEN** |
| S4F-7AI bootstrap for live | **FORBIDDEN** (Production **`DRY_RUN=1` only**) |
| Release-tree bash operator @ `3b557e208…` for live | **FORBIDDEN** (3 bash blobs ≠ certified) |
| Auto-retry on failure | **FORBIDDEN** (one shot only) |

---

## B. Production prestate @ 2026-10-08T23:03:34Z (read-only)

| Check | Value |
|-------|--------|
| `CURRENT_PRODUCTION_SHA` | `3b557e208c1a06e91c0a13fb8ba861b1255ee375` |
| `CURRENT_RELEASE_ID` | `20261008182454_v4994` |
| `CURRENT_ENV_SHA256` | `03179b0cc59f933e2db5dcc42710edce8c08ac2e91cdcafa70c376064e14e6c8` (**APDS shadow state — do not revert**) |
| Replica A/B health | **200** / **200** |
| Attestation A/B | **PRESTATE**, fp `b648908a5f74798f765b0631cd16d5c50a390222d36b63fb03f787367176750d` (**parity YES**) |
| `GLOBAL_KILL_STATE` | **KILLED** |
| S4 flags | **all OFF** |
| Tiny staging keys | **all MISSING** |
| S4 pipeline / work items | **0** / **0** |
| Tiny vehicle | `c10351f8-b6a2-4258-947f-631aeaa6d359` **ACTIVE** @ org `faa710c9-6d91-4079-a7d5-91fdccdec14a` |
| Scheduler leaders | **1** |
| NGINX | **PASS** / dual upstream **YES** |
| DIMO global budget (A) | **enabled (1)** |
| Concurrent deploy observed | **NONE** |
| `WORKER_APD_SHADOW_ENABLED` | **present** (APDS shadow preserved) |

**Re-verify entire table immediately before any future mutation** (fresh read-only pass).

---

## C. Certified live operator (code contract)

**Checkout:** detached git commit `ed78748bc9493cdc8da56000e333e4940114f9f1` only.

**Entry script:** `backend/scripts/ops/di-v0-s4-stage-tiny-fresh-production.sh` from that checkout.

**Critical default:** `DRY_RUN="${DRY_RUN:-0}"` — **unset `DRY_RUN` implies live path**. A human dispatcher **must** set guards **before** invoking the wrapper:

1. `DI_S4_TINY_STAGING_ACK=YES`
2. Explicit mode: either `DRY_RUN=1` (rehearsal only) **or** `DRY_RUN=0` **only after** items D–F satisfied
3. For live: `DI_S4F7Y_LIVE_STAGING_AUTHORIZED=YES` (not `DI_S4F7V_*` alone)
4. Eight pins (exact names from `di-v0-s4-fresh-tiny-staging-live-authority.lib.ts`):
   - `AUTHORIZED_TOOL_SHA`
   - `AUTHORIZED_PRODUCTION_SHA`
   - `AUTHORIZED_PRODUCTION_RELEASE_ID`
   - `AUTHORIZED_PRE_ENV_SHA256`
   - `AUTHORIZED_FRESH_NOT_BEFORE`
   - `AUTHORIZED_FRESH_EXPECTED_FINGERPRINT`
   - `AUTHORIZED_ORGANIZATION_ALLOWLIST`
   - `AUTHORIZED_VEHICLE_ALLOWLIST`
5. Fresh JIT inputs for fingerprint derivation (operator contract): `DI_S4_TINY_FRESH_NOT_BEFORE`, `DI_S4_TINY_FRESH_EXPECTED_FINGERPRINT`, `DI_S4_TINY_FRESH_ORGANIZATION_ALLOWLIST`, `DI_S4_TINY_FRESH_VEHICLE_ALLOWLIST`

**Live path function:** `s4f7y_execute_live_transaction` — backup → exact 3-key mutation → restart A → `prove-fresh-runtime` (OTHER) → restart B after barrier → `verify-live-poststate` → rollback arm on failure.

**Not production-proven:** first successful A→B live forward transition; AF.1C consumed; S4F-7AJ JIT **expired**.

---

## D. Human hold points (must be explicit before live)

| Gate | Required value |
|------|----------------|
| `HUMAN_FREEZE_CONFIRMATION` | **CONFIRMED** (deploy/migrate/restart window) |
| `HUMAN_ONE_SHOT_AUTHORIZATION` | **NEW** written grant (AF.1C **not** reusable) |
| `FRESH_LIVE_JIT` | Minted **≤900s** before final pre-mutation `validate-fresh-authority` |
| `NO_BACKFILL` | `validate-no-backfill-final` at execution clock |
| Execution time | **Separately confirmed** (no stale pins) |

While any row is pending: **`LIVE_EXECUTION_AUTHORIZED=NO`**.

---

## E. Immediate pre-mutation checklist (operator, at execution time)

Execute **read-only** first; abort if any fail:

1. Record Production SHA, release ID, **current** `backend.env` SHA256, A/B PID, attestation PRESTATE + fingerprint (both replicas).
2. Confirm `GLOBAL_KILL_STATE=KILLED`, six S4 flags OFF, three staging keys MISSING, S4 SQL zero-state.
3. Confirm topology: scheduler leader **1**, NGINX dual upstream, Redis reachable, DIMO budget on both replicas.
4. Confirm no concurrent deploy/migration job.
5. Re-derive internal fingerprint; bind all eight `AUTHORIZED_*` to **observed** values (not S4F-7AJ / not AF.1C).
6. Export fresh `DI_S4_TINY_FRESH_*` aligned with authorized pins.
7. **Optional rehearsal:** `DRY_RUN=1` via **S4F-7AI bootstrap only** (not a substitute for human live grant).

Then **only if human grant + freeze confirmed:**

8. Set `DRY_RUN=0`, `DI_S4F7Y_LIVE_STAGING_AUTHORIZED=YES`, run wrapper **once** from detached `ed78748bc…` checkout.
9. Do **not** re-run on failure (investigate; new authorization required).

---

## F. Failure handling (no auto-retry)

| Phase | Action |
|-------|--------|
| Before env write | **STOP** — no mutation; preserve forensics; do not reuse partial JIT |
| After backup, before restart | Invoke rollback path; verify env bytes match `AUTHORIZED_PRE_ENV_SHA256` |
| After A restart, attestation fail | **STOP** — rollback; do not start B forward restart |
| After B restart / poststate fail | Rollback + recovery prestate proofs per Y.2 terminal emitter |
| Any CLI non-zero | Treat as **FAIL_CLOSED**; monotonic forensic facts retained |

---

## G. Engineering validation (S4F-7AL slice)

| Area | Result |
|------|--------|
| Six-file blob parity @ `ed78748bc…` on `main` | **PASS** |
| Live authority lib + 8 pins | **Verified in code + specs** |
| DB clock initial/final | **Engineering + S4F-7AJ dry-run certified** |
| Backup / rollback / A→B barrier | **Engineering tests (131)** — **not** Production live |

---

## Machine block

```
EXP021_S4F7AL_ONE_SHOT_PRELIVE_GATE_RESULT=READY_FOR_HUMAN_DECISION

CURRENT_MAIN_SHA=abfc97c0b3866657be1532c0fe89b63dbc7a8ed0
CERTIFIED_TOOL_SHA=ed78748bc9493cdc8da56000e333e4940114f9f1
CURRENT_PRODUCTION_SHA=3b557e208c1a06e91c0a13fb8ba861b1255ee375
CURRENT_RELEASE_ID=20261008182454_v4994
CURRENT_ENV_SHA256=03179b0cc59f933e2db5dcc42710edce8c08ac2e91cdcafa70c376064e14e6c8

PRODUCTION_PRESTATE=PASS
S4_KILL_AND_FLAGS=PASS
TINY_KEYS_MISSING=YES
REPLICA_ATTESTATION_PARITY=YES
APDS_SHADOW_STATE_PRESERVED=YES

CERTIFIED_LIVE_OPERATOR_CHECKOUT=ed78748bc9493cdc8da56000e333e4940114f9f1_DETACHED_ONLY
LIVE_DISPATCH_CONTRACT_VERIFIED=YES_ENGINEERING
BACKUP_AND_ROLLBACK_ENGINEERING_VALIDATED=YES
A_TO_B_BARRIER_ENGINEERING_VALIDATED=YES

HUMAN_FREEZE_CONFIRMATION=PENDING
HUMAN_ONE_SHOT_AUTHORIZATION_PRESENT=NO
FRESH_LIVE_JIT_PRESENT=NO
LIVE_EXECUTION_AUTHORIZED=NO

PRODUCTION_MUTATION_OCCURRED=NO
DRY_RUN0_EXECUTED=NO
GATE_6=NOT_SATISFIED

REMAINING_BLOCKERS=HUMAN_ONE_SHOT_AUTHORIZATION;HUMAN_FREEZE_CONFIRMATION;FRESH_JIT_AT_EXECUTION;FIRST_LIVE_A_TO_B_UNPROVEN;EXPLICIT_DRY_RUN_GUARD_BEFORE_WRAPPER_DEFAULT_ZERO
RUNBOOK_EVIDENCE_PATH=architecture/drivingintelligence/evidence/EXP021_S4F7AL_ONE_SHOT_LIVE_PREFLIGHT_RUNBOOK.md
NEXT_SAFE_ACTION=HUMAN_CONFIRMS_FREEZE_AND_ISSUES_ONE_SHOT_GRANT;OPERATOR_RE_RUN_READONLY_PRESTATE;MINT_FRESH_JIT_AND_AUTHORIZED_PINS;OPTIONAL_DRY_RUN1_VIA_S4F7AI_ONLY;THEN_SINGLE_LIVE_ATTEMPT_FROM_ed78748_CHECKOUT
FINAL_RESULT=READY_FOR_HUMAN_DECISION
```
