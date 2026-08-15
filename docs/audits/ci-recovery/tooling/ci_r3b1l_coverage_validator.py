"""Independent authority coverage validator for CI-R3B1L."""
from __future__ import annotations

import json
from typing import Any

from ci_r3b1l_authority import load_canonical_54
from ci_r3b1l_constants import DATA

OUT = DATA / "ci-r3b1l-authority-coverage-validation-2026-08.json"


def validate_coverage(parity: dict[str, Any], authority_ids: list[str] | None = None) -> dict[str, Any]:
    if authority_ids is None:
        canonical = load_canonical_54()
        expected_ids = [e["authority_id"] for e in canonical["entries"]]
    else:
        expected_ids = authority_ids
    evaluated = [r["authority_id"] for r in parity.get("property_results", [])]
    expected_set = set(expected_ids)
    evaluated_set = set(evaluated)
    duplicates = [aid for aid in evaluated if evaluated.count(aid) > 1]
    duplicate_set = sorted(set(duplicates))
    missing = sorted(expected_set - evaluated_set)
    unexpected = sorted(evaluated_set - expected_set)
    matched = sum(1 for r in parity.get("property_results", []) if r.get("pass"))
    out = {
        "schema_version": 1,
        "authority_ids_total": len(expected_ids),
        "authority_ids_evaluated": len(evaluated),
        "authority_ids_matched": matched,
        "duplicate_evaluations": duplicate_set,
        "missing_evaluations": missing,
        "unexpected_evaluations": unexpected,
        "pass": (
            len(expected_ids) == 54
            and len(evaluated) == 54
            and not missing
            and not unexpected
            and not duplicate_set
        ),
    }
    OUT.write_text(json.dumps(out, indent=2) + "\n")
    return out
