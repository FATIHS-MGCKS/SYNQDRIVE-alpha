#!/usr/bin/env python3
"""Validate human report structured values against machine evidence."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
DATA = REPO / "docs/audits/ci-recovery/data"
REPORT = REPO / "docs/audits/ci-recovery/ci-r3b1d11-executable-ddl-validator-closure-2026-08.md"
SUMMARY = DATA / "ci-r3b1d11-topology-validation-summary-2026-08.json"
DDL_PROOF = DATA / "ci-r3b1d11-executable-ddl-proof-2026-08.json"
DEFERRED = DATA / "ci-r3b1d11-deferred-endpoint-proof-2026-08.json"


def extract_report_int(report: str, label: str) -> int | None:
    match = re.search(rf"{re.escape(label)}\s*\|\s*(\d+)", report)
    return int(match.group(1)) if match else None


def main() -> int:
    if not REPORT.exists():
        print("FAIL: report missing")
        return 1
    summary = json.loads(SUMMARY.read_text())
    ddl = json.loads(DDL_PROOF.read_text())
    deferred = json.loads(DEFERRED.read_text())
    report = REPORT.read_text()

    checks = [
        ("slots validated", summary["slots_validated"], extract_report_int(report, "Slots validated")),
        ("duplicate creates", summary["duplicate_creates"], extract_report_int(report, "Duplicate creates")),
        ("graph cycles", summary["graph_cycles"], extract_report_int(report, "Graph cycles")),
        ("invalid FK actions", summary["invalid_fk_actions"], extract_report_int(report, "Invalid FK actions")),
        ("invalid FK target keys", summary.get("invalid_fk_target_keys", 0), extract_report_int(report, "Invalid FK target keys")),
        ("invalid UNIQUE actions", summary.get("invalid_unique_actions", 0), extract_report_int(report, "Invalid UNIQUE actions")),
        ("invalid index actions", summary["invalid_index_actions"], extract_report_int(report, "Invalid index actions")),
        ("unresolved deferred", summary["unresolved_deferred_endpoints"], extract_report_int(report, "Unresolved deferred endpoints")),
        ("postgresql failures", ddl["execution_failures"], extract_report_int(report, "PostgreSQL execution failures")),
        ("catalog mismatches", ddl["catalog_mismatches"], extract_report_int(report, "Catalog mismatches")),
        ("deferred resolved", deferred["resolved"], extract_report_int(report, "Deferred endpoints resolved")),
    ]

    mismatches = []
    for name, machine, reported in checks:
        if reported is None:
            mismatches.append(f"{name}: missing in report")
        elif machine != reported:
            mismatches.append(f"{name}: machine={machine} report={reported}")

    out = {"mismatch_count": len(mismatches), "mismatches": mismatches, "pass": len(mismatches) == 0}
    print(json.dumps(out, indent=2))
    return 0 if out["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
