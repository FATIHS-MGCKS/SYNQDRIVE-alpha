#!/usr/bin/env python3
"""Targeted PostgreSQL proof using contract-compiled repair SQL (CI-R3B1F.1)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1d12_pg_catalog_reader import read_actual_catalog
from ci_r3b1d12_catalog_model import semantic_default_from_pg_expr
from ci_r3b1f1_constants import DATA, REPO, TIRE_CONSUMER
from ci_r3b1f1_contract_compiler import compile_add_column_contract, sha256_text
from replay_evidence_lib import PgConfig, psql

CONTRACTS = DATA / "ci-r3b1f1-exact-predecessor-contracts-2026-08.json"
OUT = DATA / "ci-r3b1f1-targeted-consumer-proof-2026-08.json"
MIG157 = REPO / "backend/prisma/migrations" / TIRE_CONSUMER / "migration.sql"


def inspect_partial_indexes(cfg: PgConfig, db: str) -> dict:
    proc = psql(
        cfg,
        db,
        """
        SELECT ic.relname, tc.relname, ix.indisunique, pg_get_expr(ix.indpred, ix.indrelid),
               ix.indisvalid, ix.indisready,
               (SELECT string_agg(a.attname, ',' ORDER BY k.ord)
                FROM unnest(ix.indkey) WITH ORDINALITY AS k(attnum, ord)
                JOIN pg_attribute a ON a.attrelid = ix.indrelid AND a.attnum = k.attnum
                WHERE k.attnum > 0)
        FROM pg_index ix
        JOIN pg_class ic ON ic.oid = ix.indexrelid
        JOIN pg_class tc ON tc.oid = ix.indrelid
        JOIN pg_namespace n ON n.oid = tc.relnamespace
        WHERE n.nspname = 'public'
          AND ic.relname IN (
            'vehicle_tire_setups_one_active_setup_per_vehicle',
            'tires_one_active_tire_per_setup_position'
          );
        """,
        tuples_only=True,
    )
    indexes = {}
    for line in proc.stdout.splitlines():
        if not line.strip():
            continue
        parts = line.split("|")
        if len(parts) < 7:
            continue
        name = parts[0]
        col_str = parts[6] if len(parts) > 6 else ""
        indexes[name] = {
            "table": parts[1],
            "unique": parts[2] == "t",
            "predicate": parts[3],
            "valid": parts[4] == "t",
            "ready": parts[5] == "t",
            "columns": [c for c in col_str.split(",") if c],
        }
    return indexes


def verify_status_catalog(catalog: dict) -> dict:
    col = catalog["columns"].get("vehicle_tire_setups", {}).get("status")
    if not col:
        return {"pass": False, "reason": "column_missing"}
    default_info = col.get("default") or {}
    if isinstance(default_info, str):
        default_info = semantic_default_from_pg_expr(default_info, col.get("type"))
    return {
        "pass": col["type"] == "TireSetupStatus" and not col["nullable"] and default_info.get("value") == "ACTIVE",
        "type": col["type"],
        "nullable": col["nullable"],
        "default": default_info,
    }


def main() -> int:
    db = sys.argv[1] if len(sys.argv) > 1 else "synqdrive_r3b1f1_pre157"
    cfg = PgConfig()
    contracts_doc = json.loads(CONTRACTS.read_text())
    proofs = []

    for contract in contracts_doc.get("contracts", []):
        sql = compile_add_column_contract(contract)
        repair_proc = psql(cfg, db, sql)
        catalog = read_actual_catalog(cfg, db)
        catalog_check = verify_status_catalog(catalog) if contract["column"] == "status" else {"pass": repair_proc.returncode == 0}
        mig_proc = psql(cfg, db, MIG157.read_text()) if contract["contract_id"].endswith("-status") else None
        indexes = inspect_partial_indexes(cfg, db) if mig_proc and mig_proc.returncode == 0 else {}
        idx1 = indexes.get("vehicle_tire_setups_one_active_setup_per_vehicle", {})
        idx2 = indexes.get("tires_one_active_tire_per_setup_position", {})
        idx1_pass = bool(
            idx1.get("unique")
            and idx1.get("columns") == ["vehicle_id"]
            and idx1.get("predicate")
            and "status" in idx1.get("predicate", "")
            and "removed_at" in idx1.get("predicate", "")
            and idx1.get("valid")
            and idx1.get("ready")
        )
        idx2_pass = bool(
            idx2.get("unique")
            and idx2.get("columns") == ["tire_set_id", "current_position"]
            and idx2.get("predicate")
            and "active" in idx2.get("predicate", "")
            and idx2.get("valid")
            and idx2.get("ready")
        )
        proofs.append(
            {
                "contract_id": contract["contract_id"],
                "repair_boundary": contract["repair_boundary"],
                "compiled_sql_sha256": sha256_text(sql),
                "compiled_sql": sql.strip(),
                "repair_execution": "PASS" if repair_proc.returncode == 0 else "FAIL",
                "catalog_parity": catalog_check,
                "consumer_migration": contract["first_consumer_migration"],
                "consumer_execution": "PASS" if mig_proc and mig_proc.returncode == 0 else ("SKIP" if not mig_proc else "FAIL"),
                "sqlstate": None,
                "post_consumer_validation": {
                    "vehicle_tire_setups_partial_unique_index": "PASS" if idx1_pass else "FAIL",
                    "tires_partial_unique_index": "PASS" if idx2_pass else "FAIL",
                },
                "pass": repair_proc.returncode == 0
                and catalog_check.get("pass")
                and (mig_proc is None or (mig_proc.returncode == 0 and idx1_pass and idx2_pass)),
            }
        )

    out = {
        "schema_version": 1,
        "phase": "CI-R3B1F.1",
        "database_identifier": db,
        "proofs": proofs,
        "pass": all(p["pass"] for p in proofs),
    }
    OUT.write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps({"pass": out["pass"], "proofs": len(proofs)}, indent=2))
    return 0 if out["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
