"""Statement-level authority crossvalidation (CI-R3B1O.4 binding corrective)."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from ci_r3b1n2_constants import DATA
from ci_r3b1o4_execution_set import build_statement_lookup

FAMILY_COMPAT = {
    "CREATE_TABLE": {"CREATE_TABLE", "ADD_CONSTRAINT", "M252_FORWARD"},
    "ALTER_TABLE": {"ALTER_TABLE_ADD_COLUMN", "ADD_CONSTRAINT"},
    "CREATE_INDEX": {"CREATE_INDEX", "M252_FORWARD"},
    "CREATE UNIQUE INDEX": {"CREATE_INDEX", "M252_FORWARD"},
    "DROP INDEX": {"DROP_INDEX"},
    "CREATE TYPE": {"CREATE_TYPE_ENUM"},
    "CREATE SEQUENCE": {"CREATE_SEQUENCE"},
}


def _family_compatible(statement_family: str | None, operation_family: str | None) -> bool:
    if not statement_family or not operation_family:
        return True
    allowed = FAMILY_COMPAT.get(statement_family)
    if allowed is None:
        return True
    if operation_family in allowed:
        return True
    if operation_family == "M252_FORWARD":
        return statement_family in {"CREATE TABLE", "CREATE INDEX", "ALTER TABLE"}
    return False


def build_statement_crossvalidation(
    *,
    execution_set: dict[str, Any],
    authority: dict[str, Any],
) -> dict[str, Any]:
    lookup = build_statement_lookup(execution_set)
    rows: list[dict[str, Any]] = []
    missing_statement = 0
    sha_mismatch = 0
    family_mismatch = 0

    for proof in authority.get("proofs", []):
        mig = proof.get("migration")
        ordn = proof.get("statement_ordinal")
        sha = proof.get("statement_sha256")
        if mig is None or ordn is None:
            continue
        stmt = lookup.get((mig, int(ordn)))
        ok = True
        reasons: list[str] = []
        if not stmt:
            missing_statement += 1
            ok = False
            reasons.append("missing_statement")
        else:
            if stmt["statement_sha256"] != sha:
                sha_mismatch += 1
                ok = False
                reasons.append("sha_mismatch")
            op = None
            for delta in authority.get("deltas", []):
                if delta.get("object_id") == proof.get("object_id"):
                    break
            if not _family_compatible(stmt.get("statement_family"), proof.get("statement_family")):
                family_mismatch += 1
                ok = False
                reasons.append("family_mismatch")
        rows.append(
            {
                "object_id": proof.get("object_id"),
                "migration": mig,
                "statement_ordinal": ordn,
                "proof_sha256": sha,
                "execution_set_sha256": stmt["statement_sha256"] if stmt else None,
                "statement_family": stmt.get("statement_family") if stmt else None,
                "pass": ok,
                "reasons": reasons,
            }
        )

    return {
        "schema_version": 1,
        "phase": "CI-R3B1O.4-binding-corrective",
        "rows": rows,
        "missing_statement": missing_statement,
        "sha_mismatch": sha_mismatch,
        "family_mismatch": family_mismatch,
        "pass": missing_statement == 0 and sha_mismatch == 0 and family_mismatch == 0,
    }


def write_statement_crossvalidation(payload: dict[str, Any]) -> None:
    (DATA / "ci-r3b1o4-binding-corrective-statement-crossvalidation-2026-08.json").write_text(json.dumps(payload, indent=2) + "\n")
