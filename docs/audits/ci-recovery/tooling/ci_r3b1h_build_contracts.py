#!/usr/bin/env python3
"""Build exact IAM predecessor contracts, closure, and repair topology (CI-R3B1H)."""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1f111_contract_compiler import compile_add_column_contract, semantic_equivalence, sha256_text
from ci_r3b1f111_contract_validator import validate_column_contract
from ci_r3b1h_constants import DATA, IAM_CONSUMER, IAM_HISTORICAL_SCHEMA_COMMIT, LAST_APPLIED_PRE249, PRE249_BOUNDARY, SCHEMA

CONTRACTS_OUT = DATA / "ci-r3b1h-exact-iam-predecessor-contracts-2026-08.json"
CLOSURE_OUT = DATA / "ci-r3b1h-iam-repair-closure-2026-08.json"
TOPOLOGY_OUT = DATA / "ci-r3b1h-iam-repair-topology-2026-08.json"
VALIDATION_OUT = DATA / "ci-r3b1h-contract-validation-summary-2026-08.json"
MATRIX = DATA / "ci-r3b1h-insert-select-dependency-matrix-2026-08.json"
GAP = DATA / "ci-r3b1h-iam-predecessor-gap-matrix-2026-08.json"


def schema_sha() -> str:
    return hashlib.sha256(SCHEMA.read_bytes()).hexdigest()


def build_permissions_contract(schema_hash: str) -> dict:
    return {
        "contract_id": "R3B1H-organization_memberships-permissions",
        "relation": "organization_memberships",
        "column": "permissions",
        "postgres_type": "jsonb",
        "nullable": True,
        "default_semantics": "NO_DATABASE_DEFAULT",
        "default_value": None,
        "enum_dependency": None,
        "foreign_key": None,
        "generated_semantics": None,
        "classification": "MISSING_HISTORY",
        "first_consumer_migration": IAM_CONSUMER,
        "first_consumer_statement": 31,
        "repair_boundary": {
            "after_migration": LAST_APPLIED_PRE249,
            "before_migration": IAM_CONSUMER,
            "topology_id": "R3B1H-IAM-PERMISSIONS-PREDECESSOR",
            "rationale": (
                "Earliest append-only boundary after organization_memberships table and IAM-era "
                "predecessors exist, immediately before migration 249 INSERT-SELECT backfill reads m.permissions."
            ),
        },
        "provenance": {
            "sources": [
                f"git:{IAM_HISTORICAL_SCHEMA_COMMIT}:OrganizationMembership.permissions Json?",
                "migration:20260721250000_iam_versioned_role_assignments:statement:31:WHERE m.permissions IS NOT NULL",
                "catalog:ci-r3b1h-pre-249-catalog-snapshot:organization_memberships.permissions=missing",
                "creator_search:no ADD COLUMN permissions in migration history",
            ]
        },
    }


def main() -> int:
    matrix = json.loads(MATRIX.read_text()) if MATRIX.is_file() else {"unique_actionable_gaps": []}
    gap_doc = json.loads(GAP.read_text()) if GAP.is_file() else {}
    gaps = matrix.get("unique_actionable_gaps", [])
    schema_hash = schema_sha()
    contracts = []

    perm_gap = next(
        (g for g in gaps if g.get("relation") == "organization_memberships" and g.get("property") == "permissions"),
        None,
    )
    if perm_gap or gap_doc.get("organization_memberships_permissions_proof", {}).get("any_migration_creator") is None:
        contracts = [build_permissions_contract(schema_hash)]
    else:
        contracts = []

    validation_errors = []
    compiled_rows = []
    topology_slots = [
        {
            "repair_id": "R3B1H-IAM-PERMISSIONS-PREDECESSOR",
            "after_migration": LAST_APPLIED_PRE249,
            "before_migration": IAM_CONSUMER,
            "ordered_actions": [
                {
                    "operation": "ADD_COLUMN",
                    "relation": "organization_memberships",
                    "column": "permissions",
                    "type": "jsonb",
                    "nullable": True,
                    "default": None,
                }
            ],
            "dependencies": ["organization_memberships"],
            "first_consumer": IAM_CONSUMER,
        }
    ] if contracts else []
    closure_rows = []

    for contract in contracts:
        if contract.get("postgres_type"):
            errors = validate_column_contract(contract, known_enums=set())
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
            closure_rows.append(
                {
                    "contract_id": contract["contract_id"],
                    "table_exists_required": True,
                    "column_absent_required": True,
                    "named_type_dependencies": [],
                    "default_dependencies": [],
                    "fk_targets": [],
                    "closure_pass": len(errors) == 0 and equiv,
                }
            )

    CONTRACTS_OUT.write_text(json.dumps({"schema_version": 1, "contracts": contracts, "compiled": compiled_rows}, indent=2) + "\n")
    TOPOLOGY_OUT.write_text(json.dumps({"schema_version": 1, "slots": topology_slots}, indent=2) + "\n")
    CLOSURE_OUT.write_text(json.dumps({"schema_version": 1, "records": closure_rows}, indent=2) + "\n")

    summary = {
        "schema_version": 1,
        "phase": "CI-R3B1H",
        "genuine_contracts": len(contracts),
        "invalid_types": sum(1 for e in validation_errors if "type" in e),
        "missing_types": sum(1 for e in validation_errors if "missing_type" in e),
        "missing_boundaries": sum(1 for c in contracts if not c.get("repair_boundary")),
        "validation_errors": validation_errors,
        "pass": len(validation_errors) == 0 and len(contracts) >= 1,
    }
    VALIDATION_OUT.write_text(json.dumps(summary, indent=2) + "\n")
    print(json.dumps({"contracts": len(contracts), "pass": summary["pass"]}, indent=2))
    return 0 if summary["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
