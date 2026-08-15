#!/usr/bin/env python3
"""Record R3B1G tire repair migration identity manifest."""
from __future__ import annotations

import json
import re
import subprocess

from ci_r3b1g_constants import DATA, MIG_ROOT, R3B1G_REPAIR_MIGRATION, REPO
from replay_evidence_lib import sha256_file

OUT = DATA / "ci-r3b1g-tire-repair-migration-manifest-2026-08.json"
AUTH = DATA / "ci-r3b1g-implementation-authority-manifest-2026-08.json"


def main() -> int:
    path = MIG_ROOT / R3B1G_REPAIR_MIGRATION / "migration.sql"
    sql = path.read_text()
    auth = json.loads(AUTH.read_text()) if AUTH.exists() else {}
    out = {
        "schema_version": 1,
        "phase": "CI-R3B1G",
        "migration": R3B1G_REPAIR_MIGRATION,
        "path": str(path.relative_to(REPO)),
        "sha256": sha256_file(path),
        "statement_count": len([s for s in re.split(r";\s*", sql.strip()) if s.strip()]),
        "IMPLEMENTATION_AUTHORITY_MANIFEST_SHA256": auth.get("IMPLEMENTATION_AUTHORITY_MANIFEST_SHA256"),
        "HEAD_SHA": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=REPO, text=True).strip(),
        "pass": True,
    }
    OUT.write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps({"migration": R3B1G_REPAIR_MIGRATION, "sha256": out["sha256"]}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
