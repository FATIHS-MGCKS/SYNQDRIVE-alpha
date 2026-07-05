#!/usr/bin/env python3
"""Second pass: remaining hardcoded blue/slate/indigo → tokens."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "src"
SKIP = {"ChangesView.tsx", "ArchitekturView.tsx", "THEME_COLOR_CONTRACT.md"}

REPLACEMENTS = [
    ("bg-blue-500/15", "bg-status-info-soft"),
    ("bg-blue-500/20", "bg-brand-soft"),
    ("bg-blue-500/30", "bg-brand-soft"),
    ("bg-blue-600/30", "bg-brand/30"),
    ("bg-blue-600/50", "bg-brand/50"),
    ("dot: 'bg-blue-500'", "dot: 'bg-status-info'"),
    ("bg: 'bg-blue-500/15'", "bg: 'bg-status-info-soft'"),
    ("ISSUED: { label: 'Ausgestellt', bg: 'bg-indigo-500/15', text: 'text-indigo-500', dot: 'bg-indigo-500' }",
     "ISSUED: { label: 'Ausgestellt', bg: 'bg-status-info-soft', text: 'text-status-info', dot: 'bg-status-info' }"),
    ("bg-indigo-500/15", "bg-status-info-soft"),
    ("text-indigo-500", "text-status-info"),
    ("text-indigo-600", "text-status-info"),
    ("text-indigo-400", "text-status-info"),
    ("bg-indigo-100", "bg-status-info-soft"),
    ("bg-indigo-600 text-white", "bg-brand text-brand-foreground"),
    ("hover:bg-indigo-700", "hover:bg-brand-hover"),
    ("bg-blue-500 text-white", "bg-brand text-brand-foreground"),
    ("bg-blue-600 text-white", "bg-brand text-brand-foreground"),
    ("bg-blue-500 hover:bg-blue-600", "bg-brand hover:bg-brand-hover text-brand-foreground"),
    ("bg-blue-600 hover:bg-blue-700", "bg-brand hover:bg-brand-hover text-brand-foreground"),
    ("bg-blue-500 hover:bg-blue-600 text-white", "bg-brand hover:bg-brand-hover text-brand-foreground"),
    ("bg-blue-600 hover:bg-blue-700 text-white", "bg-brand hover:bg-brand-hover text-brand-foreground"),
    ("bg-blue-600 hover:bg-blue-500 text-white", "bg-brand hover:bg-brand-hover text-brand-foreground"),
    ("hover:bg-blue-600", "hover:bg-brand-hover"),
    ("hover:bg-blue-700", "hover:bg-brand-hover"),
    ("border-blue-500", "border-brand"),
    ("border-blue-600", "border-brand"),
    ("border-blue-500/40", "border-brand/40"),
    ("border-blue-500/50", "border-brand/50"),
    ("ring-blue-500/50", "ring-brand/50"),
    ("ring-blue-300", "ring-brand/30"),
    ("bg-blue-100 text-blue-700", "bg-status-info-soft text-status-info"),
    ("bg-blue-50 text-blue-600 border border-blue-200", "bg-brand-soft text-brand border border-border"),
    ("bg-blue-600/30 text-blue-300 border border-blue-500/40", "bg-brand/30 text-brand border border-brand/40"),
    ("bg-blue-50 text-blue-600 border border-blue-200", "bg-brand-soft text-brand border border-border"),
    ("bg-blue-100 dark:bg-status-info-soft", "bg-status-info-soft"),
    ("text-blue-700 dark:text-status-info", "text-status-info"),
    ("text-blue-500", "text-status-info"),
    ("text-blue-600", "text-brand"),
    ("text-blue-300", "text-brand"),
    ("text-blue-400", "text-status-info"),
    ("text-blue-400/60", "text-status-info/60"),
    ("text-blue-400/70", "text-status-info/70"),
    ("text-blue-500/60", "text-status-info/60"),
    ("text-blue-600/70", "text-brand/70"),
    ("border-blue-500/50", "border-brand/50"),
    ("bg-blue-500/20 text-blue-400", "bg-status-info-soft text-status-info"),
    ("bg-blue-500/30 text-white ring-1 ring-blue-500/50", "bg-brand text-brand-foreground ring-1 ring-brand/50"),
    ("bg-blue-100 text-blue-700 ring-1 ring-blue-300", "bg-brand-soft text-brand ring-1 ring-brand/30"),
    ("bg-blue-400", "bg-status-info"),
    ("bg-blue-500", "bg-status-info"),
    ("bg-blue-600", "bg-brand"),
    ("border-blue-400", "border-brand"),
    ("border-blue-400 bg-blue-50", "border-brand bg-brand-soft"),
    ("border-blue-400 bg-blue-500/10", "border-brand bg-brand-soft"),
    ("bg-blue-400/60", "bg-status-info/60"),
    ("bg-blue-300", "bg-brand/40"),
    ("bg-blue-300 cursor-not-allowed", "bg-muted cursor-not-allowed"),
    ("group-hover:text-blue-500", "group-hover:text-brand"),
    ("hover:text-blue-600 hover:bg-blue-50", "hover:text-brand hover:bg-brand-soft"),
    ("hover:bg-blue-100", "hover:bg-brand-soft"),
    ("hover:bg-blue-500/30", "hover:bg-brand-soft"),
    ("focus:border-blue-500/50", "focus:border-brand/50"),
    ("focus:border-blue-400", "focus:border-brand"),
    ("isDarkMode ? 'text-brand hover:bg-brand-soft' : 'text-blue-600 hover:bg-blue-50'", "'text-brand hover:bg-brand-soft'"),
    ("isDarkMode ? 'bg-brand-soft text-brand border-brand/25' : 'bg-blue-50 text-blue-600 border-blue-200'", "'bg-brand-soft text-brand border-brand/25'"),
    ("dm ? 'border-brand/20 bg-brand-soft text-brand' : 'border-blue-100 bg-blue-50 text-blue-600'", "'border-brand/20 bg-brand-soft text-brand'"),
    ("dm ? 'border-status-ai/25 bg-status-ai-soft' : 'border-blue-100 bg-blue-50/70'", "'border-status-ai/25 bg-status-ai-soft'"),
    ("dm ? 'bg-status-ai-soft text-status-ai' : 'bg-white text-blue-600 shadow-[0_1px_2px_rgba(15,23,42,0.04)]'", "'bg-status-ai-soft text-status-ai'"),
    ("isDark ? 'border-muted-foreground' : 'border-blue-500'", "'border-muted-foreground'"),
    ("isDark ? 'bg-brand' : 'bg-blue-500'", "'bg-brand'"),
    ("isDark ? 'bg-status-info' : 'bg-blue-500'", "'bg-status-info'"),
    ("isDark ? 'bg-status-info' : 'bg-blue-400'", "'bg-status-info'"),
    ("isDark ? 'text-foreground' : 'text-indigo-600'", "'text-brand'"),
    ("isDark ? 'bg-blue-500' : 'bg-blue-400'", "'bg-status-info'"),
    ("isDark ? 'text-brand' : 'text-indigo-500'", "'text-brand'"),
    ("isDarkMode ? 'border-brand bg-brand-soft' : 'border-blue-400 bg-blue-50'", "'border-brand bg-brand-soft'"),
    ("isDark ? 'text-foreground' : 'text-blue-600'", "'text-brand'"),
    ("dk ? 'bg-blue-400' : 'bg-blue-500'", "'bg-status-info'"),
    ("dk ? 'bg-blue-500/20 text-blue-400' : 'bg-status-info-soft text-status-info'", "'bg-status-info-soft text-status-info'"),
    ("dk ? 'bg-blue-500/30 text-white ring-1 ring-blue-500/50' : 'bg-blue-100 text-blue-700 ring-1 ring-blue-300'", "'bg-brand text-brand-foreground ring-1 ring-brand/50'"),
    ("dk ? 'bg-white/[0.06] text-white placeholder:text-white/30 border border-white/[0.08] focus:border-blue-500/50'\n               : 'bg-white text-gray-900 placeholder:text-gray-400 border border-gray-200 focus:border-blue-400'",
     "dk ? 'bg-muted/40 text-foreground placeholder:text-muted-foreground border border-border focus:border-brand/50'\n               : 'bg-card text-foreground placeholder:text-muted-foreground border border-border focus:border-brand'"),
    ("dk ? 'bg-blue-500/20' : 'bg-brand-soft'", "'bg-brand-soft'"),
    ("dk ? 'text-blue-400/70' : 'text-brand/70'", "'text-status-info/70'"),
    ("dk ? 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'",
     "'bg-status-info-soft text-status-info hover:bg-status-info-soft/80'"),
    ("'bg-blue-600 border-blue-600'", "'bg-brand border-brand'"),
    ("'bg-blue-600 text-white cursor-pointer hover:bg-blue-700 shadow-sm'", "'bg-brand text-brand-foreground cursor-pointer hover:bg-brand-hover shadow-sm'"),
    ("'bg-blue-600 text-white border-blue-500 shadow-md'", "'bg-brand text-brand-foreground border-brand shadow-md'"),
    ("text-blue-500 underline", "text-brand underline"),
    ("'bg-blue-600/50' : 'bg-blue-600'", "'bg-brand/50' : 'bg-brand'"),
    ("isMaintenance ? 'bg-blue-600/50' : 'bg-blue-600'", "isMaintenance ? 'bg-brand/50' : 'bg-brand'"),
    ("isSelected ? 'bg-blue-600 border-blue-600' : 'border-border'", "isSelected ? 'bg-brand border-brand' : 'border-border'"),
    ("newCustomer.type === t ? 'bg-blue-500 text-white border-blue-500 shadow-md'", "newCustomer.type === t ? 'bg-brand text-brand-foreground border-brand shadow-md'"),
    ("w-3 h-3 rounded bg-blue-600", "w-3 h-3 rounded bg-brand"),
    ("bg: 'bg-indigo-100'", "bg: 'bg-status-info-soft'"),
    ("text: 'text-indigo-700'", "text: 'text-status-info'"),
    ("border: 'border-indigo-400/60'", "border: 'border-status-info/40'"),
    ("darkBg: 'bg-blue-500/15'", "darkBg: 'bg-status-info-soft'"),
    ("text: 'text-blue-700'", "text: 'text-status-info'"),
    ("darkText: 'text-blue-400'", "darkText: 'text-status-info'"),
    ("badge: 'bg-blue-500'", "badge: 'bg-status-info'"),
    ("ring: 'ring-blue-500/40'", "ring: 'ring-status-info/40'"),
    ("bg: 'bg-blue-50'", "bg: 'bg-brand-soft'"),
    ("primary: '#3b82f6'", "primary: '#4F86E8'"),
    ("glow: 'rgba(59,130,246,0.35)'", "glow: 'rgba(79,134,232,0.35)'"),
]

def main():
    changed = []
    for path in sorted(ROOT.rglob("*")):
        if path.suffix not in {".tsx", ".ts"} or path.name in SKIP:
            continue
        text = path.read_text()
        orig = text
        for old, new in REPLACEMENTS:
            text = text.replace(old, new)
        if text != orig:
            path.write_text(text)
            changed.append(str(path.relative_to(ROOT.parent)))
    print(f"Pass 2: {len(changed)} files")
    for p in changed:
        print(f"  {p}")

if __name__ == "__main__":
    main()
