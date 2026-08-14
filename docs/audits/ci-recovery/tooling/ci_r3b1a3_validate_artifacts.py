#!/usr/bin/env python3
"""Comprehensive validator for CI-R3B1A.3 authority artifacts."""
from __future__ import annotations

import json
import re
import sys
from collections import Counter
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from repair_closure import OBJECT_SLOT, object_available_at_slot  # noqa: E402

MATRIX = REPO / "docs/audits/ci-recovery/data/ci-r3b1a2-full-migration-dependency-matrix-2026-08.json"
CONTRACTS = REPO / "docs/audits/ci-recovery/data/ci-r3b1a3-predecessor-ddl-contracts-2026-08.json"
CLOSURE = REPO / "docs/audits/ci-recovery/data/ci-r3b1a3-repair-dependency-closure-2026-08.json"
TOPOLOGY = REPO / "docs/audits/ci-recovery/data/ci-r3b1a3-final-repair-topology-2026-08.json"

PRISMA_TYPE_RE = re.compile(
    r"^(String|Int|BigInt|Boolean|Float|Decimal|DateTime|Json|Bytes)(\?)?$"
)
TRUNC_DEFAULT_RE = re.compile(r"^(uuid|now|autoincrement|cuid)\($")
ALLOWED_SEMANTICS = {
    "DATABASE_DEFAULT",
    "APPLICATION_OR_PRISMA_GENERATED",
    "IDENTITY_OR_SEQUENCE_GENERATED",
    "NO_DATABASE_DEFAULT",
}
NAV_FIELDS = {
    "OrgTask": {"fine", "invoice"},
    "BatteryEvidence": {"vehicle", "documentExtraction", "serviceEvent"},
    "VehicleDtcEvent": {"vehicle"},
}

COUNTS = {
    "invalid_column_dependencies": 0,
    "duplicate_enum_dependencies": 0,
    "unknown_default_semantics": 0,
    "invalid_fk_chronology": 0,
    "missing_fk_authority": 0,
    "missing_unique_authority": 0,
    "unknown_named_types": 0,
    "invalid_repair_slots": 0,
}


def bump(key: str, msg: str, errors: list[str]) -> None:
    COUNTS[key] += 1
    errors.append(msg)


def validate_matrix(matrix: dict, errors: list[str]) -> None:
    deps = matrix["dependencies"]
    totals = matrix["classification_totals"]
    counts = Counter(d["classification"] for d in deps)
    if totals["TOTAL"] != len(deps):
        errors.append("matrix TOTAL mismatch")
    if totals["UNRESOLVED"] != 0:
        errors.append(f"UNRESOLVED={totals['UNRESOLVED']}")
    for k in ["VALID", "INTENTIONAL", "MISSING_HISTORY", "ORDERING_DEFECT", "CONDITIONAL_SAFE", "FALSE_POSITIVE", "UNRESOLVED"]:
        if totals[k] != counts.get(k, 0):
            errors.append(f"{k} counter mismatch")
    for dep in deps:
        if dep["required_object_type"] == "column" and dep.get("required_property"):
            creator = dep.get("first_creator_migration")
            table = dep["required_object"]
            col = dep["required_property"]
            if (
                dep["classification"] == "VALID"
                and creator
                and dep.get("creator_statement_order") is None
                and dep["operation"] in {"ALTER TABLE ALTER COLUMN", "CREATE INDEX column", "ALTER TABLE DROP COLUMN"}
            ):
                table_creator = next(
                    (
                        d["first_creator_migration"]
                        for d in deps
                        if d["required_object"] == table
                        and d["required_object_type"] == "table"
                        and d["classification"] == "VALID"
                        and d["operation"] == "ALTER TABLE ADD COLUMN"
                    ),
                    None,
                )
                if table_creator and creator == table_creator and col not in {"id"}:
                    bump(
                        "invalid_column_dependencies",
                        f"column {table}.{col} classified VALID with only table-level creator",
                        errors,
                    )


