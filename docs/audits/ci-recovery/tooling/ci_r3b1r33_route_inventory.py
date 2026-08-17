#!/usr/bin/env python3
"""Scan backend source for Express 5 sensitive route/path patterns."""
from __future__ import annotations

import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
SRC = REPO / "backend" / "src"

DECORATOR_RE = re.compile(
    r"@(Controller|Get|Post|Put|Patch|Delete|All|Options|Head)\(([^)]*)\)",
    re.MULTILINE,
)
SENSITIVE_CHARS = set("*?()[]+!")
EXPRESS5_WILDCARD_RE = re.compile(r"\*|\(\.\*\)|/\*")


def classify_pattern(text: str) -> str:
    t = text.strip().strip("'\"")
    if not t:
        return "EMPTY"
    if EXPRESS5_WILDCARD_RE.search(t):
        return "EXPRESS5_REQUIRES_REWRITE"
    if any(c in t for c in SENSITIVE_CHARS):
        return "EXPRESS5_SENSITIVE"
    return "STANDARD"


def scan_file(path: Path) -> list[dict]:
    rel = path.relative_to(REPO).as_posix()
    text = path.read_text(encoding="utf-8", errors="replace")
    rows: list[dict] = []
    for m in DECORATOR_RE.finditer(text):
        deco, args = m.group(1), m.group(2)
        # split array entries crudely
        parts = re.findall(r"'([^']*)'|\"([^\"]*)\"", args) or [(args.strip(), "")]
        patterns = [a or b for a, b in parts] if parts else [args.strip()]
        for p in patterns:
            cls = classify_pattern(p)
            rows.append(
                {
                    "file": rel,
                    "decorator": deco,
                    "pattern": p,
                    "classification": cls,
                }
            )
    return rows


def main() -> None:
    rows: list[dict] = []
    for path in sorted(SRC.rglob("*.ts")):
        if path.name.endswith(".spec.ts"):
            continue
        rows.extend(scan_file(path))
    summary = {
        "total_route_patterns": len(rows),
        "express5_sensitive_route_patterns": sum(1 for r in rows if r["classification"] == "EXPRESS5_SENSITIVE"),
        "express5_requires_rewrite_patterns": sum(1 for r in rows if r["classification"] == "EXPRESS5_REQUIRES_REWRITE"),
        "express5_confirmed_incompatible_patterns": sum(
            1 for r in rows if r["classification"] == "EXPRESS5_REQUIRES_REWRITE"
        ),
        "patterns": rows,
    }
    import json
    import sys

    json.dump(summary, sys.stdout, indent=2)


if __name__ == "__main__":
    main()
