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
    unique_keys: dict[str, list[tuple[str, ...]]] = field(default_factory=dict)
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
            unique_keys={k: list(v) for k, v in self.unique_keys.items()},
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
        _register_unique_key(state, table, tuple(pk["columns"]))
    elif "id" in state.columns[table]:
        state.primary_keys[table] = ["id"]
        _register_unique_key(state, table, ("id",))
    for uq in contract.get("unique_constraints", []):
        cols = uq.get("columns") or []
        if cols:
            _register_unique_key(state, table, tuple(cols))


def _register_unique_key(state: SchemaState, table: str, cols: tuple[str, ...]) -> None:
    keys = state.unique_keys.setdefault(table, [])
    if cols not in keys:
        keys.append(cols)


def eligible_reference_keys(state: SchemaState, table: str) -> list[tuple[str, ...]]:
    keys: list[tuple[str, ...]] = []
    pk = state.primary_keys.get(table, [])
    if pk:
        keys.append(tuple(pk))
    keys.extend(state.unique_keys.get(table, []))
    return keys


def is_valid_fk_target(state: SchemaState, ref_table: str | None, ref_cols: list[str]) -> bool:
    if not ref_table:
        return False
    ref_tuple = tuple(ref_cols)
    return ref_tuple in eligible_reference_keys(state, ref_table)


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
        _register_unique_key(state, table, tuple(pk["columns"]))
    elif "id" in cols:
        state.primary_keys[table] = ["id"]
        _register_unique_key(state, table, ("id",))
    return []


def apply_add_unique(
    state: SchemaState,
    action: dict[str, Any],
    table: str,
    contracts_by_object: dict[str, dict[str, Any]],
) -> tuple[list[str], dict[str, Any]]:
    uq_name = action["object"]
    contract = contracts_by_object.get(table, {})
    uq = next((u for u in contract.get("unique_constraints", []) if u.get("name") == uq_name), None)
    cols = list(uq.get("columns", [])) if uq else []
    proof = {
        "table": table,
        "columns": cols,
        "table_exists": table in state.tables,
        "columns_exist": all(c in state.columns.get(table, set()) for c in cols),
    }
    errors: list[str] = []
    if not proof["table_exists"]:
        errors.append(f"unique constraint {uq_name}: table {table} missing")
    elif not cols:
        errors.append(f"unique constraint {uq_name}: authority columns missing")
    elif not proof["columns_exist"]:
        missing = [c for c in cols if c not in state.columns.get(table, set())]
        errors.append(f"unique constraint {uq_name}: columns {missing} missing on {table}")
    else:
        state.constraints.add(uq_name)
        _register_unique_key(state, table, tuple(cols))
    proof["valid"] = not errors
    return errors, proof


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
        "referenced_key_is_pk_or_unique": is_valid_fk_target(state, ref, ref_cols),
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
    if ref and proof["referenced_relation_available_before"] and proof["referenced_columns_available_before"]:
        if not proof["referenced_key_is_pk_or_unique"]:
            errors.append(
                f"FK {action['object']}: referenced columns {ref_cols} on {ref} are not an eligible PK/UNIQUE target"
            )
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
    unique_proofs: list[dict[str, Any]] = []
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
                    "invalid_target_key": bool(fk_errors) and proof.get("referenced_key_is_pk_or_unique") is False,
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
            uq_errors, uq_proof = apply_add_unique(state, action, table or "", contracts_by_object)
            errors.extend(uq_errors)
            unique_proofs.append(
                {
                    "slot": slot["slot"],
                    "constraint": action["object"],
                    "action_order": action.get("order"),
                    **uq_proof,
                }
            )

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
        "unique_proofs": unique_proofs,
        "final_state_valid": len(errors) == 0,
        "pass": len(errors) == 0
        and duplicate_create_actions == 0
        and not slot.get("graph_validation", {}).get("cycles")
        and slot.get("graph_validation", {}).get("valid", True),
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


POST_VENDOR_REPAIR_SLOTS = range(7, 17)


