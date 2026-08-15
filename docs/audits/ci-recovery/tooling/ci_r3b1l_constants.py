"""Shared constants for CI-R3B1L exact final catalog parity."""
from __future__ import annotations

import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
DATA = REPO / "docs/audits/ci-recovery/data"
RECOVERY = REPO / "docs/audits/ci-recovery"
BACKEND = REPO / "backend"
MIG_ROOT = BACKEND / "prisma/migrations"

BASE_R3B1K_SHA = "ee634cef5d46004e39f5c61588f9251cc3d4a00b"
R3B1L_BRANCH = "fix/ci-r3b1l-exact-final-parity-acceptance-2026-08"
PARENT_BRANCH = "fix/ci-r3b1k-migration252-identifier-correction-2026-08"

CORRECTED_M252_SHA256 = "415f741ebf6d810c10e4d1524bc2d4bda79d557f0f2a6d3594ec43c49338adee"
COMPOSITE_INDEX_PINNED_SHA = "315ea75619f33af2d3cdd4e61744aa916e461232bcc203738f1eae9c1fae4496"

AUTHORITY_ARTIFACTS = [
    ("ci-r3a7-production-catalog-evidence-2026-08.json", "ACCEPTED_CI_R3A71_PRODUCTION_JSON"),
    ("ci-r3b-bootstrap-predecessor-shape-ledger-2026-08.md", "R3B021_FINAL_CONVERGENCE_LEDGER"),
    ("ci-r3b-executable-contract-2026-08.md", "R3B_EXECUTABLE_CONTRACT"),
]

PROPERTY_CATEGORIES = ("columns", "types", "nullability", "defaults", "constraints", "indexes")

BOOTSTRAP_TABLES = [
    "vehicle_trips",
    "driving_events",
    "trip_behavior_events",
    "vehicle_trip_waypoints",
    "vehicle_trip_tracking_runs",
    "trip_repairs",
    "trip_driving_impact",
    "vehicle_trip_detection_states",
    "brake_trip_metrics",
]

BOOTSTRAP_ENUMS = [
    "TripAssignmentStatus",
    "TripAssignmentSubjectType",
    "DrivingEventType",
    "BehaviorEventCategory",
    "BehaviorEventClassification",
    "TripSource",
    "TripDetectionState",
    "TripTrackingRunType",
    "VehicleDetectionProfile",
    "DetectionConfidence",
]

R3B1G_REPAIR = "20260716182730_ci_r3b_tire_setup_status_predecessor"
MIGRATION_157 = "20260716160000_battery_v2_remaining_models"
R3B1I_REPAIR = "20260721245000_ci_r3b_iam_membership_permissions_predecessor"
MIGRATION_249 = "20260721250000_iam_versioned_role_assignments"
MIGRATION_252 = "20260721270000_iam_role_assignment_drift_reconciliation"
COMPOSITE_MIGRATION = "20260413230000_add_composite_indexes_batch_c"
POST_REPLAY_RECON = "20260814130000_ci_r3b_post_replay_parity_reconciliation"

CATALOG_PATH = RECOVERY / "ci-r3a7-production-catalog-evidence-2026-08.json"
LEDGER_PATH = RECOVERY / "ci-r3b-bootstrap-predecessor-shape-ledger-2026-08.md"
CONTRACT_PATH = RECOVERY / "ci-r3b-executable-contract-2026-08.md"

FULL_REPLAY_DB = "synqdrive_r3b1l_full_replay"


def evidence_input_sha() -> str:
    return subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=REPO, text=True).strip()
