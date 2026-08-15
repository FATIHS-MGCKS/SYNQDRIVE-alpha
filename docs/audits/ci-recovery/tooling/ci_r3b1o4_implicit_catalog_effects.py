"""Deterministic implicit PostgreSQL catalog effects (CI-R3B1O.4 binding corrective)."""
from __future__ import annotations

from typing import Any

from ci_r3b1l2_prisma_sql_parser import sha256_text
from ci_r3b1o4_expected_catalog_effects import build_expected_catalog_deltas


def build_implicit_catalog_effects(*, expected: dict[str, Any] | None = None) -> dict[str, Any]:
    expected = expected or build_expected_catalog_deltas()
    implicit: list[dict[str, Any]] = []

    for effect in expected["effects"]:
        if effect["operation_family"] != "CREATE_TABLE" or effect["object_type"] != "table":
            continue
        table = effect["name"]
        implicit.append(
            {
                "effect_id": sha256_text(f"implicit-row-type|{table}|{effect['migration_name']}"),
                "parent_effect_id": effect["effect_id"],
                "parent_migration": effect["migration_name"],
                "parent_statement_ordinal": effect["statement_ordinal"],
                "parent_statement_sha256": effect["statement_sha256"],
                "postgres_rule": "POSTGRES_TABLE_ROW_TYPE",
                "change_type": "ADDED",
                "object_type": "type",
                "name": table,
                "after_state": {"kind": "c", "related_table": table, "category": "C"},
                "object_id": f"type:{table}",
            }
        )
        array_name = f"_{table}"
        implicit.append(
            {
                "effect_id": sha256_text(f"implicit-composite-array|{table}|{effect['migration_name']}"),
                "parent_effect_id": effect["effect_id"],
                "parent_migration": effect["migration_name"],
                "parent_statement_ordinal": effect["statement_ordinal"],
                "parent_statement_sha256": effect["statement_sha256"],
                "postgres_rule": "POSTGRES_COMPOSITE_ARRAY_TYPE",
                "change_type": "ADDED",
                "object_type": "type",
                "name": array_name,
                "after_state": {"kind": "b", "element_type": table, "category": "A"},
                "object_id": f"type:{array_name}",
            }
        )

    for effect in expected["effects"]:
        if effect["object_type"] != "constraint":
            continue
        after = effect.get("after_state") or {}
        if after.get("kind") != "PRIMARY KEY":
            continue
        owner_table = after.get("owner_table") or effect.get("owner")
        implicit.append(
            {
                "effect_id": sha256_text(f"implicit-pk-index|{effect['name']}|{effect['migration_name']}"),
                "parent_effect_id": effect["effect_id"],
                "parent_migration": effect["migration_name"],
                "parent_statement_ordinal": effect["statement_ordinal"],
                "parent_statement_sha256": effect["statement_sha256"],
                "postgres_rule": "POSTGRES_PRIMARY_KEY_INDEX",
                "change_type": "ADDED",
                "object_type": "index",
                "name": effect["name"],
                "after_state": {"owner_table": owner_table, "name": effect["name"], "primary": True, "unique": True},
                "object_id": f"index:{effect['name']}",
            }
        )

    for effect in expected["effects"]:
        if effect["operation_family"] != "CREATE_TYPE_ENUM" or effect["object_type"] != "enum":
            continue
        enum_name = effect["name"]
        array_name = f"_{enum_name}"
        implicit.append(
            {
                "effect_id": sha256_text(f"implicit-enum-array|{enum_name}|{effect['migration_name']}"),
                "parent_effect_id": effect["effect_id"],
                "parent_migration": effect["migration_name"],
                "parent_statement_ordinal": effect["statement_ordinal"],
                "parent_statement_sha256": effect["statement_sha256"],
                "postgres_rule": "POSTGRES_ENUM_ARRAY_TYPE",
                "change_type": "ADDED",
                "object_type": "type",
                "name": array_name,
                "after_state": {"kind": "b", "element_type": enum_name, "category": "A"},
                "object_id": f"type:{array_name}",
            }
        )

    return {
        "schema_version": 1,
        "phase": "CI-R3B1O.4-binding-corrective",
        "implicit_effect_count": len(implicit),
        "effects": implicit,
        "pass": True,
    }
