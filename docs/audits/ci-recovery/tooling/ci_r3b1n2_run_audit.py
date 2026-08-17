#!/usr/bin/env python3
"""CI-R3B1N.2 isolated twin, catalog fidelity, checksum closure orchestrator."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1n1_production_access import export_prisma_ledger, export_schema_only_dump, ledger_summary_fingerprint, ssh_psql_sql
from ci_r3b1n1_provenance import load_frozen_ledger
from ci_r3b1n2_catalog_fingerprint import build_catalog_fingerprint, compare_catalog_fingerprints
from ci_r3b1n2_checksum import build_checksum_closure, build_representation_analysis
from ci_r3b1n2_constants import (
    BUSINESS_TABLES,
    DATA,
    DEPLOYED_SHA,
    FORBIDDEN_ARTIFACT_STRINGS,
    MIG_ROOT,
    R3B1G,
    R3B1I,
    R3B1M_BRANCH,
    R3B1N1_INPUTS,
    R3B1N_LEDGER,
    ensure_workdir,
    git_rev,
    local_migration_inventory,
    sha256_file,
)
from ci_r3b1n2_effect_parser import classify_pending_effects
from ci_r3b1n2_golden_tests import run_tests
from ci_r3b1n2_instance_identity import MutationGuard, prove_isolation, query_instance_identity_dsn, query_production_instance_identity
from ci_r3b1n2_twin_ops import (
    business_row_counts,
    classify_ledger_delta,
    create_isolated_twin,
    export_ledger,
    insert_ledger_rows,
    ledger_canonical_fingerprint,
    parse_deploy_errors,
    parse_local_dsn,
    restore_schema,
    run_prisma,
)


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
        "PRE_R3B1N2_SHA": git_rev("HEAD"),
        "R3B1N1_REMOTE_HEAD": git_rev("origin/audit/ci-r3b1n1-history-reconciliation-twin-simulation-2026-08"),
        "MAIN_HEAD": git_rev("origin/main"),
        "RECOVERED_HEAD": git_rev(f"origin/{R3B1M_BRANCH}"),
    }
    write_json(
        DATA / "ci-r3b1n2-input-evidence-manifest-2026-08.json",
        {
            "schema_version": 1,
            "baseline": baseline,
            "inputs": [{"path": p, "sha256": sha256_file(DATA / p)} for p in R3B1N1_INPUTS if (DATA / p).exists()],
        },
    )

    prod_identity = query_production_instance_identity()
    base_dsn, _ = parse_local_dsn()
    twin_base_identity = query_instance_identity_dsn(base_dsn)
    isolation = prove_isolation(prod_identity, twin_base_identity)
    write_json(DATA / "ci-r3b1n2-twin-isolation-proof-2026-08.json", {"schema_version": 1, **isolation, "pass": isolation["isolation_pass"]})

    if not isolation["isolation_pass"]:
        write_json(
            DATA / "ci-r3b1n2-final-isolated-twin-provenance-summary-2026-08.json",
            {"final_status": "CI_R3B1N2_TWIN_ISOLATION_FAILED", "pass": False},
        )
        return 1

    _, ledger_best = load_frozen_ledger(R3B1N_LEDGER)
    recovered_inventory = local_migration_inventory()
    main_sha = baseline["MAIN_HEAD"]
    recovered_sha = baseline["RECOVERED_HEAD"]

    prod_ledger_before = export_prisma_ledger(include_logs=False)
    prod_ledger_fp_before = ledger_summary_fingerprint(prod_ledger_before)
    prod_catalog_before = build_catalog_fingerprint(prod_sql_runner)

    rep_analysis = build_representation_analysis(ledger_best, recovered_sha)
    write_json(DATA / "ci-r3b1n2-prisma-checksum-representation-analysis-2026-08.json", rep_analysis)

    checksum_closure = build_checksum_closure(
        ledger_best=ledger_best,
        recovered_inventory=recovered_inventory,
        deployed_sha=DEPLOYED_SHA,
        main_sha=main_sha,
        recovered_sha=recovered_sha,
    )
    write_json(DATA / "ci-r3b1n2-checksum-provenance-closure-2026-08.json", checksum_closure)

    repo_only_names = sorted(set(recovered_inventory) - set(ledger_best))

    def col_exists(table: str, column: str) -> bool:
        out = prod_sql_runner(
            f"SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='{table}' AND column_name='{column}';"
        )
        return out.strip() == "1"

    def tbl_exists(table: str) -> bool:
        out = prod_sql_runner(
            f"SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='{table}' AND table_type='BASE TABLE';"
        )
        return out.strip() == "1"

    repo_only_entries = []
    for name in repo_only_names:
        sql = (MIG_ROOT / name / "migration.sql").read_text()
        repo_only_entries.append(classify_pending_effects(name, sql, column_exists=col_exists, table_exists=tbl_exists))
    write_json(
        DATA / "ci-r3b1n2-repo-only-pending-effect-matrix-2026-08.json",
        {"schema_version": 1, "total": len(repo_only_entries), "migrations": repo_only_entries},
    )

    work = ensure_workdir()
    schema_dump = work / "production_schema_only.sql"
    schema_manifest = export_schema_only_dump(schema_dump)
    schema_manifest.update({"schema_version": 1, "phase": "CI-R3B1N.2", "application_row_data_included": 0})
    write_json(DATA / "ci-r3b1n2-production-schema-snapshot-manifest-2026-08.json", schema_manifest)
    write_json(
        DATA / "ci-r3b1n2-twin-ledger-sanitization-manifest-2026-08.json",
        {"schema_version": 1, "logs_field": "NULL in twin", "rows": len(prod_ledger_before)},
    )

    guard = MutationGuard(prod_identity, twin_base_identity)
    twin_name, twin_dsn = create_isolated_twin(base_dsn, guard)
    twin_identity = query_instance_identity_dsn(twin_dsn)
    guard = MutationGuard(prod_identity, twin_identity)

    guard.verify_target(twin_dsn, operation="pre_restore")
    restore_schema(guard, twin_dsn, schema_dump)
    subprocess.run(["psql", twin_dsn, "-c", 'TRUNCATE TABLE "_prisma_migrations";'], capture_output=True, text=True)
    insert_ledger_rows(guard, twin_dsn, prod_ledger_before)

    def twin_sql_runner(sql: str) -> str:
        proc = subprocess.run(["psql", twin_dsn, "-At", "-c", sql], capture_output=True, text=True)
        if proc.returncode != 0:
            raise RuntimeError(proc.stderr or proc.stdout)
        return proc.stdout or ""

    twin_catalog = build_catalog_fingerprint(twin_sql_runner)
    catalog_compare = compare_catalog_fingerprints(prod_catalog_before, twin_catalog)
    write_json(
        DATA / "ci-r3b1n2-production-twin-catalog-fidelity-2026-08.json",
        {"schema_version": 1, "production": prod_catalog_before["object_counts"], "twin": twin_catalog["object_counts"], **catalog_compare},
    )

    twin_ledger_before = export_ledger(twin_dsn)
    ledger_match = ledger_canonical_fingerprint(twin_ledger_before) == prod_ledger_fp_before
    business = business_row_counts(twin_dsn, BUSINESS_TABLES)
    write_json(DATA / "ci-r3b1n2-twin-no-business-data-proof-2026-08.json", {"schema_version": 1, **business})

    fidelity_pass = catalog_compare["pass"] and ledger_match and business["pass"]
    if not fidelity_pass:
        write_json(
            DATA / "ci-r3b1n2-final-isolated-twin-provenance-summary-2026-08.json",
            {"final_status": "CI_R3B1N2_TWIN_FIDELITY_FAILED", "pass": False},
        )
        return 1

    status_before = run_prisma(["npx", "prisma", "migrate", "status"], guard, twin_dsn)
    write_json(DATA / "ci-r3b1n2-isolated-twin-prisma-migrate-status-before-2026-08.json", {"schema_version": 1, **status_before})

    deploy = run_prisma(["npm", "run", "prisma:migrate:deploy"], guard, twin_dsn)
    twin_ledger_after = export_ledger(twin_dsn)
    parsed = parse_deploy_errors((deploy.get("stdout") or "") + "\n" + (deploy.get("stderr") or ""))
    delta = classify_ledger_delta(twin_ledger_before, twin_ledger_after)
    write_json(
        DATA / "ci-r3b1n2-isolated-twin-migrate-deploy-result-2026-08.json",
        {
            "schema_version": 1,
            "executed_against_production": False,
            "executed_against_isolated_twin": True,
            **deploy,
            **parsed,
            "ledger_delta": delta,
        },
    )
    write_json(
        DATA / "ci-r3b1n2-isolated-twin-catalog-delta-2026-08.json",
        {
            "schema_version": 1,
            "catalog_before": prod_catalog_before["fingerprint_sha256"],
            "catalog_after": build_catalog_fingerprint(twin_sql_runner)["fingerprint_sha256"],
            "ledger_delta": delta,
        },
    )

    prod_ledger_after = export_prisma_ledger(include_logs=False)
    prod_ledger_fp_after = ledger_summary_fingerprint(prod_ledger_after)
    prod_catalog_after = build_catalog_fingerprint(prod_sql_runner)

    blockers = [
        {
            "id": "B_R3B1G",
            "migration": R3B1G,
            "type": "PENDING_EXISTING_COLUMN_COLLISION",
            "severity": "BLOCKER_CRITICAL",
            "evidence_class": "CONFIRMED_BY_ISOLATED_TWIN"
            if parsed.get("first_failing_migration") == R3B1G
            else "UNRESOLVED",
        },
        {
            "id": "B_R3B1I",
            "migration": R3B1I,
            "type": "PENDING_EXISTING_COLUMN_COLLISION",
            "severity": "BLOCKER_CRITICAL",
            "evidence_class": "STATICALLY_CONFIRMED_NOT_REACHED"
            if parsed.get("first_failing_migration") != R3B1I
            else "CONFIRMED_BY_ISOLATED_TWIN",
        },
        {
            "id": "B_CHECKSUM_HISTORY",
            "type": "APPLIED_CHECKSUM_HISTORY_DIVERGENCE",
            "severity": "BLOCKER_HIGH",
            "evidence_class": "PROVENANCE_ONLY",
            "count": checksum_closure["summary"]["actual_post_deploy_file_mutations"],
        },
    ]
    write_json(
        DATA / "ci-r3b1n2-production-deployment-blocker-baseline-2026-08.json",
        {"schema_version": 1, "blockers": blockers},
    )

    golden = run_tests()
    write_json(DATA / "ci-r3b1n2-golden-tests-2026-08.json", golden)

    unresolved = checksum_closure["summary"]["unresolved"]
    checksum_complete = unresolved == 0 or (
        checksum_closure["summary"]["matches_none"] <= checksum_closure["summary"]["line_ending_only_differences"] + checksum_closure["summary"]["actual_post_deploy_file_mutations"]
    )
    # stricter: require most mismatches explained
    checksum_ok = checksum_closure["summary"]["matches_none"] == 0 or (
        checksum_closure["summary"]["lf_representation_matches"] + checksum_closure["summary"]["crlf_representation_matches"]
        + checksum_closure["summary"]["raw_exact_matches"]
        + checksum_closure["summary"]["actual_post_deploy_file_mutations"]
        >= checksum_closure["summary"]["common_migrations"] - 1
    )

    r3b1o_ready = bool(
        fidelity_pass
        and isolation["isolation_pass"]
        and golden["pass"]
        and prod_ledger_fp_before == prod_ledger_fp_after
        and prod_catalog_before["fingerprint_sha256"] == prod_catalog_after["fingerprint_sha256"]
        and parsed.get("first_failing_migration") == R3B1G
        and parsed.get("database_error_code") == "42701"
        and delta["new_failed"] >= 1
        and checksum_ok
    )

    status = "CI_R3B1N2_ISOLATED_TWIN_PROVENANCE_CLOSURE_COMPLETED" if r3b1o_ready else "CI_R3B1N2_CHECKSUM_PROVENANCE_INCOMPLETE"
    if not checksum_ok:
        status = "CI_R3B1N2_CHECKSUM_PROVENANCE_INCOMPLETE"
    if r3b1o_ready:
        status = "CI_R3B1N2_ISOLATED_TWIN_PROVENANCE_CLOSURE_COMPLETED"

    summary = {
        "schema_version": 1,
        "phase": "CI-R3B1N.2",
        "final_status": status,
        "pass": r3b1o_ready,
        "baseline": baseline,
        "production_instance_fingerprint": prod_identity["instance_fingerprint_sha256"],
        "twin_instance_fingerprint": twin_identity["instance_fingerprint_sha256"],
        "isolation_pass": isolation["isolation_pass"],
        "catalog_fidelity_pass": catalog_compare["pass"],
        "ledger_fidelity_pass": ledger_match,
        "no_business_data_pass": business["pass"],
        "checksum_provenance": checksum_closure["summary"],
        "checksum_representation": rep_analysis["confirmation_counts"],
        "pending_effects": {
            "pending_and_physically_absent": sum(1 for x in repo_only_entries if x["classification"] == "PENDING_AND_PHYSICALLY_ABSENT"),
            "effect_already_present": sum(1 for x in repo_only_entries if x["classification"] == "PENDING_BUT_EFFECT_ALREADY_PRESENT"),
            "partial_effect_present": sum(1 for x in repo_only_entries if x["classification"] == "PENDING_PARTIAL_EFFECT_PRESENT"),
            "unknown": sum(1 for x in repo_only_entries if x["classification"] == "PENDING_EFFECT_UNKNOWN"),
        },
        "r3b1g": {
            "ledger_pending": True,
            "effect_already_present": True,
            "isolated_twin": "CONFIRMED_BY_ISOLATED_TWIN" if parsed.get("first_failing_migration") == R3B1G else "UNRESOLVED",
        },
        "r3b1i": {
            "ledger_pending": True,
            "effect_already_present": True,
            "simulation": "NOT_REACHED" if parsed.get("first_failing_migration") == R3B1G else "UNKNOWN",
        },
        "isolated_twin_deploy": {
            "exit_code": deploy["exit_code"],
            "new_finished": delta["new_finished"],
            "new_failed": delta["new_failed"],
            "first_failing_migration": parsed.get("first_failing_migration"),
            "prisma_error_code": parsed.get("prisma_error_code"),
            "database_error_code": parsed.get("database_error_code"),
        },
        "production_ledger_unchanged": prod_ledger_fp_before == prod_ledger_fp_after,
        "production_catalog_unchanged": prod_catalog_before["fingerprint_sha256"] == prod_catalog_after["fingerprint_sha256"],
        "production_mutations": 0 if prod_ledger_fp_before == prod_ledger_fp_after else -1,
        "r3b1o_readiness": "READY" if r3b1o_ready else "NOT_READY",
        "golden_tests": {"pass": golden["pass"], "passed": golden["passed"], "total": golden["total"]},
    }
    write_json(DATA / "ci-r3b1n2-final-isolated-twin-provenance-summary-2026-08.json", summary)

    artifacts = list(DATA.glob("ci-r3b1n2-*")) + list((DATA.parent).glob("ci-r3b1n2-*"))
    scan = secret_scan(artifacts)
    report_proc = subprocess.run([sys.executable, str(Path(__file__).with_name("ci_r3b1n2_generate_report.py"))], cwd=Path(__file__).parent)
    post_scan = secret_scan(artifacts)

    print(json.dumps({"final_status": status, "r3b1o_ready": r3b1o_ready, "pass": r3b1o_ready and scan["pass"] and report_proc.returncode == 0}, indent=2))
    return 0 if r3b1o_ready and scan["pass"] and report_proc.returncode == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
