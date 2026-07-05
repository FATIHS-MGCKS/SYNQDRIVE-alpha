#!/usr/bin/env python3
"""Third pass: indigo/slate/remaining blue patterns."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "src"
SKIP = {"ChangesView.tsx", "ArchitekturView.tsx", "THEME_COLOR_CONTRACT.md"}

R = [
    ("bg-slate-100 text-slate-700 hover:bg-slate-200", "bg-muted text-foreground/90 hover:bg-muted/80"),
    ("bg-indigo-50 text-status-info hover:bg-status-info-soft", "bg-status-info-soft text-status-info hover:bg-status-info-soft/80"),
    ("border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:border-status-ai/30", "border-brand/30 bg-brand-soft text-brand dark:border-status-ai/30"),
    ("border-slate-400", "border-muted-foreground"),
    ("hover:bg-blue-50", "hover:bg-brand-soft"),
    ("border-blue-100 bg-blue-50 text-brand", "border-brand/15 bg-brand-soft text-brand"),
    ("bg-blue-100", "bg-brand-soft"),
    ("bg-blue-50", "bg-brand-soft"),
    ("border-blue-200", "border-border"),
    ("border-brand bg-blue-50", "border-brand bg-brand-soft"),
    ("border-status-info/20' : 'bg-status-info-soft text-status-info border-blue-200", "border-status-info/20' : 'bg-status-info-soft text-status-info border-border"),
    ("darkBg: 'bg-blue-900/30'", "darkBg: 'bg-status-info-soft'"),
    ("darkBg: 'bg-indigo-900/30'", "darkBg: 'bg-status-info-soft'"),
    ("darkBorder: 'border-indigo-500/60'", "darkBorder: 'border-status-info/40'"),
    ("border-indigo-600", "border-brand"),
    ("bg-indigo-600", "bg-brand"),
    ("ring-indigo-500/30", "ring-brand/30"),
    ("ring-indigo-500/30", "ring-brand/30"),
    ("ring-1 ring-indigo-500/30", "ring-1 ring-brand/30"),
    ("ring-2 ring-indigo-500/30", "ring-2 ring-brand/30"),
    ("border-indigo-500", "border-brand"),
    ("border-indigo-600", "border-brand"),
    ("bg-indigo-600 border-indigo-600", "bg-brand border-brand"),
    ("bg-indigo-50 text-status-info", "bg-status-info-soft text-status-info"),
    ("bg-indigo-50 text-indigo-700", "bg-status-info-soft text-status-info"),
    ("bg-indigo-900/20 text-indigo-300 border border-indigo-800/30", "bg-status-info-soft text-status-info border border-border"),
    ("bg-indigo-50 text-indigo-700 border border-indigo-200", "bg-status-info-soft text-status-info border border-border"),
    ("bg-indigo-900/20 text-indigo-300 border border-indigo-800/40", "bg-status-info-soft text-status-info border border-border"),
    ("bg-indigo-50 border-indigo-200 text-indigo-700", "bg-status-info-soft border-border text-status-info"),
    ("bg-indigo-600/30 border-indigo-500 text-indigo-300", "bg-brand/30 border-brand text-brand"),
    ("bg-indigo-50 border-indigo-400 text-indigo-700", "bg-brand-soft border-brand text-brand"),
    ("bg-indigo-900/20 text-indigo-300 border border-indigo-800/30", "bg-status-info-soft text-status-info border border-border"),
    ("bg-blue-900/20 border-blue-800/40", "bg-status-info-soft border-border"),
    ("bg-blue-50 border-blue-200", "bg-status-info-soft border-border"),
    ("border-blue-800/40", "border-border"),
    ("border-t flex items-center gap-2 ${isDarkMode ? 'border-blue-800/40' : 'border-border'}", "border-t flex items-center gap-2 border-border"),
    ("border-brand bg-blue-50 text-blue-700", "border-brand bg-brand-soft text-brand"),
    ("bg-blue-900/20 text-brand border border-blue-800/30", "bg-status-info-soft text-brand border border-border"),
    ("bg-blue-50 text-blue-700 border border-blue-200", "bg-status-info-soft text-status-info border border-border"),
    ("bg-blue-900/20 text-brand border border-blue-800/40", "bg-status-info-soft text-brand border border-border"),
    ("bg-blue-50 text-blue-700 border border-blue-200", "bg-status-info-soft text-status-info border border-border"),
    ("border-blue-800/40", "border-border"),
    ("bg-blue-900/20", "bg-status-info-soft"),
    ("bg-blue-900/30", "bg-status-info-soft"),
    ("bg-blue-100 text-brand dark:bg-status-info-soft dark:text-status-info", "bg-status-info-soft text-brand"),
    ("text-indigo-700 dark:bg-status-ai-soft", "text-status-info dark:bg-status-ai-soft"),
    ("border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-status-ai-soft", "border-brand bg-brand-soft text-brand dark:bg-status-ai-soft"),
    ("bg-slate-100 text-slate-700 dark:bg-muted dark:text-muted-foreground", "bg-muted text-muted-foreground"),
    ("bg-slate-100 text-slate-600 dark:bg-muted dark:text-muted-foreground", "bg-muted text-muted-foreground"),
    ("bg-slate-800 text-slate-300", "bg-muted text-muted-foreground"),
    ("bg-indigo-50 text-status-info", "bg-status-info-soft text-status-info"),
    ("bg-neutral-800", "bg-card"),
    ("bg-indigo-500/20 text-indigo-300", "bg-status-info-soft text-status-info"),
    ("bg-indigo-50 text-status-info hover:bg-status-info-soft", "bg-status-info-soft text-status-info hover:bg-status-info-soft/80"),
    ("bg-white text-indigo-700 shadow-sm", "bg-card text-brand shadow-sm"),
    ("bg-indigo-500/10 text-indigo-300/80 border border-indigo-500/20", "bg-status-info-soft text-status-info/80 border border-status-info/20"),
    ("bg-indigo-50 text-indigo-700 border border-indigo-100", "bg-status-info-soft text-status-info border border-border"),
    ("text-indigo-300/70", "text-status-info/70"),
    ("bg-indigo-900/40 text-status-info", "bg-status-info-soft text-status-info"),
    ("bg-status-info-soft text-indigo-700", "bg-status-info-soft text-status-info"),
    ("bg-indigo-900/40 text-indigo-300", "bg-status-info-soft text-status-info"),
    ("hover:border-indigo-500/50", "hover:border-brand/50"),
    ("hover:border-indigo-400", "hover:border-brand"),
    ("border-neutral-700 hover:border-indigo-500/50 bg-neutral-900/40", "border-border hover:border-brand/50 bg-muted/40"),
    ("border-gray-300 hover:border-indigo-400 bg-white", "border-border hover:border-brand bg-card"),
    ("bg-indigo-500/80 text-white", "bg-brand text-brand-foreground"),
    ("bg-indigo-500/10 text-indigo-300 hover:bg-status-info-soft", "bg-brand-soft text-brand hover:bg-brand-soft/80"),
    ("bg-indigo-50 text-indigo-700 hover:bg-status-info-soft", "bg-brand-soft text-brand hover:bg-brand-soft/80"),
    ("focus:border-indigo-500/50", "focus:border-brand/50"),
    ("focus:border-indigo-300", "focus:border-brand"),
    ("bg-gray-50 border-gray-200/50 text-gray-700 focus:border-indigo-300 placeholder:text-gray-400", "bg-card border-border text-foreground focus:border-brand placeholder:text-muted-foreground"),
    ("bg-neutral-800/50 border-neutral-700/50 text-gray-200 focus:border-indigo-500/50 placeholder:text-gray-600", "bg-card border-border text-foreground focus:border-brand/50 placeholder:text-muted-foreground"),
    ("bg-gray-50 border-gray-200 text-gray-700 focus:border-indigo-300 placeholder:text-gray-400", "bg-card border-border text-foreground focus:border-brand placeholder:text-muted-foreground"),
    ("bg-neutral-800 border-neutral-700 text-gray-200 focus:border-indigo-500/50 placeholder:text-gray-600", "bg-card border-border text-foreground focus:border-brand/50 placeholder:text-muted-foreground"),
    ("border-neutral-700 text-gray-500", "border-border text-muted-foreground"),
    ("border-gray-200 text-gray-400", "border-border text-muted-foreground"),
    ("isDarkMode ? 'bg-brand-soft text-brand border-brand/25' : 'bg-blue-50 text-brand border-blue-200'", "isDarkMode ? 'bg-brand-soft text-brand border-brand/25' : 'bg-brand-soft text-brand border-border'"),
    ("dk ? 'bg-brand-soft text-status-info hover:bg-brand-soft' : 'bg-blue-50 text-brand hover:bg-brand-soft'", "'bg-brand-soft text-brand hover:bg-brand-soft/80'"),
    ("bg-indigo-500/20 text-status-info", "bg-status-info-soft text-status-info"),
    ("color=\"bg-indigo-500/20 text-status-info\"", "color=\"bg-status-info-soft text-status-info\""),
    ("border-indigo-600'", "border-brand'"),
    ("isDarkMode ? 'text-brand hover:bg-brand-soft' : 'text-brand hover:bg-blue-50'", "'text-brand hover:bg-brand-soft'"),
]

def main():
    n = 0
    for path in sorted(ROOT.rglob("*")):
        if path.suffix not in {".tsx", ".ts"} or path.name in SKIP:
            continue
        t = path.read_text()
        o = t
        for a, b in R:
            t = t.replace(a, b)
        if t != o:
            path.write_text(t)
            n += 1
            print(path.relative_to(ROOT.parent))
    print(f"Updated {n} files")

if __name__ == "__main__":
    main()
