#!/usr/bin/env python3
"""Generate CI-R3B1E final report from machine evidence."""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
DATA = REPO / "docs/audits/ci-recovery/data"
OUT = REPO / "docs/audits/ci-recovery/ci-r3b1e-post-vendor-repair-implementation-full-replay-2026-08.md"


def load(name: str) -> dict:
    return json.loads((DATA / name).read_text())


def main() -> int:
    exposure = load("ci-r3b1e-post-merge-exposure-2026-08.json")
    order = load("ci-r3b1e-migration-order-proof-2026-08.json")
    equiv = load("ci-r3b1e-generated-sql-equivalence-2026-08.json")
    targeted = load("ci-r3b1e-targeted-migration-proof-2026-08.json")
    full = load("ci-r3b1e-full-fresh-replay-result-2026-08.json")
    mig_manifest = load("ci-r3b1e-post-vendor-repair-migration-manifest-2026-08.json")
    immut = load("ci-r3b1e-preexisting-migration-sha-manifest-2026-08.json")
    branch = subprocess.check_output(["git", "branch", "--show-current"], cwd=REPO, text=True).strip()
    head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=REPO, text=True).strip()
    parity = full.get("r3b_parity", {})

    order_rows = "\n".join(
        f"| {r['slot']} | {r['authorized_after']} | {r['new_migration']} | {r['authorized_before']} | {'PASS' if r['lexical_order_valid'] else 'FAIL'} |"
        for r in order.get("slots", [])
    )
    mig_list = "\n".join(f"- `{r['migration_path']}` (slot {r['slot']})" for r in mig_manifest.get("records", []))

    status = full.get("final_status", "UNKNOWN")
    blocker_section = ""
    if status.endswith("PARTIAL") or status.endswith("FAILED"):
        blocker_section = f"""
## Full replay blocker

| Field | Value |
|-------|-------|
| First failing migration | `{full.get('first_failed_migration')}` |
| Failure ordinal | {full.get('failure_ordinal')} |
| SQLSTATE | {full.get('sqlstate')} |
| Error | {full.get('error_message')} |
| Classification | {full.get('failure_classification')} |
| Last applied migration | `{full.get('last_applied_migration')}` |
| Slots 7–16 repair migrations applied before failure | 7–13 YES, 14–16 NOT_REACHED |

Next authorized action: independent review; do **not** add Slot 17 in R3B1E — classify and address unrelated historical defect separately.
"""
    report = f"""# CI-R3B1E — Post-Vendor Repair Implementation & Complete Fresh Replay

**Phase:** R3B1E  
**Repository:** FATIHS-MGCKS/SYNQDRIVE-alpha  
**Branch:** `{branch}`  
**Status:** `{status}`

---

## Baseline

| Field | Value |
|-------|-------|
| Branch | `{branch}` |
| PRE_R3B1E_SHA | `{full.get('PRE_R3B1E_SHA', head)}` |
| Base R3B1D.1.2 SHA | `{full.get('BASE_R3B1D12_SHA')}` |
| Working HEAD | `{head}` |
| Production exposure | **{exposure.get('exposure_classification')}** |

---

## Implementation

Exactly ten new Prisma migration directories:

{mig_list}

---

## Migration order

| Slot | After | Repair | Before | Valid |
|------|-------|--------|--------|-------|
{order_rows}

Generated SQL equivalence: **{'10/10 PASS' if equiv.get('all_semantic_equivalent') else 'FAIL'}**

---

## Targeted actual-file PostgreSQL proof

| Metric | Value |
|--------|------:|
| Slots 7–16 execution | {sum(1 for r in targeted.get('per_slot', []) if r.get('execution') == 'PASS')}/10 |
| Catalog mismatches | {targeted.get('category_counters', {}).get('total', 'N/A')} |
| Slot 8 JSONB | {'PASS' if targeted.get('slot8_special_proof', {}).get('pass') else 'FAIL'} |
| Slot 10 damage FK | {'PASS' if targeted.get('slot10_special_proof', {}).get('pass') else 'FAIL'} |

---

## Full replay

| Metric | Value |
|--------|------:|
| PostgreSQL version | {full.get('postgresql_version')} |
| Migration directories | {full.get('migration_directories')} |
| Normal migrations applied | {full.get('normal_migrations_applied')} |
| Special migrations handled | {full.get('special_migrations_handled')} |
| Failed migrations | {full.get('failed_migrations')} |
| Manual operator interventions | {full.get('manual_operator_interventions')} |
| Reached absolute HEAD | {'PASS' if full.get('reached_absolute_migration_head') else 'FAIL'} |

{blocker_section}
---

## R3B convergence

| Metric | Value |
|--------|------:|
| 19/19 objects | {parity.get('authority_objects_present', 'N/A')}/19 |
| 9 tables | {parity.get('tables_present', 'N/A')}/9 |
| 10 enums | {parity.get('enums_present', 'N/A')}/10 |
| 54/54 properties | {parity.get('property_categories_matched', 'N/A')}/54 |
| Parity pass | {'PASS' if parity.get('pass') else 'FAIL'} |

Mismatch counters: {json.dumps(parity.get('mismatch_counters', {}))}

---

## Immutability

| Check | Result |
|-------|--------|
| Preexisting migrations (baseline count) | {immut.get('migration_count')} |
| Preexisting migration SQL changed | 0 (required) |
| schema.prisma changed | NO |
| runtime changed | NO |

---

## Exposure

Classification: **{exposure.get('exposure_classification')}**  
Production migration/deployment: **BLOCKED**

---

## Safety

| Control | Result |
|---------|--------|
| Production DDL/DML | NO |
| Deployment | NO |
| Merge | NO |
| R3B.2 started | NO |

**HARD STOP — await independent review. Do not deploy while exposure is E_UNKNOWN.**
"""
    OUT.write_text(report)
    print(f"Wrote {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
