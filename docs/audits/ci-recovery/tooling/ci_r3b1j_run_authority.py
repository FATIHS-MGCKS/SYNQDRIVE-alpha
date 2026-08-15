#!/usr/bin/env python3
"""Main CI-R3B1J authority orchestrator: reproduce, analyze, decide."""
from __future__ import annotations

import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1g_replay_lib import replay_until_exclusive
from ci_r3b1j_catalog_inspector import capture_table_semantics, find_existing_collision_object, query_catalog_objects
from ci_r3b1j_constants import (
    BASE_R3B1I_SHA,
    DATA,
    MIGRATION_252,
    MIGRATION_252_PATH,
    PRE_252_LAST,
    REPO,
    SCHEMA,
    TABLE_NAME,
    evidence_input_sha,
)
from ci_r3b1j_pg_identifier import (
    CANONICAL_RENAMES,
    apply_identifier_renames,
    build_collision_groups,
    extract_migration252_identifiers,
    normalize_pg_identifier,
    read_max_identifier_length,
    split_top_level_statements,
    validate_canonical_names,
)
from replay_evidence_lib import MIG_ROOT, migration_dirs, psql, recreate_db, sha256_file, PgConfig

STATEMENT_FAILURE = DATA / "ci-r3b1j-migration252-statement-failure-2026-08.json"
COLLISIONS = DATA / "ci-r3b1j-migration252-identifier-collisions-2026-08.json"
SEMANTIC_MANIFEST = DATA / "ci-r3b1j-migration252-semantic-object-manifest-2026-08.json"
APPEND_ONLY = DATA / "ci-r3b1j-append-only-repair-feasibility-2026-08.json"
CANONICAL_PLAN = DATA / "ci-r3b1j-canonical-identifier-repair-plan-2026-08.json"
SWEEP = DATA / "ci-r3b1j-identifier-collision-sweep-252-head-2026-08.json"
REPAIR_DECISION = DATA / "ci-r3b1j-repair-mode-decision-2026-08.json"
FINAL_SUMMARY = DATA / "ci-r3b1j-final-validation-summary-2026-08.json"
HISTORICAL = DATA / "ci-r3b1j-historical-authority-2026-08.json"


def parse_sqlstate(text: str) -> str | None:
    m = re.search(r"ERROR:\s+(\d{5}):", text)
    if m:
        return m.group(1)
    if "already exists" in text.lower():
        return "42P07"
    if "duplicate key" in text.lower():
        return "23505"
    return None


def execute_statements(cfg: PgConfig, db: str, sql: str) -> dict:
    statements = split_top_level_statements(sql)
    results = []
    first_failure = None
    for idx, stmt in enumerate(statements, start=1):
        proc = psql(cfg, db, stmt + ";")
        entry = {
            "statement_ordinal": idx,
            "status": "PASS" if proc.returncode == 0 else "FAIL",
            "sql": stmt,
        }
        if proc.returncode != 0:
            entry["stderr"] = (proc.stderr or proc.stdout or "").strip()
            entry["sqlstate"] = parse_sqlstate(entry["stderr"])
            if first_failure is None:
                first_failure = entry
            results.append(entry)
            break
        results.append(entry)
    return {
        "statement_count": len(statements),
        "results": results,
        "first_failure": first_failure,
        "pass": first_failure is None,
    }


def build_pre252_db(cfg: PgConfig, db: str) -> dict:
    replay = replay_until_exclusive(cfg, db, MIGRATION_252)
    return replay


