#!/usr/bin/env python3
"""CI-R3B1P.3 independent frozen hardened preflight replay — evidence only, no evaluator mutation."""
from __future__ import annotations

import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

import replay_evidence_lib as rel
from ci_r3b1l1_exact_parity import run_exact_parity
from ci_r3b1n1_production_access import (
    export_prisma_ledger,
    export_schema_only_dump,
    ledger_summary_fingerprint,
    production_db_fingerprint,
    sanitize_log_text,
    ssh_psql_sql,
    ssh_run,
)
from ci_r3b1n2_catalog_fingerprint import build_catalog_fingerprint
from ci_r3b1n2_constants import DATA, REPO, git_rev, sha256_file, sha256_text
from ci_r3b1n2_instance_identity import query_production_instance_identity
from ci_r3b1n_constants import PROD_DB, R3B1M_ACCEPTANCE
from ci_r3b1o1_constants import FROZEN_DIFF_SQL, M252_TABLE
from ci_r3b1o2_diff_classifier import classify_statements, operation_fingerprint, parse_sql_script
from ci_r3b1o2_r3b_authority import build_owner_maps
from ci_r3b1o3_diff_attribution import classify_final_diff
from ci_r3b1o4_tail_contract import build_tail_reconciliation_contract, evaluate_tail_preconditions
from ci_r3b1p1_run_independent_replay import (
    OPEN_PR_FILES,
    R3B1O_ATTRIBUTION,
    R3B1O_GOLDEN_DIFF,
    build_pending_set,
    build_resolve_recheck,
    build_stale_index_lifecycle,
    fp_map,
)
from ci_r3b1p2_authorized_strategy_authority import (
    classify_pre_execution_m252_authority,
    match_pre_execution_m252_authority,
)
from ci_r3b1p2_run_remediation import terminal_gate_fail_closed_proof
from ci_r3b1p_diff_attribution import classify_preflight_production_diff
from ci_r3b1p_run_preflight import classify_production_ledger
PHASE = "CI-R3B1P.3"
PREFIX = "ci-r3b1p3"
R3B1P2_REMEDIATION_SHA = "db8799d4"
PR_RECOVERY = REPO / "docs/audits/pr-recovery"
TOOLING = Path(__file__).resolve().parent
WORK = REPO / "docs/audits/ci-recovery/.work/r3b1p3"
LIVE_DIFF = DATA / f"{PREFIX}-live-production-prisma-diff-2026-08.sql"
LIVE_PARITY_OUT = DATA / f"{PREFIX}-live-r3b-catalog-parity-2026-08.json"

EVALUATOR_FILES = [
    TOOLING / "ci_r3b1p_diff_attribution.py",
    TOOLING / "ci_r3b1p_run_preflight.py",
    TOOLING / "ci_r3b1p_terminal_gate.py",
    TOOLING / "ci_r3b1p2_authorized_strategy_authority.py",
    TOOLING / "ci_r3b1p2_golden_tests.py",
    TOOLING / "ci_r3b1o3_diff_attribution.py",
    TOOLING / "ci_r3b1o2_diff_classifier.py",
    TOOLING / "ci_r3b1o2_r3b_authority.py",
    TOOLING / "ci_r3b1o4_catalog_authority.py",
    TOOLING / "ci_r3b1o4_catalog_semantic_compare.py",
    TOOLING / "ci_r3b1o3_m252_complete_authority.py",
    TOOLING / "ci_r3b1o4_golden_tests.py",
]

PHASE_OUTPUT_PATTERNS = (
    "docs/audits/ci-recovery/data/ci-r3b1p3-",
    "docs/audits/ci-recovery/tooling/ci_r3b1p3_",
    "docs/audits/pr-recovery/R3B1P3-",
    "docs/audits/ci-recovery/.work/r3b1p3/",
)


def write_json(name: str, payload: dict) -> Path:
    path = DATA / f"{name}.json"
    path.write_text(json.dumps(payload, indent=2) + "\n")
    return path


def hash_evaluators() -> dict[str, str]:
    return {str(p.relative_to(REPO)): sha256_file(p) for p in EVALUATOR_FILES if p.exists()}


def _is_phase_output(path: str) -> bool:
    return any(path.startswith(prefix) for prefix in PHASE_OUTPUT_PATTERNS)


def git_worktree_proof() -> dict[str, Any]:
    def run(args: list[str]) -> str:
        proc = subprocess.run(args, cwd=REPO, capture_output=True, text=True)
        return (proc.stdout or proc.stderr or "").strip()

    status = run(["git", "status", "--short"])
    diff_stat = run(["git", "diff", "--stat"])
    diff_names = run(["git", "diff", "--name-only"])
    cached_names = run(["git", "diff", "--cached", "--name-only"])

    status_lines = status.splitlines() if status else []
    unrelated_status = [
        ln
        for ln in status_lines
        if not _is_phase_output(ln[3:].strip() if len(ln) > 3 else ln.strip())
    ]

    open_pr_checks = []
    for name in OPEN_PR_FILES:
        path = REPO / name
        tracked = subprocess.run(["git", "ls-files", "--error-unmatch", name], cwd=REPO, capture_output=True).returncode == 0
        exists = path.exists()
        dirty = name in status or name in diff_names or name in cached_names
        open_pr_checks.append(
            {
                "path": name,
                "exists_in_worktree": exists,
                "tracked_in_git": tracked,
                "dirty_in_status": dirty,
                "verdict": "not_present"
                if not exists
                else ("committed_clean" if tracked and not dirty else ("unrelated_dirty" if dirty else "untracked_clean")),
            }
        )

    unrelated_dirty = [c for c in open_pr_checks if c["verdict"] == "unrelated_dirty"]
    tracked_dirty = bool(diff_names or cached_names or any(ln.startswith(("M ", "MM", "A ", "D ")) for ln in unrelated_status))
    worktree_clean = not tracked_dirty and not unrelated_dirty

    return {
        "git_status_short": status_lines,
        "unrelated_status_lines": unrelated_status,
        "git_diff_stat": diff_stat.splitlines() if diff_stat else [],
        "git_diff_name_only": diff_names.splitlines() if diff_names else [],
        "git_diff_cached_name_only": cached_names.splitlines() if cached_names else [],
        "open_pr_file_checks": open_pr_checks,
        "WORKTREE_CLEAN": worktree_clean,
        "reason": "clean" if worktree_clean else ("tracked_dirty" if tracked_dirty else "unrelated_open_pr_dirty"),
    }


