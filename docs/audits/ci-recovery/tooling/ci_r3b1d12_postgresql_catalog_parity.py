#!/usr/bin/env python3
"""CI-R3B1D.1.2 cumulative PostgreSQL execution + full catalog-definition parity."""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1b_compile_repair_sql import compile_slot  # noqa: E402
from ci_r3b1b_sql_literal_compiler import parse_json_semantic_value  # noqa: E402
from ci_r3b1d11_executable_ddl_proof import build_pre_slot7_fixture_sql, extract_sqlstate, load_contracts  # noqa: E402
from ci_r3b1d12_catalog_compare import compare_expected_to_actual, summarize_mismatches  # noqa: E402
from ci_r3b1d12_expected_catalog import build_cumulative_expected  # noqa: E402
from ci_r3b1d12_pg_catalog_reader import read_actual_catalog  # noqa: E402
from replay_evidence_lib import PgConfig, psql, recreate_db  # noqa: E402

REPO = Path(__file__).resolve().parents[4]
DATA = REPO / "docs/audits/ci-recovery/data"
TOPOLOGY = DATA / "ci-r3b1d1-post-vendor-repair-topology-2026-08.json"
OUT = DATA / "ci-r3b1d12-postgresql-catalog-parity-2026-08.json"


def pg_version(cfg: PgConfig, db: str) -> str:
    proc = psql(cfg, db, "SHOW server_version;", tuples_only=True)
    return proc.stdout.strip() if proc.returncode == 0 else "unknown"


def count_expected_objects(expected) -> int:
    return (
        len(expected.types)
        + len(expected.sequences)
        + len(expected.tables)
        + sum(len(v) for v in expected.columns.values())
        + len(expected.primary_keys)
        + len(expected.unique_constraints)
        + len(expected.foreign_keys)
        + len(expected.indexes)
    )


def slot8_special_proof(cfg: PgConfig, db: str, contracts: dict[str, dict]) -> dict[str, Any]:
    scope_col = next(c for c in contracts["org_workflows"]["columns"] if c["column"] == "scope")
    proc = psql(
        cfg,
        db,
        "SELECT format_type(a.atttypid, a.atttypmod), CASE WHEN a.attnotnull THEN 'NO' ELSE 'YES' END, pg_get_expr(ad.adbin, ad.adrelid) "
        "FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid LEFT JOIN pg_attrdef ad ON ad.adrelid=a.attrelid AND ad.adnum=a.attnum "
        "WHERE c.relname='org_workflows' AND a.attname='scope';",
        tuples_only=True,
    )
    parts = proc.stdout.strip().split("|") if proc.returncode == 0 else []
    default_sem = None
    if len(parts) >= 3 and parts[2]:
        val_proc = psql(cfg, db, f"SELECT ({parts[2]})::text;", tuples_only=True)
        if val_proc.returncode == 0:
            default_sem = json.loads(val_proc.stdout.strip())
    ws_labels_proc = psql(
        cfg,
        db,
        "SELECT string_agg(e.enumlabel, '|' ORDER BY e.enumsortorder) FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='WorkflowStatus';",
        tuples_only=True,
    )
    ws_labels = ws_labels_proc.stdout.strip().split("|") if ws_labels_proc.stdout.strip() else []
    authority_labels = contracts["WorkflowStatus"]["labels"]
    return {
        "table": "org_workflows",
        "column": "scope",
        "type": parts[0] if parts else None,
        "nullable": parts[1] if len(parts) > 1 else None,
        "default_semantic_json": default_sem,
        "expected_semantic_json": parse_json_semantic_value(scope_col),
        "workflowstatus_label_count_authority": len(authority_labels),
        "workflowstatus_labels_match": ws_labels == authority_labels,
        "pass": parts[0] == "jsonb"
        and default_sem == parse_json_semantic_value(scope_col)
        and ws_labels == authority_labels,
    }