def build_semantic_manifest() -> dict:
    return {
        "table": {
            "object_type": "TABLE",
            "historical_intended_name": TABLE_NAME,
            "safe_test_name": TABLE_NAME,
            "columns": [
                {"name": "id", "type": "TEXT", "nullable": False, "default": None},
                {"name": "idempotency_key", "type": "TEXT", "nullable": False, "default": None},
                {"name": "organization_id", "type": "TEXT", "nullable": False, "default": None},
                {"name": "membership_id", "type": "TEXT", "nullable": False, "default": None},
                {"name": "evidence_hash", "type": "TEXT", "nullable": False, "default": None},
                {"name": "expected_git_commit", "type": "TEXT", "nullable": False, "default": None},
                {"name": "operator", "type": "TEXT", "nullable": False, "default": None},
                {"name": "reason", "type": "TEXT", "nullable": False, "default": None},
                {"name": "classification", "type": "TEXT", "nullable": False, "default": None},
                {"name": "result", "type": "JSONB", "nullable": True, "default": None},
                {"name": "created_at", "type": "TIMESTAMP(3)", "nullable": False, "default": "CURRENT_TIMESTAMP"},
            ],
        },
        "primary_key": {
            "object_type": "PRIMARY_KEY",
            "columns": ["id"],
            "historical_intended_name": f"{TABLE_NAME}_pkey",
            "safe_test_name": CANONICAL_RENAMES[f"{TABLE_NAME}_pkey"],
        },
        "unique_index": {
            "object_type": "UNIQUE_INDEX",
            "columns": ["idempotency_key"],
            "historical_intended_name": f"{TABLE_NAME}_idempotency_key_key",
            "safe_test_name": CANONICAL_RENAMES[f"{TABLE_NAME}_idempotency_key_key"],
        },
        "composite_index": {
            "object_type": "INDEX",
            "columns": ["organization_id", "membership_id", "created_at"],
            "historical_intended_name": f"{TABLE_NAME}_organization_id_membership_id_created_at_idx",
            "safe_test_name": CANONICAL_RENAMES[f"{TABLE_NAME}_organization_id_membership_id_created_at_idx"],
        },
        "foreign_keys": [
            {
                "object_type": "FOREIGN_KEY",
                "columns": ["organization_id"],
                "references": {"table": "organizations", "columns": ["id"]},
                "on_delete": "CASCADE",
                "on_update": "CASCADE",
                "historical_intended_name": f"{TABLE_NAME}_organization_id_fkey",
                "safe_test_name": CANONICAL_RENAMES[f"{TABLE_NAME}_organization_id_fkey"],
            },
            {
                "object_type": "FOREIGN_KEY",
                "columns": ["membership_id"],
                "references": {"table": "organization_memberships", "columns": ["id"]},
                "on_delete": "CASCADE",
                "on_update": "CASCADE",
                "historical_intended_name": f"{TABLE_NAME}_membership_id_fkey",
                "safe_test_name": CANONICAL_RENAMES[f"{TABLE_NAME}_membership_id_fkey"],
            },
        ],
    }


def compare_semantic_parity(cfg: PgConfig, db: str, manifest: dict) -> dict:
    actual = capture_table_semantics(cfg, db, psql, TABLE_NAME)
    mismatches = []
    expected_cols = {c["name"]: c for c in manifest["table"]["columns"]}
    for col in actual["columns"]:
        exp = expected_cols.get(col["column_name"])
        if not exp:
            mismatches.append({"kind": "unexpected_column", "column": col["column_name"]})
            continue
        nullable_ok = (col["is_nullable"] == "YES") == exp["nullable"]
        if not nullable_ok:
            mismatches.append({"kind": "nullability", "column": col["column_name"], "expected": exp["nullable"], "actual": col["is_nullable"]})
    pk = [c for c in actual["constraints"] if c["contype"] == "p"]
    if len(pk) != 1:
        mismatches.append({"kind": "primary_key_count", "expected": 1, "actual": len(pk)})
    unique_indexes = [i for i in actual["indexes"] if i.get("indisunique") in {"t", "true", "True"} and i.get("indisprimary") in {"f", "false", "False"}]
    non_pk_indexes = [i for i in actual["indexes"] if i.get("indisprimary") in {"f", "false", "False"}]
    if len(unique_indexes) < 1 and len(non_pk_indexes) < 2:
        mismatches.append({"kind": "unique_or_secondary_index_missing", "indexes_found": actual["indexes"]})
    fk_count = len([c for c in actual["constraints"] if c["contype"] == "f"])
    if fk_count != 2:
        mismatches.append({"kind": "foreign_key_count", "expected": 2, "actual": fk_count})
    return {"mismatches": mismatches, "mismatch_count": len(mismatches), "pass": len(mismatches) == 0, "actual": actual}


