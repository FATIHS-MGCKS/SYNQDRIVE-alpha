#!/usr/bin/env python3
"""CI-R3B1K full fresh migration replay harness."""
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
from ci_r3b1i_constants import IAM_CONSUMER, IAM_REPAIR_MIGRATION
from ci_r3b1j_statement_failure_capture import enrich_replay_failure
from ci_r3b1k_constants import BASE_R3B1J1_SHA, DATA, MIGRATION_252, evidence_input_sha
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
RESULT_PATH = DATA / "ci-r3b1k-full-fresh-replay-result-2026-08.json"
REPLAY_MANIFEST = DATA / "ci-r3b1k-replay-input-manifest-2026-08.json"


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
    if failed == MIGRATION_252:
        return "R3B1K_IDENTIFIER_CORRECTION_DEFECT"
    return "NEW_UNRELATED_HISTORICAL_DEFECT"


def runtime_status(cfg: PgConfig, db: str, last_applied: str | None, full_success: bool) -> dict[str, str]:
    def status(boundary: str) -> str:
        if full_success or reached_migration(last_applied, boundary):
            return "PASS" if migration_finished(cfg, db, boundary) else "FAIL"
        return "NOT_REACHED"

    return {
        "r3b1g_tire_repair": status(R3B1G_REPAIR_MIGRATION),
        "migration_157": status(TIRE_CONSUMER),
        "r3b1i_iam_repair": status(IAM_REPAIR_MIGRATION),
        "migration_249": status(IAM_CONSUMER),
        "migration_252_corrected": status(MIGRATION_252),
    }


def migration_replay_success(hist: list[dict], dirs: list[str]) -> bool:
    """True when every migration directory has a finished, non-rolled-back ledger row."""
    by_name: dict[str, list[dict]] = {}
    for row in hist:
        by_name.setdefault(row["migration_name"], []).append(row)
    for mig in dirs:
        entries = by_name.get(mig, [])
        if not any(e["finished"] and not e["rolled_back"] for e in entries):
            return False
    return True


def normalize_parity(parity: dict) -> dict:
    checked = parity.get("property_categories_checked", 0)
    matched = parity.get("property_categories_matched", 0)
    return {
        **parity,
        "objects_pass": parity.get("authority_objects_present", 0),
        "objects_total": parity.get("authority_objects_expected", 19),
        "tables_pass": parity.get("tables_present", 0),
        "tables_total": parity.get("tables_expected", 9),
        "enums_pass": parity.get("enums_present", 0),
        "enums_total": parity.get("enums_expected", 10),
        "properties_pass": matched,
        "properties_total": checked,
        "property_categories_total": checked,
    }


def run_parity(cfg: PgConfig, db: str) -> dict:
    proc = subprocess.run(
        [sys.executable, str(Path(__file__).with_name("ci_r3b1c_r3b_parity.py")), db],
        capture_output=True,
        text=True,
        cwd=Path(__file__).parent,
    )
    if proc.stdout.strip():
        try:
            return normalize_parity(json.loads(proc.stdout))
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


