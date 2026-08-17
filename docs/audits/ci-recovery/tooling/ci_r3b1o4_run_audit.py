#!/usr/bin/env python3
"""CI-R3B1O.4 append-only tail reconciliation strategy closure orchestrator."""
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
from ci_r3b1o3_diff_attribution import classify_final_diff, write_corrective_attribution
from ci_r3b1o3_m252_complete_authority import build_m252_complete_physical_authority
from ci_r3b1o4_catalog_delta import classify_catalog_delta
from ci_r3b1o4_constants import R3B1O3_BRANCH, R3B1O4_INPUTS, ensure_r3b1o4_workdir
from ci_r3b1o4_final_twin import run_tail_reconciliation_strategy
from ci_r3b1o4_stale_index_authority import build_replacement_uniqueness_safety, write_stale_index_authority_artifacts
from ci_r3b1o4_tail_contract import build_tail_data_risk, evaluate_tail_preconditions, write_tail_contract_artifacts
from ci_r3b1o4_terminal_gate import evaluate_terminal_acceptance
from ci_r3b1o4_test_source_hashes import write_test_source_hash_manifest
from replay_evidence_lib import PgConfig

REPO = DATA.parents[3]
MIG_ROOT = REPO / "backend/prisma/migrations"


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
        ["git", "diff", f"origin/{R3B1O3_BRANCH}", "--", "backend/prisma/schema.prisma"],
        cwd=REPO,
        text=True,
    )
    mig_diff = subprocess.check_output(
        ["git", "diff", f"origin/{R3B1O3_BRANCH}", "--", "backend/prisma/migrations"],
        cwd=REPO,
        text=True,
    )
    runtime_diff = subprocess.check_output(
        ["git", "diff", f"origin/{R3B1O3_BRANCH}", "--", "backend/src", "frontend"],
        cwd=REPO,
        text=True,
    )
    return {
        "schema_unchanged": not schema_diff.strip(),
        "migrations_unchanged": not mig_diff.strip(),
        "runtime_unchanged": not runtime_diff.strip(),
        "pass": not schema_diff.strip() and not mig_diff.strip() and not runtime_diff.strip(),
    }


def build_input_authority_manifest(baseline: dict) -> dict:
    bound = {}
    for rel in R3B1O4_INPUTS:
        if rel.endswith(".json"):
            path = DATA / rel
        elif rel.startswith("backend/"):
            path = REPO / rel
        else:
            path = MIG_ROOT / rel
        bound[rel] = {"path": str(path.relative_to(REPO)) if path.exists() else rel, "sha256": sha256_file(path) if path.exists() else None, "exists": path.exists()}
    return {"schema_version": 1, "phase": "CI-R3B1O.4", "baseline": baseline, "bound_inputs": bound}


def build_r3b1p_tail_contract(strategy: dict) -> dict:
    contract = json.loads((DATA / "ci-r3b1o4-tail-reconciliation-contract-2026-08.json").read_text())
    sql = (DATA / "ci-r3b1o4-temporary-tail-migration-contract-2026-08.sql").read_text()
    return {
        "schema_version": 1,
        "phase": "CI-R3B1O.4",
        "future_tracked_migration_purpose": "append_only_production_history_tail_reconciliation",
        "logical_tasks": contract["logical_tasks"],
        "exact_sql_semantics": sql,
        "preconditions": strategy.get("pre_tail_preconditions"),
        "expected_ledger_delta": {"new_finished": 1, "new_failed": 0},
        "expected_catalog_delta": ["remove two stale indexes", "create canonical M252 objects"],
        "forbidden_extra_effects": ["no CASCADE", "no fourth task", "no Slot4 edit", "no Slot11 edit", "no historical M252 rewrite"],
        "abort_conditions": ["preconditions fail", "replacement uniqueness absent", "constraint-backed stale index"],
        "slot4_unchanged_reason": "retroactive pending migration must execute normally; stale index removed by tail only",
        "slot11_unchanged_reason": "retroactive pending migration must execute normally; stale index removed by tail only",
        "historical_m252_unchanged_reason": "production ledger row preserved; forward reconciliation via new append-only tail",
        "tracked_repository": False,
        "note": "Contract only — real tracked migration deferred to R3B1P",
    }


