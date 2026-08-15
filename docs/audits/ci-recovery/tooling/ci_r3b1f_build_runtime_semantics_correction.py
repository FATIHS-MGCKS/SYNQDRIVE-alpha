#!/usr/bin/env python3
"""Build CI-R3B1F successor correction for R3B1E runtime semantics."""
from __future__ import annotations

import json
from pathlib import Path

from ci_r3b1f_constants import (
    BASE_R3B1E_SHA,
    DATA,
    PRE_R3B1F_SHA,
    R3B1F_BRANCH,
    SLOT13_CONSUMER,
    SLOT13_REPAIR,
)

OUT = DATA / "ci-r3b1f-r3b1e-runtime-semantics-correction-2026-08.json"
R3B1E_RESULT = DATA / "ci-r3b1e-full-fresh-replay-result-2026-08.json"


def main() -> int:
    r3b1e = json.loads(R3B1E_RESULT.read_text())
    out = {
        "schema_version": 1,
        "phase": "CI-R3B1F",
        "supersedes_semantics_in": "ci-r3b1e-full-fresh-replay-result-2026-08.json",
        "does_not_overwrite_original_evidence": True,
        "PRE_R3B1F_SHA": PRE_R3B1F_SHA,
        "BASE_R3B1E_SHA": BASE_R3B1E_SHA,
        "R3B1F_BRANCH": R3B1F_BRANCH,
        "original_r3b1e_final_status": r3b1e.get("final_status"),
        "original_failure_classification": r3b1e.get("failure_classification"),
        "corrected_failure_classification": "AUTHORITY_GAP_AT_PROTECTED_CONSUMER",
        "classification_rationale": (
            "Slot 13 repair migration applied successfully and created TireSetupStatus, "
            "but the first protected consumer tire_lifecycle_invariants failed because "
            "vehicle_tire_setups.status column was missing from predecessor authority. "
            "This is accepted repair authority incomplete, not incorrect Slot 13 repair SQL."
        ),
        "first_failed_migration": r3b1e.get("first_failed_migration"),
        "failure_ordinal": r3b1e.get("failure_ordinal"),
        "sqlstate": r3b1e.get("sqlstate"),
        "error_message": r3b1e.get("error_message"),
        "last_applied_migration": r3b1e.get("last_applied_migration"),
        "slot_13_repair_migration": SLOT13_REPAIR,
        "slot_13_repair_status": "PASS",
        "slot_13_first_protected_consumer": SLOT13_CONSUMER,
        "slot_13_consumer_status": "FAIL",
        "slots_14_16_status": "NOT_REACHED",
        "post_vendor_slot_runtime_correction": [
            {
                "slot": 13,
                "migration": SLOT13_REPAIR,
                "repair_migration_status": "PASS",
                "first_consumer": SLOT13_CONSUMER,
                "consumer_status": "FAIL",
                "failure_classification": "AUTHORITY_GAP_AT_PROTECTED_CONSUMER",
                "notes": "Consumer reached and failed; do not classify as NOT_REACHED.",
            },
            {
                "slot": 14,
                "repair_migration_status": "NOT_REACHED",
                "consumer_status": "NOT_REACHED",
            },
            {
                "slot": 15,
                "repair_migration_status": "NOT_REACHED",
                "consumer_status": "NOT_REACHED",
            },
            {
                "slot": 16,
                "repair_migration_status": "NOT_REACHED",
                "consumer_status": "NOT_REACHED",
            },
        ],
    }
    OUT.write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps({"path": str(OUT.relative_to(OUT.parents[2])), "pass": True}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
