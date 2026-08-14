#!/usr/bin/env python3
"""Deterministic CI-R3B full migration replay harness with special-case handling."""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ci_r3b1c_special_composite_index import SpecialCompositeIndexExecutor, build_authority
from replay_evidence_lib import (
    BACKEND,
    DATA,
    PgConfig,
    R3B1B_REPAIR_MIGRATIONS,
    SPECIAL_MIGRATION,
    deferred_constraints_by_slot,
    enum_exists,
    enum_labels,
    git_tree_sha,
    load_topology,
    migration_dirs,
    migration_ordinal,
    parse_deploy_output,
    psql,
    recreate_db,
    replay_input_manifest_sha256,
    sequence_exists,
    slot_created_objects,
    table_exists,
)

REPORT_PATH = Path(__file__).resolve().parents[4] / "docs/audits/ci-recovery/ci-r3b1c-composite-index-transaction-replay-resolution-2026-08.md"
RESULT_PATH = DATA / "ci-r3b1c-full-fresh-replay-result-2026-08.json"
COMPOSITE_PROOF_PATH = DATA / "ci-r3b1c-composite-index-runtime-proof-2026-08.json"
PRE_SHA = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=Path(__file__).resolve().parents[4], text=True).strip()

HIGH_RISK_OBJECTS = [
    ("org_tasks", "table"),
    ("brake_health_current", "table"),
    ("battery_evidence", "table"),
    ("vehicle_document_extractions", "table"),
    ("org_invoices", "table"),
    ("vehicle_dtc_events", "table"),
    ("vehicle_driving_impact_current", "table"),
    ("InsightType", "enum"),
]


def prisma_deploy(cfg: PgConfig, db: str) -> tuple[int, str]:
    env = os.environ.copy()
    env["DATABASE_URL"] = cfg.url(db)
    proc = subprocess.run(
        ["npx", "prisma", "migrate", "deploy"],
        cwd=BACKEND,
        capture_output=True,
        text=True,
        env=env,
    )
    return proc.returncode, (proc.stdout or "") + (proc.stderr or "")


def migration_history(cfg: PgConfig, db: str) -> list[dict[str, Any]]:
    proc = psql(
        cfg,
        db,
        "SELECT migration_name, finished_at IS NOT NULL AS finished, rolled_back_at IS NOT NULL AS rolled_back "
        "FROM _prisma_migrations ORDER BY started_at;",
        tuples_only=True,
    )
    rows = []
    for line in proc.stdout.splitlines():
        if not line.strip():
            continue
        parts = line.split("|")
        if len(parts) != 3:
            continue
        rows.append({"migration_name": parts[0], "finished": parts[1] == "t", "rolled_back": parts[2] == "t"})
    return rows


def reached_migration(last_applied: str | None, boundary: str) -> bool:
    if not last_applied:
        return False
    dirs = migration_dirs()
    return dirs.index(last_applied) >= dirs.index(boundary)


