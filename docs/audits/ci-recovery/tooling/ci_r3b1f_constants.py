"""Shared constants for CI-R3B1F expression dependency closure."""
from __future__ import annotations

from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
DATA = REPO / "docs/audits/ci-recovery/data"
MIG_ROOT = REPO / "backend/prisma/migrations"
BACKEND = REPO / "backend"

BASE_R3B1E_SHA = "5acf67cc4013aec7ae42b7028f07aae083351a17"
PRE_R3B1F_SHA = BASE_R3B1E_SHA
R3B1F_BRANCH = "fix/ci-r3b1f-tire-predicate-dependency-closure-2026-08"

PRE157_BOUNDARY = "20260716182500_ci_r3b_post_vendor_predecessor_slot13"
FIRST_SCANNED = "20260716183000_tire_lifecycle_invariants"
TIRE_CONSUMER = FIRST_SCANNED
SLOT13_REPAIR = PRE157_BOUNDARY
SLOT13_CONSUMER = TIRE_CONSUMER

PREVIOUS_PRIMARY_DEFECTS = 18

TIRE_PROPERTIES = [
    ("vehicle_tire_setups", "vehicle_id"),
    ("vehicle_tire_setups", "status"),
    ("vehicle_tire_setups", "removed_at"),
    ("tires", "tire_set_id"),
    ("tires", "current_position"),
    ("tires", "active"),
]

TEMP_STATUS_REPAIR_SQL = """
ALTER TABLE "vehicle_tire_setups"
  ADD COLUMN IF NOT EXISTS "status" "TireSetupStatus" NOT NULL DEFAULT 'ACTIVE'::"TireSetupStatus";
"""
