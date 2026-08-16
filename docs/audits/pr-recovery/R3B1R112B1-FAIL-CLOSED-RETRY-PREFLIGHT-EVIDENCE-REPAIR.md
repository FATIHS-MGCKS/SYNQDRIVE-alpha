# R3B1R.1.2b.1 — Fail-Closed Retry Preflight Evidence Repair

**Phase:** `CI-R3B1R.1.2b.1`  
**Generated:** `2026-08-16T18:47:03+00:00`  
**Result:** **SUCCESS** — fail-closed preflight evidence repaired and replayed  
**Mode:** Read-only against Production — **zero Production mutations**, **no `prisma migrate deploy`**

**Supersedes retry-readiness conclusion of:** `R3B1R112B-CANONICAL-RETRY-PATH-FROZEN-PREFLIGHT.md`  
**Preserves historical artifact:** `docs/audits/ci-recovery/data/ci-r3b1r112b-assessment-raw-2026-08.json`  
**Raw evidence (this phase):** `docs/audits/ci-recovery/data/ci-r3b1r112b1-assessment-raw-2026-08.json`  
**Repaired tool (retained, not duplicated):** `docs/audits/ci-recovery/tooling/ci_r3b1r112b_run_preflight.py`

---

## 1. Entry state

| Field | Value |
|-------|-------|
| REPOSITORY | `FATIHS-MGCKS/SYNQDRIVE-alpha` |
| BRANCH | `audit/ci-r3b1o4-tail-reconciliation-strategy-closure-2026-08` |
| ENTRY_HEAD_SHA | `14a48b002d3221c57a4717625645f2f7b47ac093` |
| PR_1054_HEAD_SHA | `14a48b002d3221c57a4717625645f2f7b47ac093` |
| CURRENT_MAIN_SHA | `721ad893d15cfa46786a112860548ce12a2be71d` |
| PR_STATE | OPEN |
| PR_IS_DRAFT | true |
| WORKTREE_CLEAN_AT_ENTRY | **true** (measured via `git status --porcelain`) |
| ENTRY_WORKTREE_CLEAN_MEASURED | **true** |
| BACKEND_TREE_SHA_AT_ENTRY | `453da01cdec9500db1e112f5afa7d0169f6da138` |
| FROZEN_EXECUTABLE_BACKEND_TREE_SHA | `453da01cdec9500db1e112f5afa7d0169f6da138` |
| FINAL_PR_BACKEND_TREE_SHA | `453da01cdec9500db1e112f5afa7d0169f6da138` |
| BACKEND_TREE_UNCHANGED_BY_DOCS_ONLY_COMMIT_SCOPE | **true** |

Prior R3B1R.1.2b entry (`106d145460db25a68953495eecdc09c744afbe16`) is preserved in its historical artifact. This repaired run uses the current PR HEAD after the evidence-repair tool commit; executable backend source bytes remain identical (`453da01c…`).

---

## 2. R3B1R.1.2b evidence defects acknowledged

`R3B1R112B_EVIDENCE_DEFECTS_ACKNOWLEDGED=true`

| ID | Defect |
|----|--------|
| **A** | Migration-line parser used broken `r"^\d{{14}}_"` instead of `^\d{14}_` |
| **B** | Fallback could inject expected bridge names from arbitrary output text |
| **C** | `would_deploy_set` hardcoded count=2 and bridge names without independent derivation |
| **D** | `GIT_STATUS_BEFORE_ENV` emitted remotely but omitted from meta parser; SUCCESS despite dirty-clone signal |
| **E** | `entry.worktree_clean` hardcoded `True` instead of measured porcelain |
| **F** | Non-root secret probe printed `synqdrive_admin_readable=false` on both success and `PermissionError` |

Historical R3B1R.1.2b artifact is **not rewritten**. Its retry-readiness conclusion is **superseded** by this fail-closed replay.

---

## 3. Code repairs (audit tool only)

