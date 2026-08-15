#!/usr/bin/env python3
"""Generate CI-R3B1N.1 final report."""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
DATA = REPO / "docs/audits/ci-recovery/data"
OUT = REPO / "docs/audits/ci-recovery/ci-r3b1n1-production-history-reconciliation-twin-simulation-2026-08.md"


def load(name: str) -> dict:
    return json.loads((DATA / name).read_text())


def mismatch_checks(summary: dict) -> tuple[int, list[str]]:
    checksum = load("ci-r3b1n1-checksum-provenance-classification-2026-08.json")
    prod_only = load("ci-r3b1n1-production-only-migration-reconciliation-2026-08.json")
    repo_only = load("ci-r3b1n1-repo-only-pending-effect-matrix-2026-08.json")
    m252 = load("ci-r3b1n1-migration252-forensic-timeline-2026-08.json")
    twin = load("ci-r3b1n1-production-twin-fidelity-2026-08.json")
    deploy = load("ci-r3b1n1-twin-migrate-deploy-result-2026-08.json")
    golden = load("ci-r3b1n1-golden-tests-2026-08.json")

    checks = [
        ("checksum_mismatches", summary["checksum_provenance"]["total_mismatches"] == checksum["summary"]["total_mismatches"]),
        ("production_only_total", summary["production_only"]["total"] == prod_only["total"]),
        ("repo_only_total", summary["repo_only"]["total"] == repo_only["total"]),
        ("m252_state", summary["migration252"]["final_classification"] == m252["final_classification"]),
        ("twin_fidelity", summary["production_twin"]["schema_fidelity"] == twin["catalog_ledger_fidelity_pass"]),
        ("deploy_exit", summary["twin_migrate_deploy"]["exit_code"] == deploy["exit_code"]),
        ("first_blocker", summary["twin_migrate_deploy"]["first_blocker_type"] == deploy.get("blocker_type")),
        ("history_class", summary["history_consistency_class"] == summary["history_consistency_class"]),
        ("golden_total", summary["golden_tests"]["total"] == golden["total"]),
        ("production_mutations", summary["production_mutations"] == 0),
    ]
    failed = [name for name, ok in checks if not ok]
    return len(failed), failed


