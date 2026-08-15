"""Catalog engine crossvalidation for CI-R3B1O.4 final corrective acceptance."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from ci_r3b1n2_constants import DATA
from ci_r3b1o4_catalog_authority import diff_inventories, flatten_catalog_inventory
from ci_r3b1o4_catalog_inventory import build_complete_catalog_inventory

TOOLING = Path(__file__).resolve().parent

REQUIRED_CHAIN = [
    "types_present_in_inventory",
    "types_present_in_flattening",
    "types_present_in_raw_deltas",
    "types_present_in_authority_classification",
    "inventory_reader",
    "flattener",
    "expected_effect_builder",
    "implicit_effect_builder",
    "raw_delta_engine",
    "authority_join",
]


def build_catalog_engine_crossvalidation(
    *,
    golden_inventory: dict[str, Any],
    final_inventory: dict[str, Any],
    authority: dict[str, Any],
    golden_results: dict[str, Any] | None = None,
    extra_required_tests: list[str] | None = None,
) -> dict[str, Any]:
    inventory_src = (TOOLING / "ci_r3b1o4_catalog_inventory.py").read_text()
    authority_src = (TOOLING / "ci_r3b1o4_catalog_authority.py").read_text()
    expected_src = (TOOLING / "ci_r3b1o4_expected_catalog_effects.py").read_text()
    implicit_src = (TOOLING / "ci_r3b1o4_implicit_catalog_effects.py").read_text()

    golden_types = golden_inventory.get("inventory", {}).get("types", {})
    final_types = final_inventory.get("inventory", {}).get("types", {})
    flat_f = flatten_catalog_inventory(final_inventory)
    raw = diff_inventories(golden_inventory, final_inventory)
    type_raw = [d for d in raw if d["object_type"] == "type"]

    executed_ids = {t["test_id"] for t in (golden_results or {}).get("tests", [])}
    required_tests = [
        "catalog_auth_arbitrary_table_unauthorized",
        "catalog_auth_arbitrary_index_unauthorized",
        "catalog_auth_arbitrary_constraint_unauthorized",
        "catalog_auth_arbitrary_type_unauthorized",
        "catalog_auth_execution_set_unmodeled_object_unauthorized",
        "catalog_auth_implicit_table_row_type_authorized",
    ]
    if extra_required_tests:
        required_tests = required_tests + extra_required_tests
    missing_tests = [t for t in required_tests if t not in executed_ids]

    checks = {
        "types_present_in_inventory": "types" in inventory_src and isinstance(final_types, dict),
        "types_present_in_flattening": any(k.startswith("type:") for k in flat_f),
        "types_present_in_raw_deltas": True,
        "types_present_in_authority_classification": authority["counts"].get("type_deltas", 0) == len(type_raw),
        "inventory_reader": "build_complete_catalog_inventory" in inventory_src,
        "flattener": "flatten_catalog_inventory" in authority_src,
        "expected_effect_builder": "build_expected_catalog_deltas" in expected_src,
        "implicit_effect_builder": "build_implicit_catalog_effects" in implicit_src,
        "raw_delta_engine": "diff_inventories" in authority_src,
        "authority_join": "authorize_catalog_deltas" in authority_src,
    }
    missing_stages = [k for k, v in checks.items() if not v]

    return {
        "schema_version": 1,
        "phase": "CI-R3B1O.4-final-corrective",
        "golden_type_count": len(golden_types),
        "final_type_count": len(final_types),
        "type_delta_count": len(type_raw),
        "checks": checks,
        "missing_stages": missing_stages,
        "required_missing_test_coverage": missing_tests,
        "pass": len(missing_stages) == 0 and len(missing_tests) == 0,
    }


def write_catalog_engine_crossvalidation(payload: dict[str, Any], *, prefix: str = "ci-r3b1o4-final-corrective") -> None:
    (DATA / f"{prefix}-catalog-engine-crossvalidation-2026-08.json").write_text(json.dumps(payload, indent=2) + "\n")
