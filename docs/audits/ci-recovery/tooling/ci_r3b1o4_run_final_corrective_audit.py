#!/usr/bin/env python3
"""CI-R3B1O.4 final corrective catalog authority acceptance orchestrator."""
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
from ci_r3b1n2_constants import DATA, git_rev, sha256_file
from ci_r3b1n2_instance_identity import MutationGuard, query_instance_identity_dsn, query_production_instance_identity
from ci_r3b1n2_twin_ops import parse_local_dsn
from ci_r3b1o1_constants import R3B1M_FINAL_PARITY
from ci_r3b1o1_data_dependency import build_corrected_data_dependency_risk
from ci_r3b1o2_prisma_diff import run_prisma_diff
from ci_r3b1o3_diff_attribution import classify_final_diff
from ci_r3b1o3_m252_complete_authority import build_m252_complete_physical_authority
from ci_r3b1o4_catalog_authority import build_full_catalog_delta_authority, build_raw_catalog_deltas
from ci_r3b1o4_catalog_engine_crossvalidation import build_catalog_engine_crossvalidation, write_catalog_engine_crossvalidation
from ci_r3b1o4_constants import FINAL_CORRECTIVE_STRATEGY_DB_PREFIX, R3B1O3_BRANCH, ensure_r3b1o4_workdir
from ci_r3b1o4_evidence_crossvalidation import build_evidence_code_crossvalidation
from ci_r3b1o4_execution_set import build_execution_set
from ci_r3b1o4_expected_catalog_effects import build_expected_catalog_deltas
from ci_r3b1o4_final_twin import run_tail_reconciliation_strategy
from ci_r3b1o4_implicit_catalog_effects import build_implicit_catalog_effects
from ci_r3b1o4_stale_index_authority import write_stale_index_authority_artifacts
from ci_r3b1o4_tail_contract import build_tail_data_risk, write_tail_contract_artifacts
from ci_r3b1o4_terminal_gate import evaluate_final_corrective_terminal_acceptance
from ci_r3b1o4_test_source_hashes import (
    build_final_corrective_test_source_hash_manifest,
    write_final_corrective_test_source_hash_manifest,
)
from replay_evidence_lib import PgConfig

REPO = DATA.parents[3]
MIG_ROOT = REPO / "backend/prisma/migrations"
PREFIX = "ci-r3b1o4-final-corrective"

FINAL_CORRECTIVE_INPUTS = [
    "ci-r3b1o4-corrective-final-acceptance-summary-2026-08.json",
    "ci-r3b1o4-corrective-full-catalog-delta-authority-2026-08.json",
    "ci-r3b1o4-corrective-golden-catalog-inventory-2026-08.json",
    "ci-r3b1o4-corrective-final-catalog-inventory-2026-08.json",
    "ci-r3b1o4-corrective-final-m252-exact-parity-2026-08.json",
    "ci-r3b1o4-corrective-final-r3b-parity-2026-08.json",
    "ci-r3b1o4-corrective-final-prisma-diff-attribution-2026-08.json",
    "ci-r3b1o4-corrective-second-deploy-idempotency-2026-08.json",
    "ci-r3b1o4-corrective-r3b1p-data-risk-input-2026-08.json",
    "ci-r3b1o4-corrective-golden-tests-2026-08.json",
    "ci-r3b1o4-corrective-evidence-code-crossvalidation-2026-08.json",
    "ci-r3b1o4-corrective-test-source-hash-manifest-2026-08.json",
    "ci-r3b1o4-tail-reconciliation-contract-2026-08.json",
    "backend/prisma/schema.prisma",
    "backend/prisma/migrations/20260721270000_iam_role_assignment_drift_reconciliation/migration.sql",
]


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
    schema_diff = subprocess.check_output(["git", "diff", f"origin/{R3B1O3_BRANCH}", "--", "backend/prisma/schema.prisma"], cwd=REPO, text=True)
    mig_diff = subprocess.check_output(["git", "diff", f"origin/{R3B1O3_BRANCH}", "--", "backend/prisma/migrations"], cwd=REPO, text=True)
    runtime_diff = subprocess.check_output(["git", "diff", f"origin/{R3B1O3_BRANCH}", "--", "backend/src", "frontend"], cwd=REPO, text=True)
    return {"schema_unchanged": not schema_diff.strip(), "migrations_unchanged": not mig_diff.strip(), "runtime_unchanged": not runtime_diff.strip(), "pass": not schema_diff.strip() and not mig_diff.strip() and not runtime_diff.strip()}


