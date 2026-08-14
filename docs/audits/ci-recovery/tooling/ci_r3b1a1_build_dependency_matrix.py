#!/usr/bin/env python3
"""Build full CI-R3B1A.1 migration dependency matrix (static audit)."""
from __future__ import annotations

import json
import re
import subprocess
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

REPO = Path(__file__).resolve().parents[4]
MIG_DIR = REPO / "backend/prisma/migrations"
OUT_MATRIX = (
    REPO
    / "docs/audits/ci-recovery/data/ci-r3b1a1-full-migration-dependency-matrix-2026-08.json"
)
OUT_CONTRACTS = (
    REPO
    / "docs/audits/ci-recovery/data/ci-r3b1a1-predecessor-ddl-contracts-2026-08.json"
)

FIRST_MIG = "20260311224040_init"
LAST_MIG = "20260425000000_retire_user_assignment_and_speeding_severity"
R3B_BOOTSTRAP = "20260325161141_ci_r3b_bootstrap_trip_schema_baseline"
R3B_PRE_SHIM = "20260424235959_ci_r3b_trip_casing_pre_shim"
TARGET_MIG = LAST_MIG
INTENTIONAL_PASCAL = {"VehicleTrip", "TripDrivingImpact"}

ALL_MIGS = sorted(p.name for p in MIG_DIR.iterdir() if p.is_dir())
SCOPE = ALL_MIGS[: ALL_MIGS.index(LAST_MIG) + 1]
SCOPE_ORD = {m: i + 1 for i, m in enumerate(SCOPE)}


def mig_order(name: str | None) -> int | None:
    if name is None:
        return None
    if name in SCOPE_ORD:
        return SCOPE_ORD[name]
    if name in ALL_MIGS:
        return ALL_MIGS.index(name) + 1
    return None


@dataclass
class Registry:
    tables: dict[str, str] = field(default_factory=dict)  # name -> creator mig
    types: dict[str, str] = field(default_factory=dict)
    columns: dict[str, dict[str, str]] = field(default_factory=lambda: defaultdict(dict))
    creates_in_mig: dict[str, set[str]] = field(default_factory=lambda: defaultdict(set))

    def note_table(self, table: str, mig: str, via: str) -> None:
        if table not in self.tables:
            self.tables[table] = mig
        self.columns.setdefault(table, {})
        self.creates_in_mig[mig].add(table)

    def note_column(self, table: str, column: str, mig: str) -> None:
        self.columns.setdefault(table, {})
        if column not in self.columns[table]:
            self.columns[table][column] = mig

    def note_type(self, typ: str, mig: str) -> None:
        if typ not in self.types:
            self.types[typ] = mig


REG = Registry()
RECORDS: list[dict[str, Any]] = []
SEQ = 0


def first_creator_table(name: str) -> str | None:
    for mig in ALL_MIGS:
        sql = (MIG_DIR / mig / "migration.sql").read_text()
        if re.search(
            rf'CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"{re.escape(name)}"',
            sql,
            re.I,
        ) or re.search(
            rf"CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?{re.escape(name)}\b",
            sql,
            re.I,
        ):
            return mig
    return None


def resolve_table_creator(table: str) -> str | None:
    creator = first_creator_table(table)
    if creator:
        return creator
    return REG.tables.get(table)


def first_creator_type(name: str) -> str | None:
    for mig in ALL_MIGS:
        sql = (MIG_DIR / mig / "migration.sql").read_text()
        if re.search(
            rf'CREATE\s+TYPE\s+"{re.escape(name)}"', sql, re.I
        ) or re.search(rf"CREATE\s+TYPE\s+{re.escape(name)}\b", sql, re.I):
            return mig
    return None


def resolve_type_creator(typ: str) -> str | None:
    creator = first_creator_type(typ)
    if creator:
        return creator
    return REG.types.get(typ)


def line_evidence(mig: str, needle: str) -> str:
    path = MIG_DIR / mig / "migration.sql"
    for i, line in enumerate(path.read_text().splitlines(), 1):
        if needle.lower() in line.lower():
            return f"{path.relative_to(REPO)}:{i}"
    return f"{path.relative_to(REPO)}:1"


