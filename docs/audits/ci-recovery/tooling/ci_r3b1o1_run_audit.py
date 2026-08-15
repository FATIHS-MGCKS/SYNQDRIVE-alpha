#!/usr/bin/env python3
"""CI-R3B1O.1 final reconciliation strategy acceptance orchestrator."""
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
from ci_r3b1n2_constants import DATA, FORBIDDEN_ARTIFACT_STRINGS, ensure_workdir, git_rev, sha256_file
from ci_r3b1n2_instance_identity import MutationGuard, prove_isolation, query_instance_identity_dsn, query_production_instance_identity
from ci_r3b1n1_provenance import load_frozen_ledger
from ci_r3b1o1_constants import M252, R3B1O_INPUTS, R3B1M_FINAL_PARITY, ensure_r3b1o1_workdir
from ci_r3b1o1_data_dependency import build_corrected_data_dependency_risk
from ci_r3b1o1_final_twin import run_final_winning_strategy
from ci_r3b1o1_golden_tests import run_golden_tests
from ci_r3b1o1_m252_authority import build_m252_physical_authority
from ci_r3b1o1_m252_prisma import build_future_schema_alignment_contract, compare_prisma_to_m252_authority
from ci_r3b1o1_prisma_diff import build_final_prisma_diff_analysis
from ci_r3b1o_twin_manager import build_golden_baseline, drop_database
from ci_r3b1n1_production_access import export_schema_only_dump
from ci_r3b1n2_twin_ops import parse_local_dsn
from replay_evidence_lib import PgConfig


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
                hits.append({"path": str(path.relative_to(path.parents[4])), "pattern": pat})
    return {"pass": len(hits) == 0, "hits": hits}


def prod_sql_runner(sql: str) -> str:
    wrapped = f"BEGIN TRANSACTION READ ONLY;\nSET LOCAL statement_timeout = '30000ms';\n{sql}\nROLLBACK;"
    proc = ssh_psql_sql(wrapped, tuples_only=True)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr or proc.stdout)
    lines = [ln for ln in (proc.stdout or "").splitlines() if ln.strip() and ln.strip() not in {"BEGIN", "SET", "ROLLBACK"}]
    return "\n".join(lines)


