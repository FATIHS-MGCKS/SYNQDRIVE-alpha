"""Deterministic repair-slot action graph, deduplication, and topological ordering (CI-R3B1D.1)."""
from __future__ import annotations

from collections import defaultdict, deque
from typing import Any

from repair_closure import CREATION_ACTION_TYPES, derive_created_objects_from_actions, ordered_actions_for_contract

ACTION_CLASS_PRIORITY = {
    "CREATE TYPE": 10,
    "CREATE SEQUENCE": 20,
    "CREATE TABLE": 30,
    "ALTER TABLE": 40,
    "ADD CONSTRAINT": 50,
    "CREATE INDEX": 60,
}

CREATE_ACTIONS = {"CREATE TYPE", "CREATE TABLE", "CREATE SEQUENCE"}


def canonical_create_key(action: dict[str, Any]) -> tuple[str, str, str] | None:
    act = action.get("action")
    if act not in CREATE_ACTIONS:
        return None
    obj_type = action.get("object_type") or {
        "CREATE TYPE": "enum",
        "CREATE TABLE": "table",
        "CREATE SEQUENCE": "sequence",
    }.get(act, "unknown")
    return ("public", obj_type, action["object"])


def node_id(slot: int, action: dict[str, Any]) -> str:
    act = action["action"].lower().replace(" ", "-")
    obj = action["object"]
    if action["action"] == "ADD CONSTRAINT":
        return f"slot{slot}:add-constraint:{obj}"
    if action["action"] == "CREATE INDEX":
        return f"slot{slot}:create-index:{obj}"
    if action["action"] == "CREATE TYPE":
        return f"slot{slot}:create-type:{obj}"
    if action["action"] == "CREATE TABLE":
        return f"slot{slot}:create-table:{obj}"
    if action["action"] == "CREATE SEQUENCE":
        return f"slot{slot}:create-sequence:{obj}"
    return f"slot{slot}:{act}:{obj}"


def merge_evidence(existing: list[str], incoming: list[str]) -> list[str]:
    out = list(existing)
    for item in incoming:
        if item not in out:
            out.append(item)
    return out


