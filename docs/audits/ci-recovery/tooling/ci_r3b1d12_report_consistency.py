#!/usr/bin/env python3
"""Validate CI-R3B1D.1.2 human report against machine final summary (structured fields only)."""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
DATA = REPO / "docs/audits/ci-recovery/data"
SUMMARY = DATA / "ci-r3b1d12-final-validation-summary-2026-08.json"
REPORT = REPO / "docs/audits/ci-recovery/ci-r3b1d12-catalog-exposure-evidence-closure-2026-08.md"


def extract_table_value(report: str, label: str) -> str | None:
    match = re.search(rf"\|\s*{re.escape(label)}\s*\|\s*([^|]+?)\s*\|", report)
    return match.group(1).strip() if match else None


def extract_int(report: str, label: str) -> int | None:
    val = extract_table_value(report, label)
    if val is None:
        return None
    m = re.search(r"(\d+)", val)
    return int(m.group(1)) if m else None


def extract_slot_rows(report: str) -> dict[int, dict[str, int | str]]:
    rows: dict[int, dict[str, int | str]] = {}
    for match in re.finditer(
        r"^\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(PASS|FAIL)\s*\|\s*(\d+)\s*\|",
        report,
        re.M,
    ):
        slot = int(match.group(1))
        rows[slot] = {
            "action_count": int(match.group(2)),
            "graph_edge_count": int(match.group(3)),
            "postgresql_execution": match.group(4),
            "catalog_mismatch_count": int(match.group(5)),
        }
    return rows


def run_check(summary: dict, report: str, negative: bool = False) -> tuple[list[str], int]:
    mismatches: list[str] = []
    machine = summary

    if negative:
        machine = json.loads(json.dumps(summary))
        if machine["per_slot"]:
            machine["per_slot"][0]["action_count"] += 1
        machine["exposure"]["classification"] = "E0"

    status_match = re.search(r"\*\*Status:\*\* `([^`]+)`", report)
    if not status_match or status_match.group(1) != machine["final_status"]:
        mismatches.append(f"final_status: machine={machine['final_status']} report={status_match.group(1) if status_match else None}")

    exposure_report = extract_table_value(report, "Corrected classification")
    exposure_clean = re.sub(r"\*+", "", exposure_report or "").strip()
    if exposure_clean != machine["exposure"]["classification"]:
        mismatches.append(
            f"exposure classification: machine={machine['exposure']['classification']} report={exposure_clean}"
        )

    cat = machine["catalog_parity"]["category_counters"]
    global_checks = [
        ("Tables", cat.get("table", 0)),
        ("Columns", cat.get("column", 0)),
        ("Types", cat.get("type", 0)),
        ("Nullability", cat.get("nullability", 0)),
        ("Defaults", cat.get("default", 0)),
        ("Enums", cat.get("enum", 0)),
        ("Sequences", cat.get("sequence", 0)),
        ("Primary keys", cat.get("primary_key", 0)),
        ("UNIQUE constraints", cat.get("unique", 0)),
        ("Foreign keys", cat.get("foreign_key", 0)),
        ("Indexes", cat.get("index", 0)),
        ("Duplicate creates", machine["global_topology"]["duplicate_creates"]),
        ("Graph cycles", machine["global_topology"]["graph_cycles"]),
        ("Invalid FK actions", machine["global_topology"]["invalid_fk_actions"]),
        ("Invalid FK target keys", machine["global_topology"]["invalid_fk_target_keys"]),
        ("Invalid UNIQUE actions", machine["global_topology"]["invalid_unique_actions"]),
        ("Invalid index actions", machine["global_topology"]["invalid_index_actions"]),
        ("Unresolved deferred endpoints", machine["global_topology"]["unresolved_deferred_endpoints"]),
        ("Existing migration SQL changed", machine["immutability"]["existing_migration_sql_changed"]),
    ]
    for label, expected in global_checks:
        reported = extract_int(report, label)
        if reported is None:
            mismatches.append(f"{label}: missing in report")
        elif reported != expected:
            mismatches.append(f"{label}: machine={expected} report={reported}")

    total_report = extract_int(report, "**Total**")
    if total_report != cat.get("total", 0):
        mismatches.append(f"total catalog mismatches: machine={cat.get('total', 0)} report={total_report}")

    slot_rows = extract_slot_rows(report)
    for row in machine["per_slot"]:
        slot = row["slot"]
        reported = slot_rows.get(slot)
        if not reported:
            mismatches.append(f"slot {slot}: missing per-slot row in report")
            continue
        for key in ("action_count", "graph_edge_count", "catalog_mismatch_count"):
            if reported[key] != row[key]:
                mismatches.append(f"slot {slot} {key}: machine={row[key]} report={reported[key]}")
        if reported["postgresql_execution"] != row["postgresql_execution"]:
            mismatches.append(
                f"slot {slot} postgresql_execution: machine={row['postgresql_execution']} report={reported['postgresql_execution']}"
            )

    return mismatches, len(mismatches)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--negative-test", action="store_true")
    args = parser.parse_args()

    if not SUMMARY.exists() or not REPORT.exists():
        print("FAIL: summary or report missing")
        return 1

    summary = json.loads(SUMMARY.read_text())
    report = REPORT.read_text()
    mismatches, count = run_check(summary, report, negative=args.negative_test)

    if args.negative_test:
        if count == 0:
            print("FAIL: negative test expected mismatches but found none")
            return 1
        print(f"PASS: negative test detected {count} intentional mismatches")
        return 0

    out = {"mismatch_count": count, "mismatches": mismatches, "pass": count == 0}
    print(json.dumps(out, indent=2))
    return 0 if out["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
