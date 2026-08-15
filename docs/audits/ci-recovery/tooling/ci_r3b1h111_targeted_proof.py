#!/usr/bin/env python3
"""Targeted proof dispatch using generic proof registry (CI-R3B1H.1.1)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1h111_constants import DATA, REPO
from ci_r3b1h111_proof_registry import dispatch_all_contracts, dispatch_contract_proof
from replay_evidence_lib import PgConfig

CONTRACTS = DATA / "ci-r3b1h111-exact-predecessor-contracts-2026-08.json"
OUT = DATA / "ci-r3b1h111-targeted-consumer-proof-2026-08.json"


def main() -> int:
    contracts_doc = json.loads(CONTRACTS.read_text())
    contracts = contracts_doc.get("contracts", [])
    cfg = PgConfig()
    analysis_db = sys.argv[1] if len(sys.argv) > 1 else "synqdrive_r3b1h111_pre249"
    proof_db = sys.argv[2] if len(sys.argv) > 2 else "synqdrive_r3b1h111_proof"

    analysis_proofs = dispatch_all_contracts(contracts, cfg, analysis_db)
    proof_proofs = []
    for idx, contract in enumerate(contracts):
        proof_proofs.append(dispatch_contract_proof(contract, cfg, f"{proof_db}_{idx}"))

    out = {
        "schema_version": 1,
        "phase": "CI-R3B1H.1.1",
        "contracts_source": str(CONTRACTS.relative_to(REPO)),
        "generic_contract_compiled": True,
        "generic_proof_dispatch": True,
        "analysis_proofs": analysis_proofs,
        "proof_proofs": proof_proofs,
        "gap_proofs": proof_proofs,
        "synthetic_fixture_pass": all(p.get("synthetic_fixture_pass", True) for p in proof_proofs),
        "unproven_gaps": sum(1 for p in proof_proofs if not p.get("pass")),
        "pass": all(p.get("pass") for p in analysis_proofs) and all(p.get("pass") for p in proof_proofs),
    }
    OUT.write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps({"pass": out["pass"], "proofs": len(proof_proofs), "unproven": out["unproven_gaps"]}, indent=2))
    return 0 if out["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