def add_record(
    mig: str,
    operation: str,
    obj: str,
    obj_type: str,
    prop: str | None,
    creator: str | None,
    guarded: bool,
    guard_safe: bool | None,
    notes: str = "",
    evidence_needle: str | None = None,
) -> None:
    global SEQ
    SEQ += 1
    consumer_ord = mig_order(mig) or 0
    creator_ord = mig_order(creator) if creator else None

    if creator is None:
        creator_relation = "none"
    elif creator == R3B_BOOTSTRAP and mig != R3B_BOOTSTRAP:
        creator_relation = "bootstrap"
    elif creator_ord is not None and consumer_ord and creator_ord < consumer_ord:
        creator_relation = "earlier"
    elif creator_ord is not None and consumer_ord and creator_ord > consumer_ord:
        creator_relation = "later"
    elif creator == mig:
        creator_relation = "earlier"  # same migration, processed after create
    else:
        creator_relation = "not_applicable"

    # classification
    if obj in INTENTIONAL_PASCAL and mig == TARGET_MIG and obj_type == "table":
        cls = "INTENTIONAL"
    elif creator == R3B_BOOTSTRAP and mig != R3B_BOOTSTRAP and obj_type in {
        "table",
        "enum",
    }:
        cls = "INTENTIONAL"
    elif creator_relation == "bootstrap":
        cls = "INTENTIONAL"
    elif creator_relation == "earlier" or (creator == mig):
        cls = "VALID"
    elif creator_relation == "later":
        cls = "ORDERING_DEFECT"
    elif creator_relation == "none":
        cls = "MISSING_HISTORY"
    elif guard_safe:
        cls = "CONDITIONAL_SAFE"
    else:
        cls = "UNRESOLVED"

    if cls == "UNRESOLVED" and guarded and creator_relation == "none":
        cls = "MISSING_HISTORY"

    RECORDS.append(
        {
            "id": f"{consumer_ord:03d}-{SEQ:05d}",
            "migration": mig,
            "migration_order": consumer_ord,
            "operation": operation,
            "required_object": obj,
            "required_object_type": obj_type,
            "required_property": prop,
            "required_schema": "public",
            "first_creator_migration": creator,
            "creator_order": creator_ord,
            "creator_relation": creator_relation,
            "guarded": guarded,
            "guard_semantically_safe": guard_safe,
            "classification": cls,
            "evidence": [line_evidence(mig, evidence_needle or obj)],
            "notes": notes,
        }
    )


def parse_creates(mig: str, sql: str) -> None:
    for m in re.finditer(
        r'CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"([^"]+)"\s*\((.*?)\);',
        sql,
        re.I | re.S,
    ):
        table = m.group(1)
        REG.note_table(table, mig, "create")
        body = m.group(2)
        for col_m in re.finditer(r'"([^"]+)"\s+[^,\n]+', body):
            REG.note_column(table, col_m.group(1), mig)
        for enum_col in re.finditer(r'"([^"]+)"\s+"([^"]+)"', body):
            REG.note_column(table, enum_col.group(1), mig)
            REG.note_type(enum_col.group(2), mig)

    for m in re.finditer(
        r"CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_][a-z0-9_]*)\s*\((.*?)\);",
        sql,
        re.I | re.S,
    ):
        table = m.group(1)
        if table not in REG.tables:
            REG.note_table(table, mig, "create")
        body = m.group(2)
        for col_m in re.finditer(r"([a-z_][a-z0-9_]*)\s+", body):
            REG.note_column(table, col_m.group(1), mig)

    for m in re.finditer(r'CREATE\s+TYPE\s+"([^"]+)"', sql, re.I):
        REG.note_type(m.group(1), mig)
    for m in re.finditer(r"CREATE\s+TYPE\s+([A-Za-z_][A-Za-z0-9_]*)\s+AS\s+ENUM", sql, re.I):
        REG.note_type(m.group(1), mig)

    for m in re.finditer(
        r'ALTER\s+TABLE\s+(?:"([^"]+)"|([a-z_][a-z0-9_]*))\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([a-z_][a-z0-9_]*)"?',
        sql,
        re.I,
    ):
        table = m.group(1) or m.group(2)
        col = m.group(3)
        if table in REG.tables:
            REG.note_column(table, col, mig)


