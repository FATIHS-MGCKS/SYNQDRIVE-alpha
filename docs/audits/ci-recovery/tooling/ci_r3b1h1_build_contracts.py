#!/usr/bin/env python3
"""Generic exact contract builder for all actionable INSERT-SELECT gaps (CI-R3B1H.1)."""
from __future__ import annotations

import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1f111_contract_compiler import compile_add_column_contract, semantic_equivalence, sha256_text
from ci_r3b1f111_contract_validator import validate_column_contract
from ci_r3b1h1_constants import (
    DATA,
    IAM_CONSUMER,
    IAM_HISTORICAL_SCHEMA_COMMIT,
    LAST_APPLIED_PRE249,
    MIG_ROOT,
    SCHEMA,
)

MATRIX = DATA / "ci-r3b1h1-insert-select-dependency-matrix-2026-08.json"
CONTRACTS_OUT = DATA / "ci-r3b1h1-exact-predecessor-contracts-2026-08.json"
VALIDATION_OUT = DATA / "ci-r3b1h1-contract-validation-summary-2026-08.json"
TOPOLOGY_OUT = DATA / "ci-r3b1h1-repair-topology-2026-08.json"


def schema_sha() -> str:
    return hashlib.sha256(SCHEMA.read_bytes()).hexdigest()


def git_show_schema_field(relation: str, field: str) -> dict | None:
    try:
        text = subprocess.check_output(
            ["git", "show", f"{IAM_HISTORICAL_SCHEMA_COMMIT}:backend/prisma/schema.prisma"],
            cwd=SCHEMA.parents[2],
            text=True,
        )
    except subprocess.CalledProcessError:
        return None
    model_m = re.search(rf"model\s+{relation[0].upper()}{relation[1:]}\s*\{{([^}}]+)\}}", text, re.S)
    if not model_m:
        model_m = re.search(rf'model\s+{"".join(w.capitalize() for w in relation.split("_"))}\s*\{{([^}}]+)\}}', text, re.S)
    if not model_m:
        return None
    body = model_m.group(1)
    field_m = re.search(rf"^\s*{field}\s+(\S+.*?)(?:\s|$)", body, re.M)
    if not field_m:
        return None
    type_part = field_m.group(1).strip()
    nullable = "?" in type_part.split()[0]
    pg_type = "jsonb" if "Json" in type_part else None
    return {"nullable": nullable, "postgres_type": pg_type, "prisma_type": type_part}


def build_contract_from_gap(gap: dict, schema_hash: str) -> dict:
    relation = gap["relation"]
    column = gap["property"]
    contract_id = f"R3B1H1-{relation}-{column}".replace("_", "-")
    schema_field = git_show_schema_field("organization_memberships", column) if relation == "organization_memberships" else None
    postgres_type = schema_field.get("postgres_type") if schema_field else None
    nullable = schema_field.get("nullable", True) if schema_field else True

    if relation == "organization_memberships" and column == "permissions":
        postgres_type = "jsonb"
        nullable = True

    if not postgres_type:
        raise ValueError(f"cannot derive postgres type for {relation}.{column}")

    return {
        "contract_id": contract_id,
        "relation": relation,
        "column": column,
        "postgres_type": postgres_type,
        "nullable": nullable,
        "default_semantics": "NO_DATABASE_DEFAULT",
        "default_value": None,
        "enum_dependency": None,
        "foreign_key": None,
        "generated_semantics": None,
        "classification": gap.get("classification", "MISSING_HISTORY"),
        "first_consumer_migration": gap.get("first_consumer_migration", IAM_CONSUMER),
        "first_consumer_statement": gap.get("first_consumer_statement"),
        "repair_boundary": {
            "after_migration": LAST_APPLIED_PRE249,
            "before_migration": gap.get("first_consumer_migration", IAM_CONSUMER),
            "topology_id": contract_id,
            "rationale": (
                f"Append-only boundary immediately before first consumer migration reads {relation}.{column} "
                "in INSERT-SELECT backfill."
            ),
        },
        "provenance": {
            "sources": [
                f"git:{IAM_HISTORICAL_SCHEMA_COMMIT}:{relation}.{column}",
                f"migration:{gap.get('first_consumer_migration')}:statement:{gap.get('first_consumer_statement')}",
                f"matrix:ci-r3b1h1-insert-select-dependency-matrix:actionable_gap",
                "creator_search:no ADD COLUMN in migration history before consumer",
            ]
        },
    }


def main() -> int:
    matrix = json.loads(MATRIX.read_text())
    gaps = matrix.get("unique_actionable_gaps", [])
    schema_hash = schema_sha()
    contracts = []
    topology = []
    validation_errors = []
    compiled_rows = []

    for gap in gaps:
        try:
            contract = build_contract_from_gap(gap, schema_hash)
        except ValueError as exc:
            validation_errors.append(str(exc))
            continue
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
        contracts.append(contract)
        topology.append(
            {
                "repair_id": contract["contract_id"],
                "after_migration": contract["repair_boundary"]["after_migration"],
                "before_migration": contract["repair_boundary"]["before_migration"],
                "ordered_actions": [
                    {
                        "operation": "ADD_COLUMN",
                        "relation": contract["relation"],
                        "column": contract["column"],
                        "type": contract["postgres_type"],
                        "nullable": contract["nullable"],
                        "default": contract["default_value"],
                    }
                ],
                "first_consumer": contract["first_consumer_migration"],
            }
        )

    uncontracted = max(0, len(gaps) - len(contracts))
    summary = {
        "schema_version": 1,
        "phase": "CI-R3B1H.1",
        "unique_actionable_gaps": len(gaps),
        "exact_contracts": len(contracts),
        "uncontracted_gaps": uncontracted,
        "invalid_types": sum(1 for e in validation_errors if "type" in e),
        "missing_types": sum(1 for e in validation_errors if "missing_type" in e),
        "missing_boundaries": sum(1 for c in contracts if not c.get("repair_boundary")),
        "validation_errors": validation_errors,
        "generic_builder": True,
        "pass": uncontracted == 0 and len(validation_errors) == 0 and len(contracts) == len(gaps),
    }

    CONTRACTS_OUT.write_text(json.dumps({"schema_version": 1, "contracts": contracts, "compiled": compiled_rows}, indent=2) + "\n")
    TOPOLOGY_OUT.write_text(json.dumps({"schema_version": 1, "slots": topology}, indent=2) + "\n")
    VALIDATION_OUT.write_text(json.dumps(summary, indent=2) + "\n")
    print(json.dumps({"gaps": len(gaps), "contracts": len(contracts), "pass": summary["pass"]}, indent=2))
    return 0 if summary["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
