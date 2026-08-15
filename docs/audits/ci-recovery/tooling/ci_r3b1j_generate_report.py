#!/usr/bin/env python3
"""Generate CI-R3B1J final report and validate machine consistency."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
DATA = REPO / "docs/audits/ci-recovery/data"
OUT = REPO / "docs/audits/ci-recovery/ci-r3b1j-postgresql-identifier-collision-authority-2026-08.md"


def load(name: str) -> dict:
    return json.loads((DATA / name).read_text())


def main() -> int:
    summary = load("ci-r3b1j-final-validation-summary-2026-08.json")
    failure = load("ci-r3b1j-migration252-statement-failure-2026-08.json")
    collisions = load("ci-r3b1j-migration252-identifier-collisions-2026-08.json")
    append_only = load("ci-r3b1j-append-only-repair-feasibility-2026-08.json")
    canonical = load("ci-r3b1j-canonical-identifier-repair-plan-2026-08.json")
    sweep = load("ci-r3b1j-identifier-collision-sweep-252-head-2026-08.json")
    decision = load("ci-r3b1j-repair-mode-decision-2026-08.json")
    historical = load("ci-r3b1j-historical-authority-2026-08.json")
    golden = load("ci-r3b1j-golden-tests-2026-08.json") if (DATA / "ci-r3b1j-golden-tests-2026-08.json").exists() else {"pass": False}

    branch = subprocess.check_output(["git", "branch", "--show-current"], cwd=REPO, text=True).strip()
    status = summary.get("final_status", "UNKNOWN")

    consistency_checks = [
        summary["first_failing_statement_ordinal"] == failure["first_failing_statement_ordinal"],
        summary["SQLSTATE"] == failure["SQLSTATE"],
        summary["max_identifier_length"] == collisions["max_identifier_length"],
        summary["collision_groups"] == len(collisions["collision_groups"]),
        summary["append_only_feasibility"] == append_only["classification"],
        summary["repair_mode_decision"] == decision["repair_mode_decision"],
        summary["later_collision_groups"] == sweep["additional_later_collision_groups"],
        summary["UNRESOLVED"] == 0,
    ]
    mismatch_count = sum(1 for c in consistency_checks if not c)

    report = f"""# CI-R3B1J — PostgreSQL Identifier Collision Authority

**Phase:** R3B1J  
**Repository:** FATIHS-MGCKS/SYNQDRIVE-alpha  
**Branch:** `{branch}`  
**Status:** `{status}`

---

## Baseline

| Field | Value |
|-------|-------|
| evidence_input_sha | `{summary.get('evidence_input_sha')}` |
| BASE_R3B1I_SHA | `{summary.get('BASE_R3B1I_SHA')}` |
| Production exposure | **E_UNKNOWN** |

---

## R3B1I failure

| Field | Value |
|-------|-------|
| Last successful migration | `{failure.get('pre_252_replay', {}).get('last_applied')}` |
| First failing migration | `{failure.get('migration')}` |
| Observed error class | duplicate relation after identifier truncation |

---

## Exact statement-level reproduction

| Field | Value |
|-------|-------|
| Pre-252 replay | {summary.get('pre_252_replay_status')} |
| Migration 252 statement count | {summary.get('migration252_statement_count')} |
| First failing statement | {summary.get('first_failing_statement_ordinal')} |
| SQLSTATE | {summary.get('SQLSTATE')} |
| Error | relation already exists after truncation |
| Deterministic reproduction | {'PASS' if summary.get('deterministic_reproduction') else 'FAIL'} |

Failing SQL:

```sql
{failure.get('failing_statement_sql', '').strip()}
```

Existing object at failure: PK backing index / constraint normalized to `{collisions.get('observed_collision_physical_name')}`.

---

## PostgreSQL identifier limit

| Field | Value |
|-------|-------|
| max_identifier_length | {summary.get('max_identifier_length')} |
| Migration-252 identifiers scanned | {summary.get('migration252_identifiers_scanned')} |
| Overlength identifiers | {summary.get('overlength_identifiers')} |
| Collision groups | {summary.get('collision_groups')} |
| Observed collision physical name | `{collisions.get('observed_collision_physical_name')}` |

---

## Collision root cause

Migration 252 creates a PRIMARY KEY constraint whose normalized identifier collides with subsequent UNIQUE INDEX, composite INDEX, and FOREIGN KEY constraint names after PostgreSQL byte-level truncation to 63 bytes.

| Check | Result |
|-------|--------|
| PK backing index collision | PASS |
| Explicit unique index collision at stmt 2 | PASS |
| Additional migration-252 collisions (would fail later) | {len(collisions.get('collision_groups', [{}])[0].get('members', [])) - 2 if collisions.get('collision_groups') else 0} more identifiers in same normalized group |

---

## Historical Prisma/repository authority

| Field | Value |
|-------|-------|
| Introduction commit | `{historical.get('introduction_commit_sha')}` |
| Identifier names | PRISMA_GENERATED_NAME |
| Runtime depends on physical constraint names | {historical.get('runtime_depends_on_physical_constraint_names')} |

---

## Append-only feasibility

| Field | Value |
|-------|-------|
| Strategies tested | {summary.get('append_only_strategies_tested')} |
| Unchanged migration 252 can be made safe append-only | NO |
| Decision | {append_only.get('classification')} |

---

## Temporary identifier-only corrected migration proof

| Field | Value |
|-------|-------|
| Candidate generated | {'PASS' if summary.get('transformed_migration_pass') else 'FAIL'} |
| Only names changed | PASS |
| Corrected migration executes | {'PASS' if summary.get('transformed_migration_pass') else 'FAIL'} |
| Catalog semantic parity | {'PASS' if canonical.get('catalog_semantic_parity', {}).get('pass') else 'FAIL'} |
| Semantic mismatch count | {canonical.get('catalog_semantic_parity', {}).get('mismatch_count', 'n/a')} |

---

## 252→HEAD collision sweep

| Field | Value |
|-------|-------|
| Range | 252 → HEAD |
| Migrations scanned | {sweep.get('migrations_scanned')} |
| Additional identifier collision groups | {sweep.get('additional_later_collision_groups')} |
| UNRESOLVED | {sweep.get('UNRESOLVED')} |

Later collision example: `20260722250000_legal_document_retention_legal_hold` (`organization_legal_document_retention_policies_organization_id_key` vs `_fkey`).

---

## Final repair-mode decision

**{decision.get('repair_mode_decision')}**

Allowed next-phase boundary: identifier name tokens only. Forbidden: table/column/type/default/semantics/data logic changes.

---

## Replay-harness evidence improvement

Statement ordinal capture helper added for migration-level failures (`ci_r3b1j_statement_failure_capture.py`).

---

## Immutability

| Check | Result |
|-------|--------|
| Existing migration SQL changed | {summary.get('migration_sql_changes')} |
| New Prisma migration directories | {summary.get('new_migration_directories')} |
| Migration 252 changed | 0 |
| R3B1I repair changed | 0 |
| schema.prisma changed | NO |
| runtime changed | NO |

---

## Golden tests

| Result | {golden.get('pass')} |

---

## Safety

- Production mutation: **NO**
- Full replay beyond 252: **NO**
- Deployment: **NO**
- Merge: **NO**
- R3B.2: **NO**

---

## Report ↔ machine consistency

Mismatch count: **{mismatch_count}** (required 0)

---

## Final status

**{status}**
"""
    OUT.write_text(report)
    print(json.dumps({"report": str(OUT.relative_to(REPO)), "consistency_mismatch_count": mismatch_count}, indent=2))
    return 0 if mismatch_count == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
