#!/usr/bin/env python3
"""CI-R3B1O.3 corrective rerun — two-axis attribution + hardened gates."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent))

import ci_r3b1o_mutation_guard  # noqa: F401
from ci_r3b1l1_exact_parity import run_exact_parity
from ci_r3b1n1_production_access import export_prisma_ledger, ledger_summary_fingerprint, ssh_psql_sql
from ci_r3b1n2_catalog_fingerprint import build_catalog_fingerprint
from ci_r3b1n2_constants import DATA, git_rev, sha256_file
from ci_r3b1n2_instance_identity import MutationGuard, query_instance_identity_dsn, query_production_instance_identity
from ci_r3b1n2_twin_ops import parse_local_dsn
from ci_r3b1o1_data_dependency import build_corrected_data_dependency_risk
from ci_r3b1o_twin_manager import build_golden_baseline, drop_database
from ci_r3b1o1_constants import R3B1M_FINAL_PARITY
from ci_r3b1o2_prisma_diff import run_prisma_diff
from ci_r3b1o3_constants import R3B1O2_BRANCH, ensure_r3b1o3_workdir
from ci_r3b1o3_diff_attribution import classify_final_diff, write_corrective_attribution
from ci_r3b1o3_final_twin import run_final_winning_strategy
from ci_r3b1o3_golden_tests import run_golden_tests
from ci_r3b1o3_index_provenance import build_index_repository_trace, build_two_index_provenance
from ci_r3b1o3_m252_complete_authority import build_m252_complete_physical_authority
from ci_r3b1o3_terminal_gate import evaluate_terminal_acceptance
from replay_evidence_lib import PgConfig

REPO = DATA.parents[3]


def write_json(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload, indent=2) + "\n")


def prod_sql_runner(sql: str) -> str:
    wrapped = f"BEGIN TRANSACTION READ ONLY;\nSET LOCAL statement_timeout = '30000ms';\n{sql}\nROLLBACK;"
    proc = ssh_psql_sql(wrapped, tuples_only=True)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr or proc.stdout)
    lines = [ln for ln in (proc.stdout or "").splitlines() if ln.strip() and ln.strip() not in {"BEGIN", "SET", "ROLLBACK"}]
    return "\n".join(lines)


def strict_worktree_empty() -> tuple[bool, str]:
    wt = subprocess.check_output(["git", "status", "--porcelain"], cwd=REPO, text=True)
    return wt.strip() == "", wt.strip()


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
        "pass": not schema_diff.strip() and not mig_diff.strip(),
    }


def main() -> int:
    strict_empty, wt_text = strict_worktree_empty()
    baseline = {
        "CORRECTIVE_WORKTREE_STRICT_EMPTY": strict_empty,
        "PRE_CORRECTIVE_SHA": git_rev("HEAD"),
        "R3B1O2_REMOTE_HEAD": git_rev(f"origin/{R3B1O2_BRANCH}"),
        "MAIN_HEAD": git_rev("origin/main"),
    }
    if not strict_empty:
        write_json(
            DATA / "ci-r3b1o3-corrective-final-acceptance-summary-2026-08.json",
            {"final_status": "CI_R3B1O3_BASELINE_NOT_CLEAN", "pass": False, "baseline": baseline, "worktree": wt_text},
        )
        print(json.dumps({"final_status": "CI_R3B1O3_BASELINE_NOT_CLEAN", "pass": False}, indent=2))
        return 1

    write_json(
        DATA / "ci-r3b1o3-corrective-input-manifest-2026-08.json",
        {"schema_version": 1, "phase": "CI-R3B1O.3-corrective", "baseline": baseline},
    )
    write_json(DATA / "ci-r3b1o3-m252-complete-physical-authority-2026-08.json", build_m252_complete_physical_authority())
    write_json(DATA / "ci-r3b1o3-corrective-two-index-provenance-2026-08.json", build_index_repository_trace())

    repo_immut = repo_immutable_vs_parent()
    work = ensure_r3b1o3_workdir()
    schema_dump = work / "production_schema_only.sql"
    if not schema_dump.exists():
        schema_dump.write_text((DATA.parents[1] / ".work/r3b1o/production_schema_only.sql").read_text())

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
        write_json(DATA / "ci-r3b1o3-corrective-final-acceptance-summary-2026-08.json", {"final_status": "CI_R3B1O3_FINAL_STRATEGY_REPLAY_FAILED", "pass": False})
        return 1

    golden_baseline_diff = run_prisma_diff(golden["database_name"])
    (DATA / "ci-r3b1o3-corrective-golden-prisma-diff-2026-08.sql").write_text(golden_baseline_diff["script"] + ("\n" if golden_baseline_diff["script"] else ""))

    strategy = run_final_winning_strategy(golden=golden, prod_identity=prod_identity)
    write_json(DATA / "ci-r3b1o3-corrective-index-timeline-2026-08.json", {"schema_version": 1, "timeline": strategy.get("index_timeline", {})})

    db_name = strategy["database_name"]
    dsn = strategy["_internal"]["dsn"]
    run_sql = strategy["_internal"]["run_sql"]
    parsed = urlparse(dsn)
    cfg = PgConfig(host=parsed.hostname or "127.0.0.1", port=str(parsed.port or 5432), user=parsed.username or "synqdrive", password=parsed.password or "synqdrive")

    golden_run = subprocess.run([sys.executable, str(Path(__file__).with_name("ci_r3b1o3_golden_tests.py"))], cwd=Path(__file__).parent)
    golden_results = json.loads((DATA / "ci-r3b1o3-corrective-golden-tests-2026-08.json").read_text())

    m252_parity = strategy["m252_exact_parity"]
    write_json(DATA / "ci-r3b1o3-corrective-final-m252-exact-parity-2026-08.json", m252_parity)
    write_json(DATA / "ci-r3b1o3-corrective-m252-engine-validation-2026-08.json", {"schema_version": 1, "engine": "ci_r3b1o3_m252_exact_parity", "result": m252_parity})

    authority_sha = json.loads(R3B1M_FINAL_PARITY.read_text()).get("authority_manifest_sha256", "")
    r3b_parity = run_exact_parity(cfg, db_name, authority_sha)
    write_json(
        DATA / "ci-r3b1o3-corrective-final-r3b-parity-2026-08.json",
        {
            "objects": f"{r3b_parity.get('objects_matched', 0)}/19",
            "tables": f"{r3b_parity.get('tables_matched', 0)}/9",
            "enums": f"{r3b_parity.get('enums_matched', 0)}/10",
            "properties": f"{r3b_parity.get('properties_matched', 0)}/54",
            "pass": r3b_parity.get("pass", False),
            "detail": r3b_parity,
        },
    )

    final_diff = run_prisma_diff(db_name)
    (DATA / "ci-r3b1o3-corrective-final-prisma-diff-2026-08.sql").write_text(final_diff["script"] + ("\n" if final_diff["script"] else ""))
    attribution = classify_final_diff(
        final_diff["script"],
        golden_twin_script=golden_baseline_diff["script"],
        golden_baseline_script=golden_baseline_diff["script"],
        schema_dump=schema_dump,
    )
    write_corrective_attribution(attribution)

    from ci_r3b1o_twin_manager import twin_sql_runner_factory

    golden_run_sql = twin_sql_runner_factory(golden["dsn"])
    two_index = build_two_index_provenance(
        golden_run_sql=golden_run_sql,
        final_run_sql=run_sql,
        timeline=strategy.get("index_timeline", {}),
        attribution_ops=attribution["operations"],
    )
    write_json(DATA / "ci-r3b1o3-corrective-two-index-provenance-2026-08.json", two_index)

    write_json(DATA / "ci-r3b1o3-corrective-second-deploy-idempotency-2026-08.json", strategy["second_deploy_idempotency"])

    prod_ledger_after = export_prisma_ledger(include_logs=False)
    prod_ledger_fp_after = ledger_summary_fingerprint(prod_ledger_after)
    prod_catalog_after = build_catalog_fingerprint(prod_sql_runner)

    terminal = evaluate_terminal_acceptance(
        corrective_worktree_strict_empty=strict_empty,
        golden_tests_pass=golden_results["pass"] and golden_run.returncode == 0,
        golden_test_script_exit_zero=golden_run.returncode == 0,
        golden_coverage_complete=golden_results.get("coverage_complete", False),
        schema_unchanged=repo_immut["schema_unchanged"],
        migrations_unchanged=repo_immut["migrations_unchanged"],
        repository_immutable=repo_immut["pass"],
        m252_exact_parity_pass=m252_parity.get("pass", False),
        r3b_parity_pass=r3b_parity.get("pass", False),
        strategy_pass=strategy["pass"],
        second_deploy_pass=strategy["second_deploy_idempotency"]["pass"],
        production_unchanged=prod_ledger_fp_before == prod_ledger_fp_after and prod_catalog_before["fingerprint_sha256"] == prod_catalog_after["fingerprint_sha256"],
        attribution_pass=attribution["pass"] and two_index["pass"],
        data_risk_unknown_zero=data_dep["counts"]["UNKNOWN_DATA_DEPENDENCY"] == 0,
        unknown_scope=attribution.get("UNKNOWN_SCOPE", 0),
        unattributed=attribution.get("UNATTRIBUTED", 0),
        new_strategy_drift=attribution.get("NEW_STRATEGY_DRIFT", 0),
        r3b_scope=attribution.get("R3B_SCOPE", 0),
        m252_scope=attribution.get("M252_SCOPE", 0),
        golden_failed=golden_results.get("failed", 0),
    )

    summary = {
        "schema_version": 1,
        "phase": "CI-R3B1O.3-corrective",
        "baseline": baseline,
        "two_index_provenance": two_index,
        "index_timeline": strategy.get("index_timeline"),
        "diff_attribution": {
            "total_operations": attribution["total_operations"],
            "scope_counts": attribution.get("scope_counts"),
            "provenance_counts": attribution.get("provenance_counts"),
            "NEW_STRATEGY_DRIFT": attribution.get("NEW_STRATEGY_DRIFT"),
            "UNATTRIBUTED": attribution.get("UNATTRIBUTED"),
            "UNKNOWN_SCOPE": attribution.get("UNKNOWN_SCOPE"),
        },
        "golden_tests": golden_results,
        "m252_exact_pass": m252_parity.get("pass"),
        "r3b_parity_pass": r3b_parity.get("pass"),
        "strategy_pass": strategy["pass"],
        "second_deploy": strategy["second_deploy_idempotency"],
        "data_risk": data_dep["counts"],
        "production_immutable": prod_ledger_fp_before == prod_ledger_fp_after,
        "repository_immutable": repo_immut,
        "terminal": terminal,
        "final_status": terminal["final_status"],
        "r3b1p_readiness": terminal["r3b1p_readiness"],
        "pass": terminal["pass"],
    }
    write_json(DATA / "ci-r3b1o3-corrective-final-acceptance-summary-2026-08.json", summary)

    subprocess.run([sys.executable, str(Path(__file__).with_name("ci_r3b1o3_generate_report.py"))], cwd=Path(__file__).parent)

    try:
        drop_database(parse_local_dsn()[0], golden["database_name"])
        drop_database(parse_local_dsn()[0], db_name)
    except Exception:
        pass

    print(json.dumps({"final_status": terminal["final_status"], "r3b1p_readiness": terminal["r3b1p_readiness"], "pass": terminal["pass"]}, indent=2))
    return 0 if terminal["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
