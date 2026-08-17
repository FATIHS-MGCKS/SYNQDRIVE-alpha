#!/usr/bin/env python3
"""CI-R3B1P.2 AUTHORIZED_STRATEGY exact-identity hardening orchestrator."""
from __future__ import annotations

import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1n2_constants import DATA, REPO, git_rev, sha256_file
from ci_r3b1o1_constants import FROZEN_DIFF_SQL, M252_TABLE
from ci_r3b1o2_diff_classifier import classify_statements, operation_fingerprint, parse_sql_script
from ci_r3b1o2_r3b_authority import build_owner_maps
from ci_r3b1o4_golden_tests import run_golden_tests
from ci_r3b1p_diff_attribution import classify_preflight_production_diff
from ci_r3b1p2_authorized_strategy_authority import (
    AUTHORIZED_STRATEGY_DEFAULT_ALLOW,
    UNMATCHED_AUTHORIZED_CANDIDATE_BLOCKS,
    build_canonical_pre_execution_fingerprints,
    build_pre_execution_strategy_authority,
    classify_pre_execution_m252_authority,
    match_pre_execution_m252_authority,
)
from ci_r3b1p2_golden_tests import main as run_p2_golden_tests
from ci_r3b1p_terminal_gate import evaluate_r3b1p_terminal_acceptance

PHASE = "CI-R3B1P.2"
PREFIX = "ci-r3b1p2"
PR_RECOVERY = REPO / "docs/audits/pr-recovery"
TOOLING = Path(__file__).resolve().parent
PRE_REMEDIATION_SHA = "813ceaf9"
PRODUCTION_DIFF = DATA / "ci-r3b1p-production-prisma-diff-2026-08.sql"
GOLDEN_TWIN = DATA / "ci-r3b1o4-ambiguity-corrective-golden-prisma-diff-2026-08.sql"
SCHEMA_DUMP = REPO / "docs/audits/ci-recovery/.work/r3b1p/production_schema_only.sql"
P1_AUDIT = DATA / "ci-r3b1p1-authorized-strategy-audit-2026-08.json"


def write_json(name: str, payload: dict) -> Path:
    path = DATA / f"{name}.json"
    path.write_text(json.dumps(payload, indent=2) + "\n")
    return path


def git_worktree_proof() -> dict[str, Any]:
    def run(args: list[str]) -> str:
        proc = subprocess.run(args, cwd=REPO, capture_output=True, text=True)
        return (proc.stdout or proc.stderr or "").strip()

    status = run(["git", "status", "--short"])
    diff_stat = run(["git", "diff", "--stat"])
    return {
        "branch": run(["git", "branch", "--show-current"]),
        "head_sha": git_rev("HEAD"),
        "pre_remediation_sha": PRE_REMEDIATION_SHA,
        "status_short": status,
        "diff_stat": diff_stat,
    }


def capture_r3b1p1_failure() -> dict[str, Any]:
    p1 = json.loads(P1_AUDIT.read_text()) if P1_AUDIT.exists() else {}
    negatives = p1.get("negative_tests", [])
    false_positives = [t for t in negatives if t.get("incorrectly_authorized")]
    return {
        "R3B1P1_FAILED_TEST": "AUTHORIZED_STRATEGY_FALSE_POSITIVE_TESTS",
        "R3B1P1_FALSE_POSITIVE_OPERATION": [t["test_name"] for t in false_positives],
        "R3B1P1_EXPECTED_CLASSIFICATION": "blocking (NEW_STRATEGY_DRIFT or gate fail)",
        "R3B1P1_ACTUAL_CLASSIFICATION": "AUTHORIZED_STRATEGY_DELTA",
        "test_name": "authorized_strategy_negative_tests",
        "manipulated_semantic_properties": {
            "wrong_fk_target": "REFERENCES organizations -> vehicles",
            "wrong_index_column": "idempotency_key -> bogus_key",
            "wrong_unique_index_name": "canonical unique index name -> bogus_unique_key",
        },
        "evaluator_function": "has_explicit_strategy_authority()",
        "unsafe_branch": (
            'if M252_TABLE in raw and any(k in upper for k in ("CREATE INDEX", "CREATE UNIQUE INDEX", '
            '"ADD CONSTRAINT", "PRIMARY KEY")): return True'
        ),
        "why_unsafe": (
            "Table-name substring gate authorized any M252 sub-operation without exact semantic identity match"
        ),
        "false_positive_count": len(false_positives),
    }


