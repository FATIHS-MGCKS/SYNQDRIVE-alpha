"""Shared constants for CI-R3B1F.1.1 SQL scope and classification closure."""
from __future__ import annotations

from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
DATA = REPO / "docs/audits/ci-recovery/data"
MIG_ROOT = REPO / "backend/prisma/migrations"
BACKEND = REPO / "backend"
SCHEMA = BACKEND / "prisma/schema.prisma"

BASE_R3B1F1_SHA = "6263e2455db23df226567ac95e2aff3f1b6a5f98"
R3B1F111_BRANCH = "fix/ci-r3b1f111-sql-scope-classification-closure-2026-08"

PRE157_BOUNDARY = "20260716182500_ci_r3b_post_vendor_predecessor_slot13"
FIRST_SCANNED = "20260716183000_tire_lifecycle_invariants"
TIRE_CONSUMER = FIRST_SCANNED
SLOT13_REPAIR = PRE157_BOUNDARY

PREVIOUS_PRIMARY_DEFECTS = 18
PREVIOUS_R3B1F1_MISSING_HISTORY = 7
PREVIOUS_R3B1F1_ORDERING_DEFECT = 13
PREVIOUS_R3B1F1_DEFECT_RECORDS = 20

R3B1F1_MATRIX = DATA / "ci-r3b1f1-expression-aware-dependency-matrix-2026-08.json"

PREVIOUS_MISSING_HISTORY = [
    ("vehicle_tire_setups", "status", "PARTIAL_INDEX_PREDICATE"),
    ("organization_legal_document_events", "organization_legal_documents", "UPDATE_EXPRESSION"),
    ("rental_vehicle_categories", "rn", "UPDATE_EXPRESSION"),
    ("rental_vehicle_categories", "ranked", "UPDATE_EXPRESSION"),
    ("vehicle_rental_requirement_overrides", "vehicles", "UPDATE_EXPRESSION"),
    ("vehicles", "rental_vehicle_categories", "UPDATE_EXPRESSION"),
    ("org_workflows", "catalogKey", "INDEX_KEY"),
]

PREVIOUS_ORDERING_DEFECTS = [
    "organization_rental_rules_minimum_age_years_check",
    "organization_rental_rules_minimum_license_holding_months_check",
    "organization_rental_rules_deposit_amount_cents_check",
    "organization_rental_rules_deposit_currency_check",
    "rental_vehicle_categories_minimum_age_years_check",
    "rental_vehicle_categories_minimum_license_holding_months_check",
    "rental_vehicle_categories_deposit_amount_cents_check",
    "rental_vehicle_categories_deposit_currency_check",
    "rental_vehicle_categories_name_not_blank_check",
    "vehicle_rental_requirement_overrides_minimum_age_years_check",
    "vehicle_rental_requirement_overrides_minimum_license_holding_months_check",
    "vehicle_rental_requirement_overrides_deposit_amount_cents_check",
    "vehicle_rental_requirement_overrides_deposit_currency_check",
]

EXPRESSION_GAP_CONTEXTS = {
    "PARTIAL_INDEX_PREDICATE",
    "INDEX_EXPRESSION",
    "CHECK_EXPRESSION",
    "GENERATED_EXPRESSION",
    "ALTER_USING_EXPRESSION",
    "UPDATE_EXPRESSION",
}

TIRE_PROPERTIES = [
    ("vehicle_tire_setups", "vehicle_id"),
    ("vehicle_tire_setups", "status"),
    ("vehicle_tire_setups", "removed_at"),
    ("tires", "tire_set_id"),
    ("tires", "current_position"),
    ("tires", "active"),
]

FALSE_POSITIVE_MODEL = "emit_explicit_FALSE_POSITIVE_records"