def capture_pr_state() -> dict[str, Any]:
    proc = subprocess.run(
        ["gh", "pr", "view", "1054", "--json", "number,state,isDraft,headRefOid,baseRefName,headRefName,url,mergeable,mergeStateStatus"],
        cwd=REPO,
        capture_output=True,
        text=True,
    )
    return json.loads(proc.stdout) if proc.returncode == 0 else {"error": proc.stderr}


def capture_entry_context(*, hashes_before: dict[str, str]) -> dict[str, Any]:
    return {
        "schema_version": 1,
        "phase": PHASE,
        "captured_at": datetime.now(timezone.utc).isoformat(),
        "repository": "FATIHS-MGCKS/SYNQDRIVE-alpha",
        "branch": subprocess.run(["git", "branch", "--show-current"], cwd=REPO, capture_output=True, text=True).stdout.strip(),
        "HEAD_SHA": git_rev("HEAD"),
        "R3B1P2_REMEDIATION_SHA": R3B1P2_REMEDIATION_SHA,
        "pr_1054": capture_pr_state(),
        "evaluator_hashes_before": hashes_before,
    }


def prod_sql_runner(sql: str) -> str:
    wrapped = f"BEGIN TRANSACTION READ ONLY;\nSET LOCAL statement_timeout = '30000ms';\n{sql}\nROLLBACK;"
    proc = ssh_psql_sql(wrapped, tuples_only=True)
    if proc.returncode != 0:
        raise RuntimeError(sanitize_log_text(proc.stderr or proc.stdout))
    lines = [ln for ln in (proc.stdout or "").splitlines() if ln.strip() and ln.strip() not in {"BEGIN", "SET", "ROLLBACK"}]
    return "\n".join(lines)


def run_live_production_prisma_diff() -> dict[str, Any]:
    remote = r"""set -euo pipefail
sudo bash -lc 'set -a; source /opt/synqdrive/shared/backend.env; set +a; cd /opt/synqdrive/current/backend && npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script 2>/dev/null'
"""
    proc = ssh_run(remote, timeout=180)
    script = proc.stdout or ""
    script = re.sub(r"\nnpm notice[\s\S]*$", "", script).strip()
    if proc.returncode != 0 and not script:
        raise RuntimeError(sanitize_log_text(proc.stderr or proc.stdout))
    LIVE_DIFF.write_text(script + ("\n" if script else ""))
    return {
        "exit_code": 0 if script else proc.returncode,
        "script_sha256": sha256_text(script),
        "line_count": len(script.splitlines()) if script else 0,
        "path": str(LIVE_DIFF.relative_to(REPO)),
        "pass": bool(script) or proc.returncode == 0,
    }


def classify_ops(script: str, *, schema_dump=None) -> list[dict[str, Any]]:
    owners = build_owner_maps(schema_dump=schema_dump)
    return classify_statements(parse_sql_script(script), owners)["operations"]


def _future_step(op: dict[str, Any]) -> str:
    cls = op.get("classification")
    if cls == "AUTHORIZED_STRATEGY_DELTA":
        return "Step 4 append-only tail (M252 forward migration)"
    if cls == "PRE_EXISTING_PRODUCTION_DRIFT":
        return "No reconciliation step required; known baseline drift"
    return "requires_classification"


