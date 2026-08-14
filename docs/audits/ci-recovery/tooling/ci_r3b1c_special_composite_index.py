#!/usr/bin/env python3
"""Checksum-bound special executor for composite-index migration replay."""
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Any

from replay_evidence_lib import (
    BACKEND,
    DATA,
    PgConfig,
    SPECIAL_MIGRATION,
    SPECIAL_MIGRATION_EXPECTED_SHA256,
    SPECIAL_MIGRATION_PATH,
    compare_migration_to_script,
    parse_create_index_statements,
    psql,
    sha256_file,
    special_migration_hash_status,
)

SCRIPT_PATH = BACKEND / "scripts/apply-composite-indexes.ts"
AUTHORITY_PATH = DATA / "ci-r3b1c-special-replay-authority-2026-08.json"


def fetch_index_catalog(cfg: PgConfig, db: str, index_name: str) -> dict[str, Any] | None:
    proc = psql(
        cfg,
        db,
        f"""
        SELECT
          i.relname AS index_name,
          t.relname AS table_name,
          ix.indisunique AS is_unique,
          ix.indisvalid AS is_valid,
          ix.indisready AS is_ready,
          am.amname AS access_method,
          array_agg(a.attname ORDER BY k.ord) AS columns,
          pg_get_expr(ix.indpred, ix.indrelid) AS predicate
        FROM pg_class i
        JOIN pg_index ix ON ix.indexrelid = i.oid
        JOIN pg_class t ON t.oid = ix.indrelid
        JOIN pg_am am ON am.oid = i.relam
        JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY AS k(attnum, ord) ON true
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
        WHERE i.relname = '{index_name}'
        GROUP BY i.relname, t.relname, ix.indisunique, ix.indisvalid, ix.indisready, am.amname, ix.indpred, ix.indrelid;
        """,
        tuples_only=True,
    )
    if proc.returncode != 0 or not proc.stdout.strip():
        return None
    parts = proc.stdout.strip().split("|")
    if len(parts) < 8:
        return None
    cols = parts[6].strip("{}").split(",") if parts[6] else []
    return {
        "index_name": parts[0],
        "table_name": parts[1],
        "is_unique": parts[2] == "t",
        "is_valid": parts[3] == "t",
        "is_ready": parts[4] == "t",
        "access_method": parts[5],
        "columns": [c.strip() for c in cols if c.strip()],
        "predicate": None if parts[7] in {"", "null"} else parts[7],
    }


def validate_indexes(cfg: PgConfig, db: str, expected: list[dict[str, Any]]) -> dict[str, Any]:
    mismatches = []
    missing = []
    for spec in expected:
        actual = fetch_index_catalog(cfg, db, spec["index_name"])
        if not actual:
            missing.append(spec["index_name"])
            continue
        if actual["table_name"] != spec["relation"]:
            mismatches.append({"index": spec["index_name"], "field": "table_name", "expected": spec["relation"], "actual": actual["table_name"]})
        if actual["columns"] != spec["columns"]:
            mismatches.append({"index": spec["index_name"], "field": "columns", "expected": spec["columns"], "actual": actual["columns"]})
        if actual["is_unique"] != spec["unique"]:
            mismatches.append({"index": spec["index_name"], "field": "unique", "expected": spec["unique"], "actual": actual["is_unique"]})
        if not actual["is_valid"] or not actual["is_ready"]:
            mismatches.append({"index": spec["index_name"], "field": "validity", "expected": "valid+ready", "actual": actual})
    return {
        "missing_indexes": missing,
        "definition_mismatches": mismatches,
        "pass": not missing and not mismatches,
    }


def execute_statements(cfg: PgConfig, db: str, statements: list[str]) -> None:
    for stmt in statements:
        proc = psql(cfg, db, stmt if stmt.endswith(";") else stmt + ";")
        if proc.returncode != 0:
            raise RuntimeError(f"statement failed: {stmt[:120]} :: {proc.stderr or proc.stdout}")


def prisma_resolve_applied(cfg: PgConfig, db: str) -> None:
    env = dict(**{"DATABASE_URL": cfg.url(db)})
    import os

    full_env = os.environ.copy()
    full_env.update(env)
    proc = subprocess.run(
        ["npx", "prisma", "migrate", "resolve", "--applied", SPECIAL_MIGRATION],
        cwd=BACKEND,
        capture_output=True,
        text=True,
        env=full_env,
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr or proc.stdout)