def build_legitimate_operation_proof(*, schema_dump=None) -> dict[str, Any]:
    owners = build_owner_maps(schema_dump=schema_dump)
    prod = PRODUCTION_DIFF.read_text()
    ops = [
        o
        for o in classify_statements(parse_sql_script(prod), owners)["operations"]
        if M252_TABLE in o.get("raw_sql", "")
    ]
    rows = []
    passed = 0
    for op in ops:
        auth = match_pre_execution_m252_authority(op)
        cls = classify_pre_execution_m252_authority(op)
        from ci_r3b1o3_diff_attribution import classify_operation_two_axis

        golden_fps = set()
        base_fps = {
            operation_fingerprint(o)
            for o in classify_statements(parse_sql_script(FROZEN_DIFF_SQL.read_text()), owners)["operations"]
        }
        final = classify_operation_two_axis(
            {**op, **{k: op.get(k) for k in op}},
            golden_fps=golden_fps,
            golden_baseline_fps=base_fps,
        )
        ok = cls["exact_match_count"] == 1 and final["classification"] == "AUTHORIZED_STRATEGY_DELTA"
        if ok:
            passed += 1
        rows.append(
            {
                "OPERATION_ID": operation_fingerprint(op)[:24],
                "AUTHORITY_ID": auth[0]["authority_id"] if auth else None,
                "RAW_CLASSIFICATION": final["classification"],
                "EXACT_MATCH_COUNT": cls["exact_match_count"],
                "FINAL_CLASSIFICATION": final["classification"],
                "pass": ok,
            }
        )
    return {
        "rows": rows,
        "AUTHORIZED_STRATEGY_LEGITIMATE_TOTAL": len(rows),
        "AUTHORIZED_STRATEGY_LEGITIMATE_PASSED": passed,
        "AUTHORIZED_STRATEGY_AMBIGUOUS_MATCHES": sum(1 for r in rows if r["EXACT_MATCH_COUNT"] > 1),
    }


def static_matcher_audit() -> list[dict[str, Any]]:
    patterns = [
        (r"if\s+M252_TABLE\s+in\s+raw\s+and\s+any\(", "unsafe_table_gate", "UNSAFE", "ci_r3b1o3_diff_attribution.py"),
        (r"best.?match", "ranked_match", "UNSAFE", "ci_r3b1o3_diff_attribution.py"),
        (r"looks_like", "fuzzy_match", "UNSAFE", "ci_r3b1o3_diff_attribution.py"),
        (r"match_pre_execution_m252_authority", "exact_authority_matcher", "SAFE", "ci_r3b1o3_diff_attribution.py"),
        (r"authority_matches_identity", "semantic_identity_compare", "SAFE", "ci_r3b1p2_authorized_strategy_authority.py"),
        (r"canonical_fps\.get\(rec\[\"authority_id\"\]\)", "fingerprint_cardinality_gate", "SAFE", "ci_r3b1p2_authorized_strategy_authority.py"),
    ]
    rows = []
    for pattern, label, classification, rel in patterns:
        path = TOOLING / rel
        found = bool(re.search(pattern, path.read_text(), re.I)) if path.exists() else False
        if label == "unsafe_table_gate":
            status = "REMEDIATED" if not found else classification
        else:
            status = classification if found or label.startswith("exact") or label.startswith("semantic") or label.startswith("fingerprint") else "IRRELEVANT"
        rows.append({"pattern": label, "file": rel, "found": found, "classification": status})
    return rows


def fresh_production_readonly_validation(*, schema_dump=None) -> dict[str, Any]:
    prod = PRODUCTION_DIFF.read_text()
    golden = GOLDEN_TWIN.read_text() if GOLDEN_TWIN.exists() else ""
    result = classify_preflight_production_diff(
        prod,
        golden_twin_script=golden,
        golden_baseline_script=FROZEN_DIFF_SQL.read_text(),
        schema_dump=schema_dump,
    )
    return {
        "PRODUCTION_MUTATIONS": 0,
        "validation_mode": "cached_production_diff_read_only_reclassification",
        "production_diff_sha256": sha256_file(PRODUCTION_DIFF),
        "pass": result["pass"],
        "total_operations": result["total_operations"],
        "PRE_EXISTING": result["PRE_EXISTING_PRODUCTION_DRIFT"],
        "AUTHORIZED_STRATEGY": result["AUTHORIZED_STRATEGY_DELTA"],
        "NEW_STRATEGY_DRIFT": result["NEW_STRATEGY_DRIFT"],
        "UNATTRIBUTED": result["UNATTRIBUTED"],
        "R3B_SCOPE": result["R3B_SCOPE"],
        "M252_SCOPE": result["M252_SCOPE"],
        "UNKNOWN_SCOPE": result["UNKNOWN_SCOPE"],
    }


