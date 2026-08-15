#!/usr/bin/env python3
"""Prove lexical insertion order for R3B1G tire status repair."""
from __future__ import annotations

import json

from ci_r3b1g_constants import DATA, R3B1G_REPAIR_MIGRATION, SLOT13_REPAIR, TIRE_CONSUMER
from replay_evidence_lib import migration_dirs

OUT = DATA / "ci-r3b1g-migration-order-proof-2026-08.json"


def main() -> int:
    dirs = migration_dirs()
    idx_prev = dirs.index(SLOT13_REPAIR)
    idx_new = dirs.index(R3B1G_REPAIR_MIGRATION)
    idx_next = dirs.index(TIRE_CONSUMER)
    lexical_after = idx_new > idx_prev
    lexical_before = idx_new < idx_next
    out = {
        "schema_version": 1,
        "phase": "CI-R3B1G",
        "previous_migration": SLOT13_REPAIR,
        "new_migration": R3B1G_REPAIR_MIGRATION,
        "next_migration": TIRE_CONSUMER,
        "authorized_after": SLOT13_REPAIR,
        "authorized_before": TIRE_CONSUMER,
        "lexical_after_valid": lexical_after,
        "lexical_before_valid": lexical_before,
        "ordinal_previous": idx_prev + 1,
        "ordinal_new": idx_new + 1,
        "ordinal_next": idx_next + 1,
        "pass": lexical_after and lexical_before,
    }
    OUT.write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps({"pass": out["pass"]}, indent=2))
    return 0 if out["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