class SpecialCompositeIndexExecutor:
    migration = SPECIAL_MIGRATION
    migration_path = SPECIAL_MIGRATION_PATH

    def __init__(self, cfg: PgConfig | None = None, accepted_sha256: str | None = None) -> None:
        self.cfg = cfg or PgConfig()
        self.accepted_sha256 = accepted_sha256 or SPECIAL_MIGRATION_EXPECTED_SHA256
        self.observed_sha256 = sha256_file(self.migration_path)
        self.sql_text = self.migration_path.read_text()
        self.expected_indexes = parse_create_index_statements(self.sql_text)
        self.statements = [
            re.sub(r"\s+", " ", m.group(0)).strip()
            for m in __import__("replay_evidence_lib", fromlist=["CREATE_INDEX_RE"]).CREATE_INDEX_RE.finditer(self.sql_text)
        ]

    def verify_checksum(self, observed_sha256: str | None = None) -> None:
        observed = observed_sha256 or sha256_file(self.migration_path)
        if observed != self.accepted_sha256:
            raise RuntimeError(f"checksum mismatch: expected {self.accepted_sha256}, got {observed}")

    def verify_statement_mapping(self) -> None:
        if len(self.statements) != len(self.expected_indexes):
            raise RuntimeError("statement/index mapping count mismatch")
        if not self.statements:
            raise RuntimeError("no CREATE INDEX statements parsed from migration")

    def verify_script_equivalence(self) -> dict[str, Any]:
        return compare_migration_to_script(self.sql_text, SCRIPT_PATH)

    def run(self, db: str, *, reconcile: bool = True) -> dict[str, Any]:
        self.verify_checksum()
        self.verify_statement_mapping()
        equiv = self.verify_script_equivalence()
        if not equiv["semantic_equivalent"]:
            raise RuntimeError(f"script equivalence failed: {equiv}")
        execute_statements(self.cfg, db, self.statements)
        validation = validate_indexes(self.cfg, db, self.expected_indexes)
        if not validation["pass"]:
            raise RuntimeError(f"index validation failed: {validation}")
        reconciliation = None
        if reconcile:
            prisma_resolve_applied(self.cfg, db)
            reconciliation = {"migration": self.migration, "operation": "prisma migrate resolve --applied", "validated_before_resolve": True}
        return {
            "migration": self.migration,
            "accepted_sha256": self.accepted_sha256,
            "observed_sha256": self.observed_sha256,
            "statement_count": len(self.statements),
            "semantic_equivalence": equiv,
            "index_validation": validation,
            "migration_state_reconciliation": reconciliation,
        }


def build_authority() -> dict[str, Any]:
    hash_status = special_migration_hash_status()
    executor = SpecialCompositeIndexExecutor()
    equiv = compare_migration_to_script(executor.sql_text, SCRIPT_PATH)
    authorized = hash_status["match"] and equiv["semantic_equivalent"]
    return {
        "schema_version": 1,
        "strategy": "B_deterministic_special_executor_plus_migration_state_reconciliation",
        "execution_model": {
            "canonical_command": "npx prisma migrate deploy",
            "prisma_version": "^5.20.0",
            "transaction_wrapped": True,
            "proof": "Observed SQLSTATE 25001 on CREATE INDEX CONCURRENTLY during migrate deploy on disposable DB",
        },
        "special_migrations": [
            {
                "migration": SPECIAL_MIGRATION,
                "migration_path": str(SPECIAL_MIGRATION_PATH.relative_to(REPO := BACKEND.parent.parent)),
                "accepted_sha256": hash_status["accepted_sha256"],
                "observed_sha256": hash_status["observed_sha256"],
                "sha256_match": hash_status["match"],
                "reason": "CREATE INDEX CONCURRENTLY incompatible with Prisma transactional migrate deploy",
                "normal_execution_result": "FAIL",
                "special_executor": "ci_r3b1c_special_composite_index.SpecialCompositeIndexExecutor",
                "statement_count": len(executor.expected_indexes),
                "semantic_equivalence_validated": equiv["semantic_equivalent"],
                "script_comparison": equiv,
                "post_execution_validation": ["pg_catalog index definition match for all statements"],
                "migration_state_reconciliation_required": True,
                "resumption_strategy": "prisma migrate resolve --applied then continue migrate deploy",
                "authorized": authorized,
            }
        ],
    }


def main() -> int:
    mode = sys.argv[1] if len(sys.argv) > 1 else "authority"
    if mode == "authority":
        auth = build_authority()
        AUTHORITY_PATH.write_text(json.dumps(auth, indent=2) + "\n")
        print(json.dumps(auth, indent=2))
        return 0 if auth["special_migrations"][0]["authorized"] else 1
    if mode == "execute":
        db = sys.argv[2]
        reconcile = sys.argv[3] != "no-reconcile" if len(sys.argv) > 3 else True
        result = SpecialCompositeIndexExecutor().run(db, reconcile=reconcile)
        print(json.dumps(result, indent=2))
        return 0
    print(f"unknown mode {mode}", file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