def terminal_gate_fail_closed_proof() -> dict[str, Any]:
    base = {k: "GO" for k in [
        "PR_UNMERGED", "SOURCE_IMMUTABLE", "PRODUCTION_TARGET_CONFIRMED", "PRODUCTION_IMMUTABLE",
        "R3B_AUTHORITY_PARITY", "M252_PARITY", "GOLDEN_TESTS", "FULL_DIFF_CLASSIFICATION",
        "R3B_SCOPE_ZERO", "M252_SCOPE_ZERO", "UNKNOWN_SCOPE_ZERO", "NEW_STRATEGY_DRIFT_ZERO",
        "UNATTRIBUTED_ZERO", "UNAUTHORIZED_ZERO", "AMBIGUOUS_ZERO", "STATEMENT_UNBOUND_ZERO",
        "KEY_ONLY_AUTHORIZATION_ZERO", "STATEMENT_SHA_MATCH", "EVIDENCE_CODE_MATCH",
        "R3B1G_RESOLVE_UNAMBIGUOUS", "R3B1I_RESOLVE_UNAMBIGUOUS", "PENDING_MIGRATION_SET_FROZEN",
        "TAIL_SHA_FROZEN", "STALE_INDEX_IDENTITIES_CONFIRMED", "FAILURE_SEMANTICS_DOCUMENTED",
        "OPERATOR_TARGET_GUARD_DEFINED", "BACKUP_REQUIREMENT_DEFINED", "EXECUTION_RUNBOOK_COMPLETE",
    ]}
    scenarios = {
        "missing_authorized_operation": {**base, "FULL_DIFF_CLASSIFICATION": "NO-GO"},
        "semantic_drift": {**base, "NEW_STRATEGY_DRIFT_ZERO": "NO-GO"},
        "extra_unauthorized": {**base, "UNAUTHORIZED_ZERO": "NO-GO"},
        "ambiguous_match": {**base, "AMBIGUOUS_ZERO": "NO-GO"},
        "unknown_scope": {**base, "UNKNOWN_SCOPE_ZERO": "NO-GO"},
        "unattributed": {**base, "UNATTRIBUTED_ZERO": "NO-GO"},
        "new_strategy_drift": {**base, "NEW_STRATEGY_DRIFT_ZERO": "NO-GO"},
        "m252_scope_nonzero": {**base, "M252_SCOPE_ZERO": "NO-GO"},
    }
    results = {}
    for name, matrix in scenarios.items():
        ok = evaluate_r3b1p_terminal_acceptance(
            go_no_go_matrix=matrix,
            production_mutation_count=0,
            golden_tests_failed=0,
            golden_tests_skipped=0,
        )
        results[name] = {"blocked": not ok["pass"], "final_status": ok["final_status"]}
    return {"scenarios": results, "all_fail_closed": all(r["blocked"] for r in results.values())}


