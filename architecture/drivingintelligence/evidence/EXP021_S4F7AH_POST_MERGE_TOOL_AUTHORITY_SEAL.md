# EXP-021 S4F-7AH — Post-merge exact-head tool authority seal (S4F-7AG operator)

**Date (UTC):** 2026-10-08  
**Scope:** Read-only git/CI/blob certification after merge of PR **#1930**. **No** Production access/mutation, deploy, restart, `DRY_RUN=0`, new JIT, live authorization reuse, or S4 activation.

---

## 1. Merge lineage & git authority

| Field | Value |
|-------|--------|
| `PR_NUMBER` | **1930** |
| `PR1930_MERGED` | **YES** @ `2026-10-08T18:02:21Z` |
| `PR1930_EXACT_HEAD` | `ed78748bc9493cdc8da56000e333e4940114f9f1` |
| `PR1930_MERGE_SHA` | `f1e6b9221d3e5a57d3bbe8d3ad79702eef20ffa7` |
| `CURRENT_MAIN_SHA` | `f1e6b9221d3e5a57d3bbe8d3ad79702eef20ffa7` |
| Squash merge message | `fix(ops): EXP-021 S4F-7AG live fresh-authority DB clock export (#1930)` |
| `ed78748…` git-ancestor of merge SHA | **YES** |
| Intermediate PR head `f7560f4be…` | Operator **six-file blobs identical** to `ed78748…` (ledger-only delta on second commit) — **not** used as seal without full exact-head CI on `ed78748…` |

### Exact-head CI (immutable certification commit)

| Field | Value |
|-------|--------|
| `EXACT_HEAD_CI_CERTIFIED` | **YES** |
| `EXACT_HEAD_SHA` | `ed78748bc9493cdc8da56000e333e4940114f9f1` |
| Non-success check-runs on exact head | **0** (47 completed; allowed `skipped` only for path-filtered S4 suites) |
| Governing workflows (success @ `ed78748…`) | EXP-021 Autonomous Orchestrator CI; S4A authority governance; S4A PostgreSQL integration; RFRF Stage-3 persistence readiness; RFRF Stage-4 convergence readiness; Legal Documents — Production Readiness CI; Vehicle Detail — Production Readiness CI; Module registry governance; i18n Governance (Authority Protection + New Debt Gate) |

### Tool checkout fetchability

| Check | Result |
|-------|--------|
| `git cat-file -e ed78748…^{commit}` | **PASS** |
| Detached worktree + `bash -n` on fresh wrapper @ `ed78748…` | **PASS** |
| `TOOL_COMMIT_FETCHABLE` | **YES** |
| `DETACHED_CHECKOUT_VALID` | **YES** |

---

## 2. Six-file operator authority surface (S4F-7AG)

File **(3)** `di-v0-s4-fresh-tiny-staging-production.lib.sh` is explicitly in the seal set (DB-clock + fail-closed validator helpers).

`PR_HEAD_TO_MERGE_BLOB_PARITY=PASS`  
`MERGE_TO_MAIN_BLOB_PARITY=PASS`  
`SIX_FILE_AUTHORITY_PARITY=PASS`  
`OPERATOR_BLOB_COUNT=6`

| # | Path | Git blob ID | SHA256 (file content) |
|---|------|-------------|------------------------|
| 1 | `backend/scripts/ops/di-v0-s4-stage-tiny-fresh-production.sh` | `2949f4e0138fca4d2e1ace6528e858671c9f1a0f` | `d9cbbc81f3de80e7b13e241a108a03d78ed316be946c52ebe81f11c571d93947` |
| 2 | `backend/scripts/ops/lib/di-v0-s4-fresh-tiny-staging-live-transaction.lib.sh` | `46f40f440f331fc08299111769d47a097eb1c63c` | `5f1e66e901177579f9644df1cab610d9774396b65eaf08b8fa6b158a8ad09f73` |
| 3 | `backend/scripts/ops/lib/di-v0-s4-fresh-tiny-staging-production.lib.sh` | `758167d5b91006f12e4445ac0d952325cef4282a` | `f2712676244ea684d83f0785d6f443ce1d0d6958fc5020784c749d042a885557` |
| 4 | `backend/scripts/ops/di-v0-s4-fresh-tiny-staging-production/di-v0-s4-fresh-tiny-staging-production-cli.ts` | `66c1e168626b2a6f11d9ea6f86a239fc5c058f55` | `6d43c55adee10de9e6d1648d6a03db1816d40469e28d0db373db6f2045f0d719` |
| 5 | `backend/scripts/ops/di-v0-s4-fresh-tiny-staging-production/di-v0-s4-fresh-tiny-staging-live-authority.lib.ts` | `32517acc32b5dd30ff8765598662d4cf17abe964` | `e8731adaf525c596876d9716cf932133434f294f8b697bbba2496197399d5d73` |
| 6 | `backend/scripts/ops/di-v0-s4-fresh-tiny-staging-production/di-v0-s4-fresh-tiny-staging-live-poststate.lib.ts` | `b5bfab1f86badaf72f497f05b3f223308c942f7f` | `6cb07b51084e99d5b5906cac0e375553c5f3033fa7b237525a24917085102c1c` |

