#!/usr/bin/env python3
"""Optional disposable SQL simulation for graph-validated repair slots 8 and 10."""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1b_compile_repair_sql import compile_slot  # noqa: E402
from replay_evidence_lib import PgConfig, psql, recreate_db  # noqa: E402

REPO = Path(__file__).resolve().parents[4]
DATA = REPO / "docs/audits/ci-recovery/data"
TOPOLOGY = DATA / "ci-r3b1d1-post-vendor-repair-topology-2026-08.json"
VENDOR_CONTRACTS = DATA / "ci-r3b1d-vendor-predecessor-ddl-contracts-2026-08.json"
REMAINING_CONTRACTS = DATA / "ci-r3b1d-remaining-predecessor-ddl-contracts-2026-08.json"
OUT = DATA / "ci-r3b1d1-slot-sql-simulation-2026-08.json"


def load_contracts() -> dict[str, dict]:
    vendor = json.loads(VENDOR_CONTRACTS.read_text())
    remaining = json.loads(REMAINING_CONTRACTS.read_text())
    by_obj = {c["object"]: c for c in vendor["contracts"]}
    by_obj.update({c["object"]: c for c in remaining["contracts"]})
    return by_obj


def minimal_preexisting_sql() -> str:
    return """
CREATE TABLE IF NOT EXISTS "organizations" ("id" TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS "vehicles" ("id" TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS "vehicle_tire_setups" ("id" TEXT PRIMARY KEY);
"""


def run_slot(cfg: PgConfig, db: str, slot: dict, contracts: dict[str, dict]) -> dict:
    sql = minimal_preexisting_sql() + "\n" + compile_slot(slot, contracts)
    path = Path(f"/tmp/ci_r3b1d1_slot{slot['slot']}.sql")
    path.write_text(sql)
    proc = psql(cfg, db, "", file=path)
    return {"slot": slot["slot"], "pass": proc.returncode == 0, "stderr": (proc.stderr or proc.stdout)[-500:]}


def main() -> int:
    cfg = PgConfig()
    db = sys.argv[1] if len(sys.argv) > 1 else "synqdrive_r3b1d1_topo_sim"
    recreate_db(cfg, db)
    psql(cfg, db, minimal_preexisting_sql())

    contracts = load_contracts()
    topo = json.loads(TOPOLOGY.read_text())
    results = []
    for slot_no in (8, 10):
        slot = next(s for s in topo["slots"] if s["slot"] == slot_no)
        results.append(run_slot(cfg, db, slot, contracts))

    out = {"disposable": True, "production_connection": False, "results": results, "pass": all(r["pass"] for r in results)}
    OUT.write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps(out, indent=2))
    return 0 if out["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