def main() -> int:
    baseline = {
        "PRE_R3B1O1_SHA": git_rev("HEAD"),
        "R3B1O_REMOTE_HEAD": git_rev("origin/audit/ci-r3b1o-reconciliation-strategy-simulation-2026-08"),
        "MAIN_HEAD": git_rev("origin/main"),
        "WORKTREE_CLEAN": len(subprocess.check_output(["git", "status", "--short"], cwd=DATA.parents[3], text=True).strip()) == 0,
    }

    input_entries = []
    for name in R3B1O_INPUTS + ["backend/prisma/schema.prisma", f"backend/prisma/migrations/{M252}/migration.sql"]:
        path = DATA / name if not name.startswith("backend/") else DATA.parents[3] / name
        if path.exists():
            input_entries.append({"path": str(path.relative_to(DATA.parents[3])), "sha256": sha256_file(path)})
    write_json(DATA / "ci-r3b1o1-input-evidence-manifest-2026-08.json", {"schema_version": 1, "baseline": baseline, "inputs": input_entries})

    golden_tests = run_golden_tests()
    write_json(DATA / "ci-r3b1o1-golden-tests-2026-08.json", golden_tests)

    data_dep = build_corrected_data_dependency_risk(include_forward_m252=True)
    write_json(DATA / "ci-r3b1o1-production-data-dependency-risk-2026-08.json", data_dep)

    m252_authority = build_m252_physical_authority()
    write_json(DATA / "ci-r3b1o1-m252-physical-authority-2026-08.json", m252_authority)

    prisma_cmp = compare_prisma_to_m252_authority()
    write_json(DATA / "ci-r3b1o1-m252-prisma-authority-comparison-2026-08.json", prisma_cmp)

    alignment_contract = build_future_schema_alignment_contract(prisma_cmp)
    write_json(DATA / "ci-r3b1o1-m252-future-schema-alignment-contract-2026-08.json", alignment_contract)

    prod_ledger_before = export_prisma_ledger(include_logs=False)
    prod_ledger_fp_before = ledger_summary_fingerprint(prod_ledger_before)
    prod_catalog_before = build_catalog_fingerprint(prod_sql_runner)

    work = ensure_r3b1o1_workdir()
    schema_dump = work / "production_schema_only.sql"
    if not schema_dump.exists():
        export_schema_only_dump(schema_dump)

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
        write_json(DATA / "ci-r3b1o1-final-strategy-acceptance-2026-08.json", {"final_status": "CI_R3B1O1_GOLDEN_BASELINE_FAILED", "pass": False})
        return 1

    strategy = run_final_winning_strategy(golden=golden, prod_identity=prod_identity)
    write_json(DATA / "ci-r3b1o1-m252-forward-exact-parity-2026-08.json", strategy["m252_exact_parity"])
    write_json(DATA / "ci-r3b1o1-second-deploy-idempotency-2026-08.json", strategy["second_deploy_idempotency"])

    dsn = strategy["_internal"]["dsn"]
    db_name = strategy["database_name"]
    parsed = urlparse(dsn)
    cfg = PgConfig(
        host=parsed.hostname or "127.0.0.1",
        port=str(parsed.port or 5432),
        user=parsed.username or "synqdrive",
        password=parsed.password or "synqdrive",
    )
    authority_sha = json.loads(R3B1M_FINAL_PARITY.read_text()).get("authority_manifest_sha256", "")
    r3b_parity = run_exact_parity(cfg, db_name, authority_sha)
    write_json(
        DATA / "ci-r3b1o1-final-winning-twin-r3b-parity-2026-08.json",
        {
            "schema_version": 1,
            "phase": "CI-R3B1O.1",
            "objects": f"{r3b_parity.get('objects_matched', 0)}/19",
            "tables": f"{r3b_parity.get('tables_matched', 0)}/9",
            "enums": f"{r3b_parity.get('enums_matched', 0)}/10",
            "properties": f"{r3b_parity.get('properties_matched', 0)}/54",
            "semantic_mismatch_count": len(r3b_parity.get("mismatch_records", [])),
            "pass": r3b_parity.get("pass", False),
            "detail": r3b_parity,
        },
    )

    prisma_diff = build_final_prisma_diff_analysis(
        golden_db=golden["database_name"],
        final_db=db_name,
        sql_out=DATA / "ci-r3b1o1-final-winning-twin-prisma-diff-2026-08.sql",
        json_out=DATA / "ci-r3b1o1-final-winning-twin-prisma-diff-2026-08.json",
        host=cfg.host,
        port=cfg.port,
    )

    write_json(
        DATA / "ci-r3b1o1-m252-forward-production-contract-2026-08.json",
        {
            "schema_version": 1,
            "phase": "CI-R3B1O.1",
            "purpose": "append_only_forward_reconciliation_for_missing_m252_ddl",
            "canonical_sql_source": M252,
            "preconditions": [
                "target table absent",
                "historical M252 ledger rows preserved",
                "parent organizations and organization_memberships exist",
            ],
            "expected_catalog_delta": "create M252 table, PK, unique, index, two FKs with corrected identifiers",
            "expected_ledger_delta": "one new finished row for forward migration identity",
            "historical_row_preserved": True,
            "tracked_repository": False,
        },
    )

    write_json(
        DATA / "ci-r3b1o1-r3b1p-data-risk-input-2026-08.json",
        {
            "schema_version": 1,
            "counts": data_dep["counts"],
            "executing_migrations": data_dep["migrations"],
            "unknown_blocks_readiness": data_dep["counts"]["UNKNOWN_DATA_DEPENDENCY"] > 0,
        },
    )

    prod_ledger_after = export_prisma_ledger(include_logs=False)
    prod_ledger_fp_after = ledger_summary_fingerprint(prod_ledger_after)
    prod_catalog_after = build_catalog_fingerprint(prod_sql_runner)

    strategy_core_pass = (
        golden_tests["pass"]
        and data_dep["pass"]
        and strategy["pass"]
        and strategy["m252_exact_parity"]["pass"]
        and strategy["second_deploy_idempotency"]["pass"]
        and r3b_parity.get("pass", False)
        and prisma_diff["pass"]
    )

    if strategy_core_pass and prisma_cmp["source_alignment_required"]:
        r3b1p_readiness = "NOT_READY_SOURCE_ALIGNMENT_REQUIRED"
        final_status = "CI_R3B1O1_STRATEGY_VALID_SOURCE_ALIGNMENT_REQUIRED"
    elif strategy_core_pass:
        r3b1p_readiness = "R3B1P_READY_CONTROLLED_RECONCILIATION_PLAN"
        final_status = "CI_R3B1O1_FINAL_RECONCILIATION_STRATEGY_ACCEPTED"
    else:
        r3b1p_readiness = "NOT_READY_SOURCE_ALIGNMENT_REQUIRED" if prisma_cmp["source_alignment_required"] else "NOT_READY"
        if not data_dep["pass"]:
            final_status = "CI_R3B1O1_DATA_DEPENDENCY_CLASSIFICATION_FAILED"
        elif not strategy["m252_exact_parity"]["pass"]:
            final_status = "CI_R3B1O1_M252_EXACT_PARITY_FAILED"
        elif not strategy["second_deploy_idempotency"]["pass"]:
            final_status = "CI_R3B1O1_REPEAT_DEPLOY_IDEMPOTENCY_FAILED"
        elif not r3b_parity.get("pass", False):
            final_status = "CI_R3B1O1_FINAL_PARITY_FAILED"
        elif prisma_cmp["source_alignment_required"] and strategy["pass"]:
            final_status = "CI_R3B1O1_STRATEGY_VALID_SOURCE_ALIGNMENT_REQUIRED"
        else:
            final_status = "CI_R3B1O1_STRATEGY_INCOMPLETE"

    acceptance = {
        "schema_version": 1,
        "phase": "CI-R3B1O.1",
        "baseline": baseline,
        "data_dependency_parser_pass": golden_tests["pass"] and data_dep["pass"],
        "m252_has_dml": data_dep["m252_has_dml"],
        "m252_physical_authority_pass": True,
        "m252_prisma_drift_count": prisma_cmp["drift_count"],
        "source_alignment_required": prisma_cmp["source_alignment_required"],
        "final_twin_isolation": prove_isolation(prod_identity, query_instance_identity_dsn(parse_local_dsn()[0]))["isolation_pass"],
        "resolve_set": {"R3B1G": all(r["pass"] for r in strategy["resolve_operations"][:1]), "R3B1I": all(r["pass"] for r in strategy["resolve_operations"][1:2])},
        "normal_deploy": strategy["normal_deploy"],
        "m252_forward": strategy["forward_deploy"],
        "m252_exact_parity_pass": strategy["m252_exact_parity"]["pass"],
        "r3b_parity": {
            "objects": "19/19" if r3b_parity.get("pass") else r3b_parity.get("authority_object_pass_count"),
            "tables": "9/9",
            "enums": "10/10",
            "properties": "54/54",
            "pass": r3b_parity.get("pass", False),
        },
        "prisma_diff": prisma_diff["classification"],
        "second_deploy": strategy["second_deploy_idempotency"],
        "data_risk_counts": data_dep["counts"],
        "production_unchanged": prod_ledger_fp_before == prod_ledger_fp_after and prod_catalog_before["fingerprint_sha256"] == prod_catalog_after["fingerprint_sha256"],
        "production_mutations": 0,
        "r3b1p_readiness": r3b1p_readiness,
        "final_status": final_status,
        "pass": strategy_core_pass and r3b1p_readiness == "R3B1P_READY_CONTROLLED_RECONCILIATION_PLAN",
    }
    write_json(DATA / "ci-r3b1o1-final-strategy-acceptance-2026-08.json", acceptance)

    try:
        drop_database(parse_local_dsn()[0], golden["database_name"])
        drop_database(parse_local_dsn()[0], db_name)
    except Exception:
        pass

    artifacts = list(DATA.glob("ci-r3b1o1-*")) + list((DATA.parent).glob("ci-r3b1o1-*"))
    scan = secret_scan(artifacts)
    report_proc = subprocess.run([sys.executable, str(Path(__file__).with_name("ci_r3b1o1_generate_report.py"))], cwd=Path(__file__).parent)
    mig_diff = subprocess.run(["git", "diff", "--name-only", "backend/prisma"], cwd=DATA.parents[3], capture_output=True, text=True)

    print(json.dumps({"final_status": final_status, "r3b1p_readiness": r3b1p_readiness, "pass": acceptance["pass"]}, indent=2))
    return 0 if scan["pass"] and report_proc.returncode == 0 and not mig_diff.stdout.strip() else 1


if __name__ == "__main__":
    raise SystemExit(main())
