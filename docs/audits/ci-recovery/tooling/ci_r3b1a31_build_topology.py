#!/usr/bin/env python3
"""Build CI-R3B1A.3.1 repair topology and deferred FK resolution artifacts."""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from repair_closure import (  # noqa: E402
    apply_fk_chronology,
    build_deferred_fk_resolution_artifact,
    build_repair_topology,
    primary_and_closure_sets,
)

REPO = Path(__file__).resolve().parents[4]
CONTRACTS = REPO / "docs/audits/ci-recovery/data/ci-r3b1a3-predecessor-ddl-contracts-2026-08.json"
CLOSURE = REPO / "docs/audits/ci-recovery/data/ci-r3b1a3-repair-dependency-closure-2026-08.json"
OUT_TOPOLOGY = REPO / "docs/audits/ci-recovery/data/ci-r3b1a31-final-repair-topology-2026-08.json"
OUT_DEFERRED = REPO / "docs/audits/ci-recovery/data/ci-r3b1a31-deferred-fk-resolution-2026-08.json"
TARGET_MIGRATION = (
    REPO / "backend/prisma/migrations/20260425000000_retire_user_assignment_and_speeding_severity/migration.sql"
)
TARGET_SHA256 = "1c18164be77dead4db2ff500123754e8c924c9094bc09c41f2408dbcd56a4974"


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def enrich_contracts(contracts: list[dict]) -> dict[str, dict]:
    """Re-apply chronology overrides without mutating stored contract artifacts."""
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


def main() -> int:
    contracts_doc = json.loads(CONTRACTS.read_text())
    by_obj = enrich_contracts(contracts_doc["contracts"])

    topology = build_repair_topology(by_obj)
    deferred = build_deferred_fk_resolution_artifact(by_obj)
    impl_sets = primary_and_closure_sets(contracts_doc["contracts"])

    current_target_sha = sha256_file(TARGET_MIGRATION)
    if current_target_sha != TARGET_SHA256:
        print(f"FAIL: target migration SHA mismatch {current_target_sha}")
        return 1

    if deferred["unresolved_deferred_fks"]:
        print("FAIL: unresolved deferred FKs:", deferred["unresolved_deferred_fks"])
        return 1

    topology_doc = {
        "schema_version": 2,
        "supersedes": "ci-r3b1a3-final-repair-topology-2026-08.json",
        "target_migration_path": str(TARGET_MIGRATION.relative_to(REPO)),
        "target_migration_sha256": TARGET_SHA256,
        "target_migration_sha256_current": current_target_sha,
        "target_migration_sha256_match": current_target_sha == TARGET_SHA256,
        "slots": topology,
        **impl_sets,
    }
    deferred_doc = {
        "schema_version": 1,
        "supersedes": None,
        "topology_artifact": OUT_TOPOLOGY.name,
        **deferred,
    }

    OUT_TOPOLOGY.parent.mkdir(parents=True, exist_ok=True)
    OUT_TOPOLOGY.write_text(json.dumps(topology_doc, indent=2) + "\n")
    OUT_DEFERRED.write_text(json.dumps(deferred_doc, indent=2) + "\n")

    print("PASS: built CI-R3B1A.3.1 topology artifacts")
    print("slots:", len(topology))
    print("deferred_fks:", deferred["total_deferred_fks"])
    print("unresolved:", len(deferred["unresolved_deferred_fks"]))
    print("primary:", impl_sets["primary_historical_defects"])
    print("closure:", impl_sets["required_repair_closure_objects"])
    print("target_sha_match:", current_target_sha == TARGET_SHA256)
    return 0


if __name__ == "__main__":
    sys.exit(main())
