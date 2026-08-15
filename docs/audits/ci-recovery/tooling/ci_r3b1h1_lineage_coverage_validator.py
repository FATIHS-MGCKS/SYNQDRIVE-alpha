#!/usr/bin/env python3
"""Independent lineage coverage validator for INSERT-SELECT statements (CI-R3B1H.1)."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1h1_constants import DATA, FIRST_SCANNED, KNOWN_SINGLE_LETTER_ALIASES, REPO
from insert_select_dependency_extractor import extract_insert_select_dependencies
from sql_migration_analyzer import split_sql_statements

OUT = DATA / "ci-r3b1h1-lineage-coverage-validation-2026-08.json"
MATRIX = DATA / "ci-r3b1h1-insert-select-dependency-matrix-2026-08.json"


def alias_leakage(records: list[dict]) -> list[dict]:
    leaks = []
    for r in records:
        rel = r.get("resolved_relation") or r.get("required_relation") or ""
        if (
            r.get("classification") == "MISSING_HISTORY"
            and len(rel) == 1
            and rel.isalpha()
            and rel.islower()
            and rel in KNOWN_SINGLE_LETTER_ALIASES
        ):
            leaks.append({"id": r.get("id"), "relation": rel, "property": r.get("required_property")})
    return leaks


def lineage_gaps_from_matrix(records: list[dict]) -> int:
    gaps = 0
    for r in records:
        if r.get("classification") == "UNRESOLVED":
            gaps += 1
        reason = r.get("reason") or ""
        if "qualified reference without scope" in reason and r.get("classification") == "MISSING_HISTORY":
            gaps += 1
    return gaps


def main() -> int:
    matrix = json.loads(MATRIX.read_text()) if MATRIX.is_file() else {"records": []}
    records = matrix.get("records", [])
    leaks = alias_leakage(records)
    gaps = lineage_gaps_from_matrix(records)

    mig_dir = REPO / "backend/prisma/migrations"
    all_migs = sorted(p.name for p in mig_dir.iterdir() if p.is_dir())
    scope = all_migs[all_migs.index(FIRST_SCANNED) :]

    unresolved_aliases = 0
    for mig in scope:
        sql = (mig_dir / mig / "migration.sql").read_text()
        for stmt in split_sql_statements(sql):
            if not re.search(r"INSERT\s+INTO\b", stmt, re.I) or not re.search(r"\bSELECT\b", stmt, re.I):
                continue
            for dep in extract_insert_select_dependencies(stmt):
                rel = dep.resolved_relation or dep.table
                if (
                    not dep.false_positive
                    and dep.context != "INSERT_SELECT_TARGET"
                    and len(rel) == 1
                    and rel.isalpha()
                    and rel.islower()
                ):
                    unresolved_aliases += 1

    out = {
        "schema_version": 1,
        "phase": "CI-R3B1H.1",
        "alias_leakage": len(leaks),
        "alias_leakage_records": leaks,
        "lineage_coverage_gaps": gaps,
        "unresolved_physical_alias_leakage": unresolved_aliases,
        "pass": len(leaks) == 0 and gaps == 0 and unresolved_aliases == 0,
    }
    OUT.write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps({"pass": out["pass"], "alias_leakage": out["alias_leakage"], "coverage_gaps": gaps}, indent=2))
    return 0 if out["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
