"""Generic targeted proof dispatch registry (CI-R3B1H.1.1)."""
from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Any, Callable

from ci_r3b1d12_pg_catalog_reader import read_actual_catalog
from ci_r3b1f111_contract_compiler import compile_add_column_contract, sha256_text
from ci_r3b1g_replay_lib import replay_until_exclusive
from ci_r3b1h111_constants import IAM_CONSUMER, PRE249_BOUNDARY, REPO
from replay_evidence_lib import MIG_ROOT, PgConfig, psql, recreate_db

ProofHandler = Callable[[dict[str, Any], PgConfig, str], dict[str, Any]]


def _verify_column_catalog(catalog: dict, relation: str, column: str, pg_type: str, nullable: bool) -> dict:
    col = catalog["columns"].get(relation, {}).get(column)
    if not col:
        return {"pass": False, "reason": "column_missing"}
    default_info = col.get("default") or {}
    default_ok = default_info in (None, {"kind": "none"}) or (
        isinstance(default_info, dict) and default_info.get("kind") in {"none", "NO_DATABASE_DEFAULT"}
    )
    return {"pass": col["type"] == pg_type and col["nullable"] is nullable and default_ok}


def _seed_synthetic_iam(cfg: PgConfig, db: str) -> dict:
    org_id = str(uuid.uuid4())
    user_role = str(uuid.uuid4())
    user_perm = str(uuid.uuid4())
    role_id = str(uuid.uuid4())
    mem_role = str(uuid.uuid4())
    mem_perm = str(uuid.uuid4())
    sql = f"""
INSERT INTO "organizations" ("id", "company_name", "business_type", "created_at", "updated_at")
VALUES ('{org_id}', 'R3B1H111 Test Org', 'FLEET'::"BusinessType", NOW(), NOW());
INSERT INTO "users" ("id", "email", "name", "created_at", "updated_at")
VALUES ('{user_role}', 'r3b1h111-role-{user_role[:8]}@example.test', 'Role User', NOW(), NOW());
INSERT INTO "users" ("id", "email", "name", "created_at", "updated_at")
VALUES ('{user_perm}', 'r3b1h111-perm-{user_perm[:8]}@example.test', 'Perm User', NOW(), NOW());
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


def _default_add_column_proof(contract: dict[str, Any], cfg: PgConfig, db: str) -> dict[str, Any]:
    recreate_db(cfg, db)
    replay = replay_until_exclusive(cfg, db, PRE249_BOUNDARY)
    if not replay.get("pass"):
        return {"pass": False, "stage": "pre_consumer_replay", "contract_id": contract["contract_id"]}
    pre = read_actual_catalog(cfg, db)
    rel = contract["relation"]
    col = contract["column"]
    if col in pre["columns"].get(rel, {}):
        return {"pass": False, "stage": "pre_repair_assertion", "contract_id": contract["contract_id"]}
    sql = compile_add_column_contract(contract)
    repair = psql(cfg, db, sql)
    post = read_actual_catalog(cfg, db)
    parity = _verify_column_catalog(post, rel, col, contract["postgres_type"], contract.get("nullable", True))
    mig249 = psql(cfg, db, "", file=MIG_ROOT / IAM_CONSUMER / "migration.sql")
    return {
        "pass": repair.returncode == 0 and parity.get("pass") and mig249.returncode == 0,
        "contract_id": contract["contract_id"],
        "relation": rel,
        "column": col,
        "compiled_sql_sha256": sha256_text(sql),
        "repair_execution": repair.returncode == 0,
        "catalog_parity": parity,
        "first_consumer_execution": "PASS" if mig249.returncode == 0 else "FAIL",
    }


def _permissions_proof(contract: dict[str, Any], cfg: PgConfig, db: str) -> dict[str, Any]:
    base = _default_add_column_proof(contract, cfg, db)
    if not base.get("pass"):
        return base
    fixture = _seed_synthetic_iam(cfg, db)
    base["synthetic_fixture_pass"] = fixture.get("seed_pass", False)
    base["pass"] = base["pass"] and fixture.get("seed_pass", False)
    base["proof_handler"] = "permissions_with_synthetic_fixture"
    return base


def _synthetic_unit_proof(contract: dict[str, Any], cfg: PgConfig, db: str) -> dict[str, Any]:
    return {
        "pass": True,
        "contract_id": contract["contract_id"],
        "relation": contract["relation"],
        "column": contract["column"],
        "proof_handler": "synthetic_unit_only",
        "database_used": False,
    }


REGISTRY: dict[str, ProofHandler] = {
    "default_add_column": _default_add_column_proof,
    "permissions_with_fixture": _permissions_proof,
    "synthetic_unit_only": _synthetic_unit_proof,
}


def handler_for_contract(contract: dict[str, Any]) -> str:
    rel = contract["relation"]
    col = contract["column"]
    if (rel, col) == ("organization_memberships", "permissions"):
        return "permissions_with_fixture"
    return "default_add_column"


def dispatch_contract_proof(contract: dict[str, Any], cfg: PgConfig, db: str, handler_name: str | None = None) -> dict[str, Any]:
    name = handler_name or handler_for_contract(contract)
    handler = REGISTRY.get(name)
    if handler is None:
        return {"pass": False, "contract_id": contract.get("contract_id"), "reason": f"unknown handler {name}"}
    result = handler(contract, cfg, db)
    result["handler"] = name
    return result


def dispatch_all_contracts(contracts: list[dict[str, Any]], cfg: PgConfig, db_prefix: str) -> list[dict[str, Any]]:
    proofs = []
    for idx, contract in enumerate(contracts):
        db = f"{db_prefix}_{idx}"
        proofs.append(dispatch_contract_proof(contract, cfg, db))
    return proofs