def scan_dependencies(mig: str, sql: str) -> None:
    guarded_blocks = "DO $$" in sql or "IF NOT EXISTS" in sql.upper()

    # table ops
    for m in re.finditer(
        r'ALTER\s+TABLE\s+(?:"([^"]+)"|([a-z_][a-z0-9_]*))\s+ALTER\s+COLUMN\s+"?([a-z_][a-z0-9_]*)"?',
        sql,
        re.I,
    ):
        table, col = (m.group(1) or m.group(2)), m.group(3)
        add_record(
            mig,
            "ALTER TABLE ALTER COLUMN",
            table,
            "column",
            col,
            REG.columns.get(table, {}).get(col) or resolve_table_creator(table),
            guarded_blocks,
            None,
            evidence_needle="ALTER COLUMN",
        )

    for m in re.finditer(
        r'ALTER\s+TABLE\s+(?:"([^"]+)"|([a-z_][a-z0-9_]*))\s+ADD\s+COLUMN',
        sql,
        re.I,
    ):
        table = m.group(1) or m.group(2)
        add_record(
            mig,
            "ALTER TABLE ADD COLUMN",
            table,
            "table",
            None,
            resolve_table_creator(table),
            "IF NOT EXISTS" in m.group(0).upper(),
            None,
            evidence_needle="ADD COLUMN",
        )

    for m in re.finditer(
        r'ALTER\s+TABLE\s+(?:"([^"]+)"|([a-z_][a-z0-9_]*))\s+DROP\s+COLUMN\s+"?([a-z_][a-z0-9_]*)"?',
        sql,
        re.I,
    ):
        table, col = (m.group(1) or m.group(2)), m.group(3)
        add_record(
            mig,
            "ALTER TABLE DROP COLUMN",
            table,
            "column",
            col,
            REG.columns.get(table, {}).get(col) or resolve_table_creator(table),
            guarded_blocks,
            None,
        )

    for m in re.finditer(
        r'ALTER\s+TABLE\s+(?:"([^"]+)"|([a-z_][a-z0-9_]*))\s+RENAME\s+TO',
        sql,
        re.I,
    ):
        table = m.group(1) or m.group(2)
        add_record(
            mig,
            "ALTER TABLE RENAME",
            table,
            "table",
            None,
            resolve_table_creator(table),
            False,
            None,
        )

    for m in re.finditer(
        r'CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?[^\n]*?\s+ON\s+"([^"]+)"\s*\(([^)]+)\)',
        sql,
        re.I,
    ):
        table, cols = m.group(1), m.group(2)
        add_record(
            mig,
            "CREATE INDEX",
            table,
            "table",
            None,
            resolve_table_creator(table),
            "IF NOT EXISTS" in m.group(0).upper(),
            None,
            notes=f"indexed: {cols.strip()}",
        )
        for col in re.findall(r'"([^"]+)"', cols):
            add_record(
                mig,
                "CREATE INDEX column",
                table,
                "column",
                col,
                REG.columns.get(table, {}).get(col) or resolve_table_creator(table),
                "IF NOT EXISTS" in m.group(0).upper(),
                None,
            )

    for m in re.finditer(r'DELETE\s+FROM\s+"([^"]+)"', sql, re.I):
        table = m.group(1)
        add_record(
            mig,
            "DELETE FROM",
            table,
            "table",
            None,
            resolve_table_creator(table),
            False,
            None,
        )

    for m in re.finditer(r'UPDATE\s+"([^"]+)"', sql, re.I):
        table = m.group(1)
        add_record(
            mig,
            "UPDATE",
            table,
            "table",
            None,
            REG.tables.get(table) or resolve_table_creator(table),
            False,
            None,
        )

    for m in re.finditer(r'ALTER\s+TYPE\s+"([^"]+)"', sql, re.I):
        typ = m.group(1)
        add_record(
            mig,
            "ALTER TYPE",
            typ,
            "enum",
            None,
            REG.types.get(typ) or resolve_type_creator(typ),
            False,
            None,
        )

    for m in re.finditer(r'REFERENCES\s+"([^"]+)"\s*\(', sql, re.I):
        ref = m.group(1)
        add_record(
            mig,
            "REFERENCES",
            ref,
            "table",
            None,
            REG.tables.get(ref) or resolve_table_creator(ref),
            guarded_blocks,
            None,
        )

    # generic ALTER TABLE catch-all for remaining
    for m in re.finditer(
        r'ALTER\s+TABLE\s+(?:"([^"]+)"|([a-z_][a-z0-9_]*))',
        sql,
        re.I,
    ):
        table = m.group(1) or m.group(2)
        if table == "_prisma_migrations":
            continue
        snippet = m.group(0).upper()
        if any(
            x in snippet
            for x in [" ADD COLUMN", " DROP COLUMN", " ALTER COLUMN", " RENAME "]
        ):
            continue
        add_record(
            mig,
            "ALTER TABLE",
            table,
            "table",
            None,
            REG.tables.get(table) or resolve_table_creator(table),
            guarded_blocks,
            None,
        )


