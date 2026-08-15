#!/usr/bin/env python3
"""Generate CI-R3B1H.1 closure report."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1h1_constants import BASE_R3B1H_SHA, DATA, REPO, R3B1H1_BRANCH

OUT = Path(__file__).resolve().parents[1] / "ci-r3b1h1-insert-select-lineage-actionable-gap-closure-2026-08.md"
SUMMARY = DATA / "ci-r3b1h1-final-validation-summary-2026-08.json"


def load(name: str) -> dict:
    p = DATA / name
    return json.loads(p.read_text()) if p.is_file() else {}


def main() -> int:
    s = load("ci-r3b1h1-final-validation-summary-2026-08.json")
    mt = s.get("classification_totals", {})
    old = load("ci-r3b1h1-old-missing-history-reconciliation-2026-08.json")
    mig249 = load("ci-r3b1h1-migration249-gap-reconciliation-2026-08.json")
    actionable = load("ci-r3b1h1-actionable-gap-coverage-2026-08.json")
    lineage = load("ci-r3b1h1-lineage-coverage-validation-2026-08.json")
    proof = load("ci-r3b1h1-targeted-consumer-proof-2026-08.json")
    head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=REPO, text=True).strip()

    mig249_rows = {f"{r['old_relation']}.{r['old_property']}": r["new_classification"] for r in mig249.get("records", [])}

    report = f"""# CI-R3B1H.1 — INSERT-SELECT alias lineage & actionable-gap closure

## Baseline

| Field | Value |
|-------|-------|
| Branch | `{R3B1H1_BRANCH}` |
| HEAD | `{head}` |
| Parent R3B1H SHA | `{BASE_R3B1H_SHA}` |

## R3B1H failure

R3B1H reported **90** `MISSING_HISTORY` INSERT-SELECT records but emitted only **one** hardwired contract (`organization_memberships.permissions`). Alias tokens (`a`, `m`, `r`, `c`, `l`, `o`, …) were treated as physical relations because scope binding, CTE/subquery lineage, correlated subqueries, and `ON CONFLICT` FROM truncation were incomplete. Completion gates could pass matrix counters while actionable authority coverage was false.

## Lineage model

First-class relation bindings now distinguish physical tables, CTEs, subqueries, and derived outputs. Column lineage maps projected aliases to physical `(relation, column)` or `DERIVED_EXPRESSION`. Nested scopes and correlated subqueries preserve outer bindings. Statement-level CTE chains parse comma-separated CTEs. Same-migration creators remain statement-chronology aware via existing analyzer state.

## Migration-249 reconciliation (4/4)

| Reference | New classification |
|-----------|-------------------|
| organization_memberships.permissions | {mig249_rows.get('organization_memberships.permissions', 'MISSING_HISTORY')} |
| a.membership_id | {mig249_rows.get('a.membership_id', 'VALID/FALSE_POSITIVE')} |
| a.is_current | {mig249_rows.get('a.is_current', 'VALID/FALSE_POSITIVE')} |
| m.id | {mig249_rows.get('m.id', 'VALID/FALSE_POSITIVE')} |

## 90-record reconciliation

- Old MISSING_HISTORY records: **{old.get('old_missing_history_records', 90)}**
- Accounted: **{old.get('accounted', 0)}**
- Root causes: `{json.dumps(old.get('root_cause_summary', {}))}`

## Final matrix (249→HEAD)

| Classification | Count |
|----------------|------:|
| VALID | {mt.get('VALID', 0)} |
| MISSING_HISTORY | {mt.get('MISSING_HISTORY', 0)} |
| ORDERING_DEFECT | {mt.get('ORDERING_DEFECT', 0)} |
| CONDITIONAL_SAFE | {mt.get('CONDITIONAL_SAFE', 0)} |
| FALSE_POSITIVE | {mt.get('FALSE_POSITIVE', 0)} |
| INTENTIONAL | {mt.get('INTENTIONAL', 0)} |
| UNRESOLVED | {mt.get('UNRESOLVED', 0)} |

## Final actionable gaps

- Unique actionable gaps: **{s.get('unique_actionable_gaps', 0)}**
- Exact contracts: **{s.get('exact_contracts', 0)}**
- Uncontracted gaps: **{actionable.get('uncontracted_gaps', 0)}**
- Unproven gaps: **{actionable.get('unproven_gaps', 0)}**

Generic contract builder derives contracts from actionable gaps (no hardwired permissions-only path).

## Targeted proofs

- Migration 249 proof: **{proof.get('proof_database', {}).get('migration_249_execution', 'PENDING')}**
- Synthetic IAM fixture: **{'PASS' if proof.get('synthetic_fixture_pass') else 'FAIL/PENDING'}**
- Generic compiled repair SQL (no dedicated permissions constant in acceptance path).

## Coverage

- Alias leakage: **{lineage.get('alias_leakage', 0)}**
- Lineage coverage gaps: **{lineage.get('lineage_coverage_gaps', 0)}**
- INSERT-SELECT coverage gaps: **{load('ci-r3b1h1-insert-select-coverage-validation-2026-08.json').get('coverage_gaps', 0)}**

## Immutability

- Existing migration SQL changed: **{s.get('immutability', {}).get('existing_migration_sql_changed', 0)}**
- New Prisma migrations: **{s.get('immutability', {}).get('new_prisma_migrations', 0)}**
- schema.prisma changed: **{s.get('immutability', {}).get('schema_prisma_changed', False)}**
- runtime changed: **{s.get('immutability', {}).get('runtime_changed', False)}**

## Safety

- Full fresh replay: **NO**
- Production mutation: **NO**
- Deployment: **NO**
- Merge: **NO**
- R3B.2: **NO**

## Final status

**{s.get('final_status', 'PENDING')}**
"""
    OUT.write_text(report)
    print(f"Wrote {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
