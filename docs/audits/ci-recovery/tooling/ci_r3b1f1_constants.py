"""Shared constants for CI-R3B1F.1 creator chronology and contract hardening."""
from __future__ import annotations

from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
DATA = REPO / "docs/audits/ci-recovery/data"
MIG_ROOT = REPO / "backend/prisma/migrations"
BACKEND = REPO / "backend"
SCHEMA = BACKEND / "prisma/schema.prisma"

BASE_R3B1F_SHA = "75ecaa637f7588a10d3b8d885ffb1830b0bfba9a"
R3B1F1_BRANCH = "fix/ci-r3b1f1-creator-state-contract-hardening-2026-08"

PRE157_BOUNDARY = "20260716182500_ci_r3b_post_vendor_predecessor_slot13"
FIRST_SCANNED = "20260716183000_tire_lifecycle_invariants"
TIRE_CONSUMER = FIRST_SCANNED
SLOT13_REPAIR = PRE157_BOUNDARY

PREVIOUS_PRIMARY_DEFECTS = 18
PREVIOUS_R3B1F_CANDIDATES = 13

R3B1F_CANDIDATES = [
    ("vehicle_tire_setups", "status"),
    ("tire_health_snapshots", "input_fingerprint"),
    ("rental_driving_analyses", "superseded_at"),
    ("vehicle_service_events", "document_extraction_id"),
    ("vehicle_damages", "document_extraction_id"),
    ("brake_health_snapshots", "vehicle_id"),
    ("brake_health_snapshots", "model_version"),
    ("brake_health_snapshots", "input_fingerprint"),
    ("brake_evidence", "dedupe_key"),
    ("voice_phone_numbers", "elevenlabs_ref_digest"),
    ("brake_evidence", "active"),
    ("brake_evidence", "superseded_by_evidence_id"),
    ("brake_health_alerts", "status"),
]

EXPRESSION_GAP_CONTEXTS = {
    "PARTIAL_INDEX_PREDICATE",
    "INDEX_EXPRESSION",
    "CHECK_EXPRESSION",
    "GENERATED_EXPRESSION",
    "ALTER_USING_EXPRESSION",
}

TIRE_PROPERTIES = [
    ("vehicle_tire_setups", "vehicle_id"),
    ("vehicle_tire_setups", "status"),
    ("vehicle_tire_setups", "removed_at"),
    ("tires", "tire_set_id"),
    ("tires", "current_position"),
    ("tires", "active"),
]

R3B1F_MATRIX = DATA / "ci-r3b1f-expression-aware-dependency-matrix-2026-08.json"
