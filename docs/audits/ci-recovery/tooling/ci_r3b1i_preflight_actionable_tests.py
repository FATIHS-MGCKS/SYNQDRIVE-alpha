#!/usr/bin/env python3
"""Preflight negative tests for generic actionable-gap derivation (CI-R3B1I)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1h111_actionable_gaps import derive_unique_actionable_gaps
from ci_r3b1i_constants import DATA

OUT = DATA / "ci-r3b1i-preflight-actionable-tests-2026-08.json"


def run_tests() -> dict:
    table_creators = {"organization_memberships", "example_repair_log", "synthetic_table"}
    results = []

    non_insert_record = {
        "classification": "MISSING_HISTORY",
        "dependency_context": "COLUMN_REFERENCE",
        "required_object_type": "column",
        "resolved_relation": "synthetic_table",
        "required_property": "synthetic_col",
        "migration": "20990101000000_test",
        "migration_order": 9999,
        "statement_order": 1,
        "id": "test-non-insert",
    }
    gaps = derive_unique_actionable_gaps([non_insert_record], table_creators)
    results.append(
        {
            "test": "negative_context_included",
            "pass": len(gaps) == 1 and gaps[0]["relation"] == "synthetic_table",
            "gaps": len(gaps),
        }
    )

    repair_log_record = {
        "classification": "MISSING_HISTORY",
        "dependency_context": "INSERT_SELECT_EXPRESSION",
        "required_object_type": "column",
        "resolved_relation": "example_repair_log",
        "required_property": "kept_id",
        "migration": "20990101000001_test",
        "migration_order": 9998,
        "statement_order": 2,
        "id": "test-repair-log",
    }
    repair_gaps = derive_unique_actionable_gaps([repair_log_record], table_creators)
    results.append(
        {
            "test": "negative_repair_log_included",
            "pass": len(repair_gaps) == 1 and repair_gaps[0]["relation"] == "example_repair_log",
            "gaps": len(repair_gaps),
        }
    )

    return {
        "schema_version": 1,
        "phase": "CI-R3B1I",
        "tests": results,
        "pass": all(t["pass"] for t in results),
    }


def main() -> int:
    doc = run_tests()
    OUT.write_text(json.dumps(doc, indent=2) + "\n")
    print(json.dumps({"pass": doc["pass"], "tests": len(doc["tests"])}, indent=2))
    return 0 if doc["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
