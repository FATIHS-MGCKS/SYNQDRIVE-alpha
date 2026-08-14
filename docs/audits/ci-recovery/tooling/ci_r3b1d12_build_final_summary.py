#!/usr/bin/env python3
"""Build CI-R3B1D.1.2 single machine evidence source for report generation."""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
DATA = REPO / "docs/audits/ci-recovery/data"
OUT = DATA / "ci-r3b1d12-final-validation-summary-2026-08.json"
PRE_R3B1D12_SHA = "5ac7e9b48b779dea76bb9761ec9103bc9245fe8d"
R3B1D11_COMMIT = "adff5521"


def load(name: str) -> dict:
    return json.loads((DATA / name).read_text())


def main() -> int:
    topology = load("ci-r3b1d11-topology-validation-summary-2026-08.json")
    ddl = load("ci-r3b1d11-executable-ddl-proof-2026-08.json")
    catalog = load("ci-r3b1d12-postgresql-catalog-parity-2026-08.json")
    deferred = load("ci-r3b1d11-deferred-endpoint-proof-2026-08.json")
    exposure = load("ci-r3b1d12-post-merge-exposure-2026-08.json")
    immut = load("ci-r3b1d12-immutability-audit-2026-08.json")
    authority = load("ci-r3b1d12-authority-reference-2026-08.json")

    head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=REPO, text=True).strip()
    branch = subprocess.check_output(["git", "branch", "--show-current"], cwd=REPO, text=True).strip()

    per_slot = []
    for slot_row in catalog.get("per_slot", []):
        slot_no = slot_row["slot"]
        topo_slot = next((s for s in topology.get("slot_results", []) if s["slot"] == slot_no), {})
        ddl_slot = next((s for s in ddl.get("slot_results", []) if s["slot"] == slot_no), {})
        per_slot.append(
            {
                "slot": slot_no,
                "action_count": topo_slot.get("action_count", 0),
                "graph_edge_count": topo_slot.get("graph_validation", {}).get("edge_count", 0),
                "postgresql_execution": ddl_slot.get("status", "UNKNOWN"),
                "catalog_mismatch_count": slot_row.get("mismatch_count", 0),
                "catalog_expected_count": slot_row.get("catalog_expected_count", 0),
                "catalog_matched_count": slot_row.get("catalog_matched_count", 0),
            }
        )

    cat = catalog.get("category_counters", {})
    gates = {
        "slots_postgresql_execution_pass": all(s["postgresql_execution"] == "PASS" for s in per_slot),
        "slots_catalog_mismatch_zero": all(s["catalog_mismatch_count"] == 0 for s in per_slot),
        "total_catalog_mismatches_zero": cat.get("total", 1) == 0,
        "unresolved_deferred_endpoints_zero": topology.get("unresolved_deferred_endpoints", 1) == 0,
        "exposure_not_e3": exposure.get("exposure_classification") != "E3",
        "immutability_pass": immut.get("pass", False),
    }

    out = {
        "schema_version": 1,
        "phase": "CI-R3B1D.1.2",
        "branch": branch,
        "PRE_R3B1D12_SHA": PRE_R3B1D12_SHA,
        "R3B1D11_IMPLEMENTATION_COMMIT": R3B1D11_COMMIT,
        "HEAD": head,
        "authority_sweep_repeated": False,
        "new_prisma_migrations": False,
        "full_replay": False,
        "primary_historical_defects": 18,
        "repair_slots": 10,
        "repair_boundaries_changed": False,
        "authority_semantics_changed": authority.get("repair_authority_semantics_changed") == "NO",
        "catalog_proof_added": True,
        "postgresql_version": catalog.get("postgresql_version"),
        "slots_tested": len(per_slot),
        "slots_postgresql_pass": sum(1 for s in per_slot if s["postgresql_execution"] == "PASS"),
        "per_slot": per_slot,
        "global_topology": {
            "slots_validated": topology.get("slots_validated", 0),
            "total_actions": topology.get("total_actions", 0),
            "total_graph_edges": topology.get("total_graph_edges", 0),
            "duplicate_creates": topology.get("duplicate_creates", 0),
            "graph_cycles": topology.get("graph_cycles", 0),
            "invalid_fk_actions": topology.get("invalid_fk_actions", 0),
            "invalid_fk_target_keys": topology.get("invalid_fk_target_keys", 0),
            "invalid_unique_actions": topology.get("invalid_unique_actions", 0),
            "invalid_index_actions": topology.get("invalid_index_actions", 0),
            "unresolved_deferred_endpoints": topology.get("unresolved_deferred_endpoints", 0),
        },
        "deferred_endpoints": {
            "total": deferred.get("total", 0),
            "resolved": deferred.get("resolved", 0),
            "unresolved_count": deferred.get("unresolved_count", 0),
        },
        "catalog_parity": {
            "category_counters": cat,
            "fk_definitions_expected": catalog.get("fk_definitions_expected", 0),
            "fk_definitions_matched": catalog.get("fk_definitions_matched", 0),
            "fk_definition_mismatches": catalog.get("fk_definition_mismatches", 0),
            "slot8_special_proof": catalog.get("slot8_special_proof", {}),
            "slot10_special_proof": catalog.get("slot10_special_proof", {}),
        },
        "exposure": {
            "previous_classification": exposure.get("previous_classification"),
            "classification": exposure.get("exposure_classification"),
            "classification_confidence": exposure.get("classification_confidence"),
            "reason": exposure.get("classification_reason"),
            "latest_deployed_sha": exposure.get("latest_deployed_sha"),
            "migration_ledger_availability": exposure.get("PRODUCTION_MIGRATION_LEDGER"),
            "evidence_sufficient_for_classification": exposure.get("evidence_sufficient_for_classification"),
            "production_deployment_actions_permitted_now": exposure.get("production_deployment_actions_permitted_now"),
        },
        "immutability": {
            "existing_migration_sql_changed": immut.get("existing_migration_sql_changed", 0),
            "schema_prisma_changed": immut.get("schema_prisma_changed", False),
            "runtime_code_changed": immut.get("runtime_code_changed", False),
        },
        "safety": {
            "production_ddl_dml": False,
            "deployment": False,
            "merge": False,
            "r3b1e_started": False,
        },
        "completion_gates": gates,
        "pass": all(gates.values()),
        "final_status": (
            "CI_R3B1D12_CATALOG_EXPOSURE_EVIDENCE_CLOSURE_COMPLETED"
            if all(gates.values())
            else "CI_R3B1D12_CATALOG_EXPOSURE_EVIDENCE_CLOSURE_FAILED"
        ),
    }
    OUT.write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps({"pass": out["pass"], "final_status": out["final_status"]}, indent=2))
    return 0 if out["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
