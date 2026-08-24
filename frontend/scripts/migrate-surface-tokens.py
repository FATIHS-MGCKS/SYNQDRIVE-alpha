#!/usr/bin/env python3
"""Migrate legacy surface/bg/border hardcodes to semantic SynqDrive surface tokens."""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "src"

# Full-file skip (technical / semantic surfaces)
SKIP_FILES: set[str] = {
    "components/figma/ImageWithFallback.tsx",
    "rental/components/users-roles/IamBadges.tsx",
}

# Partial skip: only apply ternary/border rules, not blanket bg-white replacement
PARTIAL_SKIP_BG_WHITE: set[str] = {
    "rental/components/handover/SignaturePad.tsx",
    "rental/components/damages/DamageEvidenceCanvas.tsx",
    "master/components/ChangesView.tsx",  # changelog strings reference bg-white historically
}

# Ternary pairs → single semantic surface (light+dark structural)
TERNARY_REPLACEMENTS: list[tuple[str, str]] = [
    # Card / panel surfaces
    (r"isDarkMode ? 'surface-premium' : 'bg-white'", "surface-solid"),
    (r"isDarkMode ? 'surface-premium border-border' : 'bg-white border-gray-200'", "surface-solid border-border"),
    (r"isDarkMode ? 'surface-premium border-border/50 hover:border-border' : 'bg-gray-50/80 border-gray-200/60 hover:border-gray-300'", "surface-solid border-border/50 hover:border-border"),
    (r"isDarkMode ? 'surface-premium border-neutral-700 text-white' : 'bg-white border-gray-200'", "surface-solid border-border text-foreground"),
    (r"isDarkMode ? 'surface-premium border-neutral-700 text-white' : 'bg-white border-gray-200 text-foreground'", "surface-solid border-border text-foreground"),
    (r"isDarkMode ? 'surface-premium text-muted-foreground border-neutral-700' : 'bg-gray-50 text-foreground border-gray-200'", "surface-solid text-foreground border-border"),
    (r"isDarkMode ? 'surface-premium text-muted-foreground' : 'bg-gray-100 text-muted-foreground'", "bg-muted text-muted-foreground"),
    (r"isDarkMode ? 'surface-premium text-foreground' : 'bg-gray-100 text-foreground'", "bg-muted text-foreground"),
    (r"isDarkMode ? 'surface-premium text-muted-foreground' : 'bg-white text-foreground border border-gray-200'", "surface-solid text-foreground border border-border"),
    (r"isDarkMode ? 'surface-premium text-foreground hover:bg-neutral-800' : 'bg-white border border-gray-200 text-foreground hover:bg-gray-50'", "surface-solid border border-border text-foreground hover:bg-muted"),
    (r"d ? 'bg-neutral-900' : 'bg-white'", "surface-solid"),
    (r"d ? 'surface-premium' : 'bg-white'", "surface-solid"),
    (r"d ? 'surface-premium border-neutral-700/30' : 'border-gray-100'", "surface-solid border-border/60"),
    (r"isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'", "surface-solid border-border"),
    (r"isDarkMode ? 'surface-premium border-neutral-700' : 'bg-white border-gray-200'", "surface-solid border-border"),
    (r"isDarkMode ? 'surface-premium border-neutral-700 text-muted-foreground' : 'bg-gray-50 border-gray-200 text-muted-foreground'", "surface-solid border-border text-muted-foreground"),
    (r"isDarkMode ? 'surface-premium border-neutral-700/40 text-muted-foreground' : 'bg-gray-50 border-gray-200 text-muted-foreground'", "surface-solid border-border text-muted-foreground"),
    (r"isDarkMode ? 'surface-premium text-muted-foreground hover:bg-neutral-700 border border-neutral-700' : 'bg-gray-100 text-foreground hover:bg-gray-200 border border-gray-200'", "surface-solid text-foreground hover:bg-muted border border-border"),
    (r"isDarkMode ? 'surface-premium border-neutral-700 text-muted-foreground' : 'bg-gray-50 border-gray-200 text-muted-foreground'", "surface-solid border-border text-muted-foreground"),
    (r"isDarkMode ? 'surface-premium border-neutral-700/40 text-muted-foreground' : 'bg-gray-50 border-gray-200 text-muted-foreground'", "surface-solid border-border text-muted-foreground"),
    (r"isDarkMode ? 'bg-popover border-neutral-700 text-muted-foreground' : 'bg-white border-gray-200 text-muted-foreground'", "bg-popover border-border text-muted-foreground"),
    (r"isDarkMode ? 'surface-premium border-neutral-800' : 'bg-gray-50/80 border-gray-200/60'", "surface-solid border-border/60"),
    (r"isDarkMode ? 'surface-premium' : 'bg-gray-50/80'", "surface-solid"),
    (r"isDarkMode ? 'bg-muted/30' : 'bg-gray-50/50'", "bg-muted/30"),
    (r"isDarkMode ? 'bg-muted/50' : 'bg-gray-50/60'", "bg-muted/50"),
    (r"isDarkMode ? 'bg-muted' : 'bg-gray-100'", "bg-muted"),
    (r"isDarkMode ? 'bg-muted' : 'bg-gray-200'", "bg-muted"),
    (r"isDarkMode ? 'bg-white/5' : 'bg-gray-50'", "bg-muted/40"),
    (r"isDarkMode ? 'bg-white/[0.02]' : 'bg-gray-50'", "bg-muted/40"),
    (r"isDarkMode ? 'bg-white/5' : 'bg-gray-50'", "bg-muted/40"),
    (r"d ? 'bg-muted' : 'bg-gray-100'", "bg-muted"),
    (r"d ? 'bg-muted' : 'bg-gray-200'", "bg-muted"),
    (r"isDarkMode ? 'bg-[#1e1e2e]' : 'bg-white'", "surface-solid"),
    (r"isDarkMode ? 'bg-white/5' : 'bg-gray-50'", "bg-muted/40"),
    (r"isDarkMode ? 'surface-premium text-foreground' : 'bg-gray-100 text-foreground'", "bg-muted text-foreground"),
    (r"isDarkMode ? 'surface-premium hover:bg-neutral-700/40 text-muted-foreground' : 'bg-gray-100/80 hover:bg-gray-200/80 text-foreground'", "bg-muted hover:bg-muted/80 text-foreground"),
    (r"isDarkMode ? 'bg-neutral-700/50 text-muted-foreground hover:bg-neutral-700' : 'bg-gray-200/80 text-muted-foreground hover:bg-gray-300'", "bg-muted text-muted-foreground hover:bg-muted/80"),
    (r"isDarkMode ? 'bg-neutral-700 text-muted-foreground' : 'bg-gray-200 text-muted-foreground'", "bg-muted text-muted-foreground"),
    (r"isDarkMode ? 'bg-neutral-700/60 text-muted-foreground' : 'bg-gray-200/80 text-muted-foreground'", "bg-muted text-muted-foreground"),
    (r"isDarkMode ? 'bg-neutral-700/60' : 'bg-gray-100'", "bg-muted"),
    (r"isDarkMode ? 'bg-neutral-700 text-muted-foreground' : 'bg-gray-200 text-muted-foreground'", "bg-muted text-muted-foreground"),
    (r"isDarkMode ? 'surface-premium text-muted-foreground' : 'bg-gray-100/80 text-muted-foreground'", "bg-muted text-muted-foreground"),
    (r"d ? 'surface-premium border-neutral-700 text-white placeholder-gray-500' : 'bg-white border-gray-300 text-foreground placeholder-gray-400'", "bg-background border-border text-foreground placeholder:text-muted-foreground"),
    (r"isDarkMode ? 'bg-background border-neutral-700/50 text-foreground focus:border-brand/50 placeholder:text-muted-foreground' : 'bg-gray-50 border-gray-200/50 text-foreground focus:border-brand placeholder:text-muted-foreground'", "bg-background border-border/50 text-foreground focus:border-brand placeholder:text-muted-foreground"),
    (r"isDarkMode ? 'bg-background border-neutral-700 text-foreground focus:border-brand/50 placeholder:text-muted-foreground' : 'bg-gray-50 border-gray-200 text-foreground focus:border-brand placeholder:text-muted-foreground'", "bg-background border-border text-foreground focus:border-brand placeholder:text-muted-foreground"),
    (r"isDarkMode ? 'bg-neutral-800/80' : 'bg-gray-50'", "bg-muted"),
    (r"step.state === 'active' ? (isDarkMode ? 'bg-neutral-800/80' : 'bg-gray-50') : ''", "step.state === 'active' ? 'bg-muted' : ''"),
    (r"d ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-border'", "surface-solid border-border"),
    (r"d ? 'bg-neutral-800 border-neutral-700 text-foreground' : 'bg-muted border-border text-foreground'", "bg-muted border-border text-foreground"),
    (r"d ? 'border-neutral-800 bg-neutral-800/40 text-foreground hover:bg-neutral-800/70' : 'border-border bg-muted/80 text-foreground hover:bg-muted'", "border-border bg-muted/80 text-foreground hover:bg-muted"),
    (r"d ? 'bg-neutral-800 text-muted-foreground' : 'bg-muted text-muted-foreground'", "bg-muted text-muted-foreground"),
    (r"d ? 'border-neutral-700/50 bg-neutral-800/50' : 'border-border/50 bg-muted/50'", "border-border/50 bg-muted/50"),
    (r"d ? 'border-neutral-700/50 bg-neutral-800/50 text-foreground hover:bg-neutral-800' : 'border-border/50 bg-muted/50 text-foreground hover:bg-muted'", "border-border/50 bg-muted/50 text-foreground hover:bg-muted"),
    (r"d ? 'bg-neutral-800' : 'bg-gray-200'", "bg-muted"),
    (r"d ? 'bg-neutral-950/50 text-muted-foreground' : 'bg-white text-muted-foreground'", "bg-muted text-muted-foreground"),
    (r"isDarkMode ? 'border-gray-700/50' : 'border-border'", "border-border/50"),
    (r"isDarkMode ? 'bg-[#2a2a3e] border-gray-600 text-white placeholder-gray-500' : 'bg-white border-border text-foreground placeholder-gray-400'", "bg-background border-border text-foreground placeholder:text-muted-foreground"),
    (r"isDarkMode ? 'bg-[#2a2a3e] border-gray-600 text-white' : 'bg-white border-border text-foreground'", "bg-background border-border text-foreground"),
    (r"dk ? 'bg-neutral-900' : 'surface-solid'", "surface-solid"),
    (r": 'bg-white border border-border rounded-2xl'", ": 'surface-solid border border-border rounded-2xl'"),
    (r": 'bg-white border border-border focus:border-brand'", ": 'bg-background border border-border focus:border-brand'"),
    (r": 'bg-white text-foreground placeholder:text-muted-foreground border border-border focus:border-brand'", ": 'bg-background text-foreground placeholder:text-muted-foreground border border-border focus:border-brand'"),
    (r": 'bg-white text-foreground border border-border'", ": 'surface-solid text-foreground border border-border'"),
    (r"dk ? 'border-white/20 bg-white/[0.04]' : 'border-border bg-white'", "dk ? 'border-white/20 bg-white/[0.04]' : 'border-border surface-solid'"),
    (r": 'bg-gray-200 text-muted-foreground cursor-not-allowed'", ": 'bg-muted text-muted-foreground cursor-not-allowed'"),
    (r": 'bg-gray-300'", ": 'bg-muted'"),
    (r"dk ? 'bg-white/[0.06]' : 'bg-gray-200/80'", "dk ? 'bg-white/[0.06]' : 'bg-muted'"),
    (r"dk ? 'bg-white/10' : 'bg-gray-300'", "dk ? 'bg-white/10' : 'bg-muted'"),
]

