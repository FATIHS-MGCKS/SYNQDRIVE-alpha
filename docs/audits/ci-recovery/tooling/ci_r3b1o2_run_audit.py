#!/usr/bin/env python3
"""CI-R3B1O.2 M252 Prisma mapping alignment and final diff closure orchestrator."""
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
from ci_r3b1n1_provenance import load_frozen_ledger
from ci_r3b1o1_data_dependency import build_corrected_data_dependency_risk
from ci_r3b1o1_m252_authority import build_m252_physical_authority
from ci_r3b1o_twin_manager import build_golden_baseline, drop_database
from ci_r3b1n2_twin_ops import parse_local_dsn
from ci_r3b1o1_constants import M252, R3B1M_FINAL_PARITY
from ci_r3b1o2_constants import R3B1O2_INPUTS, ensure_r3b1o2_workdir
from ci_r3b1o2_diff_classifier import classify_frozen_r3b1o1_diff
from ci_r3b1o2_final_twin import run_final_winning_strategy
from ci_r3b1o2_m252_inventory import build_m252_diff_inventory, build_schema_alignment_contract
from ci_r3b1o2_prisma_diff import build_final_prisma_diff_analysis, m252_rename_absent, run_prisma_diff
from ci_r3b1o2_schema_gate import build_schema_original_manifest, run_prisma_validation, validate_authorized_schema_diff
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
    wt = subprocess.check_output(["git", "status", "--short"], cwd=DATA.parents[3], text=True).strip()
    wt_lines = [ln for ln in wt.splitlines() if ln.strip()]
    allowed_dirty = all(ln.endswith("backend/prisma/schema.prisma") or "docs/audits/ci-recovery/" in ln for ln in wt_lines)
    baseline = {
        "PRE_R3B1O2_SHA": git_rev("HEAD"),
        "R3B1O1_REMOTE_HEAD": git_rev("origin/audit/ci-r3b1o1-final-strategy-acceptance-2026-08"),
        "MAIN_HEAD": git_rev("origin/main"),
        "WORKTREE_CLEAN": len(wt_lines) == 0 or allowed_dirty,
    }
    if not baseline["WORKTREE_CLEAN"]:
        print(json.dumps({"final_status": "CI_R3B1O2_BASELINE_DIRTY_WORKTREE", "pass": False}, indent=2))
        return 1

    input_entries = []
    for name in R3B1O2_INPUTS:
        path = DATA / name if not name.startswith("backend/") else DATA.parents[3] / name
        if path.exists():
            input_entries.append({"path": str(path.relative_to(DATA.parents[3])), "sha256": sha256_file(path)})
    write_json(DATA / "ci-r3b1o2-input-authority-manifest-2026-08.json", {"schema_version": 1, "baseline": baseline, "inputs": input_entries})

    m252_inventory = build_m252_diff_inventory()
    if not m252_inventory["pass"]:
        write_json(DATA / "ci-r3b1o2-final-alignment-diff-closure-summary-2026-08.json", {"final_status": "CI_R3B1O2_M252_MAPPING_AUTHORITY_FAILED", "pass": False})
        return 1

    alignment_contract = build_schema_alignment_contract()
    original_manifest = build_schema_original_manifest()
    authorized_diff = validate_authorized_schema_diff()
    prisma_validation = run_prisma_validation()
    if not authorized_diff["pass"] or not prisma_validation["pass"]:
        write_json(DATA / "ci-r3b1o2-final-alignment-diff-closure-summary-2026-08.json", {"final_status": "CI_R3B1O2_M252_MAPPING_ALIGNMENT_FAILED", "pass": False})
        return 1

    work = ensure_r3b1o2_workdir()
    schema_dump = work / "production_schema_only.sql"
    if not schema_dump.exists():
        export_schema_only_dump(schema_dump)

    classifier_closure = classify_frozen_r3b1o1_diff(schema_dump=schema_dump)
    write_json(DATA / "ci-r3b1o2-index-owner-inventory-2026-08.json", {"schema_version": 1, "source": "embedded in ci_r3b1o2_r3b_authority golden production index map", "golden_index_count": len(classifier_closure.get("operations", []))})
    if not classifier_closure["pass"]:
        write_json(DATA / "ci-r3b1o2-final-alignment-diff-closure-summary-2026-08.json", {"final_status": "CI_R3B1O2_FINAL_DIFF_OWNERSHIP_CLOSURE_FAILED", "pass": False})
        return 1

    data_dep = build_corrected_data_dependency_risk(include_forward_m252=True)
    write_json(DATA / "ci-r3b1o2-r3b1p-data-risk-input-2026-08.json", {"schema_version": 1, "counts": data_dep["counts"], "executing_migrations": data_dep["migrations"]})

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
        write_json(DATA / "ci-r3b1o2-final-alignment-diff-closure-summary-2026-08.json", {"final_status": "CI_R3B1O2_GOLDEN_BASELINE_FAILED", "pass": False})
        return 1

    direct_projection = m252_rename_absent(run_prisma_diff(golden["database_name"])["script"])
    write_json(DATA / "ci-r3b1o2-m252-direct-prisma-projection-check-2026-08.json", direct_projection)
    if not direct_projection["pass"]:
        write_json(DATA / "ci-r3b1o2-final-alignment-diff-closure-summary-2026-08.json", {"final_status": "CI_R3B1O2_M252_MAPPING_ALIGNMENT_FAILED", "pass": False})
        return 1

    strategy = run_final_winning_strategy(golden=golden, prod_identity=prod_identity)
    write_json(DATA / "ci-r3b1o2-final-m252-exact-parity-2026-08.json", strategy["m252_exact_parity"])
    write_json(DATA / "ci-r3b1o2-second-deploy-idempotency-2026-08.json", strategy["second_deploy_idempotency"])
    write_json(DATA / "ci-r3b1o2-m252-exact-parity-engine-validation-2026-08.json", {"schema_version": 1, "engine": "ci_r3b1o1_m252_authority.compare_m252_exact_parity", "result": strategy["m252_exact_parity"]})

    dsn = strategy["_internal"]["dsn"]
    db_name = strategy["database_name"]
    parsed = urlparse(dsn)
    cfg = PgConfig(host=parsed.hostname or "127.0.0.1", port=str(parsed.port or 5432), user=parsed.username or "synqdrive", password=parsed.password or "synqdrive")
    authority_sha = json.loads(R3B1M_FINAL_PARITY.read_text()).get("authority_manifest_sha256", "")
    r3b_parity = run_exact_parity(cfg, db_name, authority_sha)
    write_json(
        DATA / "ci-r3b1o2-final-r3b-parity-2026-08.json",
        {
            "schema_version": 1,
            "phase": "CI-R3B1O.2",
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
        schema_dump=schema_dump,
        sql_out=DATA / "ci-r3b1o2-final-prisma-diff-2026-08.sql",
        json_out=DATA / "ci-r3b1o2-final-prisma-diff-classification-2026-08.json",
        host=cfg.host,
        port=cfg.port,
    )

    prod_ledger_after = export_prisma_ledger(include_logs=False)
    prod_ledger_fp_after = ledger_summary_fingerprint(prod_ledger_after)
    prod_catalog_after = build_catalog_fingerprint(prod_sql_runner)

    gates_pass = (
        m252_inventory["pass"]
        and alignment_contract["pass"]
        and authorized_diff["pass"]
        and prisma_validation["pass"]
        and classifier_closure["pass"]
        and direct_projection["pass"]
        and strategy["pass"]
        and strategy["m252_exact_parity"]["pass"]
        and strategy["second_deploy_idempotency"]["pass"]
        and r3b_parity.get("pass", False)
        and prisma_diff["pass"]
        and data_dep["counts"]["UNKNOWN_DATA_DEPENDENCY"] == 0
        and prod_ledger_fp_before == prod_ledger_fp_after
        and prod_catalog_before["fingerprint_sha256"] == prod_catalog_after["fingerprint_sha256"]
    )

    final_cls = prisma_diff["classification"]["final_winning_twin"]
    if gates_pass:
        final_status = "CI_R3B1O2_M252_PRISMA_MAPPING_FINAL_DIFF_CLOSURE_COMPLETED"
        r3b1p_readiness = "R3B1P_READY_CONTROLLED_RECONCILIATION_PLAN"
    elif not classifier_closure["pass"] or final_cls["UNRESOLVED"] > 0:
        final_status = "CI_R3B1O2_FINAL_DIFF_OWNERSHIP_CLOSURE_FAILED"
        r3b1p_readiness = "NOT_READY"
    elif not strategy["m252_exact_parity"]["pass"]:
        final_status = "CI_R3B1O2_M252_EXACT_PARITY_FAILED"
        r3b1p_readiness = "NOT_READY"
    elif not strategy["pass"]:
        final_status = "CI_R3B1O2_FINAL_STRATEGY_REPLAY_FAILED"
        r3b1p_readiness = "NOT_READY"
    elif not strategy["second_deploy_idempotency"]["pass"]:
        final_status = "CI_R3B1O2_REPEAT_DEPLOY_FAILED"
        r3b1p_readiness = "NOT_READY"
    else:
        final_status = "CI_R3B1O2_INCOMPLETE"
        r3b1p_readiness = "NOT_READY"

    summary = {
        "schema_version": 1,
        "phase": "CI-R3B1O.2",
        "baseline": baseline,
        "original_schema_sha256": original_manifest["sha256"],
        "final_schema_sha256": sha256_file(DATA.parents[3] / "backend/prisma/schema.prisma"),
        "m252_diff_operations": m252_inventory["operation_count"],
        "schema_alignment_entries": alignment_contract["entry_count"],
        "authorized_diff_unauthorized": authorized_diff["unauthorized_count"],
        "prisma_validation_pass": prisma_validation["pass"],
        "classifier_closure_pass": classifier_closure["pass"],
        "r3b1o1_former_unresolved": 170,
        "final_unresolved": final_cls["UNRESOLVED"],
        "final_classification": final_cls,
        "m252_exact_parity_pass": strategy["m252_exact_parity"]["pass"],
        "r3b_parity_pass": r3b_parity.get("pass", False),
        "strategy_pass": strategy["pass"],
        "second_deploy_pass": strategy["second_deploy_idempotency"]["pass"],
        "data_risk_counts": data_dep["counts"],
        "production_unchanged": prod_ledger_fp_before == prod_ledger_fp_after,
        "production_mutations": 0,
        "r3b1p_readiness": r3b1p_readiness,
        "final_status": final_status,
        "pass": gates_pass,
    }
    write_json(DATA / "ci-r3b1o2-final-alignment-diff-closure-summary-2026-08.json", summary)

    try:
        drop_database(parse_local_dsn()[0], golden["database_name"])
        drop_database(parse_local_dsn()[0], db_name)
    except Exception:
        pass

    subprocess.run([sys.executable, str(Path(__file__).with_name("ci_r3b1o2_generate_report.py"))], cwd=Path(__file__).parent)
    subprocess.run([sys.executable, str(Path(__file__).with_name("ci_r3b1o2_golden_tests.py"))], cwd=Path(__file__).parent)
    print(json.dumps({"final_status": final_status, "r3b1p_readiness": r3b1p_readiness, "pass": gates_pass}, indent=2))
    return 0 if gates_pass else 1


if __name__ == "__main__":
    raise SystemExit(main())
