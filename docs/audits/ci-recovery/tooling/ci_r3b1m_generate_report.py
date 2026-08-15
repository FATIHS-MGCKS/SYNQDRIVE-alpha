#!/usr/bin/env python3
"""Generate CI-R3B1M final recovery acceptance report."""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
DATA = REPO / "docs/audits/ci-recovery/data"
OUT = REPO / "docs/audits/ci-recovery/ci-r3b1m-prisma-schema-alignment-final-recovery-acceptance-2026-08.md"


def load(name: str) -> dict:
    return json.loads((DATA / name).read_text())


def main() -> int:
    acceptance = load("ci-r3b1m-final-migration-recovery-acceptance-2026-08.json")
    preflight = load("ci-r3b1m-preflight-summary-2026-08.json")
    classification = load("ci-r3b1m-preflight-prisma-diff-classification-2026-08.json")
    authority = load("ci-r3b1m-preflight-r3b-drift-authority-2026-08.json")
    contracts = load("ci-r3b1m-schema-alignment-contracts-2026-08.json")
    alignment = load("ci-r3b1m-schema-alignment-result-2026-08.json")
    authorized_diff = load("ci-r3b1m-schema-authorized-diff-2026-08.json")
    post_class = load("ci-r3b1m-post-alignment-diff-classification-2026-08.json")
    replay = load("ci-r3b1m-full-fresh-replay-result-2026-08.json")
    parity = load("ci-r3b1m-final-exact-catalog-parity-2026-08.json")
    final_class = load("ci-r3b1m-final-prisma-diff-classification-2026-08.json")
    immut = load("ci-r3b1m-immutability-audit-2026-08.json")
    golden = load("ci-r3b1m-golden-tests-2026-08.json")
    branch = subprocess.check_output(["git", "branch", "--show-current"], cwd=REPO, text=True).strip()
    trip = authority.get("trip_driving_impact_calculated_at") or {}

    report = f"""# CI-R3B1M — Prisma Schema Authority Alignment and Final Recovery Acceptance

**Phase:** CI-R3B1M  
**Branch:** `{branch}`  
**Status:** `{acceptance.get('final_status')}`

---

## Baseline

| Field | Value |
|-------|-------|
| Parent branch | `fix/ci-r3b1l21-scope-ownership-coverage-2026-08` |
| BASE_R3B1L21_SHA | `{preflight.get('baseline', {}).get('BASE_R3B1L21_SHA')}` |
| PRE_R3B1M_SHA | `{preflight.get('baseline', {}).get('PRE_R3B1M_SHA')}` |

---

## Accepted replay history

Zero-state replay milestones remain accepted from prior phases (R3B1G, migration 157, R3B1I, migration 249, corrected migration 252). R3B1M does not reopen those results.

---

## R3B1L.2.1 residual ownership limitation

R3B1L.2.1 used table-prefix index name inference as acceptance proof. R3B1M removes that heuristic from acceptance logic. Prefix matches may appear only as `diagnostic_hint`.

| Rule | R3B1M closure |
|------|---------------|
| Prefix inference acceptance | **NO** |
| Positive CREATE INDEX ON owner | YES |
| Migration/catalog/Prisma metadata owner | YES |
| Unknown DROP/ALTER INDEX owner | UNRESOLVED |

---

## Positive index-owner closure

| Metric | Value |
|--------|-------|
| Frozen diff statements | {classification.get('total_operations')} |
| R3B_SCOPE | {classification.get('R3B_SCOPE_DIFF_COUNT')} |
| OUT_OF_SCOPE | {classification.get('OUT_OF_SCOPE_DIFF_COUNT')} |
| UNRESOLVED | {classification.get('UNRESOLVED_DIFF_COUNT')} |
| OWNER_UNKNOWN | {classification.get('OWNER_UNKNOWN_COUNT')} |

---

## Pre-alignment frozen-diff classification

Preflight classification pass: **{'PASS' if classification.get('pass') else 'FAIL'}**

Authority decisions:

| Decision | Count |
|----------|-------|
| CURRENT_PRISMA_SCHEMA_DRIFT | {authority.get('decision_counts', {}).get('CURRENT_PRISMA_SCHEMA_DRIFT')} |
| REPLAY_DB_DRIFT | {authority.get('decision_counts', {}).get('REPLAY_DB_DRIFT')} |
| AUTHORITY_AMBIGUITY | {authority.get('decision_counts', {}).get('AUTHORITY_AMBIGUITY')} |
| CROSS_EVIDENCE_CONTRADICTION | {authority.get('decision_counts', {}).get('CROSS_EVIDENCE_CONTRADICTION')} |

---

## Final CURRENT_PRISMA_SCHEMA_DRIFT authority

`trip_driving_impact.calculated_at` — canonical physical type `{((trip.get('accepted_canonical_authority') or {}).get('type'))}` precision {(trip.get('accepted_canonical_authority') or {}).get('datetime_precision')}; Prisma desired `{((trip.get('current_prisma_desired_state') or {}).get('desired_pg_type'))}`; decision `{trip.get('decision')}`.

---

## Schema alignment contracts

Authorized contracts: {contracts.get('contract_count')}

---

## schema.prisma exact change

Authorized field changes: {authorized_diff.get('authorized_change_count')}  
Unauthorized changes: {authorized_diff.get('unauthorized_schema_changes')}

---

## Prisma validation

| Check | Result |
|-------|--------|
| validate | {'PASS' if alignment.get('prisma_validate', {}).get('pass') else 'FAIL'} |
| generate | {'PASS' if alignment.get('prisma_generate', {}).get('pass') else 'FAIL'} |

---

## Post-alignment Prisma diff

| Metric | Value |
|--------|-------|
| R3B_SCOPE | {post_class.get('R3B_SCOPE_DIFF_COUNT')} |
| OUT_OF_SCOPE | {post_class.get('OUT_OF_SCOPE_DIFF_COUNT')} |
| UNRESOLVED | {post_class.get('UNRESOLVED_DIFF_COUNT')} |
| OWNER_UNKNOWN | {post_class.get('OWNER_UNKNOWN_COUNT')} |

---

## Final fresh zero-state replay

| Metric | Value |
|--------|-------|
| Migration directories | {replay.get('migration_directories_discovered')} |
| Failed migrations | {replay.get('failed_migrations')} |
| Manual interventions | {replay.get('manual_interventions')} |
| Absolute HEAD | {'PASS' if replay.get('reached_absolute_head') else 'FAIL'} |

---

## Exact catalog parity

| Category | Result |
|----------|--------|
| Objects | {parity.get('objects_matched')}/{parity.get('objects_expected')} |
| Tables | {parity.get('tables_matched')}/{parity.get('tables_expected')} |
| Enums | {parity.get('enums_matched')}/{parity.get('enums_expected')} |
| Properties | {parity.get('properties_matched')}/{parity.get('properties_expected')} |

---

## vehicle_trips convergence

`vehicle_trips.trip_status` COMPLETED → ONGOING: **{'PASS' if (parity.get('vehicle_trips_trip_status') or {}).get('pass') else 'FAIL'}**

---

## Final Prisma diff classification

| Metric | Value |
|--------|-------|
| R3B_SCOPE | {final_class.get('R3B_SCOPE_DIFF_COUNT')} |
| OUT_OF_SCOPE | {final_class.get('OUT_OF_SCOPE_DIFF_COUNT')} |
| UNRESOLVED | {final_class.get('UNRESOLVED_DIFF_COUNT')} |
| OWNER_UNKNOWN | {final_class.get('OWNER_UNKNOWN_COUNT')} |

---

## Migration immutability

Modified migration SQL: {immut.get('modified_migration_sql_count')}  
New migration directories: {immut.get('new_migration_directories')}

---

## Migration-recovery acceptance decision

**{acceptance.get('final_status')}**

Golden tests: {'PASS' if golden.get('pass') else 'FAIL'} ({golden.get('passed')}/{golden.get('total')})

---

## E_UNKNOWN remaining production blocker

Production exposure resolution remains **E_UNKNOWN**. No production DDL/DML, deployment, or merge was performed in R3B1M.

---

## Safety

| Guard | Status |
|-------|--------|
| Production mutation | NO |
| Production migration | NO |
| Deployment | NO |
| Merge | NO |
| Migration file edits | NO |
"""
    OUT.write_text(report)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
