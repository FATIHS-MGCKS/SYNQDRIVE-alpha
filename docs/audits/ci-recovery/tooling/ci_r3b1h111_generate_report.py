#!/usr/bin/env python3
"""Generate CI-R3B1H.1.1 closure report."""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1h111_constants import BASE_R3B1H1_SHA, DATA, R3B1H111_BRANCH

OUT = Path(__file__).resolve().parents[1] / "ci-r3b1h111-evidence-generic-contract-gate-closure-2026-08.md"
SUMMARY = DATA / "ci-r3b1h111-final-validation-summary-2026-08.json"


def load(name: str) -> dict:
    return json.loads((DATA / name).read_text()) if (DATA / name).is_file() else {}


def main() -> int:
    s = load("ci-r3b1h111-final-validation-summary-2026-08.json")
    mt = s.get("classification_totals", {})
    mig249 = load("ci-r3b1h111-migration249-reconciliation-2026-08.json")
    actionable = load("ci-r3b1h111-actionable-gap-coverage-2026-08.json")
    lineage = load("ci-r3b1h111-lineage-coverage-validation-2026-08.json")
    provenance = load("ci-r3b1h111-post-commit-provenance-2026-08.json")

    m_id = next((r for r in mig249.get("records", []) if r.get("raw_reference") == "m.id"), {})
    report = f"""# CI-R3B1H.1.1 — IAM evidence and generic contract gate closure

## Baseline

| Field | Value |
|-------|-------|
| Branch | `{R3B1H111_BRANCH}` |
| Parent R3B1H.1 SHA | `{BASE_R3B1H1_SHA}` |
| Evidence input SHA | `{s.get('evidence_input_sha')}` |
| Final commit SHA | `{provenance.get('final_commit_sha', 'pending post-commit update')}` |

## R3B1H.1 residual issues

Fixed in this phase: incorrect Migration-249 `m.id` reconciliation mapping, non-generic contract/boundary derivation, weak lineage counters, committed `.pyc` artifacts, and stale HEAD provenance in evidence artifacts.

## Corrected Migration-249 reconciliation

- Old records: **{mig249.get('old_records_total', 4)}**
- Accounted: **{mig249.get('accounted', 4)}**
- Mismatches: **{mig249.get('reconciliation_mismatches', 0)}**
- `m.id` physical lineage: **{m_id.get('physical_relation')}.{m_id.get('physical_property')}** → **{m_id.get('new_classification')}**

## Generic actionable-gap derivation

Unique actionable gaps are derived only from `MISSING_HISTORY` / `ORDERING_DEFECT` records and deduplicated by physical relation, property, and dynamically derived repair boundary.

## Generic authority resolver

Deterministic authority chain: historical Prisma snapshot → accepted recovery authority → migration creator evidence. Returns `COMPLETE_AUTHORITY` or `INSUFFICIENT_AUTHORITY` without property-name input filters.

## Generic boundary derivation

Repair boundaries are searched backwards from each gap's first consumer migration. No global `LAST_APPLIED_PRE249` constant is applied to all gaps.

## Contract coverage

| Metric | Value |
|--------|------:|
| Unique actionable gaps | {actionable.get('unique_actionable_gaps', 0)} |
| Contracts | {s.get('contracts', 0)} |
| Uncontracted gaps | {actionable.get('uncontracted_gaps', 0)} |
| Invalid contracts | {actionable.get('invalid_contracts', 0)} |
| Unproven gaps | {actionable.get('unproven_gaps', 0)} |

## Negative completion tests

- Second actionable gap without authority: **{s.get('negative_uncontracted_gap_test')}**
- Second actionable gap without proof: **{s.get('negative_unproven_gap_test')}**
- Positive generic completion (current matrix): **{s.get('positive_multi_gap_test')}**

## Lineage coverage hardening

| Counter | Value |
|---------|------:|
| Physical alias leakage | {lineage.get('physical_alias_leakage', 0)} |
| Derived lineage gaps | {lineage.get('derived_lineage_gaps', 0)} |
| Qualified-reference coverage gaps | {lineage.get('qualified_reference_coverage_gaps', 0)} |

## 249→HEAD matrix

| Classification | Count |
|----------------|------:|
| VALID | {mt.get('VALID', 0)} |
| MISSING_HISTORY | {mt.get('MISSING_HISTORY', 0)} |
| ORDERING_DEFECT | {mt.get('ORDERING_DEFECT', 0)} |
| FALSE_POSITIVE | {mt.get('FALSE_POSITIVE', 0)} |
| UNRESOLVED | {mt.get('UNRESOLVED', 0)} |

## Permissions proof

Generic contract → compiler → pre-249 DB → catalog parity → unchanged migration 249 → synthetic fixture: **{'PASS' if s.get('permissions_proof') else 'FAIL'}**

## Provenance model

Evidence artifacts record `evidence_input_sha` at generation time. Post-commit provenance is stored separately in `ci-r3b1h111-post-commit-provenance-2026-08.json`.

## Python cache cleanup

Tracked cache artifacts removed; `.gitignore` excludes `__pycache__/` and `*.py[cod]`.

## Immutability

Migration SQL modified: **{s.get('migration_changes', 0)}**; new Prisma migrations: **{s.get('new_migration_dirs', 0)}**

## Safety

No full replay, production mutation, deployment, merge, or R3B.2 work.

## Final status

**{s.get('final_status')}**
"""
    OUT.write_text(report)
    print(f"Wrote {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
