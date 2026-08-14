#!/usr/bin/env python3
"""Targeted disposable-DB authority simulation: vendor predecessor + unchanged vendor overhaul."""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1b_compile_repair_sql import compile_slot  # noqa: E402
from ci_r3b1c_special_composite_index import SpecialCompositeIndexExecutor  # noqa: E402
from replay_evidence_lib import (  # noqa: E402
    BACKEND,
    DATA,
    PgConfig,
    REPO,
    SPECIAL_MIGRATION,
    enum_exists,
    enum_labels,
    migration_dirs,
    migration_ordinal,
    parse_deploy_output,
    psql,
    recreate_db,
    table_exists,
)

VENDOR_MIGRATION = "20260613210000_vendor_management_overhaul"
VENDOR_SQL = BACKEND / "prisma/migrations" / VENDOR_MIGRATION / "migration.sql"
BOUNDARY_BEFORE_VENDOR = "20260613200000_booking_document_lifecycle"
OUT_PATH = DATA / "ci-r3b1d-vendor-overhaul-authority-simulation-2026-08.json"

OVERHAUL_CATEGORY_LABELS = ["INSURANCE", "APPRAISER", "TOWING", "DEALERSHIP", "OEM_SERVICE"]
BASE_CATEGORY_LABELS = [
    "WORKSHOP", "SERVICE_PARTNER", "PAINT_SHOP", "BODY_REPAIR", "AUTO_GLASS",
    "TIRE_DEALER", "PARTS_DEALER", "DETAILING", "TUV_STATION", "ONLINE_SUPPLIER", "OTHER",
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


def migration_history(cfg: PgConfig, db: str) -> list[str]:
    proc = psql(
        cfg,
        db,
        "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY started_at;",
        tuples_only=True,
    )
    return [line.strip() for line in proc.stdout.splitlines() if line.strip()]


def column_exists(cfg: PgConfig, db: str, table: str, column: str) -> bool:
    proc = psql(
        cfg,
        db,
        "SELECT EXISTS (SELECT 1 FROM information_schema.columns "
        f"WHERE table_schema='public' AND table_name='{table}' AND column_name='{column}');",
        tuples_only=True,
    )
    return proc.returncode == 0 and proc.stdout.strip() == "t"


def fk_exists(cfg: PgConfig, db: str, name: str) -> bool:
    proc = psql(
        cfg,
        db,
        f"SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='{name}');",
        tuples_only=True,
    )
    return proc.returncode == 0 and proc.stdout.strip() == "t"


def index_exists(cfg: PgConfig, db: str, name: str) -> bool:
    proc = psql(
        cfg,
        db,
        f"SELECT to_regclass('public.\"{name}\"') IS NOT NULL;",
        tuples_only=True,
    )
    return proc.returncode == 0 and proc.stdout.strip() == "t"


def replay_to_vendor_blocker(cfg: PgConfig, db: str) -> dict[str, Any]:
    special_handled = 0
    while True:
        code, output = prisma_deploy(cfg, db)
        if code == 0:
            raise RuntimeError("unexpected full deploy success before vendor blocker")
        parsed = parse_deploy_output(output)
        failed = parsed["first_failed_migration"]
        if failed == SPECIAL_MIGRATION:
            SpecialCompositeIndexExecutor(cfg).run(db, reconcile=True)
            special_handled += 1
            continue
        if failed != VENDOR_MIGRATION:
            raise RuntimeError(f"unexpected failure at {failed}: {parsed.get('error_message')}")
        hist = migration_history(cfg, db)
        last = hist[-1] if hist else None
        return {
            "last_applied_migration": last,
            "failure_ordinal": migration_ordinal(failed),
            "sqlstate": parsed.get("sqlstate"),
            "error_message": parsed.get("error_message"),
            "special_migrations_handled": special_handled,
            "migrations_applied_count": len(hist),
        }


def apply_slot7_predecessor(cfg: PgConfig, db: str) -> None:
    contracts = json.loads((DATA / "ci-r3b1d-vendor-predecessor-ddl-contracts-2026-08.json").read_text())
    topology = json.loads((DATA / "ci-r3b1d-post-vendor-repair-topology-2026-08.json").read_text())
    contracts_by = {c["object"]: c for c in contracts["contracts"]}
    slot = topology["slots"][0]
    sql = compile_slot(slot, contracts_by)
    with Path("/tmp/ci_r3b1d_slot7_fixture.sql").open("w") as fh:
        fh.write(sql)
    proc = psql(cfg, db, "", file=Path("/tmp/ci_r3b1d_slot7_fixture.sql"))
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr or proc.stdout)


