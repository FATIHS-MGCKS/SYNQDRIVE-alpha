"""Prisma diff capture and classification for CI-R3B1O.1."""
from __future__ import annotations

import hashlib
import json
import os
import subprocess
from pathlib import Path
from typing import Any

from ci_r3b1m_constants import BACKEND, DATA, REPO, sha256_text
from ci_r3b1m_scope_classifier import classify_statements, parse_sql_script
from ci_r3b1m_r3b_authority import build_owner_maps
from ci_r3b1o1_constants import FROZEN_DIFF_SQL, M252_TABLE


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


def _normalize_sql(sql: str) -> str:
    return " ".join(sql.lower().split())


def classify_diff_script(script: str, *, label: str) -> dict[str, Any]:
    statements = parse_sql_script(script) if script.strip() else []
    owners = build_owner_maps()
    base = classify_statements(statements, owners)
    operations = []
    for op in base["operations"]:
        raw = op["raw_sql"]
        m252_scope = M252_TABLE in raw
        operations.append({**op, "m252_related": m252_scope})
    r3b = sum(1 for o in operations if o["classification"] == "R3B_SCOPE")
    m252 = sum(1 for o in operations if o["m252_related"])
    unresolved = sum(1 for o in operations if o["classification"] == "UNRESOLVED")
    out_scope = sum(1 for o in operations if o["classification"] == "OUT_OF_SCOPE")
    return {
        "label": label,
        "total_operations": len(operations),
        "R3B_SCOPE": r3b,
        "M252_SCOPE": m252,
        "OUT_OF_SCOPE": out_scope,
        "UNRESOLVED": unresolved,
        "operations": operations,
    }


def build_final_prisma_diff_analysis(*, golden_db: str, final_db: str, sql_out: Path, json_out: Path, host: str = "127.0.0.1", port: str = "5432") -> dict[str, Any]:
    golden_diff = run_prisma_diff(golden_db, host=host, port=port)
    final_diff = run_prisma_diff(final_db, host=host, port=port)
    sql_out.write_text(final_diff["script"] + ("\n" if final_diff["script"] else ""))
    golden_class = classify_diff_script(golden_diff["script"], label="golden_baseline")
    final_class = classify_diff_script(final_diff["script"], label="final_winning_twin")
    frozen_pre = FROZEN_DIFF_SQL.read_text() if FROZEN_DIFF_SQL.exists() else ""
    frozen_class = classify_diff_script(frozen_pre, label="frozen_production_baseline")

    golden_sqls = {_normalize_sql(o["raw_sql"]) for o in golden_class["operations"]}
    new_ops = [o for o in final_class["operations"] if _normalize_sql(o["raw_sql"]) not in golden_sqls]
    pre_existing = [o for o in final_class["operations"] if _normalize_sql(o["raw_sql"]) in golden_sqls]

    m252_new = [o for o in new_ops if o["m252_related"]]
    planned_deploy = [o for o in new_ops if not o["m252_related"]]
    new_strategy_drift = [o for o in planned_deploy if o["classification"] == "R3B_SCOPE"]
    new_unresolved = final_class["UNRESOLVED"] - golden_class["UNRESOLVED"]

    out = {
        "schema_version": 1,
        "phase": "CI-R3B1O.1",
        "golden_database": golden_db,
        "final_database": final_db,
        "final_diff": final_diff,
        "golden_diff_script_sha256": golden_diff["script_sha256"],
        "final_diff_script_sha256": final_diff["script_sha256"],
        "classification": {
            "golden_baseline": {k: golden_class[k] for k in ("total_operations", "R3B_SCOPE", "M252_SCOPE", "OUT_OF_SCOPE", "UNRESOLVED")},
            "final_winning_twin": {k: final_class[k] for k in ("total_operations", "R3B_SCOPE", "M252_SCOPE", "OUT_OF_SCOPE", "UNRESOLVED")},
            "frozen_production_baseline": {k: frozen_class[k] for k in ("total_operations", "R3B_SCOPE", "M252_SCOPE", "OUT_OF_SCOPE", "UNRESOLVED")},
            "PRE_EXISTING_PRODUCTION_DRIFT": len(pre_existing),
            "NEW_STRATEGY_DRIFT": len(new_strategy_drift),
            "M252_FORWARD_SCOPE": len(m252_new),
            "PLANNED_DEPLOY_TO_HEAD_SCOPE": len(planned_deploy) - len(new_strategy_drift),
            "NEW_UNRESOLVED": new_unresolved,
        },
        "new_strategy_drift_operations": new_strategy_drift,
        "m252_forward_operations": m252_new,
        "pass": (
            final_class["R3B_SCOPE"] == 0
            and len(new_strategy_drift) == 0
            and new_unresolved == 0
        ),
    }
    json_out.write_text(json.dumps(out, indent=2) + "\n")
    return out
