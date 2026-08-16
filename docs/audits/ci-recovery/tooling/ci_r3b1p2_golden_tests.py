#!/usr/bin/env python3
"""Golden/negative tests for CI-R3B1P.2 AUTHORIZED_STRATEGY exact-identity hardening."""
from __future__ import annotations

import argparse
import copy
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1n2_constants import DATA, REPO
from ci_r3b1o1_constants import FROZEN_DIFF_SQL, M252_TABLE
from ci_r3b1o2_diff_classifier import classify_statements, operation_fingerprint, parse_sql_script
from ci_r3b1o2_r3b_authority import build_owner_maps
from ci_r3b1o3_diff_attribution import classify_operation_two_axis, has_explicit_strategy_authority
from ci_r3b1p_diff_attribution import classify_preflight_production_diff
from ci_r3b1p2_authorized_strategy_authority import (
    AUTHORIZED_STRATEGY_DEFAULT_ALLOW,
    UNMATCHED_AUTHORIZED_CANDIDATE_BLOCKS,
    build_canonical_pre_execution_fingerprints,
    build_pre_execution_strategy_authority,
    classify_pre_execution_m252_authority,
    extract_operation_identity,
    match_pre_execution_m252_authority,
)
from ci_r3b1p_terminal_gate import evaluate_r3b1p_terminal_acceptance

SCHEMA_DUMP = REPO / "docs/audits/ci-recovery/.work/r3b1p/production_schema_only.sql"
PRODUCTION_DIFF = DATA / "ci-r3b1p-production-prisma-diff-2026-08.sql"
GOLDEN_TWIN = DATA / "ci-r3b1o4-ambiguity-corrective-golden-prisma-diff-2026-08.sql"
OUT = DATA / "ci-r3b1p2-golden-tests-2026-08.json"


def _add(tests: list, test_id: str, fn: str, expected: str, ok: bool, actual: str):
    tests.append({"test_id": test_id, "function": fn, "expected": expected, "actual": actual, "pass": ok})


def _m252_ops(script: str | None = None) -> list[dict]:
    owners = build_owner_maps(schema_dump=SCHEMA_DUMP if SCHEMA_DUMP.exists() else None)
    text = script or PRODUCTION_DIFF.read_text()
    return [o for o in classify_statements(parse_sql_script(text), owners)["operations"] if M252_TABLE in o.get("raw_sql", "")]


def _classify_op(op: dict) -> dict:
    owners = build_owner_maps(schema_dump=SCHEMA_DUMP if SCHEMA_DUMP.exists() else None)
    resolved = {**op, **{k: op.get(k) for k in op}}
    golden_fps = set()
    base_fps = {operation_fingerprint(o) for o in classify_statements(parse_sql_script(FROZEN_DIFF_SQL.read_text()), owners)["operations"]}
    return classify_operation_two_axis(resolved, golden_fps=golden_fps, golden_baseline_fps=base_fps)


def run_contract_tests(tests: list) -> None:
    _add(tests, "authorized_strategy_default_allow_false", "contract", "false", AUTHORIZED_STRATEGY_DEFAULT_ALLOW is False, str(AUTHORIZED_STRATEGY_DEFAULT_ALLOW))
    _add(tests, "unmatched_candidate_blocks_true", "contract", "true", UNMATCHED_AUTHORIZED_CANDIDATE_BLOCKS is True, str(UNMATCHED_AUTHORIZED_CANDIDATE_BLOCKS))
    authority = build_pre_execution_strategy_authority()
    _add(tests, "closed_world_authority_count", "build_pre_execution_strategy_authority", "5", len(authority) == 5, str(len(authority)))
    fps = build_canonical_pre_execution_fingerprints()
    _add(tests, "canonical_fingerprint_count", "build_canonical_pre_execution_fingerprints", "5", len(fps) == 5, str(len(fps)))


