#!/usr/bin/env python3
"""Golden tests for CI-R3B1J.1 namespace and semantic parity closure."""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1j1_constants import DATA, MIGRATION_252_PATH, TABLE_252, load_canonical_renames
from ci_r3b1j1_namespace_model import PostgresNamespaceClass, build_namespace_collision_groups, extract_namespace_identifiers
from ci_r3b1j1_semantic_authority import build_migration252_semantic_authority
from ci_r3b1j1_semantic_parity import compare_semantic_parity, extract_full_catalog_state
from ci_r3b1j1_token_diff import compare_identifier_token_diff
from ci_r3b1j_pg_identifier import apply_identifier_renames, normalize_pg_identifier
from ci_r3b1g_replay_lib import replay_until_exclusive
from ci_r3b1j_run_authority import execute_statements
from ci_r3b1j1_run_closure import prove_legal_document_case
from replay_evidence_lib import psql, recreate_db, PgConfig

OUT = DATA / "ci-r3b1j1-golden-tests-2026-08.json"


def test_index_vs_fk_same_normalized_text(cfg: PgConfig, max_len: int) -> dict:
    legal = prove_legal_document_case(cfg, max_len)
    ids = extract_namespace_identifiers("fixture", (
        'CREATE UNIQUE INDEX "organization_legal_document_retention_policies_organization_id_key" '
        'ON "organization_legal_document_retention_policies"("organization_id"); '
        'ALTER TABLE "organization_legal_document_retention_policies" '
        'ADD CONSTRAINT "organization_legal_document_retention_policies_organization_id_fkey" '
        'FOREIGN KEY ("organization_id") REFERENCES "organizations"("id");'
    ), max_len)
    groups = real_groups = build_namespace_collision_groups(ids)
    rel_groups = [g for g in groups if g["postgres_namespace_class"] == PostgresNamespaceClass.RELATION_NAMESPACE.value and g.get("real_collision")]
    return {"pass": legal["classification"] == "STATIC_FALSE_POSITIVE" and len(rel_groups) == 0, "classification": legal["classification"]}


def test_index_vs_index_collision(cfg: PgConfig, max_len: int) -> dict:
    prefix = "z" * max_len
    sql = f'''
CREATE TABLE "t" ("id" UUID, CONSTRAINT "{prefix}_pkey_extra" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "{prefix}_unique_extra" ON "t"("id");
'''
    db = "synqdrive_r3b1j1_golden_idx_idx"
    recreate_db(cfg, db)
    result = execute_statements(cfg, db, sql)
    ff = result.get("first_failure") or {}
    return {"pass": ff.get("statement_ordinal") == 2 and ff.get("sqlstate") == "42P07"}


def test_table_vs_index_collision(cfg: PgConfig, max_len: int) -> dict:
    name = "q" * 62
    sql = f'CREATE TABLE "{name}_x" ("id" INT); CREATE INDEX "{name}_y" ON "{name}_x"("id");'
    db = "synqdrive_r3b1j1_golden_tbl_idx"
    recreate_db(cfg, db)
    proc = psql(cfg, db, sql.replace(";", ";\n"))
    return {"pass": proc.returncode == 0}


def test_pk_backing_index_collision(cfg: PgConfig, max_len: int) -> dict:
    return test_index_vs_index_collision(cfg, max_len)


def _parity_fixture(cfg: PgConfig) -> tuple[dict, dict]:
    db = "synqdrive_r3b1j1_golden_parity"
    recreate_db(cfg, db)
    replay_until_exclusive(cfg, db, "20260721270000_iam_role_assignment_drift_reconciliation")
    sql = MIGRATION_252_PATH.read_text()
    renames = load_canonical_renames()
    execute_statements(cfg, db, apply_identifier_renames(sql, renames))
    expected = build_migration252_semantic_authority(sql)
    actual = extract_full_catalog_state(cfg, db, psql, TABLE_252)
    return expected, actual


def test_strict_positive(cfg: PgConfig) -> dict:
    expected, actual = _parity_fixture(cfg)
    result = compare_semantic_parity(expected, actual, load_canonical_renames())
    token = compare_identifier_token_diff(MIGRATION_252_PATH.read_text(), apply_identifier_renames(MIGRATION_252_PATH.read_text(), load_canonical_renames()))
    return {"pass": result["pass"] and token["pass"]}


