# CI-R3B1H — IAM Insert-Select Predecessor Closure

## Baseline

- Branch: `fix/ci-r3b1h-iam-insert-select-closure-2026-08`
- HEAD: `25e3a18ed9eab1322a85d65fcfdf6a449f2ed222`
- Base R3B1G SHA: `25e3a18ed9eab1322a85d65fcfdf6a449f2ed222`

## R3B1G failure

- First failing migration: `20260721250000_iam_versioned_role_assignments`
- Ordinal: 249
- SQLSTATE: `42703`
- Error: column m.permissions does not exist
- Last successful: `20260721240000_iam_last_selected_organization`
- R3B1G tire repair: PASS
- Migration 157: PASS

## Pre-249 catalog

- Replay through `20260721240000_iam_last_selected_organization`: PASS
- Stop before migration 249 (`20260721250000_iam_versioned_role_assignments`)

## Migration 249 dependency inventory

See `data/ci-r3b1h-iam-predecessor-gap-matrix-2026-08.json` for full INSERT-SELECT inventory and per-statement records.

## Known permissions gap

- Relation: `organization_memberships`
- Column: `permissions`
- Classification: MISSING_HISTORY
- Physical type: jsonb
- Nullable: true
- Default: none
- Prisma authority commit: `68150912`
- Pre-249 catalog exists: False
- Migration creator: none

## Historical IAM authority

Historical Prisma snapshot at IAM implementation commit defines `OrganizationMembership.permissions` as optional `Json?` with physical name `permissions`. No migration in repository history executes `ADD COLUMN permissions` on `organization_memberships`.

## INSERT-SELECT analyzer root cause

Before R3B1H, `extract_statement_expression_dependencies()` did not extract INSERT ... SELECT source columns, and `check_statement_dependencies()` did not classify INSERT-SELECT prerequisites. R3B1G full replay therefore reached migration 249 before static analysis flagged `m.permissions`.

## Analyzer hardening

- Added `insert_select_dependency_extractor.py`
- Wired INSERT-SELECT extraction into expression dependency pipeline
- Added `add_insert_select_dependency_records()` in migration analyzer
- Golden tests: see `data/ci-r3b1h-insert-select-golden-tests-2026-08.json`

## Remaining migration 249→HEAD sweep

- First migration: `20260721250000_iam_versioned_role_assignments`
- Last migration: `20260814130000_ci_r3b_post_replay_parity_reconciliation`
- Migrations scanned: 56
- Dependency records: 268

## Classification counters

| Class | Count |
|-------|------:|
| VALID | 178 |
| MISSING_HISTORY | 90 |
| ORDERING_DEFECT | 0 |
| CONDITIONAL_SAFE | 0 |
| FALSE_POSITIVE | 0 |
| INTENTIONAL | 0 |
| UNRESOLVED | 0 |

## Exact actionable gaps

- Unique actionable gaps: 1
- Exact contracts: 1

## Exact contracts

See `data/ci-r3b1h-exact-iam-predecessor-contracts-2026-08.json`.

## Repair topology

See `data/ci-r3b1h-iam-repair-topology-2026-08.json`.

## Targeted PostgreSQL proof

- Contract-compiled temporary repairs: PASS
- Unchanged migration 249: PASS
- Consumer failures: 0

## Synthetic backfill proof

- Synthetic IAM fixture: PASS

## Coverage results

- Coverage gaps: 0
- Migration 249 permissions represented: True

## Immutability

- Existing migration SQL changed: 0
- New Prisma migrations: 0
- schema.prisma changed: False
- Runtime changed: False

## Safety

- Full replay beyond migration 249: NO
- Production DDL/DML: NO
- Production migrations: NO
- Deployment: NO
- Merge: NO
- R3B.2: NO

## Final status

**CI_R3B1H_IAM_INSERT_SELECT_PREDECESSOR_CLOSURE_COMPLETED**
