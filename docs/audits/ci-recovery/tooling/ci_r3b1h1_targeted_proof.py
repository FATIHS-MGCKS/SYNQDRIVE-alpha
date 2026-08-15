#!/usr/bin/env python3
"""Targeted PostgreSQL proof using generic contract builder output (CI-R3B1H.1)."""
from __future__ import annotations

import json
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1d12_pg_catalog_reader import read_actual_catalog
from ci_r3b1g_replay_lib import replay_until_exclusive
from ci_r3b1f111_contract_compiler import compile_add_column_contract, sha256_text
from ci_r3b1h1_constants import DATA, IAM_CONSUMER, PRE249_BOUNDARY, REPO
from replay_evidence_lib import MIG_ROOT, PgConfig, psql, recreate_db

CONTRACTS = DATA / "ci-r3b1h1-exact-predecessor-contracts-2026-08.json"
OUT = DATA / "ci-r3b1h1-targeted-consumer-proof-2026-08.json"
MIG249 = MIG_ROOT / IAM_CONSUMER / "migration.sql"


def verify_column_catalog(catalog: dict, relation: str, column: str, pg_type: str, nullable: bool) -> dict:
    col = catalog["columns"].get(relation, {}).get(column)
    if not col:
        return {"pass": False, "reason": "column_missing"}
    default_info = col.get("default") or {}
    default_ok = default_info in (None, {"kind": "none"}) or (
        isinstance(default_info, dict) and default_info.get("kind") in {"none", "NO_DATABASE_DEFAULT"}
    )
    return {
        "pass": col["type"] == pg_type and col["nullable"] is nullable and default_ok,
        "type": col["type"],
        "nullable": col["nullable"],
        "default": default_info,
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
VALUES ('{org_id}', 'R3B1H1 Test Org', 'FLEET'::"BusinessType", NOW(), NOW());
INSERT INTO "users" ("id", "email", "name", "created_at", "updated_at")
VALUES ('{user_role}', 'r3b1h1-role-{user_role[:8]}@example.test', 'R3B1H1 Role User', NOW(), NOW());
INSERT INTO "users" ("id", "email", "name", "created_at", "updated_at")
VALUES ('{user_perm}', 'r3b1h1-perm-{user_perm[:8]}@example.test', 'R3B1H1 Perm User', NOW(), NOW());
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


def run_proof_db(db: str, with_fixture: bool) -> dict:
    cfg = PgConfig()
    recreate_db(cfg, db)
    replay = replay_until_exclusive(cfg, db, PRE249_BOUNDARY)
    if not replay.get("pass"):
        return {"pass": False, "stage": "pre249_replay", "error": replay.get("error")}

    pre_catalog = read_actual_catalog(cfg, db)
    contracts_doc = json.loads(CONTRACTS.read_text())
    gap_proofs = []

    for contract in contracts_doc.get("contracts", []):
        rel = contract["relation"]
        col = contract["column"]
        if col in pre_catalog["columns"].get(rel, {}):
            return {"pass": False, "stage": "pre_repair_assertion", "error": f"{rel}.{col} already exists"}
        sql = compile_add_column_contract(contract)
        repair_proc = psql(cfg, db, sql)
        post_catalog = read_actual_catalog(cfg, db)
        parity = verify_column_catalog(
            post_catalog, rel, col, contract["postgres_type"], contract.get("nullable", True)
        )
        gap_proofs.append(
            {
                "contract_id": contract["contract_id"],
                "relation": rel,
                "column": col,
                "compiled_sql_sha256": sha256_text(sql),
                "repair_execution": repair_proc.returncode == 0,
                "catalog_parity": parity,
                "pass": repair_proc.returncode == 0 and parity.get("pass"),
            }
        )

    fixture = {"seed_pass": True}
    if with_fixture:
        fixture = seed_synthetic_fixture(cfg, db)

    mig_proc = psql(cfg, db, "", file=MIG249)
    assignment_count = int(
        psql(cfg, db, 'SELECT COUNT(*) FROM "organization_role_assignments";', tuples_only=True).stdout.strip() or 0
    )
    base_pass = all(p["pass"] for p in gap_proofs) and mig_proc.returncode == 0
    if with_fixture:
        base_pass = base_pass and fixture.get("seed_pass", False) and assignment_count >= 1

    return {
        "pass": base_pass,
        "database_identifier": db,
        "gap_proofs": gap_proofs,
        "fixture": fixture,
        "migration_249_execution": "PASS" if mig_proc.returncode == 0 else "FAIL",
        "organization_role_assignments_count": assignment_count,
    }


def main() -> int:
    analysis_db = sys.argv[1] if len(sys.argv) > 1 else "synqdrive_r3b1h1_pre249"
    proof_db = sys.argv[2] if len(sys.argv) > 2 else "synqdrive_r3b1h1_proof"
    analysis = run_proof_db(analysis_db, with_fixture=False)
    proof = run_proof_db(proof_db, with_fixture=True)
    out = {
        "schema_version": 1,
        "phase": "CI-R3B1H.1",
        "contracts_source": str(CONTRACTS.relative_to(REPO)),
        "generic_contract_compiled": True,
        "analysis_database": analysis,
        "proof_database": proof,
        "gap_proofs": proof.get("gap_proofs", []),
        "synthetic_fixture_pass": proof.get("fixture", {}).get("seed_pass"),
        "targeted_consumer_failures": 0 if analysis.get("pass") and proof.get("pass") else 1,
        "pass": analysis.get("pass") and proof.get("pass"),
    }
    OUT.write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps({"pass": out["pass"], "gap_proofs": len(out["gap_proofs"])}, indent=2))
    return 0 if out["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
