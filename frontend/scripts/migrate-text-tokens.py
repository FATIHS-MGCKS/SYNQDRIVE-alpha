#!/usr/bin/env python3
"""Migrate legacy text-gray/slate/neutral classes to semantic tokens."""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "src"

SKIP_FILES: set[str] = {
    # Semantic status badge tones — keep slate for UNKNOWN state
    "rental/components/users-roles/IamBadges.tsx",
}

# Ternary pairs → single semantic class (both branches neutral typography)
TERNARY_REPLACEMENTS: list[tuple[str, str]] = [
    (r"isDarkMode \? 'text-white' : 'text-gray-900'", "text-foreground"),
    (r"isDarkMode \? 'text-white' : 'text-foreground'", "text-foreground"),
    (r"isDarkMode \? 'text-gray-100' : 'text-gray-900'", "text-foreground"),
    (r"isDarkMode \? 'text-gray-200' : 'text-gray-900'", "text-foreground"),
    (r"isDarkMode \? 'text-gray-200' : 'text-gray-700'", "text-foreground"),
    (r"isDarkMode \? 'text-gray-200' : 'text-gray-800'", "text-foreground"),
    (r"isDarkMode \? 'text-gray-300' : 'text-gray-900'", "text-foreground"),
    (r"isDarkMode \? 'text-gray-300' : 'text-gray-800'", "text-foreground"),
    (r"isDarkMode \? 'text-gray-300' : 'text-gray-700'", "text-foreground"),
    (r"isDarkMode \? 'text-gray-300' : 'text-gray-600'", "text-foreground"),
    (r"isDarkMode \? 'text-foreground/85' : 'text-gray-700'", "text-foreground"),
    (r"isDarkMode \? 'text-muted-foreground' : 'text-gray-500'", "text-muted-foreground"),
    (r"isDarkMode \? 'text-muted-foreground' : 'text-gray-600'", "text-muted-foreground"),
    (r"isDarkMode \? 'text-gray-400' : 'text-gray-500'", "text-muted-foreground"),
    (r"isDarkMode \? 'text-gray-500' : 'text-gray-400'", "text-muted-foreground"),
    (r"isDarkMode \? 'text-gray-500' : 'text-gray-300'", "text-muted-foreground"),
    (r"isDarkMode \? 'text-gray-500' : 'text-muted-foreground'", "text-muted-foreground"),
    (r"isDarkMode \? 'text-gray-600' : 'text-gray-500'", "text-muted-foreground"),
    (r"isDarkMode \? 'text-gray-600' : 'text-gray-300'", "text-muted-foreground"),
    (r"isDarkMode \? 'text-gray-600' : 'text-gray-400'", "text-muted-foreground"),
    (r"isDarkMode \? 'text-gray-300' : 'text-gray-500'", "text-muted-foreground"),
    (r"d \? 'text-neutral-100' : 'text-gray-900'", "text-foreground"),
    (r"d \? 'text-neutral-300' : 'text-gray-600'", "text-foreground"),
    (r"d \? 'text-neutral-300' : 'text-gray-700'", "text-foreground"),
    (r"d \? 'text-neutral-400' : 'text-gray-500'", "text-muted-foreground"),
    (r"d \? 'text-neutral-500' : 'text-gray-500'", "text-muted-foreground"),
    (r"d \? 'text-neutral-400' : 'text-gray-600'", "text-muted-foreground"),
    (r"d \? 'text-gray-300' : 'text-gray-600'", "text-foreground"),
    (r"d \? 'text-gray-500' : 'text-gray-400'", "text-muted-foreground"),
]

# Standalone class replacements (word boundary)
PRIMARY_CLASSES = [
    "text-gray-900", "text-gray-800", "text-gray-700",
    "text-slate-900", "text-slate-800", "text-slate-700",
    "text-neutral-900", "text-neutral-800", "text-neutral-700", "text-neutral-200",
    "text-zinc-900", "text-zinc-800", "text-zinc-700",
]
MUTED_CLASSES = [
    "text-gray-600", "text-gray-500", "text-gray-400", "text-gray-300",
    "text-slate-600", "text-slate-500", "text-slate-400", "text-slate-300",
    "text-neutral-600", "text-neutral-500", "text-neutral-400", "text-neutral-300",
    "text-zinc-600", "text-zinc-500", "text-zinc-400",
]


def migrate_text(content: str) -> str:
    for pattern, replacement in TERNARY_REPLACEMENTS:
        content = content.replace(pattern, replacement)

    for cls in PRIMARY_CLASSES:
        content = re.sub(rf"\b{re.escape(cls)}\b", "text-foreground", content)

    for cls in MUTED_CLASSES:
        content = re.sub(rf"\b{re.escape(cls)}\b", "text-muted-foreground", content)

    # Remaining dark-mode-only grays used as primary in dark branches already simplified;
    # clean isolated white/gray-100/200 used as primary text in dark-only contexts
    content = re.sub(r"\btext-gray-100\b", "text-foreground", content)
    content = re.sub(r"\btext-gray-200\b", "text-foreground", content)

    return content


def main() -> int:
    targets = sorted(ROOT.rglob("*.tsx")) + sorted(ROOT.rglob("*.ts"))
    changed: list[str] = []

    for path in targets:
        rel = str(path.relative_to(ROOT)).replace("\\", "/")
        if rel in SKIP_FILES:
            continue
        original = path.read_text(encoding="utf-8")
        if not re.search(r"text-(gray|slate|zinc|neutral)-", original):
            continue
        updated = migrate_text(original)
        if updated != original:
            path.write_text(updated, encoding="utf-8")
            changed.append(rel)

    print(f"Migrated {len(changed)} files:")
    for rel in changed:
        print(f"  {rel}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
