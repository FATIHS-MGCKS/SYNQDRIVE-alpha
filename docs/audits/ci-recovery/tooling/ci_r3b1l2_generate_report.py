#!/usr/bin/env python3
"""Generate CI-R3B1L.2 final report."""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
DATA = REPO / "docs/audits/ci-recovery/data"
OUT = REPO / "docs/audits/ci-recovery/ci-r3b1l2-prisma-diff-parser-scope-authority-2026-08.md"


def load(name: str) -> dict:
    return json.loads((DATA / name).read_text())


def main() -> int:
    summary = load("ci-r3b1l2-final-validation-summary-2026-08.json")
    input_manifest = load("ci-r3b1l2-prisma-diff-input-manifest-2026-08.json")
    parser_coverage = load("ci-r3b1l2-prisma-diff-parser-coverage-2026-08.json")
    classification = load("ci-r3b1l2-complete-prisma-diff-classification-2026-08.json")
    reconciliation = load("ci-r3b1l2-old-parser-loss-reconciliation-2026-08.json")
    decisions = load("ci-r3b1l2-r3b-scope-drift-authority-2026-08.json")
    coverage = load("ci-r3b1l2-coverage-validation-2026-08.json")
    golden = load("ci-r3b1l2-golden-tests-2026-08.json")
    immut = load("ci-r3b1l2-immutability-audit-2026-08.json")
    authority = load("ci-r3b1l2-authority-manifest-2026-08.json")
    branch = subprocess.check_output(["git", "branch", "--show-current"], cwd=REPO, text=True).strip()
    status = summary.get("final_status", "UNKNOWN")
    trip = summary.get("trip_driving_impact_calculated_at", {})
    scope = summary.get("scope", {})
    auth_counts = summary.get("authority_decisions", {})

    checks = [
        input_manifest.get("pass") is True,
        parser_coverage.get("pass") is True,
        parser_coverage.get("independent_sql_statement_count") == parser_coverage.get("main_parser_sql_statement_count"),
        parser_coverage.get("unconsumed_sql_tokens") == 0,
        parser_coverage.get("duplicate_token_count") == 0,
        classification.get("UNRESOLVED_DIFF_COUNT") == 0,
        decisions.get("pass") is True,
        coverage.get("pass") is True,
        golden.get("pass") is True,
        immut.get("pass") is True,
        auth_counts.get("AUTHORITY_AMBIGUITY", 0) == 0,
        auth_counts.get("REPLAY_DB_DRIFT", 0) == 0,
        auth_counts.get("CROSS_EVIDENCE_CONTRADICTION", 0) == 0,
        trip.get("decision") == decisions.get("trip_driving_impact_calculated_at", {}).get("decision"),
        scope.get("R3B_SCOPE") == classification.get("R3B_SCOPE_DIFF_COUNT"),
    ]
    report_mismatch_count = sum(1 for c in checks if not c)

    r3b_ops = classification.get("r3b_scope_operations", [])
    out_scope = [o for o in classification.get("operations", []) if o.get("classification") == "OUT_OF_SCOPE"]
    family_counts: dict[str, int] = {}
    for o in out_scope:
        fam = o.get("operation_family", "OTHER")
        family_counts[fam] = family_counts.get(fam, 0) + 1

    report = f"""# CI-R3B1L.2 — Prisma Diff Parser Completeness & R3B Drift Authority

**Phase:** R3B1L.2  
**Branch:** `{branch}`  
**Status:** `{status}`

---

## Baseline

| Field | Value |
|-------|-------|
| BASE_R3B1L1_SHA | `{summary.get('BASE_R3B1L1_SHA')}` |
| evidence_input_sha | `{summary.get('evidence_input_sha')}` |
| Parent branch | `fix/ci-r3b1l1-exact-parity-diff-closure-2026-08` |

---

## Accepted zero-state replay state

Migration history replay remains accepted from prior phases (305 migrations, 0 failures, 0 manual interventions, absolute HEAD reached). R3B1L.1 established 54/54 catalog authority parity. **No new replay was executed in R3B1L.2.**

---

## R3B1L.1 parser defect

R3B1L.1 stored the complete Prisma schema-vs-replay-DB diff but its splitter discarded Prisma-comment-prefixed SQL blocks when accumulated text began with `--`. Only **{reconciliation.get('old_parser_reported_operations')}** operations were reported; **{reconciliation.get('previously_omitted_operations')}** were omitted, including the R3B-scope `trip_driving_impact.calculated_at` type change.

---

## Frozen Prisma diff evidence

| Metric | Value |
|--------|-------|
| Path | `{input_manifest.get('primary_input_path')}` |
| SHA-256 | `{input_manifest.get('sql_file_sha256')}` |
| Bytes | {input_manifest.get('byte_count_sql_file')} |
| Lines | {input_manifest.get('line_count_sql_file')} |
| R3B1L.1 JSON consistency | {'PASS' if input_manifest.get('pass') else 'FAIL'} |

---

## New comment-aware parser

Comments such as `-- AlterTable` are preserved as metadata (`comment_tags`) and never filter SQL. SQL-aware semicolon splitting supports quoted strings, dollar-quoted bodies, and block comments.

| Metric | Value |
|--------|-------|
| Independent SQL statements | {parser_coverage.get('independent_sql_statement_count')} |
| Parsed SQL statements | {parser_coverage.get('main_parser_sql_statement_count')} |
| Comment metadata blocks | {parser_coverage.get('comment_metadata_blocks')} |
| Unconsumed SQL tokens | {parser_coverage.get('unconsumed_sql_tokens')} |
| Duplicate SQL tokens | {parser_coverage.get('duplicate_token_count')} |
| Completeness | **{parser_coverage.get('parser_completeness')}** |

---

## Independent parser completeness proof

Multiset token coverage and independent top-level statement counting both match the main parser. Completeness gate: **{parser_coverage.get('parser_completeness')}**.

---

## Old 13-operation reconciliation

| Metric | Value |
|--------|-------|
| Old reported operations | {reconciliation.get('old_parser_reported_operations')} |
| Successor complete operations | {reconciliation.get('successor_complete_operations')} |
| Previously omitted operations | {reconciliation.get('previously_omitted_operations')} |
| Omitted R3B operations recovered | {reconciliation.get('previously_omitted_r3b_operations')} |
| `trip_driving_impact.calculated_at` recovered | {reconciliation.get('recovered_trip_driving_impact_calculated_at_found')} |

---

## Complete Prisma diff operation inventory

| Classification | Count |
|----------------|-------|
| Total operations | {classification.get('total_operations')} |
| R3B_SCOPE | {classification.get('R3B_SCOPE_DIFF_COUNT')} |
| OUT_OF_SCOPE | {classification.get('OUT_OF_SCOPE_DIFF_COUNT')} |
| UNRESOLVED | {classification.get('UNRESOLVED_DIFF_COUNT')} |

---

## R3B scope ownership model

Authority loaded from accepted R3B0.21 artifacts: **{authority.get('authority_object_count')}** objects, **{authority.get('authority_table_count')}** tables, **{authority.get('authority_enum_count')}** enums, **{authority.get('authority_property_category_count')}** property categories. Owner resolution uses table targets, column ALTER targets, index→table catalog maps, and enum physical names.

---

## Complete R3B scope operation list

"""
    for op in r3b_ops:
        report += f"- Ordinal **{op.get('ordinal')}**: `{op.get('raw_sql')[:120]}{'...' if len(op.get('raw_sql',''))>120 else ''}`\n"
    if not r3b_ops:
        report += "- *(none)*\n"

    report += f"""
---

## Out-of-scope operation list

Total OUT_OF_SCOPE: **{classification.get('OUT_OF_SCOPE_DIFF_COUNT')}**

| Operation family | Count |
|------------------|-------|
"""
    for fam, cnt in sorted(family_counts.items(), key=lambda x: (-x[1], x[0])):
        report += f"| {fam} | {cnt} |\n"

    report += f"""
---

## trip_driving_impact.calculated_at three-way authority

| Source | Value |
|--------|-------|
| Accepted R3B authority | `{trip.get('accepted_authority')}` |
| Replay actual (54/54 parity) | `{trip.get('replay_value')}` |
| Current Prisma desired | `{trip.get('prisma_desired_value')}` |
| Scope | `{trip.get('scope')}` |
| Decision | **`{trip.get('decision')}`** |

Prisma field: `TripDrivingImpact.calculatedAt DateTime? @map("calculated_at")` — no `@db.Timestamptz`; Prisma maps to `timestamp(3) without time zone`.

---

## All R3B drift authority decisions

| Decision | Count |
|----------|-------|
| CURRENT_PRISMA_SCHEMA_DRIFT | {auth_counts.get('CURRENT_PRISMA_SCHEMA_DRIFT', 0)} |
| REPLAY_DB_DRIFT | {auth_counts.get('REPLAY_DB_DRIFT', 0)} |
| NON_SEMANTIC_DIFFERENCE | {auth_counts.get('NON_SEMANTIC_DIFFERENCE', 0)} |
| AUTHORITY_AMBIGUITY | {auth_counts.get('AUTHORITY_AMBIGUITY', 0)} |
| CROSS_EVIDENCE_CONTRADICTION | {auth_counts.get('CROSS_EVIDENCE_CONTRADICTION', 0)} |

"""

    for d in decisions.get("decisions", []):
        report += f"### Operation {d.get('operation_ordinal')}\n\n"
        report += f"- SQL: `{d.get('raw_sql')}`\n"
        report += f"- Property: `{d.get('affected_property_category')}`\n"
        report += f"- Decision: **{d.get('decision')}**\n\n"

    report += f"""---

## Cross-evidence consistency

R3B1L.1 accepted replay DB == accepted authority for 54/54 categories. No REPLAY_DB_DRIFT or CROSS_EVIDENCE_CONTRADICTION was detected.

---

## Implementation decision

**Next phase:** {summary.get('next_phase')}

"""
    if summary.get("prisma_alignment_required"):
        report += (
            "Migration history replay is complete and R3B catalog authority parity remains complete. "
            "**Current Prisma schema alignment is still required** via CI-R3B1M before E_UNKNOWN.\n"
        )
    elif summary.get("migration_recovery_closed"):
        report += "All Prisma diff operations are out of scope; migration recovery may proceed to E_UNKNOWN production exposure resolution.\n"
    else:
        report += "See authority decision counts; do not proceed to repair without resolving blockers.\n"

    report += f"""
---

## Migration/schema immutability

| Check | Result |
|-------|--------|
| Modified migration SQL | {immut.get('modified_migration_sql_count')} |
| New migration directories | {immut.get('new_migration_directories')} |
| schema.prisma changed | {'YES' if immut.get('schema_prisma_changed') else 'NO'} |
| Runtime changed | {'YES' if immut.get('runtime_changed') else 'NO'} |

---

## Production exposure not yet entered

No production exposure investigation, deployment, merge, or production mutation was performed.

---

## Safety

| Guard | Status |
|-------|--------|
| New zero-state replay | NO |
| Production mutation | NO |
| Deployment | NO |
| Merge | NO |
| schema.prisma edit | NO |
| Migration edit | NO |

---

## Golden tests

| Result | Count |
|--------|-------|
| Total | {golden.get('total')} |
| Passed | {golden.get('passed')} |
| Status | {'PASS' if golden.get('pass') else 'FAIL'} |

---

## Report ↔ machine consistency

Report mismatch count: **{report_mismatch_count}** (required 0).

---

## Final acceptance matrix

| Gate | Value |
|------|-------|
| Parser completeness | {parser_coverage.get('parser_completeness')} |
| UNRESOLVED | {scope.get('UNRESOLVED')} |
| AUTHORITY_AMBIGUITY | {auth_counts.get('AUTHORITY_AMBIGUITY', 0)} |
| CROSS_EVIDENCE_CONTRADICTION | {auth_counts.get('CROSS_EVIDENCE_CONTRADICTION', 0)} |
| Final status | `{status}` |
"""
    OUT.write_text(report)
    print(json.dumps({"report": str(OUT.relative_to(REPO)), "mismatch_count": report_mismatch_count}, indent=2))
    return 0 if report_mismatch_count == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