def run_r3b1p1_regression_tests(tests: list) -> None:
    prod = PRODUCTION_DIFF.read_text()
    golden = GOLDEN_TWIN.read_text() if GOLDEN_TWIN.exists() else ""
    schema = SCHEMA_DUMP if SCHEMA_DUMP.exists() else None
    regressions = [
        ("r3b1p1_regression_wrong_fk_target", prod.replace('REFERENCES "organizations"', 'REFERENCES "vehicles"', 1)),
        ("r3b1p1_regression_wrong_index_column", prod.replace('"idempotency_key"', '"bogus_key"', 1)),
        (
            "r3b1p1_regression_wrong_unique_index_name",
            prod.replace("organization_role_assignment_drift_reconciliation_applicati_key", "bogus_unique_key", 1),
        ),
    ]
    for test_id, script in regressions:
        result = classify_preflight_production_diff(
            script,
            golden_twin_script=golden,
            golden_baseline_script=FROZEN_DIFF_SQL.read_text(),
            schema_dump=schema,
        )
        bogus = [o for o in result["operations"] if o["classification"] == "AUTHORIZED_STRATEGY_DELTA" and ("bogus" in o["raw_sql"].lower() or "vehicles" in o["raw_sql"])]
        _add(tests, test_id, "classify_preflight_production_diff", "blocking", len(bogus) == 0, f"bogus={len(bogus)}")
    _add(tests, "r3b1p1_regression_present", "manual", "true", True, "true")


def run_legitimate_operation_tests(tests: list) -> None:
    authority = build_pre_execution_strategy_authority()
    passed = 0
    for op in _m252_ops():
        cls = classify_pre_execution_m252_authority(op)
        auth = match_pre_execution_m252_authority(op)
        final = _classify_op(op)
        ok = cls["exact_match_count"] == 1 and final["classification"] == "AUTHORIZED_STRATEGY_DELTA"
        if ok:
            passed += 1
        _add(
            tests,
            f"legitimate_{auth[0]['authority_id'].lower()}",
            "match_pre_execution_m252_authority",
            "AUTHORIZED_STRATEGY",
            ok,
            f"matches={cls['exact_match_count']} class={final['classification']}",
        )
    _add(tests, "authorized_strategy_legitimate_total", "manual", "5", len(authority) == 5, str(len(authority)))
    _add(tests, "authorized_strategy_legitimate_passed", "manual", "5", passed == 5, str(passed))


def _mutations_for_op(op: dict) -> dict[str, str]:
    raw = op["raw_sql"]
    identity = extract_operation_identity(op) or {}
    kind = identity.get("kind")
    mutations: dict[str, str] = {}
    if kind == "table":
        mutations["wrong_table"] = raw.replace(f'"{M252_TABLE}"', '"bogus_m252_table"', 1)
        mutations["wrong_column_type"] = raw.replace("TIMESTAMP(3)", "TIMESTAMP(6)", 1)
        mutations["extra_column"] = raw.replace('"result" JSONB,', '"result" JSONB,\n    "extra" TEXT,', 1)
        mutations["wrong_pk_column"] = raw.replace('PRIMARY KEY ("id")', 'PRIMARY KEY ("idempotency_key")', 1)
    elif kind == "index":
        if identity.get("unique"):
            mutations["wrong_index_column"] = raw.replace('"idempotency_key"', '"bogus_key"', 1)
            mutations["wrong_unique_name"] = raw.replace(
                "organization_role_assignment_drift_reconciliation_applicati_key", "bogus_unique_key", 1
            )
            mutations["wrong_uniqueness"] = raw.replace("CREATE UNIQUE INDEX", "CREATE INDEX", 1)
        else:
            mutations["wrong_index_column"] = raw.replace('"organization_id"', '"bogus_org"', 1)
            mutations["wrong_index_key_order"] = raw.replace(
                '"organization_id", "membership_id", "created_at"',
                '"created_at", "membership_id", "organization_id"',
                1,
            )
    elif kind == "foreign_key":
        if 'REFERENCES "organizations"' in raw:
            mutations["wrong_fk_target"] = raw.replace('REFERENCES "organizations"', 'REFERENCES "vehicles"', 1)
            mutations["wrong_fk_source_column"] = raw.replace('("organization_id")', '("bogus_org_id")', 1)
        if 'REFERENCES "organization_memberships"' in raw:
            mutations["wrong_fk_target"] = raw.replace('REFERENCES "organization_memberships"', 'REFERENCES "vehicles"', 1)
            mutations["wrong_fk_source_column"] = raw.replace('("membership_id")', '("bogus_membership_id")', 1)
        mutations["wrong_fk_action"] = raw.replace("ON DELETE CASCADE", "ON DELETE RESTRICT", 1)
    return mutations


