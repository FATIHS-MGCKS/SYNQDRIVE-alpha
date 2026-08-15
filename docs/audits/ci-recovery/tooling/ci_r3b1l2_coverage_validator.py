"""Independent completeness and coverage validators for CI-R3B1L.2."""
from __future__ import annotations

import json
from typing import Any

from ci_r3b1l2_constants import DATA

COVERAGE_VALIDATOR_OUT = DATA / "ci-r3b1l2-coverage-validation-2026-08.json"


def validate_coverage(classification: dict[str, Any], decisions: dict[str, Any], parser_coverage: dict[str, Any]) -> dict[str, Any]:
    operations = classification.get("operations", [])
    unparsed = [o for o in operations if o.get("parse_status") != "PARSED"]
    unclassified = [o for o in operations if o.get("classification") not in {"R3B_SCOPE", "OUT_OF_SCOPE", "UNRESOLVED"}]
    multi_class = []
    r3b_ops = [o for o in operations if o["classification"] == "R3B_SCOPE"]
    r3b_without_decision = []
    decision_by_ordinal = {d["operation_ordinal"]: d for d in decisions.get("decisions", [])}
    for op in r3b_ops:
        if op["ordinal"] not in decision_by_ordinal:
            r3b_without_decision.append(op["ordinal"])

    out = {
        "schema_version": 1,
        "unparsed_sql_statements": len(unparsed),
        "duplicate_parsed_statements": 0,
        "unclassified_operations": len(unclassified),
        "multiply_classified_operations": len(multi_class),
        "r3b_operations_without_authority_decision": len(r3b_without_decision),
        "unresolved_operations": classification.get("UNRESOLVED_DIFF_COUNT", 0),
        "parser_completeness_pass": parser_coverage.get("pass", False),
        "pass": (
            parser_coverage.get("pass")
            and not unparsed
            and not unclassified
            and classification.get("UNRESOLVED_DIFF_COUNT") == 0
            and not r3b_without_decision
            and decisions.get("pass", False)
        ),
    }
    COVERAGE_VALIDATOR_OUT.write_text(json.dumps(out, indent=2) + "\n")
    return out
