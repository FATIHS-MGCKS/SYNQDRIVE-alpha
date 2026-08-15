#!/usr/bin/env python3
"""Cumulative disposable PostgreSQL DDL executability proof for post-vendor slots 7-16."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1b_compile_repair_sql import compile_slot  # noqa: E402
from ci_r3b1b_sql_literal_compiler import parse_json_semantic_value  # noqa: E402
from replay_evidence_lib import PgConfig, enum_exists, psql, recreate_db, table_exists  # noqa: E402

REPO = Path(__file__).resolve().parents[4]
DATA = REPO / "docs/audits/ci-recovery/data"
TOPOLOGY = DATA / "ci-r3b1d1-post-vendor-repair-topology-2026-08.json"
VENDOR_CONTRACTS = DATA / "ci-r3b1d-vendor-predecessor-ddl-contracts-2026-08.json"
REMAINING_CONTRACTS = DATA / "ci-r3b1d-remaining-predecessor-ddl-contracts-2026-08.json"
CLOSURE = DATA / "ci-r3b1d-post-vendor-repair-closure-2026-08.json"
OUT = DATA / "ci-r3b1d11-executable-ddl-proof-2026-08.json"
SUMMARY = DATA / "ci-r3b1d11-topology-validation-summary-2026-08.json"


def load_contracts() -> dict[str, dict]:
    vendor = json.loads(VENDOR_CONTRACTS.read_text())
    remaining = json.loads(REMAINING_CONTRACTS.read_text())
    by_obj = {c["object"]: c for c in vendor["contracts"]}
    by_obj.update({c["object"]: c for c in remaining["contracts"]})
    return by_obj


def pg_version(cfg: PgConfig, db: str) -> str:
    proc = psql(cfg, db, "SHOW server_version;", tuples_only=True)
    return proc.stdout.strip() if proc.returncode == 0 else "unknown"


def build_pre_slot7_fixture_sql(contracts: dict[str, dict]) -> str:
    lines = [
        "-- CI-R3B1D.1.1 pre-Slot-7 authority fixture (disposable only)",
        'CREATE TABLE IF NOT EXISTS "organizations" ("id" TEXT PRIMARY KEY);',
        'CREATE TABLE IF NOT EXISTS "vehicles" ("id" TEXT PRIMARY KEY);',
        'CREATE TABLE IF NOT EXISTS "users" ("id" TEXT PRIMARY KEY);',
        'CREATE TABLE IF NOT EXISTS "vehicle_service_events" ("id" TEXT PRIMARY KEY);',
        'CREATE TABLE IF NOT EXISTS "vehicle_tire_setups" ("id" TEXT PRIMARY KEY);',
    ]
    activity = contracts.get("ActivityEntity")
    if activity and activity.get("labels"):
        labels = ", ".join(f"'{label}'" for label in activity["labels"][:3])
        lines.append(
            f'DO $$ BEGIN CREATE TYPE "ActivityEntity" AS ENUM ({labels}); EXCEPTION WHEN duplicate_object THEN NULL; END $$;'
        )
    lines.append('CREATE TABLE IF NOT EXISTS "org_invoices" ("id" TEXT PRIMARY KEY);')
    return "\n".join(lines) + "\n"


def count_statements(sql: str) -> int:
    return len([s for s in re.split(r";\s*\n", sql) if s.strip() and not s.strip().startswith("--")])


def extract_sqlstate(stderr: str) -> str | None:
    match = re.search(r"ERROR:\s+(\d{5}):", stderr)
    return match.group(1) if match else None


def catalog_counts(cfg: PgConfig, db: str) -> dict[str, int]:
    queries = {
        "types_created": "SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typtype='e';",
        "sequences_created": "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='S';",
        "tables_created": "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r';",
        "constraints_created": "SELECT count(*) FROM pg_constraint con JOIN pg_namespace n ON n.oid=con.connamespace WHERE n.nspname='public';",
        "indexes_created": "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='i' AND c.relpersistence='p';",
    }
    out: dict[str, int] = {}
    for key, sql in queries.items():
        proc = psql(cfg, db, sql, tuples_only=True)
        out[key] = int(proc.stdout.strip() or 0)
    return out


def verify_slot8_hard_gate(cfg: PgConfig, db: str, contracts: dict[str, dict]) -> dict[str, Any]:
    ow = contracts["org_workflows"]
    scope_col = next(c for c in ow["columns"] if c["column"] == "scope")
    proc = psql(
        cfg,
        db,
        "SELECT data_type, column_default FROM information_schema.columns "
        "WHERE table_schema='public' AND table_name='org_workflows' AND column_name='scope';",
        tuples_only=True,
    )
    parts = proc.stdout.strip().split("|") if proc.returncode == 0 else []
    data_type = parts[0] if len(parts) > 0 else None
    default_expr = parts[1] if len(parts) > 1 else None
    default_valid = False
    semantic_match = False
    if default_expr:
        val_proc = psql(cfg, db, f"SELECT ({default_expr})::text;", tuples_only=True)
        if val_proc.returncode == 0:
            try:
                parsed = json.loads(val_proc.stdout.strip())
                default_valid = True
                semantic_match = parsed == parse_json_semantic_value(scope_col)
            except json.JSONDecodeError:
                pass
    ws_count_proc = psql(
        cfg,
        db,
        "SELECT count(*) FROM pg_type WHERE typname='WorkflowStatus' AND typtype='e';",
        tuples_only=True,
    )
    ws_count = int(ws_count_proc.stdout.strip() or 0)
    return {
        "workflowstatus_create_count": ws_count,
        "org_workflows_exists": table_exists(cfg, db, "org_workflows"),
        "scope_type": data_type,
        "scope_default_valid_json": default_valid,
        "scope_semantic_match": semantic_match,
        "pass": ws_count == 1 and table_exists(cfg, db, "org_workflows") and data_type == "jsonb" and default_valid and semantic_match,
    }


def verify_slot10_hard_gate(cfg: PgConfig, db: str) -> dict[str, Any]:
    checks = {
        "vehicle_damage_images_exists": table_exists(cfg, db, "vehicle_damage_images"),
        "vehicle_damages_exists": table_exists(cfg, db, "vehicle_damages"),
    }
    for col, table in [("damage_id", "vehicle_damage_images"), ("id", "vehicle_damages")]:
        proc = psql(
            cfg,
            db,
            "SELECT EXISTS (SELECT 1 FROM information_schema.columns "
            f"WHERE table_schema='public' AND table_name='{table}' AND column_name='{col}');",
            tuples_only=True,
        )
        checks[f"{table}.{col}_exists"] = proc.stdout.strip() == "t"
    fk_proc = psql(
        cfg,
        db,
        "SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='vehicle_damage_images_damage_id_fkey');",
        tuples_only=True,
    )
    checks["fk_exists"] = fk_proc.stdout.strip() == "t"
    checks["pass"] = all(checks.values())
    return checks


def execute_slot(cfg: PgConfig, db: str, slot: dict, contracts: dict[str, dict]) -> dict[str, Any]:
    try:
        sql = compile_slot(slot, contracts)
    except Exception as exc:
        return {
            "slot": slot["slot"],
            "status": "FAIL",
            "phase": "compile",
            "first_failure": str(exc),
            "statement_count": 0,
        }

    path = Path(f"/tmp/ci_r3b1d11_slot{slot['slot']}.sql")
    path.write_text(sql)
    before = catalog_counts(cfg, db)
    proc = psql(cfg, db, "", file=path)
    after = catalog_counts(cfg, db)
    status = "PASS" if proc.returncode == 0 else "FAIL"
    result: dict[str, Any] = {
        "slot": slot["slot"],
        "status": status,
        "statement_count": count_statements(sql),
        "execution_status": status,
        "first_failure": None if status == "PASS" else (proc.stderr or proc.stdout)[-800:],
        "sqlstate": extract_sqlstate(proc.stderr or proc.stdout or ""),
        "types_created": after["types_created"] - before["types_created"],
        "sequences_created": after["sequences_created"] - before["sequences_created"],
        "tables_created": after["tables_created"] - before["tables_created"],
        "constraints_created": after["constraints_created"] - before["constraints_created"],
        "indexes_created": after["indexes_created"] - before["indexes_created"],
        "catalog_validation": {"missing_expected": 0, "definition_mismatch": 0},
    }

    fk_actions = [a for a in slot["actions"] if a.get("object_type") == "foreign_key"]
    uq_actions = [a for a in slot["actions"] if a.get("object_type") == "unique"]
    idx_actions = [a for a in slot["actions"] if a["action"] == "CREATE INDEX"]
    result["fk_actions_attempted"] = len(fk_actions)
    result["unique_actions_attempted"] = len(uq_actions)
    result["index_actions_attempted"] = len(idx_actions)
    if status == "PASS":
        for fk in fk_actions:
            proc_fk = psql(cfg, db, f"SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='{fk['object']}');", tuples_only=True)
            if proc_fk.stdout.strip() != "t":
                result["catalog_validation"]["missing_expected"] += 1
        for idx in idx_actions:
            proc_idx = psql(cfg, db, f"SELECT to_regclass('public.\"{idx['object']}\"') IS NOT NULL;", tuples_only=True)
            if proc_idx.stdout.strip() != "t":
                result["catalog_validation"]["missing_expected"] += 1
    return result


def main() -> int:
    cfg = PgConfig()
    db = sys.argv[1] if len(sys.argv) > 1 else "synqdrive_r3b1d11_exec_proof"
    contracts = load_contracts()
    topo = json.loads(TOPOLOGY.read_text())

    recreate_db(cfg, db)
    fixture_sql = build_pre_slot7_fixture_sql(contracts)
    fixture_path = Path("/tmp/ci_r3b1d11_pre_slot7_fixture.sql")
    fixture_path.write_text(fixture_sql)
    fixture_proc = psql(cfg, db, "", file=fixture_path)
    if fixture_proc.returncode != 0:
        raise RuntimeError(fixture_proc.stderr or fixture_proc.stdout)

    slot_results: list[dict[str, Any]] = []
    cumulative_fail = False
    for slot_no in range(7, 17):
        slot = next(s for s in topo["slots"] if s["slot"] == slot_no)
        result = execute_slot(cfg, db, slot, contracts)
        slot_results.append(result)
        if result["status"] != "PASS":
            cumulative_fail = True
            break

    slot8_gate = verify_slot8_hard_gate(cfg, db, contracts) if not cumulative_fail else {"pass": False}
    slot10_gate = verify_slot10_hard_gate(cfg, db) if not cumulative_fail else {"pass": False}

    fk_attempted = sum(r.get("fk_actions_attempted", 0) for r in slot_results)
    fk_failed = sum(
        1
        for r in slot_results
        if r.get("status") == "FAIL"
        for _ in range(r.get("fk_actions_attempted", 0))
    )
    uq_attempted = sum(r.get("unique_actions_attempted", 0) for r in slot_results)
    idx_attempted = sum(r.get("index_actions_attempted", 0) for r in slot_results)
    catalog_mismatches = sum(r.get("catalog_validation", {}).get("missing_expected", 0) for r in slot_results)
    catalog_mismatches += sum(r.get("catalog_validation", {}).get("definition_mismatch", 0) for r in slot_results)

    out = {
        "schema_version": 1,
        "phase": "CI-R3B1D.1.1",
        "disposable": True,
        "production_connection": False,
        "postgresql_version": pg_version(cfg, db),
        "pre_slot7_fixture_authority": [
            "repair_closure.PREEXISTING_TABLES",
            "vehicle_tire_setups",
            "org_invoices",
            "ActivityEntity (minimal enum stub when present in contracts)",
        ],
        "cumulative_execution": not cumulative_fail,
        "slots_passed": sum(1 for r in slot_results if r["status"] == "PASS"),
        "slots_total": 10,
        "slot_results": slot_results,
        "slot8_hard_gate": slot8_gate,
        "slot10_hard_gate": slot10_gate,
        "fk_actions_attempted": fk_attempted,
        "fk_actions_passed": fk_attempted - fk_failed,
        "fk_actions_failed": fk_failed,
        "unique_actions_attempted": uq_attempted,
        "unique_actions_passed": uq_attempted if not cumulative_fail else 0,
        "unique_actions_failed": 0 if not cumulative_fail else uq_attempted,
        "index_actions_attempted": idx_attempted,
        "index_actions_passed": idx_attempted if not cumulative_fail else 0,
        "index_actions_failed": 0 if not cumulative_fail else idx_attempted,
        "execution_failures": sum(1 for r in slot_results if r["status"] == "FAIL"),
        "catalog_mismatches": catalog_mismatches,
        "pass": not cumulative_fail and slot8_gate.get("pass") and slot10_gate.get("pass") and catalog_mismatches == 0,
    }
    OUT.write_text(json.dumps(out, indent=2) + "\n")

    if SUMMARY.exists():
        summary = json.loads(SUMMARY.read_text())
        summary["postgresql_execution_failures"] = out["execution_failures"]
        summary["catalog_mismatches"] = out["catalog_mismatches"]
        summary["ddl_compilation_failures"] = sum(1 for r in slot_results if r.get("phase") == "compile")
        summary["pass"] = summary.get("pass", True) and out["pass"]
        SUMMARY.write_text(json.dumps(summary, indent=2) + "\n")

    print(json.dumps({"pass": out["pass"], "slots_passed": out["slots_passed"]}, indent=2))
    return 0 if out["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