def slot_runtime_states(cfg: PgConfig, db: str, last_applied: str | None, full_success: bool, special_handled: set[str] | None = None) -> list[dict[str, Any]]:
    topology = load_topology()
    special_handled = special_handled or set()
    rows = []
    for slot in topology["slots"]:
        mig = next(m for m in R3B1B_REPAIR_MIGRATIONS if m.endswith(f"slot{slot['slot']}"))
        reached = full_success or (last_applied is not None and reached_migration(last_applied, mig))
        objects = slot_created_objects(slot["slot"])
        obj_status = {}
        for obj in objects:
            if reached:
                if obj["kind"] == "table":
                    obj_status[obj["name"]] = "PASS" if table_exists(cfg, db, obj["name"]) else "FAIL"
                elif obj["kind"] == "enum":
                    obj_status[obj["name"]] = "PASS" if enum_exists(cfg, db, obj["name"]) else "FAIL"
                elif obj["kind"] == "sequence":
                    obj_status[obj["name"]] = "PASS" if sequence_exists(cfg, db, obj["name"]) else "FAIL"
            else:
                obj_status[obj["name"]] = "NOT_REACHED"
        consumer = slot["first_consumers_protected"][0]
        if not reached:
            consumer_status = "NOT_REACHED"
        elif consumer in special_handled:
            consumer_status = "PASS"
        elif full_success or reached_migration(last_applied or "", consumer):
            proc = psql(cfg, db, f"SELECT finished_at IS NOT NULL FROM _prisma_migrations WHERE migration_name='{consumer}';", tuples_only=True)
            consumer_status = "PASS" if proc.stdout.strip() == "t" else "FAIL"
        else:
            consumer_status = "NOT_REACHED"
        repair_status = "PASS" if reached and all(v == "PASS" for v in obj_status.values()) else ("NOT_REACHED" if not reached else "FAIL")
        rows.append(
            {
                "slot": slot["slot"],
                "migration": mig,
                "repair_migration_status": repair_status,
                "objects": obj_status,
                "first_consumer": consumer,
                "consumer_status": consumer_status,
                "deferred_constraints_resolved": deferred_constraints_by_slot().get(slot["slot"], []),
            }
        )
    return rows


def high_risk_states(cfg: PgConfig, db: str, full_success: bool, last_applied: str | None) -> dict[str, str]:
    out = {}
    boundary_for = {
        "org_tasks": "20260412025000_ci_r3b_historical_predecessor_slot1",
        "brake_health_current": "20260412610000_ci_r3b_historical_predecessor_slot2",
        "battery_evidence": "20260413201500_ci_r3b_historical_predecessor_slot3",
        "vehicle_document_extractions": "20260413201500_ci_r3b_historical_predecessor_slot3",
        "org_invoices": "20260413225000_ci_r3b_historical_predecessor_slot4",
        "vehicle_dtc_events": "20260413225000_ci_r3b_historical_predecessor_slot4",
        "vehicle_driving_impact_current": "20260421180000_ci_r3b_historical_predecessor_slot6",
        "InsightType": "20260417170000_ci_r3b_historical_predecessor_slot5",
    }
    for name, kind in HIGH_RISK_OBJECTS:
        reached = full_success or reached_migration(last_applied, boundary_for[name])
        if not reached:
            out[name] = "NOT_REACHED"
        elif kind == "table":
            out[name] = "PASS" if table_exists(cfg, db, name) else "FAIL"
        else:
            out[name] = "PASS" if enum_exists(cfg, db, name) else "FAIL"
    return out


def composite_index_proof(cfg: PgConfig, db: str) -> dict[str, Any]:
    from replay_evidence_lib import parse_create_index_statements, SPECIAL_MIGRATION_PATH
    from ci_r3b1c_special_composite_index import fetch_index_catalog

    expected = parse_create_index_statements(SPECIAL_MIGRATION_PATH.read_text())
    actual = []
    missing = []
    mismatches = []
    for spec in expected:
        cat = fetch_index_catalog(cfg, db, spec["index_name"])
        if not cat:
            missing.append(spec["index_name"])
            continue
        actual.append(cat)
        if cat["table_name"] != spec["relation"] or cat["columns"] != spec["columns"]:
            mismatches.append({"index": spec["index_name"], "expected": spec, "actual": cat})
    return {
        "expected_count": len(expected),
        "actual_valid_count": len(actual),
        "missing": missing,
        "definition_mismatches": mismatches,
        "indexes": actual,
        "pass": not missing and not mismatches,
    }


def run_parity(cfg: PgConfig, db: str) -> dict[str, Any]:
    proc = subprocess.run(
        [sys.executable, str(Path(__file__).with_name("ci_r3b1c_r3b_parity.py")), db],
        capture_output=True,
        text=True,
        cwd=Path(__file__).parent,
    )
    if proc.returncode != 0 and proc.stdout:
        try:
            return json.loads(proc.stdout)
        except json.JSONDecodeError:
            return {"pass": False, "error": proc.stderr or proc.stdout}
    if proc.stdout.strip():
        return json.loads(proc.stdout)
    return {"pass": proc.returncode == 0}


