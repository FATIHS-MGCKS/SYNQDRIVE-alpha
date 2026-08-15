"""Full Prisma schema-vs-DB diff capture and R3B scope classification for CI-R3B1L.1."""
from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
from pathlib import Path
from typing import Any

from ci_r3b1l1_authority import load_canonical_54
from ci_r3b1l1_constants import BACKEND, BOOTSTRAP_ENUMS, BOOTSTRAP_TABLES, DATA, FULL_REPLAY_DB, REPO, R3B_OBJECT_NAMES

DIFF_JSON = DATA / "ci-r3b1l1-prisma-schema-db-diff-2026-08.json"
DIFF_SQL = DATA / "ci-r3b1l1-prisma-schema-db-diff-2026-08.sql"
CLASSIFICATION_JSON = DATA / "ci-r3b1l1-prisma-diff-scope-classification-2026-08.json"

TABLE_TO_PROPERTY_PREFIX = {t: f"{t}:" for t in BOOTSTRAP_TABLES}


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def split_sql_statements(script: str) -> list[str]:
    statements: list[str] = []
    current: list[str] = []
    in_dollar = False
    dollar_tag = ""
    for line in script.splitlines():
        stripped = line.strip()
        if not in_dollar:
            m = re.search(r"\$(\w*)\$", stripped)
            if m and stripped.count("$") % 2 == 1:
                in_dollar = True
                dollar_tag = m.group(1)
        elif re.search(rf"\${dollar_tag}\$", stripped):
            in_dollar = False
        current.append(line)
        if not in_dollar and stripped.endswith(";"):
            stmt = "\n".join(current).strip()
            if stmt and not stmt.startswith("--"):
                statements.append(stmt)
            current = []
    tail = "\n".join(current).strip()
    if tail and not tail.startswith("--"):
        statements.append(tail)
    return statements


def detect_operation_type(sql: str) -> str:
    head = sql.strip().split("\n", 1)[0].strip().upper()
    for op in (
        "CREATE TYPE",
        "ALTER TYPE",
        "DROP TYPE",
        "CREATE TABLE",
        "DROP TABLE",
        "ALTER TABLE",
        "CREATE INDEX",
        "DROP INDEX",
        "CREATE UNIQUE INDEX",
        "ADD CONSTRAINT",
        "DROP CONSTRAINT",
        "CREATE EXTENSION",
        "DROP EXTENSION",
        "BEGIN",
        "COMMIT",
    ):
        if head.startswith(op):
            return op
    return "UNKNOWN"


def extract_identifiers(sql: str) -> set[str]:
    ids: set[str] = set()
    for m in re.finditer(r'"([^"]+)"', sql):
        ids.add(m.group(1))
    for m in re.finditer(r"\b(?:TABLE|TYPE|INDEX|CONSTRAINT)\s+([a-zA-Z_][\w]*)", sql, re.I):
        ids.add(m.group(1))
    for m in re.finditer(r"\bON\s+(?:public\.)?\"?([a-zA-Z_][\w]*)\"?", sql, re.I):
        ids.add(m.group(1))
    for m in re.finditer(r"\bREFERENCES\s+(?:public\.)?\"?([a-zA-Z_][\w]*)\"?", sql, re.I):
        ids.add(m.group(1))
    return ids


def classify_operation(sql: str, ordinal: int) -> dict[str, Any]:
    op_type = detect_operation_type(sql)
    ids = extract_identifiers(sql)
    r3b_hits = sorted(ids & R3B_OBJECT_NAMES)
    unknown = op_type == "UNKNOWN"
    if unknown:
        classification = "UNRESOLVED"
        reason = "unparseable operation type"
        authority_id = None
    elif r3b_hits:
        classification = "R3B_SCOPE"
        reason = f"affects authority object(s): {', '.join(r3b_hits)}"
        authority_id = None
        for obj in r3b_hits:
            if obj in BOOTSTRAP_TABLES:
                authority_id = f"{obj}:columns"
                break
            if obj in BOOTSTRAP_ENUMS:
                authority_id = f"enum:{obj}"
                break
    else:
        classification = "OUT_OF_SCOPE"
        reason = "no authority object intersection"
        authority_id = None
    return {
        "ordinal": ordinal,
        "operation_type": op_type,
        "raw_sql": sql,
        "target_objects": sorted(ids),
        "target_property": authority_id,
        "classification": classification,
        "reason": reason,
        "authority_id": authority_id,
    }


