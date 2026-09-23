#!/usr/bin/env python3
"""Required negative fixtures for the Phase 2.6 readiness validator."""

from __future__ import annotations

import json
from copy import deepcopy
from pathlib import Path
from typing import Any, Callable

from phase2_6_evaluations_validation import validate_model


ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "docs/audits/pr-recovery"


def add_edge(
    model: dict[str, Any],
    dependency: str,
    dependent: str,
    dependency_type: str = "HARD_CONTRACT",
) -> None:
    model["dependency_edges"].append({
        "dependency_changeset": dependency,
        "dependent_changeset": dependent,
        "dependency_type": dependency_type,
        "dependency_package": "",
        "dependent_package": "",
        "cross_module": dependency not in {
            item["changeset_id"] for item in model["changesets"]
        },
        "hard": dependency_type.startswith("HARD_"),
        "active": True,
        "evidence": "Intentional negative fixture.",
        "resolution": "NEGATIVE_FIXTURE",
    })


def mutate_later_package_dependency(model: dict[str, Any]) -> None:
    add_edge(
        model,
        "cs-evaluations-money-domain",
        "cs-evaluations-timezone-period-model",
    )


def mutate_changeset_cycle(model: dict[str, Any]) -> None:
    add_edge(
        model,
        "cs-evaluations-unified-kpi-contract",
        "cs-evaluations-timezone-period-model",
    )


def mutate_unknown_changeset(model: dict[str, Any]) -> None:
    add_edge(
        model,
        "cs-evaluations-does-not-exist",
        "cs-evaluations-timezone-period-model",
        "SOFT_INTEGRATION",
    )


def mutate_missing_package(model: dict[str, Any]) -> None:
    changeset_id = "cs-evaluations-money-domain"
    next(
        item for item in model["changesets"] if item["changeset_id"] == changeset_id
    )["package_id"] = ""
    for package in model["packages"]:
        package["changesets"] = [
            item for item in package["changesets"] if item != changeset_id
        ]


def mutate_duplicate_package(model: dict[str, Any]) -> None:
    model["packages"][1]["changesets"].append(
        "cs-evaluations-timezone-period-model"
    )


def mutate_obsolete_hard_dependency(model: dict[str, Any]) -> None:
    next(
        item
        for item in model["changesets"]
        if item["changeset_id"] == "cs-evaluations-timezone-period-model"
    )["status"] = "OBSOLETE"


def mutate_missing_critical_rollback(model: dict[str, Any]) -> None:
    next(
        package for package in model["packages"] if package["package_id"] == "E2"
    )["rollback_strategy"] = ""


def mutate_predictive_flag(model: dict[str, Any]) -> None:
    next(
        package for package in model["packages"] if package["package_id"] == "E8"
    )["feature_flag"] = "EVALUATIONS_PREDICTIVE_MODE=on"


def mutate_unapproved_cross_module_hard_dependency(model: dict[str, Any]) -> None:
    add_edge(
        model,
        "cs-platform-analytics-unregistered",
        "cs-evaluations-analytics-summary",
        "HARD_RUNTIME",
    )


def mutate_exclusive_file_owner(model: dict[str, Any]) -> None:
    next(
        package for package in model["packages"] if package["package_id"] == "E2"
    )["implementation_files"].append(
        "backend/src/modules/business-insights/evaluations-analytics-summary.service.ts"
    )


CASES: list[tuple[str, str, Callable[[dict[str, Any]], None]]] = [
    ("earlier_package_depends_on_later", "INVALID_PACKAGE_ORDER", mutate_later_package_dependency),
    ("changeset_cycle", "CHANGESET_DAG_CYCLE", mutate_changeset_cycle),
    ("unknown_changeset_id", "UNKNOWN_DEPENDENCY", mutate_unknown_changeset),
    ("missing_package", "MISSING_PACKAGE", mutate_missing_package),
    ("duplicate_package_assignment", "DUPLICATE_PACKAGE_ASSIGNMENT", mutate_duplicate_package),
    ("hard_dependency_on_obsolete", "HARD_DEPENDENCY_ON_INACTIVE_CHANGESET", mutate_obsolete_hard_dependency),
    ("critical_missing_rollback", "MISSING_ROLLBACK", mutate_missing_critical_rollback),
    ("predictive_without_off_flag", "PREDICTIVE_FLAG_NOT_OFF", mutate_predictive_flag),
    ("cross_module_hard_without_prerequisite", "UNKNOWN_CROSS_MODULE_HARD_DEPENDENCY", mutate_unapproved_cross_module_hard_dependency),
    ("exclusive_file_in_non_owner_package", "EXCLUSIVE_FILE_OWNER_VIOLATION", mutate_exclusive_file_owner),
]


def run_negative_tests(model: dict[str, Any]) -> dict[str, Any]:
    results = []
    for name, expected_code, mutate in CASES:
        fixture = deepcopy(model)
        fixture.pop("validation", None)
        mutate(fixture)
        errors = validate_model(fixture)
        observed_codes = sorted({item["code"] for item in errors})
        results.append({
            "name": name,
            "expected_code": expected_code,
            "observed_codes": observed_codes,
            "passed": expected_code in observed_codes,
        })
    passed = sum(item["passed"] for item in results)
    return {
        "total": len(results),
        "passed": passed,
        "failed": len(results) - passed,
        "results": results,
    }


if __name__ == "__main__":
    payload = json.loads(
        (OUT / "phase2-6-evaluations-normalized-model-2026-08.json").read_text()
    )
    result = run_negative_tests(payload)
    print(json.dumps(result, sort_keys=True))
    raise SystemExit(0 if result["failed"] == 0 else 1)
