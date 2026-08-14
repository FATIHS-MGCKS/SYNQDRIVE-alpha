#!/usr/bin/env python3
"""CI-R3B1B migration SQL immutability manifest and order proof."""
from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
MIG_ROOT = REPO / "backend/prisma/migrations"
TARGET = MIG_ROOT / "20260425000000_retire_user_assignment_and_speeding_severity/migration.sql"
TARGET_SHA = "1c18164be77dead4db2ff500123754e8c924c9094bc09c41f2408dbcd56a4974"
PRE_SHA = "6df19ad57b742da51adccd6e8e614bca293c5ec1"
NEW_MIGRATIONS = [
    "20260412025000_ci_r3b_historical_predecessor_slot1",
    "20260412610000_ci_r3b_historical_predecessor_slot2",
    "20260413201500_ci_r3b_historical_predecessor_slot3",
    "20260413225000_ci_r3b_historical_predecessor_slot4",
    "20260417170000_ci_r3b_historical_predecessor_slot5",
    "20260421180000_ci_r3b_historical_predecessor_slot6",
]
SLOT_BOUNDARIES = {
    1: ("20260412020000_hm_latest_state_tables", "20260412030000_platform_hardening_phase1"),
    2: ("20260412040000_audit_consent_provenance", "20260413183000_brake_health_canonical_refactor"),
    3: ("20260413183000_brake_health_canonical_refactor", "20260413220000_battery_evidence_unique_dedup"),
    4: ("20260413220000_battery_evidence_unique_dedup", "20260413230000_add_composite_indexes_batch_c"),
    5: ("20260417160000_add_mqtt_only_hm_sync_status", "20260417180000_add_battery_critical_insight_type"),
    6: ("20260421120000_add_pickup_overdue_insight_type", "20260422010000_vehicle_current_safety_score"),
}


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def manifest_from_git(rev: str) -> dict[str, str]:
    out: dict[str, str] = {}
    paths = subprocess.check_output(
        ["git", "ls-tree", "-r", "--name-only", rev, "backend/prisma/migrations"],
        cwd=REPO,
        text=True,
    ).splitlines()
    for rel in paths:
        if not rel.endswith("/migration.sql"):
            continue
        blob = subprocess.check_output(["git", "show", f"{rev}:{rel}"], cwd=REPO)
        out[rel] = hashlib.sha256(blob).hexdigest()
    return out


def manifest_from_worktree() -> dict[str, str]:
    out: dict[str, str] = {}
    for path in sorted(MIG_ROOT.glob("*/migration.sql")):
        rel = str(path.relative_to(REPO))
        out[rel] = sha256_file(path)
    return out


def migration_dirs() -> list[str]:
    return sorted(p.name for p in MIG_ROOT.iterdir() if p.is_dir() and not p.name.startswith("."))


def order_proof() -> list[dict]:
    dirs = migration_dirs()
    rows = []
    for slot, (after, before) in SLOT_BOUNDARIES.items():
        mig = NEW_MIGRATIONS[slot - 1]
        idx = dirs.index(mig)
        prev_mig = dirs[idx - 1] if idx > 0 else None
        next_mig = dirs[idx + 1] if idx + 1 < len(dirs) else None
        rows.append(
            {
                "slot": slot,
                "new_migration": mig,
                "previous_migration": prev_mig,
                "next_migration": next_mig,
                "expected_after_boundary": after,
                "expected_before_boundary": before,
                "order_valid": prev_mig == after and next_mig == before,
            }
        )
    return rows


def main() -> int:
    mode = sys.argv[1] if len(sys.argv) > 1 else "compare"
    pre = manifest_from_git(PRE_SHA)
    post = manifest_from_worktree()
    if mode == "pre":
        out = REPO / "docs/audits/ci-recovery/data/ci-r3b1b-pre-migration-manifest-2026-08.json"
        out.write_text(json.dumps({"baseline_sha": PRE_SHA, "files": pre}, indent=2) + "\n")
        print(f"Wrote {out} ({len(pre)} files)")
        return 0

    mismatches = []
    for rel, pre_hash in pre.items():
        if rel not in post:
            mismatches.append({"path": rel, "issue": "deleted"})
            continue
        if post[rel] != pre_hash:
            mismatches.append({"path": rel, "issue": "modified", "pre": pre_hash, "post": post[rel]})

    new_paths = sorted(set(post) - set(pre))
    unexpected_new = [p for p in new_paths if not any(p.startswith(f"backend/prisma/migrations/{m}/") for m in NEW_MIGRATIONS)]

    target_current = sha256_file(TARGET)
    result = {
        "pre_sha": PRE_SHA,
        "post_worktree": "current",
        "existing_modified": [m for m in mismatches if m["issue"] == "modified"],
        "existing_deleted": [m for m in mismatches if m["issue"] == "deleted"],
        "new_migration_paths": [p for p in new_paths if p.startswith("backend/prisma/migrations/")],
        "unexpected_new_paths": unexpected_new,
        "target_sha_expected": TARGET_SHA,
        "target_sha_current": target_current,
        "target_sha_match": target_current == TARGET_SHA,
        "migration_order_proof": order_proof(),
        "migration_directory_count": len(migration_dirs()),
    }
    out = REPO / "docs/audits/ci-recovery/data/ci-r3b1b-post-migration-manifest-2026-08.json"
    out.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))
    if mismatches or unexpected_new or target_current != TARGET_SHA:
        return 1
    if not all(r["order_valid"] for r in result["migration_order_proof"]):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
