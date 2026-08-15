#!/usr/bin/env python3
"""Build pre-existing migration SHA manifest before R3B1I repair."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from ci_r3b1i_constants import DATA, MIG_ROOT, REPO, evidence_input_sha
from replay_evidence_lib import migration_dirs

OUT = DATA / "ci-r3b1i-preexisting-migration-sha-manifest-2026-08.json"

HIGH_RISK = [
    "20260716182730_ci_r3b_tire_setup_status_predecessor",
    "20260716183000_tire_lifecycle_invariants",
    "20260721250000_iam_versioned_role_assignments",
    "20260413230000_add_composite_indexes_batch_c",
    "20260412025000_ci_r3b_historical_predecessor_slot1",
    "20260412610000_ci_r3b_historical_predecessor_slot2",
    "20260413201500_ci_r3b_historical_predecessor_slot3",
    "20260413225000_ci_r3b_historical_predecessor_slot4",
    "20260417170000_ci_r3b_historical_predecessor_slot5",
    "20260421180000_ci_r3b_historical_predecessor_slot6",
    "20260613203000_ci_r3b_post_vendor_predecessor_slot07",
    "20260616130000_ci_r3b_post_vendor_predecessor_slot08",
    "20260617120000_r3b_post_vendor_predecessor_slot09",
    "20260617203000_ci_r3b_post_vendor_predecessor_slot10",
    "20260620183000_ci_r3b_post_vendor_predecessor_slot11",
    "20260716180000_r3b_post_vendor_predecessor_slot12",
    "20260716182500_ci_r3b_post_vendor_predecessor_slot13",
    "20260716200000_r3b_post_vendor_predecessor_slot14",
    "20260723245000_ci_r3b_post_vendor_predecessor_slot15",
    "20260724210000_ci_r3b_post_vendor_predecessor_slot16",
]


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> int:
    entries = {}
    for mig in migration_dirs():
        path = MIG_ROOT / mig / "migration.sql"
        entries[mig] = sha256_file(path)
    out = {
        "schema_version": 1,
        "phase": "CI-R3B1I",
        "evidence_input_sha": evidence_input_sha(),
        "migration_count": len(entries),
        "entries": entries,
        "high_risk_entries": {mig: entries[mig] for mig in HIGH_RISK if mig in entries},
    }
    OUT.write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps({"migration_count": out["migration_count"]}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
