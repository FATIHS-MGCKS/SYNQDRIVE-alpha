"""CI-R3B1A.3.2 vehicle_document_extractions / document-extraction FK authority."""
from __future__ import annotations

from typing import Any

VEHICLE_DOCUMENT_EXTRACTIONS_SPEC: dict[str, Any] = {
    "classification": "MISSING_HISTORY",
    "before": "20260613000000_document_extraction_pipeline",
    "commit": "77c26dad",
    "model": "VehicleDocumentExtraction",
    "enums": ["DocumentExtractionType", "DocumentExtractionStatus"],
    "not_yet": [],
    "repair_after": "20260413183000_brake_health_canonical_refactor",
    "repair_before": "20260413220000_battery_evidence_unique_dedup",
    "share_bootstrap_with": ["battery_evidence"],
}

HISTORICAL_EVIDENCE: dict[str, Any] = {
    "vehicle_document_extractions_first_model_commit": "77c26dad",
    "battery_evidence_document_extraction_relation_first_commit": "17019787",
    "historical_relation_mode": "foreignKeys",
    "historical_relation_mode_evidence": (
        "datasource db at 17019787 has provider=postgresql only; no relationMode=prisma"
    ),
    "physical_fk_expected": True,
    "physical_fk_expected_reason": (
        "BatteryEvidence.documentExtraction @relation(fields/references) under default foreignKeys mode"
    ),
    "historical_create_table_found": False,
    "historical_create_table_search": 'grep CREATE TABLE "vehicle_document_extractions" backend/prisma/migrations => 0',
    "first_sql_table_consumer": "20260613000000_document_extraction_pipeline",
    "first_sql_table_consumer_operation": 'ALTER TABLE "vehicle_document_extractions" ADD COLUMN',
    "first_sql_fk_consumer": "20260613234500_brake_evidence_model",
    "first_sql_fk_consumer_operation": "brake_evidence_document_extraction_id_fkey",
    "battery_evidence_fk_sql_found": False,
    "battery_evidence_fk_sql_search": (
        "grep battery_evidence_document_extraction_id_fkey backend/prisma/migrations => 0"
    ),
    "referenced_table_classification": "MISSING_HISTORY",
    "physical_fk_classification": "DEFERRED_PHYSICAL_FK",
}

DOCUMENT_EXTRACTION_FK_KEY = (
    "battery_evidence",
    ("document_extraction_id",),
    "vehicle_document_extractions",
)


def vehicle_document_extractions_contract(
    schema: str,
    parsed_enums: dict[str, list[str]],
    model_contract: dict[str, Any],
) -> dict[str, Any]:
    spec = VEHICLE_DOCUMENT_EXTRACTIONS_SPEC
    enum_deps = []
    for en in spec["enums"]:
        enum_deps.append(
            {
                "schema": "public",
                "name": en,
                "labels": parsed_enums.get(en, []),
                "order_material": True,
                "first_consumer": spec["before"],
                "creator": None,
                "classification": "MISSING_HISTORY",
                "evidence": [f"schema:{spec['commit']}:enum {en}"],
            }
        )
    enum_deps.extend(model_contract["enum_dependencies"])
    from repair_closure import apply_fk_chronology, dedupe_enum_dependencies, enrich_column_defaults  # noqa: WPS433

    table = model_contract["table"]
    columns = [enrich_column_defaults(table, col) for col in model_contract["columns"]]
    foreign_keys = [apply_fk_chronology(table, fk) for fk in model_contract["foreign_keys"]]
    enum_deps = dedupe_enum_dependencies(enum_deps)
    return {
        "object": table,
        "object_type": "table",
        "classification": spec["classification"],
        "required_before_migration": spec["before"],
        "historical_authority_commit": spec["commit"],
        "historical_prisma_model": spec["model"],
        "first_consumer": spec["before"],
        "first_battery_evidence_fk_consumer": "20260413220000_battery_evidence_unique_dedup",
        "repair_slot": 3,
        "relation": {"schema": "public", "name": table},
        "columns": columns,
        "primary_key": model_contract["primary_key"],
        "foreign_keys": foreign_keys,
        "unique_constraints": model_contract["unique_constraints"],
        "check_constraints": [],
        "required_preexisting_indexes": model_contract["required_preexisting_indexes"],
        "enum_dependencies": enum_deps,
        "create_time_prerequisites": [d["name"] for d in enum_deps],
        "required_before_first_consumer": [],
        "deferred_constraints": [],
        "not_present_yet": spec["not_yet"],
        "repair_insertion": {
            "after": spec["repair_after"],
            "before": spec["repair_before"],
            "can_share_bootstrap_with": spec["share_bootstrap_with"],
            "creator_migration": None,
        },
        "evidence": [
            f"schema:{spec['commit']}:model {spec['model']}",
            HISTORICAL_EVIDENCE["historical_create_table_search"],
            f"first_sql_table_consumer={spec['before']}",
            "battery_evidence FK requires referenced table before slot 3 FK action",
        ],
        "historical_evidence": HISTORICAL_EVIDENCE,
    }
