"""Closed-world exact-identity authority for pre-execution AUTHORIZED_STRATEGY (CI-R3B1P.2)."""
from __future__ import annotations

import json
import re
from typing import Any

from ci_r3b1l2_scope_classifier import detect_operation_family
from ci_r3b1n2_constants import DATA
from ci_r3b1o1_constants import M252_TABLE
from ci_r3b1o2_diff_classifier import operation_fingerprint
from ci_r3b1o3_m252_complete_authority import build_m252_complete_physical_authority
from ci_r3b1o4_catalog_semantic_compare import _match_column, _match_index, _parse_fk_definition
from ci_r3b1o_constants import M252

AUTHORIZED_STRATEGY_DEFAULT_ALLOW = False
UNMATCHED_AUTHORIZED_CANDIDATE_BLOCKS = True

CANONICAL_PREEXECUTION_DIFF = DATA / "ci-r3b1p-production-prisma-diff-2026-08.sql"


def _norm_ws(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip())


def _norm_type(value: str) -> str:
    return _norm_ws(value).upper()


def _parse_create_table(sql: str) -> dict[str, Any] | None:
    m = re.search(r'CREATE TABLE "([^"]+)"\s*\(', sql, re.I)
    if not m or m.group(1) != M252_TABLE:
        return None
    start = m.end()
    depth = 1
    i = start
    while i < len(sql) and depth:
        if sql[i] == "(":
            depth += 1
        elif sql[i] == ")":
            depth -= 1
        i += 1
    if depth != 0:
        return None
    body = sql[start : i - 1]
    columns: list[dict[str, Any]] = []
    pk_columns: list[str] = []
    for part in re.split(r",(?=(?:[^\"']|[\"'][^\"']*[\"'])*$)", body):
        line = part.strip()
        if not line:
            continue
        pk = re.search(r'CONSTRAINT "[^"]+" PRIMARY KEY\s*\(([^)]+)\)', line, re.I)
        if pk:
            pk_columns = [c.strip().strip('"') for c in pk.group(1).split(",")]
            continue
        inline_pk = re.search(r'PRIMARY KEY\s*\(([^)]+)\)', line, re.I)
        if inline_pk:
            pk_columns = [c.strip().strip('"') for c in inline_pk.group(1).split(",")]
            continue
        col = re.match(r'"([^"]+)"\s+(.+)$', line, re.I | re.S)
        if not col:
            continue
        name = col.group(1)
        definition = col.group(2).strip()
        nullable = "NOT NULL" not in definition.upper()
        default = None
        dm = re.search(r"DEFAULT\s+(.+)$", definition, re.I | re.S)
        if dm:
            default = _norm_ws(dm.group(1))
            definition = definition[: dm.start()].strip()
        format_type = _norm_type(re.sub(r"\s+NOT NULL\s*$", "", definition, flags=re.I))
        columns.append({"name": name, "format_type": format_type, "nullable": nullable, "default": default})
    return {"schema": "public", "table": M252_TABLE, "columns": columns, "primary_key_columns": pk_columns}


def _parse_create_index(sql: str) -> dict[str, Any] | None:
    family, _ = detect_operation_family(sql)
    if family not in {"CREATE INDEX", "CREATE UNIQUE INDEX"}:
        return None
    m = re.search(
        r'CREATE\s+(UNIQUE\s+)?INDEX\s+"[^"]+"\s+ON\s+"([^"]+)"\s*\(([^)]+)\)',
        sql,
        re.I,
    )
    if not m or m.group(2) != M252_TABLE:
        return None
    cols = [c.strip().strip('"') for c in m.group(3).split(",")]
    return {
        "schema": "public",
        "table": M252_TABLE,
        "unique": bool(m.group(1)),
        "columns": cols,
        "access_method": "btree",
        "include_columns": [],
        "predicate": None,
        "valid": True,
        "ready": True,
    }


