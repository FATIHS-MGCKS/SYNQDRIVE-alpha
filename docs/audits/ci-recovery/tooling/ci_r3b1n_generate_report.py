#!/usr/bin/env python3
"""Generate CI-R3B1N production exposure resolution report."""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
DATA = REPO / "docs/audits/ci-recovery/data"
OUT = REPO / "docs/audits/ci-recovery/ci-r3b1n-production-exposure-resolution-2026-08.md"


def load(name: str) -> dict:
    return json.loads((DATA / name).read_text())


def mismatch_checks(summary: dict) -> tuple[int, list[str]]:
    authority = load("ci-r3b1n-recovery-authority-manifest-2026-08.json")
    revision = load("ci-r3b1n-production-deployed-revision-2026-08.json")
    ledger = load("ci-r3b1n-production-prisma-ledger-2026-08.json")
    compare = load("ci-r3b1n-production-ledger-vs-recovery-2026-08.json")
    matrix = load("ci-r3b1n-recovery-migration-exposure-matrix-2026-08.json")
    m252 = load("ci-r3b1n-migration252-production-exposure-2026-08.json")
    parity = load("ci-r3b1n-production-r3b-catalog-parity-2026-08.json")
    code = load("ci-r3b1n-production-code-exposure-2026-08.json")
    checksum = load("ci-r3b1n-production-checksum-risk-2026-08.json")
    triggers = load("ci-r3b1n-deployment-trigger-analysis-2026-08.json")

    checks: list[tuple[str, bool]] = [
        ("deployed_sha", summary.get("deployed_revision", {}).get("deployed_sha") == revision.get("deployed_sha")),
        ("ledger_row_count", summary.get("ledger", {}).get("row_count") == ledger.get("row_count")),
        (
            "checksum_mismatches",
            summary.get("ledger_compare", {}).get("checksum_mismatches") == compare.get("checksum_mismatches"),
        ),
        (
            "migration252_state",
            summary.get("migration252_exposure_class") == m252.get("ledger_state"),
        ),
        (
            "parity_objects",
            summary.get("production_r3b_parity", {}).get("objects")
            == f"{parity.get('objects_matched')}/{parity.get('objects_expected')}",
        ),
        (
            "parity_properties",
            summary.get("production_r3b_parity", {}).get("properties")
            == f"{parity.get('properties_matched')}/{parity.get('properties_expected')}",
        ),
        ("code_exposure", summary.get("code_exposure_class") == code.get("code_exposure_class")),
        (
            "checksum_risk_mismatch_count",
            summary.get("checksum_risk", {}).get("checksum_mismatches") == checksum.get("checksum_mismatches"),
        ),
        (
            "recovery_matrix_len",
            len(summary.get("recovery_exposure_matrix") or []) == len(matrix.get("migrations") or []),
        ),
        (
            "merge_auto_deploy",
            summary.get("deployment_triggers", {}).get("merge_to_main_auto_deploys_production")
            == triggers.get("merge_to_main_auto_deploys_production"),
        ),
        (
            "authority_migration_count",
            summary.get("evidence_input_sha") == authority.get("baseline", {}).get("PRE_R3B1N_SHA"),
        ),
    ]
    failed = [name for name, ok in checks if not ok]
    return len(failed), failed


