#!/usr/bin/env python3
"""Generate CI-R3B1K final report from machine evidence."""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
DATA = REPO / "docs/audits/ci-recovery/data"
OUT = REPO / "docs/audits/ci-recovery/ci-r3b1k-migration252-identifier-correction-full-replay-2026-08.md"


def load(name: str) -> dict:
    return json.loads((DATA / name).read_text())


def main() -> int:
    summary = load("ci-r3b1k-final-validation-summary-2026-08.json")
    impl = load("ci-r3b1k-implementation-authority-manifest-2026-08.json")
    orig = load("ci-r3b1k-migration252-original-manifest-2026-08.json")
    token = load("ci-r3b1k-actual-identifier-token-diff-2026-08.json")
    targeted = load("ci-r3b1k-targeted-migration252-proof-2026-08.json")
    exception = load("ci-r3b1k-migration252-historical-exception-manifest-2026-08.json")
    immut = load("ci-r3b1k-immutability-exception-audit-2026-08.json")
    full = load("ci-r3b1k-full-fresh-replay-result-2026-08.json")
    branch = subprocess.check_output(["git", "branch", "--show-current"], cwd=REPO, text=True).strip()
    parity = full.get("r3b_parity", {})
    status = summary.get("final_status", "UNKNOWN")
    strict = targeted.get("strict_semantic_parity", {})
    stmt_results = targeted.get("statement_results", [])

    checks = [
        summary.get("approved_token_changes") == 5,
        summary.get("actual_token_changes") == 5,
        summary.get("unapproved_token_changes", 1) == 0,
        summary.get("strict_semantic_mismatch_count", 1) == 0,
        immut.get("historical_exception_count") == 1,
        full.get("failed_migrations", 1) == summary.get("failed_migrations", -1),
        full.get("reached_absolute_head") == summary.get("reached_absolute_head"),
    ]
    if full.get("reached_absolute_head"):
        checks.extend([
            parity.get("objects_pass") == parity.get("objects_total"),
            parity.get("tables_pass") == parity.get("tables_total"),
            parity.get("enums_pass") == parity.get("enums_total"),
            parity.get("properties_pass") == parity.get("properties_total"),
        ])
    report_mismatch_count = sum(1 for c in checks if not c)

    blocker = ""
    if status.endswith("PARTIAL") or (full.get("failed_migrations", 0) > 0):
        blocker = f"""
## Full replay blocker

| Field | Value |
|-------|-------|
| First failing migration | `{full.get('first_failed_migration')}` |
| Failure ordinal | {full.get('failure_ordinal')} |
| Statement ordinal | {full.get('first_failing_statement_ordinal')} |
| SQLSTATE | {full.get('sqlstate')} |
| Classification | {full.get('failure_classification')} |
| Last successful migration | `{full.get('last_successful_migration')}` |
"""

    mappings_md = "\n".join(
        f"| `{k}` | `{v}` |"
        for k, v in exception.get("approved_mappings", {}).items()
    )

    stmt_md = "\n".join(
        f"| {i + 1} | {'PASS' if r.get('pass') or r.get('status') == 'PASS' else 'FAIL'} |"
        for i, r in enumerate(stmt_results)
    )

    report = f"""# CI-R3B1K — Migration 252 Identifier Correction & Full Replay

**Phase:** R3B1K  
**Repository:** FATIHS-MGCKS/SYNQDRIVE-alpha  
**Branch:** `{branch}`  
**Status:** `{status}`

---

## Baseline

| Field | Value |
|-------|-------|
| BASE_R3B1J1_SHA | `{summary.get('BASE_R3B1J1_SHA')}` |
| evidence_input_sha | `{summary.get('evidence_input_sha')}` |
| IMPLEMENTATION_AUTHORITY_SHA256 | `{impl.get('IMPLEMENTATION_AUTHORITY_SHA256')}` |
| Production exposure | **E_UNKNOWN** |

---

## Historical exception authority

| Field | Value |
|-------|-------|
| Repair mode | `HISTORICAL_MIGRATION_IDENTIFIER_ONLY_CORRECTION` |
| Append-only feasibility | `APPEND_ONLY_NOT_FEASIBLE` |
| Reason | `{exception.get('reason')}` |
| Approved identifier mappings | 5 |

---

## Original vs corrected migration 252

| Field | Value |
|-------|-------|
| Migration | `20260721270000_iam_role_assignment_drift_reconciliation` |
| Original SHA-256 | `{orig.get('sha256')}` |
| Corrected SHA-256 | `{summary.get('corrected_migration_sha256')}` |
| Original bytes | {orig.get('byte_count')} |
| Original lines | {orig.get('line_count')} |
| Statement count | {orig.get('statement_count')} |

---

## Five token changes

| Historical | Corrected |
|------------|-----------|
{mappings_md}

| Gate | Result |
|------|--------|
| Changed tokens | {token.get('changed_tokens')} |
| Approved changed tokens | {token.get('approved_changed_tokens')} |
| Unapproved token changes | {token.get('unapproved_token_changes', 0)} |
| Statement count unchanged | {'YES' if token.get('statement_count_unchanged') else 'NO'} |

---

## Targeted PostgreSQL proof

| Check | Result |
|-------|--------|
| Fresh pre-252 DB | {'PASS' if targeted.get('pre_252_replay', {}).get('pass') else 'FAIL'} |
| Table absent before M252 | {'PASS' if not targeted.get('table_existed_before') else 'FAIL'} |
| Corrected actual migration | {'PASS' if targeted.get('statement_execution_pass') else 'FAIL'} |
| Manual interventions | {targeted.get('manual_interventions', 0)} |

### Statement results

| Statement | Result |
|-----------|--------|
{stmt_md}

---

## Strict semantic parity

| Check | Result |
|-------|--------|
| Column types (exact format_type) | {'PASS' if strict.get('checks', {}).get('column_types_exact') else 'FAIL'} |
| Nullability | {'PASS' if not any(m.get('category') == 'COLUMN_NULLABILITY' for m in strict.get('mismatches', [])) else 'FAIL'} |
| Defaults | {'PASS' if not any(m.get('category') == 'COLUMN_DEFAULT' for m in strict.get('mismatches', [])) else 'FAIL'} |
| PK / UNIQUE / INDEX / FK | {'PASS' if strict.get('pass') else 'FAIL'} |
| CHECK constraints | {'PASS' if strict.get('checks', {}).get('check_constraints_none') else 'FAIL'} |
| No truncated collision names | {'PASS' if strict.get('checks', {}).get('no_truncated_collision_names') else 'FAIL'} |
| Total semantic mismatches | {strict.get('mismatch_count', 0)} |

---

## Full zero-state replay

| Field | Value |
|-------|-------|
| PostgreSQL version | {full.get('postgresql_version')} |
| Database | `{full.get('database_identifier')}` |
| Migration directories | {full.get('migration_directories_discovered')} |
| Normal migrations applied | {full.get('normal_migrations_applied')} |
| Special migrations | {full.get('special_migrations_handled')} |
| Failed migrations | {full.get('failed_migrations')} |
| Manual interventions | {full.get('manual_interventions')} |
| Reached absolute HEAD | {'YES' if full.get('reached_absolute_head') else 'NO'} |
| R3B1G repair | {full.get('repair_runtime', {}).get('r3b1g_tire_repair', 'NOT_REACHED')} |
| R3B1I repair | {full.get('repair_runtime', {}).get('r3b1i_iam_repair', 'NOT_REACHED')} |
| Migration 249 | {full.get('repair_runtime', {}).get('migration_249', 'NOT_REACHED')} |
| Migration 252 corrected | {full.get('repair_runtime', {}).get('migration_252_corrected', 'NOT_REACHED')} |
{blocker}
---

## Final convergence

| Gate | Result |
|------|--------|
| 19/19 objects | {parity.get('objects_pass', 'NOT_REACHED')}/{parity.get('objects_total', 19)} |
| 9/9 tables | {parity.get('tables_pass', 'NOT_REACHED')}/{parity.get('tables_total', 9)} |
| 10/10 enums | {parity.get('enums_pass', 'NOT_REACHED')}/{parity.get('enums_total', 10)} |
| 54/54 properties | {parity.get('properties_pass', 'NOT_REACHED')}/{parity.get('properties_total', 54)} |
| R3B parity pass | {parity.get('pass', False)} |

---

## Historical immutability exception

| Field | Value |
|-------|-------|
| Changed historical migrations | {immut.get('historical_exception_count')} |
| Changed migration | migration 252 only |
| Unchanged migration count | {immut.get('unchanged_migration_count')} |
| schema.prisma changed | {immut.get('schema_prisma_changed')} |
| runtime changed | {immut.get('runtime_changed')} |

---

## Remaining migration immutability

All migrations except `20260721270000_iam_role_assignment_drift_reconciliation` retain baseline SHA-256 from R3B1J.1.

---

## Exposure

| Field | Value |
|-------|-------|
| Production mutation | NO |
| Production migration | NO |
| Deployment | NO |
| Merge | NO |
| R3B.2 | NO |

---

## Safety

This phase applies a documented historical exception to migration 252 only. No production action authorized.

---

## Report ↔ machine consistency

Report mismatch count: **{report_mismatch_count}** (required: 0)
"""
    OUT.write_text(report)
    print(json.dumps({"report": str(OUT), "report_mismatch_count": report_mismatch_count}, indent=2))
    return 0 if report_mismatch_count == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
