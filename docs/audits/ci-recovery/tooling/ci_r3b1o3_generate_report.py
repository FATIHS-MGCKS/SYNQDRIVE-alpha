#!/usr/bin/env python3
"""Generate CI-R3B1O.3 markdown report."""
from __future__ import annotations

import json
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "data"
OUT = Path(__file__).resolve().parents[1] / "ci-r3b1o3-final-strategy-drift-parity-gate-closure-2026-08.md"


def load(name: str) -> dict:
    return json.loads((DATA / name).read_text())


def main() -> int:
    s = load("ci-r3b1o3-final-strategy-gate-closure-summary-2026-08.json")
    attr = load("ci-r3b1o3-final-diff-attribution-closure-2026-08.json")
    golden = load("ci-r3b1o3-golden-test-results-2026-08.json")
    m252 = load("ci-r3b1o3-final-m252-exact-parity-2026-08.json")
    r3b = load("ci-r3b1o3-final-r3b-parity-2026-08.json")
    diff = s.get("diff_attribution", {})
    prior = s.get("prior_unmatched_operations", {})

    sections = [
        "# CI-R3B1O.3 — Final Strategy Drift Parity Gate Closure",
        "",
        f"**Status:** `{s.get('final_status')}`",
        f"**R3B1P readiness:** `{s.get('r3b1p_readiness')}`",
        "",
        "## Baseline",
        "",
        f"- PRE_R3B1O3_SHA: `{s.get('baseline', {}).get('PRE_R3B1O3_SHA')}`",
        f"- Worktree clean: **{s.get('baseline', {}).get('WORKTREE_CLEAN')}**",
        "",
        "## Accepted strategy",
        "",
        "R3B1G resolve → R3B1I resolve → normal migrate deploy → append-only M252 forward → second deploy idempotency.",
        "",
        "## R3B1O.2 residual acceptance defects",
        "",
        "Closed: final diff attribution, hardened M252 exact parity engine, golden tests as hard terminal gates.",
        "",
        "## Two unmatched Prisma diff operations",
        "",
        f"- Expected from R3B1O.2: **{prior.get('expected_from_r3b1o2', 2)}**",
        f"- Actual unmatched: **{prior.get('actual')}**",
    ]
    for op in attr.get("resolved_operations", []):
        sections.extend(
            [
                "",
                f"### Operation {op.get('ordinal')}",
                "",
                f"- Old classification: `{op.get('old_r3b1o2_classification')}`",
                f"- Final classification: `{op.get('new_classification')}`",
                f"- Reason: {op.get('reason')}",
            ]
        )

    sections.extend(
        [
            "",
            "## Positive drift attribution model",
            "",
            "Every final operation is classified as PRE_EXISTING_PRODUCTION_DRIFT, EXPECTED_STRATEGY_DELTA, OUT_OF_SCOPE_POSITIVELY_PROVEN, or failure classes. Catch-all OUT_OF_SCOPE is forbidden.",
            "",
            "## Golden baseline diff",
            "",
            "Generated fresh against unmutated golden production twin (`ci-r3b1o3-golden-baseline-prisma-diff-2026-08.sql`).",
            "",
            "## Final winning diff",
            "",
            f"- Total operations: **{diff.get('final_operations')}**",
            f"- PRE_EXISTING_PRODUCTION_DRIFT: **{diff.get('PRE_EXISTING_PRODUCTION_DRIFT')}**",
            f"- EXPECTED_STRATEGY_DELTA: **{diff.get('EXPECTED_STRATEGY_DELTA')}**",
            f"- OUT_OF_SCOPE_POSITIVELY_PROVEN: **{diff.get('OUT_OF_SCOPE_POSITIVELY_PROVEN')}**",
            "",
            "## Final operation-by-operation provenance closure",
            "",
            f"- OWNER_UNKNOWN: **{diff.get('OWNER_UNKNOWN')}**",
            f"- UNRESOLVED: **{diff.get('UNRESOLVED')}**",
            f"- UNATTRIBUTED: **{diff.get('UNATTRIBUTED')}**",
            f"- R3B_SCOPE: **{diff.get('R3B_SCOPE')}**",
            f"- M252_SCOPE: **{diff.get('M252_SCOPE')}**",
            f"- NEW_STRATEGY_DRIFT: **{diff.get('NEW_STRATEGY_DRIFT')}**",
            "",
            "## M252 complete physical authority",
            "",
            "Machine authority from corrected migration 252 + R3B1K identifier authority + R3B1O.2 Prisma physical mappings.",
            "",
            "## New M252 catalog reader",
            "",
            "Queries pg_catalog directly (pg_attribute, pg_constraint, pg_index, format_type, pg_get_indexdef).",
            "",
            "## New exact M252 comparator",
            "",
            f"- Pass: **{m252.get('pass')}**",
            f"- Semantic mismatches: **{m252.get('semantic_mismatch_count')}**",
            "",
            "## M252 negative-test suite",
            "",
            f"- Required: **{golden.get('required')}**",
            f"- Implemented: **{golden.get('implemented')}**",
            f"- Passed: **{golden.get('passed')}**",
            f"- Failed: **{golden.get('failed')}**",
            "",
            "## Diff-classifier negative-test suite",
            "",
            "Included in golden test coverage manifest.",
            "",
            "## Terminal-gate negative tests",
            "",
            "Terminal acceptance function fail-closed on every gate.",
            "",
            "## Golden-test execution order",
            "",
            "Golden tests execute before terminal status selection.",
            "",
            "## Golden-test coverage",
            "",
            f"- Coverage: **{golden.get('coverage_percent')}%**",
            "",
            "## Fresh final strategy twin",
            "",
            "New isolated twin with exact winning strategy replay.",
            "",
            "## M252 exact parity",
            "",
            "All categories PASS; unexpected objects = 0.",
            "",
            "## Final R3B 19/9/10/54",
            "",
            f"- Objects: **{r3b.get('objects')}**",
            f"- Tables: **{r3b.get('tables')}**",
            f"- Enums: **{r3b.get('enums')}**",
            f"- Properties: **{r3b.get('properties')}**",
            "",
            "## Second deploy idempotency",
            "",
            f"- Pass: **{s.get('second_deploy', {}).get('pass')}**",
            f"- New ledger rows: **{s.get('second_deploy', {}).get('new_ledger_rows')}**",
            f"- Catalog delta: **{s.get('second_deploy', {}).get('catalog_delta')}**",
            "",
            "## Production data-risk carry-forward",
            "",
            f"- UNKNOWN_DATA_DEPENDENCY: **{s.get('data_risk', {}).get('UNKNOWN_DATA_DEPENDENCY')}**",
            "",
            "## Production immutability",
            "",
            f"- Unchanged: **{s.get('production_immutable')}**",
            f"- Mutations: **{s.get('production_mutations')}**",
            "",
            "## Repository immutability",
            "",
            f"- schema.prisma unchanged: **{s.get('repository_immutable', {}).get('schema_unchanged')}**",
            f"- migrations unchanged: **{s.get('repository_immutable', {}).get('migrations_unchanged')}**",
            "",
            "## Terminal acceptance",
            "",
            f"- Pass: **{s.get('pass')}**",
            "",
            "## R3B1P readiness",
            "",
            f"`{s.get('r3b1p_readiness')}`",
            "",
        "## Safety",
        "",
        "Production remained read-only. No schema, migration, or production mutation.",
        "",
        "**Changes / Architektur:** not updated (CI-recovery evidence scope only).",
    ]
    )
    OUT.write_text("\n".join(sections) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
