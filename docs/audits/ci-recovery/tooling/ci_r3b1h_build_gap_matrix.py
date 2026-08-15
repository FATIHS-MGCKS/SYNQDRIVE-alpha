#!/usr/bin/env python3
"""Build migration-249 predecessor gap matrix with historical authority (CI-R3B1H)."""
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1h_constants import (
    DATA,
    IAM_CONSUMER,
    IAM_HISTORICAL_SCHEMA_COMMIT,
    MIG_ROOT,
    PRE249_BOUNDARY,
    REPO,
)
from insert_select_dependency_extractor import extract_insert_select_from_migration
from sql_migration_analyzer import (
    AnalyzerContext,
    SchemaState,
    apply_statement,
    check_statement_dependencies,
    prescan_creators,
    split_sql_statements,
)

OUT = DATA / "ci-r3b1h-iam-predecessor-gap-matrix-2026-08.json"
CATALOG = DATA / "ci-r3b1h-pre-249-catalog-snapshot-2026-08.json"


def historical_prisma_fields() -> dict[str, dict]:
    schema_text = subprocess.check_output(
        ["git", "show", f"{IAM_HISTORICAL_SCHEMA_COMMIT}:backend/prisma/schema.prisma"],
        cwd=REPO,
        text=True,
    )
    block_m = re.search(r"model OrganizationMembership \{([^}]+)\}", schema_text, re.S)
    fields: dict[str, dict] = {}
    if block_m:
        for line in block_m.group(1).splitlines():
            line = line.strip()
            if not line or line.startswith("//") or line.startswith("@@"):
                continue
            m = re.match(r"(\w+)\s+(\S+.*?)(?:\s+@map\(\"([^\"]+)\"\))?", line)
            if not m:
                continue
            prisma_field = m.group(1)
            physical = m.group(3) or re.sub(r"([A-Z])", r"_\1", prisma_field).lower().lstrip("_")
            optional = "?" in m.group(2)
            fields[physical] = {
                "prisma_field": prisma_field,
                "prisma_type": m.group(2).replace("?", ""),
                "physical_column": physical,
                "optional": optional,
            }
    return fields


def find_column_creator(relation: str, column: str) -> dict | None:
    for mig in sorted(p.name for p in MIG_ROOT.iterdir() if p.is_dir()):
        sql = (MIG_ROOT / mig / "migration.sql").read_text()
        m = re.search(
            rf'ALTER\s+TABLE\s+"{re.escape(relation)}"[\s\S]*ADD\s+COLUMN[\s\S]*"{re.escape(column)}"\s+([^,\n;]+)',
            sql,
            re.I,
        )
        if m:
            return {"migration": mig, "statement_excerpt": m.group(0)[:200]}
        if f'CREATE TABLE "{relation}"' in sql or f"CREATE TABLE {relation}" in sql:
            cm = re.search(rf'"{re.escape(column)}"\s+([^,\n]+)', sql)
            if cm and relation in sql[: sql.index(cm.group(0)) + 500]:
                return {"migration": mig, "statement_excerpt": "CREATE TABLE column"}
    return None


def build_mig249_records() -> list[dict]:
    mig_dir = REPO / "backend/prisma/migrations"
    all_migs = sorted(p.name for p in mig_dir.iterdir() if p.is_dir())
    pre_scope = all_migs[: all_migs.index(PRE249_BOUNDARY)]
    ctx = AnalyzerContext(
        repo=REPO,
        mig_dir=mig_dir,
        scope=[PRE249_BOUNDARY],
        scope_ord={PRE249_BOUNDARY: all_migs.index(PRE249_BOUNDARY) + 1},
        all_migs=all_migs,
    )
    prescan_creators(ctx)
    ctx.records.clear()
    ctx.seq = 0
    state = SchemaState()
    for mig in pre_scope:
        sql = (mig_dir / mig / "migration.sql").read_text()
        for stmt_order, stmt in enumerate(split_sql_statements(sql), 1):
            apply_statement(ctx, mig, stmt_order, stmt, state)

    sql = (mig_dir / PRE249_BOUNDARY / "migration.sql").read_text()
    for stmt_order, stmt in enumerate(split_sql_statements(sql), 1):
        check_statement_dependencies(ctx, PRE249_BOUNDARY, stmt_order, stmt, state)

    return ctx.records


