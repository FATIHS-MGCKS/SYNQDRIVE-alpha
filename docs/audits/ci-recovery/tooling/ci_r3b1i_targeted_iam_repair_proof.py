#!/usr/bin/env python3
"""Targeted actual-file PostgreSQL proof for CI-R3B1I IAM permissions repair."""
from __future__ import annotations

import json
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1d12_pg_catalog_reader import read_actual_catalog
from ci_r3b1g_replay_lib import column_exists, replay_until_exclusive
from ci_r3b1i_constants import ACCEPTED_CONTRACT, DATA, IAM_CONSUMER, IAM_PREDECESSOR, IAM_REPAIR_MIGRATION, MIG_ROOT
from replay_evidence_lib import psql, sha256_file, table_exists, PgConfig

OUT = DATA / "ci-r3b1i-targeted-iam-repair-proof-2026-08.json"
MIG_PATH = MIG_ROOT / IAM_REPAIR_MIGRATION / "migration.sql"
MIG249_PATH = MIG_ROOT / IAM_CONSUMER / "migration.sql"


def verify_permissions_catalog(catalog: dict) -> dict:
    col = catalog["columns"].get("organization_memberships", {}).get("permissions")
    if not col:
        return {"pass": False, "reason": "column_missing"}
    default_info = col.get("default") or {}
    default_ok = default_info in (None, {"kind": "none"}) or (
        isinstance(default_info, dict) and default_info.get("kind") in {"none", "NO_DATABASE_DEFAULT"}
    )
    return {
        "pass": col["type"] == "jsonb" and col["nullable"] is True and default_ok,
        "type": col["type"],
        "nullable": col["nullable"],
        "default": default_info,
    }


def seed_synthetic_iam(cfg: PgConfig, db: str) -> dict:
    org_id = str(uuid.uuid4())
    user_role = str(uuid.uuid4())
    user_perm = str(uuid.uuid4())
    role_id = str(uuid.uuid4())
    mem_role = str(uuid.uuid4())
    mem_perm = str(uuid.uuid4())
    sql = f"""
INSERT INTO "organizations" ("id", "company_name", "business_type", "created_at", "updated_at")
VALUES ('{org_id}', 'R3B1I Test Org', 'FLEET'::"BusinessType", NOW(), NOW());
INSERT INTO "users" ("id", "email", "name", "created_at", "updated_at")
VALUES ('{user_role}', 'r3b1i-role-{user_role[:8]}@example.test', 'Role User', NOW(), NOW());
INSERT INTO "users" ("id", "email", "name", "created_at", "updated_at")
VALUES ('{user_perm}', 'r3b1i-perm-{user_perm[:8]}@example.test', 'Perm User', NOW(), NOW());
INSERT INTO "organization_roles" (
  "id", "organization_id", "name", "membership_role", "permissions", "is_active", "is_default", "created_at", "updated_at"
) VALUES (
  '{role_id}', '{org_id}', 'Admin Role', 'ORG_ADMIN', '{{"fleet": "read"}}'::jsonb, true, false, NOW(), NOW()
);
INSERT INTO "organization_memberships" (
  "id", "user_id", "organization_id", "role", "organization_role_id", "created_at", "updated_at"
) VALUES (
  '{mem_role}', '{user_role}', '{org_id}', 'ORG_ADMIN', '{role_id}', NOW(), NOW()
);
INSERT INTO "organization_memberships" (
  "id", "user_id", "organization_id", "role", "permissions", "created_at", "updated_at"
) VALUES (
  '{mem_perm}', '{user_perm}', '{org_id}', 'WORKER', '{{"legacy": true}}'::jsonb, NOW(), NOW()
);
"""
    proc = psql(cfg, db, sql)
    return {"seed_pass": proc.returncode == 0}


def validate_post_249(cfg: PgConfig, db: str) -> dict:
    checks = {
        "organization_role_versions_exists": table_exists(cfg, db, "organization_role_versions"),
        "organization_role_assignments_exists": table_exists(cfg, db, "organization_role_assignments"),
        "membership_permissions_exists": column_exists(cfg, db, "organization_memberships", "permissions"),
    }
    checks["pass"] = all(checks.values())
    return checks


def main() -> int:
    db = sys.argv[1] if len(sys.argv) > 1 else "synqdrive_r3b1i_targeted"
    cfg = PgConfig()
    replay = replay_until_exclusive(cfg, db, IAM_REPAIR_MIGRATION)
    if replay.get("last_applied") != IAM_PREDECESSOR:
        out = {"pass": False, "reason": "pre_repair_replay_failed", "replay": replay}
        OUT.write_text(json.dumps(out, indent=2) + "\n")
        return 1

    pre_catalog = {
        "organization_memberships_exists": table_exists(cfg, db, "organization_memberships"),
        "permissions_exists": column_exists(cfg, db, "organization_memberships", "permissions"),
    }
    if not pre_catalog["organization_memberships_exists"] or pre_catalog["permissions_exists"]:
        out = {"pass": False, "reason": "pre_repair_assertion_failed", "pre_catalog": pre_catalog}
        OUT.write_text(json.dumps(out, indent=2) + "\n")
        return 1

    repair_proc = psql(cfg, db, "", file=MIG_PATH)
    post_catalog = read_actual_catalog(cfg, db)
    parity = verify_permissions_catalog(post_catalog)
    mig249_proc = psql(cfg, db, "", file=MIG249_PATH)
    post_249 = validate_post_249(cfg, db)
    synthetic = seed_synthetic_iam(cfg, db) if mig249_proc.returncode == 0 else {"seed_pass": False}

    out = {
        "schema_version": 1,
        "phase": "CI-R3B1I",
        "database_identifier": db,
        "contract": ACCEPTED_CONTRACT,
        "pre_repair_replay": replay,
        "pre_repair_catalog": pre_catalog,
        "migration_file_sha256": sha256_file(MIG_PATH),
        "repair_execution": "PASS" if repair_proc.returncode == 0 else "FAIL",
        "repair_sqlstate": None,
        "post_repair_catalog_parity": parity,
        "migration_249_execution": "PASS" if mig249_proc.returncode == 0 else "FAIL",
        "post_249_object_validation": post_249,
        "synthetic_fixture": synthetic,
        "manual_interventions": 0,
        "pass": repair_proc.returncode == 0
        and parity.get("pass")
        and mig249_proc.returncode == 0
        and post_249.get("pass")
        and synthetic.get("seed_pass"),
    }
    OUT.write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps({"pass": out["pass"]}, indent=2))
    return 0 if out["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
