#!/usr/bin/env python3
"""Build CI-R3B1D.1.2 successor post-merge exposure artifact with corrected classification."""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
DATA = REPO / "docs/audits/ci-recovery/data"
PREDECESSOR = DATA / "ci-r3b1d11-post-merge-exposure-2026-08.json"
OUT = DATA / "ci-r3b1d12-post-merge-exposure-2026-08.json"
MERGE_SHA = "721ad893d15cfa46786a112860548ce12a2be71d"


def main() -> int:
    predecessor = json.loads(PREDECESSOR.read_text())
    latest_deployed_sha = predecessor.get("latest_deployed_sha")
    migration_ledger = predecessor.get("PRODUCTION_MIGRATION_LEDGER", "NOT_AVAILABLE")

    if latest_deployed_sha is None and migration_ledger == "NOT_AVAILABLE":
        classification = "E_UNKNOWN"
        confidence = "LOW"
        reason = (
            "Deployed commit SHA is unknown and production migration ledger is unavailable. "
            "Absence of deployment metadata alone is insufficient for E0. "
            "Classification corrected from predecessor E0 to E_UNKNOWN per strict exposure semantics."
        )
        evidence_sufficient = False
    elif latest_deployed_sha and migration_ledger == "NOT_AVAILABLE":
        classification = "E_UNKNOWN"
        confidence = "LOW"
        reason = "Deployed SHA known but migration ledger unavailable; cannot distinguish E1/E2 safely."
        evidence_sufficient = False
    else:
        classification = predecessor.get("exposure_classification", "E_UNKNOWN")
        confidence = "MEDIUM"
        reason = predecessor.get("exposure_rationale", "Inherited from predecessor with insufficient re-audit.")
        evidence_sufficient = classification in {"E0", "E1", "E2"}

    out = {
        "schema_version": 1,
        "phase": "CI-R3B1D.1.2",
        "supersedes": PREDECESSOR.name,
        "repository": predecessor.get("repository", "FATIHS-MGCKS/SYNQDRIVE-alpha"),
        "merged_pr": predecessor.get("merged_pr", 1031),
        "MAIN_HEAD": predecessor.get("MAIN_HEAD", MERGE_SHA),
        "merge_commit": predecessor.get("merge_commit", MERGE_SHA),
        "MERGE_721ad89_PRESENT_AS_ANCESTOR": predecessor.get("MERGE_721ad89_PRESENT_AS_ANCESTOR", "YES"),
        "previous_classification": predecessor.get("exposure_classification"),
        "exposure_classification": classification,
        "classification_confidence": confidence,
        "classification_reason": reason,
        "evidence_sufficient_for_classification": evidence_sufficient,
        "E3_detected": classification == "E3",
        "production_deployment_actions_permitted_now": False,
        "latest_deployed_sha": latest_deployed_sha,
        "contains_721ad89": predecessor.get("contains_721ad89", "UNKNOWN"),
        "merge_sha_deployed": predecessor.get("deployment_after_merge_detected", "NO"),
        "PRODUCTION_MIGRATION_LEDGER": migration_ledger,
        "recovery_migration_ledger_status": predecessor.get("recovery_migration_ledger_status", {}),
        "recovery_migrations_on_main": predecessor.get("recovery_migrations_on_main", []),
        "evidence_sources_checked": predecessor.get("evidence_sources", []),
        "predecessor_evidence_preserved": True,
        "production_mutation_performed": False,
    }
    OUT.write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps({"pass": classification != "E3", "classification": classification}, indent=2))
    return 0 if classification != "E3" else 1


if __name__ == "__main__":
    raise SystemExit(main())
