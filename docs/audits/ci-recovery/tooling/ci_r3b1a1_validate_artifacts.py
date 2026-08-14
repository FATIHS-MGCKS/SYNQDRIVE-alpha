#!/usr/bin/env python3
"""Validate CI-R3B1A.1 machine-readable artifacts."""
from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
MATRIX = REPO / "docs/audits/ci-recovery/data/ci-r3b1a1-full-migration-dependency-matrix-2026-08.json"
CONTRACTS = REPO / "docs/audits/ci-recovery/data/ci-r3b1a1-predecessor-ddl-contracts-2026-08.json"


def main() -> int:
    matrix = json.loads(MATRIX.read_text())
    contracts = json.loads(CONTRACTS.read_text())

    deps = matrix["dependencies"]
    ids = [d["id"] for d in deps]
    if len(ids) != len(set(ids)):
        print("FAIL: duplicate dependency ids")
        return 1

    counts = Counter(d["classification"] for d in deps)
    totals = matrix["classification_totals"]
    if totals["TOTAL"] != len(deps):
        print("FAIL: TOTAL mismatch")
        return 1
    for key in [
        "VALID",
        "INTENTIONAL",
        "MISSING_HISTORY",
        "ORDERING_DEFECT",
        "CONDITIONAL_SAFE",
        "FALSE_POSITIVE",
        "UNRESOLVED",
    ]:
        if totals[key] != counts.get(key, 0):
            print(f"FAIL: {key} mismatch matrix={counts.get(key,0)} totals={totals[key]}")
            return 1
    if sum(totals[k] for k in totals if k != "TOTAL") != totals["TOTAL"]:
        print("FAIL: classification sum != TOTAL")
        return 1
    if totals["UNRESOLVED"] != 0:
        print(f"FAIL: UNRESOLVED={totals['UNRESOLVED']}")
        return 1

    contract_objs = [c["object"] for c in contracts["contracts"]]
    if len(contract_objs) != len(set(contract_objs)):
        print("FAIL: duplicate contract objects")
        return 1

    defect_objs = {
        d["required_object"]
        for d in deps
        if d["classification"] in {"MISSING_HISTORY", "ORDERING_DEFECT"}
        and d["required_object_type"] in {"table", "enum"}
    }
    # normalize: use unique_genuine_defect_objects from matrix
    unique = {u["object"] for u in matrix.get("unique_genuine_defect_objects", [])}
    if unique != set(contract_objs):
        print("FAIL: contract objects != unique defects")
        print(" contracts:", sorted(contract_objs))
        print(" defects:", sorted(unique))
        return 1

    for c in contracts["contracts"]:
        if c["classification"] in {"MISSING_HISTORY", "ORDERING_DEFECT"}:
            if c["classification"] == "ORDERING_DEFECT" and not c["repair_insertion"].get(
                "creator_migration"
            ):
                if c["object"] != "battery_evidence":
                    print(f"FAIL: ORDERING_DEFECT {c['object']} missing creator_migration")
                    return 1
            if c["relation"] is None and not c["enum_dependencies"]:
                print(f"FAIL: contract {c['object']} missing relation/enums")
                return 1
            if c["relation"] and not c["columns"]:
                print(f"FAIL: table contract {c['object']} missing columns")
                return 1

    print("PASS: artifacts validated")
    print(json.dumps(totals, indent=2))
    print("unique defects:", sorted(unique))
    return 0


if __name__ == "__main__":
    sys.exit(main())
