#!/usr/bin/env python3
"""Proof tests for R3B1P preflight diff gate semantics."""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1n2_constants import DATA
from ci_r3b1o1_constants import FROZEN_DIFF_SQL
from ci_r3b1p_diff_attribution import classify_preflight_production_diff

PREFIX = "ci-r3b1p-preflight-diff-proof"
OUT = DATA / f"{PREFIX}-2026-08.json"


def main() -> int:
    production_script = (DATA / "ci-r3b1p-production-prisma-diff-2026-08.sql").read_text()
    golden_twin = (DATA / "ci-r3b1o4-ambiguity-corrective-golden-prisma-diff-2026-08.sql").read_text()
    golden_baseline = FROZEN_DIFF_SQL.read_text()
    schema_dump = Path(__file__).resolve().parents[1] / ".work/r3b1p/production_schema_only.sql"

    result = classify_preflight_production_diff(
        production_script,
        golden_twin_script=golden_twin,
        golden_baseline_script=golden_baseline,
        schema_dump=schema_dump if schema_dump.exists() else None,
    )

    checks = {
        "gate_r3b_scope_zero": result["R3B_SCOPE"] == 0,
        "gate_m252_scope_zero": result["M252_SCOPE"] == 0,
        "gate_unknown_scope_zero": result["UNKNOWN_SCOPE"] == 0,
        "gate_new_strategy_drift_zero": result["NEW_STRATEGY_DRIFT"] == 0,
        "gate_unattributed_zero": result["UNATTRIBUTED"] == 0,
        "m252_total_matches_authorized": result["M252_SCOPE_TOTAL"] == result["M252_SCOPE_AUTHORIZED"],
        "r3b_total_matches_authorized": result["R3B_SCOPE_TOTAL"] == result["R3B_SCOPE_AUTHORIZED"],
        "pass_flag_true": result["pass"],
    }

    payload = {
        "schema_version": 1,
        "phase": "CI-R3B1P",
        "checks": checks,
        "metrics": {
            "total_operations": result["total_operations"],
            "R3B_SCOPE": result["R3B_SCOPE"],
            "M252_SCOPE": result["M252_SCOPE"],
            "R3B_SCOPE_TOTAL": result["R3B_SCOPE_TOTAL"],
            "M252_SCOPE_TOTAL": result["M252_SCOPE_TOTAL"],
            "R3B_SCOPE_AUTHORIZED": result["R3B_SCOPE_AUTHORIZED"],
            "M252_SCOPE_AUTHORIZED": result["M252_SCOPE_AUTHORIZED"],
        },
        "pass": all(checks.values()),
    }
    OUT.write_text(json.dumps(payload, indent=2) + "\n")
    print(json.dumps(payload, indent=2))
    return 0 if payload["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