def slot10_special_proof(cfg: PgConfig, db: str) -> dict[str, Any]:
    proc = psql(
        cfg,
        db,
        """
        SELECT con.conname, rel.relname,
               (SELECT string_agg(att.attname, '|' ORDER BY u.ord) FROM unnest(con.conkey) WITH ORDINALITY AS u(attnum, ord) JOIN pg_attribute att ON att.attrelid=con.conrelid AND att.attnum=u.attnum),
               frel.relname,
               (SELECT string_agg(att.attname, '|' ORDER BY u.ord) FROM unnest(con.confkey) WITH ORDINALITY AS u(attnum, ord) JOIN pg_attribute att ON att.attrelid=con.confrelid AND att.attnum=u.attnum),
               con.confdeltype, con.confupdtype
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid=con.conrelid
        JOIN pg_class frel ON frel.oid=con.confrelid
        WHERE con.conname='vehicle_damage_images_damage_id_fkey';
        """,
        tuples_only=True,
    )
    parts = proc.stdout.strip().split("|") if proc.returncode == 0 and proc.stdout.strip() else []
    pk_proc = psql(
        cfg,
        db,
        "SELECT con.conname FROM pg_constraint con JOIN pg_class rel ON rel.oid=con.conrelid WHERE rel.relname='vehicle_damages' AND con.contype='p';",
        tuples_only=True,
    )
    return {
        "constraint": "vehicle_damage_images_damage_id_fkey",
        "exists": bool(parts),
        "local_table": parts[1] if len(parts) > 1 else None,
        "local_columns": parts[2].split("|") if len(parts) > 2 and parts[2] else [],
        "referenced_table": parts[3] if len(parts) > 3 else None,
        "referenced_columns": parts[4].split("|") if len(parts) > 4 and parts[4] else [],
        "on_delete": {"c": "CASCADE", "a": "NO ACTION", "r": "RESTRICT", "n": "SET NULL", "d": "SET DEFAULT"}.get(parts[5] if len(parts) > 5 else "", parts[5] if len(parts) > 5 else None),
        "on_update": {"c": "CASCADE", "a": "NO ACTION", "r": "RESTRICT", "n": "SET NULL", "d": "SET DEFAULT"}.get(parts[6] if len(parts) > 6 else "", parts[6] if len(parts) > 6 else None),
        "referenced_pk_exists": bool(pk_proc.stdout.strip()),
        "pass": len(parts) >= 7
        and parts[1] == "vehicle_damage_images"
        and parts[2] == "damage_id"
        and parts[3] == "vehicle_damages"
        and parts[4] == "id"
        and bool(pk_proc.stdout.strip()),
    }


def main() -> int:
    cfg = PgConfig()
    db = sys.argv[1] if len(sys.argv) > 1 else "synqdrive_r3b1d12_catalog_parity"
    contracts = load_contracts()
    topo = json.loads(TOPOLOGY.read_text())
    expected_by_slot = build_cumulative_expected(topo, contracts)

    recreate_db(cfg, db)
    fixture_path = Path("/tmp/ci_r3b1d12_pre_slot7_fixture.sql")
    fixture_path.write_text(build_pre_slot7_fixture_sql(contracts))
    fixture_proc = psql(cfg, db, "", file=fixture_path)
    if fixture_proc.returncode != 0:
        raise RuntimeError(fixture_proc.stderr or fixture_proc.stdout)

    per_slot: list[dict[str, Any]] = []
    all_mismatches = []
    execution_fail = False

    for slot_no in range(7, 17):
        slot = next(s for s in topo["slots"] if s["slot"] == slot_no)
        sql = compile_slot(slot, contracts)
        path = Path(f"/tmp/ci_r3b1d12_slot{slot_no}.sql")
        path.write_text(sql)
        proc = psql(cfg, db, "", file=path)
        exec_status = "PASS" if proc.returncode == 0 else "FAIL"
        if exec_status == "FAIL":
            execution_fail = True
        expected = expected_by_slot[slot_no]
        actual = read_actual_catalog(cfg, db)
        mismatches = compare_expected_to_actual(expected, actual, slot=slot_no)
        all_mismatches.extend(mismatches)
        per_slot.append(
            {
                "slot": slot_no,
                "execution": exec_status,
                "sqlstate": extract_sqlstate(proc.stderr or proc.stdout or "") if exec_status == "FAIL" else None,
                "catalog_expected_count": count_expected_objects(expected),
                "catalog_matched_count": count_expected_objects(expected) - len(mismatches),
                "mismatch_count": len(mismatches),
                "mismatches": [m.as_dict() for m in mismatches[:20]],
            }
        )
        if exec_status == "FAIL" or mismatches:
            break

    category_counts = summarize_mismatches(all_mismatches)
    out = {
        "schema_version": 1,
        "phase": "CI-R3B1D.1.2",
        "postgresql_version": pg_version(cfg, db),
        "slots_tested": len(per_slot),
        "expected_objects_total": count_expected_objects(expected_by_slot[16]),
        "actual_matched_objects": count_expected_objects(expected_by_slot[16]) - category_counts["total"],
        "mismatch_records": [m.as_dict() for m in all_mismatches],
        "category_counters": category_counts,
        "per_slot": per_slot,
        "slot8_special_proof": slot8_special_proof(cfg, db, contracts) if not execution_fail else {"pass": False},
        "slot10_special_proof": slot10_special_proof(cfg, db) if not execution_fail else {"pass": False},
        "fk_definitions_expected": len(expected_by_slot[16].foreign_keys),
        "fk_definitions_matched": len(expected_by_slot[16].foreign_keys) - category_counts.get("foreign_key", 0),
        "fk_definition_mismatches": category_counts.get("foreign_key", 0),
        "pass": not execution_fail and category_counts["total"] == 0,
    }
    OUT.write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps({"pass": out["pass"], "total_mismatches": category_counts["total"]}, indent=2))
    return 0 if out["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
