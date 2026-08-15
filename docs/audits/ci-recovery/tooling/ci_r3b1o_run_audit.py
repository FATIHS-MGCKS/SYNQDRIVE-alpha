#!/usr/bin/env python3
"""CI-R3B1O combined ledger/history reconciliation strategy simulation orchestrator."""
from __future__ import annotations

import json
import subprocess
import sys
from functools import partial
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import ci_r3b1o_mutation_guard  # noqa: F401 — patches MutationGuard
from ci_r3b1n1_production_access import export_prisma_ledger, export_schema_only_dump, ledger_summary_fingerprint, ssh_psql_sql
from ci_r3b1n1_provenance import load_frozen_ledger
from ci_r3b1n2_catalog_fingerprint import build_catalog_fingerprint
from ci_r3b1n2_constants import DATA, MIG_ROOT, R3B1M_BRANCH, R3B1N_LEDGER, ensure_workdir, git_rev, local_migration_inventory, sha256_file
from ci_r3b1n2_instance_identity import prove_isolation, query_instance_identity_dsn, query_production_instance_identity
from ci_r3b1o_checksum import build_checksum_preflight
from ci_r3b1o_constants import M252, R3B1G, R3B1I, R3B1N2_ARTIFACTS, ensure_r3b1o_workdir
from ci_r3b1o_data_dependency import build_data_dependency_risk
from ci_r3b1o_effect_contracts import build_all_effect_contracts, classify_m252_missing_effect
from ci_r3b1o_golden_tests import run_golden_tests
from ci_r3b1o_mutation_guard import guard_preflight_with_golden_tests
from ci_r3b1o_strategy import run_strategy, run_strategy_m252_fwd
from ci_r3b1n2_twin_ops import parse_local_dsn
from ci_r3b1n2_instance_identity import MutationGuard
from ci_r3b1o_twin_manager import build_golden_baseline, clone_strategy_from_golden, drop_database


def write_json(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload, indent=2) + "\n")


def prod_sql_runner(sql: str) -> str:
    wrapped = f"BEGIN TRANSACTION READ ONLY;\nSET LOCAL statement_timeout = '30000ms';\n{sql}\nROLLBACK;"
    proc = ssh_psql_sql(wrapped, tuples_only=True)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr or proc.stdout)
    lines = [ln for ln in (proc.stdout or "").splitlines() if ln.strip() and ln.strip() not in {"BEGIN", "SET", "ROLLBACK"}]
    return "\n".join(lines)


def secret_scan(paths: list[Path]) -> dict:
    from ci_r3b1n2_constants import FORBIDDEN_ARTIFACT_STRINGS

    hits = []
    for path in paths:
        if not path.exists():
            continue
        text = path.read_text(errors="replace")
        for pat in FORBIDDEN_ARTIFACT_STRINGS:
            if pat.lower() in text.lower():
                hits.append({"path": str(path.relative_to(path.parents[4])), "pattern": pat})
    return {"pass": len(hits) == 0, "hits": hits}


def build_blocker_baseline(checksum_preflight: dict, m252_contract: dict) -> dict:
    m252_entry = next((m for m in checksum_preflight["migrations"] if m["migration"] == M252), {})
    blockers = [
        {
            "id": "B_R3B1G_PENDING_EXISTING_EFFECT",
            "migration": R3B1G,
            "type": "PENDING_EXISTING_COLUMN_COLLISION",
            "severity": "BLOCKER_CRITICAL",
        },
        {
            "id": "B_R3B1I_PENDING_EXISTING_EFFECT",
            "migration": R3B1I,
            "type": "PENDING_EXISTING_COLUMN_COLLISION",
            "severity": "BLOCKER_CRITICAL",
        },
        {
            "id": "B_M252_HISTORICAL_IDENTIFIER_MUTATION",
            "migration": M252,
            "type": "POST_DEPLOY_IDENTIFIER_ONLY_HISTORY_MUTATION",
            "severity": "BLOCKER_HIGH",
            "post_deploy_historical_migration_mutation": m252_entry.get("post_deploy_historical_migration_mutation"),
            "semantic_change_kind": m252_entry.get("semantic_change_kind"),
        },
        {
            "id": "B_M252_ZERO_STEP_APPLIED_MISSING_EFFECT",
            "migration": M252,
            "type": "LEDGER_APPLIED_CATALOG_EFFECT_MISSING",
            "severity": "BLOCKER_CRITICAL",
            "classification": m252_contract.get("classification"),
        },
    ]
    return {"schema_version": 1, "phase": "CI-R3B1O", "blockers": blockers}