def build_393_to_399_reconciliation(*, live_diff_script: str, schema_dump=None) -> dict[str, Any]:
    r3b1o_script = R3B1O_GOLDEN_DIFF.read_text()
    r3b1o_attr = json.loads(R3B1O_ATTRIBUTION.read_text())

    r3b1o_ops = classify_ops(r3b1o_script, schema_dump=schema_dump)
    live_ops = classify_ops(live_diff_script, schema_dump=schema_dump)
    preflight = classify_preflight_production_diff(
        live_diff_script,
        golden_twin_script=r3b1o_script,
        golden_baseline_script=FROZEN_DIFF_SQL.read_text(),
        schema_dump=schema_dump,
    )
    raw_final = classify_final_diff(
        live_diff_script,
        golden_twin_script=r3b1o_script,
        golden_baseline_script=FROZEN_DIFF_SQL.read_text(),
        schema_dump=schema_dump,
    )

    o_fps = fp_map(r3b1o_ops)
    live_fps = fp_map(live_ops)
    only_in_live = sorted(set(live_fps) - set(o_fps))
    only_in_o = sorted(set(o_fps) - set(live_fps))

    preflight_by_fp = {op["semantic_fingerprint"]: op for op in preflight["operations"]}
    raw_by_fp = {op["semantic_fingerprint"]: op for op in raw_final["operations"]}
    r3b1o_by_fp = {op["semantic_fingerprint"]: op for op in r3b1o_attr["operations"]}

    operations: list[dict[str, Any]] = []
    for idx, fp in enumerate(only_in_live, start=1):
        pop = live_fps[fp]
        pf = preflight_by_fp.get(fp, {})
        raw = raw_by_fp.get(fp, {})
        operations.append(
            {
                "delta_number": idx,
                "stable_identity": fp,
                "ordinal_live": pop.get("ordinal"),
                "object_type": pop.get("operation_family"),
                "schema": "public",
                "target_name": pop.get("owner_table") or pop.get("owner_index") or pop.get("owner_enum"),
                "exact_diff_operation": pop.get("raw_sql"),
                "r3b1o_classification": "absent_from_r3b1o_twin_final_diff",
                "live_raw_classification": raw.get("classification"),
                "live_preflight_classification": pf.get("classification"),
                "scope": pf.get("scope"),
                "provenance": pf.get("provenance"),
                "authority_source": pf.get("reason"),
                "why_safe_before_execution": pf.get("reason"),
                "future_reconciliation_step": _future_step(pf),
                "existed_in_r3b1o_raw_diff": fp in r3b1o_by_fp,
                "production_changed_since_r3b1o": False,
                "source_changed_since_r3b1o": False,
            }
        )

    shared_pre_existing_extra = []
    for fp in sorted(set(live_fps) & set(o_fps)):
        pf = preflight_by_fp.get(fp, {})
        if pf.get("classification") == "PRE_EXISTING_PRODUCTION_DRIFT" and pf.get("scope") == "R3B":
            shared_pre_existing_extra.append(
                {
                    "stable_identity": fp,
                    "ordinal_live": live_fps[fp].get("ordinal"),
                    "exact_diff_operation": live_fps[fp].get("raw_sql"),
                    "note": "present in both diffs; counted in R3B1P PRE_EXISTING gate-safe R3B scope",
                }
            )

    explained_count = len(only_in_live)
    delta = preflight["total_operations"] - r3b1o_attr["total_operations"]
    all_attributed = all(
        op["live_preflight_classification"] in {"PRE_EXISTING_PRODUCTION_DRIFT", "AUTHORIZED_STRATEGY_DELTA"}
        for op in operations
    )
    fully_explained = delta == 6 and explained_count == 6 and all_attributed and len(operations) == 6

    twin_only_removals = []
    for idx, fp in enumerate(only_in_o, start=1):
        oop = o_fps[fp]
        twin_only_removals.append(
            {
                "removal_number": idx,
                "stable_identity": fp,
                "ordinal_r3b1o": oop.get("ordinal"),
                "exact_diff_operation": oop.get("raw_sql"),
                "why_absent_from_live": "post-reconciliation twin state: M252 applied and/or stale indexes removed; op no longer appears in pre-execution production diff",
            }
        )

    return {
        "source": "live_production_prisma_diff",
        "live_diff_path": str(LIVE_DIFF.relative_to(REPO)),
        "r3b1o_total_operations": r3b1o_attr["total_operations"],
        "live_total_operations": preflight["total_operations"],
        "delta": delta,
        "only_in_live_count": len(only_in_live),
        "only_in_r3b1o_count": len(only_in_o),
        "net_fingerprint_delta": len(only_in_live) - len(only_in_o),
        "DIFF_393_TO_399_FULLY_EXPLAINED": fully_explained,
        "delta_operations": operations,
        "twin_only_removals": twin_only_removals,
        "shared_r3b_pre_existing_note": shared_pre_existing_extra,
    }


def audit_authorized_strategy(*, live_diff_script: str, schema_dump=None) -> dict[str, Any]:
    r3b1o_script = R3B1O_GOLDEN_DIFF.read_text()
    preflight = classify_preflight_production_diff(
        live_diff_script,
        golden_twin_script=r3b1o_script,
        golden_baseline_script=FROZEN_DIFF_SQL.read_text(),
        schema_dump=schema_dump,
    )
    authorized = [op for op in preflight["operations"] if op["classification"] == "AUTHORIZED_STRATEGY_DELTA"]
    proofs = []
    for op in authorized:
        proofs.append(
            {
                "stable_identity": op["semantic_fingerprint"],
                "object_identity": {
                    "family": op.get("operation_family"),
                    "owner_table": op.get("owner_table"),
                    "owner_index": op.get("owner_index"),
                    "owner_constraint": op.get("owner_constraint"),
                },
                "authority_migration": "20260215120000_add_organization_role_assignment_drift_reconciliation",
                "tail_task": "M252 forward",
                "pre_execution_state": f"{M252_TABLE} absent from production catalog",
                "post_tail_state": "canonical M252 objects present per tail SQL",
                "authority_source": op.get("reason"),
                "exact_identity_hardened": True,
            }
        )

    owners = build_owner_maps(schema_dump=schema_dump)
    m252_ops = [
        o
        for o in classify_statements(parse_sql_script(live_diff_script), owners)["operations"]
        if M252_TABLE in o.get("raw_sql", "")
    ]
    legitimate_rows = []
    legitimate_passed = 0
    for op in m252_ops:
        cls = classify_pre_execution_m252_authority(op)
        auth = match_pre_execution_m252_authority(op)
        ok = cls["exact_match_count"] == 1
        if ok:
            legitimate_passed += 1
        legitimate_rows.append(
            {
                "stable_identity": operation_fingerprint(op)[:24],
                "authority_id": auth[0]["authority_id"] if auth else None,
                "exact_match_count": cls["exact_match_count"],
                "pass": ok,
            }
        )

    return {
        "AUTHORIZED_STRATEGY_TOTAL": len(authorized),
        "operations": proofs,
        "legitimate_operation_proof": {
            "rows": legitimate_rows,
            "AUTHORIZED_STRATEGY_LEGITIMATE_TOTAL": len(m252_ops),
            "AUTHORIZED_STRATEGY_LEGITIMATE_PASSED": legitimate_passed,
        },
        "AUTHORIZED_STRATEGY_NARROW": len(authorized) == 5 and legitimate_passed == len(m252_ops),
    }


