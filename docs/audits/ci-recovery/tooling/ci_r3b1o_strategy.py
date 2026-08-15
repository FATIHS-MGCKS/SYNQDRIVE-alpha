"""Strategy simulation runner for CI-R3B1O."""
from __future__ import annotations

import re
import shutil
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Any

from ci_r3b1n2_catalog_fingerprint import build_catalog_fingerprint
from ci_r3b1n2_twin_ops import (
    classify_ledger_delta,
    export_ledger,
    parse_deploy_errors,
    run_prisma,
)
from ci_r3b1o_constants import BACKEND, M252, M252_TABLE, MIG_ROOT, R3B1G, R3B1I
from ci_r3b1o_effect_contracts import classify_m252_missing_effect


def resolve_applied(guard, dsn: str, migration: str) -> dict[str, Any]:
    before = export_ledger(dsn)
    result = run_prisma(
        ["npx", "prisma", "migrate", "resolve", "--applied", migration],
        guard,
        dsn,
    )
    after = export_ledger(dsn)
    return {
        "migration": migration,
        "command": f"prisma migrate resolve --applied {migration}",
        "exit_code": result["exit_code"],
        "stdout": result.get("stdout"),
        "stderr": result.get("stderr"),
        "ledger_before_count": len(before),
        "ledger_after_count": len(after),
        "pass": result["exit_code"] == 0,
    }


def run_deploy_pair(guard, dsn: str, run_sql) -> dict[str, Any]:
    ledger_before = export_ledger(dsn)
    deploy1 = run_prisma(["npm", "run", "prisma:migrate:deploy"], guard, dsn)
    ledger_mid = export_ledger(dsn)
    delta1 = classify_ledger_delta(ledger_before, ledger_mid)
    parsed1 = parse_deploy_errors((deploy1.get("stdout") or "") + "\n" + (deploy1.get("stderr") or ""))
    status1 = run_prisma(["npx", "prisma", "migrate", "status"], guard, dsn)
    catalog_after_first = build_catalog_fingerprint(run_sql)["fingerprint_sha256"]

    deploy2 = run_prisma(["npm", "run", "prisma:migrate:deploy"], guard, dsn)
    ledger_after = export_ledger(dsn)
    delta2 = classify_ledger_delta(ledger_mid, ledger_after)
    catalog_after_second = build_catalog_fingerprint(run_sql)["fingerprint_sha256"]
    parsed2 = parse_deploy_errors((deploy2.get("stdout") or "") + "\n" + (deploy2.get("stderr") or ""))

    return {
        "first_deploy": {
            "exit_code": deploy1["exit_code"],
            "new_finished": delta1["new_finished"],
            "new_failed": delta1["new_failed"],
            "first_failing_migration": parsed1.get("first_failing_migration"),
            "prisma_error_code": parsed1.get("prisma_error_code"),
            "database_error_code": parsed1.get("database_error_code"),
            "database_error_message": parsed1.get("database_error_message"),
            "migrate_status_exit": status1["exit_code"],
        },
        "second_deploy": {
            "exit_code": deploy2["exit_code"],
            "new_finished": delta2["new_finished"],
            "new_failed": delta2["new_failed"],
            "catalog_delta": catalog_after_second != catalog_after_first,
        },
        "catalog_after_first": catalog_after_first,
        "catalog_after_second": catalog_after_second,
        "final_ledger_count": len(ledger_after),
    }


def observe_m252_behavior(guard, dsn: str, run_sql) -> dict[str, Any]:
    ledger = export_ledger(dsn)
    m252_rows = [r for r in ledger if r.get("migration_name") == M252]
    missing = classify_m252_missing_effect(run_sql)
    text_parts = []
    return {
        "ledger_rows_for_m252": len(m252_rows),
        "ledger_rows": m252_rows,
        "missing_effect": missing,
        "append_only_forward_reconciliation_required": missing["ledger_applied_catalog_effect_missing"],
    }


def build_temp_forward_m252_migration() -> tuple[Path, dict[str, Any]]:
    ts = time.strftime("%Y%m%d%H%M%S")
    name = f"{ts}_ci_r3b1o_strategy_m252_forward_reconciliation"
    sql = (MIG_ROOT / M252 / "migration.sql").read_text()
    contract = {
        "temporary_migration_name": name,
        "source_migration": M252,
        "purpose": "append_only_forward_reconciliation",
        "target_table": M252_TABLE,
        "sql_source": "corrected recovered migration 252 semantics",
        "tracked_repository": False,
    }
    tmp_root = Path(tempfile.mkdtemp(prefix="r3b1o_m252_fwd_"))
    mig_dir = tmp_root / "backend" / "prisma" / "migrations" / name
    mig_dir.mkdir(parents=True)
    (mig_dir / "migration.sql").write_text(sql)
    return tmp_root, contract