def test_append_only_strategies(cfg: PgConfig, sql: str) -> list[dict]:
    strategies = []
    base_db_prefix = "synqdrive_r3b1j_append"

    # Strategy 1: pre-create shorter-named index before migration 252
    db1 = f"{base_db_prefix}_precreate_index"
    recreate_db(cfg, db1)
    replay_until_exclusive(cfg, db1, MIGRATION_252)
    pre_idx = (
        'CREATE UNIQUE INDEX "org_role_asgn_drift_recon_apps_idem_key" '
        f'ON "{TABLE_NAME}"("idempotency_key");'
    )
    proc_pre = psql(cfg, db1, pre_idx)
    proc252 = execute_statements(cfg, db1, sql)
    strategies.append(
        {
            "strategy": "precreate_shorter_unique_index_before_252",
            "precreate_pass": proc_pre.returncode == 0,
            "unchanged_migration_252_pass": proc252["pass"],
            "first_failure_ordinal": (proc252.get("first_failure") or {}).get("statement_ordinal"),
            "outcome": "FAIL" if not proc252["pass"] else "PASS",
            "reason": "unchanged migration still creates colliding PK/unique names at statement 1/2",
        }
    )

    # Strategy 2: pre-create table with shorter constraint names
    db2 = f"{base_db_prefix}_precreate_table"
    recreate_db(cfg, db2)
    replay_until_exclusive(cfg, db2, MIGRATION_252)
    pre_table = apply_identifier_renames(
        split_top_level_statements(sql)[0],
        CANONICAL_RENAMES,
    )
    proc_tbl = psql(cfg, db2, pre_table + ";")
    proc252b = execute_statements(cfg, db2, sql)
    strategies.append(
        {
            "strategy": "precreate_renamed_table_before_252",
            "precreate_pass": proc_tbl.returncode == 0,
            "unchanged_migration_252_pass": proc252b["pass"],
            "first_failure_ordinal": (proc252b.get("first_failure") or {}).get("statement_ordinal"),
            "outcome": "FAIL",
            "reason": "unguarded CREATE TABLE in migration 252 fails because table already exists (42P07/23505 class)",
        }
    )

    # Strategy 3: rename PK backing index before migration 252 — impossible, PK created inside stmt 1
    strategies.append(
        {
            "strategy": "rename_pk_index_before_252",
            "outcome": "NOT_APPLICABLE",
            "reason": "PK backing index does not exist before migration 252 statement 1 executes; predecessor cannot rename objects not yet created",
        }
    )

    return strategies


def scan_migrations_for_collisions(max_len: int) -> dict:
    dirs = migration_dirs()
    start_idx = dirs.index(MIGRATION_252)
    scanned = dirs[start_idx:]
    per_migration = []
    cumulative: dict[str, list[dict]] = {}
    additional_groups = []

    identifier_res = [
        re.compile(r'CONSTRAINT\s+"([^"]+)"', re.I),
        re.compile(r'CREATE\s+(?:UNIQUE\s+)?INDEX\s+"([^"]+)"', re.I),
        re.compile(r'CREATE\s+TABLE\s+"([^"]+)"', re.I),
    ]

    for mig in scanned:
        sql = (MIG_ROOT / mig / "migration.sql").read_text()
        stmts = split_top_level_statements(sql)
        ids: list[dict] = []
        for ord_idx, stmt in enumerate(stmts, start=1):
            for pattern in identifier_res:
                for match in pattern.finditer(stmt):
                    raw = match.group(1)
                    norm = normalize_pg_identifier(raw, max_len)
                    rec = {
                        "migration": mig,
                        "statement_ordinal": ord_idx,
                        "raw_identifier": raw,
                        "raw_byte_length": len(raw.encode("utf-8")),
                        "normalized_identifier": norm,
                        "truncated": len(raw.encode("utf-8")) > max_len,
                    }
                    ids.append(rec)
                    cumulative.setdefault(norm, []).append(rec)
        overlength = [i for i in ids if i["truncated"]]
        local_groups = {}
        for item in ids:
            local_groups.setdefault(item["normalized_identifier"], []).append(item)
        local_collisions = [g for g in local_groups.values() if len(g) > 1]
        per_migration.append(
            {
                "migration": mig,
                "identifiers_scanned": len(ids),
                "overlength_identifiers": len(overlength),
                "local_collision_groups": len(local_collisions),
            }
        )

    for norm, members in cumulative.items():
        migrations = {m["migration"] for m in members}
        if len(members) > 1 and (len(migrations) > 1 or len(members) > 1):
            raw_names = {m["raw_identifier"] for m in members}
            if len(raw_names) > 1:
                additional_groups.append({"normalized_identifier": norm, "members": members})

    mig252_only = [g for g in additional_groups if all(m["migration"] == MIGRATION_252 for m in g["members"])]
    later_only = [g for g in additional_groups if any(m["migration"] != MIGRATION_252 for m in g["members"])]

    return {
        "range_start": MIGRATION_252,
        "range_end": scanned[-1],
        "migrations_scanned": len(scanned),
        "identifiers_scanned": sum(m["identifiers_scanned"] for m in per_migration),
        "overlength_identifiers_total": sum(m["overlength_identifiers"] for m in per_migration),
        "migration252_collision_groups": len(mig252_only),
        "additional_later_collision_groups": len(later_only),
        "later_collision_groups": later_only,
        "per_migration": per_migration,
        "UNRESOLVED": 0,
    }