def build_matrix() -> dict[str, Any]:
    global SEQ
    SEQ = 0
    RECORDS.clear()
    REG.tables.clear()
    REG.types.clear()
    REG.columns.clear()
    REG.creates_in_mig.clear()

    for mig in SCOPE:
        sql = (MIG_DIR / mig / "migration.sql").read_text()
        parse_creates(mig, sql)

    for mig in SCOPE:
        sql = (MIG_DIR / mig / "migration.sql").read_text()
        scan_dependencies(mig, sql)

    counts = Counter(r["classification"] for r in RECORDS)
    total = len(RECORDS)
    assert sum(counts.values()) == total

    return {
        "schema_version": 1,
        "audit_scope": {
            "first_migration": FIRST_MIG,
            "last_migration": LAST_MIG,
            "migrations_scanned": len(SCOPE),
            "dependency_checks_generated": total,
            "scope_migrations": SCOPE,
        },
        "classification_totals": {
            "TOTAL": total,
            "VALID": counts.get("VALID", 0),
            "INTENTIONAL": counts.get("INTENTIONAL", 0),
            "MISSING_HISTORY": counts.get("MISSING_HISTORY", 0),
            "ORDERING_DEFECT": counts.get("ORDERING_DEFECT", 0),
            "CONDITIONAL_SAFE": counts.get("CONDITIONAL_SAFE", 0),
            "FALSE_POSITIVE": counts.get("FALSE_POSITIVE", 0),
            "UNRESOLVED": counts.get("UNRESOLVED", 0),
        },
        "dependencies": RECORDS,
    }


def unique_defect_objects(matrix: dict[str, Any]) -> list[dict[str, Any]]:
    by_obj: dict[str, dict[str, Any]] = {}
    for r in matrix["dependencies"]:
        if r["classification"] not in {"MISSING_HISTORY", "ORDERING_DEFECT"}:
            continue
        if r["required_object_type"] not in {"table", "enum", "column"}:
            continue
        if r["required_object_type"] == "column" and r["operation"] != "CREATE INDEX column":
            # column-level defects are covered via table/enum object entries
            continue
        obj = r["required_object"]
        ord_ = r["migration_order"] or 9999
        prev = by_obj.get(obj)
        if prev is None or ord_ < prev["first_consumer_order"]:
            by_obj[obj] = {
                "object": obj,
                "object_type": r["required_object_type"],
                "classification": r["classification"],
                "first_consumer_migration": r["migration"],
                "first_consumer_order": ord_,
                "creator_migration": r["first_creator_migration"],
                "creator_order": r["creator_order"],
            }
    return sorted(by_obj.values(), key=lambda x: x["first_consumer_order"])


def git_show_file(rev: str, path: str) -> str:
    return subprocess.check_output(
        ["git", "-C", str(REPO), "show", f"{rev}:{path}"], text=True
    )