def _parse_add_foreign_key(sql: str) -> dict[str, Any] | None:
    family, subtype = detect_operation_family(sql)
    if family != "ALTER TABLE" or subtype != "foreign_key":
        return None
    table = re.search(r'ALTER TABLE "([^"]+)"', sql, re.I)
    if not table or table.group(1) != M252_TABLE:
        return None
    parsed = _parse_fk_definition(sql)
    if not parsed:
        return None
    return {
        "schema": "public",
        "source_table": M252_TABLE,
        **parsed,
        "deferrable": False,
        "initially_deferred": False,
        "validated": True,
    }


def extract_operation_identity(op: dict[str, Any]) -> dict[str, Any] | None:
    raw = op.get("raw_sql", "")
    family = op.get("operation_family") or detect_operation_family(raw)[0]
    if family == "CREATE TABLE":
        parsed = _parse_create_table(raw)
        return {"kind": "table", **parsed} if parsed else None
    if family in {"CREATE INDEX", "CREATE UNIQUE INDEX"}:
        parsed = _parse_create_index(raw)
        return {"kind": "index", **parsed} if parsed else None
    if family == "ALTER TABLE" and op.get("operation_subtype") == "foreign_key":
        parsed = _parse_add_foreign_key(raw)
        return {"kind": "foreign_key", **parsed} if parsed else None
    return None


def build_pre_execution_strategy_authority() -> list[dict[str, Any]]:
    authority = build_m252_complete_physical_authority()
    records: list[dict[str, Any]] = [
        {
            "authority_id": "AUTH-M252-TABLE",
            "source_migration": M252,
            "tail_task": "M252",
            "kind": "table",
            "schema": "public",
            "table": authority["table"],
            "columns": authority["columns"],
            "primary_key_columns": authority["primary_key"]["columns"],
        },
        {
            "authority_id": "AUTH-M252-UNIQUE-IDEMPOTENCY",
            "source_migration": M252,
            "tail_task": "M252",
            "kind": "index",
            "schema": "public",
            "table": authority["table"],
            "unique": True,
            "columns": authority["unique_index"]["columns"],
            "access_method": authority["unique_index"]["access_method"],
            "include_columns": authority["unique_index"]["include_columns"],
            "predicate": authority["unique_index"]["predicate"],
            "valid": authority["unique_index"]["valid"],
            "ready": authority["unique_index"]["ready"],
        },
        {
            "authority_id": "AUTH-M252-COMPOSITE-ORG-MBR-CREATED",
            "source_migration": M252,
            "tail_task": "M252",
            "kind": "index",
            "schema": "public",
            "table": authority["table"],
            "unique": False,
            "columns": authority["composite_index"]["columns"],
            "access_method": authority["composite_index"]["access_method"],
            "include_columns": authority["composite_index"]["include_columns"],
            "predicate": authority["composite_index"]["predicate"],
            "valid": authority["composite_index"]["valid"],
            "ready": authority["composite_index"]["ready"],
        },
        {
            "authority_id": "AUTH-M252-FK-ORG",
            "source_migration": M252,
            "tail_task": "M252",
            "kind": "foreign_key",
            **authority["foreign_keys"][0],
        },
        {
            "authority_id": "AUTH-M252-FK-MEMBERSHIP",
            "source_migration": M252,
            "tail_task": "M252",
            "kind": "foreign_key",
            **authority["foreign_keys"][1],
        },
    ]
    return records


def _table_matches(actual: dict[str, Any], expected: dict[str, Any]) -> bool:
    if actual.get("table") != expected.get("table"):
        return False
    if actual.get("primary_key_columns") != expected.get("primary_key_columns"):
        return False
    exp_cols = {c["name"]: c for c in expected.get("columns", [])}
    act_cols = {c["name"]: c for c in actual.get("columns", [])}
    if set(exp_cols) != set(act_cols):
        return False
    for name, exp in exp_cols.items():
        act = act_cols[name]
        ok, _ = _match_column(act, exp)
        if not ok:
            return False
    return True


