#!/usr/bin/env python3
"""Replay disposable PostgreSQL through pre-249 boundary (CI-R3B1H.1)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1g_replay_lib import replay_until_exclusive
from ci_r3b1h1_constants import DATA, LAST_APPLIED_PRE249, PRE249_BOUNDARY
from replay_evidence_lib import PgConfig

OUT = DATA / "ci-r3b1h1-pre249-replay-state-2026-08.json"


def main() -> int:
    db = sys.argv[1] if len(sys.argv) > 1 else "synqdrive_r3b1h1_pre249"
    cfg = PgConfig()
    result = replay_until_exclusive(cfg, db, PRE249_BOUNDARY)
    out = {
        "schema_version": 1,
        "phase": "CI-R3B1H.1",
        "database_identifier": db,
        "stop_before": PRE249_BOUNDARY,
        "expected_last_applied": LAST_APPLIED_PRE249,
        "last_applied_migration": result.get("last_applied"),
        "pass": result.get("pass") and result.get("last_applied") == LAST_APPLIED_PRE249,
        "error": result.get("error"),
    }
    OUT.write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps({"pass": out["pass"], "last_applied": out["last_applied_migration"]}, indent=2))
    return 0 if out["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
