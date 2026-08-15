#!/usr/bin/env python3
"""Validate report/machine summary consistency (CI-R3B1H)."""
from __future__ import annotations

import json
import re
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "data"
SUMMARY = DATA / "ci-r3b1h-final-validation-summary-2026-08.json"
REPORT = Path(__file__).resolve().parents[1] / "ci-r3b1h-iam-insert-select-predecessor-closure-2026-08.md"
OUT = DATA / "ci-r3b1h-report-consistency-2026-08.json"


def main() -> int:
    s = json.loads(SUMMARY.read_text())
    report = REPORT.read_text()
    mt = s["sweep_249_to_head"]["classification_totals"]
    mismatches = []

    checks = [
        ("migrations_scanned", str(s["sweep_249_to_head"]["migrations_scanned"]), r"Migrations scanned: (\d+)"),
        ("UNRESOLVED", str(mt.get("UNRESOLVED", 0)), r"UNRESOLVED \| (\d+)"),
        ("unique_actionable_gaps", str(s["exact_repair_authority"]["unique_actionable_gaps"]), r"Unique actionable gaps: (\d+)"),
        ("exact_contracts", str(s["exact_repair_authority"]["exact_contracts"]), r"Exact contracts: (\d+)"),
        ("coverage_gaps", str(s["coverage"].get("coverage_gaps", 0)), r"Coverage gaps: (\d+)"),
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