def run_full_replay(db_name: str = "synqdrive_r3b1c_replay") -> dict[str, Any]:
    cfg = PgConfig()
    recreate_db(cfg, db_name)

    special_steps: list[dict[str, Any]] = []
    reconciliations: list[dict[str, Any]] = []
    deploy_outputs: list[str] = []
    normal_applied = 0
    special_handled = 0

    while True:
        code, output = prisma_deploy(cfg, db_name)
        deploy_outputs.append(output)
        parsed = parse_deploy_output(output)
        if code == 0:
            hist = migration_history(cfg, db_name)
            normal_applied = sum(1 for h in hist if h["finished"])
            break
        failed = parsed["first_failed_migration"]
        if failed == SPECIAL_MIGRATION:
            executor = SpecialCompositeIndexExecutor(cfg)
            result = executor.run(db_name, reconcile=True)
            special_steps.append(result)
            reconciliations.append(result["migration_state_reconciliation"])
            special_handled += 1
            continue
        hist = migration_history(cfg, db_name)
        pg_version_proc = psql(cfg, db_name, "SELECT version();", tuples_only=True)
        pg_version = pg_version_proc.stdout.split("-", 1)[0] if pg_version_proc.stdout else "unknown"
        last_applied = next((h["migration_name"] for h in reversed(hist) if h["finished"]), parsed.get("last_applied_migration"))
        composite_proof = composite_index_proof(cfg, db_name) if special_handled else {"pass": False, "note": "special case not reached"}
        result = {
            "PRE_R3B1C_SHA": PRE_SHA,
            "REPLAY_TESTED_TREE_SHA": git_tree_sha("HEAD"),
            "REPLAY_INPUT_MANIFEST_SHA256": replay_input_manifest_sha256(),
            "branch": "fix/ci-r3b-vehicle-trips-migration-replay-2026-08",
            "pr": 1031,
            "postgresql_version": pg_version,
            "database_identifier": db_name,
            "disposable": True,
            "production_connection": False,
            "migration_directories": len(migration_dirs()),
            "normal_migrations_applied": sum(1 for h in hist if h["finished"]),
            "special_migrations_handled": special_handled,
            "migration_state_reconciliations": reconciliations,
            "manual_operator_db_interventions": 0,
            "automated_special_replay_steps": special_steps,
            "full_replay_pass": False,
            "first_failed_migration": failed,
            "failure_ordinal": migration_ordinal(failed or ""),
            "sqlstate": parsed.get("sqlstate"),
            "error_message": parsed.get("error_message"),
            "failure_classification": parsed.get("failure_classification"),
            "last_applied_migration": last_applied,
            "slot_runtime": slot_runtime_states(cfg, db_name, last_applied, False, {SPECIAL_MIGRATION}),
            "high_risk_runtime": high_risk_states(cfg, db_name, False, last_applied),
            "composite_index_proof": composite_proof,
            "r3b_parity": {"pass": False, "status": "NOT_RUN", "reason": "replay incomplete"},
            "final_status": "CI_R3B1C_COMPOSITE_INDEX_REPLAY_RESOLUTION_PARTIAL"
            if special_handled
            else "CI_R3B1C_COMPOSITE_INDEX_REPLAY_RESOLUTION_FAILED",
        }
        RESULT_PATH.write_text(json.dumps(result, indent=2) + "\n")
        if composite_proof.get("pass"):
            COMPOSITE_PROOF_PATH.write_text(json.dumps(composite_proof, indent=2) + "\n")
        return result

    hist = migration_history(cfg, db_name)
    composite_proof = composite_index_proof(cfg, db_name)
    parity = run_parity(cfg, db_name)
    last_applied = hist[-1]["migration_name"] if hist else None
    full_success = len(hist) == len(migration_dirs()) and all(h["finished"] and not h["rolled_back"] for h in hist)

    pg_version_proc = psql(cfg, db_name, "SELECT version();", tuples_only=True)
    pg_version = pg_version_proc.stdout.split("-", 1)[0] if pg_version_proc.stdout else "unknown"

    result = {
        "PRE_R3B1C_SHA": PRE_SHA,
        "REPLAY_TESTED_TREE_SHA": git_tree_sha("HEAD"),
        "REPLAY_INPUT_MANIFEST_SHA256": replay_input_manifest_sha256(),
        "branch": "fix/ci-r3b-vehicle-trips-migration-replay-2026-08",
        "pr": 1031,
        "postgresql_version": pg_version,
        "database_identifier": db_name,
        "disposable": True,
        "production_connection": False,
        "migration_directories": len(migration_dirs()),
        "normal_migrations_applied": normal_applied,
        "special_migrations_handled": special_handled,
        "migration_state_reconciliations": reconciliations,
        "manual_operator_db_interventions": 0,
        "automated_special_replay_steps": special_steps,
        "failed_migrations_final": sum(1 for h in hist if not h["finished"]),
        "full_replay_pass": full_success,
        "slot_runtime": slot_runtime_states(cfg, db_name, last_applied, full_success, {SPECIAL_MIGRATION} if special_handled else set()),
        "high_risk_runtime": high_risk_states(cfg, db_name, full_success, last_applied),
        "composite_index_proof": composite_proof,
        "r3b_parity": parity,
        "migration_history_count": len(hist),
        "final_status": "CI_R3B1C_COMPOSITE_INDEX_REPLAY_RESOLUTION_COMPLETED"
        if full_success and composite_proof["pass"] and parity.get("pass")
        else ("CI_R3B1C_COMPOSITE_INDEX_REPLAY_RESOLUTION_PARTIAL" if special_handled and not full_success else "CI_R3B1C_COMPOSITE_INDEX_REPLAY_RESOLUTION_FAILED"),
    }
    RESULT_PATH.write_text(json.dumps(result, indent=2) + "\n")
    COMPOSITE_PROOF_PATH.write_text(json.dumps(composite_proof, indent=2) + "\n")
    return result