| Scope | Count |
|-------|-------|
| APPLICATION_RUNTIME_CHANGED | **0** |
| BACKEND_RUNTIME_CHANGED | **0** |
| MIGRATION_SOURCE_CHANGED | **0** |
| SCHEMA_PRISMA_CHANGED | **false** |
| FAIL_OPEN_EXPECTED_VALUE_FALLBACKS | **0** |

Repairs in `ci_r3b1r112b_run_preflight.py`:

1. **`parse_prisma_migrate_status()`** — strict `^\d{14}_` line recognition; no substring fallback to expected bridge names; `PARSER_VALID=false` blocks SUCCESS.
2. **`compute_independent_would_deploy()`** — `source_migration_names − finished_ledger_names` from frozen clone inventory + live `_prisma_migrations` ledger (not from Prisma status parser).
3. **`exact_sha_clone_eval()`** — fetch/checkout exact SHA; parse `GIT_STATUS_BEFORE_ENV`, `NO_ENV_BEFORE`, migration inventory; root/sudo `prisma validate` + `prisma migrate status` only.
4. **Two-clone deterministic replay** — independent replay-a and replay-b evaluations.
5. **Measured worktree** — local `git status --porcelain` at entry.
6. **Secret probe fix** — `SYNQDRIVE_ADMIN_ENV_READABLE=true/false` reflects actual read outcome.
7. **Start/end fingerprints** — ledger and catalog captured at run start and end.
8. **Parser negative regression fixtures** — six sanitized cases, zero false acceptances.

No new orchestration tool was created.

---

## 4. Parser negative regression tests

| Field | Value |
|-------|-------|
| STATUS_PARSER_NEGATIVE_TESTS_TOTAL | **6** |
| STATUS_PARSER_FALSE_ACCEPTANCES | **0** |

| Case | Expected | Result |
|------|----------|--------|
| case1_exact_two_bridges | PASS | PASS |
| case2_two_bridges_plus_unknown | BLOCK | BLOCK |
| case3_one_bridge_missing | BLOCK | BLOCK |
| case4_malformed_pending_section | BLOCK | BLOCK |
| case5_unknown_database_only | BLOCK | BLOCK |
| case6_status_command_failure | BLOCK | BLOCK |

---

## 5. Parsed Prisma migrate status (Production root/sudo context)

Both replay clones produced identical parsed output.

| Field | Value |
|-------|-------|
| PRISMA_VALIDATE_EXIT_CODE | **0** |
| PRISMA_STATUS_COMMAND_EXECUTED | **true** |
| STATUS_RC | **1** (expected with pending migrations) |
| PARSER_VALID | **true** |
| DATABASE_ONLY_PARSE_VALID | **true** |
| STATUS_PENDING_COUNT | **2** |
| STATUS_UNEXPECTED_PENDING_NAMES | **[]** |
| STATUS_MISSING_EXPECTED_PENDING_NAMES | **[]** |
| UNEXPLAINED_DATABASE_ONLY_MIGRATIONS | **0** |

**STATUS_PENDING_NAMES:**

- `20260816152200_ci_r3b1r11_organizations_short_code_history_bridge`
- `20260816163000_ci_r3b1r11_vehicles_drive_type_history_bridge`

**STATUS_DATABASE_ONLY_NAMES:** 17 accepted privacy-domain migrations (all explained via R3B1N.1 authority set).

---

## 6. Independent would-deploy derivation

| Field | Value |
|-------|-------|
| INDEPENDENT_CALCULATION_VALID | **true** |
| INDEPENDENT_WOULD_DEPLOY_COUNT | **2** |
| SOURCE_MIGRATION_COUNT | **308** |
| FINISHED_LEDGER_UNIQUE_COUNT | **323** |
| UNEXPECTED_INDEPENDENT_WOULD_DEPLOY_NAMES | **[]** |
| MISSING_EXPECTED_INDEPENDENT_NAMES | **[]** |

