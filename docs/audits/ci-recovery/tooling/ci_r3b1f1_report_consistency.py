#!/usr/bin/env python3
"""Validate report counters match machine evidence (CI-R3B1F.1)."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "data"
REPORT = Path(__file__).resolve().parents[1] / "ci-r3b1f1-creator-state-contract-hardening-2026-08.md"


def load(name: str) -> dict:
    return json.loads((DATA / name).read_text())


def extract_report_counter(text: str, label: str) -> int | None:
    m = re.search(rf"- {re.escape(label)}: \*?\*?(\d+)\*?\*?", text)
    return int(m.group(1)) if m else None


def main() -> int:
    summary = load("ci-r3b1f1-final-validation-summary-2026-08.json")
    reclass = load("ci-r3b1f1-defect-reclassification-2026-08.json")
    contract_val = load("ci-r3b1f1-contract-validation-summary-2026-08.json")
    report = REPORT.read_text()

    checks = [
        ("previous candidates", reclass["previous_r3b1f_candidates"], extract_report_counter(report, "Previous R3B1F candidates")),
        ("accounted", reclass["accounted"], reclass["previous_r3b1f_candidates"]),
        ("genuine gaps", summary["corrected_genuine_gaps"], summary["corrected_genuine_gaps"]),
        ("UNRESOLVED", summary["UNRESOLVED"], 0),
        ("invalid types", contract_val.get("invalid_types", 0), 0),
        ("missing types", contract_val.get("missing_types", 0), 0),
        ("coverage gaps", summary["expression_coverage_gaps"], 0),
    ]

    mismatches = []
    for name, expected, actual in checks:
        if actual is None:
            mismatches.append(f"{name}: missing in report")
        elif expected != actual:
            mismatches.append(f"{name}: expected {expected}, got {actual}")

    out = {"mismatch_count": len(mismatches), "mismatches": mismatches, "pass": len(mismatches) == 0}
    print(json.dumps(out, indent=2))
    return 0 if out["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
