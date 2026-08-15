#!/usr/bin/env python3
"""Golden tests for CI-R3B1O.2."""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1o1_constants import M252_TABLE
from ci_r3b1o1_m252_authority import build_m252_physical_authority, compare_m252_exact_parity
from ci_r3b1o2_constants import DATA, M252_CANONICAL
from ci_r3b1o2_diff_classifier import resolve_owner_fields
from ci_r3b1o2_r3b_authority import build_owner_maps, resolve_index_owner
from ci_r3b1l2_prisma_sql_parser import ParsedStatement
from ci_r3b1o2_schema_gate import validate_authorized_schema_diff


def run_golden_tests() -> dict:
    tests = []
    owners = build_owner_maps(schema_dump=DATA.parents[1] / ".work/r3b1o/production_schema_only.sql")

    sql_m252_idx = f'ALTER INDEX "{M252_CANONICAL["UNIQUE"]}" RENAME TO "other";'
    stmt = ParsedStatement(1, [], [], sql_m252_idx, [])
    parsed = resolve_owner_fields(stmt, owners)
    res, table, src = resolve_index_owner(M252_CANONICAL["UNIQUE"], owners)
    tests.append({"name": "m252_unique_index_owner_resolved", "pass": res == "OWNER_M252" and table == M252_TABLE, "actual": res})

    unrelated = "ALTER INDEX \"organization_legal_documents_organization_id_document_type__idx\" RENAME TO \"x\";"
    stmt2 = ParsedStatement(2, [], [], unrelated, [])
    parsed2 = resolve_owner_fields(stmt2, owners)
    tests.append({"name": "unrelated_alter_index_owner_resolved", "pass": parsed2["owner_resolution"] != "OWNER_UNKNOWN", "actual": parsed2["owner_resolution"]})

    auth = validate_authorized_schema_diff()
    tests.append({"name": "unauthorized_schema_change_gate", "pass": auth["unauthorized_count"] == 0, "actual": auth["unauthorized_count"]})

    authority = build_m252_physical_authority()
    bad = dict(authority)
    bad["primary_key"]["name"] = "wrong_pkey"
    fake_run = lambda sql: ""
    parity_fail = not compare_m252_exact_parity(bad, fake_run)["pass"]
    tests.append({"name": "wrong_pk_name_fails_parity", "pass": parity_fail, "actual": parity_fail})

    out = {"schema_version": 1, "phase": "CI-R3B1O.2", "tests": tests, "total": len(tests), "passed": sum(1 for t in tests if t["pass"]), "pass": all(t["pass"] for t in tests)}
    (DATA / "ci-r3b1o2-golden-tests-2026-08.json").write_text(json.dumps(out, indent=2) + "\n")
    return out


if __name__ == "__main__":
    raise SystemExit(0 if run_golden_tests()["pass"] else 1)
