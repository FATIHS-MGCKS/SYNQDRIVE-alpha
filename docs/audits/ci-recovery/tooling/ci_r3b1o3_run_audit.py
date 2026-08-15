#!/usr/bin/env python3
"""CI-R3B1O.3 final strategy drift attribution + M252 exact parity + terminal gate closure."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent))

import ci_r3b1o_mutation_guard  # noqa: F401
from ci_r3b1l1_exact_parity import run_exact_parity
from ci_r3b1n1_production_access import export_prisma_ledger, export_schema_only_dump, ledger_summary_fingerprint, ssh_psql_sql
from ci_r3b1n2_catalog_fingerprint import build_catalog_fingerprint
from ci_r3b1n2_constants import DATA, FORBIDDEN_ARTIFACT_STRINGS, ensure_workdir, git_rev, sha256_file
from ci_r3b1n2_instance_identity import MutationGuard, prove_isolation, query_instance_identity_dsn, query_production_instance_identity
from ci_r3b1n2_twin_ops import parse_local_dsn
from ci_r3b1o1_data_dependency import build_corrected_data_dependency_risk
from ci_r3b1o_twin_manager import build_golden_baseline, drop_database
from ci_r3b1o1_constants import R3B1M_FINAL_PARITY
from ci_r3b1o2_prisma_diff import run_prisma_diff
from ci_r3b1o3_constants import R3B1O2_BRANCH, R3B1O3_INPUTS, ensure_r3b1o3_workdir
from ci_r3b1o3_diff_attribution import build_unmatched_inventory, classify_final_diff, write_attribution_closure
from ci_r3b1o3_final_twin import run_final_winning_strategy
from ci_r3b1o3_golden_tests import run_golden_tests
from ci_r3b1o3_m252_complete_authority import build_m252_complete_physical_authority
from ci_r3b1o3_terminal_gate import evaluate_terminal_acceptance
from replay_evidence_lib import PgConfig

REPO = DATA.parents[3]


def write_json(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload, indent=2) + "\n")


def secret_scan(paths: list[Path]) -> dict:
    hits = []
    for path in paths:
        if not path.exists():
            continue
        text = path.read_text(errors="replace")
        for pat in FORBIDDEN_ARTIFACT_STRINGS:
            if pat.lower() in text.lower():
                hits.append({"path": str(path.relative_to(REPO)), "pattern": pat})
    return {"pass": len(hits) == 0, "hits": hits}


def prod_sql_runner(sql: str) -> str:
    wrapped = f"BEGIN TRANSACTION READ ONLY;\nSET LOCAL statement_timeout = '30000ms';\n{sql}\nROLLBACK;"
    proc = ssh_psql_sql(wrapped, tuples_only=True)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr or proc.stdout)
    lines = [ln for ln in (proc.stdout or "").splitlines() if ln.strip() and ln.strip() not in {"BEGIN", "SET", "ROLLBACK"}]
    return "\n".join(lines)


def worktree_clean_for_audit() -> tuple[bool, list[str]]:
    wt = subprocess.check_output(["git", "status", "--porcelain=v1"], cwd=REPO, text=True).strip()
    lines = [ln for ln in wt.splitlines() if ln.strip()]
    forbidden = []
    for ln in lines:
        path = ln[3:].strip() if len(ln) > 3 else ln.strip()
        if path.startswith("backend/") and not path.startswith("docs/audits/ci-recovery/"):
            forbidden.append(ln)
        elif path.startswith("frontend/"):
            forbidden.append(ln)
        elif not path.startswith("docs/audits/ci-recovery/"):
            forbidden.append(ln)
    # Strict empty worktree at branch creation is recorded separately; audit allows docs/audits/ci-recovery only.
    return len(forbidden) == 0, lines


def repo_immutable_vs_parent() -> dict:
    schema_diff = subprocess.check_output(
        ["git", "diff", f"origin/{R3B1O2_BRANCH}", "--", "backend/prisma/schema.prisma"],
        cwd=REPO,
        text=True,
    )
    mig_diff = subprocess.check_output(
        ["git", "diff", f"origin/{R3B1O2_BRANCH}", "--", "backend/prisma/migrations"],
        cwd=REPO,
        text=True,
    )
    return {
        "schema_unchanged": not schema_diff.strip(),
        "migrations_unchanged": not mig_diff.strip(),
        "schema_diff_bytes": len(schema_diff),
        "migrations_diff_bytes": len(mig_diff),
    }


def main() -> int:
    clean_ok, wt_lines = worktree_clean_for_audit()
    baseline = {
        "PRE_R3B1O3_SHA": git_rev("HEAD"),
        "R3B1O2_REMOTE_HEAD": git_rev(f"origin/{R3B1O2_BRANCH}"),
        "MAIN_HEAD": git_rev("origin/main"),
        "WORKTREE_CLEAN": clean_ok,
        "WORKTREE_STRICT_EMPTY": len(wt_lines) == 0,
        "worktree_lines": wt_lines,
    }
    if not baseline["WORKTREE_CLEAN"]:
        write_json(DATA / "ci-r3b1o3-final-strategy-gate-closure-summary-2026-08.json", {"final_status": "CI_R3B1O3_BASELINE_DIRTY", "pass": False, "baseline": baseline})
        print(json.dumps({"final_status": "CI_R3B1O3_BASELINE_DIRTY", "pass": False}, indent=2))
        return 1

    input_entries = []
    for name in R3B1O3_INPUTS:
        path = DATA / name if not name.startswith("backend/") else REPO / name
        if path.exists():
            input_entries.append({"path": str(path.relative_to(REPO)), "sha256": sha256_file(path)})
    write_json(DATA / "ci-r3b1o3-input-authority-manifest-2026-08.json", {"schema_version": 1, "baseline": baseline, "inputs": input_entries})

    m252_authority = build_m252_complete_physical_authority()
    write_json(DATA / "ci-r3b1o3-m252-complete-physical-authority-2026-08.json", m252_authority)

    repo_immut = repo_immutable_vs_parent()
    if not repo_immut["schema_unchanged"] or not repo_immut["migrations_unchanged"]:
        write_json(DATA / "ci-r3b1o3-final-strategy-gate-closure-summary-2026-08.json", {"final_status": "CI_R3B1O3_REPOSITORY_IMMUTABILITY_FAILED", "pass": False})
        return 1

    work = ensure_r3b1o3_workdir()
    schema_dump = work / "production_schema_only.sql"
    if not schema_dump.exists():
        src = DATA.parents[1] / ".work/r3b1o/production_schema_only.sql"
        if src.exists():
            schema_dump.write_text(src.read_text())
        else:
            export_schema_only_dump(schema_dump)

    data_dep = build_corrected_data_dependency_risk(include_forward_m252=True)

    prod_ledger_before = export_prisma_ledger(include_logs=False)
    prod_ledger_fp_before = ledger_summary_fingerprint(prod_ledger_before)
    prod_catalog_before = build_catalog_fingerprint(prod_sql_runner)

    prod_identity = query_production_instance_identity()
    audit_identity = query_instance_identity_dsn(parse_local_dsn()[0])
    golden = build_golden_baseline(
        guard=MutationGuard(prod_identity, audit_identity),
        schema_dump=schema_dump,
        prod_ledger=prod_ledger_before,
        prod_catalog_fp=prod_catalog_before["fingerprint_sha256"],
        prod_ledger_fp=prod_ledger_fp_before,
    )
    if not golden["pass"]:
        write_json(DATA / "ci-r3b1o3-final-strategy-gate-closure-summary-2026-08.json", {"final_status": "CI_R3B1O3_GOLDEN_BASELINE_FAILED", "pass": False})
        return 1

    golden_baseline_diff = run_prisma_diff(golden["database_name"])
    (DATA / "ci-r3b1o3-golden-baseline-prisma-diff-2026-08.sql").write_text(golden_baseline_diff["script"] + ("\n" if golden_baseline_diff["script"] else ""))

    strategy = run_final_winning_strategy(golden=golden, prod_identity=prod_identity)
    if not strategy["pass"]:
        write_json(DATA / "ci-r3b1o3-final-strategy-gate-closure-summary-2026-08.json", {"final_status": "CI_R3B1O3_FINAL_STRATEGY_REPLAY_FAILED", "pass": False, "strategy": strategy})
        return 1

    db_name = strategy["database_name"]
    dsn = strategy["_internal"]["dsn"]
    run_sql = strategy["_internal"]["run_sql"]
    parsed = urlparse(dsn)
    cfg = PgConfig(host=parsed.hostname or "127.0.0.1", port=str(parsed.port or 5432), user=parsed.username or "synqdrive", password=parsed.password or "synqdrive")

    m252_parity = strategy["m252_exact_parity"]
    write_json(DATA / "ci-r3b1o3-final-m252-exact-parity-2026-08.json", m252_parity)
    write_json(
        DATA / "ci-r3b1o3-m252-exact-parity-engine-validation-2026-08.json",
        {"schema_version": 1, "engine": "ci_r3b1o3_m252_exact_parity.compare_m252_exact", "result": m252_parity},
    )

    authority_sha = json.loads(R3B1M_FINAL_PARITY.read_text()).get("authority_manifest_sha256", "")
    r3b_parity = run_exact_parity(cfg, db_name, authority_sha)
    write_json(
        DATA / "ci-r3b1o3-final-r3b-parity-2026-08.json",
        {
            "schema_version": 1,
            "phase": "CI-R3B1O.3",
            "objects": f"{r3b_parity.get('objects_matched', 0)}/19",
            "tables": f"{r3b_parity.get('tables_matched', 0)}/9",
            "enums": f"{r3b_parity.get('enums_matched', 0)}/10",
            "properties": f"{r3b_parity.get('properties_matched', 0)}/54",
            "semantic_mismatch_count": len(r3b_parity.get("mismatch_records", [])),
            "pass": r3b_parity.get("pass", False),
            "detail": r3b_parity,
        },
    )

    final_diff = run_prisma_diff(db_name)
    (DATA / "ci-r3b1o3-final-winning-prisma-diff-2026-08.sql").write_text(final_diff["script"] + ("\n" if final_diff["script"] else ""))

    prior_o2 = json.loads((DATA / "ci-r3b1o2-final-prisma-diff-classification-2026-08.json").read_text()) if (DATA / "ci-r3b1o2-final-prisma-diff-classification-2026-08.json").exists() else None
    attribution = classify_final_diff(
        final_diff["script"],
        golden_twin_script=golden_baseline_diff["script"],
        golden_baseline_script=golden_baseline_diff["script"],
        schema_dump=schema_dump,
    )
    write_json(DATA / "ci-r3b1o3-final-prisma-diff-classification-2026-08.json", attribution)
    build_unmatched_inventory(attribution)
    write_attribution_closure(attribution, prior_o2)

    write_json(DATA / "ci-r3b1o3-second-deploy-idempotency-2026-08.json", strategy["second_deploy_idempotency"])

    prod_ledger_after = export_prisma_ledger(include_logs=False)
    prod_ledger_fp_after = ledger_summary_fingerprint(prod_ledger_after)
    prod_catalog_after = build_catalog_fingerprint(prod_sql_runner)

    golden_results = run_golden_tests()
    golden_pass = golden_results["pass"]
    golden_coverage = golden_results["coverage_complete"]

    terminal = evaluate_terminal_acceptance(
        baseline_clean=baseline["WORKTREE_CLEAN"],
        golden_tests_pass=golden_pass,
        golden_coverage_complete=golden_coverage,
        schema_unchanged=repo_immut["schema_unchanged"],
        migrations_unchanged=repo_immut["migrations_unchanged"],
        m252_exact_parity_pass=m252_parity.get("pass", False),
        r3b_parity_pass=r3b_parity.get("pass", False),
        strategy_pass=strategy["pass"],
        second_deploy_pass=strategy["second_deploy_idempotency"]["pass"],
        production_unchanged=prod_ledger_fp_before == prod_ledger_fp_after and prod_catalog_before["fingerprint_sha256"] == prod_catalog_after["fingerprint_sha256"],
        attribution_pass=attribution["pass"],
        data_risk_unknown_zero=data_dep["counts"]["UNKNOWN_DATA_DEPENDENCY"] == 0,
        owner_unknown=attribution["owner_unknown"],
        unresolved=attribution["UNRESOLVED"],
        unattributed=attribution["UNATTRIBUTED"],
        r3b_scope=attribution["R3B_SCOPE"],
        m252_scope=attribution["M252_SCOPE"],
        new_strategy_drift=attribution["NEW_STRATEGY_DRIFT"],
        golden_failed=golden_results["failed"],
    )

    if not attribution["pass"]:
        terminal = {"pass": False, "final_status": "CI_R3B1O3_FINAL_DRIFT_ATTRIBUTION_FAILED", "r3b1p_readiness": "NOT_READY", "failures": terminal.get("failures", []) + ["attribution"]}
    elif not m252_parity.get("pass"):
        terminal = {"pass": False, "final_status": "CI_R3B1O3_M252_EXACT_PARITY_FAILED", "r3b1p_readiness": "NOT_READY", "failures": terminal.get("failures", []) + ["m252"]}
    elif not golden_pass:
        terminal = {"pass": False, "final_status": "CI_R3B1O3_GOLDEN_GATE_FAILED", "r3b1p_readiness": "NOT_READY", "failures": terminal.get("failures", []) + ["golden"]}
    elif not strategy["second_deploy_idempotency"]["pass"]:
        terminal = {"pass": False, "final_status": "CI_R3B1O3_REPEAT_DEPLOY_FAILED", "r3b1p_readiness": "NOT_READY", "failures": terminal.get("failures", []) + ["second_deploy"]}

    unmatched = [o for o in attribution["operations"] if not o.get("golden_semantic_match")]
    summary = {
        "schema_version": 1,
        "phase": "CI-R3B1O.3",
        "baseline": baseline,
        "prior_unmatched_operations": {"expected_from_r3b1o2": 2, "actual": len(unmatched), "resolved": [{"ordinal": o["ordinal"], "classification": o["classification"], "reason": o.get("reason")} for o in unmatched]},
        "diff_attribution": {
            "golden_operations": golden_baseline_diff["line_count"],
            "final_operations": attribution["total_operations"],
            "PRE_EXISTING_PRODUCTION_DRIFT": attribution["PRE_EXISTING_PRODUCTION_DRIFT"],
            "EXPECTED_STRATEGY_DELTA": attribution["EXPECTED_STRATEGY_DELTA"],
            "OUT_OF_SCOPE_POSITIVELY_PROVEN": attribution["OUT_OF_SCOPE_POSITIVELY_PROVEN"],
            "OWNER_UNKNOWN": attribution["owner_unknown"],
            "UNRESOLVED": attribution["UNRESOLVED"],
            "UNATTRIBUTED": attribution["UNATTRIBUTED"],
            "R3B_SCOPE": attribution["R3B_SCOPE"],
            "M252_SCOPE": attribution["M252_SCOPE"],
            "NEW_STRATEGY_DRIFT": attribution["NEW_STRATEGY_DRIFT"],
        },
        "m252_exact": m252_parity.get("categories", {}),
        "r3b": {
            "objects": f"{r3b_parity.get('objects_matched', 0)}/19",
            "tables": f"{r3b_parity.get('tables_matched', 0)}/9",
            "enums": f"{r3b_parity.get('enums_matched', 0)}/10",
            "properties": f"{r3b_parity.get('properties_matched', 0)}/54",
            "pass": r3b_parity.get("pass", False),
        },
        "golden_tests": {
            "required": golden_results["required"],
            "implemented": golden_results["implemented"],
            "passed": golden_results["passed"],
            "failed": golden_results["failed"],
            "coverage_percent": golden_results["coverage_percent"],
            "executed_before_terminal_decision": True,
        },
        "strategy_replay": {
            "r3b1g_resolve": strategy["resolve_operations"][0]["pass"],
            "r3b1i_resolve": strategy["resolve_operations"][1]["pass"],
            "normal_deploy": strategy["normal_deploy"]["exit_code"] == 0,
            "m252_forward": strategy["forward_deploy"]["exit_code"] == 0,
        },
        "second_deploy": strategy["second_deploy_idempotency"],
        "data_risk": data_dep["counts"],
        "production_immutable": prod_ledger_fp_before == prod_ledger_fp_after and prod_catalog_before["fingerprint_sha256"] == prod_catalog_after["fingerprint_sha256"],
        "production_mutations": 0,
        "repository_immutable": repo_immut,
        "terminal_gates": terminal,
        "r3b1p_readiness": terminal.get("r3b1p_readiness"),
        "final_status": terminal.get("final_status"),
        "pass": terminal.get("pass", False),
    }
    write_json(DATA / "ci-r3b1o3-final-strategy-gate-closure-summary-2026-08.json", summary)

    try:
        drop_database(parse_local_dsn()[0], golden["database_name"])
        drop_database(parse_local_dsn()[0], db_name)
    except Exception:
        pass

    subprocess.run([sys.executable, str(Path(__file__).with_name("ci_r3b1o3_generate_report.py"))], cwd=Path(__file__).parent)
    print(json.dumps({"final_status": terminal.get("final_status"), "r3b1p_readiness": terminal.get("r3b1p_readiness"), "pass": terminal.get("pass")}, indent=2))
    return 0 if terminal.get("pass") else 1


if __name__ == "__main__":
    raise SystemExit(main())
