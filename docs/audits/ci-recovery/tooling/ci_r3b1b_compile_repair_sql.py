#!/usr/bin/env python3
"""Compile CI-R3B1A.3.2 topology + contracts into six historical repair migration.sql files."""
from __future__ import annotations

import json
import textwrap
from pathlib import Path
from typing import Any

REPO = Path(__file__).resolve().parents[4]
CONTRACTS = REPO / "docs/audits/ci-recovery/data/ci-r3b1a32-predecessor-ddl-contracts-2026-08.json"
TOPOLOGY = REPO / "docs/audits/ci-recovery/data/ci-r3b1a32-final-repair-topology-2026-08.json"
MIG_ROOT = REPO / "backend/prisma/migrations"

SLOT_MIGRATIONS: dict[int, str] = {
    1: "20260412025000_ci_r3b_historical_predecessor_slot1",
    2: "20260412610000_ci_r3b_historical_predecessor_slot2",
    3: "20260413201500_ci_r3b_historical_predecessor_slot3",
    4: "20260413225000_ci_r3b_historical_predecessor_slot4",
    5: "20260417170000_ci_r3b_historical_predecessor_slot5",
    6: "20260421180000_ci_r3b_historical_predecessor_slot6",
}


def qident(name: str) -> str:
    return f'"{name}"'


def enum_labels(contracts_by: dict[str, dict], enum_name: str, action: dict | None = None) -> list[str]:
    if action and action.get("labels"):
        return list(action["labels"])
    c = contracts_by.get(enum_name)
    if c and c.get("labels"):
        return list(c["labels"])
    for contract in contracts_by.values():
        for dep in contract.get("enum_dependencies", []):
            if dep["name"] == enum_name:
                return list(dep.get("labels", []))
    raise KeyError(f"enum labels not found for {enum_name}")


def column_sql(col: dict[str, Any]) -> str:
    typ = col["postgres_type"]
    if not typ.startswith('"') and typ not in {"TEXT", "JSONB", "BOOLEAN", "INTEGER", "DOUBLE PRECISION"} and "TIMESTAMP" not in typ:
        typ = qident(typ.strip('"'))
    parts = [qident(col["column"]), typ]
    if not col.get("nullable", True):
        parts.append("NOT NULL")
    sem = col.get("default_semantics")
    if sem == "DATABASE_DEFAULT" and col.get("postgres_default"):
        parts.append(f"DEFAULT {col['postgres_default']}")
    elif sem == "IDENTITY_OR_SEQUENCE_GENERATED" and col.get("postgres_default"):
        parts.append(f"DEFAULT {col['postgres_default']}")
    return " ".join(parts)


def render_create_enum(enum_name: str, labels: list[str]) -> str:
    labels_sql = ", ".join(f"'{label}'" for label in labels)
    return textwrap.dedent(
        f"""
        DO $$ BEGIN
            CREATE TYPE {qident(enum_name)} AS ENUM ({labels_sql});
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END $$;
        """
    ).strip()


def render_create_sequence(seq_name: str) -> str:
    return f'CREATE SEQUENCE IF NOT EXISTS {qident(seq_name)};'


def render_create_table(table: str, contract: dict[str, Any]) -> str:
    cols = ",\n    ".join(column_sql(c) for c in contract["columns"])
    pk = contract.get("primary_key") or {}
    pk_cols = ", ".join(qident(c) for c in pk.get("columns", ["id"]))
    pk_name = pk.get("name") or f"{table}_pkey"
    return textwrap.dedent(
        f"""
        CREATE TABLE IF NOT EXISTS {qident(table)} (
            {cols},
            CONSTRAINT {qident(pk_name)} PRIMARY KEY ({pk_cols})
        );
        """
    ).strip()


def on_delete_sql(mode: str | None) -> str:
    mapping = {
        "CASCADE": "CASCADE",
        "SET NULL": "SET NULL",
        "RESTRICT": "RESTRICT",
        "NO ACTION": "NO ACTION",
    }
    return mapping.get(mode or "NO ACTION", "NO ACTION")


def fk_table_name(action: dict[str, Any], contracts_by: dict[str, dict[str, Any]]) -> str:
    if action.get("source_repair_object"):
        return action["source_repair_object"]
    name = action["object"]
    if not name.endswith("_fkey"):
        raise RuntimeError(f"invalid FK action object {name}")
    prefix = name[: -len("_fkey")]
    for table in sorted(contracts_by.keys(), key=len, reverse=True):
        suffix = f"{table}_"
        if prefix.startswith(suffix):
            return table
    raise RuntimeError(f"cannot resolve FK table for {name}")


