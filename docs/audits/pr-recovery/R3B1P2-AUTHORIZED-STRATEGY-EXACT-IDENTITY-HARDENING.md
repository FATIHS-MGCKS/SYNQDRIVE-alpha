# R3B1P.2 — AUTHORIZED_STRATEGY Exact-Identity Hardening

**Phase:** `CI-R3B1P.2`
**Generated:** `2026-08-16T09:04:13.720192+00:00`
**Result:** `REMEDIATION_COMPLETE`

## 1. Inherited R3B1P.1 NO-GO

- `CI_R3B1P1_INDEPENDENT_FROZEN_PREFLIGHT_REPLAY_BLOCKED`
- `R3B1P_ACCEPTANCE = R3B1P_NOT_ACCEPTED`
- `R3B1Q_READINESS = R3B1Q_NOT_READY`

## 2. Exact failure reproduction

- `R3B1P1_FAILED_TEST=AUTHORIZED_STRATEGY_FALSE_POSITIVE_TESTS`
- `R3B1P1_FALSE_POSITIVE_OPERATION=['wrong_fk_target', 'wrong_index_column', 'wrong_unique_index_name']`
- `R3B1P1_EXPECTED_CLASSIFICATION=blocking (NEW_STRATEGY_DRIFT or gate fail)`
- `R3B1P1_ACTUAL_CLASSIFICATION=AUTHORIZED_STRATEGY_DELTA`

## 3. Root cause

- Evaluator function: `has_explicit_strategy_authority()`
- Unsafe branch removed: `if M252_TABLE in raw and any(k in upper for k in ("CREATE INDEX", "CREATE UNIQUE INDEX", "ADD CONSTRAINT", "PRIMARY KEY")): return True`
- Why unsafe: Table-name substring gate authorized any M252 sub-operation without exact semantic identity match

## 4. Old classifier behavior

Any M252-table operation whose SQL contained CREATE INDEX / CREATE UNIQUE INDEX / ADD CONSTRAINT / PRIMARY KEY was authorized by table-name presence alone.

## 5. Hardened classifier contract

- `AUTHORIZED_STRATEGY_DEFAULT_ALLOW=false`
- `UNMATCHED_AUTHORIZED_CANDIDATE_BLOCKS=true`
- Deny-by-default: `exact_authorized_identity_match` → AUTHORIZED_STRATEGY else blocking
- Cardinality: 0 matches → BLOCK; 1 exact match → AUTHORIZED_STRATEGY; >1 → BLOCK

## 6. Canonical exact authority set

- Closed-world records: **5**
- `AUTH-M252-TABLE` (table)
- `AUTH-M252-UNIQUE-IDEMPOTENCY` (index)
- `AUTH-M252-COMPOSITE-ORG-MBR-CREATED` (index)
- `AUTH-M252-FK-ORG` (foreign_key)
- `AUTH-M252-FK-MEMBERSHIP` (foreign_key)

## 7. Identity fields per operation

### `AUTH-M252-TABLE`
- schema, table, columns (name/type/nullability/default), primary_key_columns

### `AUTH-M252-UNIQUE-IDEMPOTENCY`
- schema, table, unique, columns, access_method, include_columns, predicate, valid, ready

### `AUTH-M252-COMPOSITE-ORG-MBR-CREATED`
- schema, table, unique, columns, access_method, include_columns, predicate, valid, ready

### `AUTH-M252-FK-ORG`
- source_table, source_columns, target_table, target_columns, match_type, on_update, on_delete, deferrability, validated

### `AUTH-M252-FK-MEMBERSHIP`
- source_table, source_columns, target_table, target_columns, match_type, on_update, on_delete, deferrability, validated

## 8. Negative mutation matrix

- P2 golden mutation tests executed: **47**
- False positives: **0**

## 9. R3B1P.1 permanent regression test

- `R3B1P1_REGRESSION_TEST_PRESENT=true`
- `r3b1p1_regression_wrong_fk_target`
- `r3b1p1_regression_wrong_index_column`
- `r3b1p1_regression_wrong_unique_index_name`

## 10. Legitimate-operation proof