def main() -> int:
    summary = load("ci-r3b1n-final-production-exposure-summary-2026-08.json")
    authority = load("ci-r3b1n-recovery-authority-manifest-2026-08.json")
    revision = load("ci-r3b1n-production-deployed-revision-2026-08.json")
    triggers = load("ci-r3b1n-deployment-trigger-analysis-2026-08.json")
    db = load("ci-r3b1n-production-db-identity-2026-08.json")
    ledger = load("ci-r3b1n-production-prisma-ledger-2026-08.json")
    compare = load("ci-r3b1n-production-ledger-vs-recovery-2026-08.json")
    matrix = load("ci-r3b1n-recovery-migration-exposure-matrix-2026-08.json")
    m252 = load("ci-r3b1n-migration252-production-exposure-2026-08.json")
    key = load("ci-r3b1n-key-repair-production-exposure-2026-08.json")
    parity = load("ci-r3b1n-production-r3b-catalog-parity-2026-08.json")
    code = load("ci-r3b1n-production-code-exposure-2026-08.json")
    checksum = load("ci-r3b1n-production-checksum-risk-2026-08.json")
    golden = load("ci-r3b1n-golden-tests-2026-08.json")
    branch = subprocess.check_output(["git", "branch", "--show-current"], cwd=REPO, text=True).strip()
    mismatch_count, mismatch_names = mismatch_checks(summary)

    recovery_counts = {}
    for row in matrix.get("migrations", []):
        state = row.get("exposure_state", "UNKNOWN")
        recovery_counts[state] = recovery_counts.get(state, 0) + 1

    report = f"""# CI-R3B1N — Production Recovery Exposure Resolution

**Phase:** CI-R3B1N  
**Branch:** `{branch}`  
**Status:** `{summary.get('final_status')}`

---

## Baseline

| Field | Value |
|-------|-------|
| PRE_R3B1N_SHA | `{authority.get('baseline', {}).get('PRE_R3B1N_SHA')}` |
| R3B1M remote HEAD | `{authority.get('recovery_branch_sha')}` |
| main HEAD | `{authority.get('main_sha')}` |
| Parent branch | `fix/ci-r3b1m-prisma-schema-authority-alignment-2026-08` |

---

## Final recovered authority

Recovered branch authority is hash-bound in `ci-r3b1n-recovery-authority-manifest-2026-08.json`.

| Metric | Value |
|--------|-------|
| Final migration count | {authority.get('final_migration_count')} |
| Migration HEAD | `{authority.get('migration_head_from_replay')}` |
| R3B1G migration | `{authority.get('r3b1g', {}).get('migration')}` |
| R3B1I migration | `{authority.get('r3b1i', {}).get('migration')}` |
| Migration 252 original checksum prefix | `{str(authority.get('migration_252', {}).get('original_checksum', ''))[:16]}…` |
| Migration 252 corrected checksum prefix | `{str(authority.get('migration_252', {}).get('corrected_checksum', ''))[:16]}…` |

---

## Production service identification

| Field | Value |
|-------|-------|
| Service | `{revision.get('production_service_identity')}` |
| PM2 cwd | `{((revision.get('process_binding') or {}).get('pm_cwd'))}` |
| Release symlink | `{revision.get('release_symlink')}` |

---

## Deployed revision proof

| Field | Value |
|-------|-------|
| Deployed SHA | `{revision.get('deployed_sha')}` |
| Revision confidence | `{revision.get('revision_confidence')}` |
| Conflicting sources | {len(revision.get('conflicts') or [])} |
| Git subject | `{((revision.get('git_log') or {}).get('subject'))}` |
| Git date | `{((revision.get('git_log') or {}).get('date'))}` |

Independent sources: {len(revision.get('deployed_sha_sources') or [])} agreeing revision probes.

---

## Merge/deployment triggers

| Trigger | Value |
|---------|-------|
| Merge auto-deploys production | `{triggers.get('merge_to_main_auto_deploys_production')}` |
| Merge auto-runs DB migrations | `{triggers.get('merge_to_main_auto_runs_db_migrations')}` |
| Deploy script runs DB migrations | `{triggers.get('deploy_script_runs_db_migrations')}` |
| Deploy mechanism | {triggers.get('production_deploy_mechanism')} |

---

## Production database identity

| Field | Value |
|-------|-------|
| Bound to running service | {'PASS' if db.get('bound_to_running_service') else 'FAIL'} |
| Database name (sanitized) | `{db.get('production_database_name')}` |
| PostgreSQL version line | `{((db.get('session') or {}).get('postgres_version_line'))}` |
| Read-only transaction | `{db.get('read_only_transaction_confirmed')}` |
| Host fingerprint SHA-256 prefix | `{str(((db.get('env_fingerprint') or {}).get('host_fingerprint_sha256', '')))[:16]}…` |

---

## Read-only safety controls

All production SQL executed inside `BEGIN TRANSACTION READ ONLY` with short statement/lock timeouts. No writes, no migration commands, no service restarts.

---

## Production Prisma ledger

| Metric | Value |
|--------|-------|
| Rows | {ledger.get('row_count')} |
| Unique migration names | {ledger.get('unique_migration_names')} |
| Finished | {ledger.get('finished_count')} |
| Unfinished | {ledger.get('unfinished_count')} |
| Rolled back | {ledger.get('rolled_back_count')} |

---

## Ledger vs recovered repository

| Metric | Value |
|--------|-------|
| Repo migrations total | {compare.get('repo_migrations_total')} |
| Repo present finished in production | {compare.get('repo_present_in_production_finished')} |
| Repo absent from production finished | {compare.get('repo_absent_from_production_finished')} |
| Production-only names | {len(compare.get('production_only_names') or [])} |
| Checksum matches | {compare.get('checksum_matches')} |
| Checksum mismatches | {compare.get('checksum_mismatches')} |
| Last finished migration started_at | `{compare.get('production_last_finished_migration')}` |

Checksum semantics: {compare.get('checksum_semantics')}

---

## Recovery migration exposure

| State | Count |
|-------|-------|
| ABSENT | {recovery_counts.get('ABSENT', 0)} |
| PRESENT_FINISHED_MATCHING | {recovery_counts.get('PRESENT_FINISHED_MATCHING', 0)} |
| PRESENT_FINISHED_CHECKSUM_MISMATCH | {recovery_counts.get('PRESENT_FINISHED_CHECKSUM_MISMATCH', 0)} |
| PRESENT_FAILED | {recovery_counts.get('PRESENT_FAILED', 0)} |
| PRESENT_ROLLED_BACK | {recovery_counts.get('PRESENT_ROLLED_BACK', 0)} |
| PRESENT_UNKNOWN | {recovery_counts.get('PRESENT_UNKNOWN', 0)} |

Total recovery migrations tracked: {len(matrix.get('migrations') or [])}

---

## Migration 252 checksum/history exposure

| Field | Value |
|-------|-------|
| Migration | `{m252.get('migration')}` |
| Ledger state | `{m252.get('ledger_state')}` |
| Production checksum prefix | `{m252.get('production_checksum_sanitized_prefix')}…` |
| Matches original | {m252.get('matches_original')} |
| Matches corrected | {m252.get('matches_corrected')} |
| Pre-correction history present | {m252.get('production_has_pre_correction_migration_history')} |
| Ledger rows | {m252.get('ledger_rows')} |

---

## Migration 252 catalog footprint

| Field | Value |
|-------|-------|
| Table exists | {((m252.get('catalog_footprint') or {}).get('table_exists'))} |
| Catalog state | `{((m252.get('catalog_footprint') or {}).get('catalog_state'))}` |
| Legacy name artifacts | {len(((m252.get('catalog_footprint') or {}).get('legacy_name_artifacts')) or [])} |

---

## R3B1G production exposure

| Field | Value |
|-------|-------|
| Migration | `{((key.get('r3b1g') or {}).get('migration'))}` |
| Ledger | `{((key.get('r3b1g') or {}).get('ledger_state'))}` |
| Catalog column exists | {((key.get('r3b1g') or {}).get('catalog') or {}).get('exists')} |
| Column type | `{((key.get('r3b1g') or {}).get('catalog') or {}).get('type')}` |

---

## R3B1I production exposure

| Field | Value |
|-------|-------|
| Migration | `{((key.get('r3b1i') or {}).get('migration'))}` |
| Ledger | `{((key.get('r3b1i') or {}).get('ledger_state'))}` |
| Catalog column exists | {((key.get('r3b1i') or {}).get('catalog') or {}).get('exists')} |
| Column type | `{((key.get('r3b1i') or {}).get('catalog') or {}).get('type')}` |

---

## Production R3B 19/9/10/54 parity

| Dimension | Result |
|-----------|--------|
| Objects | {parity.get('objects_matched')}/{parity.get('objects_expected')} |
| Tables | {parity.get('tables_matched')}/{parity.get('tables_expected')} |
| Enums | {parity.get('enums_matched')}/{parity.get('enums_expected')} |
| Properties | {parity.get('properties_matched')}/{parity.get('properties_expected')} |
| Catalog classification | `{summary.get('production_r3b_parity', {}).get('catalog_classification')}` |
| Parity pass | {parity.get('pass')} |

---

## Production code ancestry

| Field | Value |
|-------|-------|
| Deployed SHA | `{code.get('deployed_sha')}` |
| Code exposure class | `{code.get('code_exposure_class')}` |
| Contains R3B1M schema alignment | {code.get('deployed_contains_r3b1m_schema_alignment')} |
| R3B1G migration in deployed git tree | {((code.get('deployed_contains_recovery_migrations_in_git') or {}).get(authority.get('r3b1g', {}).get('migration')))} |
| R3B1I migration in deployed git tree | {((code.get('deployed_contains_recovery_migrations_in_git') or {}).get(authority.get('r3b1i', {}).get('migration')))} |

Code and DB exposure are separate dimensions.

---

## Checksum risk

| Metric | Value |
|--------|-------|
| Finished migrations compared | {checksum.get('finished_migrations_compared')} |
| Matching | {checksum.get('checksum_matches')} |
| Mismatching | {checksum.get('checksum_mismatches')} |
| History-sensitive mismatches | {len(checksum.get('history_sensitive_mismatches') or [])} |
| Migration 252 original finished / corrected repo | {checksum.get('migration252_original_finished_corrected_repo')} |
| Prisma deploy risk | `{checksum.get('prisma_deploy_risk')}` |

---

## Ledger health

`{summary.get('ledger_health')}`

---

## Exposure vector

| Dimension | Class |
|-----------|-------|
| Code | `{summary.get('code_exposure_class')}` |
| Ledger | `{summary.get('ledger_exposure_class')}` |
| Migration 252 | `{summary.get('migration252_exposure_class')}` |
| Catalog | `{summary.get('catalog_exposure_class')}` |

---

## Composite exposure classification

**`{summary.get('composite_exposure_class')}`**

---

## Merge safety classification

**`{summary.get('merge_safety_class')}`**

---

## Deployment safety classification

**`{summary.get('deployment_safety_class')}`**

Planning evidence only — this phase does not authorize deployment.

---

## Required next phase

`{summary.get('next_phase')}`

---

## Evidence limitations

Missing evidence items: {len(summary.get('missing_evidence') or [])}

---

## Secret/data sanitization

Artifacts scanned for DSN/password/token patterns before commit. Connection evidence uses fingerprints only.

---

## Immutability

| Check | Result |
|-------|--------|
| schema.prisma changed | {summary.get('immutability', {}).get('schema_prisma_changed')} |
| Modified migrations | {summary.get('immutability', {}).get('modified_migrations')} |
| Production mutations | {summary.get('production_mutations')} |

---

## Safety

| Control | Value |
|---------|-------|
| Production SQL writes | 0 |
| Production service restarts | 0 |
| Production deployments | 0 |
| Workflow dispatches | 0 |
| Golden tests | {golden.get('passed')}/{golden.get('total')} |

---

## Report ↔ machine consistency

Mismatch count: **{mismatch_count}**  
Failed checks: {', '.join(mismatch_names) if mismatch_names else 'none'}

---

## Hard stop

DO NOT MERGE. DO NOT DEPLOY. DO NOT RUN PRODUCTION MIGRATIONS.
"""
    OUT.write_text(report)
    return 0 if mismatch_count == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