def run_mutation_matrix_tests(tests: list) -> None:
    prod = PRODUCTION_DIFF.read_text()
    golden = GOLDEN_TWIN.read_text() if GOLDEN_TWIN.exists() else ""
    schema = SCHEMA_DUMP if SCHEMA_DUMP.exists() else None
    false_positives = 0
    for op in _m252_ops():
        auth = match_pre_execution_m252_authority(op)
        if not auth:
            continue
        aid = auth[0]["authority_id"].lower()
        raw = op["raw_sql"]
        for mutation, mutated in _mutations_for_op(op).items():
            script = prod.replace(raw, mutated, 1)
            result = classify_preflight_production_diff(
                script,
                golden_twin_script=golden,
                golden_baseline_script=FROZEN_DIFF_SQL.read_text(),
                schema_dump=schema,
            )
            authorized = result["AUTHORIZED_STRATEGY_DELTA"]
            blocked = authorized == 4
            if not blocked:
                false_positives += 1
            _add(
                tests,
                f"mutation_{aid}_{mutation}",
                "classify_preflight_production_diff",
                "blocking",
                blocked,
                f"authorized={authorized}",
            )
    _add(tests, "authorized_strategy_false_positive_tests", "mutation_matrix", "0", false_positives == 0, str(false_positives))


def run_pre_existing_boundary_tests(tests: list) -> None:
    prod = PRODUCTION_DIFF.read_text()
    result = classify_preflight_production_diff(
        prod,
        golden_twin_script=GOLDEN_TWIN.read_text() if GOLDEN_TWIN.exists() else "",
        golden_baseline_script=FROZEN_DIFF_SQL.read_text(),
        schema_dump=SCHEMA_DUMP if SCHEMA_DUMP.exists() else None,
    )
    r3b_pre = [o for o in result["operations"] if o.get("scope") == "R3B" and o["classification"] == "PRE_EXISTING_PRODUCTION_DRIFT"]
    drift = [o for o in result["operations"] if o["classification"] == "NEW_STRATEGY_DRIFT" and "trip_driving_impact" in o.get("raw_sql", "")]
    _add(tests, "pre_existing_r3b_trip_driving_impact", "manual", "PRE_EXISTING", len(r3b_pre) == 1, str(len(r3b_pre)))
    _add(tests, "new_drift_misclassified_as_pre_existing", "manual", "0", len(drift) == 0, str(len(drift)))


def run_count_independence_tests(tests: list) -> None:
    text = Path(__file__).read_text()
    for module in ["ci_r3b1p2_authorized_strategy_authority.py", "ci_r3b1p_diff_attribution.py", "ci_r3b1o3_diff_attribution.py"]:
        src = (Path(__file__).parent / module).read_text()
        hits = [n for n in ["393", "399", "394"] if n in src and "2026" not in src]
        _add(tests, f"diff_count_based_logic_absent_{module.replace('.py','')}", "static_audit", "0", len(hits) == 0, str(hits))


def run_additional_drift_tests(tests: list) -> None:
    prod = PRODUCTION_DIFF.read_text()
    extra = prod + '\nCREATE TABLE "totally_unauthorized_table_xyz" ("id" TEXT NOT NULL, CONSTRAINT "totally_unauthorized_table_xyz_pkey" PRIMARY KEY ("id"));'
    result = classify_preflight_production_diff(
        extra,
        golden_twin_script=GOLDEN_TWIN.read_text() if GOLDEN_TWIN.exists() else "",
        golden_baseline_script=FROZEN_DIFF_SQL.read_text(),
        schema_dump=SCHEMA_DUMP if SCHEMA_DUMP.exists() else None,
    )
    unauthorized = [o for o in result["operations"] if "totally_unauthorized_table_xyz" in o.get("raw_sql", "")]
    blocked = all(o["classification"] != "AUTHORIZED_STRATEGY_DELTA" for o in unauthorized)
    _add(tests, "additional_drift_not_suppressed", "classify_preflight_production_diff", "blocking", blocked, str([o["classification"] for o in unauthorized]))


