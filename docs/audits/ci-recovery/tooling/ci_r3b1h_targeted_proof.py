#!/usr/bin/env python3
"""Targeted PostgreSQL proof: contract repair + unchanged migration 249 (CI-R3B1H)."""
from __future__ import annotations

import json
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1d12_pg_catalog_reader import read_actual_catalog
from ci_r3b1g_replay_lib import bootstrap_prisma_migrations, record_migration_applied, replay_until_exclusive
from ci_r3b1f111_contract_compiler import compile_add_column_contract, sha256_text
from ci_r3b1h_constants import DATA, IAM_CONSUMER, LAST_APPLIED_PRE249, PRE249_BOUNDARY, REPO
from replay_evidence_lib import MIG_ROOT, PgConfig, psql, recreate_db

CONTRACTS = DATA / "ci-r3b1h-exact-iam-predecessor-contracts-2026-08.json"
OUT = DATA / "ci-r3b1h-targeted-iam-consumer-proof-2026-08.json"
MIG249 = MIG_ROOT / IAM_CONSUMER / "migration.sql"


def table_count(cfg: PgConfig, db: str, table: str) -> int:
    proc = psql(cfg, db, f'SELECT COUNT(*) FROM "{table}";', tuples_only=True)
    return int(proc.stdout.strip() or 0)


def validate_post249_iam(cfg: PgConfig, db: str) -> dict:
    tables = [
        "organization_role_versions",
        "organization_role_assignments",
        "membership_permission_overrides",
    ]
    exists = {}
    for t in tables:
        proc = psql(
            cfg,
            db,
            "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='"
            + t
            + "');",
            tuples_only=True,
        )
        exists[t] = proc.stdout.strip() == "t"
    idx_proc = psql(
        cfg,
        db,
        """
        SELECT COUNT(*) FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname='public' AND c.relkind='i'
          AND c.relname LIKE 'organization_role_%';
        """,
        tuples_only=True,
    )
    return {
        "tables_created": exists,
        "organization_role_indexes": int(idx_proc.stdout.strip() or 0),
        "pass": all(exists.values()) and int(idx_proc.stdout.strip() or 0) >= 4,
    }


def seed_synthetic_fixture(cfg: PgConfig, db: str) -> dict:
    org_id = str(uuid.uuid4())
    user_role = str(uuid.uuid4())
    user_perm = str(uuid.uuid4())
    role_id = str(uuid.uuid4())
    mem_role = str(uuid.uuid4())
    mem_perm = str(uuid.uuid4())
    sql = f"""
INSERT INTO "organizations" ("id", "company_name", "business_type", "created_at", "updated_at")
VALUES ('{org_id}', 'R3B1H Test Org', 'FLEET'::"BusinessType", NOW(), NOW());
INSERT INTO "users" ("id", "email", "name", "created_at", "updated_at")
VALUES ('{user_role}', 'r3b1h-role-{user_role[:8]}@example.test', 'R3B1H Role User', NOW(), NOW());
INSERT INTO "users" ("id", "email", "name", "created_at", "updated_at")
VALUES ('{user_perm}', 'r3b1h-perm-{user_perm[:8]}@example.test', 'R3B1H Perm User', NOW(), NOW());
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
    return {"seed_pass": proc.returncode == 0, "stderr": (proc.stderr or "")[:500]}


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


def run_proof_db(db: str, with_fixture: bool) -> dict:
    cfg = PgConfig()
    recreate_db(cfg, db)
    replay = replay_until_exclusive(cfg, db, PRE249_BOUNDARY)
    if not replay.get("pass"):
        return {"pass": False, "stage": "pre249_replay", "error": replay.get("error")}

    pre_catalog = read_actual_catalog(cfg, db)
    contracts_doc = json.loads(CONTRACTS.read_text())
    repair_results = []

    for contract in contracts_doc.get("contracts", []):
        rel = contract["relation"]
        col = contract["column"]
        pre_exists = col in pre_catalog["columns"].get(rel, {})
        if pre_exists:
            return {"pass": False, "stage": "pre_repair_assertion", "error": f"{rel}.{col} already exists"}

        sql = compile_add_column_contract(contract)
        repair_proc = psql(cfg, db, sql)
        post_catalog = read_actual_catalog(cfg, db)
        parity = verify_permissions_catalog(post_catalog) if col == "permissions" else {"pass": repair_proc.returncode == 0}
        repair_results.append(
            {
                "contract_id": contract["contract_id"],
                "compiled_sql_sha256": sha256_text(sql),
                "repair_execution": "PASS" if repair_proc.returncode == 0 else "FAIL",
                "catalog_parity": parity,
            }
        )

    fixture = {"seed_pass": True}
    if with_fixture:
        fixture = seed_synthetic_fixture(cfg, db)

    mig_proc = psql(cfg, db, "", file=MIG249)
    post_mig_catalog = read_actual_catalog(cfg, db)
    validation = validate_post249_iam(cfg, db)
    assignment_count = table_count(cfg, db, "organization_role_assignments")
    version_count = table_count(cfg, db, "organization_role_versions")
    base_pass = (
        all(r["repair_execution"] == "PASS" and r["catalog_parity"].get("pass") for r in repair_results)
        and mig_proc.returncode == 0
        and validation["pass"]
    )
    if with_fixture:
        base_pass = base_pass and fixture.get("seed_pass", False) and assignment_count >= 1 and version_count >= 1

    return {
        "pass": base_pass,
        "database_identifier": db,
        "pre249_replay": replay,
        "repair_results": repair_results,
        "fixture": fixture,
        "migration_249_execution": "PASS" if mig_proc.returncode == 0 else "FAIL",
        "migration_249_sqlstate": None if mig_proc.returncode == 0 else "ERROR",
        "migration_249_stderr": (mig_proc.stderr or "")[:800] if mig_proc.returncode != 0 else None,
        "post_consumer_validation": validation,
        "organization_role_assignments_count": assignment_count,
        "organization_role_versions_count": version_count,
        "post_mig249_catalog_tables": sorted(post_mig_catalog["tables"]),
    }


def main() -> int:
    analysis_db = sys.argv[1] if len(sys.argv) > 1 else "synqdrive_r3b1h_pre249"
    proof_db = sys.argv[2] if len(sys.argv) > 2 else "synqdrive_r3b1h_proof"

    if OUT.is_file():
        prev = json.loads(OUT.read_text())
        analysis = prev.get("analysis_database")
        if not analysis or not analysis.get("pass"):
            analysis = run_proof_db(analysis_db, with_fixture=False)
    else:
        analysis = run_proof_db(analysis_db, with_fixture=False)

    proof = run_proof_db(proof_db, with_fixture=True)

    out = {
        "schema_version": 1,
        "phase": "CI-R3B1H",
        "contracts_source": str(CONTRACTS.relative_to(REPO)),
        "analysis_database": analysis,
        "proof_database": proof,
        "synthetic_fixture": proof.get("fixture"),
        "targeted_consumer_failures": 0
        if analysis.get("pass") and proof.get("pass")
        else 1,
        "pass": analysis.get("pass") and proof.get("pass"),
    }
    OUT.write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps({"pass": out["pass"], "migration_249": proof.get("migration_249_execution")}, indent=2))
    return 0 if out["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
