# EXP-021 S4F-7AA.1 — Production dry-run operator & evidence hardening

**Date (UTC):** 2026-10-08  
**Target PR:** **#1923**  
**Scope:** Code/evidence hardening only. **No** Production access, **no** `DRY_RUN` re-execution, **no** retroactive mutation of the S4F-7AA transcript.

## Historical vs hardened bootstrap

| Item | Value |
|------|--------|
| `HISTORICAL_DRY_RUN_BOOTSTRAP_COMMIT` | `99fa1ee34ed60e1d6791bcd42530e2c4ca3edef2` (pre–AA.1) |
| `HISTORICAL_DRY_RUN_RESULT` | **PASS** (artifact `s4f7aa-production-dry-run.log`; unchanged) |
| `HISTORICAL_RUN_VALIDATES` | Sealed **operator tool** `715dea564…` + Production `DRY_RUN=1` **at execution time** only |
| `HISTORICAL_RUN_DOES_NOT_VALIDATE` | Post–AA.1 bootstrap revision (pin guard, poststate SQL re-measurement, measured wrapper counters) |

The successful Production dry-run remains a **historical finding**. AA.1 fixes reproducible bootstrap defects; it does **not** re-certify Production.

## Defects reproduced (pre–AA.1 @ `99fa1ee34…`)

| ID | Defect | Severity |
|----|--------|----------|
| D1 | `unset` of stale pin env **before** mismatch check → stale-pin guard **dead** | High |
| D2 | Runtime `chmod +x` on tracked bootstrap (workspace mutation) | Medium |
| D3 | `PRODUCTION_*_OCCURRED=NO` / `PROVIDER_CALL_COUNT=0` emitted without post-run measurement | Medium |
| D4 | No POST re-read of S4 persistence row counts | Medium |
| D5 | No explicit `REMOTE_SSH_EXIT_CODE` on local dispatch | Low |
| D6 | Remote temp attestation files removed ad hoc; incomplete EXIT trap | Low |

## Defects fixed (AA.1)

| ID | Fix |
|----|-----|
| D1 | `lib/cloud-agent-s4f7aa-tool-pin.lib.sh` — detect stale pins **before** clear in **parent** shell (not a `$(…)` subshell); fail closed |
| D2 | Removed runtime `chmod`; script committed executable |
| D3 | Parse wrapper log for `DRY_RUN_ENV_MUTATION_COUNT=0`, `DRY_RUN_RESTART_COUNT=0`, `EXPECTED_PROVIDER_CALL_DELTA=0` |
| D4 | POST `di_v0_s4_pipeline_versions` / `di_v0_s4_work_items` compared to PRE |
| D5 | Local dispatch records `REMOTE_SSH_EXIT_CODE` |
| D6 | Unified `cleanup_remote` EXIT trap; `mktemp` artifact list |
| — | Remote: force `DRY_RUN=1`; reject live auth; `BOOTSTRAP_SCRIPT_SHA256` at local dispatch |
| — | Negative tests: `.cursor/scripts/cloud-agent-s4f7aa-tool-pin.test.sh` |

**No changes** to the five sealed S4F-7Y operator files.

## Evidence field classification (historical S4F-7AA run)

| Field / claim | Classification |
|---------------|----------------|
| `SEALED_TOOL_SHA` / `TOOL_SHA_PIN=PASS` | **VERIFIED_BY_INDEPENDENT_EVIDENCE** (Z2 seal + log checkout) |
| `GUARDS_OK` / `DRY_RUN_FULL_GUARD_PATH_EXECUTED` | **VERIFIED_BY_EXECUTION_PATH** (wrapper log) |
| `JIT_FRESH_NOT_BEFORE` / fingerprint / age | **VERIFIED_BY_EXECUTION_PATH** |
| `NO_BACKFILL_GATE` (SQL counts 0/0) | **VERIFIED_BY_EXECUTION_PATH** |
| PRE/POST SHA, env SHA256, replica PIDs | **VERIFIED_BY_EXECUTION_PATH** |
| PRE/POST attestation PRESTATE fingerprints | **VERIFIED_BY_EXECUTION_PATH** |
| `GLOBAL_KILL_STATE` / `S4_ZERO_STATE` (PRE) | **VERIFIED_BY_EXECUTION_PATH** |
| `PRODUCTION_DB_WRITE_OCCURRED=NO` (historical) | **DECLARED_ONLY** (no POST SQL re-count in `99fa1ee34` bootstrap) |
| `PROVIDER_CALL_COUNT=0` (historical) | **DECLARED_ONLY** (not grep-measured in `99fa1ee34` bootstrap) |
| Stale S4F-7W pin rejection (historical) | **NOT_VERIFIED** by bootstrap code path (D1); run used manual `env -u` workaround |
| `BOOTSTRAP_SCRIPT_SHA256` identity | **NOT_VERIFIED** historically (field absent until AA.1) |

Post–AA.1 bootstrap adds **VERIFIED_BY_EXECUTION_PATH** for DB persistence parity and wrapper-measured mutation/restart/provider-delta when a future run is authorized.

## Canonical bootstrap identity (AA.1 @ merge `9e40c969d`)

| Field | Value |
|-------|--------|
| `BOOTSTRAP_SCRIPT_SHA256` | `007eb88581d26cc52447ea96635a1f707931f0f102a21cd395fd843f743b8351` |
| Production certification | [EXP021_S4F7AB_HARDENED_PRODUCTION_DRY_RUN_CERTIFICATION.md](EXP021_S4F7AB_HARDENED_PRODUCTION_DRY_RUN_CERTIFICATION.md) |

## Validation (AA.1, no Production)

```bash
bash .cursor/scripts/cloud-agent-s4f7aa-tool-pin.test.sh
bash -n .cursor/scripts/cloud-agent-s4f7aa-fresh-jit-production-dry-run.sh
bash architecture/scripts/validate-module-registry.sh
```

## Gate 6

Unchanged: **NOT_SATISFIED**.

## Machine block

```
EXP021_S4F7AA1_OPERATOR_EVIDENCE_HARDENING_RESULT=PASS
MERGE_READINESS=READY_FOR_HUMAN_MERGE
GATE_6=NOT_SATISFIED
PRODUCTION_MUTATION_OCCURRED=NO
```
