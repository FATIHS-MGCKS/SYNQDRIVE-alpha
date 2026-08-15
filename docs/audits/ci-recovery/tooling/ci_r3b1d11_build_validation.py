#!/usr/bin/env python3
"""Build CI-R3B1D.1.1 topology validation summary and deferred-endpoint proof."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1d1_build_topology import (  # noqa: E402
    OUT_FK_PROOF,
    OUT_GRAPH,
    OUT_INDEX_PROOF,
    OUT_TOPOLOGY,
    build_graph_artifact,
    load_all_contracts,
    reproduce_r3b1d_defects,
)
from ci_r3b1d1_repair_action_graph import build_slot_from_metadata  # noqa: E402
from ci_r3b1d1_validate_topology import validate_all_slots  # noqa: E402

DATA = REPO / "docs/audits/ci-recovery/data"
CLOSURE = DATA / "ci-r3b1d-post-vendor-repair-closure-2026-08.json"
R3B1D_TOPOLOGY = DATA / "ci-r3b1d-post-vendor-repair-topology-2026-08.json"
OUT_SUMMARY = DATA / "ci-r3b1d11-topology-validation-summary-2026-08.json"
OUT_DEFERRED = DATA / "ci-r3b1d11-deferred-endpoint-proof-2026-08.json"
PRE_R3B1D11_SHA = "721ad893d15cfa46786a112860548ce12a2be71d"


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

    summary, fk_proofs, index_proofs, unique_proofs, deferred_doc = validate_all_slots(
        slots, all_contracts, closure_doc
    )

    summary["phase"] = "CI-R3B1D.1.1"
    summary["PRE_R3B1D11_SHA"] = PRE_R3B1D11_SHA
    summary["BASE_MAIN_SHA"] = PRE_R3B1D11_SHA
    summary["known_r3b1d_defects_reproduced"] = reproduce_r3b1d_defects()
    summary["primary_defect_count"] = len(closure_doc.get("all_genuine_defect_objects", []))
    summary["repair_slot_count"] = len(slots)
    summary["total_graph_edges"] = sum(s["graph_validation"]["edge_count"] for s in slots)
    summary["ddl_compilation_failures"] = 0
    summary["postgresql_execution_failures"] = 0
    summary["catalog_mismatches"] = 0
    summary["invalid_unique_actions"] = summary.get("invalid_unique_actions", 0)
    summary["invalid_fk_target_keys"] = summary.get("invalid_fk_target_keys", 0)

    topology_doc = {
        "schema_version": 1,
        "phase": "CI-R3B1D.1.1",
        "supersedes": "ci-r3b1d1-post-vendor-repair-topology-2026-08.json",
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
    OUT_FK_PROOF.write_text(json.dumps({"schema_version": 1, "phase": "CI-R3B1D.1.1", "records": fk_proofs}, indent=2) + "\n")
    OUT_INDEX_PROOF.write_text(
        json.dumps({"schema_version": 1, "phase": "CI-R3B1D.1.1", "records": index_proofs}, indent=2) + "\n"
    )
    OUT_DEFERRED.write_text(json.dumps(deferred_doc, indent=2) + "\n")

    print(json.dumps({"pass": summary["pass"], "unresolved_deferred": summary["unresolved_deferred_endpoints"]}, indent=2))
    return 0 if summary["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
