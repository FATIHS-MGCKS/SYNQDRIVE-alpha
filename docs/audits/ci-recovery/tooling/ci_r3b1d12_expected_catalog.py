"""Derive normalized expected catalog state from accepted topology + contracts."""
from __future__ import annotations

from typing import Any

from ci_r3b1b_compile_repair_sql import enum_labels, fk_table_name
from ci_r3b1d1_repair_action_graph import index_columns, resolve_fk_local_table, table_for_index
from ci_r3b1d12_catalog_model import ExpectedCatalog, normalize_contract_type, semantic_default_from_contract


def load_contracts(vendor_path, remaining_path) -> dict[str, dict[str, Any]]:
    import json
    from pathlib import Path

    vendor = json.loads(Path(vendor_path).read_text())
    remaining = json.loads(Path(remaining_path).read_text())
    by_obj = {c["object"]: c for c in vendor["contracts"]}
    by_obj.update({c["object"]: c for c in remaining["contracts"]})
    return by_obj


def build_expected_for_slot(
    slot: dict[str, Any],
    contracts: dict[str, dict[str, Any]],
    cumulative: ExpectedCatalog,
) -> ExpectedCatalog:
    slot_no = slot["slot"]
    expected = ExpectedCatalog(
        types=dict(cumulative.types),
        sequences=dict(cumulative.sequences),
        tables=dict(cumulative.tables),
        columns={k: dict(v) for k, v in cumulative.columns.items()},
        primary_keys=dict(cumulative.primary_keys),
        unique_constraints=dict(cumulative.unique_constraints),
        foreign_keys=dict(cumulative.foreign_keys),
        indexes=dict(cumulative.indexes),
    )

    for action in slot.get("actions", []):
        act = action["action"]
        obj = action["object"]
        src = f"slot{slot_no}:{act}:{obj}"

        if act == "CREATE TYPE":
            labels = enum_labels(contracts, obj, action)
            expected.types[obj] = {
                "kind": "type",
                "slot": slot_no,
                "schema": "public",
                "name": obj,
                "labels": labels,
                "source_action": src,
            }
        elif act == "CREATE SEQUENCE":
            expected.sequences[obj] = {
                "kind": "sequence",
                "slot": slot_no,
                "schema": "public",
                "name": obj,
                "source_action": src,
            }
        elif act == "CREATE TABLE":
            contract = contracts[obj]
            expected.tables[obj] = {
                "kind": "table",
                "slot": slot_no,
                "schema": "public",
                "name": obj,
                "source_action": src,
            }
            expected.columns.setdefault(obj, {})
            for col in contract.get("columns", []):
                cname = col["column"]
                expected.columns[obj][cname] = {
                    "slot": slot_no,
                    "table": obj,
                    "name": cname,
                    "type": normalize_contract_type(col.get("postgres_type", "")),
                    "nullable": col.get("nullable", True),
                    "default": semantic_default_from_contract(col),
                    "source_action": src,
                }
            pk = contract.get("primary_key") or {}
            pk_cols = list(pk.get("columns") or ["id"])
            pk_name = pk.get("name") or f"{obj}_pkey"
            expected.primary_keys[pk_name] = {
                "kind": "primary_key",
                "slot": slot_no,
                "table": obj,
                "name": pk_name,
                "columns": pk_cols,
                "source_action": src,
            }
        elif act == "ADD CONSTRAINT" and action.get("object_type") == "foreign_key":
            fk = action.get("fk") or {}
            local_table = resolve_fk_local_table(action, contracts)
            expected.foreign_keys[obj] = {
                "kind": "foreign_key",
                "slot": slot_no,
                "name": obj,
                "local_table": local_table,
                "local_columns": list(fk.get("local_columns") or []),
                "referenced_table": fk.get("referenced_relation"),
                "referenced_columns": list(fk.get("referenced_columns") or ["id"]),
                "on_delete": (fk.get("on_delete") or "NO ACTION").upper(),
                "on_update": (fk.get("on_update") or "NO ACTION").upper(),
                "source_action": src,
            }
        elif act == "ADD CONSTRAINT" and action.get("object_type") == "unique":
            table = None
            uq_cols: list[str] = []
            for tname, contract in contracts.items():
                if contract.get("object_type") != "table":
                    continue
                for uq in contract.get("unique_constraints", []):
                    if uq.get("name") == obj:
                        table = tname
                        uq_cols = list(uq.get("columns") or [])
                        break
            expected.indexes[obj] = {
                "kind": "index",
                "slot": slot_no,
                "name": obj,
                "table": table,
                "unique": True,
                "method": "btree",
                "columns": uq_cols,
                "predicate": None,
                "source_action": src,
            }
        elif act == "CREATE INDEX":
            table = table_for_index(obj, contracts)
            contract = contracts.get(table or "", {})
            cols = index_columns(obj, table or "", contract) if table else []
            expected.indexes[obj] = {
                "kind": "index",
                "slot": slot_no,
                "name": obj,
                "table": table,
                "unique": False,
                "method": "btree",
                "columns": cols,
                "predicate": None,
                "source_action": src,
            }

    return expected


def build_cumulative_expected(topology: dict[str, Any], contracts: dict[str, dict[str, Any]]) -> dict[int, ExpectedCatalog]:
    cumulative = ExpectedCatalog()
    by_slot: dict[int, ExpectedCatalog] = {}
    for slot in sorted(topology["slots"], key=lambda s: s["slot"]):
        if slot["slot"] < 7 or slot["slot"] > 16:
            continue
        cumulative = build_expected_for_slot(slot, contracts, cumulative)
        by_slot[slot["slot"]] = cumulative
    return by_slot