def main() -> int:
    catalog = json.loads(CATALOG.read_text()) if CATALOG.is_file() else {}
    hist = historical_prisma_fields()
    analyzer_records = build_mig249_records()
    catalog_cols = catalog.get("relations", {}).get("organization_memberships", {}).get("all_column_names", [])

    records = []
    for r in analyzer_records:
        if r.get("required_object_type") != "column":
            continue
        rel = r.get("required_relation") or r.get("required_object")
        prop = r.get("required_property") or ""
        pre_col = catalog.get("relations", {}).get(rel, {}).get("columns", {}).get(prop)
        creator = find_column_creator(rel, prop) if rel and prop else None
        hist_field = hist.get(prop, {})
        records.append(
            {
                "consumer_migration": r["migration"],
                "consumer_statement": r["statement_order"],
                "dependency_context": r.get("dependency_context"),
                "target_relation": rel if r.get("dependency_context") == "INSERT_SELECT_TARGET" else None,
                "target_property": prop if r.get("dependency_context") == "INSERT_SELECT_TARGET" else None,
                "source_relation": rel,
                "source_alias": r.get("resolved_alias"),
                "source_property": prop,
                "actual_pre249_existence": pre_col is not None,
                "actual_physical_type": pre_col.get("type") if pre_col else None,
                "actual_nullable": pre_col.get("nullable") if pre_col else None,
                "actual_default": pre_col.get("default") if pre_col else None,
                "historical_creator_migration": r.get("first_creator_migration") or (creator or {}).get("migration"),
                "historical_creator_statement": r.get("creator_statement_order"),
                "classification": r["classification"],
                "evidence": r.get("evidence", []),
                "historical_prisma": hist_field or None,
            }
        )

    counts = {}
    for r in records:
        counts[r["classification"]] = counts.get(r["classification"], 0) + 1

    mig_sql = (MIG_ROOT / IAM_CONSUMER / "migration.sql").read_text()
    insert_inventory = []
    for stmt_order, stmt, deps in extract_insert_select_from_migration(mig_sql):
        insert_inventory.append(
            {
                "statement_order": stmt_order,
                "operation": "INSERT SELECT",
                "dependencies": [
                    {
                        "relation": d.table,
                        "column": d.column,
                        "context": d.context,
                        "alias": d.resolved_alias,
                    }
                    for d in deps
                ],
            }
        )

    permissions_proof = {
        "physical_column": "permissions",
        "first_prisma_appearance_commit": IAM_HISTORICAL_SCHEMA_COMMIT,
        "prisma_type": hist.get("permissions", {}).get("prisma_type"),
        "expected_physical_type": "jsonb",
        "nullable": True,
        "database_default": None,
        "first_migration_consumer": IAM_CONSUMER,
        "any_migration_creator": find_column_creator("organization_memberships", "permissions"),
        "pre249_catalog_exists": "permissions" in catalog_cols,
    }

    out = {
        "schema_version": 1,
        "phase": "CI-R3B1H",
        "consumer_migration": IAM_CONSUMER,
        "insert_select_inventory": insert_inventory,
        "organization_memberships_permissions_proof": permissions_proof,
        "records": records,
        "classification_totals": counts,
        "UNRESOLVED": counts.get("UNRESOLVED", 0),
    }
    OUT.write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps({"records": len(records), "UNRESOLVED": out["UNRESOLVED"], "MISSING_HISTORY": counts.get("MISSING_HISTORY", 0)}, indent=2))
    return 0 if out["UNRESOLVED"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
