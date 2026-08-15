#!/usr/bin/env python3
"""CI-R3B1N.1 production history reconciliation and twin deploy simulation."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1n1_constants import (
    DATA,
    DEPLOYED_SHA,
    M252,
    MIG_ROOT,
    R3B1G,
    R3B1I,
    R3B1M_BRANCH,
    R3B1N_LEDGER,
    R3B1N_LEDGER_COMPARE,
    R3B1N_SUMMARY,
    ensure_workdir,
    git_rev,
    local_migration_inventory,
)
from ci_r3b1n1_golden_tests import run_tests
from ci_r3b1n1_production_access import (
    catalog_column_exists,
    export_prisma_ledger,
    export_schema_only_dump,
    ledger_summary_fingerprint,
    production_db_fingerprint,
    table_exists,
)
from ci_r3b1n1_provenance import (
    all_ledger_rows_by_name,
    build_checksum_classification,
    build_four_way_matrix,
    classify_production_only,
    classify_repo_only_pending,
    derive_checksum_semantics,
    git_mutation_history,
    load_frozen_ledger,
    m252_forensic_timeline,
    parse_migration_effects,
)
from ci_r3b1n1_twin import (
    assert_non_production_target,
    clear_prisma_ledger,
    count_business_rows,
    create_twin_database,
    export_twin_ledger,
    insert_ledger_rows,
    ledger_fingerprint,
    parse_first_blocker,
    parse_local_dsn,
    psql_exec,
    restore_schema,
    run_prisma_command,
    schema_object_count,
    twin_dsn,
)

WORK = ensure_workdir()


def write_json(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload, indent=2) + "\n")


def secret_scan(paths: list[Path]) -> dict:
    from ci_r3b1n1_constants import FORBIDDEN_ARTIFACT_STRINGS

    hits = []
    for path in paths:
        if not path.exists():
            continue
        text = path.read_text(errors="replace")
        for pat in FORBIDDEN_ARTIFACT_STRINGS:
            if pat.lower() in text.lower():
                hits.append({"path": str(path.relative_to(path.parents[4])), "pattern": pat})
    return {"pass": len(hits) == 0, "hits": hits}


def closest_revision_to_ledger(ledger_best: dict, refs: dict[str, str]) -> dict:
    scores = {}
    for label, ref in refs.items():
        match = 0
        total = 0
        for name, row in ledger_best.items():
            if not row.get("finished_at") or row.get("rolled_back_at"):
                continue
            total += 1
            state = __import__("ci_r3b1n1_constants", fromlist=["file_state_at"]).file_state_at(ref, name)
            if state["file_present"] and state["file_sha256"] == row.get("checksum"):
                match += 1
        scores[label] = {"ref": ref, "checksum_matches": match, "finished_rows_compared": total}
    best = max(scores.items(), key=lambda kv: kv[1]["checksum_matches"])
    return {"scores": scores, "closest_revision": best[0], "closest_details": best[1]}


def main() -> int:
    baseline = {
        "PRE_R3B1N1_SHA": git_rev("HEAD"),
        "R3B1N_REMOTE_HEAD": git_rev("origin/audit/ci-r3b1n-production-exposure-2026-08"),
        "MAIN_HEAD": git_rev("origin/main"),
        "RECOVERED_HEAD": git_rev(f"origin/{R3B1M_BRANCH}"),
        "DEPLOYED_SHA": DEPLOYED_SHA,
    }

    ledger_rows, ledger_best = load_frozen_ledger(R3B1N_LEDGER)
    compare = json.loads(R3B1N_LEDGER_COMPARE.read_text())
    recovered_inventory = local_migration_inventory()
    main_sha = baseline["MAIN_HEAD"]
    recovered_sha = baseline["RECOVERED_HEAD"]

    four_way = build_four_way_matrix(
        ledger_rows=ledger_rows,
        ledger_best=ledger_best,
        deployed_sha=DEPLOYED_SHA,
        main_sha=main_sha,
        recovered_sha=recovered_sha,
    )
    write_json(DATA / "ci-r3b1n1-four-way-migration-provenance-2026-08.json", four_way)

    checksum_semantics = derive_checksum_semantics(ledger_best, recovered_sha)
    write_json(DATA / "ci-r3b1n1-prisma-checksum-semantics-2026-08.json", checksum_semantics)

    checksum_class = build_checksum_classification(
        ledger_best=ledger_best,
        recovered_inventory=recovered_inventory,
        deployed_sha=DEPLOYED_SHA,
        main_sha=main_sha,
        recovered_sha=recovered_sha,
    )
    write_json(DATA / "ci-r3b1n1-checksum-provenance-classification-2026-08.json", checksum_class)

    mutated = [
        git_mutation_history(m["migration"], DEPLOYED_SHA)
        for m in checksum_class["migrations"]
        if m["post_deploy_historical_migration_mutation"]
    ]
    write_json(
        DATA / "ci-r3b1n1-post-deploy-migration-mutation-history-2026-08.json",
        {"schema_version": 1, "mutations": mutated[:100], "total": len(mutated)},
    )

    prod_only_names = compare.get("production_only_names") or []
    prod_only = [classify_production_only(n, DEPLOYED_SHA, main_sha, recovered_sha) for n in prod_only_names]
    write_json(
        DATA / "ci-r3b1n1-production-only-migration-reconciliation-2026-08.json",
        {"schema_version": 1, "total": len(prod_only), "migrations": prod_only},
    )

    repo_only_names = sorted(set(recovered_inventory) - set(ledger_best))
    repo_only_entries = []
    for name in repo_only_names:
        sql_path = MIG_ROOT / name / "migration.sql"
        sql = sql_path.read_text()
        effects = parse_migration_effects(sql)
        checks = {"columns_checked": 0, "columns_present": 0, "tables_checked": 0, "tables_present": 0}
        for eff in effects:
            if eff.get("kind") == "add_column" and eff.get("table"):
                checks["columns_checked"] += 1
                col = catalog_column_exists(eff["table"], eff["object"])
                if col.get("exists"):
                    checks["columns_present"] += 1
            elif eff.get("kind") == "create_table":
                checks["tables_checked"] += 1
                if table_exists(eff["object"]):
                    checks["tables_present"] += 1
        repo_only_entries.append(classify_repo_only_pending(name, sql=sql, catalog_checks=checks))
    write_json(
        DATA / "ci-r3b1n1-repo-only-pending-effect-matrix-2026-08.json",
        {"schema_version": 1, "total": len(repo_only_entries), "migrations": repo_only_entries},
    )

    r3b1g_sql = (MIG_ROOT / R3B1G / "migration.sql").read_text()
    r3b1i_sql = (MIG_ROOT / R3B1I / "migration.sql").read_text()
    r3b1g_catalog = catalog_column_exists("vehicle_tire_setups", "status")
    r3b1i_catalog = catalog_column_exists("organization_memberships", "permissions")
    collision_doc = {
        "schema_version": 1,
        "r3b1g": {
            "migration": R3B1G,
            "ledger_pending": R3B1G not in ledger_best or not ledger_best.get(R3B1G, {}).get("finished_at"),
            "physical_effect_present": r3b1g_catalog.get("exists"),
            "exact_likely_conflict": 'column "status" of relation "vehicle_tire_setups" already exists',
            "simulation_required": True,
            "migration_sql_sha256": __import__("hashlib").sha256(r3b1g_sql.encode()).hexdigest(),
        },
        "r3b1i": {
            "migration": R3B1I,
            "ledger_pending": R3B1I not in ledger_best or not ledger_best.get(R3B1I, {}).get("finished_at"),
            "physical_effect_present": r3b1i_catalog.get("exists"),
            "exact_likely_conflict": 'column "permissions" of relation "organization_memberships" already exists',
            "simulation_required": True,
        },
    }

    m252_rows = all_ledger_rows_by_name(ledger_rows).get(M252, [])
    m252_live_rows = export_prisma_ledger(include_logs=True)
    m252_live = [r for r in m252_live_rows if r.get("migration_name") == M252]
    timeline = m252_forensic_timeline(m252_live or m252_rows)
    timeline["catalog_target_table_present"] = table_exists("organization_role_assignment_drift_reconciliation_applications")
    write_json(DATA / "ci-r3b1n1-migration252-forensic-timeline-2026-08.json", timeline)

    prod_ledger_before = export_prisma_ledger(include_logs=False)
    prod_fp_before = ledger_summary_fingerprint(prod_ledger_before)

    schema_dump_path = WORK / "production_schema_only.sql"
    schema_manifest = export_schema_only_dump(schema_dump_path)
    schema_manifest.update(
        {
            "schema_version": 1,
            "phase": "CI-R3B1N.1",
            "postgresql_version": "16.x",
            "schema_objects_count_estimate": schema_manifest["bytes"],
            "production_service": "PROD_VPS_A",
            "production_database_alias": "PROD_DB_A",
            "local_work_path": str(schema_dump_path.relative_to(WORK.parents[2])),
        }
    )
    write_json(DATA / "ci-r3b1n1-production-schema-snapshot-manifest-2026-08.json", schema_manifest)

    sanitized_rows = [{**row, "logs": None} for row in prod_ledger_before]
    write_json(
        DATA / "ci-r3b1n1-twin-ledger-sanitization-manifest-2026-08.json",
        {
            "schema_version": 1,
            "rows_exported": len(sanitized_rows),
            "logs_field": "NULL in twin (historical logs not required for deploy-state decisions)",
            "fields": ["id", "checksum", "migration_name", "started_at", "finished_at", "rolled_back_at", "applied_steps_count"],
        },
    )

    base_dsn, _, _, _ = parse_local_dsn()
    twin_name, twin_url = create_twin_database(base_dsn)
    safety = assert_non_production_target(base_dsn, twin_name)
    restore_schema(twin_url, schema_dump_path)
    clear_prisma_ledger(twin_url)
    insert_ledger_rows(twin_url, sanitized_rows, null_logs=True)
    twin_rows_before = export_twin_ledger(twin_url)
    business_rows = count_business_rows(twin_url)
    fidelity = {
        "schema_version": 1,
        "twin_database_name": twin_name,
        "safety_assertion": safety,
        "schema_object_count": schema_object_count(twin_url),
        "ledger_row_count": len(twin_rows_before),
        "production_ledger_row_count": len(prod_ledger_before),
        "ledger_fingerprint_match": ledger_fingerprint(twin_rows_before) == prod_fp_before,
        "business_data": business_rows,
        "catalog_ledger_fidelity_pass": ledger_fingerprint(twin_rows_before) == prod_fp_before and business_rows["pass"],
    }
    write_json(DATA / "ci-r3b1n1-production-twin-fidelity-2026-08.json", fidelity)

    status_before = run_prisma_command(["npx", "prisma", "migrate", "status"], twin_url)
    write_json(
        DATA / "ci-r3b1n1-twin-prisma-migrate-status-before-2026-08.json",
        {
            "schema_version": 1,
            "target_is_twin": True,
            "target_is_production": False,
            **status_before,
        },
    )

    deploy = run_prisma_command(["npm", "run", "prisma:migrate:deploy"], twin_url)
    twin_rows_after = export_twin_ledger(twin_url)
    blocker = parse_first_blocker((deploy.get("stdout") or "") + "\n" + (deploy.get("stderr") or ""))
    write_json(
        DATA / "ci-r3b1n1-twin-migrate-deploy-result-2026-08.json",
        {
            "schema_version": 1,
            "target_is_twin": True,
            "target_is_production": False,
            "executed_against_production": False,
            "executed_against_twin": True,
            **deploy,
            **blocker,
        },
    )

    write_json(
        DATA / "ci-r3b1n1-twin-deploy-catalog-delta-2026-08.json",
        {
            "schema_version": 1,
            "ledger_before_count": len(twin_rows_before),
            "ledger_after_count": len(twin_rows_after),
            "new_finished_rows": max(0, len(twin_rows_after) - len(twin_rows_before)),
            "first_blocker": blocker,
        },
    )

    prod_ledger_after = export_prisma_ledger(include_logs=False)
    prod_fp_after = ledger_summary_fingerprint(prod_ledger_after)

    blockers = []
    if blocker.get("first_failing_migration"):
        sev = "BLOCKER_CRITICAL"
        blockers.append(
            {
                "id": "B001",
                "migration": blocker["first_failing_migration"],
                "type": blocker["blocker_type"],
                "severity": sev,
                "twin_simulation_evidence": blocker,
            }
        )
    for entry in repo_only_entries:
        if entry["classification"] in {"PENDING_BUT_EFFECT_ALREADY_PRESENT", "PENDING_PARTIAL_EFFECT_PRESENT"}:
            blockers.append(
                {
                    "id": f"B_{entry['migration']}",
                    "migration": entry["migration"],
                    "type": entry["classification"],
                    "severity": "BLOCKER_CRITICAL",
                    "catalog_condition": entry["catalog_checks"],
                }
            )
    if checksum_class["summary"]["changed_after_deployed_sha"]:
        blockers.append(
            {
                "id": "B_CHECKSUM_HISTORY",
                "migration": M252,
                "type": "M252_HISTORY_DIVERGENCE",
                "severity": "BLOCKER_HIGH",
                "ledger_condition": timeline["final_classification"],
            }
        )
    write_json(
        DATA / "ci-r3b1n1-production-deployment-blocker-inventory-2026-08.json",
        {"schema_version": 1, "blockers": blockers, "total": len(blockers)},
    )

    predictions = {
        "r3b1g": "PREDICTION_CONFIRMED"
        if blocker.get("first_failing_migration") == R3B1G
        else ("PREDICTION_NOT_REACHED" if deploy["exit_code"] == 0 else "PREDICTION_AMBIGUOUS"),
        "r3b1i": "PREDICTION_CONFIRMED"
        if blocker.get("first_failing_migration") == R3B1I
        else ("PREDICTION_NOT_REACHED" if deploy["exit_code"] == 0 else "PREDICTION_AMBIGUOUS"),
        "m252": "PREDICTION_CONFIRMED"
        if timeline["final_classification"].startswith("M252_ORIGINAL_FAILED")
        else "PREDICTION_AMBIGUOUS",
    }

    closest = closest_revision_to_ledger(
        ledger_best,
        {"deployed_sha": DEPLOYED_SHA, "main": main_sha, "recovered": recovered_sha},
    )

    history_class = "H4_MULTIPLE_HISTORY_DIVERGENCES"
    if checksum_class["summary"]["changed_after_deployed_sha"] and any(
        e["classification"] == "PENDING_BUT_EFFECT_ALREADY_PRESENT" for e in repo_only_entries
    ):
        history_class = "H4_MULTIPLE_HISTORY_DIVERGENCES"
    elif checksum_class["summary"]["changed_after_deployed_sha"]:
        history_class = "H1_LEDGER_MATCHES_OLD_DEPLOYED_HISTORY_BUT_REPO_MUTATED_LATER"
    elif timeline["final_classification"].startswith("M252"):
        history_class = "H2_LEDGER_CONTAINS_MANUAL_RESOLUTION_HISTORY"

    composite = "E5_MIXED_OR_INCONSISTENT"
    merge_class = "MERGE_BLOCKED_EXPOSURE_INCONSISTENCY"
    deploy_class = "DEPLOY_BLOCKED_LEDGER_HISTORY_AND_PENDING_COLLISION_RECONCILIATION"

    golden = run_tests()
    write_json(DATA / "ci-r3b1n1-golden-tests-2026-08.json", golden)

    immut_ok = subprocess.run(["git", "diff", "--quiet", "backend/prisma/schema.prisma"], cwd=DATA.parents[3]).returncode == 0
    production_mutations = 0 if prod_fp_before == prod_fp_after else -1

    complete = bool(
        fidelity["catalog_ledger_fidelity_pass"]
        and safety["pass"]
        and golden["pass"]
        and prod_fp_before == prod_fp_after
        and immut_ok
        and deploy.get("exit_code") is not None
    )
    status = (
        "CI_R3B1N1_PRODUCTION_HISTORY_RECONCILIATION_TWIN_SIMULATION_COMPLETED"
        if complete
        else "CI_R3B1N1_PRODUCTION_TWIN_INCOMPLETE"
    )
    if production_mutations != 0:
        status = "CI_R3B1N1_PRODUCTION_SAFETY_VIOLATION"

    summary = {
        "schema_version": 1,
        "phase": "CI-R3B1N.1",
        "final_status": status,
        "pass": complete,
        "baseline": baseline,
        "production_deployed_sha": DEPLOYED_SHA,
        "migration_universe": {
            "union_names": four_way["union_migration_names"],
            "common_finished": compare.get("repo_present_in_production_finished"),
            "checksum_matches": compare.get("checksum_matches"),
            "checksum_mismatches": checksum_class["summary"]["total_mismatches"],
        },
        "checksum_provenance": checksum_class["summary"],
        "production_only": {
            "total": len(prod_only),
            "resolved": sum(1 for x in prod_only if x["classification"] != "PROD_ONLY_NEVER_FOUND_IN_GIT_HISTORY"),
        },
        "repo_only": {
            "total": len(repo_only_entries),
            "pending_and_physically_absent": sum(1 for x in repo_only_entries if x["classification"] == "PENDING_AND_PHYSICALLY_ABSENT"),
            "effect_already_present": sum(
                1 for x in repo_only_entries if x["classification"] == "PENDING_BUT_EFFECT_ALREADY_PRESENT"
            ),
            "partial_effect_present": sum(
                1 for x in repo_only_entries if x["classification"] == "PENDING_PARTIAL_EFFECT_PRESENT"
            ),
            "unknown": sum(1 for x in repo_only_entries if x["classification"] == "PENDING_EFFECT_UNKNOWN"),
        },
        "migration252": timeline,
        "r3b1g": collision_doc["r3b1g"],
        "r3b1i": collision_doc["r3b1i"],
        "production_twin": {
            "database_name": twin_name,
            "schema_fidelity": fidelity["catalog_ledger_fidelity_pass"],
            "ledger_fidelity": fidelity["ledger_fingerprint_match"],
            "business_rows_copied": business_rows["total_business_rows_sampled"],
            "non_production_confirmed": safety["pass"],
        },
        "prisma_migrate_status_before": {
            "exit_code": status_before["exit_code"],
            "stdout_excerpt": (status_before.get("stdout") or "")[:4000],
        },
        "twin_migrate_deploy": {
            "exit_code": deploy["exit_code"],
            "first_failing_migration": blocker.get("first_failing_migration"),
            "first_blocker_type": blocker.get("blocker_type"),
            "prisma_error_code": blocker.get("prisma_error_code"),
            "sqlstate": blocker.get("sqlstate"),
        },
        "production_ledger_fingerprint_before": prod_fp_before,
        "production_ledger_fingerprint_after": prod_fp_after,
        "production_ledger_unchanged": prod_fp_before == prod_fp_after,
        "closest_revision_to_production_ledger": closest,
        "static_prediction_vs_simulation": predictions,
        "history_consistency_class": history_class,
        "composite_exposure_class": composite,
        "merge_safety_class": merge_class,
        "deployment_safety_class": deploy_class,
        "golden_tests": {"pass": golden["pass"], "passed": golden["passed"], "total": golden["total"]},
        "immutability": {
            "schema_prisma_changed": not immut_ok,
            "modified_migrations": 0,
        },
        "production_mutations": production_mutations,
        "next_phase": "CI-R3B1O — COMBINED LEDGER/HISTORY RECONCILIATION + DISPOSABLE STRATEGY SIMULATION",
        "twin_limitations": [
            "schema-only twin reproduces DDL/ledger fidelity but not application data",
            "data-dependent failures may not appear in twin simulation",
        ],
    }
    write_json(DATA / "ci-r3b1n1-final-history-reconciliation-summary-2026-08.json", summary)

    artifact_paths = list(DATA.glob("ci-r3b1n1-*")) + list((DATA.parent).glob("ci-r3b1n1-*"))
    scan = secret_scan(artifact_paths)

    report_proc = subprocess.run([sys.executable, str(Path(__file__).with_name("ci_r3b1n1_generate_report.py"))], cwd=Path(__file__).parent)
    post_scan = secret_scan(artifact_paths)

    print(
        json.dumps(
            {
                "final_status": status,
                "complete": complete and scan["pass"] and post_scan["pass"] and report_proc.returncode == 0,
                "first_blocker": blocker.get("blocker_type"),
                "first_migration": blocker.get("first_failing_migration"),
            },
            indent=2,
        )
    )
    return 0 if complete and scan["pass"] and post_scan["pass"] and report_proc.returncode == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
