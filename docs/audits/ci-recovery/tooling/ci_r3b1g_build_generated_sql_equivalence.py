#!/usr/bin/env python3
"""Verify contract-compiled SQL equivalence to new migration file."""
from __future__ import annotations

import json
import re
import subprocess

from ci_r3b1f111_contract_compiler import (
    compile_add_column_contract,
    parse_compiled_add_column_semantics,
    semantic_equivalence,
    sha256_text,
)
from ci_r3b1g_constants import CONTRACTS_PATH, DATA, MIG_ROOT, R3B1G_REPAIR_MIGRATION, REPO

OUT = DATA / "ci-r3b1g-generated-sql-equivalence-2026-08.json"


def static_safety(sql: str) -> dict:
    upper = sql.upper()
    forbidden_ops = []
    for token in ("DROP ", "DELETE ", "TRUNCATE ", " CASCADE", "UPDATE ", "INSERT "):
        if token in upper:
            forbidden_ops.append(token.strip())
    add_count = len(re.findall(r"\bADD\s+COLUMN\b", upper))
    return {
        "forbidden_operations": forbidden_ops,
        "add_column_count": add_count,
        "pass": not forbidden_ops and add_count == 1,
    }


def extract_alter_statement(sql: str) -> str:
    for line in sql.splitlines():
        stripped = line.strip()
        if stripped.upper().startswith("ALTER TABLE"):
            return stripped if stripped.endswith(";") else stripped + ";"
    raise ValueError("no ALTER TABLE statement found")


def main() -> int:
    contracts_doc = json.loads(CONTRACTS_PATH.read_text())
    contract = contracts_doc["contracts"][0]
    compiled = compile_add_column_contract(contract)
    mig_path = MIG_ROOT / R3B1G_REPAIR_MIGRATION / "migration.sql"
    mig_sql = mig_path.read_text()
    alter_sql = extract_alter_statement(mig_sql)
    parsed = parse_compiled_add_column_semantics(alter_sql)
    equiv = semantic_equivalence(contract, alter_sql) and compiled.strip() == alter_sql.strip()
    if_not_exists = "IF NOT EXISTS" in alter_sql.upper()
    safety = static_safety(alter_sql)
    out = {
        "schema_version": 1,
        "phase": "CI-R3B1G",
        "contract_id": contract["contract_id"],
        "compiled_sql": compiled.strip(),
        "compiled_sql_sha256": sha256_text(compiled),
        "migration_path": str(mig_path.relative_to(REPO)),
        "migration_sql_sha256": sha256_text(mig_sql),
        "parsed": parsed,
        "semantic_equivalence": "PASS" if equiv else "FAIL",
        "if_not_exists_present": if_not_exists,
        "static_safety": safety,
        "pass": equiv and not if_not_exists and safety["pass"],
    }
    OUT.write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps({"pass": out["pass"], "semantic_equivalence": out["semantic_equivalence"]}, indent=2))
    return 0 if out["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
