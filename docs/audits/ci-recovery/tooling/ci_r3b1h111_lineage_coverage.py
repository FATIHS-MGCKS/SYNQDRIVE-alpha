"""Hardened lineage coverage validation with independent qualified-reference inventory (CI-R3B1H.1.1)."""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from ci_r3b1h111_constants import DATA, REPO
from sql_migration_analyzer import AnalyzerContext, SchemaState, apply_statement, prescan_creators, split_sql_statements
from sql_scope_resolver import parse_from_item, split_from_items

OUT = DATA / "ci-r3b1h111-lineage-coverage-validation-2026-08.json"
MATRIX = DATA / "ci-r3b1h111-insert-select-dependency-matrix-2026-08.json"

SQL_TYPE_TOKENS = {
    "int",
    "integer",
    "text",
    "varchar",
    "boolean",
    "bool",
    "jsonb",
    "uuid",
    "timestamp",
    "public",
    "pg_catalog",
}


def relation_inventory_at(migration: str, statement_order: int) -> set[str]:
    all_migs = sorted(p.name for p in (REPO / "backend/prisma/migrations").iterdir() if p.is_dir())
    ctx = AnalyzerContext(
        repo=REPO,
        mig_dir=REPO / "backend/prisma/migrations",
        scope=all_migs,
        scope_ord={m: i + 1 for i, m in enumerate(all_migs)},
        all_migs=all_migs,
    )
    prescan_creators(ctx)
    state = SchemaState()
    for mig in all_migs:
        sql = (REPO / "backend/prisma/migrations" / mig / "migration.sql").read_text()
        for idx, stmt in enumerate(split_sql_statements(sql), 1):
            apply_statement(ctx, mig, idx, stmt, state)
            if mig == migration and idx == statement_order:
                return set(state.tables)
        if mig == migration:
            break
    return set(state.tables)


def independent_qualified_references(stmt: str) -> list[tuple[str, str]]:
    refs: list[tuple[str, str]] = []
    insert_m = re.search(r"INSERT\s+INTO\b", stmt, re.I)
    select_m = re.search(r"\bSELECT\b", stmt, re.I)
    if not insert_m or not select_m:
        return refs
    body = stmt[select_m.start() :]
    from_m = re.search(r"\bFROM\b", body, re.I)
    if not from_m:
        return refs
    from_clause = body[from_m.end() :]
    for stop in ("WHERE", "GROUP", "HAVING", "ORDER", "LIMIT", "ON CONFLICT", "RETURNING"):
        stop_m = re.search(rf"\b{stop}\b", from_clause, re.I)
        if stop_m:
            from_clause = from_clause[: stop_m.start()]
            break

    aliases: dict[str, str] = {}
    for part in split_from_items(from_clause.strip()):
        bind = parse_from_item(part.strip())
        if bind.relation and bind.alias:
            aliases[bind.alias] = bind.relation
        elif bind.relation:
            aliases[bind.relation] = bind.relation

    scan_text = body
    ident_part = r'(?:"[^"]+"|[a-z_][a-z0-9_]*)'
    for match in re.finditer(rf'({ident_part})\s*\.\s*({ident_part})', scan_text, re.I):
        alias = match.group(1).strip('"')
        col = match.group(2).strip('"')
        if alias.lower() in SQL_TYPE_TOKENS or col.lower() in SQL_TYPE_TOKENS:
            continue
        refs.append((alias, col))

    physical: list[tuple[str, str]] = []
    for alias, col in refs:
        rel = aliases.get(alias, alias)
        if rel.lower() in SQL_TYPE_TOKENS:
            continue
        physical.append((rel, col))
    return physical