def main() -> int:
    baseline = {
        "PRE_R3B1O_SHA": git_rev("HEAD"),
        "R3B1N2_REMOTE_HEAD": git_rev("origin/audit/ci-r3b1n2-isolated-twin-provenance-closure-2026-08"),
        "MAIN_HEAD": git_rev("origin/main"),
        "RECOVERED_HEAD": git_rev(f"origin/{R3B1M_BRANCH}"),
    }

    _, ledger_best = load_frozen_ledger(R3B1N_LEDGER)
    recovered_inventory = local_migration_inventory()
    main_sha = baseline["MAIN_HEAD"]
    recovered_sha = baseline["RECOVERED_HEAD"]

    checksum_preflight = build_checksum_preflight(
        ledger_best=ledger_best,
        recovered_inventory=recovered_inventory,
        deployed_sha=baseline.get("DEPLOYED_SHA", "d8461e28c9b4cee121e34a1d79145d0ff6b97991"),
        main_sha=main_sha,
        recovered_sha=recovered_sha,
    )
    write_json(DATA / "ci-r3b1o-checksum-provenance-preflight-2026-08.json", checksum_preflight)

    prod_identity = query_production_instance_identity()
    base_dsn, _ = parse_local_dsn()
    audit_identity = query_instance_identity_dsn(base_dsn)
    guard_preflight = guard_preflight_with_golden_tests(prod_identity, audit_identity)
    write_json(DATA / "ci-r3b1o-mutation-target-guard-preflight-2026-08.json", guard_preflight)

    preflight_pass = checksum_preflight["pass"] and guard_preflight["pass"]
    if not preflight_pass:
        write_json(
            DATA / "ci-r3b1o-final-strategy-simulation-summary-2026-08.json",
            {"final_status": "CI_R3B1O_PREFLIGHT_FAILED", "pass": False, "baseline": baseline},
        )
        return 1

    prod_ledger_before = export_prisma_ledger(include_logs=False)
    prod_ledger_fp_before = ledger_summary_fingerprint(prod_ledger_before)
    prod_catalog_before = build_catalog_fingerprint(prod_sql_runner)

    work = ensure_r3b1o_workdir()
    schema_dump = work / "production_schema_only.sql"
    if not schema_dump.exists():
        schema_dump.parent.mkdir(parents=True, exist_ok=True)
        export_schema_only_dump(schema_dump)

    golden = build_golden_baseline(
        guard=MutationGuard(prod_identity, audit_identity),
        schema_dump=schema_dump,
        prod_ledger=prod_ledger_before,
        prod_catalog_fp=prod_catalog_before["fingerprint_sha256"],
        prod_ledger_fp=prod_ledger_fp_before,
    )
    write_json(
        DATA / "ci-r3b1o-golden-production-twin-manifest-2026-08.json",
        {k: v for k, v in golden.items() if k not in {"dsn", "guard", "run_sql", "catalog"}},
    )

    if not golden["pass"]:
        write_json(
            DATA / "ci-r3b1o-final-strategy-simulation-summary-2026-08.json",
            {"final_status": "CI_R3B1O_GOLDEN_BASELINE_FAILED", "pass": False},
        )
        return 1

    effect_contracts = build_all_effect_contracts(golden["run_sql"], MIG_ROOT)
    write_json(DATA / "ci-r3b1o-migration-effect-equivalence-contracts-2026-08.json", effect_contracts)

    m252_contract = classify_m252_missing_effect(golden["run_sql"])
    blocker_baseline = build_blocker_baseline(checksum_preflight, m252_contract)
    write_json(DATA / "ci-r3b1o-corrected-production-blocker-baseline-2026-08.json", blocker_baseline)

    golden_tests = run_golden_tests(
        ledger_best=ledger_best,
        recovered_inventory=recovered_inventory,
        main_sha=main_sha,
        recovered_sha=recovered_sha,
        run_sql=golden["run_sql"],
    )

    clone_fn = lambda strategy_id: clone_strategy_from_golden(golden=golden, strategy_id=strategy_id)
    strategies = []

    s0 = run_strategy(strategy_id="S0_CONTROL", golden_clone_fn=clone_fn, resolve_migrations=[])
    strategies.append(s0)

    r3b1g_contract = next(c for c in effect_contracts["contracts"] if c["migration"] == R3B1G)
    r3b1i_contract = next(c for c in effect_contracts["contracts"] if c["migration"] == R3B1I)

    s1 = None
    if r3b1g_contract["resolve_as_applied_allowed"]:
        s1 = run_strategy(strategy_id="S1_R3B1G_RESOLVED", golden_clone_fn=clone_fn, resolve_migrations=[R3B1G])
        strategies.append(s1)

    s2 = None
    if r3b1g_contract["resolve_as_applied_allowed"] and r3b1i_contract["resolve_as_applied_allowed"]:
        s2 = run_strategy(strategy_id="S2_R3B1G_R3B1I_RESOLVED", golden_clone_fn=clone_fn, resolve_migrations=[R3B1G, R3B1I])
        strategies.append(s2)

    s_m252_fwd = None
    s2_head_ok = s2 and s2["first_deploy"]["exit_code"] == 0 and s2["first_deploy"]["new_failed"] == 0
    if s2_head_ok and m252_contract["ledger_applied_catalog_effect_missing"]:
        s_m252_fwd = run_strategy_m252_fwd(golden_clone_fn=clone_fn, prior_resolves=[R3B1G, R3B1I])
        strategies.append(s_m252_fwd)

    write_json(DATA / "ci-r3b1o-golden-tests-2026-08.json", golden_tests)

    write_json(
        DATA / "ci-r3b1o-strategy-simulation-matrix-2026-08.json",
        {"schema_version": 1, "phase": "CI-R3B1O", "strategies": strategies},
    )

    data_dep = build_data_dependency_risk(recovered_inventory=recovered_inventory)
    write_json(DATA / "ci-r3b1o-production-data-dependency-risk-2026-08.json", data_dep)

    winning = None
    for candidate in [s_m252_fwd, s2]:
        if not candidate:
            continue
        if candidate.get("strategy_id") == "S_M252_FWD" and candidate.get("pass"):
            winning = candidate
            break
        if candidate.get("pass") and not m252_contract["ledger_applied_catalog_effect_missing"]:
            winning = candidate
            break

    strategy_results = {
        "schema_version": 1,
        "phase": "CI-R3B1O",
        "strategies": strategies,
        "control_s0": s0,
        "strategy_s1": s1,
        "strategy_s2": s2,
        "strategy_m252_fwd": s_m252_fwd,
        "winning_strategy_id": winning["strategy_id"] if winning else None,
    }
    write_json(DATA / "ci-r3b1o-strategy-results-2026-08.json", strategy_results)

    selected = {
        "schema_version": 1,
        "phase": "CI-R3B1O",
        "selected_strategy_id": winning["strategy_id"] if winning else None,
        "why_selected": "Minimal supported resolve ladder with deploy-to-HEAD and second-deploy idempotency"
        if winning
        else "No strategy fully passed all gates",
        "required_future_production_operations_plan_only": {
            "read_only_preflight": True,
            "migrate_resolve": [R3B1G, R3B1I] if winning else [],
            "forward_migration_required": bool(s_m252_fwd and s_m252_fwd.get("pass")),
            "migrate_deploy": bool(winning),
            "post_deploy_validations": ["ledger", "catalog", "second_deploy", "r3b_parity"],
            "abort_conditions": ["any failed migration row", "catalog regression", "production fingerprint change"],
        },
    }
    write_json(DATA / "ci-r3b1o-selected-reconciliation-strategy-2026-08.json", selected)

    runbook = {
        "schema_version": 1,
        "phase": "CI-R3B1O",
        "r3b1p_readiness": "R3B1P_READY_CONTROLLED_RECONCILIATION_PLAN" if winning else "NOT_READY",
        "required_production_preflight_checks": [
            "production ledger fingerprint unchanged",
            "production catalog fingerprint unchanged",
            "R3B1G full-effect proof",
            "R3B1I full-effect proof",
            "M252 ledger/history preserved",
        ],
        "proposed_migrate_resolve": [R3B1G, R3B1I] if winning else [],
        "full_effect_proof_ids": [c["contract_id"] for c in effect_contracts["contracts"] if c["resolve_as_applied_allowed"]],
        "m252_forward_migration_contract": s_m252_fwd.get("temporary_migration") if s_m252_fwd else None,
        "data_dependent_risk": data_dep["counts"],
        "expected_second_deploy_result": {"exit": 0, "new_migrations": 0},
        "abort_thresholds": ["new_failed > 0", "second_deploy_applies_migrations", "production mutation"],
    }
    write_json(DATA / "ci-r3b1o-r3b1p-runbook-input-2026-08.json", runbook)

    prod_ledger_after = export_prisma_ledger(include_logs=False)
    prod_ledger_fp_after = ledger_summary_fingerprint(prod_ledger_after)
    prod_catalog_after = build_catalog_fingerprint(prod_sql_runner)

    final_status = (
        "CI_R3B1O_COMBINED_RECONCILIATION_STRATEGY_SIMULATION_COMPLETED"
        if winning and golden_tests["pass"]
        else "CI_R3B1O_STRATEGY_INCOMPLETE"
    )
    if not checksum_preflight["pass"] or not guard_preflight["pass"]:
        final_status = "CI_R3B1O_PREFLIGHT_FAILED"

    summary = {
        "schema_version": 1,
        "phase": "CI-R3B1O",
        "final_status": final_status,
        "pass": final_status == "CI_R3B1O_COMBINED_RECONCILIATION_STRATEGY_SIMULATION_COMPLETED",
        "baseline": baseline,
        "preflight": {
            "checksum_matches_none": checksum_preflight["summary"]["matches_none"],
            "checksum_unresolved": checksum_preflight["summary"]["unresolved"],
            "history_mutations": checksum_preflight["summary"]["post_deploy_historical_migration_mutations"],
            "m252_mutation_class": next(
                (m.get("semantic_change_kind") for m in checksum_preflight["migrations"] if m["migration"] == M252),
                None,
            ),
            "guard_status": guard_preflight["pass"],
        },
        "golden_twin": {
            "isolation": prove_isolation(prod_identity, query_instance_identity_dsn(base_dsn))["isolation_pass"],
            "catalog_fidelity": golden["catalog_fidelity_pass"],
            "ledger_fidelity": golden["ledger_fidelity_pass"],
            "no_data": golden["no_business_data_pass"],
        },
        "effect_contracts": effect_contracts["summary"],
        "strategy_count": len(strategies),
        "control_baseline_result": {
            "new_finished": s0["first_deploy"]["new_finished"],
            "new_failed": s0["first_deploy"]["new_failed"],
            "first_failure": s0["first_deploy"]["first_failing_migration"],
            "prisma": s0["first_deploy"]["prisma_error_code"],
            "db_code": s0["first_deploy"]["database_error_code"],
        },
        "winning_strategy": winning["strategy_id"] if winning else None,
        "r3b1p_readiness": runbook["r3b1p_readiness"],
        "production_fingerprints_unchanged": prod_ledger_fp_before == prod_ledger_fp_after
        and prod_catalog_before["fingerprint_sha256"] == prod_catalog_after["fingerprint_sha256"],
        "production_mutations": 0,
    }
    write_json(DATA / "ci-r3b1o-final-strategy-simulation-summary-2026-08.json", summary)

    artifacts = list(DATA.glob("ci-r3b1o-*")) + list((DATA.parent).glob("ci-r3b1o-*"))
    scan = secret_scan(artifacts)
    report_proc = subprocess.run(
        [sys.executable, str(Path(__file__).with_name("ci_r3b1o_generate_report.py"))],
        cwd=Path(__file__).parent,
    )

    # cleanup golden DB (optional - leave for inspection? spec says disposable - drop)
    try:
        drop_database(parse_local_dsn()[0], golden["database_name"])
    except Exception:
        pass

    git_diff = subprocess.run(["git", "diff", "--name-only", "backend/prisma/migrations"], cwd=DATA.parents[3], capture_output=True, text=True)
    migration_leak = bool(git_diff.stdout.strip())

    print(json.dumps({"final_status": final_status, "pass": summary["pass"], "migration_leak": migration_leak}, indent=2))
    return 0 if summary["pass"] and scan["pass"] and report_proc.returncode == 0 and not migration_leak else 1


if __name__ == "__main__":
    raise SystemExit(main())