def _index_matches(actual: dict[str, Any], expected: dict[str, Any]) -> bool:
    payload = {
        "owner_table": actual.get("table"),
        "unique": actual.get("unique"),
        "access_method": actual.get("access_method"),
        "columns": actual.get("columns"),
        "include_columns": actual.get("include_columns"),
        "predicate": actual.get("predicate"),
        "valid": actual.get("valid"),
        "ready": actual.get("ready"),
        "keys": [{"kind": "key", "name": c} for c in actual.get("columns", [])],
    }
    ok, _ = _match_index(payload, expected)
    return ok and bool(actual.get("unique")) == bool(expected.get("unique"))


def _fk_matches(actual: dict[str, Any], expected: dict[str, Any]) -> bool:
    for field in (
        "source_columns",
        "target_table",
        "target_columns",
        "match_type",
        "on_update",
        "on_delete",
        "deferrable",
        "initially_deferred",
        "validated",
    ):
        exp = expected.get(field)
        act = actual.get(field)
        if field in {"on_update", "on_delete"}:
            exp = str(exp or "NO ACTION").upper().replace("_", " ")
            act = str(act or "NO ACTION").upper().replace("_", " ")
        if field == "match_type":
            exp = str(exp or "SIMPLE").upper()
            act = str(act or "SIMPLE").upper()
        if exp != act:
            return False
    return True


def authority_matches_identity(record: dict[str, Any], identity: dict[str, Any]) -> bool:
    if record.get("kind") != identity.get("kind"):
        return False
    if record["kind"] == "table":
        return _table_matches(identity, record)
    if record["kind"] == "index":
        return _index_matches(identity, record)
    if record["kind"] == "foreign_key":
        return _fk_matches(identity, record)
    return False


def build_canonical_pre_execution_fingerprints() -> dict[str, str]:
    """Exact prisma-diff statement fingerprints for authorized pre-execution M252 ops."""
    from ci_r3b1o2_diff_classifier import classify_statements, parse_sql_script
    from ci_r3b1o2_r3b_authority import build_owner_maps

    if not CANONICAL_PREEXECUTION_DIFF.exists():
        return {}
    owners = build_owner_maps()
    fps: dict[str, str] = {}
    for op in classify_statements(parse_sql_script(CANONICAL_PREEXECUTION_DIFF.read_text()), owners)["operations"]:
        if M252_TABLE not in op.get("raw_sql", ""):
            continue
        identity = extract_operation_identity(op)
        if not identity:
            continue
        matches = [
            rec["authority_id"]
            for rec in build_pre_execution_strategy_authority()
            if authority_matches_identity(rec, identity)
        ]
        if len(matches) == 1:
            fps[matches[0]] = operation_fingerprint(op)
    return fps


def match_pre_execution_m252_authority(op: dict[str, Any], *, authority: list[dict[str, Any]] | None = None) -> list[dict[str, Any]]:
    authority = authority or build_pre_execution_strategy_authority()
    identity = extract_operation_identity(op)
    if identity is None:
        return []
    semantic_matches = [
        rec
        for rec in authority
        if authority_matches_identity(rec, identity)
    ]
    if len(semantic_matches) != 1:
        return []
    rec = semantic_matches[0]
    canonical_fps = build_canonical_pre_execution_fingerprints()
    fp = operation_fingerprint(op)
    if canonical_fps and canonical_fps.get(rec["authority_id"]) != fp:
        return []
    return [
        {
            "authority_id": rec["authority_id"],
            "reason": f"exact pre-execution strategy authority {rec['authority_id']} from {rec['source_migration']}",
            "source_migration": rec["source_migration"],
            "tail_task": rec["tail_task"],
            "semantic_fingerprint": fp,
        }
    ]


def classify_pre_execution_m252_authority(op: dict[str, Any]) -> dict[str, Any]:
    matches = match_pre_execution_m252_authority(op)
    return {
        "exact_match_count": len(matches),
        "matches": matches,
        "ambiguous": len(matches) > 1,
        "authorized": len(matches) == 1,
    }
