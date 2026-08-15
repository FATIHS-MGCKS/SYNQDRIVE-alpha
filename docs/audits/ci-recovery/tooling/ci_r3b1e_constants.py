"""Shared constants for CI-R3B1E post-vendor repair implementation."""
from __future__ import annotations

from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
DATA = REPO / "docs/audits/ci-recovery/data"
MIG_ROOT = REPO / "backend/prisma/migrations"
BACKEND = REPO / "backend"

TOPOLOGY = DATA / "ci-r3b1d1-post-vendor-repair-topology-2026-08.json"
VENDOR_CONTRACTS = DATA / "ci-r3b1d-vendor-predecessor-ddl-contracts-2026-08.json"
REMAINING_CONTRACTS = DATA / "ci-r3b1d-remaining-predecessor-ddl-contracts-2026-08.json"
CLOSURE = DATA / "ci-r3b1d-post-vendor-repair-closure-2026-08.json"
GRAPH = DATA / "ci-r3b1d1-repair-action-graph-2026-08.json"
DDL_PROOF = DATA / "ci-r3b1d11-executable-ddl-proof-2026-08.json"
CATALOG_PARITY = DATA / "ci-r3b1d12-postgresql-catalog-parity-2026-08.json"
AUTHORITY_REF = DATA / "ci-r3b1d12-authority-reference-2026-08.json"
COMPILER = REPO / "docs/audits/ci-recovery/tooling/ci_r3b1b_sql_literal_compiler.py"

BASE_R3B1D12_SHA = "3fcac840f66613928e9ccbebd30786bf83b28b04"
TARGET_SHA = "1c18164be77dead4db2ff500123754e8c924c9094bc09c41f2408dbcd56a4974"
TARGET_MIGRATION = "20260425000000_retire_user_assignment_and_speeding_severity"

R3B1B_REPAIR_MIGRATIONS = [
    "20260412025000_ci_r3b_historical_predecessor_slot1",
    "20260412610000_ci_r3b_historical_predecessor_slot2",
    "20260413201500_ci_r3b_historical_predecessor_slot3",
    "20260413225000_ci_r3b_historical_predecessor_slot4",
    "20260417170000_ci_r3b_historical_predecessor_slot5",
    "20260421180000_ci_r3b_historical_predecessor_slot6",
]

# Historical insertion positions — not wall-clock timestamps.
SLOT_MIGRATIONS: dict[int, str] = {
    7: "20260613203000_ci_r3b_post_vendor_predecessor_slot07",
    8: "20260616130000_ci_r3b_post_vendor_predecessor_slot08",
    9: "20260617120000_r3b_post_vendor_predecessor_slot09",
    10: "20260617203000_ci_r3b_post_vendor_predecessor_slot10",
    11: "20260620183000_ci_r3b_post_vendor_predecessor_slot11",
    12: "20260716180000_r3b_post_vendor_predecessor_slot12",
    13: "20260716182500_ci_r3b_post_vendor_predecessor_slot13",
    14: "20260716200000_r3b_post_vendor_predecessor_slot14",
    15: "20260723245000_ci_r3b_post_vendor_predecessor_slot15",
    16: "20260724210000_ci_r3b_post_vendor_predecessor_slot16",
}

R3B1E_REPAIR_MIGRATIONS = [SLOT_MIGRATIONS[s] for s in range(7, 17)]

POST_VENDOR_HIGH_RISK = [
    ("VendorCategory", "enum", 7),
    ("vendors", "table", 7),
    ("vendor_vehicles", "table", 7),
    ("WorkflowStatus", "enum", 8),
    ("org_workflows", "table", 8),
    ("vehicle_damages", "table", 10),
    ("vehicle_damage_images", "table", 10),
]

ORIGINAL_R3B_HIGH_RISK = [
    ("org_tasks", "table", "20260412025000_ci_r3b_historical_predecessor_slot1"),
    ("brake_health_current", "table", "20260412610000_ci_r3b_historical_predecessor_slot2"),
    ("battery_evidence", "table", "20260413201500_ci_r3b_historical_predecessor_slot3"),
    ("vehicle_document_extractions", "table", "20260413201500_ci_r3b_historical_predecessor_slot3"),
    ("org_invoices", "table", "20260413225000_ci_r3b_historical_predecessor_slot4"),
    ("vehicle_dtc_events", "table", "20260413225000_ci_r3b_historical_predecessor_slot4"),
    ("vehicle_driving_impact_current", "table", "20260421180000_ci_r3b_historical_predecessor_slot6"),
    ("InsightType", "enum", "20260417170000_ci_r3b_historical_predecessor_slot5"),
]

IMPLEMENTATION_AUTHORITY_FILES = {
    "topology": TOPOLOGY,
    "vendor_contracts": VENDOR_CONTRACTS,
    "remaining_contracts": REMAINING_CONTRACTS,
    "closure": CLOSURE,
    "graph": GRAPH,
    "ddl_proof": DDL_PROOF,
    "catalog_parity": CATALOG_PARITY,
    "authority_reference": AUTHORITY_REF,
    "compiler": COMPILER,
    "compile_repair_sql": REPO / "docs/audits/ci-recovery/tooling/ci_r3b1b_compile_repair_sql.py",
}
