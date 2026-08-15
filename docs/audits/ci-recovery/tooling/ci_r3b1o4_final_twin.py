"""Append-only tail reconciliation strategy twin for CI-R3B1O.4."""
from __future__ import annotations

import shutil
import time
from pathlib import Path
from typing import Any

from ci_r3b1n2_twin_ops import classify_ledger_delta, export_ledger, parse_deploy_errors, run_prisma
from ci_r3b1o_constants import BACKEND, M252_TABLE, R3B1G, R3B1I
from ci_r3b1o_strategy import resolve_applied
from ci_r3b1o_twin_manager import clone_strategy_from_golden
from ci_r3b1o1_final_twin import _catalog_snapshot, _ledger_snapshot
from ci_r3b1o3_index_provenance import TARGET_INDEXES, snapshot_indexes
from ci_r3b1o3_m252_exact_parity import run_m252_exact_parity
from ci_r3b1o4_constants import FINAL_STRATEGY_DB_PREFIX, INVOICE_REPLACEMENT, STALE_INDEXES, WHATSAPP_REPLACEMENT
from ci_r3b1o4_stale_index_authority import _whatsapp_replacement_state, build_replacement_uniqueness_safety, inspect_index_drop_safety
from ci_r3b1o4_tail_contract import build_temp_tail_migration_dir, evaluate_tail_preconditions

INDEX_NAMES = [s["index_name"] for s in TARGET_INDEXES]
REPLACEMENT_NAMES = [INVOICE_REPLACEMENT["name"], WHATSAPP_REPLACEMENT["name"]]


def _snapshot_tail_state(run_sql, *, label: str) -> dict[str, Any]:
    stale = snapshot_indexes(run_sql, INDEX_NAMES)
    replacements = {
        INVOICE_REPLACEMENT["name"]: {
            "present": run_sql(
                f"SELECT COUNT(*) FROM pg_indexes WHERE schemaname='public' AND indexname='{INVOICE_REPLACEMENT['name']}';"
            ).strip()
            == "1",
        },
        WHATSAPP_REPLACEMENT["name"]: {
            "present": _whatsapp_replacement_state(run_sql)["present"],
            "physical_name": _whatsapp_replacement_state(run_sql).get("physical_name"),
        },
    }
    m252_present = (
        run_sql(
            f"SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='{M252_TABLE}';"
        ).strip()
        == "1"
    )
    return {"label": label, "stale_indexes": stale, "replacements": replacements, "m252_table_present": m252_present}


def run_tail_reconciliation_strategy(*, golden: dict[str, Any], prod_identity: dict[str, Any]) -> dict[str, Any]:
    clone = clone_strategy_from_golden(golden=golden, strategy_id=FINAL_STRATEGY_DB_PREFIX)
    guard = clone["guard"]
    dsn = clone["dsn"]
    run_sql = clone["run_sql"]

    timeline = {"T0_golden_baseline": _snapshot_tail_state(run_sql, label="T0")}
    resolves = []
    for migration in [R3B1G, R3B1I]:
        before = export_ledger(dsn)
        result = resolve_applied(guard, dsn, migration)
        after = export_ledger(dsn)
        result["ledger_delta"] = classify_ledger_delta(before, after)
        resolves.append(result)

    timeline["T1_after_resolves_before_deploy"] = _snapshot_tail_state(run_sql, label="T1")

    status_before = run_prisma(["npx", "prisma", "migrate", "status"], guard, dsn)
    ledger_before_deploy = export_ledger(dsn)
    deploy_head = run_prisma(["npm", "run", "prisma:migrate:deploy"], guard, dsn)
    ledger_after_deploy = export_ledger(dsn)
    deploy_delta = classify_ledger_delta(ledger_before_deploy, ledger_after_deploy)
    parsed = parse_deploy_errors((deploy_head.get("stdout") or "") + "\n" + (deploy_head.get("stderr") or ""))
    timeline["T2_after_normal_migrate_deploy"] = _snapshot_tail_state(run_sql, label="T2")

    pre_tail_preconditions = evaluate_tail_preconditions(run_sql, phase="pre_tail")
    drop_safety_t2 = {name: inspect_index_drop_safety(run_sql, name) for name in INDEX_NAMES}
    replacement_safety_t2 = build_replacement_uniqueness_safety(run_sql)

    tmp_root, tail_contract = build_temp_tail_migration_dir()
    target = BACKEND / "prisma" / "migrations" / tail_contract["temporary_migration_name"]
    tail_deploy = None
    try:
        shutil.copytree(tmp_root / "backend" / "prisma" / "migrations" / tail_contract["temporary_migration_name"], target)
        ledger_before_tail = export_ledger(dsn)
        tail_deploy = run_prisma(["npm", "run", "prisma:migrate:deploy"], guard, dsn)
        ledger_after_tail = export_ledger(dsn)
        tail_delta = classify_ledger_delta(ledger_before_tail, ledger_after_tail)
    finally:
        if target.exists():
            shutil.rmtree(target)
        shutil.rmtree(tmp_root, ignore_errors=True)

    timeline["T3_after_tail_reconciliation"] = _snapshot_tail_state(run_sql, label="T3")
    post_tail_preconditions = evaluate_tail_preconditions(run_sql, phase="post_tail")
    m252_parity = run_m252_exact_parity(run_sql)

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

    stale_reproduced = all(
        timeline["T2_after_normal_migrate_deploy"]["stale_indexes"][name]["present"] for name in INDEX_NAMES
    )

    return {
        "strategy_id": "APPEND_ONLY_TAIL_RECONCILIATION",
        "database_name": clone["database_name"],
        "dsn_alias": "LOCAL_DISPOSABLE_TAIL",
        "resolve_operations": resolves,
        "normal_deploy": {
            "exit_code": deploy_head["exit_code"],
            "new_finished": deploy_delta["new_finished"],
            "new_failed": deploy_delta["new_failed"],
            "first_failing_migration": parsed.get("first_failing_migration"),
            "migrate_status_exit": status_before["exit_code"],
        },
        "tail_migration": tail_contract,
        "tail_deploy": {
            "exit_code": tail_deploy["exit_code"] if tail_deploy else None,
            "new_finished": tail_delta["new_finished"] if tail_deploy else None,
            "new_failed": tail_delta["new_failed"] if tail_deploy else None,
        },
        "pre_tail_preconditions": pre_tail_preconditions,
        "post_tail_preconditions": post_tail_preconditions,
        "drop_safety_t2": drop_safety_t2,
        "replacement_safety_t2": replacement_safety_t2,
        "stale_indexes_reproduced_at_t2": stale_reproduced,
        "m252_exact_parity": m252_parity,
        "index_timeline": timeline,
        "second_deploy_idempotency": idempotency,
        "final_migrate_status": post_second["migrate_status"],
        "pass": (
            all(r["pass"] for r in resolves)
            and deploy_head["exit_code"] == 0
            and deploy_delta["new_failed"] == 0
            and tail_deploy
            and tail_deploy["exit_code"] == 0
            and (tail_delta["new_failed"] if tail_deploy else 1) == 0
            and pre_tail_preconditions["pass"]
            and post_tail_preconditions["pass"]
            and stale_reproduced
            and m252_parity["pass"]
            and idempotency["pass"]
        ),
        "_internal": {"dsn": dsn, "run_sql": run_sql, "guard": guard},
    }