def run_strategy_m252_fwd(
    *,
    golden_clone_fn,
    prior_resolves: list[str],
) -> dict[str, Any]:
    clone = golden_clone_fn("S_M252_FWD")
    guard = clone["guard"]
    dsn = clone["dsn"]
    run_sql = clone["run_sql"]
    resolves = []
    for migration in prior_resolves:
        resolves.append(resolve_applied(guard, dsn, migration))

    deploy_head = run_deploy_pair(guard, dsn, run_sql)
    tmp_root, contract = build_temp_forward_m252_migration()
    target = BACKEND / "prisma" / "migrations" / contract["temporary_migration_name"]
    table_present = "0"
    forward_deploy = None
    idempotency_deploy = None
    catalog_after_forward = None
    catalog_after_idempotent = None
    try:
        shutil.copytree(tmp_root / "backend" / "prisma" / "migrations" / contract["temporary_migration_name"], target)
        forward_deploy = run_prisma(["npm", "run", "prisma:migrate:deploy"], guard, dsn)
        table_present = run_sql(
            f"SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='{M252_TABLE}';"
        ).strip()
        idempotency_deploy = run_prisma(["npm", "run", "prisma:migrate:deploy"], guard, dsn)
        catalog_after_forward = build_catalog_fingerprint(run_sql)["fingerprint_sha256"]
        catalog_after_idempotent = build_catalog_fingerprint(run_sql)["fingerprint_sha256"]
        contract["apply_pass"] = (
            deploy_head["first_deploy"]["exit_code"] == 0
            and forward_deploy["exit_code"] == 0
            and table_present == "1"
        )
    finally:
        if target.exists():
            shutil.rmtree(target)
        shutil.rmtree(tmp_root, ignore_errors=True)

    second_ok = (
        idempotency_deploy
        and idempotency_deploy["exit_code"] == 0
        and catalog_after_forward == catalog_after_idempotent
    )
    return {
        "strategy_id": "S_M252_FWD",
        "starting_golden_catalog_fingerprint": clone["starting_catalog_fingerprint"],
        "starting_golden_ledger_fingerprint": clone["starting_ledger_fingerprint"],
        "resolve_operations": resolves,
        "temporary_migration": contract,
        "deploy_to_head": deploy_head,
        "forward_deploy": {
            "exit_code": forward_deploy["exit_code"] if forward_deploy else None,
            "stdout": (forward_deploy or {}).get("stdout"),
        },
        "second_deploy": {
            "exit_code": idempotency_deploy["exit_code"] if idempotency_deploy else None,
            "catalog_delta": catalog_after_forward != catalog_after_idempotent if idempotency_deploy else None,
        },
        "m252_table_present": table_present == "1",
        "pass": bool(contract.get("apply_pass")) and second_ok,
        "failure_reason": None if contract.get("apply_pass") and second_ok else "m252_forward_or_idempotency_failed",
    }


def run_strategy(
    *,
    strategy_id: str,
    golden_clone_fn,
    resolve_migrations: list[str],
) -> dict[str, Any]:
    clone = golden_clone_fn(strategy_id)
    guard = clone["guard"]
    dsn = clone["dsn"]
    run_sql = clone["run_sql"]
    resolves = []
    for migration in resolve_migrations:
        resolves.append(resolve_applied(guard, dsn, migration))
    deploy = run_deploy_pair(guard, dsn, run_sql)
    m252 = observe_m252_behavior(guard, dsn, run_sql)
    first = deploy["first_deploy"]
    second = deploy["second_deploy"]
    pass_first = first["exit_code"] == 0 and first["new_failed"] == 0
    pass_second = (
        second["exit_code"] == 0
        and second["new_finished"] == 0
        and second["new_failed"] == 0
        and second.get("catalog_delta") is False
    )
    return {
        "strategy_id": strategy_id,
        "starting_golden_catalog_fingerprint": clone["starting_catalog_fingerprint"],
        "starting_golden_ledger_fingerprint": clone["starting_ledger_fingerprint"],
        "resolve_operations": resolves,
        "temporary_migration": None,
        "first_deploy": first,
        "second_deploy": second,
        "m252_observation": m252,
        "pass": pass_first and pass_second,
        "failure_reason": None if pass_first and pass_second else "deploy_or_idempotency_failed",
    }
