#!/usr/bin/env python3
"""CI-R3B1I complete fresh migration replay harness."""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1c_special_composite_index import SpecialCompositeIndexExecutor
from ci_r3b1e_constants import ORIGINAL_R3B_HIGH_RISK, POST_VENDOR_HIGH_RISK, SLOT_MIGRATIONS, TOPOLOGY
from ci_r3b1g_constants import R3B1G_REPAIR_MIGRATION, TIRE_CONSUMER
from ci_r3b1i_constants import BASE_R3B1H111_SHA, DATA, IAM_CONSUMER, IAM_REPAIR_MIGRATION, evidence_input_sha
from ci_r3b1j_statement_failure_capture import enrich_replay_failure
from replay_evidence_lib import (
    SPECIAL_MIGRATION,
    audit_transaction_sensitive_migrations,
    enum_exists,
    migration_dirs,
    migration_ordinal,
    parse_deploy_output,
    psql,
    recreate_db,
    sequence_exists,
    special_migration_hash_status,
    table_exists,
    PgConfig,
)

REPO = Path(__file__).resolve().parents[4]
BACKEND = REPO / "backend"
RESULT_PATH = DATA / "ci-r3b1i-full-fresh-replay-result-2026-08.json"
REPLAY_MANIFEST = DATA / "ci-r3b1i-replay-input-manifest-2026-08.json"
INPUT_PROVENANCE = DATA / "ci-r3b1i-input-provenance-2026-08.json"


def migration_history(cfg: PgConfig, db: str) -> list[dict]:
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


def load_json(path: Path) -> dict:
    return json.loads(path.read_text())


def prisma_deploy(cfg: PgConfig, db: str) -> tuple[int, str]:
    env = os.environ.copy()
    env["DATABASE_URL"] = cfg.url(db)
    proc = subprocess.run(["npx", "prisma", "migrate", "deploy"], cwd=BACKEND, capture_output=True, text=True, env=env)
    return proc.returncode, (proc.stdout or "") + (proc.stderr or "")


def reached_migration(last_applied: str | None, boundary: str) -> bool:
    if not last_applied:
        return False
    dirs = migration_dirs()
    return dirs.index(last_applied) >= dirs.index(boundary)


def migration_finished(cfg: PgConfig, db: str, name: str) -> bool:
    proc = psql(
        cfg,
        db,
        f"SELECT finished_at IS NOT NULL FROM _prisma_migrations WHERE migration_name='{name}';",
        tuples_only=True,
    )
    return proc.returncode == 0 and proc.stdout.strip() == "t"


def classify_failure(failed: str | None) -> str:
    if failed == SPECIAL_MIGRATION:
        return "SPECIAL_REPLAY_DEFECT"
    if failed in {IAM_REPAIR_MIGRATION, IAM_CONSUMER}:
        return "R3B1I_REPAIR_DEFECT"
    return "NEW_UNRELATED_HISTORICAL_DEFECT"


def runtime_status(cfg: PgConfig, db: str, last_applied: str | None, full_success: bool) -> dict[str, str]:
    def status(boundary: str) -> str:
        if full_success or reached_migration(last_applied, boundary):
            return "PASS" if migration_finished(cfg, db, boundary) else "FAIL"
        return "NOT_REACHED"

    return {
        "r3b1g_tire_repair": status(R3B1G_REPAIR_MIGRATION),
        "migration_157": status(TIRE_CONSUMER),
        "r3b1i_iam_repair_reached": status(IAM_REPAIR_MIGRATION),
        "r3b1i_iam_repair_applied": status(IAM_REPAIR_MIGRATION),
        "migration_249_reached": status(IAM_CONSUMER),
        "migration_249_applied": status(IAM_CONSUMER),
    }


def post_vendor_slot_runtime(cfg: PgConfig, db: str, last_applied: str | None, full_success: bool) -> list[dict]:
    topology = load_json(TOPOLOGY)
    rows = []
    for slot in topology["slots"]:
        if slot["slot"] < 7:
            continue
        mig = SLOT_MIGRATIONS[slot["slot"]]
        reached = full_success or (last_applied is not None and reached_migration(last_applied, mig))
        objects = {}
        for action in slot.get("actions", []):
            if action.get("action") in {"CREATE TYPE", "CREATE TABLE", "CREATE SEQUENCE"}:
                name = action["object"]
                kind = {"CREATE TYPE": "enum", "CREATE TABLE": "table", "CREATE SEQUENCE": "sequence"}[action["action"]]
                if not reached:
                    objects[name] = "NOT_REACHED"
                elif kind == "table":
                    objects[name] = "PASS" if table_exists(cfg, db, name) else "FAIL"
                elif kind == "enum":
                    objects[name] = "PASS" if enum_exists(cfg, db, name) else "FAIL"
                else:
                    objects[name] = "PASS" if sequence_exists(cfg, db, name) else "FAIL"
        consumer = slot["first_consumers_protected"][0]
        if not reached:
            consumer_status = "NOT_REACHED"
        elif full_success or reached_migration(last_applied or "", consumer):
            consumer_status = "PASS" if migration_finished(cfg, db, consumer) else "FAIL"
        else:
            consumer_status = "NOT_REACHED"
        repair_status = "PASS" if reached and all(v == "PASS" for v in objects.values()) else ("NOT_REACHED" if not reached else "FAIL")
        rows.append(
            {
                "slot": slot["slot"],
                "migration": mig,
                "repair_migration_status": repair_status,
                "objects": objects,
                "first_consumer": consumer,
                "consumer_status": consumer_status,
            }
        )
    return rows