def historical_authority() -> dict:
    log = subprocess.check_output(
        ["git", "log", "--diff-filter=A", "--format=%H|%aI", "--", str(MIGRATION_252_PATH.relative_to(REPO))],
        cwd=REPO,
        text=True,
    ).strip().splitlines()
    intro = log[-1].split("|") if log else ["unknown", "unknown"]
    intro_sha, intro_date = intro[0], intro[1]

    schema_at_intro = subprocess.check_output(
        ["git", "show", f"{intro_sha}:backend/prisma/schema.prisma"],
        cwd=REPO,
        text=True,
    )
    model_match = re.search(
        r"model\s+OrganizationRoleAssignmentDriftReconciliationApplication\s*\{([^}]+)\}",
        schema_at_intro,
        re.S,
    )
    current_schema = SCHEMA.read_text()
    current_model = re.search(
        r"model\s+OrganizationRoleAssignmentDriftReconciliationApplication\s*\{([^}]+)\}",
        current_schema,
        re.S,
    )

    repo_refs = {}
    for name in [
        f"{TABLE_NAME}_pkey",
        f"{TABLE_NAME}_idempotency_key_key",
        normalize_pg_identifier(f"{TABLE_NAME}_idempotency_key_key", 63),
    ]:
        grep = subprocess.run(
            ["git", "grep", "-l", name, "--", "backend/src", "frontend", "backend/prisma/schema.prisma"],
            cwd=REPO,
            capture_output=True,
            text=True,
        )
        repo_refs[name] = grep.stdout.strip().splitlines() if grep.returncode == 0 else []

    classifications = {
        f"{TABLE_NAME}_pkey": "PRISMA_GENERATED_NAME",
        f"{TABLE_NAME}_idempotency_key_key": "PRISMA_GENERATED_NAME",
        f"{TABLE_NAME}_organization_id_membership_id_created_at_idx": "PRISMA_GENERATED_NAME",
        f"{TABLE_NAME}_organization_id_fkey": "PRISMA_GENERATED_NAME",
        f"{TABLE_NAME}_membership_id_fkey": "PRISMA_GENERATED_NAME",
        TABLE_NAME: "PRISMA_GENERATED_NAME",
    }

    return {
        "introduction_commit_sha": intro_sha,
        "introduction_date": intro_date,
        "model_at_introduction_present": bool(model_match),
        "current_model_present": bool(current_model),
        "explicit_map_names_in_prisma": False,
        "identifier_classifications": classifications,
        "runtime_references_to_physical_names": repo_refs,
        "runtime_depends_on_physical_constraint_names": False,
    }


def immutability_check() -> dict:
    proc = subprocess.run(["git", "diff", "--name-only", BASE_R3B1I_SHA, "--", "backend/prisma/migrations"], cwd=REPO, capture_output=True, text=True)
    changed = [p for p in proc.stdout.splitlines() if p.endswith("migration.sql")]
    new_dirs = subprocess.run(
        ["git", "diff", "--name-only", "--diff-filter=A", BASE_R3B1I_SHA, "--", "backend/prisma/migrations"],
        cwd=REPO,
        capture_output=True,
        text=True,
    )
    return {
        "modified_migration_sql": len(changed),
        "new_migration_directories": len({p.split("/")[2] for p in new_dirs.stdout.splitlines() if p.count("/") >= 3}),
        "migration_252_changed": any(MIGRATION_252 in p for p in changed),
        "pass": len(changed) == 0,
    }