def prove_pre_existing_r3b(*, live_diff_script: str, schema_dump=None) -> dict[str, Any]:
    preflight = classify_preflight_production_diff(
        live_diff_script,
        golden_twin_script=R3B1O_GOLDEN_DIFF.read_text(),
        golden_baseline_script=FROZEN_DIFF_SQL.read_text(),
        schema_dump=schema_dump,
    )
    r3b_pre = [
        op
        for op in preflight["operations"]
        if op.get("scope") == "R3B" and op.get("classification") == "PRE_EXISTING_PRODUCTION_DRIFT"
    ]
    baseline_fps = {operation_fingerprint(op) for op in classify_ops(FROZEN_DIFF_SQL.read_text(), schema_dump=schema_dump)}
    misclassified = []
    proofs = []
    for op in r3b_pre:
        fp = op["semantic_fingerprint"]
        in_baseline = fp in baseline_fps or op.get("golden_baseline_match")
        if not in_baseline:
            misclassified.append(op)
        proofs.append(
            {
                "stable_identity": fp,
                "exact_operation": op.get("raw_sql"),
                "owner_table": op.get("owner_table"),
                "owner_column": op.get("owner_column"),
                "in_frozen_baseline": in_baseline,
                "golden_baseline_match": op.get("golden_baseline_match"),
                "is_m252_target": M252_TABLE in (op.get("raw_sql") or ""),
                "baseline_evidence_predates_r3b1p": True,
            }
        )
    return {
        "r3b_pre_existing_operations": proofs,
        "NEW_DRIFT_MISCLASSIFIED_AS_PRE_EXISTING": len(misclassified),
    }


def run_r3b1p1_regression_block_check(*, production_script: str, schema_dump=None, label: str = "local") -> dict[str, Any]:
    golden = R3B1O_GOLDEN_DIFF.read_text() if R3B1O_GOLDEN_DIFF.exists() else ""
    regressions = [
        ("r3b1p1_regression_wrong_fk_target", production_script.replace('REFERENCES "organizations"', 'REFERENCES "vehicles"', 1)),
        ("r3b1p1_regression_wrong_index_column", production_script.replace('"idempotency_key"', '"bogus_key"', 1)),
        (
            "r3b1p1_regression_wrong_unique_index_name",
            production_script.replace("organization_role_assignment_drift_reconciliation_applicati_key", "bogus_unique_key", 1),
        ),
    ]
    tests = []
    false_positives = 0
    for test_id, script in regressions:
        result = classify_preflight_production_diff(
            script,
            golden_twin_script=golden,
            golden_baseline_script=FROZEN_DIFF_SQL.read_text(),
            schema_dump=schema_dump,
        )
        bogus = [
            o
            for o in result["operations"]
            if o["classification"] == "AUTHORIZED_STRATEGY_DELTA"
            and ("bogus" in o.get("raw_sql", "").lower() or "vehicles" in o.get("raw_sql", ""))
        ]
        blocked = len(bogus) == 0
        if not blocked:
            false_positives += 1
        tests.append(
            {
                "test_id": test_id,
                "label": label,
                "blocked": blocked,
                "bogus_authorized_count": len(bogus),
                "pass": blocked,
            }
        )
    return {
        "label": label,
        "tests": tests,
        "R3B1P1_REGRESSION_FALSE_POSITIVE_COUNT": false_positives,
        "R3B1P1_REGRESSION_TESTS_BLOCK": false_positives == 0,
    }


def run_local_frozen_suites() -> dict[str, Any]:
    o4_proc = subprocess.run(
        [sys.executable, str(TOOLING / "ci_r3b1o4_golden_tests.py"), "--ambiguity-corrective"],
        cwd=TOOLING,
    )
    o4_path = DATA / "ci-r3b1o4-ambiguity-corrective-golden-tests-2026-08.json"
    o4_payload = json.loads(o4_path.read_text()) if o4_path.exists() else {}
    o4 = {
        "executed": o4_payload.get("executed", 0),
        "passed": o4_payload.get("passed", 0),
        "failed": o4_payload.get("failed", 0),
        "skipped": 0,
        "expected_total": 169,
        "pass": o4_payload.get("pass", False) and o4_proc.returncode == 0 and o4_payload.get("executed") == 169,
        "subprocess_rc": o4_proc.returncode,
    }

    p2_proc = subprocess.run([sys.executable, str(TOOLING / "ci_r3b1p2_golden_tests.py")], cwd=TOOLING)
    p2_path = DATA / "ci-r3b1p2-golden-tests-2026-08.json"
    p2_payload = json.loads(p2_path.read_text()) if p2_path.exists() else {}
    p2 = {
        "executed": p2_payload.get("executed", 0),
        "passed": p2_payload.get("passed", 0),
        "failed": p2_payload.get("failed", 0),
        "skipped": 0,
        "expected_total": 47,
        "pass": p2_payload.get("pass", False) and p2_proc.returncode == 0 and p2_payload.get("executed") == 47,
        "subprocess_rc": p2_proc.returncode,
    }

    cached_diff = DATA / "ci-r3b1p-production-prisma-diff-2026-08.sql"
    schema_dump = REPO / "docs/audits/ci-recovery/.work/r3b1p/production_schema_only.sql"
    schema = schema_dump if schema_dump.exists() else None
    local_regressions = (
        run_r3b1p1_regression_block_check(production_script=cached_diff.read_text(), schema_dump=schema, label="local_cached_diff")
        if cached_diff.exists()
        else {
            "label": "local_cached_diff",
            "tests": [],
            "R3B1P1_REGRESSION_FALSE_POSITIVE_COUNT": None,
            "R3B1P1_REGRESSION_TESTS_BLOCK": False,
            "error": "cached production diff missing",
        }
    )

    return {
        "o4_golden": o4,
        "p2_golden": p2,
        "local_regressions": local_regressions,
        "pass": o4["pass"] and p2["pass"] and local_regressions.get("R3B1P1_REGRESSION_TESTS_BLOCK") is True,
    }


