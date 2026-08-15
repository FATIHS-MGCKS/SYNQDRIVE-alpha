#!/usr/bin/env python3
"""Generate CI-R3B1L.2.1 final report."""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
DATA = REPO / "docs/audits/ci-recovery/data"
OUT = REPO / "docs/audits/ci-recovery/ci-r3b1l21-scope-ownership-coverage-2026-08.md"


def load(name: str) -> dict:
    return json.loads((DATA / name).read_text())


def main() -> int:
    summary = load("ci-r3b1l21-final-validation-summary-2026-08.json")
    independent = load("ci-r3b1l21-independent-parser-coverage-2026-08.json")
    classification = load("ci-r3b1l21-complete-prisma-diff-classification-2026-08.json")
    decisions = load("ci-r3b1l21-r3b-scope-drift-authority-2026-08.json")

    golden = load("ci-r3b1l21-golden-tests-2026-08.json")
    coverage = load("ci-r3b1l21-coverage-validation-2026-08.json")
    immut = load("ci-r3b1l21-immutability-audit-2026-08.json")
    branch = subprocess.check_output(["git", "branch", "--show-current"], cwd=REPO, text=True).strip()
    scope = summary.get("scope", {})
    auth = summary.get("authority_decisions", {})
    trip = summary.get("trip_driving_impact_calculated_at", {})
    indep = summary.get("independent_coverage", {})

    checks = [
        summary.get("frozen_prisma_diff", {}).get("pass") is True,
        indep.get("pass") is True,
        indep.get("independent_statements") == indep.get("main_parser_statements"),
        indep.get("independent_without_main_match") == 0,
        indep.get("main_without_independent_match") == 0,
        classification.get("UNRESOLVED_DIFF_COUNT") == 0,
        decisions.get("pass") is True,
        coverage.get("pass") is True,
        golden.get("pass") is True,
        immut.get("pass") is True,
        scope.get("R3B_SCOPE") == classification.get("R3B_SCOPE_DIFF_COUNT"),
    ]
    mismatch_count = sum(1 for c in checks if not c)

    report = f"""# CI-R3B1L.2.1 — Independent Parser Coverage & Index Ownership Closure

**Phase:** R3B1L.2.1  
**Branch:** `{branch}`  
**Status:** `{summary.get('final_status')}`

---

## Baseline

| Field | Value |
|-------|-------|
| BASE_R3B1L2_SHA | `{summary.get('BASE_R3B1L2_SHA')}` |
| evidence_input_sha | `{summary.get('evidence_input_sha')}` |
| Parent branch | `fix/ci-r3b1l2-prisma-diff-authority-2026-08` |

---

## Frozen Prisma diff (unchanged input)

| Metric | Value |
|--------|-------|
| SHA-256 | `{summary.get('frozen_prisma_diff', {}).get('sha256')}` |
| Bytes | {summary.get('frozen_prisma_diff', {}).get('bytes')} |
| Lines | {summary.get('frozen_prisma_diff', {}).get('lines')} |
| Matches R3B1L.2 manifest | {'PASS' if summary.get('frozen_prisma_diff', {}).get('pass') else 'FAIL'} |

---

## Truly independent statement counter

R3B1L.2 reused the main parser for its "independent" counter. R3B1L.2.1 adds a separate character scanner that does **not** import or call `split_sql_statements()` or other main-parser entrypoints.

| Metric | Value |
|--------|-------|
| Independent statements | {indep.get('independent_statements')} |
| Main parser statements | {indep.get('main_parser_statements')} |
| Independent without main match | {indep.get('independent_without_main_match')} |
| Main without independent match | {indep.get('main_without_independent_match')} |
| Duplicate interval matches | {indep.get('duplicate_interval_matches')} |
| Static independence check | {'PASS' if indep.get('implementation_independence_pass') else 'FAIL'} |
| Coverage | **{'PASS' if indep.get('pass') else 'FAIL'}** |

---

## Scope ownership corrections

| Rule | Closure |
|------|---------|
| Absence ≠ OUT_OF_SCOPE | Unknown index owners → UNRESOLVED |
| CREATE INDEX ON R3B table | R3B_SCOPE via ON relation, not index inventory |
| DROP/ALTER INDEX | Positive owner via authority → migration → schema prefix/unique maps |
| Owner table precedence | Evaluated before index-name inventory membership |

---

## Classification results

| Classification | Count |
|----------------|-------|
| Total operations | {classification.get('total_operations')} |
| R3B_SCOPE | {classification.get('R3B_SCOPE_DIFF_COUNT')} |
| OUT_OF_SCOPE | {classification.get('OUT_OF_SCOPE_DIFF_COUNT')} |
| UNRESOLVED | {classification.get('UNRESOLVED_DIFF_COUNT')} |

---

## Authority decisions

| Decision | Count |
|----------|-------|
| CURRENT_PRISMA_SCHEMA_DRIFT | {auth.get('CURRENT_PRISMA_SCHEMA_DRIFT', 0)} |
| REPLAY_DB_DRIFT | {auth.get('REPLAY_DB_DRIFT', 0)} |
| AUTHORITY_AMBIGUITY | {auth.get('AUTHORITY_AMBIGUITY', 0)} |
| CROSS_EVIDENCE_CONTRADICTION | {auth.get('CROSS_EVIDENCE_CONTRADICTION', 0)} |

### trip_driving_impact.calculated_at

| Source | Value |
|--------|-------|
| Accepted authority | `{trip.get('accepted_authority')}` |
| Replay actual | `{trip.get('replay_value')}` |
| Prisma desired | `{trip.get('prisma_desired_value')}` |
| Decision | **{trip.get('decision')}** |

---

## Implementation decision

**Next phase:** {summary.get('next_phase')}

**R3B1M schema alignment authorized:** {'YES' if summary.get('r3b1m_authorized') else 'NO'}

---

## Immutability

| Check | Result |
|-------|--------|
| Modified migrations | {immut.get('modified_migration_sql_count')} |
| schema.prisma changed | {'YES' if immut.get('schema_prisma_changed') else 'NO'} |
| Runtime changed | {'YES' if immut.get('runtime_changed') else 'NO'} |

---

## Golden tests

Passed **{golden.get('passed')} / {golden.get('total')}** ({'PASS' if golden.get('pass') else 'FAIL'})

---

## Report ↔ machine consistency

Mismatch count: **{mismatch_count}** (required 0)
"""
    OUT.write_text(report)
    print(json.dumps({"report": str(OUT.relative_to(REPO)), "mismatch_count": mismatch_count}, indent=2))
    return 0 if mismatch_count == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