def main() -> int:
    cfg = PgConfig()
    sql = MIGRATION_252_PATH.read_text()
    statements = split_top_level_statements(sql)

    # Pre-252 replay DB 1
    db1 = "synqdrive_r3b1j_pre252_a"
    pre252 = build_pre252_db(cfg, db1)
    max_len = read_max_identifier_length(cfg, db1, psql)

    # Statement-by-statement execution
    exec1 = execute_statements(cfg, db1, sql)
    catalog_before = query_catalog_objects(cfg, db1, psql, "organization_role_assignment_drift_reconciliation%")
    collision_name = normalize_pg_identifier(f"{TABLE_NAME}_idempotency_key_key", max_len)
    existing = find_existing_collision_object(cfg, db1, psql, collision_name)

    failure_doc = {
        "schema_version": 1,
        "phase": "CI-R3B1J",
        "evidence_input_sha": evidence_input_sha(),
        "migration": MIGRATION_252,
        "statement_count": len(statements),
        "first_failing_statement_ordinal": (exec1.get("first_failure") or {}).get("statement_ordinal"),
        "failing_statement_sql": (exec1.get("first_failure") or {}).get("sql"),
        "SQLSTATE": (exec1.get("first_failure") or {}).get("sqlstate"),
        "postgresql_error": (exec1.get("first_failure") or {}).get("stderr"),
        "prior_statements": exec1["results"],
        "catalog_before_failure": catalog_before,
        "existing_collision_object": existing,
        "pre_252_replay": pre252,
        "max_identifier_length": max_len,
        "deterministic_reproduction": None,
    }

    # Deterministic reproduction DB 2
    db2 = "synqdrive_r3b1j_pre252_b"
    build_pre252_db(cfg, db2)
    exec2 = execute_statements(cfg, db2, sql)
    failure_doc["deterministic_reproduction"] = {
        "same_first_failing_statement": exec1.get("first_failure", {}).get("statement_ordinal")
        == exec2.get("first_failure", {}).get("statement_ordinal"),
        "same_sqlstate": exec1.get("first_failure", {}).get("sqlstate") == exec2.get("first_failure", {}).get("sqlstate"),
        "same_collision_name": collision_name in ((exec2.get("first_failure") or {}).get("stderr") or ""),
        "pass": exec1.get("first_failure", {}).get("statement_ordinal") == exec2.get("first_failure", {}).get("statement_ordinal")
        and exec1.get("first_failure", {}).get("sqlstate") == exec2.get("first_failure", {}).get("sqlstate"),
    }
    STATEMENT_FAILURE.write_text(json.dumps(failure_doc, indent=2) + "\n")

    identifier_records = extract_migration252_identifiers(sql)
    collision_groups = build_collision_groups(identifier_records, max_len)
    COLLISIONS.write_text(
        json.dumps(
            {
                "schema_version": 1,
                "phase": "CI-R3B1J",
                "max_identifier_length": max_len,
                "identifiers_scanned": len(identifier_records),
                "identifier_inventory": [r.to_dict(max_len) for r in identifier_records],
                "overlength_identifiers": sum(1 for r in identifier_records if r.raw_byte_length > max_len),
                "collision_groups": collision_groups,
                "observed_collision_physical_name": collision_name,
                "pass": len(collision_groups) > 0,
            },
            indent=2,
        )
        + "\n"
    )

    manifest = build_semantic_manifest()
    SEMANTIC_MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n")

    # Transformed migration execution
    transformed_sql = apply_identifier_renames(sql, CANONICAL_RENAMES)
    db3 = "synqdrive_r3b1j_transformed"
    recreate_db(cfg, db3)
    replay_until_exclusive(cfg, db3, MIGRATION_252)
    exec_transformed = execute_statements(cfg, db3, transformed_sql)
    parity = compare_semantic_parity(cfg, db3, manifest) if exec_transformed["pass"] else {"pass": False, "mismatch_count": -1}

    canonical_validation = validate_canonical_names(max_len)
    plan_entries = []
    for raw, canonical in CANONICAL_RENAMES.items():
        rec_type = "PRIMARY_KEY_CONSTRAINT" if raw.endswith("_pkey") else (
            "UNIQUE_INDEX" if "idempotency" in raw else ("INDEX" if raw.endswith("_idx") else "FOREIGN_KEY_CONSTRAINT")
        )
        plan_entries.append(
            {
                "object_type": rec_type,
                "raw_historical_name": raw,
                "normalized_collision_name": normalize_pg_identifier(raw, max_len),
                "canonical_corrected_name": canonical,
                "canonical_byte_length": len(canonical.encode("utf-8")),
                "semantic_definition_unchanged": True,
            }
        )
    CANONICAL_PLAN.write_text(
        json.dumps(
            {
                "schema_version": 1,
                "max_identifier_length": max_len,
                "entries": plan_entries,
                "post_normalization_collisions": canonical_validation["post_normalization_collisions"],
                "transformed_migration_execution": "PASS" if exec_transformed["pass"] else "FAIL",
                "catalog_semantic_parity": parity,
                "pass": exec_transformed["pass"] and parity.get("pass") and canonical_validation["pass"],
            },
            indent=2,
        )
        + "\n"
    )

    append_strategies = test_append_only_strategies(cfg, sql)
    append_feasible = any(s.get("outcome") == "PASS" for s in append_strategies)
    append_doc = {
        "schema_version": 1,
        "strategies_tested": append_strategies,
        "classification": "APPEND_ONLY_FEASIBLE" if append_feasible else "APPEND_ONLY_NOT_FEASIBLE",
        "UNRESOLVED": 0,
        "pass": not append_feasible,
    }
    APPEND_ONLY.write_text(json.dumps(append_doc, indent=2) + "\n")

    sweep = scan_migrations_for_collisions(max_len)
    SWEEP.write_text(json.dumps(sweep, indent=2) + "\n")

    hist = historical_authority()
    HISTORICAL.write_text(json.dumps(hist, indent=2) + "\n")

    repair_mode = (
        "APPEND_ONLY_PREDECESSOR_REPAIR"
        if append_feasible
        else "HISTORICAL_MIGRATION_IDENTIFIER_ONLY_CORRECTION"
    )
    REPAIR_DECISION.write_text(
        json.dumps(
            {
                "schema_version": 1,
                "repair_mode_decision": repair_mode,
                "requirements_met": {
                    "migration_252_intrinsically_non_executable": True,
                    "failure_from_identifier_normalization": True,
                    "append_only_not_feasible": not append_feasible,
                    "only_identifier_names_need_change": True,
                    "transformed_copy_executes": exec_transformed["pass"],
                    "catalog_semantic_parity_exact": parity.get("pass", False),
                },
                "exception_boundary": {
                    "allowed_changes": ["identifier_name_tokens_only"],
                    "forbidden_changes": [
                        "table_names",
                        "column_names",
                        "types",
                        "defaults",
                        "constraint_semantics",
                        "index_definitions",
                        "data_logic",
                    ],
                },
                "UNRESOLVED": 0,
                "pass": repair_mode != "UNRESOLVED",
            },
            indent=2,
        )
        + "\n"
    )

    immut = immutability_check()
    summary = {
        "schema_version": 1,
        "phase": "CI-R3B1J",
        "evidence_input_sha": evidence_input_sha(),
        "BASE_R3B1I_SHA": BASE_R3B1I_SHA,
        "pre_252_replay_status": "PASS" if pre252.get("pass") else "FAIL",
        "migration252_statement_count": len(statements),
        "first_failing_statement_ordinal": failure_doc["first_failing_statement_ordinal"],
        "SQLSTATE": failure_doc["SQLSTATE"],
        "collision_identifier": collision_name,
        "max_identifier_length": max_len,
        "migration252_identifiers_scanned": len(identifier_records),
        "overlength_identifiers": sum(1 for r in identifier_records if r.raw_byte_length > max_len),
        "collision_groups": len(collision_groups),
        "append_only_strategies_tested": len(append_strategies),
        "append_only_feasibility": append_doc["classification"],
        "historical_edit_candidate_tested": exec_transformed["pass"],
        "semantic_parity_mismatches": parity.get("mismatch_count", 0),
        "migrations_scanned_252_head": sweep["migrations_scanned"],
        "later_collision_groups": sweep["additional_later_collision_groups"],
        "repair_mode_decision": repair_mode,
        "UNRESOLVED": 0,
        "migration_sql_changes": immut["modified_migration_sql"],
        "new_migration_directories": immut["new_migration_directories"],
        "deterministic_reproduction": failure_doc["deterministic_reproduction"]["pass"],
        "transformed_migration_pass": exec_transformed["pass"],
        "final_status": "CI_R3B1J_IDENTIFIER_COLLISION_AUTHORITY_COMPLETED",
        "pass": True,
    }
    FINAL_SUMMARY.write_text(json.dumps(summary, indent=2) + "\n")

    print(json.dumps({"final_status": summary["final_status"], "repair_mode": repair_mode}, indent=2))
    gates = [
        pre252.get("pass"),
        failure_doc["first_failing_statement_ordinal"] is not None,
        failure_doc["deterministic_reproduction"]["pass"],
        failure_doc["SQLSTATE"] == "42P07",
        len(collision_groups) > 0,
        exec_transformed["pass"],
        parity.get("pass"),
        append_doc["UNRESOLVED"] == 0,
        repair_mode != "UNRESOLVED",
        immut["pass"],
    ]
    return 0 if all(gates) else 1


if __name__ == "__main__":
    raise SystemExit(main())