Byte-identical across **PR exact head**, **squash merge commit**, and **`origin/main` @ `f1e6b9221…`**.

**Note:** Merge commit `f1e6b9221…` is the **main tip** but is **not** interchangeable with the **tool checkout pin** — operators must set `EXPECTED_FRESH_TINY_STAGING_TOOL_SHA=ed78748bc9493cdc8da56000e333e4940114f9f1` (CI-certified immutable head).

---

## 3. Shared ops dependencies (wrapper `source` graph)

Fresh wrapper additionally sources (same relative paths under `backend/scripts/ops/`):

- `vps-production-replica-topology.config.sh`
- `lib/di-v0-s4-tiny-staging-production.lib.sh`
- `lib/vps-production-replica.lib.sh`
- `lib/di-v0-s4f-global-budget-rollout.lib.sh`
- `lib/di-v0-s4-global-kill-init-production.lib.sh`

| Check | Result |
|-------|--------|
| Shared libs @ `ed78748…` vs @ `f1e6b9221…` (main) | **Identical git blobs** |
| Shared libs @ historical Z2 tool `715dea564…` vs @ `ed78748…` | **Identical** (unchanged since Z2 seal) |
| `SHARED_DEPENDENCY_PARITY` | **PASS** (compatible within `ed78748…` checkout; no drift vs main for execution path) |

---

## 4. Fix integrity (merged code)

| Invariant | Verified |
|-----------|----------|
| Initial canonical DB clock before first live `validate-fresh-authority` | **YES** (`s4f7v_export_db_clock_canonical_utc_fail_closed INITIAL`) |
| DB clock query failure → fail-closed | **YES** |
| Empty / invalid DB clock → fail-closed | **YES** |
| No local system time fallback | **YES** (`s4f7v_query_db_clock_canonical` → Postgres only in non-fixture mode) |
| Final DB clock re-query | **YES** (`FINAL` label + `DI_S4F7V_FINAL_DB_CLOCK_CANONICAL_UTC`) |
| CLI exit propagation (initial + final) | **YES** (`s4f7v_run_validate_fresh_authority_fail_closed`) |
| No pipeline exit masking | **YES** (replaced `$(s4f7v_run_cli …)` age pipeline) |
| JIT max age 900 s | **UNCHANGED** (`FRESH_STAGING_AUTHORITY_MAX_AGE_SECONDS = 900`) |
| NO_BACKFILL | **UNCHANGED** (CLI + tests) |
| Exact three-key mutation | **UNCHANGED** |
| A→B attestation barrier | **UNCHANGED** |
| Rollback / terminal forensics | **UNCHANGED** (S4F-7Y.2 suites) |

### Test & CI evidence (repository `main` @ seal time)

| Suite | Result |
|-------|--------|
| S4F-7AG regression (`di-v0-s4-fresh-tiny-staging-live-db-clock-7ag.spec.ts`) | **13/13 PASS** |
| Wrapper suite `npm run test:di:s4f7v:fresh-tiny-staging-wrapper` | **131/131 PASS** |
| Bash syntax (`bash -n` wrapper + libs) | **PASS** |
| Exact-head GitHub Actions @ `ed78748…` | **PASS** (see §1) |

---

## 5. Tool authority seal

| Field | Value |
|-------|--------|
| `HISTORICAL_TOOL_SHA` (S4F-7Z.2) | `715dea5648ebb862eeedfc30e7dc3d3cd57bb02c` |
| **`NEW_EXPECTED_FRESH_TINY_STAGING_TOOL_SHA`** | **`ed78748bc9493cdc8da56000e333e4940114f9f1`** |
| `NEW_TOOL_SEAL_STATUS` | **SEALED_AFTER_EXACT_HEAD_CI_AND_POST_MERGE_BLOB_PARITY** |
| Z2 evidence | **Preserved** — valid **only** for pre–S4F-7AG six-file blobs |
| Future S4F-7Y fresh Tiny staging tool checkout | **MUST** pin `ed78748…` until superseded by a future seal |

---

## 6. Bootstrap compatibility (S4F-7AA.1)

