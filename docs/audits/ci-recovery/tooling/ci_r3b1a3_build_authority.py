#!/usr/bin/env python3
"""Build CI-R3B1A.3 dependency closure, contracts, and repair topology."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
from typing import Any

REPO = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1a2_build_dependency_matrix import DEFECT_SPECS, git_show_file  # noqa: E402
from prisma_schema_authority import extract_model_contract, parse_schema  # noqa: E402
from repair_closure import (  # noqa: E402
    OBJECT_SLOT,
    apply_fk_chronology,
    build_closure_record,
    build_repair_topology,
    dedupe_enum_dependencies,
    enrich_column_defaults,
    primary_and_closure_sets,
)
from sql_migration_analyzer import build_dependency_matrix, unique_defect_objects  # noqa: E402

OUT_MATRIX = REPO / "docs/audits/ci-recovery/data/ci-r3b1a2-full-migration-dependency-matrix-2026-08.json"
OUT_CONTRACTS = REPO / "docs/audits/ci-recovery/data/ci-r3b1a3-predecessor-ddl-contracts-2026-08.json"
OUT_CLOSURE = REPO / "docs/audits/ci-recovery/data/ci-r3b1a3-repair-dependency-closure-2026-08.json"
OUT_TOPOLOGY = REPO / "docs/audits/ci-recovery/data/ci-r3b1a3-final-repair-topology-2026-08.json"


def enum_contract(schema: str, enum_name: str, spec: dict[str, Any], defect: dict[str, Any]) -> dict[str, Any]:
    parsed = parse_schema(schema)
    labels = parsed.enums.get(enum_name, [])
    slot = OBJECT_SLOT.get(enum_name, 0)
    return {
        "object": enum_name,
        "object_type": "enum",
        "classification": spec["classification"],
        "required_before_migration": spec["before"],
        "historical_authority_commit": spec["commit"],
        "first_consumer": defect["first_consumer_migration"],
        "repair_slot": slot,
        "schema": "public",
        "type_name": enum_name,
        "labels": labels,
        "order_material": True,
        "creator": spec.get("creator_migration"),
        "relation": None,
        "columns": [],
        "primary_key": None,
        "foreign_keys": [],
        "unique_constraints": [],
        "check_constraints": [],
        "required_preexisting_indexes": [],
        "enum_dependencies": [],
        "create_time_prerequisites": [],
        "required_before_first_consumer": [],
        "deferred_constraints": [],
        "not_present_yet": spec["not_yet"],
        "repair_insertion": {
            "after": spec["repair_after"],
            "before": spec["repair_before"],
            "can_share_bootstrap_with": spec.get("share_bootstrap_with", []),
            "creator_migration": spec.get("creator_migration"),
        },
        "evidence": [
            f"schema:{spec['commit']}:enum {enum_name}",
            f"matrix:first_consumer={defect['first_consumer_migration']}",
        ],
    }


def table_contract(schema: str, spec: dict[str, Any], defect: dict[str, Any]) -> dict[str, Any]:
    model = extract_model_contract(schema, spec["model"])
    table = model["table"]
    slot = OBJECT_SLOT.get(table, 0)

    enum_deps = dedupe_enum_dependencies(model["enum_dependencies"])
    columns = [enrich_column_defaults(table, col) for col in model["columns"]]
    foreign_keys = [apply_fk_chronology(table, fk) for fk in model["foreign_keys"]]

    create_time_prereqs = [d["name"] for d in enum_deps]
    required_before_fc: list[str] = []
    deferred: list[dict[str, Any]] = []

    for fk in foreign_keys:
        if fk.get("required_before_first_consumer"):
            required_before_fc.append(
                f"{fk['local_columns']}->{fk['referenced_relation']}.{fk['referenced_columns']}"
            )
        if fk.get("chronology", "").startswith("CAN_BE_DEFERRED"):
            deferred.append(fk)

    for col in columns:
        if col["column"] in {"fine_id", "invoice_id", "vehicle_id"}:
            col["column_chronology"] = "REQUIRED_AT_TABLE_CREATE"

    return {
        "object": table,
        "object_type": "table",
        "classification": spec["classification"],
        "required_before_migration": spec["before"],
        "historical_authority_commit": spec["commit"],
        "historical_prisma_model": spec["model"],
        "first_consumer": defect["first_consumer_migration"],
        "repair_slot": slot,
        "relation": {"schema": "public", "name": table},
        "columns": columns,
        "primary_key": model["primary_key"],
        "foreign_keys": foreign_keys,
        "unique_constraints": model["unique_constraints"],
        "check_constraints": [],
        "required_preexisting_indexes": model["required_preexisting_indexes"],
        "enum_dependencies": enum_deps,
        "create_time_prerequisites": create_time_prereqs,
        "required_before_first_consumer": required_before_fc,
        "deferred_constraints": deferred,
        "not_present_yet": spec["not_yet"],
        "repair_insertion": {
            "after": spec["repair_after"],
            "before": spec["repair_before"],
            "can_share_bootstrap_with": spec.get("share_bootstrap_with", []),
            "creator_migration": spec.get("creator_migration"),
        },
        "evidence": [
            f"schema:{spec['commit']}:model {spec['model']}",
            f"matrix:first_consumer={defect['first_consumer_migration']}",
        ],
    }


def build_contracts(defects: list[dict[str, Any]]) -> dict[str, Any]:
    defect_by_obj = {d["object"]: d for d in defects}
    contracts: list[dict[str, Any]] = []
    for obj, spec in DEFECT_SPECS.items():
        defect = defect_by_obj[obj]
        schema = (
            git_show_file("17019787", "backend/prisma/schema.prisma")
            if spec["commit"] == "17019787"
            else git_show_file("77c26dad", "backend/prisma/schema.prisma")
        )
        if spec.get("enum_only"):
            contracts.append(enum_contract(schema, spec["enum_only"], spec, defect))
        else:
            contracts.append(table_contract(schema, spec, defect))
    return {
        "schema_version": 3,
        "supersedes": "ci-r3b1a2-predecessor-ddl-contracts-2026-08.json",
        "contracts": contracts,
    }


def main() -> int:
    matrix = build_dependency_matrix(REPO)
    defects = unique_defect_objects(matrix)
    matrix["unique_genuine_defect_objects"] = defects
    contracts_doc = build_contracts(defects)
    contracts = contracts_doc["contracts"]
    by_obj = {c["object"]: c for c in contracts}

    closure_records = [
        build_closure_record(obj, by_obj[obj], OBJECT_SLOT.get(obj, 0))
        for obj in DEFECT_SPECS
        if obj in by_obj
    ]
    topology = build_repair_topology(by_obj)
    impl_sets = primary_and_closure_sets(contracts)

    matrix["implementation_authority"] = impl_sets
    matrix["repair_topology"] = topology

    OUT_MATRIX.parent.mkdir(parents=True, exist_ok=True)
    OUT_MATRIX.write_text(json.dumps(matrix, indent=2) + "\n")
    OUT_CONTRACTS.write_text(json.dumps(contracts_doc, indent=2) + "\n")
    OUT_CLOSURE.write_text(
        json.dumps(
            {"schema_version": 1, "records": closure_records, **impl_sets},
            indent=2,
        )
        + "\n"
    )
    OUT_TOPOLOGY.write_text(
        json.dumps({"schema_version": 1, "slots": topology, **impl_sets}, indent=2) + "\n"
    )

    totals = matrix["classification_totals"]
    print(json.dumps(totals, indent=2))
    print("primary defects:", impl_sets["primary_historical_defects"])
    print("closure prerequisites:", impl_sets["required_repair_closure_objects"])
    if totals["UNRESOLVED"] != 0:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