def build_r3b1p_data_risk_input(data_dep: dict, tail_risk: dict) -> dict:
    entries = [e for e in data_dep.get("migrations", []) if e.get("migration") not in {"FORWARD_M252_APPEND_ONLY"}]
    entries.append(
        {
            "migration": "FUTURE_TAIL_RECONCILIATION",
            "classification": "DDL_SCHEMA_ONLY",
            "reason": "three-task tail: two stale index drops + empty M252 table creation",
            "required_production_read_only_preflight": False,
            "tasks": tail_risk.get("tasks"),
        }
    )
    counts = dict(data_dep.get("counts", {}))
    counts["DDL_SCHEMA_ONLY"] = counts.get("DDL_SCHEMA_ONLY", 0) + 1
    return {
        "schema_version": 1,
        "phase": "CI-R3B1O.4",
        "executing_migration_count": len(entries),
        "counts": counts,
        "migrations": entries,
        "UNKNOWN_DATA_DEPENDENCY": counts.get("UNKNOWN_DATA_DEPENDENCY", 0),
        "pass": counts.get("UNKNOWN_DATA_DEPENDENCY", 0) == 0,
    }


def main() -> int:
    strict_empty, wt_text = strict_worktree_empty()
    baseline = {
        "WORKTREE_STRICT_EMPTY": strict_empty,
        "PRE_R3B1O4_SHA": git_rev("HEAD"),
        "R3B1O3_REMOTE_HEAD": git_rev(f"origin/{R3B1O3_BRANCH}"),
        "MAIN_HEAD": git_rev("origin/main"),
    }
    if not strict_empty:
        write_json(DATA / "ci-r3b1o4-final-strategy-acceptance-summary-2026-08.json", {"final_status": "CI_R3B1O4_BASELINE_NOT_CLEAN", "pass": False, "baseline": baseline})
        print(json.dumps({"final_status": "CI_R3B1O4_BASELINE_NOT_CLEAN", "pass": False}, indent=2))
        return 1

    write_json(DATA / "ci-r3b1o4-input-authority-manifest-2026-08.json", build_input_authority_manifest(baseline))
    write_json(DATA / "ci-r3b1o3-m252-complete-physical-authority-2026-08.json", build_m252_complete_physical_authority())
    tail_artifacts = write_tail_contract_artifacts()
    write_test_source_hash_manifest()

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
        write_json(DATA / "ci-r3b1o4-final-strategy-acceptance-summary-2026-08.json", {"final_status": "CI_R3B1O4_TAIL_RECONCILIATION_FAILED", "pass": False})
        return 1

    golden_run_sql = twin_sql_runner_factory(golden["dsn"])
    authority_bundle = write_stale_index_authority_artifacts(golden_run_sql=golden_run_sql)

    golden_baseline_diff = run_prisma_diff(golden["database_name"])
    (DATA / "ci-r3b1o4-golden-prisma-diff-2026-08.sql").write_text(golden_baseline_diff["script"] + ("\n" if golden_baseline_diff["script"] else ""))

    strategy = run_tail_reconciliation_strategy(golden=golden, prod_identity=prod_identity)
    write_json(DATA / "ci-r3b1o4-index-timeline-2026-08.json", {"schema_version": 1, "timeline": strategy.get("index_timeline", {})})
    write_json(DATA / "ci-r3b1o4-tail-precondition-result-2026-08.json", strategy.get("pre_tail_preconditions", {}))

    db_name = strategy["database_name"]
    dsn = strategy["_internal"]["dsn"]
    run_sql = strategy["_internal"]["run_sql"]

    golden_run = subprocess.run([sys.executable, str(Path(__file__).with_name("ci_r3b1o4_golden_tests.py"))], cwd=Path(__file__).parent)
    golden_results = json.loads((DATA / "ci-r3b1o4-golden-tests-2026-08.json").read_text())

    m252_parity = strategy["m252_exact_parity"]
    write_json(DATA / "ci-r3b1o4-final-m252-exact-parity-2026-08.json", m252_parity)

    parsed = urlparse(dsn)
    cfg = PgConfig(host=parsed.hostname or "127.0.0.1", port=str(parsed.port or 5432), user=parsed.username or "synqdrive", password=parsed.password or "synqdrive")
    authority_sha = json.loads(R3B1M_FINAL_PARITY.read_text()).get("authority_manifest_sha256", "")
    r3b_parity = run_exact_parity(cfg, db_name, authority_sha)
    write_json(
        DATA / "ci-r3b1o4-final-r3b-parity-2026-08.json",
        {
            "objects": f"{r3b_parity.get('objects_matched', 0)}/19",
            "tables": f"{r3b_parity.get('tables_matched', 0)}/9",
            "enums": f"{r3b_parity.get('enums_matched', 0)}/10",
            "properties": f"{r3b_parity.get('properties_matched', 0)}/54",
            "pass": r3b_parity.get("pass", False),
            "detail": r3b_parity,
        },
    )

    t3 = strategy["index_timeline"]["T3_after_tail_reconciliation"]
    write_json(
        DATA / "ci-r3b1o4-final-tail-catalog-state-2026-08.json",
        {
            "schema_version": 1,
            "stale_indexes": t3.get("stale_indexes"),
            "replacements": t3.get("replacements"),
            "m252_table_present": t3.get("m252_table_present"),
            "pass": all(not t3["stale_indexes"][n]["present"] for n in t3["stale_indexes"]) and t3.get("m252_table_present"),
        },
    )

    replacement_final = build_replacement_uniqueness_safety(run_sql)
    write_json(
        DATA / "ci-r3b1o4-final-stale-index-reconciliation-2026-08.json",
        {
            "schema_version": 1,
            "stale_indexes_absent": {n: not t3["stale_indexes"][n]["present"] for n in t3["stale_indexes"]},
            "replacements_present": replacement_final,
            "pass": all(not t3["stale_indexes"][n]["present"] for n in t3["stale_indexes"]) and replacement_final["pass"],
        },
    )

    final_diff = run_prisma_diff(db_name)
    (DATA / "ci-r3b1o4-final-prisma-diff-2026-08.sql").write_text(final_diff["script"] + ("\n" if final_diff["script"] else ""))
    attribution = classify_final_diff(
        final_diff["script"],
        golden_twin_script=golden_baseline_diff["script"],
        golden_baseline_script=golden_baseline_diff["script"],
        schema_dump=schema_dump,
    )
    write_json(DATA / "ci-r3b1o4-final-prisma-diff-attribution-2026-08.json", attribution)

    stale_drop_remaining = sum(
        1
        for op in attribution["operations"]
        if "DROP INDEX" in op.get("raw_sql", "").upper()
        and any(name in op.get("raw_sql", "") for name in ["org_invoices_invoice_number_key", "whatsapp_conversations_organization_id_contact_phone_key"])
    )

    catalog_delta = classify_catalog_delta(
        golden_catalog_fp=golden.get("catalog_fingerprint_sha256") or build_catalog_fingerprint(golden_run_sql)["fingerprint_sha256"],
        final_catalog_fp=build_catalog_fingerprint(run_sql)["fingerprint_sha256"],
        strategy=strategy,
    )
    write_json(DATA / "ci-r3b1o4-final-catalog-delta-authority-2026-08.json", catalog_delta)
    write_json(DATA / "ci-r3b1o4-second-deploy-idempotency-2026-08.json", strategy["second_deploy_idempotency"])

    prod_ledger_after = export_prisma_ledger(include_logs=False)
    prod_ledger_fp_after = ledger_summary_fingerprint(prod_ledger_after)
    prod_catalog_after = build_catalog_fingerprint(prod_sql_runner)

    r3b1p_data = build_r3b1p_data_risk_input(data_dep, tail_risk)
    write_json(DATA / "ci-r3b1o4-r3b1p-data-risk-input-2026-08.json", r3b1p_data)
    write_json(DATA / "ci-r3b1o4-r3b1p-tail-migration-contract-2026-08.json", build_r3b1p_tail_contract(strategy))

    terminal = evaluate_terminal_acceptance(
        worktree_strict_empty=strict_empty,
        invoice_stale_authority_pass=authority_bundle["invoice"]["pass"],
        whatsapp_stale_authority_pass=authority_bundle["whatsapp"]["pass"],
        drop_safety_pass=all(v.get("pass", True) for v in strategy.get("drop_safety_t2", {}).values()) if strategy.get("drop_safety_t2") else True,
        replacement_safety_pass=strategy.get("replacement_safety_t2", {}).get("pass", False),
        tail_contract_pass=tail_artifacts["contract"]["pass"],
        pre_tail_preconditions_pass=strategy.get("pre_tail_preconditions", {}).get("pass", False),
        golden_tests_pass=golden_results["pass"] and golden_run.returncode == 0,
        golden_test_script_exit_zero=golden_run.returncode == 0,
        golden_coverage_complete=golden_results.get("coverage_complete", False),
        schema_unchanged=repo_immut["schema_unchanged"],
        migrations_unchanged=repo_immut["migrations_unchanged"],
        repository_immutable=repo_immut["pass"],
        m252_exact_parity_pass=m252_parity.get("pass", False),
        r3b_parity_pass=r3b_parity.get("pass", False),
        strategy_pass=strategy["pass"],
        tail_deploy_pass=strategy.get("tail_deploy", {}).get("exit_code") == 0,
        second_deploy_pass=strategy["second_deploy_idempotency"]["pass"],
        production_unchanged=prod_ledger_fp_before == prod_ledger_fp_after and prod_catalog_before["fingerprint_sha256"] == prod_catalog_after["fingerprint_sha256"],
        attribution_pass=attribution["pass"],
        catalog_delta_pass=catalog_delta["pass"],
        data_risk_unknown_zero=r3b1p_data["UNKNOWN_DATA_DEPENDENCY"] == 0,
        evidence_code_mismatch_zero=golden_results.get("test_source_hashes", {}).get("evidence_code_mismatch_count", 0) == 0,
        stale_indexes_removed=all(not t3["stale_indexes"][n]["present"] for n in t3["stale_indexes"]),
        replacements_present=replacement_final["pass"],
        unknown_scope=attribution.get("UNKNOWN_SCOPE", 0),
        unattributed=attribution.get("UNATTRIBUTED", 0),
        new_strategy_drift=attribution.get("NEW_STRATEGY_DRIFT", 0),
        r3b_scope=attribution.get("R3B_SCOPE", 0),
        m252_scope=attribution.get("M252_SCOPE", 0),
        golden_failed=golden_results.get("failed", 0),
        stale_index_drop_ops_remaining=stale_drop_remaining,
        unauthorized_final_delta=catalog_delta.get("UNAUTHORIZED_FINAL_DELTA", 0),
    )

    summary = {
        "schema_version": 1,
        "phase": "CI-R3B1O.4",
        "baseline": baseline,
        "stale_index_authority": {"invoice": authority_bundle["invoice"]["pass"], "whatsapp": authority_bundle["whatsapp"]["pass"]},
        "tail_contract": tail_artifacts["contract"],
        "index_timeline": strategy.get("index_timeline"),
        "diff_attribution": {
            "total_operations": attribution["total_operations"],
            "NEW_STRATEGY_DRIFT": attribution.get("NEW_STRATEGY_DRIFT"),
            "UNATTRIBUTED": attribution.get("UNATTRIBUTED"),
            "UNKNOWN_SCOPE": attribution.get("UNKNOWN_SCOPE"),
            "stale_index_drop_ops_remaining": stale_drop_remaining,
        },
        "golden_tests": {"executed": golden_results.get("executed"), "passed": golden_results.get("passed"), "failed": golden_results.get("failed")},
        "m252_exact_pass": m252_parity.get("pass"),
        "r3b_parity_pass": r3b_parity.get("pass"),
        "strategy_pass": strategy["pass"],
        "second_deploy": strategy["second_deploy_idempotency"],
        "catalog_delta": catalog_delta,
        "production_immutable": prod_ledger_fp_before == prod_ledger_fp_after,
        "repository_immutable": repo_immut,
        "terminal": terminal,
        "final_status": terminal["final_status"],
        "r3b1p_readiness": terminal["r3b1p_readiness"],
        "pass": terminal["pass"],
    }
    write_json(DATA / "ci-r3b1o4-final-strategy-acceptance-summary-2026-08.json", summary)

    subprocess.run([sys.executable, str(Path(__file__).with_name("ci_r3b1o4_generate_report.py"))], cwd=Path(__file__).parent)

    try:
        drop_database(parse_local_dsn()[0], golden["database_name"])
        drop_database(parse_local_dsn()[0], db_name)
    except Exception:
        pass

    print(json.dumps({"final_status": terminal["final_status"], "r3b1p_readiness": terminal["r3b1p_readiness"], "pass": terminal["pass"]}, indent=2))
    return 0 if terminal["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
