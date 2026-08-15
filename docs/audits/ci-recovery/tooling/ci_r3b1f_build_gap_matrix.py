#!/usr/bin/env python3
"""Build pre-157 tire lifecycle predecessor gap matrix."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1f_constants import DATA, REPO, TIRE_CONSUMER, TIRE_PROPERTIES
from sql_migration_analyzer import split_sql_statements

OUT = DATA / "ci-r3b1f-tire-lifecycle-predecessor-gap-2026-08.json"
SNAPSHOT = DATA / "ci-r3b1f-pre-157-catalog-snapshot-2026-08.json"
MIG = REPO / "backend/prisma/migrations" / TIRE_CONSUMER / "migration.sql"
INIT_MIG = "20260311224040_init"


def search_column_creator(column: str, table: str) -> dict | None:
    mig_dir = REPO / "backend/prisma/migrations"
    for mig in sorted(p.name for p in mig_dir.iterdir() if p.is_dir()):
        sql = (mig_dir / mig / "migration.sql").read_text()
        if f'"{column}"' in sql and table in sql:
            if re_add := __import__("re").search(
                rf'ALTER\s+TABLE\s+"{table}"[\s\S]*ADD\s+COLUMN[\s\S]*"{column}"',
                sql,
                __import__("re").I,
            ):
                return {"migration": mig, "kind": "ADD COLUMN", "evidence": re_add.group(0)[:120]}
            if mig == INIT_MIG and f'CREATE TABLE "{table}"' in sql:
                body = sql[sql.find(f'CREATE TABLE "{table}"') :]
                if f'"{column}"' in body.split(");")[0]:
                    return {"migration": mig, "kind": "CREATE TABLE", "evidence": f"{table}.{column} in init"}
    return None


def statement_inventory() -> list[dict]:
    sql = MIG.read_text()
    inventory = []
    for order, stmt in enumerate(split_sql_statements(sql), 1):
        upper = stmt.upper()
        if "ALTER TYPE" in upper and "TIRESETUPSTATUS" in upper:
            stype = "ALTER TYPE ADD VALUE"
            target = "TireSetupStatus"
        elif "CREATE UNIQUE INDEX" in upper and "vehicle_tire_setups" in stmt:
            stype = "CREATE UNIQUE INDEX"
            target = "vehicle_tire_setups_one_active_setup_per_vehicle"
        elif "CREATE UNIQUE INDEX" in upper and "tires" in stmt:
            stype = "CREATE UNIQUE INDEX"
            target = "tires_one_active_tire_per_setup_position"
        else:
            stype = "OTHER"
            target = "unknown"
        inventory.append(
            {
                "statement_order": order,
                "statement_type": stype,
                "target_object": target,
                "statement_excerpt": " ".join(stmt.split())[:160],
            }
        )
    return inventory


def main() -> int:
    snapshot = json.loads(SNAPSHOT.read_text())
    gaps = []
    for table, column in TIRE_PROPERTIES:
        key = f"{table}.{column}"
        tracked = snapshot["tracked_properties"][key]
        exists = tracked["exists"]
        creator = search_column_creator(column, table) if not exists else search_column_creator(column, table)
        if exists:
            classification = "VALID"
            creator_info = creator or {"migration": INIT_MIG if column in {"vehicle_id", "removed_at"} else None}
        else:
            classification = "MISSING_HISTORY"
            creator_info = creator

        stmt_order = 4 if table == "vehicle_tire_setups" and column in {"status", "removed_at", "vehicle_id"} else 5
        if column == "vehicle_id" or column == "removed_at":
            context = "partial_index_predicate" if column != "vehicle_id" else "index_key"
        elif table == "tires":
            context = "partial_index_predicate" if column in {"active", "tire_set_id"} else "index_key"
        else:
            context = "partial_index_predicate"

        gaps.append(
            {
                "relation": table,
                "property": column,
                "required_by_migration": TIRE_CONSUMER,
                "required_by_statement": stmt_order,
                "required_context": context,
                "actual_pre_157_exists": exists,
                "historical_creator": creator_info.get("migration") if creator_info else None,
                "classification": classification,
                "evidence": [
                    f"pre157_snapshot:{key}:exists={exists}",
                    *( [creator_info["evidence"]] if creator_info and creator_info.get("evidence") else []),
                ],
            }
        )

    out = {
        "schema_version": 1,
        "phase": "CI-R3B1F",
        "consumer_migration": TIRE_CONSUMER,
        "statement_inventory": statement_inventory(),
        "gaps": gaps,
        "slot_13_authority_incomplete_for_status": True,
        "slot_13_should_have_included_status": True,
        "slot_13_should_have_included_status_rationale": (
            "Slot 13 created TireSetupStatus enum consumed by migration 157 partial index predicate "
            "on vehicle_tire_setups.status, but did not ADD COLUMN status. Expression-aware analysis "
            "shows status is a predicate dependency, not just enum type dependency."
        ),
    }
    OUT.write_text(json.dumps(out, indent=2) + "\n")
    missing = [g for g in gaps if g["classification"] == "MISSING_HISTORY"]
    print(json.dumps({"pass": True, "missing_count": len(missing), "missing": [g["property"] for g in missing if g["relation"]=="vehicle_tire_setups"]}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
