#!/usr/bin/env python3
"""Simplify redundant isDarkMode text ternaries after token migration."""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "src"

SIMPLIFY: list[tuple[str, str]] = [
    (r"isDarkMode \? 'text-muted-foreground' : 'text-muted-foreground'", "text-muted-foreground"),
    (r"isDarkMode \? 'text-foreground' : 'text-foreground'", "text-foreground"),
    (r"isDarkMode \? 'text-white' : 'text-foreground'", "text-foreground"),
    (r"isDarkMode \? 'text-brand' : 'text-brand'", "text-brand"),
    (r"isDarkMode \? 'text-status-info' : 'text-status-info'", "text-status-info"),
    (r"d \? 'text-neutral-100' : 'text-foreground'", "text-foreground"),
    (r"isDarkMode \? 'text-foreground/85' : 'text-foreground'", "text-foreground"),
    (r"\$\{isDarkMode \? 'text-muted-foreground' : 'text-muted-foreground'\}", "text-muted-foreground"),
]


def main() -> int:
    changed = 0
    for path in sorted(ROOT.rglob("*.tsx")) + sorted(ROOT.rglob("*.ts")):
        text = path.read_text(encoding="utf-8")
        original = text
        for pattern, repl in SIMPLIFY:
            text = text.replace(pattern, repl)
        # cn(..., isDarkMode ? 'text-foreground' : 'text-foreground') leftover
        text = re.sub(
            r"isDarkMode \? 'text-foreground' : 'text-foreground'",
            "text-foreground",
            text,
        )
        if text != original:
            path.write_text(text, encoding="utf-8")
            changed += 1
            print(path.relative_to(ROOT))
    print(f"Simplified {changed} files")
    return 0


if __name__ == "__main__":
    sys.exit(main())
