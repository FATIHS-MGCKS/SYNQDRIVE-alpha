#!/usr/bin/env python3
"""Semantic validator for CI-R3B1A.2 migration dependency artifacts."""
from __future__ import annotations

import json
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from prisma_schema_authority import extract_model_contract, parse_schema  # noqa: E402

MATRIX = REPO / "docs/audits/ci-recovery/data/ci-r3b1a2-full-migration-dependency-matrix-2026-08.json"
CONTRACTS = REPO / "docs/audits/ci-recovery/data/ci-r3b1a2-predecessor-ddl-contracts-2026-08.json"

PRISMA_TYPE_RE = re.compile(
    r"^(String|Int|BigInt|Boolean|Float|Decimal|DateTime|Json|Bytes)(\?)?$"
)
TRUNC_DEFAULT_RE = re.compile(r"^(uuid|now|autoincrement|cuid)\($")
NAV_FIELDS_BY_MODEL = {
    "OrgTask": {"fine", "invoice"},
    "BatteryEvidence": {"vehicle", "documentExtraction", "serviceEvent"},
    "VehicleDtcEvent": {"vehicle"},
}


def git_show(rev: str, path: str) -> str:
    return subprocess.check_output(["git", "-C", str(REPO), "show", f"{rev}:{path}"], text=True)


def fail(msg: str) -> int:
    print(f"FAIL: {msg}")
    return 1


def validate_matrix_shape(matrix: dict) -> int:
    deps = matrix["dependencies"]
    ids = [d["id"] for d in deps]
    if len(ids) != len(set(ids)):
        return fail("duplicate dependency ids")
    counts = Counter(d["classification"] for d in deps)
    totals = matrix["classification_totals"]
    if totals["TOTAL"] != len(deps):
        return fail("TOTAL mismatch")
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
            return fail(f"{key} mismatch matrix={counts.get(key,0)} totals={totals[key]}")
    if sum(totals[k] for k in totals if k != "TOTAL") != totals["TOTAL"]:
        return fail("classification sum != TOTAL")
    if totals["UNRESOLVED"] != 0:
        return fail(f"UNRESOLVED={totals['UNRESOLVED']}")
    for dep in deps:
        if "statement_order" not in dep:
            return fail(f"missing statement_order on {dep['id']}")
    return 0


def validate_contracts_vs_matrix(matrix: dict, contracts: dict) -> int:
    unique = {u["object"] for u in matrix.get("unique_genuine_defect_objects", [])}
    contract_objs = {c["object"] for c in contracts["contracts"]}
    if unique != contract_objs:
        return fail(f"contract objects != unique defects: {sorted(contract_objs)} vs {sorted(unique)}")
    return 0


def validate_semantics(contracts: dict) -> int:
    errors: list[str] = []
    for c in contracts["contracts"]:
        model = c.get("historical_prisma_model")
        if model and model in NAV_FIELDS_BY_MODEL:
            col_names = {col["column"] for col in c.get("columns", [])}
            prisma_names = {col.get("prisma_field") for col in c.get("columns", [])}
            for nav in NAV_FIELDS_BY_MODEL[model]:
                if nav in col_names or nav in prisma_names:
                    errors.append(f"{c['object']}: navigation field {nav} emitted as column")

        for col in c.get("columns", []):
            pg = col.get("postgres_type", "")
            if PRISMA_TYPE_RE.match(pg) or pg.endswith("?"):
                errors.append(f"{c['object']}.{col.get('column')}: prisma postgres_type {pg}")
            pd = col.get("prisma_default")
            if pd and TRUNC_DEFAULT_RE.match(str(pd)):
                errors.append(f"{c['object']}.{col.get('column')}: truncated default {pd}")

        cols = [col["column"] for col in c.get("columns", [])]
        if len(cols) != len(set(cols)):
            errors.append(f"{c['object']}: duplicate mapped columns")

        if model:
            commit = c["historical_authority_commit"]
            schema = git_show(commit, "backend/prisma/schema.prisma")
            expected = extract_model_contract(schema, model)
            if c["object"] == "org_tasks":
                for fk in expected["foreign_keys"]:
                    match = [
                        x
                        for x in c.get("foreign_keys", [])
                        if x["local_columns"] == fk["local_columns"]
                        and x["referenced_relation"] == fk["referenced_relation"]
                    ]
                    if not match:
                        errors.append(f"org_tasks missing FK {fk['local_columns']} -> {fk['referenced_relation']}")
            if c["object"] == "org_invoices":
                inv_unique = [
                    u for u in c.get("unique_constraints", []) if "invoice_number" in u.get("columns", [])
                ]
                if not inv_unique:
                    errors.append("org_invoices missing invoice_number unique authority")

        for col in c.get("columns", []):
            pg = col.get("postgres_type", "")
            if pg.startswith('"') and pg.endswith('"'):
                enum_name = pg.strip('"')
                enum_contract = next(
                    (
                        e
                        for e in c.get("enum_dependencies", [])
                        if e.get("name") == enum_name
                    ),
                    None,
                )
                if enum_contract is None and enum_name not in {"public"}:
                    errors.append(f"{c['object']}.{col.get('column')}: unknown named type {enum_name}")

    if errors:
        for e in errors:
            print(f"FAIL: {e}")
        return 1
    return 0


def main() -> int:
    matrix = json.loads(MATRIX.read_text())
    contracts = json.loads(CONTRACTS.read_text())
    for fn in (validate_matrix_shape,):
        rc = fn(matrix)
        if rc:
            return rc
    rc = validate_contracts_vs_matrix(matrix, contracts)
    if rc:
        return rc
    rc = validate_semantics(contracts)
    if rc:
        return rc
    print("PASS: CI-R3B1A.2 artifacts validated")
    print(json.dumps(matrix["classification_totals"], indent=2))
    print("unique defects:", sorted(u["object"] for u in matrix["unique_genuine_defect_objects"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