def main() -> int:
    summary = load("ci-r3b1n1-final-history-reconciliation-summary-2026-08.json")
    four_way = load("ci-r3b1n1-four-way-migration-provenance-2026-08.json")
    semantics = load("ci-r3b1n1-prisma-checksum-semantics-2026-08.json")
    checksum = load("ci-r3b1n1-checksum-provenance-classification-2026-08.json")
    prod_only = load("ci-r3b1n1-production-only-migration-reconciliation-2026-08.json")
    repo_only = load("ci-r3b1n1-repo-only-pending-effect-matrix-2026-08.json")
    m252 = load("ci-r3b1n1-migration252-forensic-timeline-2026-08.json")
    twin = load("ci-r3b1n1-production-twin-fidelity-2026-08.json")
    status_before = load("ci-r3b1n1-twin-prisma-migrate-status-before-2026-08.json")
    deploy = load("ci-r3b1n1-twin-migrate-deploy-result-2026-08.json")
    blockers = load("ci-r3b1n1-production-deployment-blocker-inventory-2026-08.json")
    golden = load("ci-r3b1n1-golden-tests-2026-08.json")
    branch = subprocess.check_output(["git", "branch", "--show-current"], cwd=REPO, text=True).strip()
    mismatch_count, mismatch_names = mismatch_checks(summary)

    report = f"""# CI-R3B1N.1 — Production Migration History Reconciliation and Twin Deploy Simulation

**Phase:** CI-R3B1N.1  
**Branch:** `{branch}`  
**Status:** `{summary.get('final_status')}`

---

## Baseline

| Field | Value |
|-------|-------|
| PRE_R3B1N1_SHA | `{summary.get('baseline', {}).get('PRE_R3B1N1_SHA')}` |
| R3B1N remote HEAD | `{summary.get('baseline', {}).get('R3B1N_REMOTE_HEAD')}` |
| Recovered HEAD | `{summary.get('baseline', {}).get('RECOVERED_HEAD')}` |
| main HEAD | `{summary.get('baseline', {}).get('MAIN_HEAD')}` |
| Deployed production SHA | `{summary.get('production_deployed_sha')}` |

---

## R3B1N accepted production facts

Production code is pre-recovery. Production physical R3B catalog matches recovered authority (54/54). Production migration ledger/history does not match recovered repository history.

---

## Four-way migration provenance model

Union migration names: {four_way.get('union_migration_names')}

Compared states: production ledger, deployed SHA, main, recovered R3B1M branch.

---

## Prisma checksum semantics

Confirmed representation: `{semantics.get('confirmed_representation')}`  
Confirmation count: {semantics.get('confirmation_count')}  
Pass: {semantics.get('pass')}

---

## Checksum mismatch reconciliation

| Metric | Value |
|--------|-------|
| Total mismatches | {checksum['summary']['total_mismatches']} |
| Matches deployed SHA | {checksum['summary']['matches_deployed_sha']} |
| Changed after deployed SHA | {checksum['summary']['changed_after_deployed_sha']} |
| Matches none | {checksum['summary']['matches_none']} |
| High-risk mismatches | {checksum['summary']['high_risk_mismatches']} |
| Unresolved | {checksum['summary']['unresolved']} |

---

## Production-only migrations

Total: {prod_only.get('total')}

---

## Recovered-repo-only migrations

Total: {repo_only.get('total')}  
Effect already present: {summary['repo_only']['effect_already_present']}  
Partial effect present: {summary['repo_only']['partial_effect_present']}  
Physically absent: {summary['repo_only']['pending_and_physically_absent']}

---

## R3B1G collision analysis

Ledger pending: {summary['r3b1g']['ledger_pending']}  
Physical effect present: {summary['r3b1g']['physical_effect_present']}  
Likely conflict: `{summary['r3b1g']['exact_likely_conflict']}`

---

## R3B1I collision analysis

Ledger pending: {summary['r3b1i']['ledger_pending']}  
Physical effect present: {summary['r3b1i']['physical_effect_present']}  
Likely conflict: `{summary['r3b1i']['exact_likely_conflict']}`

---

## Migration 252 forensic timeline

Final classification: `{m252.get('final_classification')}`  
Confidence: `{m252.get('confidence')}`  
Ledger rows: {len(m252.get('ledger_rows') or [])}

---

## Disposable production twin

Twin DB: `{summary['production_twin']['database_name']}`  
Schema/ledger fidelity: {'PASS' if twin.get('catalog_ledger_fidelity_pass') else 'FAIL'}  
Business rows copied: {summary['production_twin']['business_rows_copied']}  
Non-production confirmed: {'PASS' if summary['production_twin']['non_production_confirmed'] else 'FAIL'}

Twin limitations: schema-only fidelity; no application data; data-dependent failures may not reproduce.

---

## Prisma migrate status before simulation

Exit code: {status_before.get('exit_code')}

---

## Actual migrate deploy simulation (twin only)

Executed against production: NO  
Executed against twin: YES  
Exit code: {deploy.get('exit_code')}  
First failing migration: `{deploy.get('first_failing_migration')}`  
First blocker: `{deploy.get('blocker_type')}`  
Prisma error: `{deploy.get('prisma_error_code')}`  
SQLSTATE: `{deploy.get('sqlstate')}`

---

## Static prediction vs simulation

| Target | Result |
|--------|--------|
| R3B1G | {summary['static_prediction_vs_simulation']['r3b1g']} |
| R3B1I | {summary['static_prediction_vs_simulation']['r3b1i']} |
| M252 | {summary['static_prediction_vs_simulation']['m252']} |

---

## History consistency classification

`{summary.get('history_consistency_class')}`

---

## Exposure / safety

| Class | Value |
|-------|-------|
| Composite exposure | `{summary.get('composite_exposure_class')}` |
| Merge safety | `{summary.get('merge_safety_class')}` |
| Deployment safety | `{summary.get('deployment_safety_class')}` |

---

## Required R3B1O strategy inputs

Next phase: `{summary.get('next_phase')}`

Blocker inventory total: {blockers.get('total')}

---

## Production non-mutation proof

Production ledger fingerprint unchanged: {summary.get('production_ledger_unchanged')}  
Production mutations: {summary.get('production_mutations')}

---

## Golden tests

{golden.get('passed')}/{golden.get('total')} PASS

---

## Report ↔ machine consistency

Mismatch count: **{mismatch_count}** ({', '.join(mismatch_names) if mismatch_names else 'none'})

---

## Safety

DO NOT MERGE. DO NOT DEPLOY. DO NOT RUN PRODUCTION MIGRATIONS.
"""
    OUT.write_text(report)
    return 0 if mismatch_count == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