def high_risk_runtime(cfg: PgConfig, db: str, full_success: bool, last_applied: str | None) -> dict[str, str]:
    out: dict[str, str] = {}
    for name, kind, slot in POST_VENDOR_HIGH_RISK:
        mig = SLOT_MIGRATIONS[slot]
        reached = full_success or reached_migration(last_applied, mig)
        if not reached:
            out[name] = "NOT_REACHED"
        elif kind == "table":
            out[name] = "PASS" if table_exists(cfg, db, name) else "FAIL"
        else:
            out[name] = "PASS" if enum_exists(cfg, db, name) else "FAIL"
    for name, kind, mig in ORIGINAL_R3B_HIGH_RISK:
        reached = full_success or reached_migration(last_applied, mig)
        if not reached:
            out[name] = "NOT_REACHED"
        elif kind == "table":
            out[name] = "PASS" if table_exists(cfg, db, name) else "FAIL"
        else:
            out[name] = "PASS" if enum_exists(cfg, db, name) else "FAIL"
    return out


def run_parity(cfg: PgConfig, db: str) -> dict:
    proc = subprocess.run(
        [sys.executable, str(Path(__file__).with_name("ci_r3b1c_r3b_parity.py")), db],
        capture_output=True,
        text=True,
        cwd=Path(__file__).parent,
    )
    if proc.stdout.strip():
        try:
            return json.loads(proc.stdout)
        except json.JSONDecodeError:
            pass
    return {"pass": False, "error": proc.stderr or proc.stdout}


def prisma_validate_generate() -> dict:
    results = {}
    for label, cmd in [
        ("prisma_validate", ["npx", "prisma", "validate"]),
        ("prisma_generate", ["npx", "prisma", "generate"]),
    ]:
        proc = subprocess.run(cmd, cwd=BACKEND, capture_output=True, text=True)
        results[label] = {"exit_code": proc.returncode, "pass": proc.returncode == 0}
    return results


