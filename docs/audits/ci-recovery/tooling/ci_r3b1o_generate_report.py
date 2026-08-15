#!/usr/bin/env python3
"""Generate CI-R3B1O markdown report from machine artifacts."""
from __future__ import annotations

import json
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "data"
OUT = Path(__file__).resolve().parents[1] / "ci-r3b1o-ledger-history-reconciliation-strategy-simulation-2026-08.md"


def load(name: str) -> dict:
    return json.loads((DATA / name).read_text())


def main() -> int:
    summary = load("ci-r3b1o-final-strategy-simulation-summary-2026-08.json")
    checksum = load("ci-r3b1o-checksum-provenance-preflight-2026-08.json")
    guard = load("ci-r3b1o-mutation-target-guard-preflight-2026-08.json")
    golden = load("ci-r3b1o-golden-production-twin-manifest-2026-08.json")
    contracts = load("ci-r3b1o-migration-effect-equivalence-contracts-2026-08.json")
    blockers = load("ci-r3b1o-corrected-production-blocker-baseline-2026-08.json")
    results = load("ci-r3b1o-strategy-results-2026-08.json")
    selected = load("ci-r3b1o-selected-reconciliation-strategy-2026-08.json")
    runbook = load("ci-r3b1o-r3b1p-runbook-input-2026-08.json")
    data_dep = load("ci-r3b1o-production-data-dependency-risk-2026-08.json")

    cs = checksum["summary"]
    s0 = results.get("control_s0") or {}
    s1 = results.get("strategy_s1")
    s2 = results.get("strategy_s2")

    lines = [
        "# CI-R3B1O — Combined Ledger / History Reconciliation Strategy Simulation",
        "",
        f"**Status:** `{summary.get('final_status')}`",
        f"**R3B1P readiness:** `{runbook.get('r3b1p_readiness')}`",
        "",
        "## Baseline",
        "",
        f"- PRE_R3B1O_SHA: `{summary.get('baseline', {}).get('PRE_R3B1O_SHA')}`",
        f"- R3B1N2 remote head: `{summary.get('baseline', {}).get('R3B1N2_REMOTE_HEAD')}`",
        "",
        "## Checksum provenance preflight closure",
        "",
        f"- MATCHES_NONE: **{cs.get('matches_none')}**",
        f"- UNRESOLVED: **{cs.get('unresolved')}**",
        f"- Post-deploy history mutations: **{cs.get('post_deploy_historical_migration_mutations')}**",
        f"- Identifier-only history mutations: **{cs.get('identifier_only_history_mutations')}**",
        f"- Mixed-EOL matches: **{cs.get('match_mixed_eol')}**",
        "",
        "## Mutation target guard",
        "",
        f"- Exact instance required: **{guard.get('exact_instance_required')}**",
        f"- Exact database required: **{guard.get('exact_database_required')}**",
        f"- Guard preflight: **{'PASS' if guard.get('pass') else 'FAIL'}**",
        "",
        "## Golden isolated production twin",
        "",
        f"- Catalog fidelity: **{'PASS' if golden.get('catalog_fidelity_pass') else 'FAIL'}**",
        f"- Ledger fidelity: **{'PASS' if golden.get('ledger_fidelity_pass') else 'FAIL'}**",
        f"- Business data rows: **{golden.get('business_row_total', 0)}**",
        "",
        "## Effect contracts",
        "",
        f"- Full equivalent: **{contracts['summary'].get('full_equivalent')}**",
        f"- Partial: **{contracts['summary'].get('partial')}**",
        f"- Absent: **{contracts['summary'].get('absent')}**",
        "",
        "## Control S0",
        "",
        f"- New finished before failure: **{s0.get('first_deploy', {}).get('new_finished')}**",
        f"- New failed: **{s0.get('first_deploy', {}).get('new_failed')}**",
        f"- First failure: `{s0.get('first_deploy', {}).get('first_failing_migration')}`",
        f"- Prisma: `{s0.get('first_deploy', {}).get('prisma_error_code')}`",
        f"- DB code: `{s0.get('first_deploy', {}).get('database_error_code')}`",
        "",
    ]

    if s1:
        lines += [
            "## Strategy S1 (R3B1G resolved)",
            "",
            f"- First deploy exit: **{s1.get('first_deploy', {}).get('exit_code')}**",
            f"- Next blocker: `{s1.get('first_deploy', {}).get('first_failing_migration')}`",
            "",
        ]
    if s2:
        lines += [
            "## Strategy S2 (R3B1G + R3B1I resolved)",
            "",
            f"- First deploy exit: **{s2.get('first_deploy', {}).get('exit_code')}**",
            f"- Second deploy pass: **{s2.get('second_deploy', {}).get('exit_code') == 0}**",
            "",
        ]

    lines += [
        "## Selected strategy",
        "",
        f"- ID: `{selected.get('selected_strategy_id')}`",
        f"- Why: {selected.get('why_selected')}",
        "",
        "## Production immutability",
        "",
        f"- Production fingerprints unchanged: **{summary.get('production_fingerprints_unchanged')}**",
        f"- Production mutations: **{summary.get('production_mutations')}**",
        "",
        "## Data dependency",
        "",
        f"- DDL_SCHEMA_ONLY: **{data_dep['counts'].get('DDL_SCHEMA_ONLY')}**",
        f"- DATA_DEPENDENT_HIGH: **{data_dep['counts'].get('DATA_DEPENDENT_HIGH')}**",
        f"- UNKNOWN: **{data_dep['counts'].get('UNKNOWN_DATA_DEPENDENCY')}**",
        "",
        "## Safety",
        "",
        "Production remained read-only. No tracked migration changes. No production reconcile/deploy executed in R3B1O.",
    ]
    OUT.write_text("\n".join(lines) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
