"""Golden baseline twin and strategy clone management."""
from __future__ import annotations

import json
import secrets
import subprocess
from pathlib import Path
from typing import Any, Callable

from ci_r3b1n1_production_access import export_prisma_ledger
from ci_r3b1n2_catalog_fingerprint import build_catalog_fingerprint, compare_catalog_fingerprints
from ci_r3b1n2_instance_identity import MutationGuard, query_instance_identity_dsn
from ci_r3b1n2_twin_ops import (
    business_row_counts,
    export_ledger,
    insert_ledger_rows,
    ledger_canonical_fingerprint,
    parse_local_dsn,
    psql_exec,
    restore_schema,
    twin_dsn,
)
from ci_r3b1n2_constants import BUSINESS_TABLES
from ci_r3b1o_constants import GOLDEN_BASELINE_DB_PREFIX, STRATEGY_DB_PREFIX, WORK_R3B1O, ensure_r3b1o_workdir


def create_database(base_dsn: str, db_name: str) -> str:
    admin = twin_dsn(base_dsn, "postgres")
    psql_exec(admin, f'CREATE DATABASE "{db_name}";')
    return twin_dsn(base_dsn, db_name)


def drop_database(base_dsn: str, db_name: str) -> None:
    admin = twin_dsn(base_dsn, "postgres")
    psql_exec(admin, f'DROP DATABASE IF EXISTS "{db_name}" WITH (FORCE);')


def clone_database_from_template(base_dsn: str, source_db: str, target_db: str) -> str:
    admin = twin_dsn(base_dsn, "postgres")
    psql_exec(admin, f'CREATE DATABASE "{target_db}" TEMPLATE "{source_db}";')
    return twin_dsn(base_dsn, target_db)


def twin_sql_runner_factory(dsn: str) -> Callable[[str], str]:
    def run_sql(sql: str) -> str:
        proc = subprocess.run(["psql", dsn, "-At", "-c", sql], capture_output=True, text=True)
        if proc.returncode != 0:
            raise RuntimeError(proc.stderr or proc.stdout)
        return proc.stdout or ""

    return run_sql


def build_golden_baseline(
    *,
    guard: MutationGuard,
    schema_dump: Path,
    prod_ledger: list[dict[str, Any]],
    prod_catalog_fp: str,
    prod_ledger_fp: str,
) -> dict[str, Any]:
    ensure_r3b1o_workdir()
    base_dsn, _ = parse_local_dsn()
    db_name = f"{GOLDEN_BASELINE_DB_PREFIX}_{secrets.token_hex(4)}"
    dsn = create_database(base_dsn, db_name)
    guard = MutationGuard(
        {
            "instance_fingerprint_sha256": guard.production_fp,
            "database_fingerprint_sha256": guard.production_db_fp,
        },
        query_instance_identity_dsn(dsn),
    )
    guard.verify_target(dsn, operation="golden_baseline_create")
    restore_schema(guard, dsn, schema_dump)
    psql_exec(dsn, 'TRUNCATE TABLE "_prisma_migrations";')
    insert_ledger_rows(guard, dsn, prod_ledger)

    run_sql = twin_sql_runner_factory(dsn)
    twin_catalog = build_catalog_fingerprint(run_sql)
    twin_ledger = export_ledger(dsn)
    twin_ledger_fp = ledger_canonical_fingerprint(twin_ledger)
    business = business_row_counts(dsn, BUSINESS_TABLES)
    identity = query_instance_identity_dsn(dsn)
    catalog_compare = compare_catalog_fingerprints(
        {"fingerprint_sha256": prod_catalog_fp, "payload": {}, "object_counts": {}},
        twin_catalog,
    )
    catalog_compare["production_fingerprint"] = prod_catalog_fp
    catalog_compare["twin_fingerprint"] = twin_catalog["fingerprint_sha256"]

    manifest = {
        "schema_version": 1,
        "phase": "CI-R3B1O",
        "logical_name": "R3B1O_GOLDEN_BASELINE",
        "database_name": db_name,
        "dsn_alias": "LOCAL_DISPOSABLE_GOLDEN",
        "instance_fingerprint_sha256": identity["instance_fingerprint_sha256"],
        "database_fingerprint_sha256": identity["database_fingerprint_sha256"],
        "catalog_fingerprint_sha256": twin_catalog["fingerprint_sha256"],
        "ledger_fingerprint_sha256": twin_ledger_fp,
        "catalog_fidelity_pass": prod_catalog_fp == twin_catalog["fingerprint_sha256"],
        "ledger_fidelity_pass": prod_ledger_fp == twin_ledger_fp,
        "no_business_data_pass": business["pass"],
        "business_row_total": business["total_rows"],
        "immutable": True,
        "pass": prod_catalog_fp == twin_catalog["fingerprint_sha256"]
        and prod_ledger_fp == twin_ledger_fp
        and business["pass"],
    }
    manifest_path = WORK_R3B1O / "golden_baseline_manifest.json"
    manifest_path.write_text(json.dumps({**manifest, "dsn": "[REDACTED]"}, indent=2) + "\n")
    return {
        **manifest,
        "dsn": dsn,
        "guard": guard,
        "run_sql": run_sql,
        "catalog": twin_catalog,
    }


def clone_strategy_from_golden(
    *,
    golden: dict[str, Any],
    strategy_id: str,
) -> dict[str, Any]:
    base_dsn, _ = parse_local_dsn()
    golden_db = golden["database_name"]
    target_db = f"{STRATEGY_DB_PREFIX}_{strategy_id.lower()}_{secrets.token_hex(3)}"
    dsn = clone_database_from_template(base_dsn, golden_db, target_db)
    identity = query_instance_identity_dsn(dsn)
    guard = MutationGuard(
        {
            "instance_fingerprint_sha256": golden["guard"].production_fp,
            "database_fingerprint_sha256": golden["guard"].production_db_fp,
        },
        identity,
    )
    guard.verify_target(dsn, operation=f"strategy_clone_{strategy_id}")
    run_sql = twin_sql_runner_factory(dsn)
    ledger_fp = ledger_canonical_fingerprint(export_ledger(dsn))
    catalog_fp = build_catalog_fingerprint(run_sql)["fingerprint_sha256"]
    verified = (
        ledger_fp == golden["ledger_fingerprint_sha256"]
        and catalog_fp == golden["catalog_fingerprint_sha256"]
    )
    if not verified:
        raise RuntimeError(f"Strategy clone {strategy_id} failed golden fingerprint verification")
    return {
        "strategy_id": strategy_id,
        "database_name": target_db,
        "dsn": dsn,
        "guard": guard,
        "run_sql": run_sql,
        "starting_catalog_fingerprint": catalog_fp,
        "starting_ledger_fingerprint": ledger_fp,
    }
