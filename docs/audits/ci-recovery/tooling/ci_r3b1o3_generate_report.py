#!/usr/bin/env python3
"""Generate CI-R3B1O.3 corrective acceptance report."""
from __future__ import annotations

import json
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "data"
OUT = Path(__file__).resolve().parents[1] / "ci-r3b1o3-corrective-final-acceptance-2026-08.md"


def load(name: str) -> dict:
    path = DATA / name
    return json.loads(path.read_text()) if path.exists() else {}


def main() -> int:
    s = load("ci-r3b1o3-corrective-final-acceptance-summary-2026-08.json")
    two = load("ci-r3b1o3-corrective-two-index-provenance-2026-08.json")
    timeline = load("ci-r3b1o3-corrective-index-timeline-2026-08.json")
    golden = load("ci-r3b1o3-corrective-golden-tests-2026-08.json")
    attr = load("ci-r3b1o3-corrective-final-prisma-diff-attribution-2026-08.json")

    lines = [
        "# CI-R3B1O.3 — Corrective Final Acceptance",
        "",
        f"**Status:** `{s.get('final_status')}`",
        f"**R3B1P readiness:** `{s.get('r3b1p_readiness')}`",
        "",
        "## Strict baseline",
        "",
        f"- CORRECTIVE_WORKTREE_STRICT_EMPTY: **{s.get('baseline', {}).get('CORRECTIVE_WORKTREE_STRICT_EMPTY')}**",
        "",
        "## Prior R3B1O.3 defect analysis",
        "",
        "Corrected false OUT_OF_SCOPE provenance closure, strict empty baseline gate, two-axis scope/provenance model, hardened M252 comparator, expanded golden suite.",
        "",
        "## Two index origins",
    ]
    for idx in two.get("indexes", []):
        lines.extend(
            [
                "",
                f"### `{idx.get('index_name')}`",
                "",
                f"- Creator migration: `{idx.get('creator_migration')}`",
                f"- Superseding migration: `{idx.get('superseding_migration')}`",
                f"- Creator commit: `{idx.get('creator_commit')}`",
                f"- Prisma authority: `{idx.get('prisma_authority_classification')}`",
            ]
        )

    lines.extend(
        [
            "",
            "## Two index strategy timeline",
            "",
            f"Timeline captured at T0–T3: `{json.dumps(timeline.get('timeline', {}), indent=2)}`",
            "",
            "## Two index authority decision",
        ]
    )
    for idx in two.get("indexes", []):
        lines.append(f"- `{idx.get('index_name')}` → **{idx.get('final_classification')}** ({idx.get('provenance')})")

    lines.extend(
        [
            "",
            "## Corrected two-axis provenance model",
            "",
            "Scope (R3B/M252/OTHER/UNKNOWN) is independent from provenance (PRE_EXISTING/AUTHORIZED_STRATEGY/NEW_UNAUTHORIZED/UNKNOWN).",
            "",
            "## Full final operation attribution",
            "",
            f"- Total operations: **{attr.get('total_operations')}**",
            f"- NEW_STRATEGY_DRIFT: **{attr.get('NEW_STRATEGY_DRIFT')}**",
            f"- UNATTRIBUTED: **{attr.get('UNATTRIBUTED')}**",
            f"- UNKNOWN_SCOPE: **{attr.get('UNKNOWN_SCOPE')}**",
            "",
            "## Hardened M252 comparator",
            "",
            f"- Pass: **{s.get('m252_exact_pass')}**",
            "",
            "## Expanded M252 negative suite",
            "",
            f"- Golden tests: **{golden.get('passed')}/{golden.get('required')}** passed",
            "",
            "## Golden terminal gating",
            "",
            "Golden tests execute before terminal status calculation.",
            "",
            "## Fresh winning strategy replay",
            "",
            f"- Strategy pass: **{s.get('strategy_pass')}**",
            "",
            "## Second deploy idempotency",
            "",
            f"- Pass: **{s.get('second_deploy', {}).get('pass')}**",
            "",
            "## Production immutability",
            "",
            f"- Unchanged: **{s.get('production_immutable')}**",
            "",
            "## Repository immutability",
            "",
            f"- Pass: **{s.get('repository_immutable', {}).get('pass')}**",
            "",
            "## Final status",
            "",
            f"`{s.get('final_status')}`",
            "",
            "**Changes / Architektur:** not updated (CI-recovery evidence scope only).",
        ]
    )
    OUT.write_text("\n".join(lines) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
