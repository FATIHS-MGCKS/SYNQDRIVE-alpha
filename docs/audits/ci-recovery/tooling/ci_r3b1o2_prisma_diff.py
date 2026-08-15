"""Prisma diff runner and classification for CI-R3B1O.2."""
from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path
from typing import Any

from ci_r3b1m_constants import BACKEND, DATA, sha256_text
from ci_r3b1o1_constants import FROZEN_DIFF_SQL
from ci_r3b1o2_diff_classifier import classify_with_baselines, parse_sql_script


def run_prisma_diff(db_name: str, *, host: str = "127.0.0.1", port: str = "5432") -> dict[str, Any]:
    env = os.environ.copy()
    env["DATABASE_URL"] = f"postgresql://synqdrive:synqdrive@{host}:{port}/{db_name}"
    proc = subprocess.run(
        [
            "npx",
            "prisma",
            "migrate",
            "diff",
            "--from-url",
            env["DATABASE_URL"],
            "--to-schema-datamodel",
            "prisma/schema.prisma",
            "--script",
        ],
        cwd=BACKEND,
        capture_output=True,
        text=True,
        env=env,
    )
    stdout = proc.stdout or ""
    return {
        "database": db_name,
        "exit_code": proc.returncode,
        "stdout": stdout,
        "stderr": proc.stderr or "",
        "script": stdout.strip(),
        "script_sha256": sha256_text(stdout),
        "line_count": len(stdout.strip().splitlines()) if stdout.strip() else 0,
        "diff_empty": not stdout.strip() or "empty migration" in stdout.lower(),
    }


def build_final_prisma_diff_analysis(
    *,
    golden_db: str,
    final_db: str,
    schema_dump: Path | None,
    sql_out: Path,
    json_out: Path,
    host: str = "127.0.0.1",
    port: str = "5432",
) -> dict[str, Any]:
    from ci_r3b1o2_r3b_authority import build_owner_maps

    owners = build_owner_maps(schema_dump=schema_dump)
    golden_diff = run_prisma_diff(golden_db, host=host, port=port)
    final_diff = run_prisma_diff(final_db, host=host, port=port)
    sql_out.write_text(final_diff["script"] + ("\n" if final_diff["script"] else ""))

    golden_class = classify_with_baselines(golden_diff["script"], label="golden_baseline", golden_script=FROZEN_DIFF_SQL.read_text(), owners=owners)
    final_class = classify_with_baselines(
        final_diff["script"],
        label="final_winning_twin",
        golden_script=golden_diff["script"],
        owners=owners,
    )

    index_ops = [o for o in final_class["operations"] if o.get("operation_family") == "ALTER INDEX"]
    owner_resolved = sum(1 for o in index_ops if o.get("owner_resolution") != "OWNER_UNKNOWN")

    out = {
        "schema_version": 1,
        "phase": "CI-R3B1O.2",
        "golden_database": golden_db,
        "final_database": final_db,
        "final_diff": final_diff,
        "classification": {
            "golden_baseline": {k: golden_class[k] for k in ("total_operations", "R3B_SCOPE", "M252_SCOPE", "PRE_EXISTING_PRODUCTION_DRIFT", "OUT_OF_SCOPE", "NEW_STRATEGY_DRIFT", "UNRESOLVED")},
            "final_winning_twin": {k: final_class[k] for k in ("total_operations", "R3B_SCOPE", "M252_SCOPE", "PRE_EXISTING_PRODUCTION_DRIFT", "OUT_OF_SCOPE", "NEW_STRATEGY_DRIFT", "UNRESOLVED")},
        },
        "index_owner_stats": {
            "alter_index_operations": len(index_ops),
            "owner_resolved": owner_resolved,
            "owner_unknown": len(index_ops) - owner_resolved,
        },
        "pass": final_class["pass"],
    }
    json_out.write_text(json.dumps(out, indent=2) + "\n")
    return out


def m252_rename_absent(script: str) -> dict[str, Any]:
    from ci_r3b1o1_constants import M252_TABLE
    from ci_r3b1o2_constants import M252_CANONICAL

    checks = {}
    for key, canonical in M252_CANONICAL.items():
        present = any(canonical in line and "RENAME" in line.upper() for line in script.splitlines())
        checks[key] = {"canonical": canonical, "rename_present": present, "pass": not present}
    out = {
        "schema_version": 1,
        "phase": "CI-R3B1O.2",
        "table": M252_TABLE,
        "checks": checks,
        "pass": all(v["pass"] for v in checks.values()),
    }
    return out