def run_full_replay(db_name: str = "synqdrive_r3b1k_full_replay") -> dict:
    cfg = PgConfig()
    recreate_db(cfg, db_name)
    replay = json.loads(REPLAY_MANIFEST.read_text()) if REPLAY_MANIFEST.exists() else {}
    tx_scan = audit_transaction_sensitive_migrations()
    composite = special_migration_hash_status()
    if not composite["match"]:
        raise RuntimeError("composite-index checksum mismatch")

    special_steps = []
    manual_interventions = 0

    while True:
        code, output = prisma_deploy(cfg, db_name)
        if code == 0:
            break
        parsed = parse_deploy_output(output)
        parsed = enrich_replay_failure(cfg, db_name, parsed)
        failed = parsed["first_failed_migration"]
        if failed == SPECIAL_MIGRATION:
            result = SpecialCompositeIndexExecutor(cfg).run(db_name, reconcile=True)
            special_steps.append(result)
            continue
        hist = migration_history(cfg, db_name)
        last_applied = next((h["migration_name"] for h in reversed(hist) if h["finished"]), parsed.get("last_applied_migration"))
        stmt_fail = parsed.get("statement_level_failure", {})
        failure_class = classify_failure(failed)
        pg_version_proc = psql(cfg, db_name, "SHOW server_version;", tuples_only=True)
        partial = {
            "evidence_input_sha": evidence_input_sha(),
            "BASE_R3B1J1_SHA": BASE_R3B1J1_SHA,
            "REPLAY_INPUT_MANIFEST_SHA256": replay.get("REPLAY_INPUT_MANIFEST_SHA256"),
            "postgresql_version": pg_version_proc.stdout.strip(),
            "database_identifier": db_name,
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
            "failure_classification": failure_class,
            "last_successful_migration": last_applied,
            "repair_runtime": runtime_status(cfg, db_name, last_applied, False),
            "r3b_parity": {"pass": False},
            "reached_absolute_head": False,
            "final_status": "CI_R3B1K_MIGRATION252_IDENTIFIER_CORRECTION_FULL_REPLAY_FAILED"
            if failure_class == "R3B1K_IDENTIFIER_CORRECTION_DEFECT"
            else "CI_R3B1K_MIGRATION252_IDENTIFIER_CORRECTION_FULL_REPLAY_PARTIAL",
        }
        RESULT_PATH.write_text(json.dumps(partial, indent=2) + "\n")
        return partial

    hist = migration_history(cfg, db_name)
    dirs = migration_dirs()
    head = dirs[-1] if dirs else None
    last_applied = next((m for m in reversed(dirs) if migration_finished(cfg, db_name, m)), None)
    full_success = migration_replay_success(hist, dirs) and last_applied == head and migration_finished(cfg, db_name, head)
    parity = run_parity(cfg, db_name) if full_success else {"pass": False}
    prisma_checks = prisma_validate_generate() if full_success else {}
    pg_version_proc = psql(cfg, db_name, "SHOW server_version;", tuples_only=True)

    result = {
        "evidence_input_sha": evidence_input_sha(),
        "BASE_R3B1J1_SHA": BASE_R3B1J1_SHA,
        "REPLAY_INPUT_MANIFEST_SHA256": replay.get("REPLAY_INPUT_MANIFEST_SHA256"),
        "postgresql_version": pg_version_proc.stdout.strip(),
        "database_identifier": db_name,
        "transaction_sensitive_scan": tx_scan,
        "composite_index_checksum": composite,
        "migration_directories_discovered": len(migration_dirs()),
        "normal_migrations_applied": sum(1 for h in hist if h["finished"]),
        "special_migrations_handled": len(special_steps),
        "failed_migrations": 0,
        "manual_interventions": manual_interventions,
        "last_successful_migration": last_applied,
        "absolute_head_migration": head,
        "reached_absolute_head": full_success,
        "repair_runtime": runtime_status(cfg, db_name, last_applied, full_success),
        "r3b_parity": parity,
        "prisma_checks": prisma_checks,
        "full_replay_pass": full_success and parity.get("pass") and all(v.get("pass", True) for v in prisma_checks.values()),
        "final_status": "CI_R3B1K_MIGRATION252_IDENTIFIER_CORRECTION_FULL_REPLAY_COMPLETED"
        if full_success and parity.get("pass")
        else "CI_R3B1K_MIGRATION252_IDENTIFIER_CORRECTION_FULL_REPLAY_PARTIAL",
    }
    RESULT_PATH.write_text(json.dumps(result, indent=2) + "\n")
    return result


def main() -> int:
    db = sys.argv[1] if len(sys.argv) > 1 else "synqdrive_r3b1k_full_replay"
    result = run_full_replay(db)
    print(json.dumps({"final_status": result["final_status"], "full_replay_pass": result.get("full_replay_pass")}, indent=2))
    return 0 if result.get("full_replay_pass") else 1


if __name__ == "__main__":
    raise SystemExit(main())
