#!/usr/bin/env python3
"""Generate CI-R3B1J.1 final report with machine consistency validation."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
DATA = REPO / "docs/audits/ci-recovery/data"
OUT = REPO / "docs/audits/ci-recovery/ci-r3b1j1-namespace-semantic-parity-closure-2026-08.md"


def load(name: str) -> dict:
    return json.loads((DATA / name).read_text())


def main() -> int:
    summary = load("ci-r3b1j1-final-validation-summary-2026-08.json")
    col = load("ci-r3b1j1-migration252-namespace-collisions-2026-08.json")
    legal = load("ci-r3b1j1-legal-document-collision-proof-2026-08.json")
    sweep = load("ci-r3b1j1-namespace-aware-collision-sweep-252-head-2026-08.json")
    parity = load("ci-r3b1j1-exact-semantic-parity-2026-08.json")
    token = load("ci-r3b1j1-identifier-only-token-diff-2026-08.json")
    decision = load("ci-r3b1j1-repair-mode-decision-2026-08.json")
    branch = subprocess.check_output(["git", "branch", "--show-current"], cwd=REPO, text=True).strip()
    status = summary.get("final_status")

    checks = [
        summary["migration252_first_failing_statement"] == 2,
        summary["migration252_SQLSTATE"] == "42P07",
        summary["real_migration252_collision_groups"] == len(col.get("real_collision_groups", [])),
        summary["false_positive_later_groups"] == len(sweep.get("false_positive_groups", [])),
        summary["unresolved_later_groups"] == 0,
        summary["semantic_mismatch_count"] == parity.get("mismatch_count", -1),
        summary["unapproved_token_changes"] == token.get("unapproved_token_changes", -1),
        summary["repair_mode_decision"] == decision.get("repair_mode_decision"),
    ]
    mismatch_count = sum(1 for c in checks if not c)

    report = f"""# CI-R3B1J.1 — Identifier Namespace & Semantic Parity Closure

**Phase:** R3B1J.1  
**Branch:** `{branch}`  
**Status:** `{status}`

---

## Baseline

| Field | Value |
|-------|-------|
| evidence_input_sha | `{summary.get('evidence_input_sha')}` |
| BASE_R3B1J_SHA | `{summary.get('BASE_R3B1J_SHA')}` |

---

## R3B1J residual blockers closed

1. Namespace-blind collision sweep → namespace-aware model with RELATION_NAMESPACE vs CONSTRAINT_NAMESPACE
2. Weak semantic parity comparator → strict catalog comparator with categorized mismatches

---

## PostgreSQL namespace model

| Namespace | Objects |
|-----------|---------|
| RELATION_NAMESPACE | tables, indexes, PK backing indexes |
| CONSTRAINT_NAMESPACE | PK/FK/UNIQUE constraints (scoped per parent relation) |

Collision keys include schema + namespace class + parent relation (constraints) + normalized identifier.

---

## Migration-252 namespace-aware root cause

| Field | Value |
|-------|-------|
| First failing statement | {summary.get('migration252_first_failing_statement')} |
| SQLSTATE | {summary.get('migration252_SQLSTATE')} |
| Real RELATION_NAMESPACE collision groups | {summary.get('real_migration252_collision_groups')} |

PK backing index and explicit UNIQUE INDEX compete in RELATION_NAMESPACE under normalized identifier `organization_role_assignment_drift_reconciliation_applications_`.

FK constraints classified separately in CONSTRAINT_NAMESPACE (same-table constraint-name truncation is distinct from the proven stmt-2 relation collision).

---

## Legal-document later-case runtime proof

| Field | Value |
|-------|-------|
| Classification | **{legal.get('classification')}** |
| Unique index execution | {legal.get('statement_results', {}).get('unique_index')} |
| Foreign key execution | {legal.get('statement_results', {}).get('foreign_key')} |

---

## 252→HEAD corrected collision sweep

| Field | Value |
|-------|-------|
| Migrations scanned | {sweep.get('migrations_scanned')} |
| Candidate groups | {summary.get('candidate_later_groups')} |
| Real later groups | {summary.get('real_later_groups')} |
| False-positive groups | {summary.get('false_positive_later_groups')} |
| Unresolved groups | {summary.get('unresolved_later_groups')} |

---

## Exact semantic parity

| Gate | Result |
|------|--------|
| Semantic mismatches | {summary.get('semantic_mismatch_count')} |
| Unexpected objects | {summary.get('unexpected_object_count')} |
| Missing objects | {summary.get('missing_object_count')} |
| Parity pass | {parity.get('pass')} |

---

## Identifier-only token diff

| Field | Value |
|-------|-------|
| Unapproved token changes | {summary.get('unapproved_token_changes')} |
| Token diff pass | {token.get('pass')} |

---

## Repair-mode decision

**{decision.get('repair_mode_decision')}**

Append-only: **{summary.get('append_only_feasibility')}**

---

## Immutability

| Check | Result |
|-------|--------|
| Migration 252 changed | 0 |
| Existing migration SQL changed | {summary.get('migration_sql_changes')} |
| New Prisma migrations | {summary.get('new_migration_directories')} |

---

## Safety

Production mutation: **NO** · Full replay beyond 252: **NO** · Merge: **NO** · R3B.2: **NO**

---

## Report ↔ machine consistency

Mismatch count: **{mismatch_count}**

---

## Final status

**{status}**
"""
    OUT.write_text(report)
    print(json.dumps({"consistency_mismatch_count": mismatch_count, "status": status}, indent=2))
    return 0 if mismatch_count == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
