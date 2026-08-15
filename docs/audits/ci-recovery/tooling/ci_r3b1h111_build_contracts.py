"""Generic contract builder using authority resolver and dynamic boundaries (CI-R3B1H.1.1)."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from ci_r3b1f111_contract_compiler import compile_add_column_contract, semantic_equivalence, sha256_text
from ci_r3b1f111_contract_validator import validate_column_contract
from ci_r3b1h111_actionable_gaps import derive_unique_actionable_gaps
from ci_r3b1h111_authority_resolver import derive_repair_boundary, resolve_column_authority
from ci_r3b1h111_constants import DATA, evidence_input_sha
from sql_migration_analyzer import AnalyzerContext, prescan_creators

MATRIX = DATA / "ci-r3b1h111-insert-select-dependency-matrix-2026-08.json"
CONTRACTS_OUT = DATA / "ci-r3b1h111-exact-predecessor-contracts-2026-08.json"
VALIDATION_OUT = DATA / "ci-r3b1h111-contract-validation-summary-2026-08.json"
TOPOLOGY_OUT = DATA / "ci-r3b1h111-repair-topology-2026-08.json"


def build_contracts_from_matrix(matrix: dict[str, Any]) -> dict[str, Any]:
    records = matrix.get("records", [])
    ctx = AnalyzerContext(
        repo=Path(__file__).resolve().parents[4],
        mig_dir=Path(__file__).resolve().parents[4] / "backend/prisma/migrations",
        scope=matrix.get("audit_scope", {}).get("scope_migrations", []),
        scope_ord={},
        all_migs=sorted(p.name for p in (Path(__file__).resolve().parents[4] / "backend/prisma/migrations").iterdir() if p.is_dir()),
    )
    prescan_creators(ctx)
    table_creators = set(ctx.table_creators.keys())

    canonical_gaps = matrix.get("unique_actionable_gaps")
    if canonical_gaps:
        provisional_gaps = canonical_gaps
    else:
        provisional_gaps = derive_unique_actionable_gaps(records, table_creators)

    boundary_by_gap: dict[tuple[str, str], dict[str, str]] = {}
    authority_by_gap: dict[tuple[str, str], Any] = {}
    for gap in provisional_gaps:
        boundary = derive_repair_boundary(gap["relation"], gap["property"], gap["first_consumer_migration"])
        if boundary.valid and boundary.after_migration:
            boundary_by_gap[(gap["relation"], gap["property"])] = {
                "after_migration": boundary.after_migration,
                "before_migration": boundary.before_migration,
            }
        authority_by_gap[(gap["relation"], gap["property"])] = resolve_column_authority(
            gap["relation"], gap["property"], gap["first_consumer_migration"]
        )

    if canonical_gaps:
        gaps = canonical_gaps
    else:
        gaps = derive_unique_actionable_gaps(records, table_creators, boundary_by_gap)
    contracts = []
    compiled_rows = []
    validation_errors = []
    topology = []
    uncontracted = []

    for gap in gaps:
        auth = authority_by_gap.get((gap["relation"], gap["property"]))
        boundary = boundary_by_gap.get((gap["relation"], gap["property"]))
        if not auth or auth.status != "COMPLETE_AUTHORITY" or not boundary:
            uncontracted.append(
                {
                    "relation": gap["relation"],
                    "property": gap["property"],
                    "authority_status": auth.status if auth else "MISSING",
                    "boundary_valid": bool(boundary),
                }
            )
            continue

        contract_id = f"R3B1H111-{gap['relation']}-{gap['property']}".replace("_", "-")
        contract = {
            "contract_id": contract_id,
            "relation": gap["relation"],
            "column": gap["property"],
            "postgres_type": auth.postgres_type,
            "nullable": auth.nullable,
            "default_semantics": auth.default_semantics or "NO_DATABASE_DEFAULT",
            "default_value": auth.default_value,
            "enum_dependency": auth.enum_dependency,
            "foreign_key": None,
            "generated_semantics": None,
            "classification": gap["classification"],
            "first_consumer_migration": gap["first_consumer_migration"],
            "first_consumer_statement": gap["first_consumer_statement"],
            "authority_status": auth.status,
            "repair_boundary": {
                "after_migration": boundary["after_migration"],
                "before_migration": boundary["before_migration"],
                "topology_id": contract_id,
                "rationale": "Derived by chronology search before first consumer.",
                "checks": derive_repair_boundary(gap["relation"], gap["property"], gap["first_consumer_migration"]).checks,
            },
            "provenance": {"sources": auth.sources or []},
        }
        errors = validate_column_contract(contract, known_enums=set())
        validation_errors.extend([f"{contract_id}:{err}" for err in errors])
        sql = compile_add_column_contract(contract)
        equiv = semantic_equivalence(contract, sql)
        if not equiv:
            validation_errors.append(f"{contract_id}:semantic_equivalence_fail")
        compiled_rows.append(
            {
                "contract_id": contract_id,
                "compiled_sql": sql,
                "compiled_sql_sha256": sha256_text(sql),
                "semantic_equivalence": "PASS" if equiv else "FAIL",
            }
        )
        contracts.append(contract)
        topology.append(
            {
                "repair_id": contract_id,
                "after_migration": boundary["after_migration"],
                "before_migration": boundary["before_migration"],
                "first_consumer": gap["first_consumer_migration"],
            }
        )

    summary = {
        "schema_version": 1,
        "phase": "CI-R3B1H.1.1",
        "evidence_input_sha": evidence_input_sha(),
        "unique_actionable_gaps": len(gaps),
        "exact_contracts": len(contracts),
        "uncontracted_gaps": len(uncontracted),
        "uncontracted": uncontracted,
        "invalid_types": sum(1 for err in validation_errors if "type" in err),
        "validation_errors": validation_errors,
        "generic_builder": True,
        "pass": len(uncontracted) == 0 and len(validation_errors) == 0 and len(contracts) == len(gaps),
    }
    return {
        "summary": summary,
        "contracts": contracts,
        "compiled": compiled_rows,
        "topology": topology,
        "gaps": gaps,
    }


def main() -> int:
    matrix = json.loads(MATRIX.read_text())
    built = build_contracts_from_matrix(matrix)
    CONTRACTS_OUT.write_text(json.dumps({"schema_version": 1, "contracts": built["contracts"], "compiled": built["compiled"]}, indent=2) + "\n")
    TOPOLOGY_OUT.write_text(json.dumps({"schema_version": 1, "slots": built["topology"]}, indent=2) + "\n")
    VALIDATION_OUT.write_text(json.dumps(built["summary"], indent=2) + "\n")
    print(json.dumps({"gaps": built["summary"]["unique_actionable_gaps"], "contracts": built["summary"]["exact_contracts"], "pass": built["summary"]["pass"]}, indent=2))
    return 0 if built["summary"]["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