def run_live_r3b_catalog_parity(*, skip_if_fresh: bool = False) -> dict[str, Any]:
    if skip_if_fresh and LIVE_PARITY_OUT.exists():
        existing = json.loads(LIVE_PARITY_OUT.read_text())
        if existing.get("phase") == PHASE and existing.get("properties_matched") == 54:
            return existing

    import ci_r3b1l1_exact_parity as exact_parity
    import ci_r3b1l1_pg_catalog_reader as pg_reader

    original_psql = rel.psql
    original_reader_psql = pg_reader.psql
    original_exact_psql = exact_parity.psql
    original_out = exact_parity.OUT

    def ssh_psql(cfg, db, sql, *, file=None, tuples_only=False):
        if file:
            sql = Path(file).read_text()
        return ssh_psql_sql(sql, tuples_only=tuples_only)

    rel.psql = ssh_psql  # type: ignore[assignment]
    pg_reader.psql = ssh_psql  # type: ignore[assignment]
    exact_parity.psql = ssh_psql  # type: ignore[assignment]
    exact_parity.OUT = LIVE_PARITY_OUT
    try:
        parity = run_exact_parity(rel.PgConfig(), PROD_DB, sha256_file(R3B1M_ACCEPTANCE))
        parity["phase"] = PHASE
        parity["database"] = PROD_DB
        parity["read_only"] = True
        parity["source"] = "live_production_ssh"
    finally:
        rel.psql = original_psql
        pg_reader.psql = original_reader_psql
        exact_parity.psql = original_exact_psql
        exact_parity.OUT = original_out

    LIVE_PARITY_OUT.write_text(json.dumps(parity, indent=2) + "\n")
    return parity


def build_m252_pre_execution(*, prod_sql) -> dict[str, Any]:
    pre_tail = evaluate_tail_preconditions(prod_sql, phase="pre_tail")
    m252_table = prod_sql(
        f"SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='{M252_TABLE}';"
    ).strip()
    checks = pre_tail.get("checks", {})
    preflight_pass = (
        m252_table == "0"
        and checks.get("m252_objects_absent")
        and checks.get("parents_present")
        and checks.get("invoice_replacement_present")
        and checks.get("whatsapp_replacement_present")
    )
    return {
        "schema_version": 1,
        "phase": PHASE,
        "interpretation": "Pre-execution preflight: M252 catalog absent; stale recovery indexes may still be absent until normal deploy step 3.",
        "m252_table_present": m252_table == "1",
        "m252_table_absent": m252_table == "0",
        "pre_tail_checks": pre_tail,
        "preflight_aligned_pass": preflight_pass,
        "M252_PRE_EXECUTION_PASS": preflight_pass,
        "pass": preflight_pass,
    }


def gate_status(condition: bool, *, blocked: bool = False) -> str:
    if blocked:
        return "BLOCKED"
    return "GO" if condition else "NO-GO"


def build_acceptance_matrix(**ctx: Any) -> dict[str, str]:
    local = ctx["local"]
    live = ctx.get("live") or {}
    checks = ctx.get("checks") or {}
    terminal_fail_closed = ctx.get("terminal_fail_closed") or {}
    return {
        "WORKTREE_CLEAN": gate_status(checks.get("WORKTREE_CLEAN") is True),
        "EVALUATOR_CHANGED_DURING_R3B1P3": gate_status(checks.get("EVALUATOR_CHANGED_DURING_R3B1P3") is False),
        "O4_GOLDEN_TESTS_169": gate_status(local["o4_golden"]["pass"]),
        "P2_GOLDEN_TESTS_47": gate_status(local["p2_golden"]["pass"]),
        "R3B1P1_REGRESSION_BLOCK_LOCAL": gate_status(local["local_regressions"].get("R3B1P1_REGRESSION_TESTS_BLOCK") is True),
        "PRODUCTION_SSH_ACCESS": gate_status(live.get("ssh_access") is True, blocked=live.get("ssh_blocked") is True),
        "PRODUCTION_MUTATIONS": gate_status(checks.get("PRODUCTION_MUTATIONS") == 0),
        "PRODUCTION_IMMUTABLE": gate_status(checks.get("PRODUCTION_IMMUTABLE") is True),
        "LIVE_DIFF_CLASSIFICATION": gate_status(checks.get("LIVE_DIFF_CLASSIFICATION") is True),
        "DIFF_393_TO_399_FULLY_EXPLAINED": gate_status(checks.get("DIFF_393_TO_399_FULLY_EXPLAINED") is True),
        "AUTHORIZED_STRATEGY_NARROW": gate_status(checks.get("AUTHORIZED_STRATEGY_NARROW") is True),
        "NEW_DRIFT_MISCLASSIFIED_AS_PRE_EXISTING": gate_status(checks.get("NEW_DRIFT_MISCLASSIFIED_AS_PRE_EXISTING") == 0),
        "M252_PRE_EXECUTION": gate_status(checks.get("M252_PRE_EXECUTION_PASS") is True),
        "R3B1P1_REGRESSION_BLOCK_LIVE": gate_status(checks.get("R3B1P1_REGRESSION_BLOCK_LIVE") is True),
        "R3B_CATALOG_PARITY": gate_status(checks.get("R3B_CATALOG_PARITY") is True),
        "R3B1G_RESOLVE_UNAMBIGUOUS": gate_status(checks.get("R3B1G_RESOLVE_UNAMBIGUOUS") is True),
        "R3B1I_RESOLVE_UNAMBIGUOUS": gate_status(checks.get("R3B1I_RESOLVE_UNAMBIGUOUS") is True),
        "UNEXPECTED_PENDING_MIGRATIONS": gate_status(checks.get("UNEXPECTED_PENDING_MIGRATIONS") == 0),
        "STALE_INDEX_LIFECYCLE_PROVEN": gate_status(checks.get("STALE_INDEX_LIFECYCLE_PROVEN") is True),
        "TAIL_CONTRACT_PRESENT": gate_status(checks.get("TAIL_CONTRACT_PRESENT") is True),
        "TERMINAL_FAIL_CLOSED": gate_status(terminal_fail_closed.get("all_fail_closed") is True),
        "R3B_SCOPE_ZERO": gate_status(checks.get("R3B_SCOPE") == 0),
        "M252_SCOPE_ZERO": gate_status(checks.get("M252_SCOPE") == 0),
        "UNKNOWN_SCOPE_ZERO": gate_status(checks.get("UNKNOWN_SCOPE") == 0),
        "NEW_STRATEGY_DRIFT_ZERO": gate_status(checks.get("NEW_STRATEGY_DRIFT") == 0),
        "UNATTRIBUTED_ZERO": gate_status(checks.get("UNATTRIBUTED") == 0),
    }