| OPERATION_ID | AUTHORITY_ID | RAW_CLASSIFICATION | EXACT_MATCH_COUNT | FINAL_CLASSIFICATION |
|---|---|---|---|---|
| `CREATE TABLE|create_tabl` | `AUTH-M252-TABLE` | `AUTHORIZED_STRATEGY_DELTA` | 1 | `AUTHORIZED_STRATEGY_DELTA` |
| `CREATE UNIQUE INDEX|crea` | `AUTH-M252-UNIQUE-IDEMPOTENCY` | `AUTHORIZED_STRATEGY_DELTA` | 1 | `AUTHORIZED_STRATEGY_DELTA` |
| `CREATE INDEX|create_inde` | `AUTH-M252-COMPOSITE-ORG-MBR-CREATED` | `AUTHORIZED_STRATEGY_DELTA` | 1 | `AUTHORIZED_STRATEGY_DELTA` |
| `ALTER TABLE|foreign_key|` | `AUTH-M252-FK-ORG` | `AUTHORIZED_STRATEGY_DELTA` | 1 | `AUTHORIZED_STRATEGY_DELTA` |
| `ALTER TABLE|foreign_key|` | `AUTH-M252-FK-MEMBERSHIP` | `AUTHORIZED_STRATEGY_DELTA` | 1 | `AUTHORIZED_STRATEGY_DELTA` |

- `AUTHORIZED_STRATEGY_LEGITIMATE_TOTAL=5`
- `AUTHORIZED_STRATEGY_LEGITIMATE_PASSED=5`

## 11. PRE_EXISTING boundary proof

- `NEW_DRIFT_MISCLASSIFIED_AS_PRE_EXISTING=0`

## 12. Count-independence proof

- `DIFF_COUNT_BASED_AUTHORITY_LOGIC=0`

## 13. Extra-drift rejection proof

- `ADDITIONAL_DRIFT_SUPPRESSION=0`

## 14. Golden suite result

- `PREVIOUS_GOLDEN_TEST_COUNT=169`
- `CURRENT_GOLDEN_TEST_COUNT=169`
- `NEW_TESTS_ADDED=47` (CI-R3B1P.2 suite)
- `GOLDEN_TESTS_FAILED=0`
- `GOLDEN_TESTS_SKIPPED=0`

## 15. Terminal-gate fail-closed proof

- All scenarios blocked: **True**

## 16. Weak-matcher audit

- `unsafe_table_gate` in `ci_r3b1o3_diff_attribution.py`: found=False → **REMEDIATED**
- `ranked_match` in `ci_r3b1o3_diff_attribution.py`: found=False → **IRRELEVANT**
- `fuzzy_match` in `ci_r3b1o3_diff_attribution.py`: found=False → **IRRELEVANT**
- `exact_authority_matcher` in `ci_r3b1o3_diff_attribution.py`: found=True → **SAFE**
- `semantic_identity_compare` in `ci_r3b1p2_authorized_strategy_authority.py`: found=True → **SAFE**
- `fingerprint_cardinality_gate` in `ci_r3b1p2_authorized_strategy_authority.py`: found=True → **SAFE**

## 17. Fresh read-only Production result

- `PRODUCTION_MUTATIONS=0`
- Mode: `cached_production_diff_read_only_reclassification`
- Preflight pass: **True**
- TOTAL_DIFF: **399**
- PRE_EXISTING: **394**
- AUTHORIZED_STRATEGY: **5**

## 18. Production immutability proof

- No production DDL/DML executed in R3B1P.2
- Read-only reclassification against frozen production diff artifact

## 19. Changed files

- `docs/audits/ci-recovery/tooling/ci_r3b1p2_authorized_strategy_authority.py`
- `docs/audits/ci-recovery/tooling/ci_r3b1p2_golden_tests.py`
- `docs/audits/ci-recovery/tooling/ci_r3b1p2_run_remediation.py`
- `docs/audits/ci-recovery/tooling/ci_r3b1o3_diff_attribution.py`
- `docs/audits/ci-recovery/tooling/ci_r3b1o3_golden_tests.py`

## 20. Commit/push result

- Branch: `audit/ci-r3b1o4-tail-reconciliation-strategy-closure-2026-08`
- Pre-remediation SHA: `813ceaf9`
- Post-remediation SHA: `813ceaf9ac9ddb9c458128c151267c736f198443`

## 21. Exact next-phase boundary

- R3B1P.2 completes evaluator remediation only
- R3B1P.3 must independently replay the frozen repaired evaluator
- R3B1Q remains unauthorized

## Machine status

`CI_R3B1P2_AUTHORIZED_STRATEGY_EXACT_IDENTITY_HARDENING_COMPLETED`
`R3B1P_REMEDIATION = R3B1P_REMEDIATION_COMPLETED_REQUIRES_INDEPENDENT_REPLAY`
`R3B1Q_READINESS = R3B1Q_NOT_READY_PENDING_R3B1P3`

**PR #1054 MUST NOT BE MERGED YET. R3B1P IS STILL NOT FINALLY ACCEPTED. R3B1Q IS NOT AUTHORIZED. NO PRODUCTION EXECUTION WAS PERFORMED.**

**Changes / Architektur:** not updated (CI-recovery evidence scope only).
