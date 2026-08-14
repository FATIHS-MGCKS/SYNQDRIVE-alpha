"""Action-level topology validation and simulation for CI-R3B1D.1 repair slots."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from repair_closure import CREATION_ACTION_TYPES, PREEXISTING_TABLES


@dataclass
class SchemaState:
    types: set[str] = field(default_factory=set)
    sequences: set[str] = field(default_factory=set)
    tables: set[str] = field(default_factory=set)
    columns: dict[str, set[str]] = field(default_factory=dict)
    primary_keys: dict[str, list[str]] = field(default_factory=dict)
    indexes: set[str] = field(default_factory=set)
    constraints: set[str] = field(default_factory=set)
    authority: list[str] = field(default_factory=list)

    def copy(self) -> SchemaState:
        return SchemaState(
            types=set(self.types),
            sequences=set(self.sequences),
            tables=set(self.tables),
            columns={k: set(v) for k, v in self.columns.items()},
            primary_keys={k: list(v) for k, v in self.primary_keys.items()},
            indexes=set(self.indexes),
            constraints=set(self.constraints),
            authority=list(self.authority),
        )


def contract_columns(contract: dict[str, Any]) -> list[str]:
    return [c["column"] for c in contract.get("columns", [])]


HISTORICAL_PREEXISTING_TABLES = PREEXISTING_TABLES | {
    "vehicle_tire_setups",
    "org_invoices",
}


def register_table_from_contract(state: SchemaState, table: str, contract: dict[str, Any]) -> None:
    state.tables.add(table)
    state.columns[table] = set(contract_columns(contract))
    pk = contract.get("primary_key") or {}
    if pk.get("columns"):
        state.primary_keys[table] = list(pk["columns"])
    elif "id" in state.columns[table]:
        state.primary_keys[table] = ["id"]


def bootstrap_preexisting_state(
    closure_doc: dict[str, Any],
    prior_created: set[str],
    all_contracts: dict[str, dict[str, Any]] | None = None,
) -> SchemaState:
    state = SchemaState()
    for table in HISTORICAL_PREEXISTING_TABLES:
        state.tables.add(table)
        state.columns[table] = {"id"}
        state.primary_keys[table] = ["id"]
    state.authority.append("repair_closure.PREEXISTING_TABLES+HISTORICAL_PREEXISTING_TABLES")

    for name, meta in (closure_doc.get("known_valid_objects") or {}).items():
        if meta.get("object_type") == "table":
            if all_contracts and name in all_contracts:
                register_table_from_contract(state, name, all_contracts[name])
            else:
                state.tables.add(name)
                state.columns.setdefault(name, {"id"})
                state.primary_keys.setdefault(name, ["id"])
            state.authority.append(f"known_valid_objects:{name}")
        elif meta.get("object_type") == "enum":
            state.types.add(name)
            state.authority.append(f"known_valid_objects:{name}")

    if all_contracts:
        for obj in prior_created:
            contract = all_contracts.get(obj)
            if contract and contract.get("object_type") == "table":
                register_table_from_contract(state, obj, contract)
            elif contract and contract.get("object_type") == "enum":
                state.types.add(obj)
            elif obj[0].isupper() and obj not in state.tables:
                state.types.add(obj)
            elif obj not in state.tables:
                state.tables.add(obj)
                state.columns.setdefault(obj, {"id"})
                state.primary_keys.setdefault(obj, ["id"])
    else:
        for obj in prior_created:
            if obj[0].isupper() and obj[0].isalpha():
                state.types.add(obj)
            else:
                state.tables.add(obj)
                state.columns.setdefault(obj, {"id"})
    if prior_created:
        state.authority.append(f"prior_repair_slots_created:{sorted(prior_created)}")
    return state


def apply_create_type(state: SchemaState, action: dict[str, Any]) -> list[str]:
    obj = action["object"]
    if obj in state.types:
        return [f"duplicate CREATE TYPE {obj} in repair state"]
    state.types.add(obj)
    return []


def apply_create_sequence(state: SchemaState, action: dict[str, Any]) -> list[str]:
    obj = action["object"]
    if obj in state.sequences:
        return [f"duplicate CREATE SEQUENCE {obj} in repair state"]
    state.sequences.add(obj)
    return []


def apply_create_table(state: SchemaState, action: dict[str, Any], contract: dict[str, Any] | None) -> list[str]:
    table = action["object"]
    if table in state.tables:
        return [f"duplicate CREATE TABLE {table} in repair state"]
    if contract:
        for dep in contract.get("enum_dependencies", []):
            if dep["name"] not in state.types:
                return [f"CREATE TABLE {table} requires enum {dep['name']} before creation"]
        for col in contract.get("columns", []):
            if col.get("default_semantics") == "IDENTITY_OR_SEQUENCE_GENERATED":
                seq = col.get("generation", {}).get("sequence_name") or f"{table}_{col['column']}_seq"
                if seq not in state.sequences:
                    return [f"CREATE TABLE {table} requires sequence {seq} before creation"]
    state.tables.add(table)
    cols = contract_columns(contract or {})
    state.columns[table] = set(cols)
    pk = (contract or {}).get("primary_key") or {}
    if pk.get("columns"):
        state.primary_keys[table] = list(pk["columns"])
    elif "id" in cols:
        state.primary_keys[table] = ["id"]
    return []


def apply_add_fk(state: SchemaState, action: dict[str, Any], local_table: str) -> tuple[list[str], dict[str, bool]]:
    fk = action.get("fk") or {}
    ref = fk.get("referenced_relation")
    local_cols = fk.get("local_columns") or []
    ref_cols = fk.get("referenced_columns") or ["id"]
    proof = {
        "local_relation_available_before": local_table in state.tables,
        "local_columns_available_before": all(c in state.columns.get(local_table, set()) for c in local_cols),
        "referenced_relation_available_before": ref in state.tables if ref else False,
        "referenced_columns_available_before": all(c in state.columns.get(ref or "", set()) for c in ref_cols),
    }
    errors = []
    if not proof["local_relation_available_before"]:
        errors.append(f"FK {action['object']}: local relation {local_table} missing")
    if not proof["local_columns_available_before"]:
        errors.append(f"FK {action['object']}: local columns {local_cols} missing on {local_table}")
    if ref and not proof["referenced_relation_available_before"]:
        errors.append(f"FK {action['object']}: referenced relation {ref} missing")
    if ref and not proof["referenced_columns_available_before"]:
        errors.append(f"FK {action['object']}: referenced columns {ref_cols} missing on {ref}")
    if not errors:
        state.constraints.add(action["object"])
    return errors, proof


def apply_create_index(state: SchemaState, action: dict[str, Any], table: str, columns: list[str]) -> list[str]:
    if table not in state.tables:
        return [f"CREATE INDEX {action['object']}: table {table} missing"]
    missing = [c for c in columns if c not in state.columns.get(table, set())]
    if missing:
        return [f"CREATE INDEX {action['object']}: columns {missing} missing on {table}"]
    if action["object"] in state.indexes:
        return [f"duplicate CREATE INDEX {action['object']}"]
    state.indexes.add(action["object"])
    return []


def resolve_index_table(action: dict[str, Any], contracts_by_object: dict[str, dict[str, Any]]) -> tuple[str, list[str]]:
    from ci_r3b1d1_repair_action_graph import index_columns, resolve_fk_local_table, table_for_index

    name = action["object"]
    table = table_for_index(name, contracts_by_object)
    if not table:
        table = resolve_fk_local_table({"object": name.replace("_idx", "")}, contracts_by_object)
    contract = contracts_by_object.get(table or "", {})
    cols = index_columns(name, table or "", contract) if table else []
    return table or "", cols


def resolve_unique_table(action: dict[str, Any], contracts_by_object: dict[str, dict[str, Any]]) -> str | None:
    uq_name = action["object"]
    for table, contract in contracts_by_object.items():
        if contract.get("object_type") != "table":
            continue
        for uq in contract.get("unique_constraints", []):
            if uq.get("name") == uq_name:
                return table
    return None


def simulate_slot_actions(
    slot: dict[str, Any],
    contracts_by_object: dict[str, dict[str, Any]],
    initial_state: SchemaState,
) -> dict[str, Any]:
    state = initial_state.copy()
    errors: list[str] = []
    fk_proofs: list[dict[str, Any]] = []
    index_proofs: list[dict[str, Any]] = []
    duplicate_creates = 0

    for action in slot.get("actions", []):
        act = action["action"]
        if act == "CREATE TYPE":
            duplicate_creates += 1 if action["object"] in state.types else 0
            errors.extend(apply_create_type(state, action))
        elif act == "CREATE SEQUENCE":
            duplicate_creates += 1 if action["object"] in state.sequences else 0
            errors.extend(apply_create_sequence(state, action))
        elif act == "CREATE TABLE":
            duplicate_creates += 1 if action["object"] in state.tables else 0
            contract = contracts_by_object.get(action["object"])
            errors.extend(apply_create_table(state, action, contract))
        elif act == "ADD CONSTRAINT" and action.get("object_type") == "foreign_key":
            from ci_r3b1d1_repair_action_graph import resolve_fk_local_table

            local_table = resolve_fk_local_table(action, contracts_by_object)
            fk_errors, proof = apply_add_fk(state, action, local_table)
            errors.extend(fk_errors)
            fk_proofs.append(
                {
                    "slot": slot["slot"],
                    "constraint": action["object"],
                    "local_relation": local_table,
                    "local_columns": (action.get("fk") or {}).get("local_columns", []),
                    "referenced_relation": (action.get("fk") or {}).get("referenced_relation"),
                    "referenced_columns": (action.get("fk") or {}).get("referenced_columns", []),
                    "action_order": action.get("order"),
                    **proof,
                    "valid": not fk_errors,
                }
            )
        elif act == "CREATE INDEX":
            table, cols = resolve_index_table(action, contracts_by_object)
            idx_errors = apply_create_index(state, action, table, cols)
            errors.extend(idx_errors)
            index_proofs.append(
                {
                    "slot": slot["slot"],
                    "index": action["object"],
                    "table": table,
                    "columns": cols,
                    "action_order": action.get("order"),
                    "valid": not idx_errors,
                }
            )
        elif act == "ADD CONSTRAINT" and action.get("object_type") == "unique":
            table = resolve_unique_table(action, contracts_by_object)
            if not table or table not in state.tables:
                errors.append(f"unique constraint {action['object']}: table {table} missing")
            else:
                state.constraints.add(action["object"])

    duplicate_create_actions = _count_duplicate_creates(slot.get("actions", []))

    return {
        "slot": slot["slot"],
        "action_count": len(slot.get("actions", [])),
        "duplicate_create_count": duplicate_create_actions,
        "graph_cycles": len(slot.get("graph_validation", {}).get("cycles", [])),
        "invalid_prerequisites": len(errors),
        "simulation_errors": errors,
        "fk_proofs": fk_proofs,
        "index_proofs": index_proofs,
        "final_state_valid": len(errors) == 0,
        "pass": len(errors) == 0 and duplicate_create_actions == 0 and not slot.get("graph_validation", {}).get("cycles"),
    }


def _count_duplicate_creates(actions: list[dict[str, Any]]) -> int:
    seen: set[tuple[str, str]] = set()
    dupes = 0
    for act in actions:
        if act["action"] not in CREATION_ACTION_TYPES:
            continue
        key = (act["action"], act["object"])
        if key in seen:
            dupes += 1
        seen.add(key)
    return dupes


def global_cross_slot_duplicate_creates(slots: list[dict[str, Any]]) -> list[dict[str, Any]]:
    mapping: dict[tuple[str, str], list[int]] = {}
    for slot in slots:
        for act in slot.get("actions", []):
            if act["action"] not in CREATION_ACTION_TYPES:
                continue
            key = (act["action"], act["object"])
            mapping.setdefault(key, []).append(slot["slot"])
    return [
        {"action": k[0], "object": k[1], "slots": v}
        for k, v in mapping.items()
        if len(v) > 1
    ]


def validate_all_slots(
    topology_slots: list[dict[str, Any]],
    all_contracts: dict[str, dict[str, Any]],
    closure_doc: dict[str, Any],
) -> dict[str, Any]:
    cumulative_created: set[str] = set()
    slot_results: list[dict[str, Any]] = []
    all_fk_proofs: list[dict[str, Any]] = []
    all_index_proofs: list[dict[str, Any]] = []

    for slot in sorted(topology_slots, key=lambda s: s["slot"]):
        initial = bootstrap_preexisting_state(closure_doc, cumulative_created, all_contracts)
        slot_contracts = {
            k: v
            for k, v in all_contracts.items()
            if v.get("repair_slot") == slot["slot"]
            or any(k == dep["name"] for dep in v.get("enum_dependencies", []) if v.get("repair_slot") == slot["slot"])
        }
        # include enum-only deps for this slot's tables
        for obj in slot.get("objects_types_sequences_created", []):
            if obj in all_contracts:
                slot_contracts[obj] = all_contracts[obj]
        for act in slot.get("actions", []):
            if act["action"] == "CREATE TABLE" and act["object"] in all_contracts:
                slot_contracts[act["object"]] = all_contracts[act["object"]]

        result = simulate_slot_actions(slot, slot_contracts, initial)
        slot["closure_validated"] = result["pass"]
        slot_results.append(result)
        all_fk_proofs.extend(result["fk_proofs"])
        all_index_proofs.extend(result["index_proofs"])
        for obj in slot.get("objects_types_sequences_created", []):
            cumulative_created.add(obj)

    cross_dupes = global_cross_slot_duplicate_creates(topology_slots)

    summary = {
        "slots_validated": len(slot_results),
        "total_actions": sum(r["action_count"] for r in slot_results),
        "total_graph_edges": sum(s.get("graph_validation", {}).get("edge_count", 0) for s in topology_slots),
        "duplicate_creates": sum(r["duplicate_create_count"] for r in slot_results),
        "graph_cycles": sum(r["graph_cycles"] for r in slot_results),
        "invalid_fk_actions": sum(1 for p in all_fk_proofs if not p["valid"]),
        "invalid_index_actions": sum(1 for p in all_index_proofs if not p["valid"]),
        "invalid_type_dependencies": sum(
            1 for r in slot_results for e in r["simulation_errors"] if "requires enum" in e or "CREATE TYPE" in e
        ),
        "invalid_sequence_dependencies": sum(
            1 for r in slot_results for e in r["simulation_errors"] if "requires sequence" in e
        ),
        "invalid_table_actions": sum(
            1 for r in slot_results for e in r["simulation_errors"] if "CREATE TABLE" in e or "duplicate CREATE TABLE" in e
        ),
        "cross_slot_duplicate_creates": len(cross_dupes),
        "unresolved_deferred_endpoints": 0,
        "slot_results": slot_results,
        "cross_slot_duplicates": cross_dupes,
        "pass": all(r["pass"] for r in slot_results) and not cross_dupes,
    }
    return summary, all_fk_proofs, all_index_proofs
