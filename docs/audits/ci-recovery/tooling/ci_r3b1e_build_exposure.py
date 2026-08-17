#!/usr/bin/env python3
"""Normalize CI-R3B1E exposure evidence successor from R3B1D.1.2."""
from __future__ import annotations

import json
from pathlib import Path

from ci_r3b1e_constants import DATA

PREDECESSOR = DATA / "ci-r3b1d12-post-merge-exposure-2026-08.json"
OUT = DATA / "ci-r3b1e-post-merge-exposure-2026-08.json"


def main() -> int:
    pred = json.loads(PREDECESSOR.read_text())
    out = dict(pred)
    out["schema_version"] = 1
    out["phase"] = "CI-R3B1E"
    out["supersedes"] = PREDECESSOR.name
    out["exposure_classification"] = "E_UNKNOWN"
    out["contains_721ad89"] = "UNKNOWN"
    out["merge_sha_deployed"] = "UNKNOWN"
    out["production_deployment_actions_permitted_now"] = False
    out["production_mutation_performed"] = False
    out["normalization_note"] = (
        "merge_sha_deployed corrected from NO to UNKNOWN because deployed SHA is unknown; "
        "cannot prove merge absent from production."
    )
    OUT.write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps({"classification": out["exposure_classification"], "pass": True}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
