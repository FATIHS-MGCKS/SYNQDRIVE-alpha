"""Fresh final strategy twin for CI-R3B1O.3."""
from __future__ import annotations

import shutil
import tempfile
import time
from pathlib import Path
from typing import Any

from ci_r3b1n2_twin_ops import classify_ledger_delta, export_ledger, parse_deploy_errors, run_prisma
from ci_r3b1o_constants import BACKEND, M252, M252_TABLE, MIG_ROOT, R3B1G, R3B1I
from ci_r3b1o_strategy import resolve_applied
from ci_r3b1o_twin_manager import clone_strategy_from_golden
from ci_r3b1o1_final_twin import _catalog_snapshot, _ledger_snapshot
from ci_r3b1o3_constants import FINAL_STRATEGY_DB_PREFIX
from ci_r3b1o3_m252_complete_authority import build_m252_complete_physical_authority
from ci_r3b1o3_m252_exact_parity import run_m252_exact_parity


def build_temp_forward_m252_migration() -> tuple[Path, dict[str, Any]]:
    ts = time.strftime("%Y%m%d%H%M%S")
    name = f"{ts}_ci_r3b1o3_strategy_m252_forward_reconciliation"
    sql = (MIG_ROOT / M252 / "migration.sql").read_text()
    contract = {
        "temporary_migration_name": name,
        "source_migration": M252,
        "purpose": "append_only_forward_reconciliation",
        "target_table": M252_TABLE,
        "sql_sha256_source": "corrected migration 252",
        "tracked_repository": False,
    }
    tmp_root = Path(tempfile.mkdtemp(prefix="r3b1o3_m252_fwd_"))
    mig_dir = tmp_root / "backend" / "prisma" / "migrations" / name
    mig_dir.mkdir(parents=True)
    (mig_dir / "migration.sql").write_text(sql)
    return tmp_root, contract


def run_final_winning_strategy(*, golden: dict[str, Any], prod_identity: dict[str, Any]) -> dict[str, Any]:
    clone = clone_strategy_from_golden(golden=golden, strategy_id=FINAL_STRATEGY_DB_PREFIX)
    guard = clone["guard"]
    dsn = clone["dsn"]
    run_sql = clone["run_sql"]

    resolves = []
    for migration in [R3B1G, R3B1I]:
        before = export_ledger(dsn)
        result = resolve_applied(guard, dsn, migration)
        after = export_ledger(dsn)
        result["ledger_delta"] = classify_ledger_delta(before, after)
        resolves.append(result)

    status_before = run_prisma(["npx", "prisma", "migrate", "status"], guard, dsn)
    ledger_before_deploy = export_ledger(dsn)
    deploy_head = run_prisma(["npm", "run", "prisma:migrate:deploy"], guard, dsn)
    ledger_after_deploy = export_ledger(dsn)
    deploy_delta = classify_ledger_delta(ledger_before_deploy, ledger_after_deploy)
    parsed = parse_deploy_errors((deploy_head.get("stdout") or "") + "\n" + (deploy_head.get("stderr") or ""))

    m252_before = run_sql(
        f"SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='{M252_TABLE}';"
    ).strip()

    tmp_root, forward_contract = build_temp_forward_m252_migration()
    target = BACKEND / "prisma" / "migrations" / forward_contract["temporary_migration_name"]
    forward_deploy = None
    try:
        shutil.copytree(tmp_root / "backend" / "prisma" / "migrations" / forward_contract["temporary_migration_name"], target)
        forward_deploy = run_prisma(["npm", "run", "prisma:migrate:deploy"], guard, dsn)
    finally:
        if target.exists():
            shutil.rmtree(target)
        shutil.rmtree(tmp_root, ignore_errors=True)

    authority = build_m252_complete_physical_authority()
    m252_parity = run_m252_exact_parity(run_sql, authority)

    pre_second = {
        "ledger": _ledger_snapshot(dsn),
        "catalog": _catalog_snapshot(run_sql),
        "migrate_status": run_prisma(["npx", "prisma", "migrate", "status"], guard, dsn),
    }
    second_deploy = run_prisma(["npm", "run", "prisma:migrate:deploy"], guard, dsn)
    post_second = {
        "ledger": _ledger_snapshot(dsn),
        "catalog": _catalog_snapshot(run_sql),
        "migrate_status": run_prisma(["npx", "prisma", "migrate", "status"], guard, dsn),
    }

    ledger_row_delta = post_second["ledger"]["count"] - pre_second["ledger"]["count"]
    idempotency = {
        "pre_second_deploy_ledger_fingerprint": pre_second["ledger"]["fingerprint_sha256"],
        "post_second_deploy_ledger_fingerprint": post_second["ledger"]["fingerprint_sha256"],
        "pre_second_deploy_catalog_fingerprint": pre_second["catalog"]["fingerprint_sha256"],
        "post_second_deploy_catalog_fingerprint": post_second["catalog"]["fingerprint_sha256"],
        "second_deploy_exit_code": second_deploy["exit_code"],
        "new_ledger_rows": ledger_row_delta,
        "new_finished_rows": post_second["ledger"]["finished"] - pre_second["ledger"]["finished"],
        "new_failed_rows": post_second["ledger"]["failed"] - pre_second["ledger"]["failed"],
        "catalog_delta": pre_second["catalog"]["fingerprint_sha256"] != post_second["catalog"]["fingerprint_sha256"],
        "pass": (
            second_deploy["exit_code"] == 0
            and ledger_row_delta == 0
            and post_second["ledger"]["failed"] == pre_second["ledger"]["failed"]
            and pre_second["catalog"]["fingerprint_sha256"] == post_second["catalog"]["fingerprint_sha256"]
        ),
    }

    return {
        "strategy_id": "FINAL_WINNING_STRATEGY",
        "database_name": clone["database_name"],
        "dsn_alias": "LOCAL_DISPOSABLE_FINAL",
        "resolve_operations": resolves,
        "normal_deploy": {
            "exit_code": deploy_head["exit_code"],
            "new_finished": deploy_delta["new_finished"],
            "new_failed": deploy_delta["new_failed"],
            "first_failing_migration": parsed.get("first_failing_migration"),
            "migrate_status_exit": status_before["exit_code"],
        },
        "m252_before_forward_table_present": m252_before == "1",
        "forward_migration": forward_contract,
        "forward_deploy": {
            "exit_code": forward_deploy["exit_code"] if forward_deploy else None,
            "stdout": (forward_deploy or {}).get("stdout"),
        },
        "m252_exact_parity": m252_parity,
        "second_deploy_idempotency": idempotency,
        "final_migrate_status": post_second["migrate_status"],
        "pass": (
            all(r["pass"] for r in resolves)
            and deploy_head["exit_code"] == 0
            and deploy_delta["new_failed"] == 0
            and forward_deploy
            and forward_deploy["exit_code"] == 0
            and m252_parity["pass"]
            and idempotency["pass"]
        ),
        "_internal": {"dsn": dsn, "run_sql": run_sql, "guard": guard},
    }
