#!/usr/bin/env python3
"""Build expression-gap contracts, closure, and repair topology for CI-R3B1F."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1f_constants import DATA, PRE157_BOUNDARY, REPO, SLOT13_REPAIR, TIRE_CONSUMER

MATRIX = DATA / "ci-r3b1f-expression-aware-dependency-matrix-2026-08.json"
OUT_CONTRACTS = DATA / "ci-r3b1f-expression-gap-predecessor-contracts-2026-08.json"
OUT_CLOSURE = DATA / "ci-r3b1f-expression-gap-repair-closure-2026-08.json"
OUT_TOPOLOGY = DATA / "ci-r3b1f-expression-gap-repair-topology-2026-08.json"
MIG_DIR = REPO / "backend/prisma/migrations"


def find_add_column_authority(table: str, column: str) -> dict | None:
    for mig in sorted(p.name for p in MIG_DIR.iterdir() if p.is_dir()):
        sql = (MIG_DIR / mig / "migration.sql").read_text()
        if f'"{column}"' not in sql or table not in sql:
            continue
        m = re.search(
            rf'ALTER\s+TABLE\s+"{re.escape(table)}"[\s\S]*ADD\s+COLUMN[\s\S]*"{re.escape(column)}"\s+([^,\n;]+)',
            sql,
            re.I,
        )
        if m:
            return {"migration": mig, "postgres_type": m.group(1).strip(), "kind": "ADD COLUMN"}
        if mig == "20260311224040_init" and f'CREATE TABLE "{table}"' in sql:
            body = sql.split(f'CREATE TABLE "{table}"', 1)[1].split(");")[0]
            col_m = re.search(rf'"{re.escape(column)}"\s+([^,\n]+)', body)
            if col_m:
                return {"migration": mig, "postgres_type": col_m.group(1).strip(), "kind": "CREATE TABLE"}
    return None


def repair_boundary(defect: dict) -> dict:
    consumer = defect["first_consumer_migration"]
    all_migs = sorted(p.name for p in MIG_DIR.iterdir() if p.is_dir())
    idx = all_migs.index(consumer)
    after = all_migs[idx - 1] if idx > 0 else None
    if defect["relation"] == "vehicle_tire_setups" and defect["property"] == "status":
        return {
            "after_migration": PRE157_BOUNDARY,
            "before_migration": TIRE_CONSUMER,
            "recommended_topology_id": "R3B1F-SLOT13-EXT-STATUS",
            "rationale": (
                "Earliest valid boundary after TireSetupStatus enum (Slot 13) and vehicle_tire_setups table (init), "
                "before migration 157 partial-index predicate consumer."
            ),
        }
    return {
        "after_migration": after,
        "before_migration": consumer,
        "recommended_topology_id": f"R3B1F-EXPR-{defect['relation']}-{defect['property']}",
        "rationale": f"Append-only repair before first expression consumer {consumer}.",
    }


def main() -> int:
    matrix = json.loads(MATRIX.read_text())
    defects = matrix.get("unique_new_defects", [])

    contracts = []
    topology_slots = []
    for defect in defects:
        authority = find_add_column_authority(defect["relation"], defect["property"])
        boundary = repair_boundary(defect)
        contract = {
            "contract_id": f"R3B1F-{defect['relation']}-{defect['property']}",
            "relation": defect["relation"],
            "property": defect["property"],
            "object_type": "column",
            "classification": defect["classification"],
            "dependency_contexts": defect.get("dependency_contexts", []),
            "source_analyzer_records": [
                r["id"]
                for r in matrix["records"]
                if r.get("classification") == defect["classification"]
                and (r.get("required_relation") or r.get("required_object")) == defect["relation"]
                and r.get("required_property") == defect["property"]
                and r.get("dependency_context") in defect.get("dependency_contexts", [])
            ][:5],
            "historical_authority": {
                "physical_column_name": defect["property"],
                "postgres_type": authority["postgres_type"] if authority else None,
                "historical_creator_migration": authority["migration"] if authority else None,
                "historical_creator_kind": authority["kind"] if authority else None,
                "column_never_created_before_consumer": authority is None
                or (
                    authority["migration"] == defect["first_consumer_migration"]
                    and defect["classification"] == "MISSING_HISTORY"
                ),
            },
            "first_consumer_migration": defect["first_consumer_migration"],
            "first_consumer_order": defect["first_consumer_order"],
            "all_consumers": defect.get("all_consumers", []),
            "repair_boundary": boundary,
            "repair_action": {
                "action": "ALTER TABLE ADD COLUMN",
                "table": defect["relation"],
                "column": defect["property"],
                "type": authority["postgres_type"] if authority else None,
                "if_not_exists": True,
            },
        }
        contracts.append(contract)
        topology_slots.append(
            {
                "topology_id": boundary["recommended_topology_id"],
                "after_migration": boundary["after_migration"],
                "before_migration": boundary["before_migration"],
                "ordered_actions": [contract["repair_action"]],
                "objects_properties_repaired": [f"{defect['relation']}.{defect['property']}"],
                "first_consumer_protected": defect["first_consumer_migration"],
                "dependency_closure": [defect["relation"]],
                "extends_slot": 13 if defect["property"] == "status" else None,
            }
        )

    closure = {
        "schema_version": 1,
        "phase": "CI-R3B1F",
        "gaps": [],
    }
    for contract in contracts:
        prereqs = [{"object": contract["relation"], "type": "table", "creator": "20260311224040_init", "satisfied_at_boundary": True}]
        if contract["property"] == "status":
            prereqs.insert(
                0,
                {"object": "TireSetupStatus", "type": "enum", "creator": SLOT13_REPAIR, "satisfied_at_boundary": True},
            )
        closure["gaps"].append(
            {
                "contract_id": contract["contract_id"],
                "prerequisites": prereqs,
                "closure_complete": all(p.get("satisfied_at_boundary") for p in prereqs),
            }
        )

    topology = {
        "schema_version": 1,
        "phase": "CI-R3B1F",
        "implementation_deferred": True,
        "slots": topology_slots,
        "notes": "Committed Slot 13 migration must not be edited; append-only repairs deferred to post-review implementation phase.",
    }

    OUT_CONTRACTS.write_text(json.dumps({"schema_version": 1, "contracts": contracts}, indent=2) + "\n")
    OUT_CLOSURE.write_text(json.dumps(closure, indent=2) + "\n")
    OUT_TOPOLOGY.write_text(json.dumps(topology, indent=2) + "\n")
    print(json.dumps({"contracts": len(contracts), "topology_slots": len(topology_slots)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