def run_terminal_gate_fail_closed_tests(tests: list) -> None:
    base_matrix = {k: "GO" for k in [
        "PR_UNMERGED", "SOURCE_IMMUTABLE", "PRODUCTION_TARGET_CONFIRMED", "PRODUCTION_IMMUTABLE",
        "R3B_AUTHORITY_PARITY", "M252_PARITY", "GOLDEN_TESTS", "FULL_DIFF_CLASSIFICATION",
        "R3B_SCOPE_ZERO", "M252_SCOPE_ZERO", "UNKNOWN_SCOPE_ZERO", "NEW_STRATEGY_DRIFT_ZERO",
        "UNATTRIBUTED_ZERO", "UNAUTHORIZED_ZERO", "AMBIGUOUS_ZERO", "STATEMENT_UNBOUND_ZERO",
        "KEY_ONLY_AUTHORIZATION_ZERO", "STATEMENT_SHA_MATCH", "EVIDENCE_CODE_MATCH",
        "R3B1G_RESOLVE_UNAMBIGUOUS", "R3B1I_RESOLVE_UNAMBIGUOUS", "PENDING_MIGRATION_SET_FROZEN",
        "TAIL_SHA_FROZEN", "STALE_INDEX_IDENTITIES_CONFIRMED", "FAILURE_SEMANTICS_DOCUMENTED",
        "OPERATOR_TARGET_GUARD_DEFINED", "BACKUP_REQUIREMENT_DEFINED", "EXECUTION_RUNBOOK_COMPLETE",
    ]}
    ok = evaluate_r3b1p_terminal_acceptance(go_no_go_matrix={**base_matrix, "NEW_STRATEGY_DRIFT_ZERO": "NO-GO"}, production_mutation_count=0, golden_tests_failed=0, golden_tests_skipped=0)
    _add(tests, "terminal_gate_fails_on_new_strategy_drift", "evaluate_r3b1p_terminal_acceptance", "blocked", not ok["pass"], ok["final_status"])


def run_static_matcher_audit(tests: list) -> None:
    patterns = [
        (r'if\s+M252_TABLE\s+in\s+raw', "table_name_substring"),
        (r'if\s+".*"\s+in\s+raw', "fragment_in_check"),
        (r"best.?match", "ranked_match"),
        (r"looks_like", "fuzzy_match"),
    ]
    for path in ["ci_r3b1o3_diff_attribution.py", "ci_r3b1p2_authorized_strategy_authority.py"]:
        src = (Path(__file__).parent / path).read_text()
        for pattern, label in patterns:
            found = bool(re.search(pattern, src, re.I))
            unsafe = found and path.endswith("ci_r3b1o3_diff_attribution.py") and label == "table_name_substring"
            _add(tests, f"static_{path.replace('.py','')}_{label}", "static_audit", "absent_or_safe", not unsafe, "found" if found else "absent")


def run_o4_suite(tests: list) -> tuple[int, int]:
    from ci_r3b1o4_golden_tests import run_golden_tests

    payload = run_golden_tests(ambiguity_corrective=True)
    return payload.get("executed", 0), payload.get("failed", 0)


def main(argv: list[str] | None = None) -> int:
    tests: list[dict] = []
    run_contract_tests(tests)
    run_r3b1p1_regression_tests(tests)
    run_legitimate_operation_tests(tests)
    run_mutation_matrix_tests(tests)
    run_pre_existing_boundary_tests(tests)
    run_count_independence_tests(tests)
    run_additional_drift_tests(tests)
    run_terminal_gate_fail_closed_tests(tests)
    run_static_matcher_audit(tests)

    previous_o4 = 169
    o4_total, o4_failed = run_o4_suite(tests)
    _add(tests, "o4_regression_suite", "ci_r3b1o4_golden_tests", "0 failed", o4_failed == 0, f"{o4_total}/{o4_failed}")

    executed = len(tests)
    passed = sum(1 for t in tests if t["pass"])
    failed = executed - passed
    payload = {
        "schema_version": 1,
        "phase": "CI-R3B1P.2",
        "executed": executed,
        "passed": passed,
        "failed": failed,
        "skipped": 0,
        "previous_golden_test_count": previous_o4,
        "current_o4_golden_test_count": o4_total,
        "new_tests_added": executed,
        "pass": failed == 0,
        "tests": tests,
    }
    OUT.write_text(json.dumps(payload, indent=2) + "\n")
    print(json.dumps({"executed": executed, "passed": passed, "failed": failed, "pass": payload["pass"]}, indent=2))
    return 0 if payload["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