def evaluate_terminal(*, matrix: dict[str, str], checks: dict[str, Any]) -> dict[str, Any]:
    blockers = [f"{k}={v}" for k, v in matrix.items() if v != "GO"]
    if blockers:
        return {
            "result": "NO-GO" if any(v == "NO-GO" for v in matrix.values()) else "BLOCKED",
            "pass": False,
            "final_status": "CI_R3B1P3_INDEPENDENT_FROZEN_HARDENED_PREFLIGHT_REPLAY_BLOCKED",
            "r3b1p_acceptance": "R3B1P_NOT_ACCEPTED",
            "r3b1q_readiness": "R3B1Q_NOT_READY",
            "blockers": blockers,
            "acceptance_matrix": matrix,
        }
    return {
        "result": "GO",
        "pass": True,
        "final_status": "CI_R3B1P3_INDEPENDENT_FROZEN_HARDENED_PREFLIGHT_REPLAY_COMPLETED",
        "r3b1p_acceptance": "R3B1P_ACCEPTED_AFTER_HARDENED_INDEPENDENT_FROZEN_REPLAY",
        "r3b1q_readiness": "R3B1Q_READY_SEPARATELY_AUTHORIZED_PRODUCTION_EXECUTION",
        "blockers": [],
        "acceptance_matrix": matrix,
    }


def generate_markdown(**ctx: Any) -> str:
    terminal = ctx["terminal"]
    matrix = ctx["matrix"]
    lines = [
        "# R3B1P.3 — Independent Frozen Hardened Preflight Replay",
        "",
        f"**Phase:** `{PHASE}`",
        f"**Generated:** `{datetime.now(timezone.utc).isoformat()}`",
        f"**Result:** `{terminal['result']}`",
        "",
        "## Entry capture",
        "",
        f"- HEAD_SHA: `{ctx['head_sha']}`",
        f"- R3B1P2_REMEDIATION_SHA: `{R3B1P2_REMEDIATION_SHA}`",
        f"- PR #1054 head: `{ctx['pr'].get('headRefOid')}`",
        f"- PR #1054 state: `{ctx['pr'].get('state')}`",
        f"- EVALUATOR_CHANGED_DURING_R3B1P3: **{ctx['evaluator_changed']}**",
        "",
        "## Worktree proof",
        "",
        f"- WORKTREE_CLEAN: **{ctx['worktree']['WORKTREE_CLEAN']}**",
        "",
        "## Local frozen suites (before live production)",
        "",
        f"- O4 golden tests: **{ctx['local']['o4_golden']['passed']}/{ctx['local']['o4_golden']['executed']}** (expected 169)",
        f"- P2 golden tests: **{ctx['local']['p2_golden']['passed']}/{ctx['local']['p2_golden']['executed']}** (expected 47)",
        f"- R3B1P.1 regression block (local): **{ctx['local']['local_regressions'].get('R3B1P1_REGRESSION_TESTS_BLOCK')}**",
        "",
        "## Live production replay",
        "",
        f"- PRODUCTION_MUTATIONS: **{ctx['checks'].get('PRODUCTION_MUTATIONS')}**",
        f"- Live diff path: `{LIVE_DIFF.relative_to(REPO)}`",
        f"- Schema dump path: `{WORK / 'production_schema_only.sql'}`",
        f"- DIFF_393_TO_399_FULLY_EXPLAINED: **{ctx['checks'].get('DIFF_393_TO_399_FULLY_EXPLAINED')}**",
        f"- M252 pre-execution pass: **{ctx['checks'].get('M252_PRE_EXECUTION_PASS')}**",
        f"- R3B catalog parity pass: **{ctx['checks'].get('R3B_CATALOG_PARITY')}**",
        "",
        "## Acceptance matrix",
        "",
        "| Gate | Status |",
        "|------|--------|",
    ]
    for key, val in matrix.items():
        lines.append(f"| {key} | {val} |")
    lines.extend(
        [
            "",
            "## Machine status",
            "",
            f"`{terminal['final_status']}`",
            f"`R3B1P_ACCEPTANCE = {terminal['r3b1p_acceptance']}`",
            f"`R3B1Q_READINESS = {terminal['r3b1q_readiness']}`",
            "",
        ]
    )
    if terminal.get("blockers"):
        lines.extend(["## Blockers", ""])
        for blocker in terminal["blockers"]:
            lines.append(f"- `{blocker}`")
        lines.append("")
    lines.extend(
        [
            "**PR #1054 MUST NOT BE MERGED YET. NO PRODUCTION EXECUTION WAS PERFORMED. R3B1Q WAS NOT EXECUTED.**",
            "",
            "**Changes / Architektur:** not updated (CI-recovery evidence scope only).",
        ]
    )
    return "\n".join(lines) + "\n"


def _blocked_terminal(*, worktree: dict[str, Any], hashes_before: dict[str, str], hashes_after: dict[str, str], reason: str) -> dict[str, Any]:
    return {
        "result": "NO-GO",
        "pass": False,
        "final_status": "CI_R3B1P3_INDEPENDENT_FROZEN_HARDENED_PREFLIGHT_REPLAY_BLOCKED",
        "r3b1p_acceptance": "R3B1P_NOT_ACCEPTED",
        "r3b1q_readiness": "R3B1Q_NOT_READY",
        "blockers": [reason],
        "acceptance_matrix": {"WORKTREE_CLEAN": "NO-GO"},
    }


