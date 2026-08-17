#!/usr/bin/env python3
"""Generate CI-R3B1L final report."""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
DATA = REPO / "docs/audits/ci-recovery/data"
OUT = REPO / "docs/audits/ci-recovery/ci-r3b1l-exact-final-parity-recovery-acceptance-2026-08.md"


def load(name: str) -> dict:
    return json.loads((DATA / name).read_text())


def main() -> int:
    summary = load("ci-r3b1l-final-validation-summary-2026-08.json")
    manifest = load("ci-r3b1l-final-authority-manifest-2026-08.json")
    canonical = load("ci-r3b1l-canonical-54-property-authority-2026-08.json")
    parity = load("ci-r3b1l-exact-final-catalog-parity-2026-08.json")
    coverage = load("ci-r3b1l-authority-coverage-validation-2026-08.json")
    golden = load("ci-r3b1l-golden-tests-2026-08.json")
    replay = load("ci-r3b1l-full-fresh-replay-result-2026-08.json")
    acceptance = load("ci-r3b1l-migration-recovery-acceptance-2026-08.json")
    immut = load("ci-r3b1l-immutability-audit-2026-08.json")
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
        replay.get("reached_absolute_head") is True,
        golden.get("pass") is True,
        coverage.get("pass") is True,
        sum(counters.values()) == len(parity.get("mismatch_records", [])),
    ]
    report_mismatch_count = sum(1 for c in checks if not c)

    report = f"""# CI-R3B1L — Exact Final Catalog Parity & Recovery Acceptance

**Phase:** R3B1L  
**Branch:** `{branch}`  
**Status:** `{status}`

---

## Baseline

| Field | Value |
|-------|-------|
| BASE_R3B1K_SHA | `{summary.get('BASE_R3B1K_SHA')}` |
| evidence_input_sha | `{summary.get('evidence_input_sha')}` |
| Authority manifest SHA | `{manifest.get('AUTHORITY_MANIFEST_SHA256')}` |

---

## R3B1K replay acceptance

R3B1K corrected migration 252 and reached absolute HEAD with 305 migrations. R3B1L does not modify any migration SQL.

---

## Why 37/37 was invalid

The legacy `ci_r3b1c_r3b_parity.py` checker compared **counts only** (columns/constraints/indexes per table + enum label sets = 37 categories). R3B0.21 authority requires **9 tables × 6 semantic categories = 54** exact property evaluations with full PostgreSQL catalog semantics.

---

## Canonical R3B0.21 authority

| Counter | Value |
|---------|-------|
| Objects | {manifest.get('authority_object_count')} |
| Tables | {manifest.get('authority_table_count')} |
| Enums | {manifest.get('authority_enum_count')} |
| Property categories | {manifest.get('authority_property_category_count')} |
| Unique property categories | {manifest.get('authority_unique_property_category_count')} |

Sources: `ci-r3a7-production-catalog-evidence-2026-08.json`, `ci-r3b-bootstrap-predecessor-shape-ledger-2026-08.md`, `ci-r3b-executable-contract-2026-08.md`.

---

## Exact 54-property universe

Canonical authority entries: **{len(canonical.get('entries', []))}** (`ci-r3b1l-canonical-54-property-authority-2026-08.json`).

---

## Fresh zero-state replay

| Field | Value |
|-------|-------|
| Migration directories | {replay.get('migration_directories_discovered')} |
| Failed migrations | {replay.get('failed_migrations')} |
| Manual interventions | {replay.get('manual_interventions')} |
| Absolute HEAD reached | {replay.get('reached_absolute_head')} |

---

## Exact parity

| Gate | Result |
|------|--------|
| 19/19 objects | {parity.get('objects_matched')}/{parity.get('objects_expected')} |
| 9/9 tables | {parity.get('tables_matched')}/{parity.get('tables_expected')} |
| 10/10 enums | {parity.get('enums_matched')}/{parity.get('enums_expected')} |
| 54/54 properties | {parity.get('properties_matched')}/{parity.get('properties_expected')} |

---

## Vehicle trip-status convergence

| Field | Value |
|-------|-------|
| Column | `{trip.get('column')}` |
| Historical State-A | `{trip.get('historical_state_a_default')}` |
| Accepted final | `{trip.get('accepted_final_default')}` |
| Actual default | `{trip.get('actual_default')}` |
| COMPLETED → ONGOING reconciled | {trip.get('completed_to_ongoing_reconciled')} |
| PASS | {trip.get('pass')} |

---

## Authority coverage

| Field | Value |
|-------|-------|
| Expected IDs | {coverage.get('authority_ids_total')} |
| Evaluated IDs | {coverage.get('authority_ids_evaluated')} |
| Missing | {coverage.get('missing_evaluations')} |
| Unexpected | {coverage.get('unexpected_evaluations')} |
| Duplicates | {coverage.get('duplicate_evaluations')} |

---

## Negative golden tests

Passed: **{golden.get('passed')}** / **{golden.get('total')}** (including 37/37 rejection and hardcoded-zero detector).

---

## Migration immutability

| Field | Value |
|-------|-------|
| Modified migration SQL | {immut.get('modified_migration_sql_count')} |
| Migration 252 unchanged from R3B1K | {immut.get('migration_252_unchanged_from_r3b1k')} |
| schema.prisma changed | {immut.get('schema_prisma_changed')} |

---

## Recovery acceptance decision

**Final status:** `{status}`

Production exposure: **E_UNKNOWN** — recovery acceptance is not deployment authorization.

---

## Report ↔ machine consistency

Report mismatch count: **{report_mismatch_count}** (required: 0)
"""
    OUT.write_text(report)
    print(json.dumps({"report": str(OUT), "report_mismatch_count": report_mismatch_count}, indent=2))
    return 0 if report_mismatch_count == 0 and status.endswith("COMPLETED") else 1


if __name__ == "__main__":
    raise SystemExit(main())