def calculate_deferred_endpoints(
    topology_slots: list[dict[str, Any]],
    all_contracts: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    records: list[dict[str, Any]] = []
    unresolved: list[str] = []

    for slot in topology_slots:
        slot_no = slot["slot"]
        if slot_no not in POST_VENDOR_REPAIR_SLOTS:
            continue
        for act in slot.get("actions", []):
            if act.get("action") != "ADD CONSTRAINT" or act.get("object_type") != "foreign_key":
                continue
            fk = act.get("fk") or {}
            chron = fk.get("chronology", "")
            if not chron.startswith("CAN_BE_DEFERRED") and not act.get("resolves_deferred_from_slot"):
                continue
            local_table = act.get("source_repair_object") or act["object"].rsplit("_", 1)[0]
            resolution_type = act.get("resolution_type")
            endpoint = None
            endpoint_exists = False
            chronology_valid = False

            if act.get("resolves_deferred_from_slot"):
                resolution_type = resolution_type or "same_repair_slot"
                endpoint = f"slot:{slot_no}:{act['object']}"
                endpoint_exists = any(
                    a.get("object") == act["object"]
                    for s in topology_slots
                    if s["slot"] == slot_no
                    for a in s.get("actions", [])
                )
                chronology_valid = act.get("resolves_deferred_from_slot") <= slot_no
            elif resolution_type == "later_repair_slot":
                endpoint = f"slot:{act.get('resolution_slot')}"
                endpoint_exists = any(s["slot"] == act.get("resolution_slot") for s in topology_slots)
                chronology_valid = bool(endpoint_exists)
            elif resolution_type == "historical_migration":
                endpoint = act.get("resolution_migration")
                endpoint_exists = bool(endpoint)
                chronology_valid = bool(endpoint)

            record = {
                "source_slot": act.get("resolves_deferred_from_slot") or slot_no,
                "constraint": act["object"],
                "local_relation": local_table,
                "local_columns": fk.get("local_columns", []),
                "referenced_relation": fk.get("referenced_relation"),
                "referenced_columns": fk.get("referenced_columns", []),
                "resolution_type": resolution_type or "unresolved",
                "resolution_endpoint": endpoint,
                "endpoint_exists": endpoint_exists,
                "chronology_valid": chronology_valid,
                "resolved": endpoint_exists and chronology_valid,
            }
            records.append(record)
            if not record["resolved"]:
                unresolved.append(act["object"])

    for table, contract in all_contracts.items():
        if contract.get("repair_slot") not in POST_VENDOR_REPAIR_SLOTS:
            continue
        if contract.get("object_type") != "table":
            continue
        for fk in contract.get("foreign_keys", []):
            if not fk.get("chronology", "").startswith("CAN_BE_DEFERRED"):
                continue
            constraint = fk.get("constraint_name") or f"{table}_{'_'.join(fk['local_columns'])}_fkey"
            if any(r["constraint"] == constraint for r in records):
                continue
            resolved_in_topology = any(
                act.get("object") == constraint
                for slot in topology_slots
                if slot["slot"] in POST_VENDOR_REPAIR_SLOTS
                for act in slot.get("actions", [])
            )
            record = {
                "source_slot": contract.get("repair_slot"),
                "constraint": constraint,
                "local_relation": table,
                "local_columns": fk.get("local_columns", []),
                "referenced_relation": fk.get("referenced_relation"),
                "referenced_columns": fk.get("referenced_columns", []),
                "resolution_type": "same_repair_slot" if fk.get("defer_until_repair_slot") == contract.get("repair_slot") else "unresolved",
                "resolution_endpoint": f"slot:{fk.get('defer_until_repair_slot')}" if fk.get("defer_until_repair_slot") else None,
                "endpoint_exists": resolved_in_topology,
                "chronology_valid": resolved_in_topology,
                "resolved": resolved_in_topology,
            }
            records.append(record)
            if not record["resolved"]:
                unresolved.append(constraint)

    return {
        "schema_version": 1,
        "phase": "CI-R3B1D.1.1",
        "records": records,
        "total": len(records),
        "resolved": sum(1 for r in records if r["resolved"]),
        "unresolved": unresolved,
        "unresolved_count": len(unresolved),
    }


def validate_all_slots(
    topology_slots: list[dict[str, Any]],
    all_contracts: dict[str, dict[str, Any]],
    closure_doc: dict[str, Any],
) -> dict[str, Any]:
    cumulative_created: set[str] = set()
    slot_results: list[dict[str, Any]] = []
    all_fk_proofs: list[dict[str, Any]] = []
    all_index_proofs: list[dict[str, Any]] = []
    all_unique_proofs: list[dict[str, Any]] = []

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
        all_unique_proofs.extend(result.get("unique_proofs", []))
        for obj in slot.get("objects_types_sequences_created", []):
            cumulative_created.add(obj)

    cross_dupes = global_cross_slot_duplicate_creates(topology_slots)
    deferred_doc = calculate_deferred_endpoints(topology_slots, all_contracts)

    summary = {
        "slots_validated": len(slot_results),
        "total_actions": sum(r["action_count"] for r in slot_results),
        "total_graph_edges": sum(s.get("graph_validation", {}).get("edge_count", 0) for s in topology_slots),
        "duplicate_creates": sum(r["duplicate_create_count"] for r in slot_results),
        "graph_cycles": sum(r["graph_cycles"] for r in slot_results),
        "invalid_fk_actions": sum(1 for p in all_fk_proofs if not p["valid"]),
        "invalid_fk_target_keys": sum(
            1 for p in all_fk_proofs if not p.get("valid") and p.get("referenced_key_is_pk_or_unique") is False
        ),
        "invalid_index_actions": sum(1 for p in all_index_proofs if not p["valid"]),
        "invalid_unique_actions": sum(1 for p in all_unique_proofs if not p.get("valid")),
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
        "unresolved_deferred_endpoints": deferred_doc["unresolved_count"],
        "deferred_endpoint_total": deferred_doc["total"],
        "deferred_endpoint_resolved": deferred_doc["resolved"],
        "slot_results": slot_results,
        "cross_slot_duplicates": cross_dupes,
        "pass": all(r["pass"] for r in slot_results)
        and not cross_dupes
        and deferred_doc["unresolved_count"] == 0,
    }
    return summary, all_fk_proofs, all_index_proofs, all_unique_proofs, deferred_doc