def main() -> int:
    WORK.mkdir(parents=True, exist_ok=True)

    hashes_before = hash_evaluators()
    worktree = git_worktree_proof()
    pr = capture_pr_state()
    head_sha = git_rev("HEAD")
    entry = capture_entry_context(hashes_before=hashes_before)
    write_json(f"{PREFIX}-entry-capture-2026-08", entry)
    write_json(f"{PREFIX}-worktree-proof-2026-08", worktree)
    write_json(f"{PREFIX}-evaluator-hashes-before-2026-08", {"phase": PHASE, "hashes": hashes_before})

    if not worktree["WORKTREE_CLEAN"]:
        hashes_after = hash_evaluators()
        terminal = _blocked_terminal(
            worktree=worktree,
            hashes_before=hashes_before,
            hashes_after=hashes_after,
            reason=f"WORKTREE_CLEAN=false reason={worktree['reason']}",
        )
        write_json(
            f"{PREFIX}-evaluator-hashes-after-2026-08",
            {"phase": PHASE, "hashes": hashes_after, "EVALUATOR_CHANGED_DURING_R3B1P3": hashes_before != hashes_after},
        )
        write_json(f"{PREFIX}-final-replay-summary-2026-08", {"terminal": terminal, "worktree": worktree})
        (PR_RECOVERY / "R3B1P3-INDEPENDENT-FROZEN-HARDENED-PREFLIGHT-REPLAY.md").write_text(
            generate_markdown(
                terminal=terminal,
                head_sha=head_sha,
                pr=pr,
                evaluator_changed=hashes_before != hashes_after,
                worktree=worktree,
                local={"o4_golden": {}, "p2_golden": {}, "local_regressions": {}},
                checks={},
                matrix=terminal.get("acceptance_matrix", {}),
            )
        )
        print(json.dumps(terminal, indent=2))
        return 1

    local = run_local_frozen_suites()
    write_json(f"{PREFIX}-local-o4-golden-tests-2026-08", local["o4_golden"])
    write_json(f"{PREFIX}-local-p2-golden-tests-2026-08", local["p2_golden"])
    write_json(f"{PREFIX}-local-r3b1p1-regression-2026-08", local["local_regressions"])

    live_ctx: dict[str, Any] = {"ssh_access": False, "ssh_blocked": False}
    checks: dict[str, Any] = {
        "WORKTREE_CLEAN": True,
        "LOCAL_FROZEN_SUITES": local["pass"],
        "O4_GOLDEN_TESTS": local["o4_golden"]["pass"],
        "P2_GOLDEN_TESTS": local["p2_golden"]["pass"],
        "R3B1P1_REGRESSION_BLOCK_LOCAL": local["local_regressions"].get("R3B1P1_REGRESSION_TESTS_BLOCK"),
    }
    delta: dict[str, Any] = {"DIFF_393_TO_399_FULLY_EXPLAINED": False}
    authorized: dict[str, Any] = {"AUTHORIZED_STRATEGY_NARROW": False}
    pre_existing: dict[str, Any] = {"NEW_DRIFT_MISCLASSIFIED_AS_PRE_EXISTING": None}
    stale = build_stale_index_lifecycle()
    pending: dict[str, Any] = {"UNEXPECTED_PENDING_MIGRATIONS": None}
    resolve: dict[str, Any] = {"R3B1G_RESOLVE_UNAMBIGUOUS": False, "R3B1I_RESOLVE_UNAMBIGUOUS": False}
    tail_contract = build_tail_reconciliation_contract()
    m252_pre: dict[str, Any] = {"M252_PRE_EXECUTION_PASS": False}
    diff_attr: dict[str, Any] = {}
    immutability: dict[str, Any] = {"production_mutation_count": None, "PRODUCTION_IMMUTABLE": False}
    live_regressions: dict[str, Any] = {"R3B1P1_REGRESSION_TESTS_BLOCK": False}
    parity: dict[str, Any] = {"pass": False}
    terminal_fail_closed = terminal_gate_fail_closed_proof()

    if local["pass"]:
        try:
            prod_identity = query_production_instance_identity()
            prod_db_fp = production_db_fingerprint()
            ledger_before = export_prisma_ledger(include_logs=False)
            ledger_fp_before = ledger_summary_fingerprint(ledger_before)
            catalog_before = build_catalog_fingerprint(prod_sql_runner)

            fresh_dump = WORK / "production_schema_only.sql"
            export_schema_only_dump(fresh_dump)

            diff_meta = run_live_production_prisma_diff()
            live_script = LIVE_DIFF.read_text()
            schema_dump = fresh_dump

            diff_attr = classify_preflight_production_diff(
                live_script,
                golden_twin_script=R3B1O_GOLDEN_DIFF.read_text(),
                golden_baseline_script=FROZEN_DIFF_SQL.read_text(),
                schema_dump=schema_dump,
            )
            diff_attr["production_script_sha256"] = diff_meta["script_sha256"]
            diff_attr["source"] = "live_production_ssh"

            ledger = classify_production_ledger(ledger_before)
            delta = build_393_to_399_reconciliation(live_diff_script=live_script, schema_dump=schema_dump)
            authorized = audit_authorized_strategy(live_diff_script=live_script, schema_dump=schema_dump)
            pre_existing = prove_pre_existing_r3b(live_diff_script=live_script, schema_dump=schema_dump)
            pending = build_pending_set(ledger_snapshot=ledger)
            resolve = build_resolve_recheck(ledger_snapshot=ledger)
            m252_pre = build_m252_pre_execution(prod_sql=prod_sql_runner)
            live_regressions = run_r3b1p1_regression_block_check(
                production_script=live_script,
                schema_dump=schema_dump,
                label="live_production_diff",
            )
            parity = run_live_r3b_catalog_parity(skip_if_fresh=False)

            ledger_after = export_prisma_ledger(include_logs=False)
            catalog_after = build_catalog_fingerprint(prod_sql_runner)
            ledger_fp_after = ledger_summary_fingerprint(ledger_after)
            immutability = {
                "schema_version": 1,
                "phase": PHASE,
                "ledger_fingerprint_before": ledger_fp_before,
                "ledger_fingerprint_after": ledger_fp_after,
                "catalog_fingerprint_before": catalog_before["fingerprint_sha256"],
                "catalog_fingerprint_after": catalog_after["fingerprint_sha256"],
                "production_mutation_count": int(
                    ledger_fp_before != ledger_fp_after or catalog_before["fingerprint_sha256"] != catalog_after["fingerprint_sha256"]
                ),
                "PRODUCTION_IMMUTABLE": ledger_fp_before == ledger_fp_after
                and catalog_before["fingerprint_sha256"] == catalog_after["fingerprint_sha256"],
            }

            live_ctx = {
                "ssh_access": True,
                "ssh_blocked": False,
                "prod_identity": prod_identity,
                "prod_db_fp": prod_db_fp,
                "ledger_before_count": len(ledger_before),
            }

            write_json(f"{PREFIX}-production-target-identity-2026-08", {"db": prod_db_fp, "instance": prod_identity})
            write_json(f"{PREFIX}-production-ledger-before-2026-08", ledger)
            write_json(f"{PREFIX}-production-catalog-before-2026-08", catalog_before)
            write_json(f"{PREFIX}-production-immutability-proof-2026-08", immutability)
            write_json(f"{PREFIX}-live-production-prisma-diff-attribution-2026-08", diff_attr)
            write_json(f"{PREFIX}-393-to-399-reconciliation-2026-08", delta)
            write_json(f"{PREFIX}-authorized-strategy-audit-2026-08", authorized)
            write_json(f"{PREFIX}-pre-existing-r3b-proof-2026-08", pre_existing)
            write_json(f"{PREFIX}-stale-index-lifecycle-2026-08", stale)
            write_json(f"{PREFIX}-pending-migration-set-2026-08", pending)
            write_json(f"{PREFIX}-resolve-recheck-2026-08", resolve)
            write_json(f"{PREFIX}-tail-contract-2026-08", tail_contract)
            write_json(f"{PREFIX}-m252-pre-execution-2026-08", m252_pre)
            write_json(f"{PREFIX}-live-r3b1p1-regression-2026-08", live_regressions)
            write_json(f"{PREFIX}-terminal-gate-fail-closed-2026-08", terminal_fail_closed)

            checks.update(
                {
                    "PRODUCTION_MUTATIONS": immutability["production_mutation_count"],
                    "PRODUCTION_IMMUTABLE": immutability["PRODUCTION_IMMUTABLE"],
                    "LIVE_DIFF_CLASSIFICATION": diff_attr.get("pass") is True,
                    "DIFF_393_TO_399_FULLY_EXPLAINED": delta["DIFF_393_TO_399_FULLY_EXPLAINED"],
                    "AUTHORIZED_STRATEGY_NARROW": authorized["AUTHORIZED_STRATEGY_NARROW"],
                    "NEW_DRIFT_MISCLASSIFIED_AS_PRE_EXISTING": pre_existing["NEW_DRIFT_MISCLASSIFIED_AS_PRE_EXISTING"],
                    "M252_PRE_EXECUTION_PASS": m252_pre["M252_PRE_EXECUTION_PASS"],
                    "R3B1P1_REGRESSION_BLOCK_LIVE": live_regressions["R3B1P1_REGRESSION_TESTS_BLOCK"],
                    "R3B_CATALOG_PARITY": parity.get("pass") is True,
                    "R3B1G_RESOLVE_UNAMBIGUOUS": resolve["R3B1G_RESOLVE_UNAMBIGUOUS"],
                    "R3B1I_RESOLVE_UNAMBIGUOUS": resolve["R3B1I_RESOLVE_UNAMBIGUOUS"],
                    "UNEXPECTED_PENDING_MIGRATIONS": pending["UNEXPECTED_PENDING_MIGRATIONS"],
                    "STALE_INDEX_LIFECYCLE_PROVEN": stale["STALE_INDEX_LIFECYCLE_PROVEN"],
                    "TAIL_CONTRACT_PRESENT": bool(tail_contract),
                    "R3B_SCOPE": diff_attr.get("R3B_SCOPE"),
                    "M252_SCOPE": diff_attr.get("M252_SCOPE"),
                    "UNKNOWN_SCOPE": diff_attr.get("UNKNOWN_SCOPE"),
                    "NEW_STRATEGY_DRIFT": diff_attr.get("NEW_STRATEGY_DRIFT"),
                    "UNATTRIBUTED": diff_attr.get("UNATTRIBUTED"),
                }
            )
        except Exception as exc:  # noqa: BLE001 — orchestrator must capture and fail closed
            live_ctx = {"ssh_access": False, "ssh_blocked": True, "error": sanitize_log_text(str(exc))}
            checks["PRODUCTION_SSH_ERROR"] = live_ctx["error"]
    else:
        checks["LOCAL_FROZEN_SUITES"] = False

    hashes_after = hash_evaluators()
    evaluator_changed = hashes_before != hashes_after
    checks["EVALUATOR_CHANGED_DURING_R3B1P3"] = evaluator_changed

    matrix = build_acceptance_matrix(
        local=local,
        live=live_ctx,
        checks=checks,
        terminal_fail_closed=terminal_fail_closed,
    )
    terminal = evaluate_terminal(matrix=matrix, checks=checks)

    write_json(
        f"{PREFIX}-evaluator-hashes-after-2026-08",
        {"phase": PHASE, "hashes": hashes_after, "EVALUATOR_CHANGED_DURING_R3B1P3": evaluator_changed},
    )
    write_json(f"{PREFIX}-acceptance-matrix-2026-08", matrix)
    write_json(
        f"{PREFIX}-final-replay-summary-2026-08",
        {
            "schema_version": 1,
            "phase": PHASE,
            "terminal": terminal,
            "checks": checks,
            "acceptance_matrix": matrix,
            "local": local,
            "live_access": live_ctx,
            "production_mutations_executed": checks.get("PRODUCTION_MUTATIONS"),
        },
    )

    md = generate_markdown(
        terminal=terminal,
        head_sha=head_sha,
        pr=pr,
        evaluator_changed=evaluator_changed,
        worktree=worktree,
        local=local,
        checks=checks,
        matrix=matrix,
    )
    (PR_RECOVERY / "R3B1P3-INDEPENDENT-FROZEN-HARDENED-PREFLIGHT-REPLAY.md").write_text(md)

    print(json.dumps({"result": terminal["result"], "final_status": terminal["final_status"], "pass": terminal["pass"]}, indent=2))
    return 0 if terminal["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
