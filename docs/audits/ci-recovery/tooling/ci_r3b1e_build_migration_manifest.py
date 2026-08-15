#!/usr/bin/env python3
"""Build CI-R3B1E post-vendor repair migration manifest."""
from __future__ import annotations

import json
import re
from pathlib import Path

from ci_r3b1e_constants import DATA, MIG_ROOT, REPO, SLOT_MIGRATIONS, TOPOLOGY
from replay_evidence_lib import sha256_file

OUT = DATA / "ci-r3b1e-post-vendor-repair-migration-manifest-2026-08.json"
TARGETED = DATA / "ci-r3b1e-targeted-migration-proof-2026-08.json"
FULL = DATA / "ci-r3b1e-full-fresh-replay-result-2026-08.json"


def count_statements(sql: str) -> int:
    return len([c for c in re.split(r";\s*(?:\n|$)", sql) if c.strip() and not c.strip().startswith("--")])


def main() -> int:
    topology = json.loads(TOPOLOGY.read_text())
    targeted = json.loads(TARGETED.read_text()) if TARGETED.exists() else {}
    full = json.loads(FULL.read_text()) if FULL.exists() else {}
    slot_runtime = {r["slot"]: r for r in full.get("post_vendor_slot_runtime", [])}
    targeted_slots = {r["slot"]: r for r in targeted.get("per_slot", [])}
    records = []
    for slot in topology["slots"]:
        if slot["slot"] < 7 or slot["slot"] > 16:
            continue
        mig = SLOT_MIGRATIONS[slot["slot"]]
        path = MIG_ROOT / mig / "migration.sql"
        sql = path.read_text()
        records.append(
            {
                "slot": slot["slot"],
                "migration_path": str(path.relative_to(REPO)),
                "after_migration": slot["after_migration"],
                "before_migration": slot["before_migration"],
                "sha256": sha256_file(path),
                "statement_count": count_statements(sql),
                "objects_created": slot.get("objects_types_sequences_created", []),
                "first_consumer_protected": slot["first_consumers_protected"][0],
                "targeted_execution_status": targeted_slots.get(slot["slot"], {}).get("execution", "UNKNOWN"),
                "full_replay_status": slot_runtime.get(slot["slot"], {}).get("repair_migration_status", "UNKNOWN"),
            }
        )
    out = {"schema_version": 1, "phase": "CI-R3B1E", "records": records, "count": len(records)}
    OUT.write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps({"count": len(records)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
