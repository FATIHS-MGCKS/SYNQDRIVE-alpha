#!/usr/bin/env python3
"""Build exact predecessor contracts for genuinely remaining gaps (CI-R3B1F.1)."""
from __future__ import annotations

import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1f1_constants import (
    DATA,
    MIG_ROOT,
    PRE157_BOUNDARY,
    REPO,
    SCHEMA,
    SLOT13_REPAIR,
    TIRE_CONSUMER,
)
from ci_r3b1f1_contract_compiler import compile_add_column_contract, semantic_equivalence, sha256_text
from ci_r3b1f1_contract_validator import validate_column_contract

MATRIX = DATA / "ci-r3b1f1-expression-aware-dependency-matrix-2026-08.json"
OUT = DATA / "ci-r3b1f1-exact-predecessor-contracts-2026-08.json"
VALIDATION = DATA / "ci-r3b1f1-contract-validation-summary-2026-08.json"
TOPOLOGY = DATA / "ci-r3b1f1-repair-topology-2026-08.json"


def schema_sha() -> str:
    return hashlib.sha256(SCHEMA.read_bytes()).hexdigest()


def find_column_creator(relation: str, column: str) -> dict | None:
    for mig in sorted(p.name for p in MIG_ROOT.iterdir() if p.is_dir()):
        sql = (MIG_ROOT / mig / "migration.sql").read_text()
        if column not in sql or relation not in sql:
            continue
        m = re.search(
            rf'ALTER\s+TABLE\s+"{re.escape(relation)}"[\s\S]*ADD\s+COLUMN[\s\S]*"{re.escape(column)}"\s+([^,\n;]+)',
            sql,
            re.I,
        )
        if m:
            return {"migration": mig, "postgres_type": m.group(1).strip(), "kind": "ADD COLUMN"}
    return None


def build_tire_status_contract(schema_sha256: str) -> dict:
    return {
        "contract_id": "R3B1F1-vehicle_tire_setups-status",
        "relation": "vehicle_tire_setups",
        "column": "status",
        "postgres_type": "TireSetupStatus",
        "nullable": False,
        "default_semantics": "DATABASE_ENUM_DEFAULT",
        "default_value": "ACTIVE",
        "enum_dependency": "TireSetupStatus",
        "foreign_key": None,
        "generated_semantics": None,
        "classification": "MISSING_HISTORY",
        "first_consumer_migration": TIRE_CONSUMER,
        "first_consumer_statement": 4,
        "repair_boundary": {
            "after_migration": PRE157_BOUNDARY,
            "before_migration": TIRE_CONSUMER,
            "topology_id": "R3B1F1-SLOT13-EXT-STATUS",
            "rationale": (
                "Earliest valid append-only boundary after TireSetupStatus enum (Slot 13) and "
                "vehicle_tire_setups table (init), before migration 157 partial-index predicate consumer."
            ),
        },
        "provenance": {
            "sources": [
                f"schema.prisma:VehicleTireSetup.status@{schema_sha256[:16]}",
                "migration:20260716183000_tire_lifecycle_invariants:statement:4:partial_index_predicate",
                "catalog:ci-r3b1f1-pre-157-catalog-snapshot:vehicle_tire_setups.status=missing",
                "replay:ci-r3b1f1-pre157-replay-state:last_applied=slot13",
            ]
        },
        "enum_prerequisite": {
            "type": "TireSetupStatus",
            "creator_migration": SLOT13_REPAIR,
            "exists_at_boundary": True,
        },
    }


def main() -> int:
    matrix = json.loads(MATRIX.read_text())
    gaps = matrix.get("unique_genuine_gaps", [])
    schema_hash = schema_sha()
    contracts = []
    topology_slots = []

    for gap in gaps:
        if gap["relation"] == "vehicle_tire_setups" and gap["property"] == "status":
            contracts.append(build_tire_status_contract(schema_hash))
            topology_slots.append(
                {
                    "repair_id": "R3B1F1-SLOT13-EXT-STATUS",
                    "after_migration": PRE157_BOUNDARY,
                    "before_migration": TIRE_CONSUMER,
                    "operation": "ADD_COLUMN",
                    "relation": "vehicle_tire_setups",
                    "column": "status",
                    "postgres_type": "TireSetupStatus",
                    "nullable": False,
                    "default_semantics": "DATABASE_ENUM_DEFAULT",
                    "default_value": "ACTIVE",
                    "dependencies": ["vehicle_tire_setups", "TireSetupStatus"],
                    "first_consumer": TIRE_CONSUMER,
                }
            )
            continue
        authority = find_column_creator(gap["relation"], gap["property"])
        if authority and gap["classification"] != "MISSING_HISTORY":
            continue
        if gap["classification"] != "MISSING_HISTORY":
            continue

    validation_errors = []
    compiled_rows = []
    known_enums = {"TireSetupStatus"}
    for contract in contracts:
        errors = validate_column_contract(contract, known_enums)
        if errors:
            validation_errors.extend([f"{contract['contract_id']}:{e}" for e in errors])
        sql = compile_add_column_contract(contract)
        equiv = semantic_equivalence(contract, sql)
        compiled_rows.append(
            {
                "contract_id": contract["contract_id"],
                "compiled_sql": sql,
                "compiled_sql_sha256": sha256_text(sql),
                "semantic_equivalence": "PASS" if equiv else "FAIL",
            }
        )
        if not equiv:
            validation_errors.append(f"{contract['contract_id']}:semantic_equivalence_fail")

    OUT.write_text(json.dumps({"schema_version": 1, "contracts": contracts, "compiled": compiled_rows}, indent=2) + "\n")
    TOPOLOGY.write_text(json.dumps({"schema_version": 1, "slots": topology_slots}, indent=2) + "\n")

    summary = {
        "schema_version": 1,
        "phase": "CI-R3B1F.1",
        "genuine_contracts": len(contracts),
        "invalid_types": sum(1 for e in validation_errors if ":invalid_type" in e or ":missing_type" in e),
        "missing_types": sum(1 for e in validation_errors if ":missing_type" in e),
        "invalid_nullability": sum(1 for e in validation_errors if ":invalid_nullability" in e),
        "invalid_defaults": sum(1 for e in validation_errors if "default" in e),
        "missing_provenance": sum(1 for e in validation_errors if ":missing_provenance" in e),
        "missing_repair_boundary": sum(1 for e in validation_errors if ":missing_repair_boundary" in e),
        "unresolved_dependencies": len(validation_errors),
        "validation_errors": validation_errors,
        "pass": len(validation_errors) == 0 and len(contracts) >= 1,
    }
    VALIDATION.write_text(json.dumps(summary, indent=2) + "\n")
    print(json.dumps({"contracts": len(contracts), "pass": summary["pass"]}, indent=2))
    return 0 if summary["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