def validate_contracts(contracts_doc: dict, errors: list[str]) -> None:
    for c in contracts_doc["contracts"]:
        obj = c["object"]
        model = c.get("historical_prisma_model")
        if model in NAV_FIELDS:
            cols = {x["column"] for x in c.get("columns", [])} | {x.get("prisma_field") for x in c.get("columns", [])}
            for nav in NAV_FIELDS[model]:
                if nav in cols:
                    bump("invalid_column_dependencies", f"{obj}: nav column {nav}", errors)

        enum_keys = [(d.get("schema", "public"), d["name"]) for d in c.get("enum_dependencies", [])]
        if len(enum_keys) != len(set(enum_keys)):
            bump("duplicate_enum_dependencies", f"{obj}: duplicate enum deps", errors)

        for col in c.get("columns", []):
            pg = col.get("postgres_type", "")
            if PRISMA_TYPE_RE.match(pg):
                bump("unknown_named_types", f"{obj}.{col['column']}: bad postgres_type {pg}", errors)
            sem = col.get("default_semantics")
            if col.get("prisma_default") is not None or sem:
                if sem not in ALLOWED_SEMANTICS:
                    bump("unknown_default_semantics", f"{obj}.{col['column']}: {sem}", errors)
            if col.get("prisma_default") and TRUNC_DEFAULT_RE.match(str(col["prisma_default"])):
                bump("unknown_default_semantics", f"{obj}.{col['column']}: truncated default", errors)

            if pg.startswith('"') and pg.endswith('"'):
                en = pg.strip('"')
                if not any(d["name"] == en for d in c.get("enum_dependencies", [])):
                    bump("unknown_named_types", f"{obj}.{col['column']}: unresolved type {en}", errors)

        col_names = {col["column"] for col in c.get("columns", [])}
        for fk in c.get("foreign_keys", []):
            for lc in fk["local_columns"]:
                if lc not in col_names:
                    bump("missing_fk_authority", f"{obj}: FK local column {lc} missing", errors)
            if not fk.get("on_delete") or not fk.get("on_update"):
                bump("missing_fk_authority", f"{obj}: FK missing onDelete/onUpdate", errors)
            if "chronology" not in fk:
                bump("missing_fk_authority", f"{obj}: FK missing chronology", errors)
            chron = fk.get("chronology", "")
            ref = fk["referenced_relation"]
            slot = c.get("repair_slot", OBJECT_SLOT.get(obj, 0))
            if chron == "REQUIRED_AT_TABLE_CREATE" and not object_available_at_slot(ref, slot):
                bump("invalid_fk_chronology", f"{obj}: FK to {ref} required at create but unavailable at slot {slot}", errors)
            if chron.startswith("CAN_BE_DEFERRED") and fk.get("required_before_first_consumer"):
                bump("invalid_fk_chronology", f"{obj}: deferred FK marked required_before_first_consumer", errors)

        if obj == "org_invoices":
            if not any("invoice_number" in u.get("columns", []) for u in c.get("unique_constraints", [])):
                bump("missing_unique_authority", "org_invoices missing invoice_number unique", errors)
            inv_col = next((x for x in c.get("columns", []) if x["column"] == "invoice_number"), None)
            if inv_col and inv_col.get("default_semantics") != "IDENTITY_OR_SEQUENCE_GENERATED":
                bump("unknown_default_semantics", "org_invoices invoice_number generation", errors)

        if obj == "org_tasks":
            inv_fk = next((f for f in c.get("foreign_keys", []) if f["referenced_relation"] == "org_invoices"), None)
            if inv_fk and inv_fk.get("chronology") != "CAN_BE_DEFERRED_TO_LATER_HISTORICAL_MIGRATION":
                bump("invalid_fk_chronology", "org_tasks invoice FK must be deferred", errors)
            if inv_fk and inv_fk.get("required_before_first_consumer"):
                bump("invalid_fk_chronology", "org_tasks invoice FK must not be required before first consumer", errors)


def validate_topology(topology_doc: dict, contracts_doc: dict, errors: list[str]) -> None:
    by_obj = {c["object"]: c for c in contracts_doc["contracts"]}
    available: set[str] = {"vehicles", "users", "organizations", "vehicle_service_events"}
    for slot in topology_doc["slots"]:
        slot_no = slot["slot"]
        seen_types: set[str] = set()
        for act in slot["actions"]:
            if act["action"] == "CREATE TYPE":
                if act["object"] in seen_types:
                    bump("invalid_repair_slots", f"slot {slot_no}: duplicate CREATE TYPE {act['object']}", errors)
                seen_types.add(act["object"])
            if act["action"] == "CREATE TABLE":
                obj = act["object"]
                contract = by_obj.get(obj)
                if not contract:
                    continue
                for dep in contract.get("create_time_prerequisites", []):
                    if dep not in available and act["order"] > 1:
                        prior = [a for a in slot["actions"] if a["object"] == dep and a["order"] < act["order"]]
                        if not prior:
                            bump(
                                "invalid_repair_slots",
                                f"slot {slot_no}: {obj} create before prerequisite {dep}",
                                errors,
                            )
            if act["action"] == "ADD CONSTRAINT" and act.get("fk"):
                fk = act["fk"]
                if fk.get("chronology") == "REQUIRED_AT_TABLE_CREATE":
                    ref = fk["referenced_relation"]
                    if ref not in available:
                        bump(
                            "invalid_fk_chronology",
                            f"slot {slot_no}: immediate FK to unavailable {ref}",
                            errors,
                        )
        for act in slot["actions"]:
            if act["action"] == "CREATE TYPE":
                available.add(act["object"])
            if act["action"] == "CREATE TABLE":
                available.add(act["object"])
            if act["action"] == "CREATE SEQUENCE":
                available.add(act["object"])
        if not slot.get("closure_validated"):
            bump("invalid_repair_slots", f"slot {slot_no} not closure_validated", errors)


def main() -> int:
    matrix = json.loads(MATRIX.read_text())
    contracts = json.loads(CONTRACTS.read_text())
    closure = json.loads(CLOSURE.read_text())
    topology = json.loads(TOPOLOGY.read_text())
    errors: list[str] = []

    validate_matrix(matrix, errors)
    validate_contracts(contracts, errors)
    validate_topology(topology, contracts, errors)

    if errors:
        print("VALIDATION FAILURES:")
        for e in errors:
            print(f"- {e}")
        print("COUNTS:", json.dumps(COUNTS, indent=2))
        return 1

    print("PASS: CI-R3B1A.3 authority validated")
    print(json.dumps(matrix["classification_totals"], indent=2))
    print("COUNTS:", json.dumps(COUNTS, indent=2))
    print("primary:", closure["primary_historical_defects"])
    print("closure:", closure["required_repair_closure_objects"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