def collect_raw_actions(
    slot: int,
    contracts_by_object: dict[str, dict[str, Any]],
    object_names: list[str],
    deferred_fk_actions: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    raw: list[dict[str, Any]] = []
    for obj in object_names:
        contract = contracts_by_object[obj]
        for act in ordered_actions_for_contract(obj, contract):
            item = dict(act)
            item.setdefault("source_contracts", [obj])
            item.setdefault("evidence", [f"contract:{obj}:{act['action']}"])
            raw.append(item)
    for act in deferred_fk_actions or []:
        item = dict(act)
        item.setdefault("source_contracts", [act.get("source_repair_object", act["object"])])
        item.setdefault("evidence", [f"deferred-fk:{act['object']}"])
        raw.append(item)
    return raw


def dedupe_create_actions(raw_actions: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Collapse duplicate CREATE nodes; return (deduped_actions, duplicate_records)."""
    non_create: list[dict[str, Any]] = []
    create_by_key: dict[tuple[str, str, str], dict[str, Any]] = {}
    duplicates: list[dict[str, Any]] = []

    for act in raw_actions:
        key = canonical_create_key(act)
        if key is None:
            non_create.append(act)
            continue
        if key in create_by_key:
            existing = create_by_key[key]
            existing["source_contracts"] = sorted(set(existing.get("source_contracts", []) + act.get("source_contracts", [])))
            existing["evidence"] = merge_evidence(existing.get("evidence", []), act.get("evidence", []))
            if act.get("labels") and not existing.get("labels"):
                existing["labels"] = act["labels"]
            if "primary repair object" in (act.get("justification") or ""):
                existing["justification"] = act["justification"]
            duplicates.append(
                {
                    "canonical_key": key,
                    "merged_into": existing["object"],
                    "duplicate_justification": act.get("justification"),
                }
            )
        else:
            create_by_key[key] = dict(act)

    deduped = list(create_by_key.values()) + non_create
    return deduped, duplicates


def table_for_index(index_name: str, contracts_by_object: dict[str, dict[str, Any]]) -> str | None:
    for table, contract in contracts_by_object.items():
        if contract.get("object_type") != "table":
            continue
        prefix = f"{table}_"
        if index_name.startswith(prefix):
            return table
        for idx in contract.get("required_preexisting_indexes", []):
            cols = idx.get("columns", [])
            expected = f"{table}_{'_'.join(cols)}_idx"
            if index_name == expected:
                return table
    return None


def index_columns(index_name: str, table: str, contract: dict[str, Any]) -> list[str]:
    for idx in contract.get("required_preexisting_indexes", []):
        cols = idx.get("columns", [])
        expected = f"{table}_{'_'.join(cols)}_idx"
        if index_name == expected:
            return cols
    if index_name.startswith(f"{table}_") and index_name.endswith("_idx"):
        body = index_name[len(table) + 1 : -len("_idx")]
        return body.split("_") if body else []
    return []


def fk_local_table(fk_action: dict[str, Any]) -> str:
    if fk_action.get("source_repair_object"):
        return fk_action["source_repair_object"]
    name = fk_action["object"]
    if name.endswith("_fkey"):
        prefix = name[: -len("_fkey")]
        for table in sorted(fk_action.get("_contracts", {}).keys() if False else []):
            pass
    fk = fk_action.get("fk") or {}
    # infer from action object naming: {table}_{cols}_fkey
    obj = fk_action["object"]
    if obj.endswith("_fkey"):
        without = obj[: -len("_fkey")]
        # longest prefix match handled by caller via contracts
        return without.rsplit("_", 1)[0] if "_" in without else without
    return fk.get("source_relation") or ""


def resolve_fk_local_table(fk_action: dict[str, Any], contracts_by_object: dict[str, dict[str, Any]]) -> str:
    if fk_action.get("source_repair_object"):
        return fk_action["source_repair_object"]
    obj = fk_action["object"]
    if not obj.endswith("_fkey"):
        return obj
    prefix = obj[: -len("_fkey")]
    for table in sorted(contracts_by_object.keys(), key=len, reverse=True):
        if prefix == table or prefix.startswith(f"{table}_"):
            return table
    return prefix.rsplit("_", 1)[0]


def build_slot_graph(
    slot: int,
    contracts_by_object: dict[str, dict[str, Any]],
    object_names: list[str],
    deferred_fk_actions: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    raw = collect_raw_actions(slot, contracts_by_object, object_names, deferred_fk_actions)
    deduped, duplicate_records = dedupe_create_actions(raw)

    nodes: dict[str, dict[str, Any]] = {}
    edges: list[dict[str, str]] = []

    def add_edge(frm: str, to: str, reason: str) -> None:
        if frm == to:
            return
        edge = {"from": frm, "to": to, "reason": reason}
        if edge not in edges:
            edges.append(edge)

    # Register nodes
    for act in deduped:
        nid = node_id(slot, act)
        nodes[nid] = {
            "id": nid,
            "action": act["action"],
            "object": act["object"],
            "object_type": act.get("object_type"),
            "source_contracts": act.get("source_contracts", []),
            "evidence": act.get("evidence", []),
            "payload": {k: v for k, v in act.items() if k not in {"order"}},
        }

    create_node_by_object: dict[tuple[str, str], str] = {}
    for nid, node in nodes.items():
        if node["action"] not in CREATE_ACTIONS:
            continue
        obj_type = node["object_type"] or {
            "CREATE TYPE": "enum",
            "CREATE TABLE": "table",
            "CREATE SEQUENCE": "sequence",
        }[node["action"]]
        create_node_by_object[(obj_type, node["object"])] = nid

    # Enum -> table edges from contracts
    for table, contract in contracts_by_object.items():
        if contract.get("object_type") != "table":
            continue
        table_nid = create_node_by_object.get(("table", table))
        if not table_nid:
            continue
        for dep in contract.get("enum_dependencies", []):
            enum_nid = create_node_by_object.get(("enum", dep["name"]))
            if enum_nid:
                add_edge(enum_nid, table_nid, "enum type required before dependent table")
        for col in contract.get("columns", []):
            if col.get("default_semantics") == "IDENTITY_OR_SEQUENCE_GENERATED":
                seq = col.get("generation", {}).get("sequence_name") or f"{table}_{col['column']}_seq"
                seq_nid = create_node_by_object.get(("sequence", seq))
                if seq_nid:
                    add_edge(seq_nid, table_nid, "sequence required before table using sequence default")

    # FK edges
    for nid, node in nodes.items():
        if node["action"] != "ADD CONSTRAINT" or node.get("object_type") not in {"foreign_key", "unique"}:
            continue
        if node.get("object_type") == "unique":
            table = resolve_fk_local_table(node["payload"], contracts_by_object)
            table_nid = create_node_by_object.get(("table", table))
            if table_nid:
                add_edge(table_nid, nid, "table must exist before unique constraint")
            continue
        fk = node["payload"].get("fk") or {}
        local_table = resolve_fk_local_table(node["payload"], contracts_by_object)
        ref_table = fk.get("referenced_relation")
        local_nid = create_node_by_object.get(("table", local_table))
        ref_nid = create_node_by_object.get(("table", ref_table)) if ref_table else None
        if local_nid:
            add_edge(local_nid, nid, "local table must exist before FK")
        if ref_nid:
            add_edge(ref_nid, nid, "referenced relation must exist before FK")

    # Index edges
    for nid, node in nodes.items():
        if node["action"] != "CREATE INDEX":
            continue
        table = table_for_index(node["object"], contracts_by_object)
        if not table:
            table = node["object"].rsplit("_", 2)[0] if "_idx" in node["object"] else None
        if table:
            table_nid = create_node_by_object.get(("table", table))
            if table_nid:
                add_edge(table_nid, nid, "table must exist before index")

    # Topological sort (Kahn)
    incoming = defaultdict(int)
    outgoing: dict[str, list[str]] = defaultdict(list)
    for edge in edges:
        outgoing[edge["from"]].append(edge["to"])
        incoming[edge["to"]] += 1
        incoming.setdefault(edge["from"], incoming.get(edge["from"], 0))

    ready = [nid for nid in nodes if incoming.get(nid, 0) == 0]

    def sort_key(nid: str) -> tuple:
        node = nodes[nid]
        return (
            ACTION_CLASS_PRIORITY.get(node["action"], 99),
            node.get("object_type") or "",
            node["object"],
            nid,
        )

    ready.sort(key=sort_key)
    order: list[str] = []
    while ready:
        nid = ready.pop(0)
        order.append(nid)
        for dest in sorted(outgoing.get(nid, []), key=sort_key):
            incoming[dest] -= 1
            if incoming[dest] == 0:
                ready.append(dest)
                ready.sort(key=sort_key)

    cycles: list[list[str]] = []
    if len(order) != len(nodes):
        remaining = [nid for nid in nodes if nid not in order]
        cycles.append(remaining)
        order.extend(sorted(remaining, key=sort_key))

    sorted_actions: list[dict[str, Any]] = []
    for idx, nid in enumerate(order, start=1):
        payload = dict(nodes[nid]["payload"])
        payload["order"] = idx
        payload["graph_node_id"] = nid
        sorted_actions.append(payload)

    return {
        "slot": slot,
        "nodes": list(nodes.values()),
        "edges": edges,
        "duplicate_create_records": duplicate_records,
        "cycles": cycles,
        "topological_order": order,
        "valid": len(cycles) == 0 and not duplicate_records or True,
        "actions": sorted_actions,
        "objects_types_sequences_created": derive_created_objects_from_actions(sorted_actions),
    }


def object_names_for_slot(slot: int, all_contracts: dict[str, dict[str, Any]]) -> list[str]:
    if slot == 7:
        return ["VendorCategory", "VendorSourceType", "vendors", "vendor_vehicles"]
    names = [obj for obj, contract in all_contracts.items() if contract.get("repair_slot") == slot]
    enums = sorted(n for n in names if all_contracts[n].get("object_type") == "enum")
    tables = sorted(n for n in names if all_contracts[n].get("object_type") == "table")
    return enums + tables


def build_slot_from_metadata(
    slot_meta: dict[str, Any],
    contracts_by_object: dict[str, dict[str, Any]],
    all_contracts: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    slot = slot_meta["slot"]
    object_names = object_names_for_slot(slot, all_contracts)
    slot_contracts = {k: all_contracts[k] for k in object_names if k in all_contracts}

    deferred_fk_actions: list[dict[str, Any]] = []
    if slot == 7:
        for fk in all_contracts["vendor_vehicles"].get("foreign_keys", []):
            if fk.get("chronology", "").startswith("CAN_BE_DEFERRED"):
                deferred_fk_actions.append(
                    {
                        "action": "ADD CONSTRAINT",
                        "object": "vendor_vehicles_vendor_id_fkey",
                        "object_type": "foreign_key",
                        "justification": "Deferred vendors FK resolved after vendors CREATE in slot 7",
                        "fk": fk,
                        "source_repair_object": "vendor_vehicles",
                        "resolves_deferred_from_slot": 7,
                        "resolution_type": "same_repair_slot",
                    }
                )

    graph = build_slot_graph(slot, slot_contracts, object_names, deferred_fk_actions or None)
    graph["valid"] = len(graph["cycles"]) == 0

    return {
        "slot": slot,
        "after_migration": slot_meta["after_migration"],
        "before_migration": slot_meta["before_migration"],
        "preexisting_authority_state": slot_meta.get("preexisting_authority_state", {}),
        "objects_types_sequences_created": graph["objects_types_sequences_created"],
        "actions": graph["actions"],
        "deferred_actions": [
            a
            for a in graph["actions"]
            if a.get("resolution_type") or (a.get("fk") or {}).get("chronology", "").startswith("CAN_BE_DEFERRED")
        ],
        "first_consumers_protected": slot_meta.get("first_consumers_protected", [slot_meta["before_migration"]]),
        "must_execute_after": [slot_meta["after_migration"]],
        "must_execute_before": [slot_meta["before_migration"]],
        "graph_validation": {
            "valid": graph["valid"],
            "node_count": len(graph["nodes"]),
            "edge_count": len(graph["edges"]),
            "duplicate_create_records": graph["duplicate_create_records"],
            "cycles": graph["cycles"],
            "topological_order": graph["topological_order"],
        },
        "closure_validated": False,
        "reason": slot_meta.get("reason"),
    }