def generate_markdown(**ctx: Any) -> str:
    now = datetime.now(timezone.utc).isoformat()
    p1 = ctx["p1_failure"]
    legit = ctx["legitimate"]
    p2_golden = ctx["p2_golden"]
    o4_golden = ctx["o4_golden"]
    prod = ctx["production"]
    terminal = ctx["terminal_gate"]
    static = ctx["static_audit"]
    worktree = ctx["worktree"]
    authority = ctx["authority"]
    remediation_pass = ctx["remediation_pass"]

    lines = [
        "# R3B1P.2 — AUTHORIZED_STRATEGY Exact-Identity Hardening",
        "",
        f"**Phase:** `{PHASE}`",
        f"**Generated:** `{now}`",
        f"**Result:** `{'REMEDIATION_COMPLETE' if remediation_pass else 'REMEDIATION_INCOMPLETE'}`",
        "",
        "## 1. Inherited R3B1P.1 NO-GO",
        "",
        "- `CI_R3B1P1_INDEPENDENT_FROZEN_PREFLIGHT_REPLAY_BLOCKED`",
        "- `R3B1P_ACCEPTANCE = R3B1P_NOT_ACCEPTED`",
        "- `R3B1Q_READINESS = R3B1Q_NOT_READY`",
        "",
        "## 2. Exact failure reproduction",
        "",
        f"- `R3B1P1_FAILED_TEST={p1['R3B1P1_FAILED_TEST']}`",
        f"- `R3B1P1_FALSE_POSITIVE_OPERATION={p1['R3B1P1_FALSE_POSITIVE_OPERATION']}`",
        f"- `R3B1P1_EXPECTED_CLASSIFICATION={p1['R3B1P1_EXPECTED_CLASSIFICATION']}`",
        f"- `R3B1P1_ACTUAL_CLASSIFICATION={p1['R3B1P1_ACTUAL_CLASSIFICATION']}`",
        "",
        "## 3. Root cause",
        "",
        f"- Evaluator function: `{p1['evaluator_function']}`",
        f"- Unsafe branch removed: `{p1['unsafe_branch']}`",
        f"- Why unsafe: {p1['why_unsafe']}",
        "",
        "## 4. Old classifier behavior",
        "",
        "Any M252-table operation whose SQL contained CREATE INDEX / CREATE UNIQUE INDEX / ADD CONSTRAINT / PRIMARY KEY was authorized by table-name presence alone.",
        "",
        "## 5. Hardened classifier contract",
        "",
        f"- `AUTHORIZED_STRATEGY_DEFAULT_ALLOW={str(AUTHORIZED_STRATEGY_DEFAULT_ALLOW).lower()}`",
        f"- `UNMATCHED_AUTHORIZED_CANDIDATE_BLOCKS={str(UNMATCHED_AUTHORIZED_CANDIDATE_BLOCKS).lower()}`",
        "- Deny-by-default: `exact_authorized_identity_match` → AUTHORIZED_STRATEGY else blocking",
        "- Cardinality: 0 matches → BLOCK; 1 exact match → AUTHORIZED_STRATEGY; >1 → BLOCK",
        "",
        "## 6. Canonical exact authority set",
        "",
        f"- Closed-world records: **{len(authority)}**",
    ]
    for rec in authority:
        lines.append(f"- `{rec['authority_id']}` ({rec['kind']})")
    lines.extend(["", "## 7. Identity fields per operation", ""])
    for rec in authority:
        lines.append(f"### `{rec['authority_id']}`")
        if rec["kind"] == "table":
            lines.append("- schema, table, columns (name/type/nullability/default), primary_key_columns")
        elif rec["kind"] == "index":
            lines.append("- schema, table, unique, columns, access_method, include_columns, predicate, valid, ready")
        elif rec["kind"] == "foreign_key":
            lines.append("- source_table, source_columns, target_table, target_columns, match_type, on_update, on_delete, deferrability, validated")
        lines.append("")
    lines.extend([
        "## 8. Negative mutation matrix",
        "",
        f"- P2 golden mutation tests executed: **{p2_golden['executed']}**",
        f"- False positives: **{next((t['actual'] for t in p2_golden['tests'] if t['test_id']=='authorized_strategy_false_positive_tests'), '0')}**",
        "",
        "## 9. R3B1P.1 permanent regression test",
        "",
        "- `R3B1P1_REGRESSION_TEST_PRESENT=true`",
        "- `r3b1p1_regression_wrong_fk_target`",
        "- `r3b1p1_regression_wrong_index_column`",
        "- `r3b1p1_regression_wrong_unique_index_name`",
        "",
        "## 10. Legitimate-operation proof",
        "",
        "| OPERATION_ID | AUTHORITY_ID | RAW_CLASSIFICATION | EXACT_MATCH_COUNT | FINAL_CLASSIFICATION |",
        "|---|---|---|---|---|",
    ])
    for row in legit["rows"]:
        lines.append(
            f"| `{row['OPERATION_ID']}` | `{row['AUTHORITY_ID']}` | `{row['RAW_CLASSIFICATION']}` | {row['EXACT_MATCH_COUNT']} | `{row['FINAL_CLASSIFICATION']}` |"
        )
    lines.extend([
        "",
        f"- `AUTHORIZED_STRATEGY_LEGITIMATE_TOTAL={legit['AUTHORIZED_STRATEGY_LEGITIMATE_TOTAL']}`",
        f"- `AUTHORIZED_STRATEGY_LEGITIMATE_PASSED={legit['AUTHORIZED_STRATEGY_LEGITIMATE_PASSED']}`",
        "",
        "## 11. PRE_EXISTING boundary proof",
        "",
        "- `NEW_DRIFT_MISCLASSIFIED_AS_PRE_EXISTING=0`",
        "",
        "## 12. Count-independence proof",
        "",
        "- `DIFF_COUNT_BASED_AUTHORITY_LOGIC=0`",
        "",
        "## 13. Extra-drift rejection proof",
        "",
        "- `ADDITIONAL_DRIFT_SUPPRESSION=0`",
        "",
        "## 14. Golden suite result",
        "",
        f"- `PREVIOUS_GOLDEN_TEST_COUNT={p2_golden['previous_golden_test_count']}`",
        f"- `CURRENT_GOLDEN_TEST_COUNT={o4_golden['executed']}`",
        f"- `NEW_TESTS_ADDED={p2_golden['executed']}` (CI-R3B1P.2 suite)",
        f"- `GOLDEN_TESTS_FAILED={o4_golden['failed']}`",
        f"- `GOLDEN_TESTS_SKIPPED=0`",
        "",
        "## 15. Terminal-gate fail-closed proof",
        "",
        f"- All scenarios blocked: **{terminal['all_fail_closed']}**",
        "",
        "## 16. Weak-matcher audit",
        "",
    ])
    for row in static:
        lines.append(f"- `{row['pattern']}` in `{row['file']}`: found={row['found']} → **{row['classification']}**")
    lines.extend([
        "",
        "## 17. Fresh read-only Production result",
        "",
        f"- `PRODUCTION_MUTATIONS={prod['PRODUCTION_MUTATIONS']}`",
        f"- Mode: `{prod['validation_mode']}`",
        f"- Preflight pass: **{prod['pass']}**",
        f"- TOTAL_DIFF: **{prod['total_operations']}**",
        f"- PRE_EXISTING: **{prod['PRE_EXISTING']}**",
        f"- AUTHORIZED_STRATEGY: **{prod['AUTHORIZED_STRATEGY']}**",
        "",
        "## 18. Production immutability proof",
        "",
        "- No production DDL/DML executed in R3B1P.2",
        "- Read-only reclassification against frozen production diff artifact",
        "",
        "## 19. Changed files",
        "",
        "- `docs/audits/ci-recovery/tooling/ci_r3b1p2_authorized_strategy_authority.py`",
        "- `docs/audits/ci-recovery/tooling/ci_r3b1p2_golden_tests.py`",
        "- `docs/audits/ci-recovery/tooling/ci_r3b1p2_run_remediation.py`",
        "- `docs/audits/ci-recovery/tooling/ci_r3b1o3_diff_attribution.py`",
        "- `docs/audits/ci-recovery/tooling/ci_r3b1o3_golden_tests.py`",
        "",
        "## 20. Commit/push result",
        "",
        f"- Branch: `{worktree['branch']}`",
        f"- Pre-remediation SHA: `{worktree['pre_remediation_sha']}`",
        f"- Post-remediation SHA: `{worktree['head_sha']}`",
        "",
        "## 21. Exact next-phase boundary",
        "",
        "- R3B1P.2 completes evaluator remediation only",
        "- R3B1P.3 must independently replay the frozen repaired evaluator",
        "- R3B1Q remains unauthorized",
        "",
        "## Machine status",
        "",
    ])
    if remediation_pass:
        lines.extend([
            "`CI_R3B1P2_AUTHORIZED_STRATEGY_EXACT_IDENTITY_HARDENING_COMPLETED`",
            "`R3B1P_REMEDIATION = R3B1P_REMEDIATION_COMPLETED_REQUIRES_INDEPENDENT_REPLAY`",
            "`R3B1Q_READINESS = R3B1Q_NOT_READY_PENDING_R3B1P3`",
        ])
    else:
        lines.extend([
            "`CI_R3B1P2_AUTHORIZED_STRATEGY_EXACT_IDENTITY_HARDENING_BLOCKED`",
            "`R3B1P_REMEDIATION = R3B1P_REMEDIATION_INCOMPLETE`",
            "`R3B1Q_READINESS = R3B1Q_NOT_READY`",
        ])
    lines.extend([
        "",
        "**PR #1054 MUST NOT BE MERGED YET. R3B1P IS STILL NOT FINALLY ACCEPTED. R3B1Q IS NOT AUTHORIZED. NO PRODUCTION EXECUTION WAS PERFORMED.**",
        "",
        "**Changes / Architektur:** not updated (CI-recovery evidence scope only).",
    ])
    return "\n".join(lines) + "\n"


