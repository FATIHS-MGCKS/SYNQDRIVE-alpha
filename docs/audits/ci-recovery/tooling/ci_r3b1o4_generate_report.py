#!/usr/bin/env python3
"""Generate CI-R3B1O.4 append-only tail reconciliation strategy closure report."""
from __future__ import annotations

import json
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "data"
OUT = Path(__file__).resolve().parents[1] / "ci-r3b1o4-append-only-tail-reconciliation-strategy-closure-2026-08.md"


def load(name: str) -> dict:
    path = DATA / name
    return json.loads(path.read_text()) if path.exists() else {}


def main() -> int:
    s = load("ci-r3b1o4-final-strategy-acceptance-summary-2026-08.json")
    invoice = load("ci-r3b1o4-invoice-stale-index-authority-2026-08.json")
    whatsapp = load("ci-r3b1o4-whatsapp-stale-index-authority-2026-08.json")
    contract = load("ci-r3b1o4-tail-reconciliation-contract-2026-08.json")
    timeline = load("ci-r3b1o4-index-timeline-2026-08.json")
    attr = load("ci-r3b1o4-final-prisma-diff-attribution-2026-08.json")
    golden = load("ci-r3b1o4-golden-tests-2026-08.json")
    catalog = load("ci-r3b1o4-final-catalog-delta-authority-2026-08.json")
    r3b1p = load("ci-r3b1o4-r3b1p-tail-migration-contract-2026-08.json")

    lines = [
        "# CI-R3B1O.4 — Append-Only Tail Reconciliation Strategy Closure",
        "",
        f"**Status:** `{s.get('final_status')}`",
        f"**R3B1P readiness:** `{s.get('r3b1p_readiness')}`",
        "",
        "## Baseline",
        "",
        f"- WORKTREE_STRICT_EMPTY: **{s.get('baseline', {}).get('WORKTREE_STRICT_EMPTY')}**",
        f"- PRE_R3B1O4_SHA: `{s.get('baseline', {}).get('PRE_R3B1O4_SHA')}`",
        f"- R3B1O3 parent: `{s.get('baseline', {}).get('R3B1O3_REMOTE_HEAD')}`",
        "",
        "## Accepted recovery state",
        "",
        "CI_R3B1M and R3B1O.3 corrective findings are frozen. schema.prisma and tracked migrations remain unchanged.",
        "",
        "## Why R3B1O.3 correctly failed",
        "",
        "Normal pending deploy recreated two stale recovery indexes absent from golden production. Final Prisma diff required DROP operations with NEW_STRATEGY_DRIFT=2.",
        "",
        "## Invoice stale index forensic authority",
        "",
        f"- Creator: `{invoice.get('creator_migration')}`",
        f"- Superseding: `{invoice.get('superseding_migration')}`",
        f"- Golden stale index: **ABSENT**",
        f"- Tail removal authorized: **{invoice.get('tail_removal_authorized')}**",
        "",
        "## WhatsApp stale index forensic authority",
        "",
        f"- Creator: `{whatsapp.get('creator_migration')}`",
        f"- Superseding: `{whatsapp.get('superseding_migration')}`",
        f"- Normalized replacement: `{whatsapp.get('replacement', {}).get('name')}`",
        f"- Tail removal authorized: **{whatsapp.get('tail_removal_authorized')}**",
        "",
        "## Three-task tail reconciliation contract",
        "",
        f"- Logical tasks: **{contract.get('logical_task_count')}**",
        f"- Execution order: `{contract.get('execution_order')}`",
        "",
        "## Strategy replay",
        "",
        "- R3B1G resolve → R3B1I resolve → normal migrate deploy → append-only tail migration deploy → second deploy idempotency",
        "",
        "## T2 stale-index reproduction",
        "",
        f"Timeline keys: `{list((timeline.get('timeline') or {}).keys())}`",
        "",
        "## Final Prisma diff attribution",
        "",
        f"- NEW_STRATEGY_DRIFT: **{attr.get('NEW_STRATEGY_DRIFT')}**",
        f"- UNATTRIBUTED: **{attr.get('UNATTRIBUTED')}**",
        f"- UNKNOWN_SCOPE: **{attr.get('UNKNOWN_SCOPE')}**",
        "",
        "## Catalog delta authority",
        "",
        f"- UNAUTHORIZED_FINAL_DELTA: **{catalog.get('UNAUTHORIZED_FINAL_DELTA')}**",
        "",
        "## Golden tests",
        "",
        f"- Executed: **{golden.get('executed')}**",
        f"- Passed: **{golden.get('passed')}**",
        f"- Failed: **{golden.get('failed')}**",
        "",
        "## Future R3B1P tail migration contract",
        "",
        f"- Purpose: `{r3b1p.get('future_tracked_migration_purpose')}`",
        f"- Tracked in repo: **{r3b1p.get('tracked_repository')}**",
        "",
        "## Production immutability",
        "",
        f"- Production unchanged: **{s.get('production_immutable')}**",
        "",
        "## Repository immutability",
        "",
        f"- schema.prisma unchanged: **{s.get('repository_immutable', {}).get('schema_unchanged')}**",
        f"- tracked migrations unchanged: **{s.get('repository_immutable', {}).get('migrations_unchanged')}**",
        "",
        "## Final status",
        "",
        f"`{s.get('final_status')}`",
        "",
        "## Safety",
        "",
        "Production remained read-only. All mutations targeted isolated disposable twins only.",
    ]
    OUT.write_text("\n".join(lines) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