**INDEPENDENT_WOULD_DEPLOY_NAMES:**

- `20260816152200_ci_r3b1r11_organizations_short_code_history_bridge`
- `20260816163000_ci_r3b1r11_vehicles_drive_type_history_bridge`

| Field | Value |
|-------|-------|
| STATUS_VS_INDEPENDENT_SET_MATCH | **true** |

Prisma status pending set and independent source-vs-ledger set are **identical** and **exactly the two bridge migrations**.

---

## 7. Fresh-clone and worktree evidence

| Field | Replay A | Replay B |
|-------|----------|----------|
| REQUESTED_RETRY_SOURCE_SHA | `14a48b00…` | `14a48b00…` |
| ACTUAL_RETRY_SOURCE_SHA | `14a48b00…` | `14a48b00…` |
| ACTUAL_RETRY_BACKEND_TREE_SHA | `453da01c…` | `453da01c…` |
| FRESH_RETRY_CLONE_GIT_STATUS_COUNT_BEFORE_RUNTIME | **0** | **0** |
| FRESH_RETRY_CLONE_CLEAN_BEFORE_RUNTIME | **true** | **true** |
| NO_ENV_BEFORE_RUNTIME | **true** | **true** |

Exact SHA requested equals actual in both replays.

---

## 8. Secret permissions and DATABASE_URL probe

| Field | Value |
|-------|-------|
| owner / group / mode | root / root / 600 |
| SECRET_PERMISSION_CONFIGURATION_CANONICAL | **true** |
| SYNQDRIVE_ADMIN_ENV_READABLE | **false** (correct probe semantics) |
| ROOT_ENV_READABLE | **true** |
| DATABASE_URL_PRESENT | **true** |
| DATABASE_URL_LENGTH_GT_ZERO | **true** |

No permission changes. DATABASE_URL value never printed.

---

## 9. Bridge SHA freeze (recalculated)

| Migration | SHA256 | Match |
|-----------|--------|-------|
| short_code bridge | `30557c650d38c40ce58923d52d4243f1a39ab7ee85591443e217d18316610006` | **true** |
| drive_type bridge | `a5054affe5a97b14dddc8eee10103597f49f206e916d6620baa4809a54277c82` | **true** |
| BRIDGE_SHA_MISMATCHES | **0** | |

---

## 10. Two-clone deterministic replay

| Field | Value |
|-------|-------|
| REPLAY_A_SOURCE_SHA = REPLAY_B_SOURCE_SHA | **true** |
| REPLAY_A_BACKEND_TREE_SHA = REPLAY_B_BACKEND_TREE_SHA | **true** |
| REPLAY_A_STATUS_PENDING_SET = REPLAY_B_STATUS_PENDING_SET | **true** (exact two bridges) |
| REPLAY_A_INDEPENDENT_WOULD_DEPLOY_SET = REPLAY_B_INDEPENDENT_WOULD_DEPLOY_SET | **true** (exact two bridges) |
| DETERMINISTIC_REPLAY_PASS | **true** |

---

## 11. Four-object parity (live Production, read-only)

| Field | Value |
|-------|-------|
| LIVE_SHORT_CODE_EXACT | **true** |
| LIVE_SHORT_CODE_INDEX_EXACT | **true** |
| LIVE_DRIVETYPE_EXACT | **true** |
| LIVE_VEHICLES_DRIVE_TYPE_EXACT | **true** |

---

## 12. R3B / M252 parity

| Field | Value |
|-------|-------|
| R3B objects | **19/19** |
| R3B tables | **9/9** |
| R3B enums | **10/10** |
| R3B properties | **54/54** |
| M252_SEMANTIC_MISMATCHES | **0** |

---

## 13. Live ledger (derived)

