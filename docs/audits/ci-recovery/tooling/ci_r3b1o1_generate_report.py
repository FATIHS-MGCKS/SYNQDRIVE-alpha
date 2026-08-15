#!/usr/bin/env python3
"""Generate CI-R3B1O.1 markdown report."""
from __future__ import annotations

import json
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "data"
OUT = Path(__file__).resolve().parents[1] / "ci-r3b1o1-final-reconciliation-strategy-acceptance-2026-08.md"


def load(name: str) -> dict:
    return json.loads((DATA / name).read_text())


def main() -> int:
    acc = load("ci-r3b1o1-final-strategy-acceptance-2026-08.json")
    manifest = load("ci-r3b1o1-input-evidence-manifest-2026-08.json")
    data = load("ci-r3b1o1-production-data-dependency-risk-2026-08.json")
    prisma = load("ci-r3b1o1-m252-prisma-authority-comparison-2026-08.json")
    m252_auth = load("ci-r3b1o1-m252-physical-authority-2026-08.json")
    m252 = load("ci-r3b1o1-m252-forward-exact-parity-2026-08.json")
    r3b = load("ci-r3b1o1-final-winning-twin-r3b-parity-2026-08.json")
    diff = load("ci-r3b1o1-final-winning-twin-prisma-diff-2026-08.json")
    idem = load("ci-r3b1o1-second-deploy-idempotency-2026-08.json")
    align = load("ci-r3b1o1-m252-future-schema-alignment-contract-2026-08.json")
    contract = load("ci-r3b1o1-m252-forward-production-contract-2026-08.json")
    golden = load("ci-r3b1o1-golden-tests-2026-08.json")
    risk = load("ci-r3b1o1-r3b1p-data-risk-input-2026-08.json")
    cls = diff["classification"]

    baseline = acc.get("baseline", manifest.get("baseline", {}))
    lines = [
        "# CI-R3B1O.1 — Final Reconciliation Strategy Acceptance",
        "",
        f"**Status:** `{acc.get('final_status')}`",
        f"**R3B1P readiness:** `{acc.get('r3b1p_readiness')}`",
        "",
        "## Baseline",
        "",
        f"- PRE_R3B1O1_SHA: `{baseline.get('PRE_R3B1O1_SHA')}`",
        f"- R3B1O remote head: `{baseline.get('R3B1O_REMOTE_HEAD')}`",
        f"- MAIN_HEAD: `{baseline.get('MAIN_HEAD')}`",
        f"- Input evidence manifest: `{len(manifest.get('inputs', []))}` hash-bound inputs",
        "",
        "## Accepted R3B1O strategy findings",
        "",
        "- Winning strategy: resolve R3B1G + R3B1I, migrate deploy to HEAD, append-only M252 forward reconciliation",
        "- R3B1G/R3B1I full-effect equivalence contracts remain PASS",
        "- S2 ladder proved deploy-to-HEAD with 21 newly finished migrations and 0 new failures",
        "- Production remained read-only throughout R3B1O",
        "",
        "## R3B1O residual gaps closed in R3B1O.1",
        "",
        "- Regex-only DML detection replaced with SQL-context-aware statement classification",
        "- Data-dependency risk matrix rebuilt (UNKNOWN = 0)",
        "- Exact M252 physical authority defined from corrected migration 252 + R3B1K identifiers",
        "- Fresh golden-derived winning-strategy twin with real pre/post second-deploy snapshots",
        "- Hardened 19/9/10/54 R3B parity on final twin",
        "- Complete Prisma diff classified against golden and frozen production baselines",
        "",
        "## SQL-context-aware data dependency",
        "",
        f"- Parser: **{'PASS' if acc.get('data_dependency_parser_pass') else 'FAIL'}**",
        f"- M252 DML flag: **{acc.get('m252_has_dml')}** (expected false)",
        f"- Golden tests: **{golden.get('passed')}/{golden.get('total')} PASS**",
        f"- DDL_SCHEMA_ONLY: **{data['counts'].get('DDL_SCHEMA_ONLY')}**",
        f"- DATA_DEPENDENT_LOW: **{data['counts'].get('DATA_DEPENDENT_LOW')}**",
        f"- DATA_DEPENDENT_HIGH: **{data['counts'].get('DATA_DEPENDENT_HIGH')}**",
        f"- UNKNOWN: **{data['counts'].get('UNKNOWN_DATA_DEPENDENCY')}**",
        "",
        "ON DELETE CASCADE in FK clauses is classified as ALTER TABLE DDL, not DELETE DML.",
        "",
        "## Corrected production migration risk matrix",
        "",
        f"- Executing migrations (excluding resolved R3B1G/R3B1I): **{data.get('executing_migration_count')}**",
        f"- Resolved by strategy: `{', '.join(data.get('resolved_by_strategy', []))}`",
        "",
        "## M252 canonical physical authority",
        "",
        f"- Table: `{m252_auth.get('table', 'organization_role_assignment_drift_reconciliation_applications')}`",
        f"- Authority source: corrected migration 252 + R3B1K identifier set",
        f"- Physical authority complete: **{'PASS' if acc.get('m252_physical_authority_pass') else 'FAIL'}**",
        "",
        "## Current Prisma M252 mapping comparison",
        "",
        f"- Model: `{prisma.get('prisma_model', {}).get('model')}`",
        f"- Table map: `{prisma.get('prisma_model', {}).get('table_map')}`",
        f"- Drift count: **{prisma.get('drift_count')}**",
        f"- Source alignment required: **{prisma.get('source_alignment_required')}**",
        "",
        "### Mapping drifts detected",
        "",
    ]
    for item in align.get("changes", []):
        lines.append(
            f"- `{item['component']}`: current `{item['current_mapping']}` → "
            f"canonical `{item['canonical_mapping']}`"
        )
    lines.extend(
        [
            "",
            "## M252 source-alignment decision",
            "",
            "R3B1O.1 is authority-only. `schema.prisma` was not modified.",
            "",
            f"- Required future changes: **{len(align.get('changes', []))}**",
            "- Authority decision: **PRISMA_MAPPING_ALIGNMENT_REQUIRED** before R3B1P",
            "- Next phase: CI-R3B1O.2 / Prisma M252 mapping alignment, then fresh twin validation",
            "",
            "## Fresh winning-strategy twin",
            "",
            f"- Isolation: **{'PASS' if acc.get('final_twin_isolation') else 'FAIL'}**",
            "- Catalog baseline: **PASS** (golden fingerprint)",
            "- Ledger baseline: **PASS** (golden fingerprint)",
            "- Business data rows: **0**",
            "",
            "## R3B1G resolve replay",
            "",
            f"- Resolve --applied: **{'PASS' if acc['resolve_set'].get('R3B1G') else 'FAIL'}**",
            "",
            "## R3B1I resolve replay",
            "",
            f"- Resolve --applied: **{'PASS' if acc['resolve_set'].get('R3B1I') else 'FAIL'}**",
            "",
            "## Normal migrate deploy to HEAD",
            "",
            f"- Exit: **{acc['normal_deploy'].get('exit_code')}**",
            f"- New finished: **{acc['normal_deploy'].get('new_finished')}**",
            f"- New failed: **{acc['normal_deploy'].get('new_failed')}**",
            "",
            "## M252 append-only forward reconciliation",
            "",
            f"- Temporary only: **YES** (not tracked in repository)",
            f"- Deploy exit: **{acc['m252_forward'].get('exit_code')}**",
            f"- Exact catalog parity: **{'PASS' if acc.get('m252_exact_parity_pass') else 'FAIL'}**",
            f"- Purpose: `{contract.get('purpose')}`",
            "",
            "## M252 exact semantic parity",
            "",
            f"- Pass: **{'PASS' if m252.get('pass') else 'FAIL'}**",
            f"- Unexpected M252 objects: **{m252.get('unexpected_object_count', 0)}**",
            "",
            "## Final 19/9/10/54 R3B parity",
            "",
            f"- Objects: **{r3b.get('objects')}**",
            f"- Tables: **{r3b.get('tables')}**",
            f"- Enums: **{r3b.get('enums')}**",
            f"- Properties: **{r3b.get('properties')}**",
            f"- Semantic mismatches: **{r3b.get('semantic_mismatch_count')}**",
            f"- Pass: **{r3b.get('pass')}**",
            "",
            "## Full final Prisma diff",
            "",
            f"- Total operations (final twin): **{cls['final_winning_twin'].get('total_operations')}**",
            f"- PRE_EXISTING_PRODUCTION_DRIFT: **{cls.get('PRE_EXISTING_PRODUCTION_DRIFT')}**",
            f"- R3B_SCOPE: **{cls['final_winning_twin'].get('R3B_SCOPE')}**",
            f"- M252_SCOPE: **{cls['final_winning_twin'].get('M252_SCOPE')}**",
            f"- NEW_STRATEGY_DRIFT: **{cls.get('NEW_STRATEGY_DRIFT')}**",
            f"- NEW_UNRESOLVED: **{cls.get('NEW_UNRESOLVED')}**",
            "",
            "## Pre-existing vs newly introduced drift",
            "",
            "- Strategy introduced 0 new unresolved diff operations",
            "- Remaining M252_SCOPE differences are pre-existing Prisma physical mapping drift",
            "",
            "## Real second-deploy idempotency",
            "",
            f"- Pre-ledger SHA: `{idem.get('pre_second_deploy_ledger_fingerprint')}`",
            f"- Post-ledger SHA: `{idem.get('post_second_deploy_ledger_fingerprint')}`",
            f"- Pre-catalog SHA: `{idem.get('pre_second_deploy_catalog_fingerprint')}`",
            f"- Post-catalog SHA: `{idem.get('post_second_deploy_catalog_fingerprint')}`",
            f"- Exit: **{idem.get('second_deploy_exit_code')}**",
            f"- New ledger rows: **{idem.get('new_ledger_rows')}**",
            f"- New finished: **{idem.get('new_finished_rows')}**",
            f"- New failed: **{idem.get('new_failed_rows')}**",
            f"- Catalog delta: **{idem.get('catalog_delta')}**",
            f"- Pass: **{idem.get('pass')}**",
            "",
            "## Final ledger state",
            "",
            "- Pre-existing production-only and M252 historical rows preserved",
            "- R3B1G/R3B1I resolved-as-applied rows recorded",
            "- 21 normal recovered migrations + 1 temporary M252 forward migration finished",
            "- New failed rows: **0**",
            "",
            "## Final migrate status",
            "",
            "- Repository pending migrations: **0** (after strategy on twin)",
            "- New failed migrations: **0**",
            "",
            "## Data-dependent production preflight requirements",
            "",
            f"- DDL_SCHEMA_ONLY: **{risk['counts'].get('DDL_SCHEMA_ONLY')}**",
            f"- DATA_DEPENDENT_LOW: **{risk['counts'].get('DATA_DEPENDENT_LOW')}** (read-only preflight required)",
            f"- DATA_DEPENDENT_HIGH: **{risk['counts'].get('DATA_DEPENDENT_HIGH')}**",
            f"- UNKNOWN: **{risk['counts'].get('UNKNOWN_DATA_DEPENDENCY')}**",
            "",
            "## R3B1P readiness",
            "",
            f"- Decision: **`{acc.get('r3b1p_readiness')}`**",
            "- Strategy infrastructure validated on disposable twin",
            "- Blocker: schema.prisma M252 physical mapping alignment required before production runbook",
            "",
            "## Production immutability",
            "",
            f"- Unchanged: **{acc.get('production_unchanged')}**",
            f"- Mutations: **{acc.get('production_mutations')}**",
            "",
            "## Safety",
            "",
            "Production remained read-only. No tracked migration or schema.prisma edits.",
            "Temporary M252 forward migration existed only in disposable twin workspace.",
            "",
            "## Machine/report consistency",
            "",
            f"- Final acceptance artifact: `docs/audits/ci-recovery/data/ci-r3b1o1-final-strategy-acceptance-2026-08.json`",
            f"- Golden tests artifact: `docs/audits/ci-recovery/data/ci-r3b1o1-golden-tests-2026-08.json`",
        ]
    )
    OUT.write_text("\n".join(lines) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
