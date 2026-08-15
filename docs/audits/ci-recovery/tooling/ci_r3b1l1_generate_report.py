#!/usr/bin/env python3
"""Generate CI-R3B1L.1 final report."""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
DATA = REPO / "docs/audits/ci-recovery/data"
OUT = REPO / "docs/audits/ci-recovery/ci-r3b1l1-exact-parity-diff-closure-2026-08.md"


def load(name: str) -> dict:
    return json.loads((DATA / name).read_text())


def main() -> int:
    summary = load("ci-r3b1l1-final-validation-summary-2026-08.json")
    manifest = load("ci-r3b1l1-authority-manifest-2026-08.json")
    parity = load("ci-r3b1l1-exact-final-catalog-parity-2026-08.json")
    coverage = load("ci-r3b1l1-authority-coverage-validation-2026-08.json")
    golden = load("ci-r3b1l1-golden-tests-2026-08.json")
    replay = load("ci-r3b1l1-full-fresh-replay-result-2026-08.json")
    acceptance = load("ci-r3b1l1-final-migration-recovery-acceptance-2026-08.json")
    immut = load("ci-r3b1l1-immutability-audit-2026-08.json")
    diff = load("ci-r3b1l1-prisma-schema-db-diff-2026-08.json")
    classification = load("ci-r3b1l1-prisma-diff-scope-classification-2026-08.json")
    branch = subprocess.check_output(["git", "branch", "--show-current"], cwd=REPO, text=True).strip()
    status = summary.get("final_status", "UNKNOWN")
    counters = parity.get("mismatch_counters", {})
    trip = parity.get("vehicle_trips_trip_status", {})

    checks = [
        summary.get("properties_expected") == 54,
        summary.get("properties_checked") == 54,
        summary.get("properties_matched") == 54,
        summary.get("objects_matched") == 19,
        summary.get("tables_matched") == 9,
        summary.get("enums_matched") == 10,
        replay.get("failed_migrations") == 0,
        replay.get("manual_interventions") == 0,
        replay.get("reached_absolute_head") is True,
        golden.get("pass") is True,
        coverage.get("pass") is True,
        classification.get("R3B_SCOPE_DIFF_COUNT") == 0,
        classification.get("UNRESOLVED_DIFF_COUNT") == 0,
        sum(counters.values()) == len(parity.get("mismatch_records", [])),
    ]
    report_mismatch_count = sum(1 for c in checks if not c)

    report = f"""# CI-R3B1L.1 — Exact Parity Blindspot Closure & Prisma Diff Classification

**Phase:** R3B1L.1  
**Branch:** `{branch}`  
**Status:** `{status}`

---

## Baseline

| Field | Value |
|-------|-------|
| BASE_R3B1L_SHA | `{summary.get('BASE_R3B1L_SHA')}` |
| evidence_input_sha | `{summary.get('evidence_input_sha')}` |
| Authority manifest SHA | `{manifest.get('AUTHORITY_MANIFEST_SHA256')}` |
| Inherited R3B1L canonical SHA | `{manifest.get('inherited_r3b1l_canonical_54_sha256')}` |

---

## Previously accepted replay state

R3B1L established fresh zero-state replay to absolute HEAD (305 migrations, 0 failures, 0 manual interventions) and canonical R3B0.21 authority (19/9/10/54). R3B1L.1 closes residual validator blindspots without modifying migrations.

---

## R3B1L residual validator gaps closed

| Gap | R3B1L.1 closure |
|-----|-----------------|
| Timestamp precision normalization | Removed; exact `format_type()` string compare |
| PK/FK catalog comparison | Full deferrability, MATCH, validation fields |
| CHECK constraints | Full inventory on 9 authority tables |
| Index semantics | `pg_get_indexdef` normalized compare + state/predicate/method |
| Prisma diff | Full stdout captured ({diff.get('byte_length')} bytes, {diff.get('line_count')} lines) |
| Diff scope | Every operation classified; R3B_SCOPE must be 0 |

---

## Canonical R3B0.21 authority

| Counter | Value |
|---------|-------|
| Objects | {manifest.get('authority_object_count')} |
| Tables | {manifest.get('authority_table_count')} |
| Enums | {manifest.get('authority_enum_count')} |
| Property categories | {manifest.get('authority_property_category_count')} |
| Unique property categories | {manifest.get('authority_unique_property_category_count')} |

---

## Exact PostgreSQL type semantics

Exact physical types via `format_type(atttypid, atttypmod)` with no precision normalization. Timestamp `(3)` vs bare timestamp, timezone variants, varchar/numeric typmods remain distinct.

---

## Constraint parity hardening

PK, UNIQUE, FK, and CHECK constraints compared via `pg_constraint` + `pg_get_constraintdef` including MATCH type, ON UPDATE/DELETE, deferrability, and validation state.

---

## CHECK parity

Authority tables contain no CHECK constraints in R3B0.21 catalog; replay DB must have zero unexpected CHECK constraints on the 9 authority tables.

---

## Index parity hardening

Indexes compared via normalized `pg_get_indexdef` output plus valid/ready state, access method, predicate, and INCLUDE semantics.

---

## Expanded golden tests

| Result | Count |
|--------|-------|
| Total | {golden.get('total')} |
| Passed | {golden.get('passed')} |
| Status | {'PASS' if golden.get('pass') else 'FAIL'} |

---

## Final fresh zero-state replay

| Metric | Value |
|--------|-------|
| Database | `{replay.get('database_identifier')}` |
| PostgreSQL | `{replay.get('postgresql_version')}` |
| Migration directories | {replay.get('migration_directories_discovered')} |
| Failed migrations | {replay.get('failed_migrations')} |
| Manual interventions | {replay.get('manual_interventions')} |
| Absolute HEAD reached | {replay.get('reached_absolute_head')} |

---

## Exact catalog parity

| Gate | Result |
|------|--------|
| Objects | {parity.get('objects_matched')}/{parity.get('objects_expected')} |
| Tables | {parity.get('tables_matched')}/{parity.get('tables_expected')} |
| Enums | {parity.get('enums_matched')}/{parity.get('enums_expected')} |
| Properties | {parity.get('properties_matched')}/{parity.get('properties_expected')} |

---

## vehicle_trips convergence

| Check | Result |
|-------|--------|
| trip_status type | `{trip.get('actual_type')}` |
| trip_status default | `{trip.get('actual_default')}` |
| COMPLETED → ONGOING | {'PASS' if trip.get('completed_to_ongoing_reconciled') else 'FAIL'} |
| Overall | {'PASS' if trip.get('pass') else 'FAIL'} |

---

## Complete Prisma schema-vs-DB diff

| Field | Value |
|-------|-------|
| Command success | {diff.get('command_success')} |
| Diff empty | {diff.get('diff_empty')} |
| SHA-256 | `{diff.get('stdout_sha256')}` |
| Byte length | {diff.get('byte_length')} |
| Line count | {diff.get('line_count')} |
| Full SQL artifact | `data/ci-r3b1l1-prisma-schema-db-diff-2026-08.sql` |

---

## R3B scope diff classification

| Counter | Value |
|---------|-------|
| Total operations | {classification.get('total_operations')} |
| R3B_SCOPE | {classification.get('R3B_SCOPE_DIFF_COUNT')} |
| OUT_OF_SCOPE | {classification.get('OUT_OF_SCOPE_DIFF_COUNT')} |
| UNRESOLVED | {classification.get('UNRESOLVED_DIFF_COUNT')} |
| Gate | {'PASS' if classification.get('pass') else 'FAIL'} |

R3B recovery scope parity is exact when R3B_SCOPE = 0. Out-of-scope drift from the full current Prisma schema may remain and is fully classified.

---

## Out-of-scope Prisma drift

Out-of-scope objects (sample): {', '.join(classification.get('out_of_scope_objects', [])[:20])}{'...' if len(classification.get('out_of_scope_objects', [])) > 20 else ''}

---

## Migration immutability

| Check | Result |
|-------|--------|
| Modified migration SQL | {immut.get('modified_migration_sql_count')} |
| New migration directories | {immut.get('new_migration_directories')} |
| Migration 252 unchanged | {immut.get('migration_252_unchanged_from_r3b1k')} |
| schema.prisma changed | {immut.get('schema_prisma_changed')} |

---

## Final migration-recovery acceptance

**Status:** `{status}`

**Pass:** {acceptance.get('pass')}

---

## Production exposure

**Exposure:** E_UNKNOWN — recovery acceptance is not deployment authorization.

---

## Safety

- No merge
- No deploy
- No production migrations
- Next phase: E_UNKNOWN production exposure resolution

---

## Machine consistency

Report mismatch count: **{report_mismatch_count}** (required 0)
"""
    OUT.write_text(report)
    return 0 if report_mismatch_count == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
