#!/usr/bin/env python3
"""Generate CI-R3B1N.2 report."""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
DATA = REPO / "docs/audits/ci-recovery/data"
OUT = REPO / "docs/audits/ci-recovery/ci-r3b1n2-isolated-twin-provenance-closure-2026-08.md"


def load(name: str) -> dict:
    return json.loads((DATA / name).read_text())


def mismatch_checks(summary: dict) -> tuple[int, list[str]]:
    iso = load("ci-r3b1n2-twin-isolation-proof-2026-08.json")
    catalog = load("ci-r3b1n2-production-twin-catalog-fidelity-2026-08.json")
    business = load("ci-r3b1n2-twin-no-business-data-proof-2026-08.json")
    deploy = load("ci-r3b1n2-isolated-twin-migrate-deploy-result-2026-08.json")
    checksum = load("ci-r3b1n2-checksum-provenance-closure-2026-08.json")
    checks = [
        ("isolation", summary["isolation_pass"] == iso["isolation_pass"]),
        ("catalog", summary["catalog_fidelity_pass"] == catalog["pass"]),
        ("business", summary["no_business_data_pass"] == business["pass"]),
        ("deploy_exit", summary["isolated_twin_deploy"]["exit_code"] == deploy["exit_code"]),
        ("new_finished", summary["isolated_twin_deploy"]["new_finished"] == deploy["ledger_delta"]["new_finished"]),
        ("new_failed", summary["isolated_twin_deploy"]["new_failed"] == deploy["ledger_delta"]["new_failed"]),
        ("first_migration", summary["isolated_twin_deploy"]["first_failing_migration"] == deploy.get("first_failing_migration")),
        ("db_code", summary["isolated_twin_deploy"]["database_error_code"] == deploy.get("database_error_code")),
        ("checksum_common", summary["checksum_provenance"]["common_migrations"] == checksum["summary"]["common_migrations"]),
        ("production_mutations", summary["production_mutations"] == 0),
        ("r3b1o", summary["r3b1o_readiness"] == ("READY" if summary.get("pass") else "NOT_READY")),
    ]
    failed = [n for n, ok in checks if not ok]
    return len(failed), failed


def main() -> int:
    summary = load("ci-r3b1n2-final-isolated-twin-provenance-summary-2026-08.json")
    iso = load("ci-r3b1n2-twin-isolation-proof-2026-08.json")
    catalog = load("ci-r3b1n2-production-twin-catalog-fidelity-2026-08.json")
    business = load("ci-r3b1n2-twin-no-business-data-proof-2026-08.json")
    checksum = load("ci-r3b1n2-checksum-provenance-closure-2026-08.json")
    deploy = load("ci-r3b1n2-isolated-twin-migrate-deploy-result-2026-08.json")
    golden = load("ci-r3b1n2-golden-tests-2026-08.json")
    branch = subprocess.check_output(["git", "branch", "--show-current"], cwd=REPO, text=True).strip()
    mismatch_count, mismatch_names = mismatch_checks(summary)

    report = f"""# CI-R3B1N.2 — Isolated Production Twin and Checksum Provenance Closure

**Phase:** CI-R3B1N.2  
**Branch:** `{branch}`  
**Status:** `{summary.get('final_status')}`  
**R3B1O readiness:** `{summary.get('r3b1o_readiness')}`

---

## Why R3B1N.1 was insufficient

R3B1N.1 used same-host/different-database isolation, weak business-row proof, incomplete checksum representation analysis, and misclassified failed ledger rows.

---

## Twin isolation

| Field | Value |
|-------|-------|
| Production instance fingerprint | `{summary.get('production_instance_fingerprint')}` |
| Twin instance fingerprint | `{summary.get('twin_instance_fingerprint')}` |
| Same physical instance | {iso.get('same_physical_instance')} |
| Isolation | {'PASS' if iso.get('isolation_pass') else 'FAIL'} |

Production `system_identifier` differs from isolated audit-machine PostgreSQL cluster.

---

## Catalog fidelity

Production fingerprint: `{catalog.get('production_fingerprint')}`  
Twin fingerprint: `{catalog.get('twin_fingerprint')}`  
Pass: {catalog.get('pass')}

---

## No-business-data proof

Null measurements: {business.get('null_measurements')}  
Total sampled business rows: {business.get('total_rows')}  
Pass: {business.get('pass')}

---

## Checksum provenance closure

Common migrations: {checksum['summary']['common_migrations']}  
LF matches: {checksum['summary']['lf_representation_matches']}  
CRLF matches: {checksum['summary']['crlf_representation_matches']}  
Raw matches: {checksum['summary']['raw_exact_matches']}  
Line-ending only: {checksum['summary']['line_ending_only_differences']}  
Actual post-deploy mutations: {checksum['summary']['actual_post_deploy_file_mutations']}  
MATCHES_NONE: {checksum['summary']['matches_none']}

---

## Isolated twin migrate deploy

Exit code: {deploy.get('exit_code')}  
New finished: {deploy['ledger_delta']['new_finished']}  
New failed: {deploy['ledger_delta']['new_failed']}  
First failing migration: `{deploy.get('first_failing_migration')}`  
Prisma error: `{deploy.get('prisma_error_code')}`  
Database error code: `{deploy.get('database_error_code')}`

---

## Production immutability

Ledger unchanged: {summary.get('production_ledger_unchanged')}  
Catalog unchanged: {summary.get('production_catalog_unchanged')}  
Production mutations: {summary.get('production_mutations')}

---

## Golden tests

{golden.get('passed')}/{golden.get('total')} PASS

---

## Report consistency

Mismatch count: **{mismatch_count}** ({', '.join(mismatch_names) if mismatch_names else 'none'})

---

## Safety

DO NOT MERGE. DO NOT DEPLOY. DO NOT RUN PRODUCTION MIGRATIONS.
"""
    OUT.write_text(report)
    return 0 if mismatch_count == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
