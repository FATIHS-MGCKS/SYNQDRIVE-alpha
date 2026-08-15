#!/usr/bin/env python3
"""Targeted PostgreSQL execution of the ten real R3B1E migration.sql files + catalog parity."""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1d11_executable_ddl_proof import build_pre_slot7_fixture_sql, extract_sqlstate, load_contracts  # noqa: E402
from ci_r3b1d12_catalog_compare import compare_expected_to_actual, summarize_mismatches  # noqa: E402
from ci_r3b1d12_expected_catalog import build_cumulative_expected  # noqa: E402
from ci_r3b1d12_pg_catalog_reader import read_actual_catalog  # noqa: E402
from ci_r3b1d12_postgresql_catalog_parity import count_expected_objects, slot10_special_proof, slot8_special_proof  # noqa: E402
from ci_r3b1e_constants import DATA, MIG_ROOT, SLOT_MIGRATIONS, TOPOLOGY  # noqa: E402
from replay_evidence_lib import PgConfig, psql, recreate_db  # noqa: E402

OUT = DATA / "ci-r3b1e-targeted-migration-proof-2026-08.json"


def main() -> int:
    cfg = PgConfig()
    db = sys.argv[1] if len(sys.argv) > 1 else "synqdrive_r3b1e_targeted"
    topology = json.loads(TOPOLOGY.read_text())
    contracts = load_contracts()
    expected_by_slot = build_cumulative_expected(topology, contracts)

    recreate_db(cfg, db)
    fixture_path = Path("/tmp/ci_r3b1e_pre_slot7_fixture.sql")
    fixture_path.write_text(build_pre_slot7_fixture_sql(contracts))
    proc = psql(cfg, db, "", file=fixture_path)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr or proc.stdout)

    per_slot = []
    all_mismatches = []
    execution_fail = False

    for slot_no in range(7, 17):
        mig = SLOT_MIGRATIONS[slot_no]
        mig_path = MIG_ROOT / mig / "migration.sql"
        proc = psql(cfg, db, "", file=mig_path)
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
                "migration": mig,
                "execution": exec_status,
                "sqlstate": extract_sqlstate(proc.stderr or proc.stdout or "") if exec_status == "FAIL" else None,
                "catalog_mismatch_count": len(mismatches),
            }
        )
        if exec_status == "FAIL" or mismatches:
            break

    cat = summarize_mismatches(all_mismatches)
    pg_version_proc = psql(cfg, db, "SHOW server_version;", tuples_only=True)
    out = {
        "schema_version": 1,
        "phase": "CI-R3B1E",
        "postgresql_version": pg_version_proc.stdout.strip() if pg_version_proc.returncode == 0 else "unknown",
        "database": db,
        "per_slot": per_slot,
        "category_counters": cat,
        "expected_objects_total": count_expected_objects(expected_by_slot[16]),
        "actual_matched_objects": count_expected_objects(expected_by_slot[16]) - cat.get("total", 0),
        "slot8_special_proof": slot8_special_proof(cfg, db, contracts) if not execution_fail else {"pass": False},
        "slot10_special_proof": slot10_special_proof(cfg, db) if not execution_fail else {"pass": False},
        "pass": not execution_fail and cat.get("total", 0) == 0,
    }
    OUT.write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps({"pass": out["pass"], "total_mismatches": cat.get("total", 0)}, indent=2))
    return 0 if out["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