def test_type_negative(cfg: PgConfig) -> dict:
    expected, actual = _parity_fixture(cfg)
    actual["columns"][0]["pg_type"] = "integer"
    result = compare_semantic_parity(expected, actual)
    return {"pass": not result["pass"] and any(m["category"] == "COLUMN_TYPE" for m in result["mismatches"])}


def test_nullability_negative(cfg: PgConfig) -> dict:
    expected, actual = _parity_fixture(cfg)
    actual["columns"][0]["nullable"] = True
    result = compare_semantic_parity(expected, actual)
    return {"pass": not result["pass"]}


def test_default_negative(cfg: PgConfig) -> dict:
    expected, actual = _parity_fixture(cfg)
    for col in actual["columns"]:
        if col["name"] == "id":
            col["default"] = "'forced'"
    result = compare_semantic_parity(expected, actual)
    return {"pass": not result["pass"] and any(m["category"] == "COLUMN_DEFAULT" for m in result["mismatches"])}


def test_pk_negative(cfg: PgConfig) -> dict:
    expected, actual = _parity_fixture(cfg)
    actual["primary_keys"][0]["columns"] = ["idempotency_key"]
    result = compare_semantic_parity(expected, actual)
    return {"pass": not result["pass"]}


def test_index_tuple_negative(cfg: PgConfig) -> dict:
    expected, actual = _parity_fixture(cfg)
    for idx in actual["indexes"]:
        if "idempotency" in idx["indexdef"]:
            idx["indexdef"] = idx["indexdef"].replace("idempotency_key", "organization_id")
    result = compare_semantic_parity(expected, actual)
    return {"pass": not result["pass"]}


def test_fk_target_negative(cfg: PgConfig) -> dict:
    expected, actual = _parity_fixture(cfg)
    actual["foreign_keys"][0]["target_table"] = "users"
    result = compare_semantic_parity(expected, actual)
    return {"pass": not result["pass"]}


def test_fk_action_negative(cfg: PgConfig) -> dict:
    expected, actual = _parity_fixture(cfg)
    actual["foreign_keys"][0]["on_delete"] = "NO ACTION"
    result = compare_semantic_parity(expected, actual)
    return {"pass": not result["pass"]}


def test_extra_index_negative(cfg: PgConfig) -> dict:
    expected, actual = _parity_fixture(cfg)
    actual["indexes"].append({"name": "extra", "unique": False, "primary": False, "indexdef": 'CREATE INDEX extra ON t("id")'})
    result = compare_semantic_parity(expected, actual)
    return {"pass": not result["pass"]}


def test_missing_index_negative(cfg: PgConfig) -> dict:
    expected, actual = _parity_fixture(cfg)
    actual["indexes"] = [i for i in actual["indexes"] if i["primary"]]
    result = compare_semantic_parity(expected, actual)
    return {"pass": not result["pass"]}


def main() -> int:
    cfg = PgConfig()
    max_len = int(psql(cfg, "postgres", "SHOW max_identifier_length;", tuples_only=True).stdout.strip())
    tests = {
        "index_vs_fk_same_normalized_text": test_index_vs_fk_same_normalized_text(cfg, max_len),
        "index_vs_index_same_normalized_text": test_index_vs_index_collision(cfg, max_len),
        "pk_backing_index_collision": test_pk_backing_index_collision(cfg, max_len),
        "identifier_only_positive": test_strict_positive(cfg),
        "type_parity_negative": test_type_negative(cfg),
        "nullability_parity_negative": test_nullability_negative(cfg),
        "default_parity_negative": test_default_negative(cfg),
        "pk_tuple_negative": test_pk_negative(cfg),
        "index_tuple_negative": test_index_tuple_negative(cfg),
        "fk_target_negative": test_fk_target_negative(cfg),
        "fk_action_negative": test_fk_action_negative(cfg),
        "extra_index_negative": test_extra_index_negative(cfg),
        "missing_index_negative": test_missing_index_negative(cfg),
    }
    out = {"schema_version": 1, "tests": tests, "pass": all(t["pass"] for t in tests.values())}
    OUT.write_text(json.dumps(out, indent=2) + "\n")
    failed = [k for k, v in tests.items() if not v["pass"]]
    print(json.dumps({"pass": out["pass"], "failed": failed}, indent=2))
    return 0 if out["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