def build_final_corrective_input_manifest(baseline: dict) -> dict:
    bound = {}
    for rel in FINAL_CORRECTIVE_INPUTS:
        path = REPO / rel if rel.startswith("backend/") else DATA / rel
        bound[rel] = {"sha256": sha256_file(path) if path.exists() else None, "exists": path.exists()}
    return {"schema_version": 1, "phase": "CI-R3B1O.4-final-corrective", "baseline": baseline, "bound_inputs": bound}


def main() -> int:
    strict_empty, _wt_text = strict_worktree_empty()
    corrective_summary = DATA / "ci-r3b1o4-corrective-final-acceptance-summary-2026-08.json"
    baseline = {
        "WORKTREE_STRICT_EMPTY": strict_empty,
        "FINAL_CORRECTIVE_PRE_SHA": git_rev("HEAD"),
        "REMOTE_HEAD": git_rev("origin/audit/ci-r3b1o4-tail-reconciliation-strategy-closure-2026-08"),
        "MAIN_HEAD": git_rev("origin/main"),
        "CORRECTIVE_SUMMARY_SHA256": sha256_file(corrective_summary) if corrective_summary.exists() else None,
    }
    if not strict_empty:
        write_json(DATA / f"{PREFIX}-final-acceptance-summary-2026-08.json", {"final_status": "CI_R3B1O4_FINAL_CORRECTIVE_BASELINE_NOT_CLEAN", "pass": False, "baseline": baseline})
        print(json.dumps({"final_status": "CI_R3B1O4_FINAL_CORRECTIVE_BASELINE_NOT_CLEAN", "pass": False}, indent=2))
        return 1

    pre_hashes = build_final_corrective_test_source_hash_manifest()
    write_final_corrective_test_source_hash_manifest(pre_hashes)
    write_json(DATA / f"{PREFIX}-input-manifest-2026-08.json", build_final_corrective_input_manifest(baseline))
    write_json(DATA / "ci-r3b1o3-m252-complete-physical-authority-2026-08.json", build_m252_complete_physical_authority())
    write_tail_contract_artifacts()

    execution_set = build_execution_set()
    write_json(DATA / f"{PREFIX}-execution-set-2026-08.json", execution_set)
    expected = build_expected_catalog_deltas(execution_set=execution_set)
    write_json(DATA / f"{PREFIX}-expected-catalog-deltas-2026-08.json", expected)
    implicit = build_implicit_catalog_effects(expected=expected)
    write_json(DATA / f"{PREFIX}-implicit-catalog-effects-2026-08.json", implicit)

    repo_immut = repo_immutable_vs_parent()
    work = ensure_r3b1o4_workdir()
    schema_dump = work / "production_schema_only.sql"
    if not schema_dump.exists():
        schema_dump.parent.mkdir(parents=True, exist_ok=True)
        export_schema_only_dump(schema_dump)

    data_dep = build_corrected_data_dependency_risk(include_forward_m252=False)
    tail_risk = build_tail_data_risk()
    write_json(DATA / "ci-r3b1o4-tail-data-risk-2026-08.json", tail_risk)

    prod_ledger_before = export_prisma_ledger(include_logs=False)
    prod_ledger_fp_before = ledger_summary_fingerprint(prod_ledger_before)
    prod_catalog_before = build_catalog_fingerprint(prod_sql_runner)

    prod_identity = query_production_instance_identity()
    audit_identity = query_instance_identity_dsn(parse_local_dsn()[0])
    from ci_r3b1o_twin_manager import build_golden_baseline, drop_database, twin_sql_runner_factory

    golden = build_golden_baseline(
        guard=MutationGuard(prod_identity, audit_identity),
        schema_dump=schema_dump,
        prod_ledger=prod_ledger_before,
        prod_catalog_fp=prod_catalog_before["fingerprint_sha256"],
        prod_ledger_fp=prod_ledger_fp_before,
    )
    if not golden["pass"]:
        write_json(DATA / f"{PREFIX}-final-acceptance-summary-2026-08.json", {"final_status": "CI_R3B1O4_TAIL_RECONCILIATION_FAILED", "pass": False})
        return 1

    golden_run_sql = twin_sql_runner_factory(golden["dsn"])
    write_stale_index_authority_artifacts(golden_run_sql=golden_run_sql)

    golden_baseline_diff = run_prisma_diff(golden["database_name"])
    (DATA / f"{PREFIX}-golden-prisma-diff-2026-08.sql").write_text(golden_baseline_diff["script"] + ("\n" if golden_baseline_diff["script"] else ""))

    strategy = run_tail_reconciliation_strategy(
        golden=golden,
        prod_identity=prod_identity,
        strategy_id=FINAL_CORRECTIVE_STRATEGY_DB_PREFIX,
    )
    write_json(DATA / f"{PREFIX}-t2-stale-index-drop-safety-2026-08.json", strategy["drop_safety_t2"])

    db_name = strategy["database_name"]
    dsn = strategy["_internal"]["dsn"]

    golden_run = subprocess.run(
        [sys.executable, str(Path(__file__).with_name("ci_r3b1o4_golden_tests.py")), "--final-corrective"],
        cwd=Path(__file__).parent,
    )
    golden_results = json.loads((DATA / f"{PREFIX}-golden-tests-2026-08.json").read_text())
    golden_coverage = json.loads((DATA / f"{PREFIX}-golden-coverage-2026-08.json").read_text())

    post_hashes = build_final_corrective_test_source_hash_manifest()
    crossvalidation = build_evidence_code_crossvalidation(pre_hashes=pre_hashes, post_hashes=post_hashes, golden_results=golden_results, golden_coverage=golden_coverage)
    crossvalidation["phase"] = "CI-R3B1O.4-final-corrective"
    write_json(DATA / f"{PREFIX}-evidence-code-crossvalidation-2026-08.json", crossvalidation)
    write_final_corrective_test_source_hash_manifest(post_hashes)

    m252_parity = strategy["m252_exact_parity"]
    write_json(DATA / f"{PREFIX}-final-m252-exact-parity-2026-08.json", m252_parity)
    write_json(DATA / f"{PREFIX}-m252-exact-parity-2026-08.json", m252_parity)
    write_json(DATA / f"{PREFIX}-golden-catalog-inventory-2026-08.json", strategy["golden_catalog_inventory"])
    write_json(DATA / f"{PREFIX}-final-catalog-inventory-2026-08.json", strategy["final_catalog_inventory"])

    raw_catalog = build_raw_catalog_deltas(golden_inventory=strategy["golden_catalog_inventory"], final_inventory=strategy["final_catalog_inventory"])
    write_json(DATA / f"{PREFIX}-raw-catalog-deltas-2026-08.json", raw_catalog)

    catalog_delta = build_full_catalog_delta_authority(
        golden_inventory=strategy["golden_catalog_inventory"],
        final_inventory=strategy["final_catalog_inventory"],
        expected=expected,
        implicit=implicit,
    )
    write_json(DATA / f"{PREFIX}-full-catalog-delta-authority-2026-08.json", catalog_delta)
    write_json(
        DATA / f"{PREFIX}-delta-authority-proof-2026-08.json",
        {
            "schema_version": 1,
            "phase": "CI-R3B1O.4-final-corrective",
            "proof_count": len(catalog_delta.get("proofs", [])),
            "pass": catalog_delta.get("pass", False),
            "proofs": catalog_delta.get("proofs", []),
        },
    )

    catalog_engine = build_catalog_engine_crossvalidation(
        golden_inventory=strategy["golden_catalog_inventory"],
        final_inventory=strategy["final_catalog_inventory"],
        authority=catalog_delta,
        golden_results=golden_results,
    )
    write_catalog_engine_crossvalidation(catalog_engine)

    parsed = urlparse(dsn)
    cfg = PgConfig(host=parsed.hostname or "127.0.0.1", port=str(parsed.port or 5432), user=parsed.username or "synqdrive", password=parsed.password or "synqdrive")
    authority_sha = json.loads(R3B1M_FINAL_PARITY.read_text()).get("authority_manifest_sha256", "")
    r3b_parity = run_exact_parity(cfg, db_name, authority_sha)
    write_json(
        DATA / f"{PREFIX}-final-r3b-parity-2026-08.json",
        {"objects": f"{r3b_parity.get('objects_matched', 0)}/19", "tables": f"{r3b_parity.get('tables_matched', 0)}/9", "enums": f"{r3b_parity.get('enums_matched', 0)}/10", "properties": f"{r3b_parity.get('properties_matched', 0)}/54", "pass": r3b_parity.get("pass", False), "detail": r3b_parity},
    )
    write_json(
        DATA / f"{PREFIX}-r3b-parity-2026-08.json",
        {"objects": f"{r3b_parity.get('objects_matched', 0)}/19", "tables": f"{r3b_parity.get('tables_matched', 0)}/9", "enums": f"{r3b_parity.get('enums_matched', 0)}/10", "properties": f"{r3b_parity.get('properties_matched', 0)}/54", "pass": r3b_parity.get("pass", False), "detail": r3b_parity},
    )

    final_diff = run_prisma_diff(db_name)
    (DATA / f"{PREFIX}-final-prisma-diff-2026-08.sql").write_text(final_diff["script"] + ("\n" if final_diff["script"] else ""))
    attribution = classify_final_diff(final_diff["script"], golden_twin_script=golden_baseline_diff["script"], golden_baseline_script=golden_baseline_diff["script"], schema_dump=schema_dump)
    write_json(DATA / f"{PREFIX}-final-prisma-diff-attribution-2026-08.json", attribution)

    stale_drop_remaining = sum(
        1
        for op in attribution["operations"]
        if "DROP INDEX" in op.get("raw_sql", "").upper()
        and any(name in op.get("raw_sql", "") for name in ["org_invoices_invoice_number_key", "whatsapp_conversations_organization_id_contact_phone_key"])
    )

    write_json(DATA / f"{PREFIX}-second-deploy-idempotency-2026-08.json", strategy["second_deploy_idempotency"])

    prod_ledger_after = export_prisma_ledger(include_logs=False)
    prod_ledger_fp_after = ledger_summary_fingerprint(prod_ledger_after)
    prod_catalog_after = build_catalog_fingerprint(prod_sql_runner)

    r3b1p_data = {
        "schema_version": 1,
        "phase": "CI-R3B1O.4-final-corrective",
        "executing_migration_count": execution_set["executing_migration_count"],
        "counts": data_dep.get("counts", {}),
        "migrations": data_dep.get("migrations", []) + [{"migration": "FUTURE_TAIL_RECONCILIATION", "classification": "DDL_SCHEMA_ONLY", "tasks": tail_risk.get("tasks")}],
        "UNKNOWN_DATA_DEPENDENCY": data_dep.get("counts", {}).get("UNKNOWN_DATA_DEPENDENCY", 0),
        "pass": data_dep.get("counts", {}).get("UNKNOWN_DATA_DEPENDENCY", 0) == 0,
    }
    write_json(DATA / f"{PREFIX}-r3b1p-data-risk-input-2026-08.json", r3b1p_data)
    write_json(
        DATA / f"{PREFIX}-data-risk-2026-08.json",
        {
            "schema_version": 1,
            "phase": "CI-R3B1O.4-final-corrective",
            "UNKNOWN_DATA_DEPENDENCY": r3b1p_data["UNKNOWN_DATA_DEPENDENCY"],
            "counts": r3b1p_data.get("counts", {}),
            "pass": r3b1p_data["pass"],
        },
    )

    terminal = evaluate_final_corrective_terminal_acceptance(
        worktree_strict_empty=strict_empty,
        t2_drop_safety_pass=strategy["drop_safety_t2"]["pass"],
        replacement_safety_pass=strategy["drop_safety_t2"]["replacement_authority"]["pass"],
        tail_present_pre_second=strategy["second_deploy_idempotency"]["tail_present_pre_second"],
        tail_present_during_second=strategy["second_deploy_idempotency"]["tail_present_during_second"],
        golden_tests_pass=golden_results["pass"] and golden_run.returncode == 0,
        golden_coverage_complete=golden_coverage.get("coverage_complete", False),
        evidence_code_mismatch_zero=crossvalidation["evidence_code_mismatch_count"] == 0,
        m252_exact_parity_pass=m252_parity.get("pass", False),
        r3b_parity_pass=r3b_parity.get("pass", False),
        strategy_pass=strategy["pass"],
        second_deploy_pass=strategy["second_deploy_idempotency"]["pass"],
        production_unchanged=prod_ledger_fp_before == prod_ledger_fp_after and prod_catalog_before["fingerprint_sha256"] == prod_catalog_after["fingerprint_sha256"],
        attribution_pass=attribution["pass"],
        catalog_delta_pass=catalog_delta["pass"],
        catalog_engine_crossvalidation_pass=catalog_engine["pass"],
        execution_set_pass=execution_set["pass"],
        expected_catalog_pass=expected["pass"],
        implicit_catalog_pass=implicit["pass"],
        data_risk_unknown_zero=r3b1p_data["UNKNOWN_DATA_DEPENDENCY"] == 0,
        unknown_scope=attribution.get("UNKNOWN_SCOPE", 0),
        unattributed=attribution.get("UNATTRIBUTED", 0),
        new_strategy_drift=attribution.get("NEW_STRATEGY_DRIFT", 0),
        r3b_scope=attribution.get("R3B_SCOPE", 0),
        m252_scope=attribution.get("M252_SCOPE", 0),
        golden_failed=golden_results.get("failed", 0),
        stale_index_drop_ops_remaining=stale_drop_remaining,
        unauthorized_final_delta=catalog_delta["counts"]["UNAUTHORIZED_FINAL_DELTA"],
        unknown_delta_authority=catalog_delta["counts"]["UNKNOWN_DELTA_AUTHORITY"],
        ambiguous=catalog_delta["counts"]["AMBIGUOUS"],
        repository_immutable=repo_immut["pass"],
        schema_unchanged=repo_immut["schema_unchanged"],
        migrations_unchanged=repo_immut["migrations_unchanged"],
    )

    summary = {
        "schema_version": 1,
        "phase": "CI-R3B1O.4-final-corrective",
        "baseline": baseline,
        "strategy_pass": strategy["pass"],
        "second_deploy": strategy["second_deploy_idempotency"],
        "execution_set": {"executing_migration_count": execution_set["executing_migration_count"], "pass": execution_set["pass"]},
        "catalog_delta": catalog_delta["counts"],
        "catalog_engine_crossvalidation": {"pass": catalog_engine["pass"], "missing_stages": catalog_engine.get("missing_stages", [])},
        "diff_attribution": {"NEW_STRATEGY_DRIFT": attribution.get("NEW_STRATEGY_DRIFT"), "stale_index_drop_ops_remaining": stale_drop_remaining},
        "golden_tests": {"executed": golden_results.get("executed"), "passed": golden_results.get("passed"), "failed": golden_results.get("failed")},
        "crossvalidation": {"evidence_code_mismatch_count": crossvalidation["evidence_code_mismatch_count"], "pass": crossvalidation["pass"]},
        "production_immutable": prod_ledger_fp_before == prod_ledger_fp_after,
        "terminal": terminal,
        "final_status": terminal["final_status"],
        "r3b1p_readiness": terminal["r3b1p_readiness"],
        "pass": terminal["pass"],
    }
    write_json(DATA / f"{PREFIX}-final-acceptance-summary-2026-08.json", summary)

    subprocess.run([sys.executable, str(Path(__file__).with_name("ci_r3b1o4_generate_report.py")), "--final-corrective"], cwd=Path(__file__).parent)

    try:
        drop_database(parse_local_dsn()[0], golden["database_name"])
        drop_database(parse_local_dsn()[0], db_name)
    except Exception:
        pass

    print(json.dumps({"final_status": terminal["final_status"], "r3b1p_readiness": terminal["r3b1p_readiness"], "pass": terminal["pass"]}, indent=2))
    return 0 if terminal["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