def prisma_col(col_line: str) -> dict[str, Any]:
    name_m = re.search(r'@map\("([^"]+)"\)', col_line)
    col = name_m.group(1) if name_m else re.match(r"(\w+)", col_line.strip()).group(1)
    nullable = "?" in col_line.split("//")[0]
    default = None
    dm = re.search(r'@default\(([^)]+)\)', col_line)
    if dm:
        default = dm.group(1)
    type_m = re.search(r"\s(\S+)\??\s", col_line)
    ptype = type_m.group(1) if type_m else "text"
    pg = {
        "String": "text",
        "Int": "integer",
        "Float": "double precision",
        "Boolean": "boolean",
        "DateTime": "timestamp(3) without time zone",
        "Json": "jsonb",
    }.get(ptype, ptype)
    if ptype[0].isupper() and ptype not in pg:
        pg = f'"{ptype}"'
    return {
        "name": col,
        "postgresql_type": pg,
        "nullable": nullable,
        "default": default,
    }


def extract_model(schema: str, model: str) -> dict[str, Any]:
    m = re.search(rf"model {model}\s*\{{(.*?)\n\}}", schema, re.S)
    if not m:
        raise KeyError(model)
    body = m.group(1)
    map_m = re.search(r'@@map\("([^"]+)"\)', body)
    table = map_m.group(1) if map_m else model
    cols = []
    pk_cols = []
    indexes: list[dict[str, Any]] = []
    for raw in body.splitlines():
        line = raw.strip()
        if not line or line.startswith("//"):
            continue
        if line.startswith("@@index"):
            idx_m = re.search(r"@@index\(\[([^\]]+)\]", line)
            if idx_m:
                cols_raw = [c.strip() for c in idx_m.group(1).split(",")]
                mapped = []
                for c in cols_raw:
                    for col in cols:
                        if col.get("_prisma") == c:
                            mapped.append(col["name"])
                    if not mapped or mapped[-1] != c:
                        mapped.append(re.sub(r"([A-Z])", r"_\1", c).lower().lstrip("_"))
                indexes.append({"columns": mapped, "source": line})
            continue
        if line.startswith("@@"):
            continue
        if re.match(r"\w+\s+\w+", line):
            col = prisma_col(line)
            col["_prisma"] = line.split()[0]
            if "@id" in line:
                pk_cols.append(col["name"])
            cols.append({k: v for k, v in col.items() if k != "_prisma"})
    return {
        "table": table,
        "columns": cols,
        "primary_key_columns": pk_cols,
        "indexes": indexes,
    }


def extract_enum(schema: str, enum: str) -> dict[str, Any]:
    m = re.search(rf"enum {enum}\s*\{{(.*?)\}}", schema, re.S)
    labels = [ln.strip() for ln in m.group(1).splitlines() if ln.strip() and not ln.strip().startswith("//")]
    return {"name": enum, "labels": labels}


