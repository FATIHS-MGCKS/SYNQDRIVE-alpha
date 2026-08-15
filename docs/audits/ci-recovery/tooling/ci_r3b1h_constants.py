"""Shared constants for CI-R3B1H IAM insert-select predecessor closure."""
from __future__ import annotations

from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
DATA = REPO / "docs/audits/ci-recovery/data"
MIG_ROOT = REPO / "backend/prisma/migrations"
BACKEND = REPO / "backend"
SCHEMA = BACKEND / "prisma/schema.prisma"

BASE_R3B1G_SHA = "25e3a18ed9eab1322a85d65fcfdf6a449f2ed222"
R3B1H_BRANCH = "fix/ci-r3b1h-iam-insert-select-closure-2026-08"

PRE249_BOUNDARY = "20260721250000_iam_versioned_role_assignments"
LAST_APPLIED_PRE249 = "20260721240000_iam_last_selected_organization"
FIRST_SCANNED = PRE249_BOUNDARY
IAM_CONSUMER = PRE249_BOUNDARY
MIG_249_ORDINAL = 249

IAM_HISTORICAL_SCHEMA_COMMIT = "68150912"

INSERT_SELECT_GAP_CONTEXTS = {
    "INSERT_SELECT_TARGET",
    "INSERT_SELECT_EXPRESSION",
    "INSERT_SELECT_WHERE",
    "INSERT_SELECT_JOIN",
    "INSERT_SELECT_SUBQUERY",
}

IAM_RELATIONS = [
    "organization_memberships",
    "organization_roles",
    "organization_user_invites",
    "organization_role_versions",
    "organization_role_assignments",
    "membership_permission_overrides",
    "users",
    "organizations",
]

MEMBERSHIP_MATRIX_FIELDS = [
    "id",
    "user_id",
    "organization_id",
    "role",
    "station_scope",
    "status",
    "created_at",
    "updated_at",
    "organization_role_id",
    "role_label",
    "department",
    "position",
    "permissions",
    "station_ids",
    "field_agent_access",
    "membership_version",
]

ROLE_MATRIX_FIELDS = [
    "id",
    "organization_id",
    "name",
    "description",
    "permissions",
    "station_scope_default",
    "default_station_ids",
    "field_agent_access_default",
    "membership_role",
    "is_system_template",
    "created_by_user_id",
    "created_at",
    "updated_at",
]

R3B1G_REPLAY = DATA / "ci-r3b1g-full-fresh-replay-result-2026-08.json"
