#!/usr/bin/env python3
"""Report/machine consistency validation (CI-R3B1H.1.1)."""
from __future__ import annotations

import json
import re
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "data"
SUMMARY = DATA / "ci-r3b1h111-final-validation-summary-2026-08.json"
REPORT = Path(__file__).resolve().parents[1] / "ci-r3b1h111-evidence-generic-contract-gate-closure-2026-08.md"
OUT = DATA / "ci-r3b1h111-report-consistency-2026-08.json"


def main() -> int:
    s = json.loads(SUMMARY.read_text())
    report = REPORT.read_text()
    mt = s.get("classification_totals", {})
    mismatches = []
    checks = [
        ("UNRESOLVED", str(mt.get("UNRESOLVED", 0)), r"UNRESOLVED \| (\d+)"),
        ("MISSING_HISTORY", str(mt.get("MISSING_HISTORY", 0)), r"MISSING_HISTORY \| (\d+)"),
        ("migration249_mismatches", str(s["migration249_reconciliation"]["mismatches"]), r"Mismatches: \*\*(\d+)\*\*"),
        ("uncontracted_gaps", str(s.get("uncontracted_gaps", 0)), r"Uncontracted gaps \| (\d+)"),
        ("physical_alias_leakage", str(s.get("physical_alias_leakage", 0)), r"Physical alias leakage \| (\d+)"),
    ]
    for name, expected, pattern in checks:
        m = re.search(pattern, report)
        if not m or m.group(1) != expected:
            mismatches.append({"field": name, "expected": expected, "report": m.group(1) if m else None})
    out = {"pass": len(mismatches) == 0, "mismatch_count": len(mismatches), "mismatches": mismatches}
    OUT.write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps(out, indent=2))
    return 0 if out["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
