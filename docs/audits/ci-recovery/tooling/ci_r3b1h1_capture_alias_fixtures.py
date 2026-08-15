#!/usr/bin/env python3
"""Capture alias-failure regression fixtures from R3B1H matrix before analyzer fixes (CI-R3B1H.1)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1h1_constants import DATA, OLD_MATRIX, REPO

OUT = DATA / "ci-r3b1h1-alias-failure-fixtures-2026-08.json"

KNOWN_ALIASES = {"a", "m", "r", "c", "l", "o", "q", "x", "v", "w", "existing", "losers"}


def load_statement(migration: str, statement_order: int) -> str:
    from sql_migration_analyzer import split_sql_statements

    sql = (REPO / "backend/prisma/migrations" / migration / "migration.sql").read_text()
    for idx, stmt in enumerate(split_sql_statements(sql), 1):
        if idx == statement_order:
            return stmt
    return ""


def main() -> int:
    matrix = json.loads(OLD_MATRIX.read_text())
    recs = [r for r in matrix.get("records", []) if r.get("classification") == "MISSING_HISTORY"]
    fixtures = []
    for r in recs:
        rel = r.get("resolved_relation") or r.get("required_relation") or ""
        alias = r.get("resolved_alias") or ""
        prop = r.get("required_property") or ""
        if rel not in KNOWN_ALIASES and rel not in {"organization_memberships"}:
            continue
        stmt = load_statement(r["migration"], r["statement_order"])
        fragment = ""
        if alias and prop:
            for needle in (f'{alias}."{prop}"', f"{alias}.{prop}", f'"{alias}"."{prop}"'):
                if needle in stmt:
                    fragment = needle
                    break
        fixtures.append(
            {
                "migration": r["migration"],
                "statement_order": r["statement_order"],
                "raw_sql_fragment": fragment or r.get("statement_excerpt", ""),
                "raw_alias": alias or rel,
                "old_source_relation": rel,
                "old_source_property": prop,
                "old_classification": r["classification"],
                "old_reason": r.get("reason", ""),
                "dependency_context": r.get("dependency_context"),
                "expected_note": "physical lineage or VALID/FALSE_POSITIVE — not alias-as-table MISSING_HISTORY",
            }
        )

    mig249 = [f for f in fixtures if f["migration"].endswith("iam_versioned_role_assignments")]
    required = {"a.membership_id", "a.is_current", "m.id", "organization_memberships.permissions"}
    captured = set()
    for f in mig249:
        key = f"{f['old_source_relation']}.{f['old_source_property']}"
        if f["old_source_relation"] == "organization_memberships":
            key = "organization_memberships.permissions"
        captured.add(key)

    out = {
        "schema_version": 1,
        "phase": "CI-R3B1H.1",
        "source_matrix": str(OLD_MATRIX.name),
        "fixtures": fixtures,
        "migration_249_required_keys": sorted(required),
        "migration_249_captured_keys": sorted(captured),
        "migration_249_complete": required.issubset(captured),
        "total_alias_fixtures": len(fixtures),
    }
    OUT.write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps({"fixtures": len(fixtures), "migration_249_complete": out["migration_249_complete"]}, indent=2))
    return 0 if out["migration_249_complete"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
