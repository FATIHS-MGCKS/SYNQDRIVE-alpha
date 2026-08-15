#!/usr/bin/env python3
"""Generate CI-R3B1H markdown report from machine summary."""
from __future__ import annotations

import json
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "data"
OUT = Path(__file__).resolve().parents[1] / "ci-r3b1h-iam-insert-select-predecessor-closure-2026-08.md"
SUMMARY = DATA / "ci-r3b1h-final-validation-summary-2026-08.json"


def main() -> int:
    s = json.loads(SUMMARY.read_text())
    mt = s["sweep_249_to_head"]["classification_totals"]
    baseline = s["baseline"]
    pre249 = s["pre249_boundary"]
    auth = s["exact_repair_authority"]
    proof = s["targeted_postgresql"]
    imm = s["immutability"]
    perm = s["migration_249_prerequisites"].get("permissions_proof", {})

    md = f"""# CI-R3B1H — IAM Insert-Select Predecessor Closure

## Baseline

- Branch: `{s['branch']}`
- HEAD: `{s['HEAD_SHA']}`
- Base R3B1G SHA: `{s['BASE_R3B1G_SHA']}`

## R3B1G failure

- First failing migration: `{baseline['r3b1g_first_failed_migration']}`
- Ordinal: {baseline['r3b1g_failure_ordinal']}
- SQLSTATE: `{baseline['r3b1g_sqlstate']}`
- Error: column m.permissions does not exist
- Last successful: `{baseline['r3b1g_last_applied']}`
- R3B1G tire repair: {baseline['r3b1g_tire_repair_pass'] and 'PASS' or 'FAIL'}
- Migration 157: {baseline['migration_157_pass'] and 'PASS' or 'FAIL'}

## Pre-249 catalog

- Replay through `{pre249['last_applied']}`: {'PASS' if pre249['replay_pass'] else 'FAIL'}
- Stop before migration {pre249['ordinal']} (`{pre249['stop_before']}`)

## Migration 249 dependency inventory

See `data/ci-r3b1h-iam-predecessor-gap-matrix-2026-08.json` for full INSERT-SELECT inventory and per-statement records.

## Known permissions gap

- Relation: `organization_memberships`
- Column: `permissions`
- Classification: MISSING_HISTORY
- Physical type: jsonb
- Nullable: true
- Default: none
- Prisma authority commit: `{perm.get('first_prisma_appearance_commit')}`
- Pre-249 catalog exists: {perm.get('pre249_catalog_exists')}
- Migration creator: {perm.get('any_migration_creator') or 'none'}

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

- First migration: `{s['sweep_249_to_head']['first_migration']}`
- Last migration: `{s['sweep_249_to_head']['last_migration']}`
- Migrations scanned: {s['sweep_249_to_head']['migrations_scanned']}
- Dependency records: {s['sweep_249_to_head']['dependency_records']}

## Classification counters

| Class | Count |
|-------|------:|
| VALID | {mt.get('VALID', 0)} |
| MISSING_HISTORY | {mt.get('MISSING_HISTORY', 0)} |
| ORDERING_DEFECT | {mt.get('ORDERING_DEFECT', 0)} |
| CONDITIONAL_SAFE | {mt.get('CONDITIONAL_SAFE', 0)} |
| FALSE_POSITIVE | {mt.get('FALSE_POSITIVE', 0)} |
| INTENTIONAL | {mt.get('INTENTIONAL', 0)} |
| UNRESOLVED | {mt.get('UNRESOLVED', 0)} |

## Exact actionable gaps

- Unique actionable gaps: {auth['unique_actionable_gaps']}
- Exact contracts: {auth['exact_contracts']}

## Exact contracts

See `data/ci-r3b1h-exact-iam-predecessor-contracts-2026-08.json`.

## Repair topology

See `data/ci-r3b1h-iam-repair-topology-2026-08.json`.

## Targeted PostgreSQL proof

- Contract-compiled temporary repairs: {'PASS' if proof['proof_pass'] else 'FAIL'}
- Unchanged migration 249: {proof.get('migration_249_execution')}
- Consumer failures: {proof.get('consumer_failures')}

## Synthetic backfill proof

- Synthetic IAM fixture: {'PASS' if proof.get('synthetic_fixture_pass') else 'FAIL'}

## Coverage results

- Coverage gaps: {s['coverage'].get('coverage_gaps', 'n/a')}
- Migration 249 permissions represented: {s['coverage'].get('migration_249_permissions_represented')}

## Immutability

- Existing migration SQL changed: {imm['existing_migration_sql_changed']}
- New Prisma migrations: {imm['new_prisma_migrations']}
- schema.prisma changed: {imm['schema_prisma_changed']}
- Runtime changed: {imm['runtime_changed']}

## Safety

- Full replay beyond migration 249: NO
- Production DDL/DML: NO
- Production migrations: NO
- Deployment: NO
- Merge: NO
- R3B.2: NO

## Final status

**{s['final_status']}**
"""
    OUT.write_text(md)
    print(f"Wrote {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
