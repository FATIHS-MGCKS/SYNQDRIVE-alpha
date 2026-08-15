"""DDL effect parser and pending-effect classification."""
from __future__ import annotations

import re
from typing import Any, Callable


def parse_migration_effects(sql: str) -> list[dict[str, Any]]:
    effects: list[dict[str, Any]] = []
    for m in re.finditer(
        r'ALTER TABLE\s+"([^"]+)"\s+ADD COLUMN\s+"([^"]+)"(?:\s+([^;]+?))?(?:;|$)',
        sql,
        re.I | re.S,
    ):
        effects.append({"kind": "add_column", "table": m.group(1), "column": m.group(2), "definition": (m.group(3) or "").strip()})
    for m in re.finditer(r'CREATE TABLE\s+"([^"]+)"', sql, re.I):
        effects.append({"kind": "create_table", "table": m.group(1)})
    for m in re.finditer(r'CREATE TYPE\s+"([^"]+)"\s+AS\s+ENUM', sql, re.I):
        effects.append({"kind": "create_enum", "enum": m.group(1)})
    for m in re.finditer(r'CREATE (UNIQUE )?INDEX\s+"([^"]+)"\s+ON\s+"([^"]+)"', sql, re.I):
        effects.append({"kind": "create_index", "index": m.group(2), "table": m.group(3), "unique": bool(m.group(1))})
    return effects


def classify_pending_effects(
    migration: str,
    sql: str,
    *,
    column_exists: Callable[[str, str], bool],
    table_exists: Callable[[str], bool],
) -> dict[str, Any]:
    effects = parse_migration_effects(sql)
    if not effects:
        return {
            "migration": migration,
            "effects": [],
            "classification": "PENDING_EFFECT_UNKNOWN",
            "modeled_effects": 0,
        }
    present = 0
    absent = 0
    for eff in effects:
        if eff["kind"] == "add_column":
            if column_exists(eff["table"], eff["column"]):
                present += 1
            else:
                absent += 1
        elif eff["kind"] == "create_table":
            if table_exists(eff["table"]):
                present += 1
            else:
                absent += 1
        else:
            return {
                "migration": migration,
                "effects": effects,
                "classification": "PENDING_EFFECT_UNKNOWN",
                "modeled_effects": len(effects),
            }
    if present and absent:
        classification = "PENDING_PARTIAL_EFFECT_PRESENT"
    elif present and not absent:
        classification = "PENDING_BUT_EFFECT_ALREADY_PRESENT"
    elif absent and not present:
        classification = "PENDING_AND_PHYSICALLY_ABSENT"
    else:
        classification = "PENDING_EFFECT_UNKNOWN"
    return {
        "migration": migration,
        "effects": effects,
        "classification": classification,
        "modeled_effects": len(effects),
        "present_count": present,
        "absent_count": absent,
    }