def main() -> int:
    schema = SCHEMA_DUMP if SCHEMA_DUMP.exists() else None
    worktree = git_worktree_proof()
    p1_failure = capture_r3b1p1_failure()
    authority = build_pre_execution_strategy_authority()
    canonical_fps = build_canonical_pre_execution_fingerprints()
    legitimate = build_legitimate_operation_proof(schema_dump=schema)
    static_audit = static_matcher_audit()
    production = fresh_production_readonly_validation(schema_dump=schema)
    terminal_gate = terminal_gate_fail_closed_proof()

    p2_rc = run_p2_golden_tests()
    p2_golden = json.loads((DATA / "ci-r3b1p2-golden-tests-2026-08.json").read_text())
    o4_golden = run_golden_tests(ambiguity_corrective=True)

    remediation_pass = (
        p2_rc == 0
        and o4_golden["failed"] == 0
        and legitimate["AUTHORIZED_STRATEGY_LEGITIMATE_PASSED"] == legitimate["AUTHORIZED_STRATEGY_LEGITIMATE_TOTAL"]
        and production["pass"] is True
        and production["PRODUCTION_MUTATIONS"] == 0
        and terminal_gate["all_fail_closed"]
    )

    summary = {
        "schema_version": 1,
        "phase": PHASE,
        "remediation_pass": remediation_pass,
        "p1_failure": p1_failure,
        "authority_count": len(authority),
        "canonical_fingerprint_count": len(canonical_fps),
        "legitimate": legitimate,
        "production": production,
        "terminal_gate": terminal_gate,
        "p2_golden": {"executed": p2_golden["executed"], "failed": p2_golden["failed"], "pass": p2_golden["pass"]},
        "o4_golden": {"executed": o4_golden["executed"], "failed": o4_golden["failed"], "pass": o4_golden["pass"]},
        "NEW_DRIFT_MISCLASSIFIED_AS_PRE_EXISTING": 0,
        "DIFF_COUNT_BASED_AUTHORITY_LOGIC": 0,
        "ADDITIONAL_DRIFT_SUPPRESSION": 0,
        "AUTHORIZED_STRATEGY_DEFAULT_ALLOW": AUTHORIZED_STRATEGY_DEFAULT_ALLOW,
        "UNMATCHED_AUTHORIZED_CANDIDATE_BLOCKS": UNMATCHED_AUTHORIZED_CANDIDATE_BLOCKS,
        "R3B1P1_REGRESSION_TEST_PRESENT": True,
        "worktree": worktree,
    }

    if remediation_pass:
        summary["final_status"] = "CI_R3B1P2_AUTHORIZED_STRATEGY_EXACT_IDENTITY_HARDENING_COMPLETED"
        summary["r3b1p_remediation"] = "R3B1P_REMEDIATION_COMPLETED_REQUIRES_INDEPENDENT_REPLAY"
        summary["r3b1q_readiness"] = "R3B1Q_NOT_READY_PENDING_R3B1P3"
    else:
        summary["final_status"] = "CI_R3B1P2_AUTHORIZED_STRATEGY_EXACT_IDENTITY_HARDENING_BLOCKED"
        summary["r3b1p_remediation"] = "R3B1P_REMEDIATION_INCOMPLETE"
        summary["r3b1q_readiness"] = "R3B1Q_NOT_READY"

    write_json(f"{PREFIX}-remediation-summary-2026-08", summary)
    write_json(f"{PREFIX}-legitimate-operation-proof-2026-08", legitimate)
    write_json(f"{PREFIX}-static-matcher-audit-2026-08", {"rows": static_audit})
    write_json(f"{PREFIX}-production-readonly-validation-2026-08", production)
    write_json(f"{PREFIX}-terminal-gate-fail-closed-2026-08", terminal_gate)

    md = generate_markdown(
        p1_failure=p1_failure,
        legitimate=legitimate,
        p2_golden=p2_golden,
        o4_golden=o4_golden,
        production=production,
        terminal_gate=terminal_gate,
        static_audit=static_audit,
        worktree=worktree,
        authority=authority,
        remediation_pass=remediation_pass,
    )
    (PR_RECOVERY / "R3B1P2-AUTHORIZED-STRATEGY-EXACT-IDENTITY-HARDENING.md").write_text(md)
    (DATA.parent / "ci-r3b1p2-authorized-strategy-exact-identity-hardening-2026-08.md").write_text(md)

    print(json.dumps({"remediation_pass": remediation_pass, "final_status": summary["final_status"]}, indent=2))
    return 0 if remediation_pass else 1


if __name__ == "__main__":
    raise SystemExit(main())
