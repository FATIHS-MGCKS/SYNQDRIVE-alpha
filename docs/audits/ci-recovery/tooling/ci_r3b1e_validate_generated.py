#!/usr/bin/env python3
"""Static validation, migration order proof, and SQL equivalence for R3B1E migrations."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1b_compile_repair_sql import compile_slot  # noqa: E402
from ci_r3b1e_constants import (  # noqa: E402
    DATA,
    MIG_ROOT,
    REMAINING_CONTRACTS,
    REPO,
    SLOT_MIGRATIONS,
    TARGET_MIGRATION,
    TARGET_SHA,
    TOPOLOGY,
    VENDOR_CONTRACTS,
)
from replay_evidence_lib import audit_transaction_sensitive_migrations, migration_dirs, sha256_file, special_migration_hash_status  # noqa: E402

OUT_ORDER = DATA / "ci-r3b1e-migration-order-proof-2026-08.json"
OUT_EQUIV = DATA / "ci-r3b1e-generated-sql-equivalence-2026-08.json"
PRE_MANIFEST = DATA / "ci-r3b1e-preexisting-migration-sha-manifest-2026-08.json"

FORBIDDEN = re.compile(r"\b(DROP TABLE|DROP TYPE|DROP COLUMN|TRUNCATE|DELETE FROM)\b", re.I)


def load_contracts() -> dict[str, dict]:
    vendor = json.loads(VENDOR_CONTRACTS.read_text())
    remaining = json.loads(REMAINING_CONTRACTS.read_text())
    by_obj = {c["object"]: c for c in vendor["contracts"]}
    by_obj.update({c["object"]: c for c in remaining["contracts"]})
    return by_obj


def count_statements(sql: str) -> int:
    chunks = [c.strip() for c in re.split(r";\s*(?:\n|$)", sql) if c.strip() and not c.strip().startswith("--")]
    return len(chunks)


def order_proof(topology: dict) -> list[dict]:
    dirs = migration_dirs()
    rows = []
    for slot in topology["slots"]:
        if slot["slot"] < 7 or slot["slot"] > 16:
            continue
        mig = SLOT_MIGRATIONS[slot["slot"]]
        idx = dirs.index(mig)
        prev_mig = dirs[idx - 1] if idx > 0 else None
        next_mig = dirs[idx + 1] if idx + 1 < len(dirs) else None
        rows.append(
            {
                "slot": slot["slot"],
                "new_migration": mig,
                "previous_migration": prev_mig,
                "next_migration": next_mig,
                "authorized_after": slot["after_migration"],
                "authorized_before": slot["before_migration"],
                "lexical_order_valid": prev_mig == slot["after_migration"] and next_mig == slot["before_migration"],
            }
        )
    return rows


def equivalence_proof(topology: dict, contracts: dict) -> list[dict]:
    rows = []
    for slot in topology["slots"]:
        if slot["slot"] < 7 or slot["slot"] > 16:
            continue
        slot_no = slot["slot"]
        mig = SLOT_MIGRATIONS[slot_no]
        path = MIG_ROOT / mig / "migration.sql"
        generated = path.read_text()
        authority = compile_slot(slot, contracts)
        same = generated == authority
        rows.append(
            {
                "slot": slot_no,
                "migration_path": str(path.relative_to(REPO)),
                "authority_action_count": len(slot.get("actions", [])),
                "generated_statement_count": count_statements(generated),
                "semantic_equivalence": same,
                "differences": [] if same else ["byte-level mismatch vs compile_slot authority output"],
            }
        )
    return rows


def slot_special_checks(slot_no: int, sql: str) -> list[str]:
    issues = []
    if slot_no == 8:
        if sql.count('CREATE TYPE "WorkflowStatus"') + sql.count("CREATE TYPE WorkflowStatus") != 1:
            if len(re.findall(r'CREATE TYPE\s+"?WorkflowStatus"?', sql)) != 1:
                issues.append("WorkflowStatus CREATE count != 1")
        if "'{\"type\":\"organization\"}'::jsonb" not in sql and '\'{"type":"organization"}\'::jsonb' not in sql:
            issues.append("org_workflows.scope JSONB default missing or wrong")
    if slot_no == 10:
        if "vehicle_damage_images_damage_id_fkey" not in sql:
            issues.append("damage FK constraint missing")
    if FORBIDDEN.search(sql):
        issues.append("forbidden destructive SQL detected")
    return issues


def preexisting_immutability() -> dict:
    pre = json.loads(PRE_MANIFEST.read_text())["files"]
    post = {str(p.relative_to(REPO)): sha256_file(p) for p in sorted(MIG_ROOT.glob("*/migration.sql"))}
    modified = []
    deleted = []
    for rel, pre_hash in pre.items():
        if rel not in post:
            deleted.append(rel)
        elif post[rel] != pre_hash:
            modified.append(rel)
    new_paths = sorted(set(post) - set(pre))
    expected_new = {f"backend/prisma/migrations/{SLOT_MIGRATIONS[s]}/migration.sql" for s in range(7, 17)}
    unexpected_new = [p for p in new_paths if p not in expected_new]
    return {
        "modified_preexisting_migrations": len(modified),
        "deleted_preexisting_migrations": len(deleted),
        "renamed_preexisting_migrations": 0,
        "new_migration_paths": sorted(expected_new),
        "unexpected_new_paths": unexpected_new,
        "modified": modified,
        "pass": not modified and not deleted and not unexpected_new,
    }


def main() -> int:
    topology = json.loads(TOPOLOGY.read_text())
    contracts = load_contracts()
    order = order_proof(topology)
    equiv = equivalence_proof(topology, contracts)
    immut = preexisting_immutability()
    special = special_migration_hash_status()
    target_path = MIG_ROOT / TARGET_MIGRATION / "migration.sql"
    target_match = sha256_file(target_path) == TARGET_SHA

    static_issues = []
    for slot in topology["slots"]:
        if slot["slot"] < 7 or slot["slot"] > 16:
            continue
        sql = (MIG_ROOT / SLOT_MIGRATIONS[slot["slot"]] / "migration.sql").read_text()
        static_issues.extend(f"slot{slot['slot']}:{i}" for i in slot_special_checks(slot["slot"], sql))

    tx_audit = audit_transaction_sensitive_migrations()
    new_mig_names = set(SLOT_MIGRATIONS.values())
    new_tx = [r for r in tx_audit["records"] if r["migration"] in new_mig_names and r["classification"] == "SPECIAL_EXECUTION_REQUIRED"]

    OUT_ORDER.write_text(json.dumps({"schema_version": 1, "slots": order, "all_valid": all(r["lexical_order_valid"] for r in order)}, indent=2) + "\n")
    OUT_EQUIV.write_text(
        json.dumps(
            {
                "schema_version": 1,
                "records": equiv,
                "all_semantic_equivalent": all(r["semantic_equivalence"] for r in equiv),
            },
            indent=2,
        )
        + "\n"
    )

    ok = (
        all(r["lexical_order_valid"] for r in order)
        and all(r["semantic_equivalence"] for r in equiv)
        and immut["pass"]
        and special["match"]
        and target_match
        and not static_issues
        and not new_tx
        and tx_audit["unresolved_count"] == 0
    )
    result = {
        "order_valid": all(r["lexical_order_valid"] for r in order),
        "equivalence_valid": all(r["semantic_equivalence"] for r in equiv),
        "immutability": immut,
        "composite_index_hash_match": special["match"],
        "target_hash_match": target_match,
        "static_issues": static_issues,
        "new_transaction_sensitive": new_tx,
        "transaction_audit_unresolved": tx_audit["unresolved_count"],
        "pass": ok,
    }
    print(json.dumps(result, indent=2))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
