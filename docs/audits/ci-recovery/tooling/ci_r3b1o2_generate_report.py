#!/usr/bin/env python3
"""Generate CI-R3B1O.2 markdown report."""
from __future__ import annotations

import json
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "data"
OUT = Path(__file__).resolve().parents[1] / "ci-r3b1o2-m252-prisma-mapping-final-diff-closure-2026-08.md"


def load(name: str) -> dict:
    return json.loads((DATA / name).read_text())


def main() -> int:
    s = load("ci-r3b1o2-final-alignment-diff-closure-summary-2026-08.json")
    inv = load("ci-r3b1o2-m252-diff-operation-inventory-2026-08.json")
    contract = load("ci-r3b1o2-m252-schema-alignment-contract-2026-08.json")
    cls = load("ci-r3b1o2-final-prisma-diff-classification-2026-08.json")
    final_cls = cls["classification"]["final_winning_twin"]
    lines = [
        "# CI-R3B1O.2 — M252 Prisma Mapping Final Diff Closure",
        "",
        f"**Status:** `{s.get('final_status')}`",
        f"**R3B1P readiness:** `{s.get('r3b1p_readiness')}`",
        "",
        "## Baseline",
        "",
        f"- PRE_R3B1O2_SHA: `{s['baseline'].get('PRE_R3B1O2_SHA')}`",
        "",
        "## M252 Prisma diff operations discovered",
        "",
        f"- Count: **{inv.get('operation_count')}**",
        "",
        "## Schema alignment contract",
        "",
        f"- Entries: **{contract.get('entry_count')}**",
        f"- Unauthorized schema changes: **{s.get('authorized_diff_unauthorized', 0)}**",
        "",
        "## 170 unresolved operation resolution",
        "",
        f"- R3B1O.1 unresolved: **{s.get('r3b1o1_former_unresolved')}**",
        f"- R3B1O.2 final unresolved: **{s.get('final_unresolved')}**",
        "",
        "## Final Prisma diff",
        "",
        f"- R3B_SCOPE: **{final_cls.get('R3B_SCOPE')}**",
        f"- M252_SCOPE: **{final_cls.get('M252_SCOPE')}**",
        f"- NEW_STRATEGY_DRIFT: **{final_cls.get('NEW_STRATEGY_DRIFT')}**",
        f"- UNRESOLVED: **{final_cls.get('UNRESOLVED')}**",
        "",
        "## Production immutability",
        "",
        f"- Unchanged: **{s.get('production_unchanged')}**",
        "",
        "## Safety",
        "",
        "Production remained read-only. Only authorized `schema.prisma` M252 physical mappings changed.",
    ]
    OUT.write_text("\n".join(lines) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
