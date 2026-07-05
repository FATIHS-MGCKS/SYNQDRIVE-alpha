#!/usr/bin/env python3
"""One-off migration: hardcoded Tailwind blue/slate → SynqDrive V2 tokens."""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "src"
SKIP = {"ChangesView.tsx", "ArchitekturView.tsx", "THEME_COLOR_CONTRACT.md"}

# Order matters — longer / more specific patterns first
REPLACEMENTS: list[tuple[str, str]] = [
    # Unify dark/light ternaries → single token (brand)
    (r"isDarkMode \? 'bg-brand-soft text-brand' : 'bg-blue-50 text-blue-600'", "'bg-brand-soft text-brand'"),
    (r"isDarkMode \? 'bg-brand-soft text-brand' : 'bg-blue-50 text-blue-700'", "'bg-brand-soft text-brand'"),
    (r"isDarkMode \? 'bg-brand-soft text-brand border-brand/25' : 'bg-blue-50 text-blue-600 border-blue-200'", "'bg-brand-soft text-brand border-brand/25'"),
    (r"isDarkMode \? 'bg-brand-soft' : 'bg-blue-100/60'", "'bg-brand-soft'"),
    (r"isDarkMode \? 'bg-brand-soft' : 'bg-blue-100'", "'bg-brand-soft'"),
    (r"isDarkMode \? 'bg-brand-soft' : 'bg-blue-50'", "'bg-brand-soft'"),
    (r"isDarkMode \? 'bg-brand-soft text-brand' : 'bg-blue-100 text-blue-600'", "'bg-brand-soft text-brand'"),
    (r"isDarkMode \? 'text-brand' : 'text-blue-600'", "'text-brand'"),
    (r"isDarkMode \? 'text-brand' : 'text-blue-500'", "'text-brand'"),
    (r"isDarkMode \? 'text-brand' : 'text-blue-400'", "'text-brand'"),
    (r"isDarkMode \? 'text-brand' : 'text-blue-700'", "'text-brand'"),
    (r"isDarkMode \? 'text-status-info' : 'text-blue-600'", "'text-status-info'"),
    (r"isDarkMode \? 'text-status-info' : 'text-blue-500'", "'text-status-info'"),
    (r"isDarkMode \? 'text-foreground' : 'text-blue-600'", "'text-brand'"),
    (r"dm \? 'text-brand' : 'text-blue-600'", "'text-brand'"),
    (r"dm \? 'text-brand' : 'text-blue-500'", "'text-brand'"),
    (r"dm \? 'bg-brand-soft' : 'bg-blue-100/80'", "'bg-brand-soft'"),
    (r"dm \? 'bg-brand-soft' : 'bg-blue-100'", "'bg-brand-soft'"),
    (r"dm \? 'bg-brand-soft text-brand' : 'border-blue-100 bg-blue-50 text-blue-600'", "'bg-brand-soft text-brand border-brand/20'"),
    (r"dm \? 'border-brand/20 bg-brand-soft text-brand' : 'border-blue-100 bg-blue-50 text-blue-600'", "'border-brand/20 bg-brand-soft text-brand'"),
    (r"isDark \? 'text-brand' : 'text-blue-600'", "'text-brand'"),
    (r"isDark \? 'bg-brand-soft' : 'bg-blue-50'", "'bg-brand-soft'"),
    (r"isDark \? 'bg-brand-soft text-brand' : 'bg-blue-50 text-blue-700'", "'bg-status-info-soft text-status-info'"),
    (r"isDark \? 'bg-status-info-soft text-status-info' : 'bg-blue-50 text-blue-700'", "'bg-status-info-soft text-status-info'"),
    (r"isDark \? 'text-status-info' : 'text-blue-600'", "'text-status-info'"),
    (r"isDark \? 'text-status-info' : 'text-blue-500'", "'text-status-info'"),
    (r"isDark \? 'bg-status-info' : 'bg-blue-500'", "'bg-status-info'"),
    (r"isDark \? 'bg-status-info' : 'bg-blue-400'", "'bg-status-info'"),
    (r"isDark \? 'text-status-info' : 'text-blue-400'", "'text-status-info'"),
    (r"isDark \? 'border-muted-foreground' : 'border-blue-500'", "'border-muted-foreground'"),
    # Info/status surfaces
    (r"'bg-blue-50/60 border-blue-200/40'", "'bg-status-info-soft border-status-info/20'"),
    (r"'bg-blue-500/15 text-blue-600'", "'bg-status-info-soft text-status-info'"),
    (r"'bg-blue-50/80 border-blue-200/60'", "'bg-status-info-soft border-status-info/25'"),
    (r"'bg-blue-50 text-blue-700 hover:bg-blue-100'", "'bg-status-info-soft text-status-info hover:bg-status-info-soft/80'"),
    (r"'bg-blue-50 text-blue-700'", "'bg-status-info-soft text-status-info'"),
    (r"'bg-blue-50 text-blue-600'", "'bg-status-info-soft text-status-info'"),
    (r"'bg-blue-100 text-blue-700'", "'bg-status-info-soft text-status-info'"),
    (r"'bg-blue-100 text-blue-600'", "'bg-brand-soft text-brand'"),
    (r"'bg-blue-100/80'", "'bg-brand-soft'"),
    (r"'bg-blue-100/60'", "'bg-brand-soft'"),
    (r"'bg-blue-100'", "'bg-brand-soft'"),
    (r"'bg-blue-50'", "'bg-brand-soft'"),
    (r"'bg-blue-50/70'", "'bg-brand-soft'"),
    (r"'bg-blue-50/80'", "'bg-brand-soft'"),
    (r"'text-blue-700'", "'text-status-info'"),
    (r"'text-blue-700/80'", "'text-status-info/80'"),
    (r"'text-blue-900'", "'text-foreground'"),
    (r"'text-blue-600/80'", "'text-brand/80'"),
    (r"'text-blue-600'", "'text-brand'"),
    (r"'text-blue-500'", "'text-status-info'"),
    (r"'text-blue-400'", "'text-status-info'"),
    (r"'border-blue-200'", "'border-border'"),
    (r"'border-blue-100'", "'border-brand/15'"),
    (r"'border-blue-400'", "'border-brand'"),
    (r"'border-blue-200/60'", "'border-border'"),
    (r"'focus:border-blue-400'", "'focus:border-brand'"),
    (r"'focus:border-blue-300'", "'focus:border-brand'"),
    (r"'focus:border-blue-500/50'", "'focus:border-brand/50'"),
    (r"'hover:bg-blue-50 hover:text-blue-700'", "'hover:bg-brand-soft hover:text-brand'"),
    (r"'hover:bg-blue-100'", "'hover:bg-brand-soft'"),
    (r"'hover:text-blue-600'", "'hover:text-brand'"),
    (r"'bg-blue-600 hover:bg-blue-700 text-white'", "'bg-brand text-brand-foreground hover:bg-brand-hover'"),
    (r"'bg-blue-600 hover:bg-blue-500 text-white'", "'bg-brand text-brand-foreground hover:bg-brand-hover'"),
    (r"'bg-blue-600 hover:bg-blue-700'", "'bg-brand hover:bg-brand-hover text-brand-foreground'"),
    (r"'bg-blue-500/15 text-blue-600 dark:bg-status-info-soft dark:text-status-info border-blue-500/25 dark:border-status-info/25'",
     "'bg-status-info-soft text-status-info border-status-info/25'"),
    (r"'bg-slate-500/15 text-slate-600 dark:bg-status-nodata-soft dark:text-status-nodata border-slate-500/25 dark:border-status-nodata/25'",
     "'bg-status-nodata-soft text-status-nodata border-status-nodata/25'"),
    (r"'bg-blue-500/8 text-blue-700 dark:bg-status-info-soft dark:text-status-info border-blue-500/18 dark:border-status-info/20'",
     "'bg-status-info-soft text-status-info border-status-info/20'"),
    # Slate → tokens
    (r"'border-slate-100 bg-slate-50 text-slate-500'", "'border-border bg-muted text-muted-foreground'"),
    (r"'border-slate-100 bg-slate-50/60'", "'border-border bg-muted/60'"),
    (r"'bg-slate-50 text-slate-500 ring-slate-200'", "'bg-muted text-muted-foreground ring-border'"),
    (r"'bg-slate-100 text-slate-700 hover:bg-slate-200'", "'bg-muted text-foreground/90 hover:bg-muted/80'"),
    (r"'text-slate-500'", "'text-muted-foreground'"),
    (r"'text-slate-400'", "'text-muted-foreground'"),
    (r"'text-slate-300'", "'text-muted-foreground/60'"),
    (r"'text-slate-700'", "'text-foreground/90'"),
    (r"'text-slate-800'", "'text-foreground'"),
    (r"'text-slate-900'", "'text-foreground'"),
    (r"'bg-slate-50'", "'bg-muted'"),
    (r"'bg-slate-100'", "'bg-muted'"),
    (r"'hover:bg-slate-200'", "'hover:bg-muted/80'"),
    (r"'border-slate-100'", "'border-border'"),
    (r"'border-slate-200'", "'border-border'"),
    (r"'ring-slate-200'", "'ring-border'"),
    (r"'bg-slate-400'", "'bg-muted-foreground/50'"),
    (r"'bg-blue-300'", "'bg-status-info/60'"),
    # Gray general UI
    (r"'bg-white border-gray-200 text-gray-900 placeholder-gray-400 focus:border-blue-400'",
     "'bg-card border-border text-foreground placeholder:text-muted-foreground focus:border-brand'"),
    (r"'bg-white border-gray-200 text-gray-900 placeholder-gray-400 focus:border-blue-300'",
     "'bg-card border-border text-foreground placeholder:text-muted-foreground focus:border-brand'"),
    (r"'bg-white border-gray-200 text-gray-900 placeholder-gray-400'",
     "'bg-card border-border text-foreground placeholder:text-muted-foreground'"),
    (r"'hover:bg-gray-100 text-gray-500 hover:text-blue-600'",
     "'hover:bg-muted text-muted-foreground hover:text-brand'"),
    (r"'bg-gray-100 text-gray-500'", "'bg-muted text-muted-foreground'"),
    (r"'bg-gray-500/15'", "'bg-status-nodata-soft'"),
    (r"'text-gray-400'", "'text-muted-foreground'"),
    (r"'bg-neutral-800 border-neutral-700 text-gray-200 placeholder-gray-500 focus:border-blue-500/50'",
     "'bg-card border-border text-foreground placeholder:text-muted-foreground focus:border-brand/50'"),
    (r"'bg-blue-900/30 border-blue-700/50 text-blue-400'",
     "'bg-status-info-soft border-status-info/30 text-status-info'"),
    (r"'bg-blue-50 border-blue-200 text-blue-700'",
     "'bg-status-info-soft border-status-info/25 text-status-info'"),
    (r"isDarkMode \? 'bg-primary text-primary-foreground hover:opacity-90' : 'bg-blue-600 hover:bg-blue-700 text-white'",
     "'bg-brand text-brand-foreground hover:bg-brand-hover'"),
    (r"isDarkMode \? 'border-brand bg-brand-soft' : 'border-blue-400 bg-blue-50'",
     "'border-brand bg-brand-soft'"),
    (r"dm \? 'border-status-ai/25 bg-status-ai-soft' : 'border-blue-100 bg-blue-50/70'",
     "'border-status-ai/25 bg-status-ai-soft'"),
    (r"dm \? 'bg-status-ai-soft text-status-ai' : 'bg-white text-blue-600 shadow-\[0_1px_2px_rgba\(15,23,42,0\.04\)\]'",
     "'bg-status-ai-soft text-status-ai'"),
    (r"dm \? 'text-status-ai/70' : 'text-blue-600/80'", "'text-status-ai/70'"),
    (r"dm \? 'text-foreground' : 'text-slate-900'", "'text-foreground'"),
    (r"dm \? 'text-foreground/90' : 'text-slate-700'", "'text-foreground/90'"),
    (r"dm \? 'text-muted-foreground' : 'text-slate-400'", "'text-muted-foreground'"),
    (r"dm \? 'text-muted-foreground/70' : 'text-slate-300'", "'text-muted-foreground/70'"),
    (r"dm \? 'border-border/60 bg-muted/30' : 'border-slate-100 bg-slate-50/60'", "'border-border/60 bg-muted/30'"),
    (r"dm \? 'border-border/40' : 'border-slate-100'", "'border-border/40'"),
    (r"dm \? 'text-foreground/90' : 'text-slate-800'", "'text-foreground/90'"),
    (r"dm \? 'text-muted-foreground' : 'text-slate-500'", "'text-muted-foreground'"),
    (r"isDarkMode \? 'text-muted-foreground' : 'text-slate-500'", "'text-muted-foreground'"),
    (r"isDarkMode \? 'bg-muted/80 text-muted-foreground ring-border/70' : 'bg-slate-50 text-slate-500 ring-slate-200'",
     "'bg-muted/80 text-muted-foreground ring-border/70'"),
    (r"isDarkMode \? 'border-white/10 bg-white/\[0\.03\] text-neutral-400' : 'border-slate-100 bg-slate-50 text-slate-500'",
     "'border-border/60 bg-muted/40 text-muted-foreground'"),
    (r"isDarkMode \? 'bg-status-info-soft text-status-info' : 'bg-blue-50 text-blue-700'",
     "'bg-status-info-soft text-status-info'"),
    (r"isDark \? 'bg-blue-500' : 'bg-blue-400'", "'bg-status-info'"),
    (r"isDark \? 'text-blue-400' : 'text-blue-600'", "'text-status-info'"),
    (r"isDarkMode \? 'text-blue-400' : 'text-blue-500'", "'text-status-info'"),
    (r"isDarkMode \? 'text-blue-400' : 'text-blue-600'", "'text-brand'"),
    (r"isDarkMode \? 'bg-blue-500/20' : 'bg-blue-50'", "'bg-brand-soft'"),
    (r"isDarkMode \? 'border-brand bg-brand-soft' : 'border-blue-400 bg-blue-50'", "'border-brand bg-brand-soft'"),
    (r"isDarkMode \? 'bg-brand-soft text-brand border-brand/25' : 'bg-blue-50 text-blue-600 border-blue-200'",
     "'bg-brand-soft text-brand border-brand/25'"),
    (r"isDarkMode \? 'bg-brand-soft' : 'bg-blue-100/60'", "'bg-brand-soft'"),
    (r"section\.comingSoon \? 'text-purple-400' : 'text-blue-500'", "section.comingSoon ? 'text-status-ai' : 'text-brand'"),
    (r"isDarkMode \? 'text-brand' : 'text-blue-500'", "'text-brand'"),
    (r"isDarkMode \? 'text-brand' : 'text-blue-600'", "'text-brand'"),
    (r"isDarkMode \? 'bg-brand-soft text-brand hover:bg-brand-soft/80' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'",
     "'bg-brand-soft text-brand hover:bg-brand-soft/80'"),
    (r"dm \? 'bg-status-info-soft text-status-info' : 'bg-blue-100 text-blue-700'",
     "'bg-status-info-soft text-status-info'"),
    (r"'text-blue-500 font-medium'", "'text-status-info font-medium'"),
    (r"color: 'text-blue-500'", "color: 'text-status-info'"),
    (r"bgLight: 'bg-blue-100'", "bgLight: 'bg-brand-soft'"),
    (r"iconLight: 'text-blue-500'", "iconLight: 'text-brand'"),
    (r"bg: 'bg-blue-100'", "bg: 'bg-brand-soft'"),
    (r"text: 'text-blue-700'", "text: 'text-brand'"),
    (r"border: 'border-blue-400/60'", "border: 'border-brand/40'"),
]

def process_file(path: Path) -> bool:
    if path.name in SKIP:
        return False
    text = path.read_text(encoding="utf-8")
    original = text
    for pattern, repl in REPLACEMENTS:
        text = text.replace(pattern, repl)
    if text != original:
        path.write_text(text, encoding="utf-8")
        return True
    return False


def main() -> None:
    changed: list[str] = []
    for path in sorted(ROOT.rglob("*")):
        if not path.is_file():
            continue
        if path.suffix not in {".tsx", ".ts", ".css"}:
            continue
        if path.name in SKIP:
            continue
        if process_file(path):
            changed.append(str(path.relative_to(ROOT.parent)))
    print(f"Updated {len(changed)} files:")
    for p in changed:
        print(f"  {p}")


if __name__ == "__main__":
    main()