def render_add_fk(action: dict[str, Any], contracts_by: dict[str, dict[str, Any]]) -> str:
    fk = action["fk"]
    table = fk_table_name(action, contracts_by)
    local = ", ".join(qident(c) for c in fk["local_columns"])
    ref = qident(fk["referenced_relation"])
    ref_cols = ", ".join(qident(c) for c in fk["referenced_columns"])
    cname = action["object"]
    return textwrap.dedent(
        f"""
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = '{cname}'
            ) THEN
                ALTER TABLE {qident(table)}
                    ADD CONSTRAINT {qident(cname)}
                    FOREIGN KEY ({local}) REFERENCES {ref}({ref_cols})
                    ON DELETE {on_delete_sql(fk.get('on_delete'))} ON UPDATE {on_delete_sql(fk.get('on_update'))};
            END IF;
        END $$;
        """
    ).strip()


def render_create_index(action: dict[str, Any], contract: dict[str, Any]) -> str:
    obj = action["object"]
    table = contract["object"]
    cols: list[str] | None = None
    for idx in contract.get("required_preexisting_indexes", []):
        idx_cols = idx.get("columns", [])
        expected = f"{table}_{'_'.join(idx_cols)}_idx"
        if obj == expected:
            cols = idx_cols
            break
    if cols is None:
        raise RuntimeError(f"index {obj} not found in contract for {table}")
    cols_sql = ", ".join(qident(c) for c in cols)
    return f'CREATE INDEX IF NOT EXISTS {qident(obj)} ON {qident(table)}({cols_sql});'


def render_unique(action: dict[str, Any], contract: dict[str, Any]) -> str:
    uq_name = action["object"]
    uq = next((u for u in contract.get("unique_constraints", []) if u.get("name") == uq_name), None)
    cols = uq.get("columns", []) if uq else []
    cols_sql = ", ".join(qident(c) for c in cols)
    return f'CREATE UNIQUE INDEX IF NOT EXISTS {qident(uq_name)} ON {qident(contract["object"])}({cols_sql});'


def compile_slot(slot: dict[str, Any], contracts_by: dict[str, dict[str, Any]]) -> str:
    lines = [
        f"-- CI-R3B historical predecessor repair slot {slot['slot']}",
        f"-- after: {slot['after_migration']}",
        f"-- before: {slot['before_migration']}",
        "",
    ]
    table_for_action: dict[str, dict] = {}
    for act in sorted(slot["actions"], key=lambda a: a["order"]):
        if act["action"] == "CREATE TABLE":
            table_for_action[act["object"]] = contracts_by[act["object"]]

    for act in sorted(slot["actions"], key=lambda a: a["order"]):
        action = act["action"]
        obj = act["object"]
        if action == "CREATE TYPE":
            labels = enum_labels(contracts_by, obj, act)
            lines.append(render_create_enum(obj, labels))
            lines.append("")
        elif action == "CREATE SEQUENCE":
            lines.append(render_create_sequence(obj))
            lines.append("")
        elif action == "CREATE TABLE":
            lines.append(render_create_table(obj, contracts_by[obj]))
            lines.append("")
        elif action == "ADD CONSTRAINT" and act.get("fk"):
            lines.append(render_add_fk(act, contracts_by))
            lines.append("")
        elif action == "ADD CONSTRAINT" and act.get("object_type") == "unique":
            table = next(
                t
                for t, c in contracts_by.items()
                if any(u.get("name") == obj for u in c.get("unique_constraints", []))
            )
            lines.append(render_unique(act, contracts_by[table]))
            lines.append("")
        elif action == "CREATE INDEX":
            table = None
            for t, c in contracts_by.items():
                if obj.startswith(f"{t}_"):
                    table = c
                    break
            if table is None:
                raise RuntimeError(f"cannot resolve index table for {obj}")
            lines.append(render_create_index(act, table))
            lines.append("")
        else:
            raise RuntimeError(f"unsupported action {action} for {obj}")
    return "\n".join(lines).rstrip() + "\n"


def main() -> int:
    contracts_doc = json.loads(CONTRACTS.read_text())
    topology_doc = json.loads(TOPOLOGY.read_text())
    contracts_by = {c["object"]: c for c in contracts_doc["contracts"]}

    for slot in topology_doc["slots"]:
        slot_no = slot["slot"]
        mig_name = SLOT_MIGRATIONS[slot_no]
        sql = compile_slot(slot, contracts_by)
        out_dir = MIG_ROOT / mig_name
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / "migration.sql").write_text(sql)
        print(f"Wrote slot {slot_no}: {out_dir / 'migration.sql'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
