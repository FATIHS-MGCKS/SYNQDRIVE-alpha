#!/usr/bin/env python3
"""Golden tests for CI-R3B1J identifier collision authority."""
from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1g_replay_lib import replay_until_exclusive
from ci_r3b1j_constants import DATA, MIGRATION_252, MIGRATION_252_PATH, TABLE_NAME
from ci_r3b1j_pg_identifier import (
    CANONICAL_RENAMES,
    apply_identifier_renames,
    build_collision_groups,
    extract_migration252_identifiers,
    normalize_pg_identifier,
    split_top_level_statements,
    validate_canonical_names,
)
from ci_r3b1j_run_authority import execute_statements, test_append_only_strategies
from replay_evidence_lib import psql, recreate_db, PgConfig

OUT = DATA / "ci-r3b1j-golden-tests-2026-08.json"


def test_byte_limit_collision_detector(max_len: int = 63) -> dict:
    prefix = "a" * max_len
    names = [f"{prefix}_pkey_extra", f"{prefix}_unique_extra", f"{prefix}_idx_extra"]
    records = []
    from ci_r3b1j_pg_identifier import IdentifierRecord

    for idx, name in enumerate(names, start=1):
        records.append(IdentifierRecord(idx, "TEST", name, True))
    groups = build_collision_groups(records, max_len)
    return {"pass": len(groups) == 1 and groups[0]["member_count"] == 3, "collision_groups": len(groups)}


def test_distinct_short_names(max_len: int = 63) -> dict:
    validation = validate_canonical_names(max_len)
    return {"pass": validation["pass"], "post_normalization_collisions": validation["post_normalization_collisions"]}


def test_pk_backing_index_collision(cfg: PgConfig, max_len: int = 63) -> dict:
    db = "synqdrive_r3b1j_golden_pk_collision"
    recreate_db(cfg, db)
    prefix = "x" * max_len
    pk = f"{prefix}_pkey_extra"
    uniq = f"{prefix}_unique_extra"
    sql = f'''
CREATE TABLE "collision_test_table" ("id" UUID, CONSTRAINT "{pk}" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "{uniq}" ON "collision_test_table"("id");
'''
    result = execute_statements(cfg, db, sql)
    ff = result.get("first_failure") or {}
    return {
        "pass": ff.get("statement_ordinal") == 2 and ff.get("sqlstate") == "42P07",
        "statement_ordinal": ff.get("statement_ordinal"),
        "sqlstate": ff.get("sqlstate"),
    }


def test_migration252_real_reproduction(cfg: PgConfig) -> dict:
    db = "synqdrive_r3b1j_golden_m252"
    replay_until_exclusive(cfg, db, MIGRATION_252)
    sql = MIGRATION_252_PATH.read_text()
    result = execute_statements(cfg, db, sql)
    ff = result.get("first_failure") or {}
    collision = normalize_pg_identifier(f"{TABLE_NAME}_idempotency_key_key", 63)
    return {
        "pass": ff.get("statement_ordinal") == 2 and ff.get("sqlstate") == "42P07" and collision in (ff.get("stderr") or ""),
        "statement_ordinal": ff.get("statement_ordinal"),
        "sqlstate": ff.get("sqlstate"),
        "collision_in_error": collision in (ff.get("stderr") or ""),
    }


def test_transformed_migration(cfg: PgConfig) -> dict:
    db = "synqdrive_r3b1j_golden_transformed"
    recreate_db(cfg, db)
    replay_until_exclusive(cfg, db, MIGRATION_252)
    transformed = apply_identifier_renames(MIGRATION_252_PATH.read_text(), CANONICAL_RENAMES)
    result = execute_statements(cfg, db, transformed)
    return {"pass": result["pass"], "statement_count": result["statement_count"]}


def test_append_only_feasibility(cfg: PgConfig) -> dict:
    strategies = test_append_only_strategies(cfg, MIGRATION_252_PATH.read_text())
    feasible = any(s.get("outcome") == "PASS" for s in strategies)
    return {"pass": not feasible, "classification": "APPEND_ONLY_NOT_FEASIBLE" if not feasible else "APPEND_ONLY_FEASIBLE"}


def test_later_sweep_collision_detector(max_len: int = 63) -> dict:
    a = "organization_legal_document_retention_policies_organization_id_key"
    b = "organization_legal_document_retention_policies_organization_id_fkey"
    na = normalize_pg_identifier(a, max_len)
    nb = normalize_pg_identifier(b, max_len)
    return {"pass": na == nb and na != a, "normalized": na}


def main() -> int:
    cfg = PgConfig()
    max_len = int(psql(cfg, "postgres", "SHOW max_identifier_length;", tuples_only=True).stdout.strip())
    tests = {
        "identifier_byte_limit_test": test_byte_limit_collision_detector(max_len),
        "distinct_short_names_test": test_distinct_short_names(max_len),
        "pk_backing_index_collision_test": test_pk_backing_index_collision(cfg, max_len),
        "migration252_real_reproduction_test": test_migration252_real_reproduction(cfg),
        "transformed_migration_test": test_transformed_migration(cfg),
        "append_only_feasibility_test": test_append_only_feasibility(cfg),
        "later_sweep_collision_test": test_later_sweep_collision_detector(max_len),
    }
    out = {"schema_version": 1, "max_identifier_length": max_len, "tests": tests, "pass": all(t["pass"] for t in tests.values())}
    OUT.write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps({"pass": out["pass"], "failed": [k for k, v in tests.items() if not v["pass"]]}, indent=2))
    return 0 if out["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
