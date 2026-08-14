#!/usr/bin/env python3
"""Build CI-R3B1A.3.2 document-extraction FK authority artifacts."""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1a2_build_dependency_matrix import git_show_file  # noqa: E402
from document_extraction_authority import (  # noqa: E402
    HISTORICAL_EVIDENCE,
    vehicle_document_extractions_contract,
)
from prisma_schema_authority import extract_model_contract, parse_schema  # noqa: E402
from repair_closure import (  # noqa: E402
    apply_fk_chronology,
    build_closure_record,
    build_deferred_fk_resolution_artifact,
    build_repair_topology,
    primary_and_closure_sets,
)

BASE_CONTRACTS = REPO / "docs/audits/ci-recovery/data/ci-r3b1a3-predecessor-ddl-contracts-2026-08.json"
OUT_CONTRACTS = REPO / "docs/audits/ci-recovery/data/ci-r3b1a32-predecessor-ddl-contracts-2026-08.json"
OUT_CLOSURE = REPO / "docs/audits/ci-recovery/data/ci-r3b1a32-repair-dependency-closure-2026-08.json"
OUT_TOPOLOGY = REPO / "docs/audits/ci-recovery/data/ci-r3b1a32-final-repair-topology-2026-08.json"
OUT_DEFERRED = REPO / "docs/audits/ci-recovery/data/ci-r3b1a32-deferred-fk-resolution-2026-08.json"
TARGET_MIGRATION = (
    REPO / "backend/prisma/migrations/20260425000000_retire_user_assignment_and_speeding_severity/migration.sql"
)
TARGET_SHA256 = "1c18164be77dead4db2ff500123754e8c924c9094bc09c41f2408dbcd56a4974"


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def enrich_contracts(contracts: list[dict]) -> dict[str, dict]:
    by_obj: dict[str, dict] = {}
    for contract in contracts:
        enriched = json.loads(json.dumps(contract))
        if enriched.get("object_type") == "table":
            enriched["foreign_keys"] = [
                apply_fk_chronology(enriched["object"], fk) for fk in enriched.get("foreign_keys", [])
            ]
            enriched["deferred_constraints"] = [
                fk
                for fk in enriched["foreign_keys"]
                if fk.get("chronology", "").startswith("CAN_BE_DEFERRED")
            ]
        by_obj[enriched["object"]] = enriched
    return by_obj


def build_vde_contract() -> dict:
    schema = git_show_file("17019787", "backend/prisma/schema.prisma")
    parsed = parse_schema(schema)
    model = extract_model_contract(schema, "VehicleDocumentExtraction")
    return vehicle_document_extractions_contract(schema, parsed.enums, model)


def main() -> int:
    base_doc = json.loads(BASE_CONTRACTS.read_text())
    vde = build_vde_contract()
    contracts = list(base_doc["contracts"]) + [vde]
    contracts_doc = {
        "schema_version": 4,
        "supersedes": "ci-r3b1a3-predecessor-ddl-contracts-2026-08.json",
        "contracts": contracts,
    }
    by_obj = enrich_contracts(contracts)

    closure_records = [
        build_closure_record(c["object"], by_obj[c["object"]], c.get("repair_slot", by_obj[c["object"]].get("repair_slot", 0)))
        for c in contracts
        if c["object"] in by_obj and c.get("object_type") == "table" and c["object"] in {
            "org_tasks",
            "brake_health_current",
            "battery_evidence",
            "org_invoices",
            "vehicle_dtc_events",
            "vehicle_driving_impact_current",
            "vehicle_document_extractions",
        }
    ]
    topology = build_repair_topology(by_obj)
    deferred = build_deferred_fk_resolution_artifact(by_obj)
    impl_sets = primary_and_closure_sets(contracts)

    current_target_sha = sha256_file(TARGET_MIGRATION)
    if current_target_sha != TARGET_SHA256:
        print(f"FAIL: target migration SHA mismatch {current_target_sha}")
        return 1
    if deferred["unresolved_deferred_fks"]:
        print("FAIL: unresolved deferred FKs:", deferred["unresolved_deferred_fks"])
        return 1

    topology_doc = {
        "schema_version": 3,
        "supersedes": "ci-r3b1a31-final-repair-topology-2026-08.json",
        "target_migration_path": str(TARGET_MIGRATION.relative_to(REPO)),
        "target_migration_sha256": TARGET_SHA256,
        "target_migration_sha256_current": current_target_sha,
        "target_migration_sha256_match": current_target_sha == TARGET_SHA256,
        "document_extraction_authority": HISTORICAL_EVIDENCE,
        "slots": topology,
        **impl_sets,
    }
    deferred_doc = {
        "schema_version": 2,
        "supersedes": "ci-r3b1a31-deferred-fk-resolution-2026-08.json",
        "topology_artifact": OUT_TOPOLOGY.name,
        **deferred,
    }

    OUT_CONTRACTS.parent.mkdir(parents=True, exist_ok=True)
    OUT_CONTRACTS.write_text(json.dumps(contracts_doc, indent=2) + "\n")
    OUT_CLOSURE.write_text(
        json.dumps({"schema_version": 2, "supersedes": "ci-r3b1a3-repair-dependency-closure-2026-08.json", "records": closure_records, **impl_sets}, indent=2)
        + "\n"
    )
    OUT_TOPOLOGY.write_text(json.dumps(topology_doc, indent=2) + "\n")
    OUT_DEFERRED.write_text(json.dumps(deferred_doc, indent=2) + "\n")

    print("PASS: built CI-R3B1A.3.2 document-extraction authority")
    print("primary:", impl_sets["primary_historical_defects"])
    print("closure:", impl_sets["required_repair_closure_objects"])
    print("deferred_fks:", deferred["total_deferred_fks"])
    print("target_sha_match:", current_target_sha == TARGET_SHA256)
    return 0


if __name__ == "__main__":
    sys.exit(main())
