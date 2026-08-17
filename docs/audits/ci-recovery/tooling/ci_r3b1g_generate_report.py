#!/usr/bin/env python3
"""Generate CI-R3B1G final report from machine evidence."""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
DATA = REPO / "docs/audits/ci-recovery/data"
OUT = REPO / "docs/audits/ci-recovery/ci-r3b1g-tire-status-repair-full-replay-2026-08.md"


def load(name: str) -> dict:
    return json.loads((DATA / name).read_text())


def main() -> int:
    norm = load("ci-r3b1g-r3b1f111-evidence-normalization-2026-08.json")
    order = load("ci-r3b1g-migration-order-proof-2026-08.json")
    equiv = load("ci-r3b1g-generated-sql-equivalence-2026-08.json")
    targeted = load("ci-r3b1g-targeted-tire-repair-proof-2026-08.json")
    full = load("ci-r3b1g-full-fresh-replay-result-2026-08.json")
    mig_manifest = load("ci-r3b1g-tire-repair-migration-manifest-2026-08.json")
    immut = load("ci-r3b1g-immutability-audit-2026-08.json")
    branch = subprocess.check_output(["git", "branch", "--show-current"], cwd=REPO, text=True).strip()
    head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=REPO, text=True).strip()
    parity = full.get("r3b_parity", {})
    status = full.get("final_status", "UNKNOWN")

    blocker = ""
    if status.endswith("PARTIAL") or status.endswith("FAILED"):
        blocker = f"""
## Full replay blocker

| Field | Value |
|-------|-------|
| First failing migration | `{full.get('first_failed_migration')}` |
| Failure ordinal | {full.get('failure_ordinal')} |
| SQLSTATE | {full.get('sqlstate')} |
| Classification | {full.get('failure_classification')} |
| Last applied migration | `{full.get('last_applied_migration')}` |
"""

    report = f"""# CI-R3B1G — Tire Status Predecessor Repair & Full Replay

**Phase:** R3B1G  
**Repository:** FATIHS-MGCKS/SYNQDRIVE-alpha  
**Branch:** `{branch}`  
**Status:** `{status}`

---

## Baseline

| Field | Value |
|-------|-------|
| Branch | `{branch}` |
| PRE_R3B1G_SHA | `{head}` |
| Base R3B1F.1.1 SHA | `{norm.get('R3B1F111_REMOTE_HEAD')}` |
| Production exposure | **E_UNKNOWN** |

---

## One authorized repair

| Field | Value |
|-------|-------|
| Relation | `vehicle_tire_setups` |
| Column | `status` |
| Type | `TireSetupStatus` |
| Nullable | false |
| Default | ACTIVE |
| Migration | `{mig_manifest.get('migration')}` |
| SQL SHA-256 | `{mig_manifest.get('sha256')}` |
| Boundary after | `{order.get('authorized_after')}` |
| Boundary before | `{order.get('authorized_before')}` |
| Contract equivalence | {equiv.get('semantic_equivalence')} |
| IF NOT EXISTS | {equiv.get('if_not_exists_present')} |

---

## Targeted proof

| Check | Result |
|-------|--------|
| Pre-repair replay to Slot 13 | {'PASS' if targeted.get('pre_repair_replay', {}).get('last_applied') == order.get('authorized_after') else 'FAIL'} |
| status absent before repair | {'PASS' if not targeted.get('pre_repair_catalog', {}).get('status_exists') else 'FAIL'} |
| Actual repair migration | {targeted.get('repair_execution')} |
| Post-repair catalog parity | {'PASS' if targeted.get('post_repair_catalog_parity', {}).get('pass') else 'FAIL'} |
| Migration 157 | {targeted.get('consumer_execution')} |
| vehicle_tire_setups partial index | {targeted.get('partial_indexes', {}).get('vehicle_tire_setups_one_active_setup_per_vehicle')} |
| tires partial index | {targeted.get('partial_indexes', {}).get('tires_one_active_tire_per_setup_position')} |

---

## Full replay

| Field | Value |
|-------|-------|
| Migration directories | {full.get('migration_directories')} |
| Normal migrations applied | {full.get('normal_migrations_applied')} |
| Special migrations | {full.get('special_migrations_handled')} |
| Failed migrations | {full.get('failed_migrations')} |
| Manual interventions | {full.get('manual_operator_interventions', full.get('manual_interventions', 0))} |
| Last successful | `{full.get('last_applied_migration')}` |
| HEAD reached | {full.get('reached_absolute_migration_head')} |
| R3B1G repair applied | {full.get('tire_runtime', {}).get('r3b1g_repair_applied')} |
| Migration 157 applied | {full.get('tire_runtime', {}).get('migration_157_applied')} |

{blocker}

## Final convergence

| Gate | Result |
|------|--------|
| 19/19 objects | {parity.get('authority_objects_present', 'NOT_REACHED')}/{parity.get('authority_objects_total', 19)} |
| 9/9 tables | {parity.get('tables_pass', 'NOT_REACHED')} |
| 10/10 enums | {parity.get('enums_pass', 'NOT_REACHED')} |
| 54/54 properties | {parity.get('property_categories_matched', 'NOT_REACHED')}/{parity.get('property_categories_total', 54)} |
| Parity pass | {parity.get('pass')} |

---

## Immutability

| Check | Result |
|-------|--------|
| Preexisting migration SQL modified | {immut.get('preexisting_migration_sql_modified')} |
| New migration directories | {immut.get('new_prisma_migration_directories')} |
| schema.prisma changed | {'YES' if immut.get('schema_prisma_changed') else 'NO'} |
| runtime changed | {'YES' if immut.get('runtime_code_changed') else 'NO'} |

---

## Safety

- Production DDL/DML: **NO**
- Deployment: **NO**
- Merge: **NO**
- R3B.2: **NO**
- Full fresh replay executed: **YES**

---

## Final status

**{status}**
"""
    OUT.write_text(report)
    print(f"Wrote {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
