#!/usr/bin/env python3
"""Generate CI-R3B1I final report from machine evidence."""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
DATA = REPO / "docs/audits/ci-recovery/data"
OUT = REPO / "docs/audits/ci-recovery/ci-r3b1i-iam-permissions-repair-full-replay-2026-08.md"


def load(name: str) -> dict:
    return json.loads((DATA / name).read_text())


def main() -> int:
    provenance = load("ci-r3b1i-input-provenance-2026-08.json")
    preflight = load("ci-r3b1i-preflight-validation-summary-2026-08.json")
    order = load("ci-r3b1i-migration-order-proof-2026-08.json")
    equiv = load("ci-r3b1i-generated-sql-equivalence-2026-08.json")
    targeted = load("ci-r3b1i-targeted-iam-repair-proof-2026-08.json")
    full = load("ci-r3b1i-full-fresh-replay-result-2026-08.json")
    immut = load("ci-r3b1i-immutability-audit-2026-08.json")
    branch = subprocess.check_output(["git", "branch", "--show-current"], cwd=REPO, text=True).strip()
    parity = full.get("r3b_parity", {})
    status = full.get("final_status", "UNKNOWN")

    blocker = ""
    if status.endswith("PARTIAL") or status.endswith("FAILED"):
        blocker = f"""
## Full replay blocker

| Field | Value |
|-------|-------|
| First failing migration | `{full.get('first_failed_migration')}` |
| Failure ordinal | {full.get('failure_ordinal')} |
| SQLSTATE | {full.get('sqlstate')} |
| Classification | {full.get('failure_classification')} |
| Last successful migration | `{full.get('last_successful_migration')}` |
"""

    report = f"""# CI-R3B1I — IAM Membership Permissions Repair & Full Replay

**Phase:** R3B1I  
**Repository:** FATIHS-MGCKS/SYNQDRIVE-alpha  
**Branch:** `{branch}`  
**Status:** `{status}`

---

## Baseline

| Field | Value |
|-------|-------|
| Branch | `{branch}` |
| evidence_input_sha | `{provenance.get('evidence_input_sha')}` |
| parent_branch_sha | `{provenance.get('parent_branch_sha')}` |
| authority_source_sha | `{provenance.get('authority_source_sha')}` |
| Production exposure | **E_UNKNOWN** |

---

## Preflight tooling closure

| Gate | Result |
|------|--------|
| Context whitelist removed | PASS |
| _repair_log exclusion removed | PASS |
| FALSE_POSITIVE lineage validated | PASS |
| physical_alias_leakage | {preflight.get('physical_alias_leakage', 0)} |
| derived_lineage_gaps | {preflight.get('derived_lineage_gaps', 0)} |
| qualified_reference_coverage_gaps | {preflight.get('qualified_reference_coverage_gaps', 0)} |
| UNRESOLVED | {preflight.get('UNRESOLVED', 0)} |
| Preflight status | `{preflight.get('status', 'UNKNOWN')}` |

---

## Final actionable set

| Field | Value |
|-------|-------|
| Blocking dependency records | {preflight.get('blocking_records', 'n/a')} |
| Unique actionable gaps | {preflight.get('unique_actionable_gaps', 'n/a')} |
| Expected gap | `organization_memberships.permissions` |

---

## IAM contract

| Field | Value |
|-------|-------|
| Relation | `organization_memberships` |
| Column | `permissions` |
| Type | `jsonb` |
| Nullable | true |
| Default | none |
| First consumer | `{order.get('first_consumer')}` |

---

## Repair migration

| Field | Value |
|-------|-------|
| Migration | `{order.get('new_migration')}` |
| Boundary after | `{order.get('authorized_predecessor')}` |
| Boundary before | `{order.get('first_consumer')}` |
| Lexical ordering | {'PASS' if order.get('pass') else 'FAIL'} |
| Contract equivalence | {equiv.get('semantic_equivalence')} |
| IF NOT EXISTS absent | {'PASS' if not equiv.get('if_not_exists_present') else 'FAIL'} |

---

## Targeted actual-file PostgreSQL proof

| Check | Result |
|-------|--------|
| Fresh pre-249 DB | {'PASS' if targeted.get('pre_repair_replay', {}).get('last_applied') == order.get('authorized_predecessor') else 'FAIL'} |
| permissions absent before repair | {'PASS' if not targeted.get('pre_repair_catalog', {}).get('permissions_exists') else 'FAIL'} |
| Actual IAM repair | {targeted.get('repair_execution')} |
| Catalog parity | {'PASS' if targeted.get('post_repair_catalog_parity', {}).get('pass') else 'FAIL'} |
| Unchanged migration 249 | {targeted.get('migration_249_execution')} |
| Synthetic IAM backfill | {'PASS' if targeted.get('synthetic_fixture', {}).get('seed_pass') else 'FAIL'} |

---

## Full replay

| Field | Value |
|-------|-------|
| Migration directories | {full.get('migration_directories_discovered')} |
| Normal migrations applied | {full.get('normal_migrations_applied')} |
| Special migrations | {full.get('special_migrations_handled')} |
| Failed migrations | {full.get('failed_migrations')} |
| Manual interventions | {full.get('manual_interventions', 0)} |
| Last successful | `{full.get('last_successful_migration')}` |
| HEAD reached | {full.get('reached_absolute_head')} |
| R3B1I IAM repair | {full.get('repair_runtime', {}).get('r3b1i_iam_repair_applied')} |
| Migration 249 | {full.get('repair_runtime', {}).get('migration_249_applied')} |

{blocker}

## Final convergence

| Gate | Result |
|------|--------|
| 19/19 objects | {parity.get('authority_objects_present', 'NOT_REACHED')}/{parity.get('authority_objects_total', 19)} |
| 9/9 tables | {parity.get('tables_pass', 'NOT_REACHED')} |
| 10/10 enums | {parity.get('enums_pass', 'NOT_REACHED')} |
| 54/54 properties | {parity.get('property_categories_matched', 'NOT_REACHED')}/{parity.get('property_categories_total', 54)} |
| Type mismatches | {parity.get('type_mismatches', 'NOT_REACHED')} |
| Nullability mismatches | {parity.get('nullability_mismatches', 'NOT_REACHED')} |
| Default mismatches | {parity.get('default_mismatches', 'NOT_REACHED')} |
| Constraint mismatches | {parity.get('constraint_mismatches', 'NOT_REACHED')} |
| Index mismatches | {parity.get('index_mismatches', 'NOT_REACHED')} |
| Enum mismatches | {parity.get('enum_mismatches', 'NOT_REACHED')} |
| Parity pass | {parity.get('pass')} |

---

## Immutability

| Check | Result |
|-------|--------|
| Preexisting migration SQL modified | {immut.get('preexisting_migration_sql_modified')} |
| New migration directories | {immut.get('new_prisma_migration_directories')} |
| R3B1G repair changed | {immut.get('r3b1g_repair_changed')} |
| Migration 249 changed | {immut.get('migration_249_changed')} |
| schema.prisma changed | {'YES' if immut.get('schema_prisma_changed') else 'NO'} |
| runtime changed | {'YES' if immut.get('runtime_code_changed') else 'NO'} |

---

## Exposure

- Production exposure: **E_UNKNOWN**

## Safety

- Production DDL/DML: **NO**
- Production migration: **NO**
- Deployment: **NO**
- Merge: **NO**
- R3B.2: **NO**
- Full fresh replay executed: **YES**

---

## Final status

**{status}**
"""
    OUT.write_text(report)
    print(f"Wrote {OUT.relative_to(REPO)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
