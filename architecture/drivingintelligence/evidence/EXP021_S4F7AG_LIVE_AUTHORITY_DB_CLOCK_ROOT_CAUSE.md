# EXP-021 S4F-7AG — Live fresh-authority DB clock root cause & minimal fix

**Date (UTC):** 2026-10-08  
**Scope:** Engineering diagnosis, minimal operator fix, regression tests, authority re-certification path. **No** Production `DRY_RUN=0`, deploy, restart, migration, or live re-authorization reuse.

---

## 1. S4F-7AF.1C factual correction (historical)

| Fact | Value |
|------|--------|
| Human single-attempt live authorization | **Consumed** — exactly **one** `DRY_RUN=0` wrapper invocation |
| Outcome | **Fail-closed before mutation** (`DRY_RUN0_EXIT_CODE=1`, `REMOTE_SSH_EXIT_CODE=1`) |
| Env mutation | **NO** — `PRE_BACKEND_ENV_SHA256` == `POST_BACKEND_ENV_SHA256` (`9aae449e…`) |
| Backup | **NO** — `BACKUP_CREATED_BEFORE_MUTATION` not reached |
| Replica restarts | **0** |
| Rollback | **NOT_REQUIRED** — no mutation to roll back |
| `RECOVERY_PRESTATE_ATTESTATION=YES` in ad-hoc agent block | **Misleading label** — Production remained PRESTATE without a restore operation; parity = **unchanged env**, not rollback recovery |
| `FRESH_JIT_AGE_AT_MUTATION_SECONDS=21.15` | Observed **pre-mutation validation** age at orchestrator boundary before failed live `validate-fresh-authority`; **not** age at env mutation (none occurred) |
| S4 activation | **NO** — global kill **KILLED**, S4 zero-state |
| Gate 6 | **NOT_SATISFIED** |

Evidence log (sanitized): `/opt/cursor/artifacts/s4f7af1c-authorized-live-staging-sanitized.log` (agent artifact; not committed).

---

## 2. Root cause (confirmed)

### First failing guard (live `DRY_RUN=0` path)

`s4f7y_execute_live_transaction` → `s4f7v_run_cli validate-fresh-authority` **before** any `DI_S4F7V_DB_CLOCK_CANONICAL_UTC` export.

### AF.1C terminal forensics (from log)

| Field | Observed |
|-------|----------|
| `FRESH_AUTHORITY_OK` | **NO** |
| `FRESH_AUTHORITY_FAILURES` | `FRESH_NOT_BEFORE_INVALID` |
| `DB_CLOCK_CANONICAL_UTC` line on live validate | **Absent** (contrast: present on preceding `DRY_RUN=1` path) |
| `DI_S4F7V_DB_CLOCK_CANONICAL_UTC` in parent orchestrator shell | **NOT_VERIFIED** in log (orchestrator did not export; dry-run child set clock only inside `DRY_RUN=1` branch) |
| `CANONICAL_FRESH_NOT_BEFORE` | `2026-10-08T14:49:49.835Z` |
| `FRESH_AUTHORITY_AGE_SECONDS` on failure | **Not emitted** (validate failed before age line) |
| `PRODUCTION_STAGING_ATTEMPTED` | **NO** |
| Wrapper / remote exit | **1** |

### Mechanism

`readFreshAuthorityFromProcessEnv()` uses `env.DI_S4F7V_DB_CLOCK_CANONICAL_UTC ?? ''`. Empty DB clock → `parsePostgresClockTimestampUtc` fails → `FRESH_NOT_BEFORE_INVALID` (fail-closed).

**DRY_RUN=1** path in `di-v0-s4-stage-tiny-fresh-production.sh` exported DB clock before validate; **live** path did not.

### Secondary defect (fixed in same slice)

`s4f7y_final_pre_mutation_revalidation` used:

`FINAL_JIT_AUTHORITY_AGE_SECONDS=$(s4f7v_run_cli validate-fresh-authority | awk …)`

Pipeline could mask CLI non-zero exit (stdout-only age echo). Replaced with fail-closed wrapper `s4f7v_run_validate_fresh_authority_fail_closed FINAL`.

---

## 3. Minimal fix (S4F-7AG)

| Change | Location |
|--------|----------|
| `s4f7v_export_db_clock_canonical_utc_fail_closed` | `lib/di-v0-s4-fresh-tiny-staging-production.lib.sh` — query DB clock, reject empty/invalid format, export `DI_S4F7V_DB_CLOCK_CANONICAL_UTC`; FINAL also sets `DI_S4F7V_FINAL_DB_CLOCK_CANONICAL_UTC` |
| `s4f7v_run_validate_fresh_authority_fail_closed` | Same — propagate CLI exit; require `FRESH_AUTHORITY_OK=YES` |
| Initial live export + validate | `lib/di-v0-s4-fresh-tiny-staging-live-transaction.lib.sh` before first live validate |
| Final re-query + validate | `s4f7y_final_pre_mutation_revalidation` |
| DRY_RUN parity | `di-v0-s4-stage-tiny-fresh-production.sh` uses same helpers |