def physical_alias_leakage(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    leaks = []
    for record in records:
        if record.get("classification") in {"FALSE_POSITIVE", "INTENTIONAL", "CONDITIONAL_SAFE"}:
            continue
        if record.get("dependency_context") == "INSERT_SELECT_TARGET":
            continue
        rel = record.get("resolved_relation") or record.get("required_relation") or ""
        if not rel:
            continue
        inventory = relation_inventory_at(record["migration"], record["statement_order"])
        if rel not in inventory:
            leaks.append(
                {
                    "id": record.get("id"),
                    "migration": record.get("migration"),
                    "statement_order": record.get("statement_order"),
                    "resolved_relation": rel,
                    "required_property": record.get("required_property"),
                    "classification": record.get("classification"),
                }
            )
    return leaks


def _statement_coverage_index(records: list[dict[str, Any]]) -> dict[tuple[str, int], list[dict[str, Any]]]:
    index: dict[tuple[str, int], list[dict[str, Any]]] = {}
    for record in records:
        if record.get("dependency_context") == "INSERT_SELECT_TARGET":
            continue
        key = (record["migration"], record.get("statement_order"))
        index.setdefault(key, []).append(record)
    return index


def _property_matches(record_prop: str | None, col: str) -> bool:
    if not record_prop:
        return False
    if record_prop == col:
        return True
    if col.startswith(record_prop) or record_prop.startswith(col):
        return True
    return False


def _derived_alias_with_physical_root(
    alias_or_rel: str,
    col: str,
    stmt: str,
    stmt_records: list[dict[str, Any]],
    inventory: set[str],
) -> bool:
    derived_aliases = {
        record.get("resolved_alias")
        for record in stmt_records
        if record.get("classification") == "FALSE_POSITIVE"
        and record.get("resolved_alias") == record.get("resolved_relation")
    }
    if alias_or_rel not in derived_aliases:
        return False
    if not re.search(rf"\b{re.escape(alias_or_rel)}\.{re.escape(col)}\b", stmt, re.I):
        return False
    for table in inventory:
        if re.search(rf"\bFROM\s+{re.escape(table)}\b", stmt, re.I):
            return True
        if re.search(rf"\bJOIN\s+{re.escape(table)}\b", stmt, re.I):
            return True
    return False


def _reference_covered(
    alias_or_rel: str,
    col: str,
    stmt_records: list[dict[str, Any]],
    *,
    stmt: str = "",
    inventory: set[str] | None = None,
) -> bool:
    for record in stmt_records:
        if not _property_matches(record.get("required_property"), col):
            continue
        if alias_or_rel in {
            record.get("resolved_relation"),
            record.get("resolved_alias"),
            record.get("required_relation"),
        }:
            return True
    if stmt and inventory is not None:
        return _derived_alias_with_physical_root(alias_or_rel, col, stmt, stmt_records, inventory)
    return False


def qualified_reference_coverage_gaps(records: list[dict[str, Any]], scope: list[str]) -> list[dict[str, Any]]:
    gaps = []
    by_stmt = _statement_coverage_index(records)
    for mig in scope:
        sql = (REPO / "backend/prisma/migrations" / mig / "migration.sql").read_text()
        for stmt_order, stmt in enumerate(split_sql_statements(sql), 1):
            if not re.search(r"INSERT\s+INTO\b", stmt, re.I) or not re.search(r"\bSELECT\b", stmt, re.I):
                continue
            stmt_records = by_stmt.get((mig, stmt_order), [])
            inventory = relation_inventory_at(mig, stmt_order)
            for rel, col in independent_qualified_references(stmt):
                if not _reference_covered(rel, col, stmt_records, stmt=stmt, inventory=inventory):
                    gaps.append({"migration": mig, "statement_order": stmt_order, "reference": f"{rel}.{col}"})
    return gaps


def derived_lineage_gaps(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Flag FALSE_POSITIVE derived rows that orphan required physical sources in the same statement."""
    gaps = []
    by_stmt: dict[tuple[str, int], list[dict[str, Any]]] = {}
    for record in records:
        by_stmt.setdefault((record["migration"], record["statement_order"]), []).append(record)

    for (migration, stmt_order), stmt_records in by_stmt.items():
        physical = {
            (r.get("resolved_relation"), r.get("required_property"))
            for r in stmt_records
            if r.get("classification") in {"VALID", "MISSING_HISTORY", "ORDERING_DEFECT"}
            and r.get("dependency_context") != "INSERT_SELECT_TARGET"
        }
        for record in stmt_records:
            if record.get("classification") != "MISSING_HISTORY":
                continue
            rel = record.get("resolved_relation") or ""
            inventory = relation_inventory_at(migration, stmt_order)
            if rel not in inventory and not any(p[0] in inventory for p in physical):
                gaps.append({"id": record.get("id"), "reason": "missing underlying physical representation"})
    return gaps


def build_lineage_report(matrix_path: Path | None = None) -> dict[str, Any]:
    matrix = json.loads((matrix_path or MATRIX).read_text())
    records = matrix.get("records", [])
    scope = matrix.get("audit_scope", {}).get("scope_migrations") or []
    alias_leaks = physical_alias_leakage(records)
    qr_gaps = qualified_reference_coverage_gaps(records, scope)
    derived_gaps = derived_lineage_gaps(records)
    return {
        "schema_version": 1,
        "phase": "CI-R3B1H.1.1",
        "physical_alias_leakage": len(alias_leaks),
        "physical_alias_leakage_records": alias_leaks,
        "derived_lineage_gaps": len(derived_gaps),
        "derived_lineage_gap_records": derived_gaps,
        "qualified_reference_coverage_gaps": len(qr_gaps),
        "qualified_reference_gaps": qr_gaps,
        "pass": len(alias_leaks) == 0 and len(qr_gaps) == 0 and len(derived_gaps) == 0,
    }


def main() -> int:
    report = build_lineage_report()
    OUT.write_text(json.dumps(report, indent=2) + "\n")
    print(
        json.dumps(
            {
                "pass": report["pass"],
                "physical_alias_leakage": report["physical_alias_leakage"],
                "derived_lineage_gaps": report["derived_lineage_gaps"],
                "qualified_reference_coverage_gaps": report["qualified_reference_coverage_gaps"],
            },
            indent=2,
        )
    )
    return 0 if report["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
