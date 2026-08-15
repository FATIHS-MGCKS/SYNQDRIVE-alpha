#!/usr/bin/env python3
"""Generate CI-R3B1F.1.1 audit report from machine evidence."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "data"
OUT = Path(__file__).resolve().parents[1] / "ci-r3b1f111-sql-scope-classification-closure-2026-08.md"


def load(name: str) -> dict:
    return json.loads((DATA / name).read_text())


def main() -> int:
    summary = load("ci-r3b1f111-final-validation-summary-2026-08.json")
    matrix = load("ci-r3b1f111-expression-aware-dependency-matrix-2026-08.json")
    reconciliation = load("ci-r3b1f111-defect-reconciliation-2026-08.json")
    contracts = load("ci-r3b1f111-exact-predecessor-contracts-2026-08.json")
    proof = load("ci-r3b1f111-targeted-consumer-proof-2026-08.json")
    immutability = load("ci-r3b1f111-immutability-audit-2026-08.json")
    head = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()

    lines = [
        "# CI-R3B1F.1.1 — SQL Scope and Dependency Classification Closure",
        "",
        "## Baseline",
        "",
        f"- PRE_R3B1F111_SHA: `{head}`",
        f"- Branch: `fix/ci-r3b1f111-sql-scope-classification-closure-2026-08`",
        f"- Base R3B1F.1 SHA: `6263e2455db23df226567ac95e2aff3f1b6a5f98`",
        "",
        "## Previous failure",
        "",
        "R3B1F.1 corrected creator chronology but left expression-classification false positives:",
        "",
        "- UPDATE/FROM scope gap — relation names and aliases treated as target-table columns",
        "- CTE name/alias gap — CTE relations and projected aliases treated as physical columns",
        "- JSON-key literal gap — `->>'catalogKey'` emitted `catalogKey` as a column",
        "- Guarded-drop chronology gap — `DROP CONSTRAINT IF EXISTS` classified ORDERING_DEFECT when creator appeared later",
        "- Unquoted constraint capture gap — named PK/constraint names not registered from CREATE TABLE",
        "",
        "## Scope resolver",
        "",
        "Implemented `sql_scope_resolver.py` with paren-aware SET/FROM/WHERE extraction, CTE/subquery bindings,",
        "qualified/unqualified alias resolution, JSON operator stripping, and explicit `FALSE_POSITIVE` emission",
        f"({summary.get('false_positive_model')}).",
        "",
        "## Previous 20 defect records",
        "",
        f"- Accounted: **{reconciliation['accounted']}/{reconciliation['previous_defect_records']}**",
        "",
        "| Kind | Dependency | Old | New | Reason |",
        "|------|------------|-----|-----|--------|",
    ]
    for row in reconciliation["rows"]:
        dep = row.get("property") or row.get("constraint")
        lines.append(
            f"| {row['kind']} | `{dep}` | {row['old_classification']} | {row['new_classification']} | {row.get('reason','')} |"
        )

    lines.extend(["", "## Final classification counters", ""])
    for k in ["VALID", "MISSING_HISTORY", "ORDERING_DEFECT", "CONDITIONAL_SAFE", "FALSE_POSITIVE", "UNRESOLVED"]:
        lines.append(f"- {k}: {summary.get(k, summary['classification_totals'].get(k))}")

    lines.extend(["", "## Final actionable gaps", ""])
    for gap in matrix.get("unique_genuine_gaps", []):
        lines.append(
            f"- `{gap['relation']}.{gap['property']}` — {gap['classification']} — first consumer `{gap['first_consumer_migration']}`"
        )

    tire = contracts["contracts"][0]
    compiled = contracts["compiled"][0]["compiled_sql"]
    lines.extend(
        [
            "",
            "## Tire proof",
            "",
            f"- Strict compiler (no IF NOT EXISTS): `{compiled.strip()}`",
            f"- Targeted proof pass: **{proof.get('pass')}**",
            "",
            "## Immutability",
            "",
            f"- migration SQL changes: **{immutability.get('existing_migration_sql_changed', 0)}**",
            f"- schema.prisma changed: **{'YES' if immutability.get('schema_prisma_changed') else 'NO'}**",
            "",
            "## Safety",
            "",
            "- full replay: **NO**",
            "- production mutation: **NO**",
            "",
            f"## Final status",
            "",
            f"**{summary['final_status']}**",
        ]
    )
    OUT.write_text("\n".join(lines) + "\n")
    print(f"Wrote {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