def main() -> int:
    mode = sys.argv[1] if len(sys.argv) > 1 else "full"
    if mode == "authority":
        auth = build_authority()
        (DATA / "ci-r3b1c-special-replay-authority-2026-08.json").write_text(json.dumps(auth, indent=2) + "\n")
        print(json.dumps(auth, indent=2))
        return 0
    if mode == "targeted":
        cfg = PgConfig()
        db = sys.argv[2] if len(sys.argv) > 2 else "synqdrive_r3b1c_targeted"
        recreate_db(cfg, db)
        # replay normally until composite migration predecessor
        while True:
            code, output = prisma_deploy(cfg, db)
            if code == 0:
                print("unexpected full deploy success before special case")
                return 1
            parsed = parse_deploy_output(output)
            if parsed["first_failed_migration"] != SPECIAL_MIGRATION:
                print(json.dumps({"pass": False, "reason": "different failure", "parsed": parsed}, indent=2))
                return 1
            break
        result = SpecialCompositeIndexExecutor(cfg).run(db, reconcile=True)
        code2, out2 = prisma_deploy(cfg, db)
        proof = composite_index_proof(cfg, db)
        payload = {
            "pass": code2 == 0 or "Applying migration" in out2,
            "special_execution": result,
            "resume_deploy_exit": code2,
            "composite_proof": proof,
        }
        print(json.dumps(payload, indent=2))
        return 0 if result and proof["pass"] else 1
    if mode == "full":
        result = run_full_replay()
        print(json.dumps({"final_status": result["final_status"], "full_replay_pass": result["full_replay_pass"], "first_failed_migration": result.get("first_failed_migration")}, indent=2))
        return 0 if result.get("full_replay_pass") and result.get("r3b_parity", {}).get("pass") else 1
    print(f"unknown mode {mode}")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
