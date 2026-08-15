#!/usr/bin/env python3
"""SQL equivalence artifact for CI-R3B1I IAM repair migration."""
from __future__ import annotations

import json
import re
from pathlib import Path

from ci_r3b1f111_contract_compiler import (
    compile_add_column_contract,
    normalize_type,
    parse_compiled_add_column_semantics,
    sha256_text,
)
from ci_r3b1i_constants import ACCEPTED_CONTRACT, DATA, IAM_REPAIR_MIGRATION, MIG_ROOT, REPO, evidence_input_sha

OUT = DATA / "ci-r3b1i-generated-sql-equivalence-2026-08.json"
MIG_PATH = MIG_ROOT / IAM_REPAIR_MIGRATION / "migration.sql"


def extract_alter_statement(sql: str) -> str:
    for line in sql.splitlines():
        stripped = line.strip()
        if stripped.upper().startswith("ALTER TABLE"):
            return stripped if stripped.endswith(";") else stripped + ";"
    raise ValueError("no ALTER TABLE statement found")


def semantic_equivalence_for_migration(contract: dict, alter_sql: str) -> bool:
    parsed = parse_compiled_add_column_semantics(alter_sql)
    if parsed["relation"] != contract["relation"]:
        return False
    if parsed["column"] != contract["column"]:
        return False
    if normalize_type(parsed["postgres_type"]).lower() != normalize_type(contract["postgres_type"]).lower():
        return False
    if parsed["nullable"] != contract.get("nullable"):
        return False
    if contract.get("default_semantics") not in {None, "NO_DATABASE_DEFAULT", "APPLICATION_OR_PRISMA_GENERATED"}:
        return parsed.get("default_value") == contract.get("default_value")
    return "DEFAULT" not in alter_sql.upper()


def main() -> int:
    contract = {
        "contract_id": "R3B1I-organization-memberships-permissions",
        **ACCEPTED_CONTRACT,
        "authority_status": "COMPLETE_AUTHORITY",
    }
    compiled = compile_add_column_contract(contract)
    migration_sql = MIG_PATH.read_text()
    alter_sql = extract_alter_statement(migration_sql)
    parsed = parse_compiled_add_column_semantics(alter_sql)
    equiv = semantic_equivalence_for_migration(contract, alter_sql)
    out = {
        "schema_version": 1,
        "phase": "CI-R3B1I",
        "evidence_input_sha": evidence_input_sha(),
        "contract": contract,
        "compiled_sql": compiled,
        "migration_path": str(MIG_PATH.relative_to(REPO)),
        "migration_sql_sha256": sha256_text(migration_sql + "\n"),
        "relation": parsed["relation"],
        "column": parsed["column"],
        "type": parsed["postgres_type"],
        "nullable": parsed["nullable"],
        "default": parsed.get("default_value"),
        "alter_sql": alter_sql,
        "if_not_exists_present": bool(re.search(r"IF\s+NOT\s+EXISTS", alter_sql, re.I)),
        "semantic_equivalence": "PASS" if equiv else "FAIL",
        "pass": equiv and not re.search(r"IF\s+NOT\s+EXISTS", alter_sql, re.I),
    }
    OUT.write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps({"pass": out["pass"], "semantic_equivalence": out["semantic_equivalence"]}, indent=2))
    return 0 if out["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
