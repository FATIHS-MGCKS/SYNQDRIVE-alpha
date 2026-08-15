#!/usr/bin/env python3
"""CI-R3B1E complete fresh migration replay harness."""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1c_special_composite_index import SpecialCompositeIndexExecutor
from ci_r3b1e_constants import (
    BASE_R3B1D12_SHA,
    DATA,
    ORIGINAL_R3B_HIGH_RISK,
    POST_VENDOR_HIGH_RISK,
    R3B1E_REPAIR_MIGRATIONS,
    SLOT_MIGRATIONS,
    TOPOLOGY,
)
from replay_evidence_lib import (
    SPECIAL_MIGRATION,
    enum_exists,
    migration_dirs,
    migration_ordinal,
    parse_deploy_output,
    psql,
    recreate_db,
    sequence_exists,
    table_exists,
    PgConfig,
)

REPO = Path(__file__).resolve().parents[4]
BACKEND = REPO / "backend"
RESULT_PATH = DATA / "ci-r3b1e-full-fresh-replay-result-2026-08.json"
AUTH_MANIFEST = DATA / "ci-r3b1e-implementation-authority-manifest-2026-08.json"
REPLAY_MANIFEST = DATA / "ci-r3b1e-replay-input-manifest-2026-08.json"
PRE_SHA = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=REPO, text=True).strip()


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
    proc = subprocess.run(
        ["npx", "prisma", "migrate", "deploy"],
        cwd=BACKEND,
        capture_output=True,
        text=True,
        env=env,
    )
    return proc.returncode, (proc.stdout or "") + (proc.stderr or "")


def reached_migration(last_applied: str | None, boundary: str) -> bool:
    if not last_applied:
        return False
    dirs = migration_dirs()
    return dirs.index(last_applied) >= dirs.index(boundary)


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
            proc = psql(cfg, db, f"SELECT finished_at IS NOT NULL FROM _prisma_migrations WHERE migration_name='{consumer}';", tuples_only=True)
            consumer_status = "PASS" if proc.stdout.strip() == "t" else "FAIL"
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
    env = os.environ.copy()
    results = {}
    for label, cmd in [
        ("prisma_validate", ["npx", "prisma", "validate"]),
        ("prisma_generate", ["npx", "prisma", "generate"]),
    ]:
        proc = subprocess.run(cmd, cwd=BACKEND, capture_output=True, text=True, env=env)
        results[label] = {"exit_code": proc.returncode, "pass": proc.returncode == 0}
    return results


def run_full_replay(db_name: str = "synqdrive_r3b1e_full_replay") -> dict:
    cfg = PgConfig()
    recreate_db(cfg, db_name)

    auth = load_json(AUTH_MANIFEST)
    replay = load_json(REPLAY_MANIFEST)
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
        partial = {
            "PRE_R3B1E_SHA": PRE_SHA,
            "BASE_R3B1D12_SHA": BASE_R3B1D12_SHA,
            "IMPLEMENTATION_AUTHORITY_MANIFEST_SHA256": auth.get("IMPLEMENTATION_AUTHORITY_MANIFEST_SHA256"),
            "REPLAY_INPUT_MANIFEST_SHA256": replay.get("REPLAY_INPUT_MANIFEST_SHA256"),
            "postgresql_version": pg_version_proc.stdout.strip() if pg_version_proc.returncode == 0 else "unknown",
            "database_identifier": db_name,
            "production_connection": False,
            "migration_directories": len(migration_dirs()),
            "normal_migrations_applied": sum(1 for h in hist if h["finished"]),
            "special_migrations_handled": len(special_steps),
            "failed_migrations": 1,
            "migration_state_reconciliations": reconciliations,
            "manual_operator_interventions": manual_interventions,
            "first_failed_migration": failed,
            "failure_ordinal": migration_ordinal(failed or ""),
            "sqlstate": parsed.get("sqlstate"),
            "error_message": parsed.get("error_message"),
            "failure_classification": parsed.get("failure_classification"),
            "last_applied_migration": last_applied,
            "post_vendor_slot_runtime": post_vendor_slot_runtime(cfg, db_name, last_applied, False),
            "high_risk_runtime": high_risk_runtime(cfg, db_name, False, last_applied),
            "r3b_parity": {"pass": False, "status": "NOT_RUN"},
            "full_replay_pass": False,
            "final_status": "CI_R3B1E_POST_VENDOR_REPAIR_FULL_REPLAY_PARTIAL"
            if failed not in R3B1E_REPAIR_MIGRATIONS
            else "CI_R3B1E_POST_VENDOR_REPAIR_FULL_REPLAY_FAILED",
        }
        RESULT_PATH.write_text(json.dumps(partial, indent=2) + "\n")
        return partial

    hist = migration_history(cfg, db_name)
    last_applied = hist[-1]["migration_name"] if hist else None
    full_success = len(hist) == len(migration_dirs()) and all(h["finished"] and not h["rolled_back"] for h in hist)
    parity = run_parity(cfg, db_name) if full_success else {"pass": False}
    prisma_checks = prisma_validate_generate() if full_success else {}
    pg_version_proc = psql(cfg, db_name, "SHOW server_version;", tuples_only=True)

    result = {
        "PRE_R3B1E_SHA": PRE_SHA,
        "BASE_R3B1D12_SHA": BASE_R3B1D12_SHA,
        "IMPLEMENTATION_AUTHORITY_MANIFEST_SHA256": auth.get("IMPLEMENTATION_AUTHORITY_MANIFEST_SHA256"),
        "REPLAY_INPUT_MANIFEST_SHA256": replay.get("REPLAY_INPUT_MANIFEST_SHA256"),
        "postgresql_version": pg_version_proc.stdout.strip() if pg_version_proc.returncode == 0 else "unknown",
        "database_identifier": db_name,
        "production_connection": False,
        "initial_public_schema_empty": True,
        "migration_directories": len(migration_dirs()),
        "normal_migrations_applied": sum(1 for h in hist if h["finished"]),
        "special_migrations_handled": len(special_steps),
        "failed_migrations": sum(1 for h in hist if not h["finished"]),
        "migration_state_reconciliations": reconciliations,
        "manual_operator_interventions": manual_interventions,
        "automated_special_replay_steps": special_steps,
        "last_applied_migration": last_applied,
        "reached_absolute_migration_head": full_success,
        "post_vendor_slot_runtime": post_vendor_slot_runtime(cfg, db_name, last_applied, full_success),
        "high_risk_runtime": high_risk_runtime(cfg, db_name, full_success, last_applied),
        "r3b_parity": parity,
        "prisma_checks": prisma_checks,
        "full_replay_pass": full_success and parity.get("pass") and all(v.get("pass", True) for v in prisma_checks.values()),
        "final_status": "CI_R3B1E_POST_VENDOR_REPAIR_FULL_REPLAY_COMPLETED"
        if full_success and parity.get("pass")
        else "CI_R3B1E_POST_VENDOR_REPAIR_FULL_REPLAY_PARTIAL",
    }
    RESULT_PATH.write_text(json.dumps(result, indent=2) + "\n")
    return result


def main() -> int:
    db = sys.argv[1] if len(sys.argv) > 1 else "synqdrive_r3b1e_full_replay"
    result = run_full_replay(db)
    print(json.dumps({"final_status": result["final_status"], "full_replay_pass": result.get("full_replay_pass")}, indent=2))
    return 0 if result.get("full_replay_pass") else 1


if __name__ == "__main__":
    raise SystemExit(main())