def build_contracts(defects: list[dict[str, Any]]) -> dict[str, Any]:
    schema_init = git_show_file("77c26dad", "backend/prisma/schema.prisma")
    schema_sync = git_show_file("17019787", "backend/prisma/schema.prisma")
    contracts = []

    specs = {
        "org_tasks": {
            "classification": "MISSING_HISTORY",
            "before": "20260412030000_platform_hardening_phase1",
            "commit": "77c26dad",
            "model": "OrgTask",
            "enums": ["TaskStatus", "TaskPriority"],
            "not_yet": [
                {
                    "kind": "column",
                    "name": "created_by_user_id",
                    "introduced_by": "20260412030000_platform_hardening_phase1",
                },
                {
                    "kind": "column",
                    "name": "updated_by_user_id",
                    "introduced_by": "20260412030000_platform_hardening_phase1",
                },
                {
                    "kind": "index",
                    "name": "org_tasks_created_by_user_id_idx",
                    "introduced_by": "20260412030000_platform_hardening_phase1",
                },
            ],
            "repair_after": "20260412020000_hm_latest_state_tables",
            "repair_before": "20260412030000_platform_hardening_phase1",
        },
        "brake_health_current": {
            "classification": "MISSING_HISTORY",
            "before": "20260413183000_brake_health_canonical_refactor",
            "commit": "77c26dad",
            "model": "BrakeHealthCurrent",
            "enums": [],
            "not_yet": [
                {
                    "kind": "column",
                    "name": "state_class",
                    "introduced_by": "20260413183000_brake_health_canonical_refactor",
                },
                {
                    "kind": "column",
                    "name": "anchor_validation_status",
                    "introduced_by": "20260413183000_brake_health_canonical_refactor",
                },
                {
                    "kind": "column",
                    "name": "model_coverage_ratio",
                    "introduced_by": "20260413183000_brake_health_canonical_refactor",
                },
                {
                    "kind": "column",
                    "name": "modeled_distance_km",
                    "introduced_by": "20260413183000_brake_health_canonical_refactor",
                },
                {
                    "kind": "column",
                    "name": "modeled_trip_count",
                    "introduced_by": "20260413183000_brake_health_canonical_refactor",
                },
                {
                    "kind": "column",
                    "name": "modeling_source",
                    "introduced_by": "20260413183000_brake_health_canonical_refactor",
                },
                {
                    "kind": "column",
                    "name": "baseline_warnings",
                    "introduced_by": "20260413183000_brake_health_canonical_refactor",
                },
            ],
            "repair_after": "20260412040000_audit_consent_provenance",
            "repair_before": "20260413183000_brake_health_canonical_refactor",
        },
        "battery_evidence": {
            "classification": "ORDERING_DEFECT",
            "before": "20260413220000_battery_evidence_unique_dedup",
            "commit": "17019787",
            "model": "BatteryEvidence",
            "enums": [
                "BatteryEvidenceScope",
                "BatteryEvidenceSourceType",
                "BatteryEvidenceValueType",
            ],
            "not_yet": [
                {
                    "kind": "index",
                    "name": "battery_evidence_dedup_key",
                    "introduced_by": "20260413220000_battery_evidence_unique_dedup",
                }
            ],
            "repair_after": "20260413183000_brake_health_canonical_refactor",
            "repair_before": "20260413220000_battery_evidence_unique_dedup",
            "creator_migration": "20260614120300_battery_health_tables_guard",
        },
        "org_invoices": {
            "classification": "MISSING_HISTORY",
            "before": "20260413230000_add_composite_indexes_batch_c",
            "commit": "77c26dad",
            "model": "OrgInvoice",
            "enums": ["OrgInvoiceType", "OrgInvoiceStatus"],
            "not_yet": [
                {
                    "kind": "index",
                    "name": "org_invoices_organization_id_due_date_idx",
                    "introduced_by": "20260413230000_add_composite_indexes_batch_c",
                }
            ],
            "repair_after": "20260413220000_battery_evidence_unique_dedup",
            "repair_before": "20260413230000_add_composite_indexes_batch_c",
        },
        "vehicle_dtc_events": {
            "classification": "MISSING_HISTORY",
            "before": "20260413230000_add_composite_indexes_batch_c",
            "commit": "77c26dad",
            "model": "VehicleDtcEvent",
            "enums": ["DtcSeverity"],
            "not_yet": [
                {
                    "kind": "index",
                    "name": "vehicle_dtc_events_vehicle_id_last_seen_at_idx",
                    "introduced_by": "20260413230000_add_composite_indexes_batch_c",
                },
                {
                    "kind": "index",
                    "name": "vehicle_dtc_events_vehicle_id_is_active_idx",
                    "introduced_by": "20260413230000_add_composite_indexes_batch_c",
                },
            ],
            "repair_after": "20260413220000_battery_evidence_unique_dedup",
            "repair_before": "20260413230000_add_composite_indexes_batch_c",
            "share_bootstrap_with": ["org_invoices"],
        },
        "vehicle_driving_impact_current": {
            "classification": "MISSING_HISTORY",
            "before": "20260422010000_vehicle_current_safety_score",
            "commit": "77c26dad",
            "model": "VehicleDrivingImpactCurrent",
            "enums": [],
            "not_yet": [
                {
                    "kind": "column",
                    "name": "safety_score",
                    "introduced_by": "20260422010000_vehicle_current_safety_score",
                }
            ],
            "repair_after": "20260421120000_add_pickup_overdue_insight_type",
            "repair_before": "20260422010000_vehicle_current_safety_score",
        },
        "InsightType": {
            "classification": "MISSING_HISTORY",
            "before": "20260417180000_add_battery_critical_insight_type",
            "commit": "77c26dad",
            "model": None,
            "enum_only": "InsightType",
            "enums": ["InsightType"],
            "not_yet": [
                {
                    "kind": "enum_label",
                    "name": "BATTERY_CRITICAL",
                    "introduced_by": "20260417180000_add_battery_critical_insight_type",
                }
            ],
            "repair_after": "20260417160000_add_mqtt_only_hm_sync_status",
            "repair_before": "20260417180000_add_battery_critical_insight_type",
        },
    }

    for obj, spec in specs.items():
        schema = schema_sync if spec["commit"] == "17019787" else schema_init
        if spec.get("enum_only"):
            enums = [extract_enum(schema, spec["enum_only"])]
            contracts.append(
                {
                    "object": obj,
                    "classification": spec["classification"],
                    "required_before_migration": spec["before"],
                    "historical_authority_commit": spec["commit"],
                    "historical_prisma_model": None,
                    "relation": None,
                    "columns": [],
                    "primary_key": None,
                    "foreign_keys": [],
                    "unique_constraints": [],
                    "check_constraints": [],
                    "required_preexisting_indexes": [],
                    "enum_dependencies": enums,
                    "not_present_yet": spec["not_yet"],
                    "repair_insertion": {
                        "after": spec["repair_after"],
                        "before": spec["repair_before"],
                        "can_share_bootstrap_with": spec.get("share_bootstrap_with", []),
                        "creator_migration": spec.get("creator_migration"),
                    },
                }
            )
            continue
        model = extract_model(schema, spec["model"])
        enums = [extract_enum(schema, e) for e in spec["enums"]]
        pre_indexes = []
        for idx in model["indexes"]:
            pre_indexes.append(
                {
                    "columns": idx["columns"],
                    "source": idx["source"],
                    "note": "Prisma @@index at historical authority commit",
                }
            )
        contracts.append(
            {
                "object": obj,
                "classification": spec["classification"],
                "required_before_migration": spec["before"],
                "historical_authority_commit": spec["commit"],
                "historical_prisma_model": spec["model"],
                "relation": {"schema": "public", "name": model["table"]},
                "columns": model["columns"],
                "primary_key": {
                    "name": f"{model['table']}_pkey",
                    "columns": model["primary_key_columns"],
                },
                "foreign_keys": [],
                "unique_constraints": [],
                "check_constraints": [],
                "required_preexisting_indexes": pre_indexes,
                "enum_dependencies": enums,
                "not_present_yet": spec["not_yet"],
                "repair_insertion": {
                    "after": spec["repair_after"],
                    "before": spec["repair_before"],
                    "can_share_bootstrap_with": spec.get("share_bootstrap_with", []),
                    "creator_migration": spec.get("creator_migration"),
                },
            }
        )

    return {"schema_version": 1, "contracts": contracts}


def main() -> None:
    matrix = build_matrix()
    defects = unique_defect_objects(matrix)
    matrix["unique_genuine_defect_objects"] = defects
    contracts = build_contracts(defects)

    OUT_MATRIX.parent.mkdir(parents=True, exist_ok=True)
    OUT_MATRIX.write_text(json.dumps(matrix, indent=2) + "\n")
    OUT_CONTRACTS.write_text(json.dumps(contracts, indent=2) + "\n")

    totals = matrix["classification_totals"]
    print(json.dumps(totals, indent=2))
    print("defect objects:", [d["object"] for d in defects])
    assert totals["UNRESOLVED"] == 0
    assert sum(totals[k] for k in totals if k != "TOTAL") == totals["TOTAL"]


if __name__ == "__main__":
    main()