| Field | Value |
|-------|-------|
| LEDGER_ROW_COUNT | **339** |
| LEDGER_FINISHED_COUNT | **323** |
| LEDGER_FAILED_COUNT | **16** |
| LEDGER_INCOMPLETE_COUNT | **0** |
| LEDGER_FINGERPRINT | `b6ec53dbfd6c09ab8641fce2c96fe9fa996b3ec0dcd36c6a1c0c605c71e684e2` |
| BRIDGE_1_LEDGER_ROW_EXISTS | **false** |
| BRIDGE_2_LEDGER_ROW_EXISTS | **false** |
| NEW_FAILED_ROWS_SINCE_R3B1R112B | **0** (derived vs R3B1R.1.2b baseline failed count 16) |

---

## 14. Production immutability (start/end fingerprints)

| Field | Start | End | Unchanged |
|-------|-------|-----|-----------|
| LEDGER_FINGERPRINT | `b6ec53db…` | `b6ec53db…` | **true** |
| CATALOG_FINGERPRINT | `407bf140…` | `407bf140…` | **true** |

| Field | Value |
|-------|-------|
| PRODUCTION_DATABASE_MUTATIONS_R3B1R112B1 | **0** |
| PRODUCTION_LEDGER_MUTATIONS_R3B1R112B1 | **0** |
| PRODUCTION_CATALOG_MUTATIONS_R3B1R112B1 | **0** |

---

## 15. Frozen retry command (not executed)

```bash
sudo bash -lc '
set -eo pipefail
set -a
source /opt/synqdrive/shared/backend.env
set +a
set -u
cd "<EXACT_RETRY_BACKEND_PATH>"
npm run prisma:migrate:deploy
'
```

| Field | Value |
|-------|-------|
| RETRY_COMMAND_SHA256 | `192edfa3eb4dc110c788e7fca80f4478b55a2a325e71899a725dd67f08dbfcbc` |
| FROZEN_EXECUTABLE_BACKEND_TREE_SHA | `453da01cdec9500db1e112f5afa7d0169f6da138` |
| RETRY_ENV_FILE_MECHANISM | EXPLICIT_SOURCE_ONLY |
| NO_TEMP_ENV_SYMLINK_REQUIRED | **true** |

Future retry must use a backend tree whose SHA matches `FROZEN_EXECUTABLE_BACKEND_TREE_SHA`.

---

## 16. Boundaries preserved

| Boundary | Status |
|----------|--------|
| `prisma migrate deploy` executed | **false** |
| Production DDL/DML | **0** |
| `_prisma_migrations` modified | **false** |
| Bridge migrations modified | **false** |
| `schema.prisma` modified | **false** |
| `backend.env` permissions modified | **false** |
| PR #1054 merged | **false** |
| R3B1R.2 started | **false** |

---

## 17. Machine status

```
CI_R3B1R112B1_FAIL_CLOSED_RETRY_PREFLIGHT_EVIDENCE_REPAIR_COMPLETED
R3B1R112B_EVIDENCE = SUPERSEDED_BY_FAIL_CLOSED_REPLAY
RETRY_PREFLIGHT_AUTHORITY = INDEPENDENTLY_DERIVED_AND_FAIL_CLOSED
EXECUTION_ENV_REMEDIATION = CANONICAL_ROOT_SUDO_PATH_VERIFIED
DATABASE_STATE = UNCHANGED
R3B1R112_RETRY_READINESS = READY_FOR_SEPARATE_EXPLICIT_PRODUCTION_RETRY_AUTHORIZATION
R3B1R12_READINESS = NOT_READY
PR1054_MERGE_READINESS = BLOCKED
```

---

**R3B1R.1.2b.1 DID NOT EXECUTE PRISMA MIGRATE DEPLOY.**  
**NO PRODUCTION DATABASE MUTATION OCCURRED.**

The previous R3B1R.1.2b retry-readiness evidence was replayed with fail-closed parsing and an independently derived deploy set.

A Production retry still requires **separate explicit user authorization**.
