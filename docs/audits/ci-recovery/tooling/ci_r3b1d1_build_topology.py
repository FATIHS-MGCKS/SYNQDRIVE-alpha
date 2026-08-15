#!/usr/bin/env python3
"""Build graph-hardened CI-R3B1D.1 repair topology from existing R3B1D contracts."""
from __future__ import annotations

import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1d1_repair_action_graph import build_slot_from_metadata, object_names_for_slot, build_slot_graph  # noqa: E402
from ci_r3b1d1_validate_topology import validate_all_slots  # noqa: E402

DATA = REPO / "docs/audits/ci-recovery/data"
VENDOR_CONTRACTS = DATA / "ci-r3b1d-vendor-predecessor-ddl-contracts-2026-08.json"
REMAINING_CONTRACTS = DATA / "ci-r3b1d-remaining-predecessor-ddl-contracts-2026-08.json"
CLOSURE = DATA / "ci-r3b1d-post-vendor-repair-closure-2026-08.json"
R3B1D_TOPOLOGY = DATA / "ci-r3b1d-post-vendor-repair-topology-2026-08.json"

OUT_TOPOLOGY = DATA / "ci-r3b1d1-post-vendor-repair-topology-2026-08.json"
OUT_GRAPH = DATA / "ci-r3b1d1-repair-action-graph-2026-08.json"
OUT_SUMMARY = DATA / "ci-r3b1d1-topology-validation-summary-2026-08.json"
OUT_FK_PROOF = DATA / "ci-r3b1d1-fk-action-order-proof-2026-08.json"
OUT_INDEX_PROOF = DATA / "ci-r3b1d1-index-action-order-proof-2026-08.json"
PRE_R3B1D1_SHA = "6fbdb05be4b53c53a2afb0771547c4a5a6dfbbdb"


def load_all_contracts() -> dict[str, dict]:
    vendor = json.loads(VENDOR_CONTRACTS.read_text())
    remaining = json.loads(REMAINING_CONTRACTS.read_text())
    by_obj = {c["object"]: c for c in vendor["contracts"]}
    by_obj.update({c["object"]: c for c in remaining["contracts"]})
    return by_obj


def reproduce_r3b1d_defects() -> dict:
    topo = json.loads(R3B1D_TOPOLOGY.read_text())
    slot8 = next(s for s in topo["slots"] if s["slot"] == 8)
    slot10 = next(s for s in topo["slots"] if s["slot"] == 10)
    ws_creates = [a for a in slot8["actions"] if a["action"] == "CREATE TYPE" and a["object"] == "WorkflowStatus"]
    fk = next(a for a in slot10["actions"] if a["object"] == "vehicle_damage_images_damage_id_fkey")
    damages_create = next(a for a in slot10["actions"] if a["action"] == "CREATE TABLE" and a["object"] == "vehicle_damages")
    return {
        "slot8_workflowstatus_create_count": len(ws_creates),
        "slot10_fk_action_order": fk["order"],
        "slot10_vehicle_damages_create_order": damages_create["order"],
        "slot10_fk_before_parent_table": fk["order"] < damages_create["order"],
    }


def build_graph_artifact(slots: list[dict], all_contracts: dict[str, dict]) -> dict:
    graph_slots = []
    for slot in slots:
        slot_no = slot["slot"]
        object_names = object_names_for_slot(slot_no, all_contracts)
        slot_contracts = {k: all_contracts[k] for k in object_names if k in all_contracts}
        deferred = None
        if slot_no == 7:
            deferred = [
                a for a in slot["actions"] if a.get("object") == "vendor_vehicles_vendor_id_fkey"
            ]
        g = build_slot_graph(slot_no, slot_contracts, object_names, deferred)
        graph_slots.append(
            {
                "slot": slot_no,
                "nodes": g["nodes"],
                "edges": g["edges"],
                "duplicate_create_records": g["duplicate_create_records"],
                "cycles": g["cycles"],
                "topological_order": g["topological_order"],
                "valid": g["valid"],
            }
        )
    return {"schema_version": 1, "phase": "CI-R3B1D.1", "slots": graph_slots}


def main() -> int:
    all_contracts = load_all_contracts()
    closure_doc = json.loads(CLOSURE.read_text())
    r3b1d_topo = json.loads(R3B1D_TOPOLOGY.read_text())

    preexisting = {
        "sources": [
            "repair_closure.PREEXISTING_TABLES",
            "ci-r3b1d-post-vendor-repair-closure known_valid_objects",
            "cumulative objects_types_sequences_created from prior repair slots",
        ],
        "known_valid_objects": list((closure_doc.get("known_valid_objects") or {}).keys()),
    }

    slots = []
    for slot_meta in r3b1d_topo["slots"]:
        meta = dict(slot_meta)
        meta["preexisting_authority_state"] = preexisting
        slots.append(build_slot_from_metadata(meta, all_contracts, all_contracts))

    summary, fk_proofs, index_proofs, unique_proofs, deferred_doc = validate_all_slots(slots, all_contracts, closure_doc)
    summary["known_r3b1d_defects_reproduced"] = reproduce_r3b1d_defects()
    summary["PRE_R3B1D1_SHA"] = PRE_R3B1D1_SHA
    summary["primary_defect_count"] = len(closure_doc.get("all_genuine_defect_objects", []))
    summary["repair_slot_count"] = len(slots)
    summary["total_graph_edges"] = sum(s["graph_validation"]["edge_count"] for s in slots)

    topology_doc = {
        "schema_version": 1,
        "phase": "CI-R3B1D.1",
        "supersedes": "ci-r3b1d-post-vendor-repair-topology-2026-08.json",
        "target_first_consumer": r3b1d_topo.get("target_first_consumer"),
        "known_valid_objects": closure_doc.get("known_valid_objects"),
        "primary_historical_defects": closure_doc.get("primary_historical_defects"),
        "remaining_historical_defect_objects": closure_doc.get("remaining_historical_defect_objects"),
        "all_genuine_defect_objects": closure_doc.get("all_genuine_defect_objects"),
        "future_repair_slot_count": len(slots),
        "slots": slots,
    }

    OUT_TOPOLOGY.write_text(json.dumps(topology_doc, indent=2) + "\n")
    OUT_GRAPH.write_text(json.dumps(build_graph_artifact(slots, all_contracts), indent=2) + "\n")
    OUT_SUMMARY.write_text(json.dumps(summary, indent=2) + "\n")
    OUT_FK_PROOF.write_text(json.dumps({"schema_version": 1, "records": fk_proofs}, indent=2) + "\n")
    OUT_INDEX_PROOF.write_text(json.dumps({"schema_version": 1, "records": index_proofs}, indent=2) + "\n")

    print(
        json.dumps(
            {
                "pass": summary["pass"],
                "slots": len(slots),
                "duplicate_creates": summary["duplicate_creates"],
                "graph_cycles": summary["graph_cycles"],
                "invalid_fk_actions": summary["invalid_fk_actions"],
                "slot8_ws_after": sum(
                    1
                    for s in slots
                    if s["slot"] == 8
                    for a in s["actions"]
                    if a["action"] == "CREATE TYPE" and a["object"] == "WorkflowStatus"
                ),
            },
            indent=2,
        )
    )
    return 0 if summary["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