| Field | Value |
|-------|--------|
| `AA1_BOOTSTRAP_USES_OLD_Z2_PIN` | **YES** — `.cursor/scripts/cloud-agent-s4f7aa-fresh-jit-production-dry-run.sh` reads `EXP021_S4F7Z2_EXACT_HEAD_CI_TOOL_AUTHORITY_SEAL.md` only |
| Effect if run unchanged after S4F-7AH | Remote checkout @ `715dea564…` → **pre–DB-clock-fix operator** (incompatible with post–AF.1C live-path requirements) |
| `NEW_BOOTSTRAP_REQUIRED` | **YES** — follow-on engineering: new bootstrap or parameterized evidence path targeting `EXP021_S4F7AH_POST_MERGE_TOOL_AUTHORITY_SEAL.md` / `ed78748…` |
| `NEW_DRY_RUN_READY` | **NO** until bootstrap pin updated (this seal does **not** imply Production dry-run executable) |
| Constraints | Do **not** overwrite Z2 evidence; do **not** run old pin against new code; do **not** bypass SHA checks; do **not** reuse AF.1C live authorization |

---

## 7. Production state & authorization bounds

| Field | Value |
|-------|--------|
| `PRODUCTION_MUTATION_OCCURRED` (this slice) | **NO** |
| `DRY_RUN0_EXECUTED` | **NO** |
| `LIVE_STAGING_AUTHORIZED` | **NO** |
| `S4_TINY_ACTIVATED` | **NO** |
| `GATE_6` | **NOT_SATISFIED** |
| AF.1C live attempt | **ONE_ATTEMPT_CONSUMED** — **FAILED_BEFORE_MUTATION**; authorization **not** reusable |
| Deployment freeze | Operational coordination only — **not** a substitute for new live authorization |

---

## Next safe action

1. Merge this evidence PR (human).  
2. Implement **S4F-7AH.1** (or equivalent) bootstrap pin to `ed78748…` before any new Production `DRY_RUN=1`.  
3. Mint **new** JIT fresh authority (≤900 s) bound to `EXPECTED_FRESH_TINY_STAGING_TOOL_SHA=ed78748…` — separate human live decision still required for `DRY_RUN=0`.

---

## Machine block

```
EXP021_S4F7AH_POST_MERGE_TOOL_SEAL_RESULT=SEALED

PR1930_MERGED=YES
PR1930_EXACT_HEAD=ed78748bc9493cdc8da56000e333e4940114f9f1
PR1930_MERGE_SHA=f1e6b9221d3e5a57d3bbe8d3ad79702eef20ffa7
CURRENT_MAIN_SHA=f1e6b9221d3e5a57d3bbe8d3ad79702eef20ffa7

EXACT_HEAD_CI_CERTIFIED=YES
TOOL_COMMIT_FETCHABLE=YES
DETACHED_CHECKOUT_VALID=YES

OPERATOR_BLOB_COUNT=6
PR_HEAD_TO_MERGE_BLOB_PARITY=PASS
MERGE_TO_MAIN_BLOB_PARITY=PASS
SIX_FILE_AUTHORITY_PARITY=PASS
SHARED_DEPENDENCY_PARITY=PASS

INITIAL_DB_CLOCK_FIX_PRESENT=YES
FINAL_DB_CLOCK_REQUERY_PRESENT=YES
CLI_EXIT_PROPAGATION_PRESENT=YES
JIT_900S_UNCHANGED=YES
NO_BACKFILL_UNCHANGED=YES
ROLLBACK_SEMANTICS_UNCHANGED=YES

REGRESSION_TESTS=13_OF_13_PASS
WRAPPER_SUITE=131_OF_131_PASS
BASH_SYNTAX=PASS
RELEVANT_CI=PASS_AT_ed78748bc

HISTORICAL_TOOL_SHA=715dea5648ebb862eeedfc30e7dc3d3cd57bb02c
NEW_TOOL_SHA=ed78748bc9493cdc8da56000e333e4940114f9f1
NEW_TOOL_SEAL_STATUS=SEALED_AFTER_EXACT_HEAD_CI_AND_POST_MERGE_BLOB_PARITY

AA1_BOOTSTRAP_USES_OLD_Z2_PIN=YES
NEW_BOOTSTRAP_REQUIRED=YES
NEW_DRY_RUN_READY=NO

PRODUCTION_MUTATION_OCCURRED=NO
DRY_RUN0_EXECUTED=NO
LIVE_STAGING_AUTHORIZED=NO
S4_TINY_ACTIVATED=NO
GATE_6=NOT_SATISFIED

EVIDENCE_PATH=architecture/drivingintelligence/evidence/EXP021_S4F7AH_POST_MERGE_TOOL_AUTHORITY_SEAL.md
BLOCKERS=AA1_BOOTSTRAP_STILL_PINNED_TO_Z2
NEXT_SAFE_ACTION=Follow-on bootstrap pin to ed78748 then new JIT DRY_RUN=1 only
FINAL_RESULT=SEALED
```