def run_prisma_diff(db_name: str = FULL_REPLAY_DB) -> dict[str, Any]:
    env = os.environ.copy()
    port = os.environ.get("R3B_PG_PORT", "5432")
    env["DATABASE_URL"] = f"postgresql://synqdrive:synqdrive@127.0.0.1:{port}/{db_name}"
    proc = subprocess.run(
        ["npx", "prisma", "migrate", "diff", "--from-url", env["DATABASE_URL"], "--to-schema-datamodel", "prisma/schema.prisma", "--script"],
        cwd=BACKEND,
        capture_output=True,
        text=True,
        env=env,
    )
    stdout = proc.stdout or ""
    stderr = proc.stderr or ""
    script = stdout.strip()
    DIFF_SQL.write_text(script + ("\n" if script else ""))
    line_count = len(script.splitlines()) if script else 0
    diff_empty = not script or "empty migration" in script.lower()
    out = {
        "schema_version": 1,
        "command": "npx prisma migrate diff --from-url <replay-db> --to-schema-datamodel prisma/schema.prisma --script",
        "exit_code": proc.returncode,
        "command_success": proc.returncode == 0,
        "stdout": stdout,
        "stderr": stderr,
        "stdout_sha256": sha256_text(stdout),
        "byte_length": len(stdout.encode("utf-8")),
        "line_count": line_count,
        "diff_empty": diff_empty,
    }
    DIFF_JSON.write_text(json.dumps(out, indent=2) + "\n")
    return out


def classify_diff_script(script: str) -> dict[str, Any]:
    statements = split_sql_statements(script)
    operations = [classify_operation(stmt, i + 1) for i, stmt in enumerate(statements)]
    r3b_scope = [o for o in operations if o["classification"] == "R3B_SCOPE"]
    out_of_scope = [o for o in operations if o["classification"] == "OUT_OF_SCOPE"]
    unresolved = [o for o in operations if o["classification"] == "UNRESOLVED"]
    out = {
        "schema_version": 1,
        "total_operations": len(operations),
        "R3B_SCOPE_DIFF_COUNT": len(r3b_scope),
        "OUT_OF_SCOPE_DIFF_COUNT": len(out_of_scope),
        "UNRESOLVED_DIFF_COUNT": len(unresolved),
        "operations": operations,
        "r3b_scope_objects": sorted({obj for o in r3b_scope for obj in o["target_objects"] if obj in R3B_OBJECT_NAMES}),
        "out_of_scope_objects": sorted({obj for o in out_of_scope for obj in o["target_objects"] if obj not in R3B_OBJECT_NAMES}),
        "pass": len(r3b_scope) == 0 and len(unresolved) == 0,
    }
    CLASSIFICATION_JSON.write_text(json.dumps(out, indent=2) + "\n")
    return out


def run_classification_golden_tests() -> dict[str, Any]:
    tests = []

    def r3b_column():
        sql = 'ALTER TABLE "vehicle_trips" ADD COLUMN "new_col" text;'
        op = classify_operation(sql, 1)
        return op["classification"] == "R3B_SCOPE", op

    def r3b_enum():
        sql = 'ALTER TYPE "TripAssignmentStatus" ADD VALUE \'NEW\';'
        op = classify_operation(sql, 1)
        return op["classification"] == "R3B_SCOPE", op

    def r3b_index():
        sql = 'CREATE INDEX vehicle_trips_test_idx ON public.vehicle_trips USING btree (id);'
        op = classify_operation(sql, 1)
        return op["classification"] == "R3B_SCOPE", op

    def out_enum():
        sql = 'CREATE TYPE "DriveType" AS ENUM (\'FWD\');'
        op = classify_operation(sql, 1)
        return op["classification"] == "OUT_OF_SCOPE", op

    def out_table():
        sql = 'CREATE TABLE "booking_payment_requests" (id text);'
        op = classify_operation(sql, 1)
        return op["classification"] == "OUT_OF_SCOPE", op

    def unresolved():
        sql = "MYSTERY OPERATION xyz;"
        op = classify_operation(sql, 1)
        return op["classification"] == "UNRESOLVED", op

    cases = [
        ("r3b_column_diff", r3b_column),
        ("r3b_enum_diff", r3b_enum),
        ("r3b_index_diff", r3b_index),
        ("out_of_scope_enum", out_enum),
        ("out_of_scope_table", out_table),
        ("unresolved_parse", unresolved),
    ]
    for name, fn in cases:
        passed, detail = fn()
        tests.append({"name": name, "pass": passed, "detail": detail})
    return {"tests": tests, "pass": all(t["pass"] for t in tests)}


def run_full_diff_pipeline(db_name: str = FULL_REPLAY_DB) -> dict[str, Any]:
    diff = run_prisma_diff(db_name)
    classification = classify_diff_script(diff.get("stdout", ""))
    golden = run_classification_golden_tests()
    return {"diff": diff, "classification": classification, "classification_golden": golden}