**Unchanged:** 900s window, fingerprint semantics, NO_BACKFILL contract, guard strictness.

---

## 4. Tool authority re-certification

| Item | SHA / note |
|------|------------|
| **Historical sealed tool (pre-fix code)** | `715dea5648ebb862eeedfc30e7dc3d3cd57bb02c` — remains valid **only** for unmodified Z2 five-file blobs |
| **Post-fix operator blobs (3 changed)** | See PR head tree — `di-v0-s4-stage-tiny-fresh-production.sh`, `di-v0-s4-fresh-tiny-staging-live-transaction.lib.sh`, `di-v0-s4-fresh-tiny-staging-production.lib.sh` |
| **Unchanged TS blobs** | Same as Z2 seal (`production-cli.ts`, `live-authority.lib.ts`, `live-poststate.lib.ts`) |
| **New exact-head CI** | Required on PR head before any future live attempt |

---

## 5. Regression tests

`di-v0-s4-fresh-tiny-staging-live-db-clock-7ag.spec.ts` — **13** cases (AF1C class, corrected path, negatives, shell contract).  
Full suite: `npm run test:di:s4f7v:fresh-tiny-staging-wrapper` — **131** tests PASS (includes S4F-7Y.1 / 7Y.2).

---

## Machine block

```
EXP021_S4F7AG_LIVE_AUTHORITY_ROOT_CAUSE_FIX_RESULT=COMPLETE

CURRENT_MAIN_SHA=bca309f617cc1f41beb3665143ff8a711b0b4951
HISTORICAL_SEALED_TOOL_SHA=715dea5648ebb862eeedfc30e7dc3d3cd57bb02c

AF1C_FAILURE_LOG_FOUND=YES_AGENT_ARTIFACT
FIRST_FAILING_GUARD=validate-fresh-authority_INITIAL_LIVE_PATH
FRESH_AUTHORITY_FAILURES=FRESH_NOT_BEFORE_INVALID
INITIAL_DB_CLOCK_PRESENT=NO_ON_LIVE_VALIDATE_PATH
ROOT_CAUSE_CONFIRMED=YES
ROOT_CAUSE=MISSING_DI_S4F7V_DB_CLOCK_CANONICAL_UTC_BEFORE_LIVE_VALIDATE_FRESH_AUTHORITY

DRY_RUN_LIVE_CLOCK_PARITY_BUG=YES
FINAL_VALIDATION_EXIT_MASKING=YES_PIPELINE_COMMAND_SUBSTITUTION
OTHER_ROOT_CAUSES=NONE_CONFIRMED

MINIMAL_FIX_IMPLEMENTED=YES
INITIAL_DB_CLOCK_FAIL_CLOSED=YES
FINAL_DB_CLOCK_REQUERY=YES
CLI_EXIT_PROPAGATION=YES
FRESHNESS_900S_UNCHANGED=YES
NO_BACKFILL_UNCHANGED=YES

REGRESSION_TEST_COUNT=13
REGRESSION_TESTS_PASS=YES
NEGATIVE_TESTS_PASS=YES
EXISTING_S4F7Y_TESTS_PASS=YES

PRODUCTION_SHA_UNCHANGED=54fc704fb50c285c68470d8fa274d72a67438482
PRODUCTION_ENV_UNCHANGED=YES
DRY_RUN0_EXECUTED=NO

OLD_TOOL_SEAL_STILL_VALID_FOR_OLD_CODE=YES
NEW_TOOL_SHA=SEE_PR_HEAD_AFTER_PUSH
NEW_TOOL_AUTHORITY_CERTIFICATION_REQUIRED=YES_POST_MERGE

PR_NUMBER=SEE_GITHUB
PR_HEAD_SHA=SEE_GITHUB
PR_DRAFT=YES
EXACT_HEAD_CI_STATUS=PENDING_AT_PR_OPEN

LIVE_STAGING_AUTHORIZED=NO
GATE_6=NOT_SATISFIED

BLOCKERS=NEW_TOOL_SHA_CI_CERTIFICATION;NEW_EXPLICIT_HUMAN_SINGLE_ATTEMPT_AUTHORIZATION;FRESH_JIT_AT_EXECUTION
NEXT_SAFE_ACTION=MERGE_S4F7AG_PR;CERTIFY_NEW_TOOL_HEAD_CI;HUMAN_REAUTHORIZE_ONE_LIVE_ATTEMPT_WITH_FRESH_JIT
FINAL_RESULT=ROOT_CAUSE_FIXED
```