def apply_vendor_overhaul(cfg: PgConfig, db: str) -> None:
    proc = psql(cfg, db, "", file=VENDOR_SQL)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr or proc.stdout)


def verify_post_conditions(cfg: PgConfig, db: str) -> dict[str, Any]:
    checks: dict[str, Any] = {}
    labels = enum_labels(cfg, db, "VendorCategory")
    checks["VendorCategory_base_labels_present"] = all(l in labels for l in BASE_CATEGORY_LABELS)
    checks["VendorCategory_overhaul_labels_added"] = all(l in labels for l in OVERHAUL_CATEGORY_LABELS)
    checks["VendorCategory_label_count"] = len(labels)

    activity = enum_labels(cfg, db, "ActivityEntity")
    checks["ActivityEntity_vendor_labels"] = all(l in activity for l in ["VENDOR", "VENDOR_VEHICLE_LINK"])

    checks["VendorSource_exists"] = enum_exists(cfg, db, "VendorSource")
    checks["VendorVehicleRelationType_exists"] = enum_exists(cfg, db, "VendorVehicleRelationType")

    for col in ["source", "external_place_id", "address_line2"]:
        checks[f"vendors.{col}"] = column_exists(cfg, db, "vendors", col)
    for col in ["relation_type", "is_preferred", "priority", "valid_from", "valid_until", "updated_at"]:
        checks[f"vendor_vehicles.{col}"] = column_exists(cfg, db, "vendor_vehicles", col)

    checks["org_invoices.vendor_id"] = column_exists(cfg, db, "org_invoices", "vendor_id")
    checks["org_invoices_vendor_id_idx"] = index_exists(cfg, db, "org_invoices_vendor_id_idx")
    checks["org_invoices_vendor_id_fkey"] = fk_exists(cfg, db, "org_invoices_vendor_id_fkey")

    checks["vendors_table_exists"] = table_exists(cfg, db, "vendors")
    checks["vendor_vehicles_table_exists"] = table_exists(cfg, db, "vendor_vehicles")
    checks["pass"] = all(v is True for k, v in checks.items() if k != "VendorCategory_label_count")
    return checks


def main() -> int:
    db = sys.argv[1] if len(sys.argv) > 1 else "synqdrive_r3b1d_vendor_sim"
    cfg = PgConfig()
    recreate_db(cfg, db)

    replay = replay_to_vendor_blocker(cfg, db)
    if replay["last_applied_migration"] != BOUNDARY_BEFORE_VENDOR:
        raise RuntimeError(
            f"expected last applied {BOUNDARY_BEFORE_VENDOR}, got {replay['last_applied_migration']}"
        )

    apply_slot7_predecessor(cfg, db)
    apply_vendor_overhaul(cfg, db)
    post = verify_post_conditions(cfg, db)

    result = {
        "disposable": True,
        "production_connection": False,
        "migration_directories": len(migration_dirs()),
        "replay_to_vendor_blocker": replay,
        "predecessor_fixture": "compiled slot 7 topology SQL (not committed migration)",
            "vendor_overhaul_sql": str(VENDOR_SQL.relative_to(REPO)),
        "vendor_overhaul_modified": False,
        "post_condition_verification": post,
        "pass": post["pass"],
    }
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))
    return 0 if result["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