BORDER_REPLACEMENTS = [
    "border-gray-100", "border-gray-200", "border-gray-300",
    "border-slate-100", "border-slate-200", "border-slate-300",
    "border-zinc-100", "border-zinc-200", "border-zinc-300",
    "border-neutral-100", "border-neutral-200", "border-neutral-300",
]

HOVER_BG_REPLACEMENTS = [
    ("hover:bg-gray-50", "hover:bg-muted"),
    ("hover:bg-gray-100", "hover:bg-muted"),
    ("hover:bg-gray-200", "hover:bg-muted/80"),
    ("hover:bg-gray-300", "hover:bg-muted/80"),
]

BG_MUTED_REPLACEMENTS = [
    "bg-gray-50", "bg-gray-50/50", "bg-gray-50/60", "bg-gray-50/80",
    "bg-gray-100", "bg-gray-100/80",
    "bg-slate-50", "bg-slate-100",
    "bg-neutral-50", "bg-neutral-100",
    "bg-zinc-50", "bg-zinc-100",
]


def migrate_surface(content: str, *, allow_bg_white: bool) -> str:
    for pattern, replacement in TERNARY_REPLACEMENTS:
        content = content.replace(pattern, replacement)

    for old, new in HOVER_BG_REPLACEMENTS:
        content = content.replace(old, new)

    # Borders (structural hairlines)
    for border in BORDER_REPLACEMENTS:
        content = re.sub(rf"\b{re.escape(border)}\b", "border-border", content)

    # Muted nested regions — after ternaries simplified
    for bg in BG_MUTED_REPLACEMENTS:
        content = re.sub(rf"\b{re.escape(bg)}\b", "bg-muted", content)

    if allow_bg_white:
        # Only fix quoted standalone bg-white in simple string literals (not template ${})
        content = re.sub(r"'bg-white border-border'", "'surface-solid border-border'", content)
        content = re.sub(r"'bg-white'", "'surface-solid'", content)

    return content


def rel(path: Path) -> str:
    return str(path.relative_to(ROOT)).replace("\\", "/")


def main() -> int:
    changed: list[str] = []
    paths = sorted(set(ROOT.rglob("*.ts")) | set(ROOT.rglob("*.tsx")))
    for path in paths:
        r = rel(path)
        if r in SKIP_FILES:
            continue
        text = path.read_text(encoding="utf-8")
        original = text
        text = migrate_surface(text, allow_bg_white=r not in PARTIAL_SKIP_BG_WHITE)
        if text != original:
            path.write_text(text, encoding="utf-8")
            changed.append(r)

    print(f"Migrated {len(changed)} files:")
    for f in changed:
        print(f"  {f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
