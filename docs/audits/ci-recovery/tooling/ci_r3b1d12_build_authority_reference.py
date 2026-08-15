#!/usr/bin/env python3
"""Build CI-R3B1D.1.2 authority reference snapshot (hashes only, no semantic change)."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
DATA = REPO / "docs/audits/ci-recovery/data"
OUT = DATA / "ci-r3b1d12-authority-reference-2026-08.json"

AUTHORITY_FILES = {
    "r3b1d_vendor_contracts": DATA / "ci-r3b1d-vendor-predecessor-ddl-contracts-2026-08.json",
    "r3b1d_remaining_contracts": DATA / "ci-r3b1d-remaining-predecessor-ddl-contracts-2026-08.json",
    "r3b1d_repair_closure": DATA / "ci-r3b1d-post-vendor-repair-closure-2026-08.json",
    "r3b1d_repair_topology": DATA / "ci-r3b1d-post-vendor-repair-topology-2026-08.json",
    "r3b1d1_repair_topology": DATA / "ci-r3b1d1-post-vendor-repair-topology-2026-08.json",
    "r3b1d1_repair_action_graph": DATA / "ci-r3b1d1-repair-action-graph-2026-08.json",
    "r3b1d11_topology_summary": DATA / "ci-r3b1d11-topology-validation-summary-2026-08.json",
    "r3b1d11_executable_ddl_proof": DATA / "ci-r3b1d11-executable-ddl-proof-2026-08.json",
    "r3b1d11_deferred_endpoint_proof": DATA / "ci-r3b1d11-deferred-endpoint-proof-2026-08.json",
    "r3b1b_sql_literal_compiler": REPO / "docs/audits/ci-recovery/tooling/ci_r3b1b_sql_literal_compiler.py",
    "r3b1d1_validate_topology": REPO / "docs/audits/ci-recovery/tooling/ci_r3b1d1_validate_topology.py",
    "r3b1d1_repair_action_graph": REPO / "docs/audits/ci-recovery/tooling/ci_r3b1d1_repair_action_graph.py",
}


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> int:
    hashes = {key: sha256_file(path) for key, path in AUTHORITY_FILES.items() if path.exists()}
    missing = [key for key, path in AUTHORITY_FILES.items() if not path.exists()]
    out = {
        "schema_version": 1,
        "phase": "CI-R3B1D.1.2",
        "repair_authority_semantics_changed": "NO",
        "catalog_proof_added": "YES",
        "primary_historical_defects": 18,
        "repair_slots": 10,
        "repair_slot_range": "7-16",
        "authority_hashes": hashes,
        "missing_authority_files": missing,
        "pass": len(missing) == 0,
    }
    OUT.write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps({"pass": out["pass"], "missing": missing}, indent=2))
    return 0 if out["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