def run_full_replay(db_name: str = "synqdrive_r3b1i_full_replay") -> dict:
    cfg = PgConfig()
    recreate_db(cfg, db_name)
    replay = load_json(REPLAY_MANIFEST)
    provenance = load_json(INPUT_PROVENANCE)
    tx_scan = audit_transaction_sensitive_migrations()
    composite = special_migration_hash_status()
    if not composite["match"]:
        raise RuntimeError("composite-index checksum mismatch")

    special_steps = []
    reconciliations = []
    manual_interventions = 0

    while True:
        code, output = prisma_deploy(cfg, db_name)
        if code == 0:
            break
        parsed = parse_deploy_output(output)
        failed = parsed["first_failed_migration"]
        if failed == SPECIAL_MIGRATION:
            result = SpecialCompositeIndexExecutor(cfg).run(db_name, reconcile=True)
            special_steps.append(result)
            reconciliations.append(result["migration_state_reconciliation"])
            continue
        hist = migration_history(cfg, db_name)
        last_applied = next((h["migration_name"] for h in reversed(hist) if h["finished"]), parsed.get("last_applied_migration"))
        pg_version_proc = psql(cfg, db_name, "SHOW server_version;", tuples_only=True)
        failure_class = classify_failure(failed)
        parsed = enrich_replay_failure(cfg, db_name, parsed)
        stmt_fail = parsed.get("statement_level_failure", {})
        partial = {
            "evidence_input_sha": evidence_input_sha(),
            "BASE_R3B1H111_SHA": BASE_R3B1H111_SHA,
            "REPLAY_INPUT_MANIFEST_SHA256": replay.get("REPLAY_INPUT_MANIFEST_SHA256"),
            "authority_source_sha": provenance.get("authority_source_sha"),
            "postgresql_version": pg_version_proc.stdout.strip() if pg_version_proc.returncode == 0 else "unknown",
            "database_identifier": db_name,
            "production_connection": False,
            "transaction_sensitive_scan": tx_scan,
            "composite_index_checksum": composite,
            "migration_directories_discovered": len(migration_dirs()),
            "normal_migrations_applied": sum(1 for h in hist if h["finished"]),
            "special_migrations_handled": len(special_steps),
            "failed_migrations": 1,
            "manual_interventions": manual_interventions,
            "first_failed_migration": failed,
            "failure_ordinal": migration_ordinal(failed or ""),
            "first_failing_statement_ordinal": stmt_fail.get("first_failing_statement_ordinal"),
            "failing_statement_sql": stmt_fail.get("failing_statement_sql"),
            "sqlstate": stmt_fail.get("sqlstate") or parsed.get("sqlstate"),
            "error_message": stmt_fail.get("postgresql_error") or parsed.get("error_message"),
            "statement_level_failure": stmt_fail,
            "failure_classification": failure_class,
            "last_successful_migration": last_applied,
            "repair_runtime": runtime_status(cfg, db_name, last_applied, False),
            "post_vendor_slot_runtime": post_vendor_slot_runtime(cfg, db_name, last_applied, False),
            "high_risk_runtime": high_risk_runtime(cfg, db_name, False, last_applied),
            "r3b_parity": {"pass": False, "status": "NOT_RUN"},
            "reached_absolute_head": False,
            "full_replay_pass": False,
            "final_status": "CI_R3B1I_IAM_PERMISSIONS_REPAIR_FULL_REPLAY_FAILED"
            if failure_class == "R3B1I_REPAIR_DEFECT"
            else "CI_R3B1I_IAM_PERMISSIONS_REPAIR_FULL_REPLAY_PARTIAL",
        }
        RESULT_PATH.write_text(json.dumps(partial, indent=2) + "\n")
        return partial

    hist = migration_history(cfg, db_name)
    last_applied = hist[-1]["migration_name"] if hist else None
    head = migration_dirs()[-1] if migration_dirs() else None
    full_success = len(hist) == len(migration_dirs()) and all(h["finished"] and not h["rolled_back"] for h in hist)
    parity = run_parity(cfg, db_name) if full_success else {"pass": False}
    prisma_checks = prisma_validate_generate() if full_success else {}
    pg_version_proc = psql(cfg, db_name, "SHOW server_version;", tuples_only=True)

    result = {
        "evidence_input_sha": evidence_input_sha(),
        "BASE_R3B1H111_SHA": BASE_R3B1H111_SHA,
        "REPLAY_INPUT_MANIFEST_SHA256": replay.get("REPLAY_INPUT_MANIFEST_SHA256"),
        "authority_source_sha": provenance.get("authority_source_sha"),
        "postgresql_version": pg_version_proc.stdout.strip() if pg_version_proc.returncode == 0 else "unknown",
        "database_identifier": db_name,
        "production_connection": False,
        "initial_public_schema_empty": True,
        "transaction_sensitive_scan": tx_scan,
        "composite_index_checksum": composite,
        "migration_directories_discovered": len(migration_dirs()),
        "normal_migrations_applied": sum(1 for h in hist if h["finished"]),
        "special_migrations_handled": len(special_steps),
        "failed_migrations": sum(1 for h in hist if not h["finished"]),
        "manual_interventions": manual_interventions,
        "automated_special_replay_steps": special_steps,
        "first_migration": migration_dirs()[0] if migration_dirs() else None,
        "last_successful_migration": last_applied,
        "absolute_head_migration": head,
        "reached_absolute_head": full_success,
        "repair_runtime": runtime_status(cfg, db_name, last_applied, full_success),
        "post_vendor_slot_runtime": post_vendor_slot_runtime(cfg, db_name, last_applied, full_success),
        "high_risk_runtime": high_risk_runtime(cfg, db_name, full_success, last_applied),
        "r3b_parity": parity,
        "prisma_checks": prisma_checks,
        "full_replay_pass": full_success and parity.get("pass") and all(v.get("pass", True) for v in prisma_checks.values()),
        "final_status": "CI_R3B1I_IAM_PERMISSIONS_REPAIR_FULL_REPLAY_COMPLETED"
        if full_success and parity.get("pass")
        else "CI_R3B1I_IAM_PERMISSIONS_REPAIR_FULL_REPLAY_PARTIAL",
    }
    RESULT_PATH.write_text(json.dumps(result, indent=2) + "\n")
    return result


def main() -> int:
    db = sys.argv[1] if len(sys.argv) > 1 else "synqdrive_r3b1i_full_replay"
    result = run_full_replay(db)
    print(json.dumps({"final_status": result["final_status"], "full_replay_pass": result.get("full_replay_pass")}, indent=2))
    return 0 if result.get("full_replay_pass") else 1


if __name__ == "__main__":
    raise SystemExit(main())
