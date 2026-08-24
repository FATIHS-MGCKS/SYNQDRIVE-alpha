#!/usr/bin/env python3
"""V4.9.200 — Card radius & elevation cutover migration."""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "src"

SKIP_FILES = {
    "components/surface/liquid-glass-lens.css",
    "components/surface/liquid-glass-lens-variants.ts",
    "components/MapboxMap.tsx",
    "rental/components/handover/SignaturePad.tsx",
    "rental/components/damages/DamageEvidenceCanvas.tsx",
    "styles/theme.css",
    "styles/CARD_RADIUS_ELEVATION_AUDIT.md",
}

SURFACE_RE = re.compile(r"\bsurface-(?:solid|premium|elevated)\b")
SURFACE_RADIUS_REMOVE = re.compile(
    r" ?!?rounded-(?:xl|2xl|3xl)| ?!?rounded-\[(?:12|14|16|20)px\]"
)
SURFACE_SHADOW_REMOVE = re.compile(
    r" ?shadow-\[var\(--shadow-[1234]\)\]| ?shadow-(?:xs|sm|md|lg|xl|2xl)\b"
)

CARD_CONST_REPLACEMENTS = [
    (
        "'rounded-2xl shadow-sm border overflow-hidden surface-solid border-border'",
        "'overflow-hidden surface-solid border-border'",
    ),
    (
        "`rounded-2xl shadow-sm border overflow-hidden surface-solid border-border`",
        "`overflow-hidden surface-solid border-border`",
    ),
    (
        "'rounded-2xl border overflow-hidden surface-solid'",
        "'overflow-hidden surface-solid'",
    ),
]

NESTED_TILE_DIRS = (
    "rental/components/dashboard/notifications",
    "rental/components/dashboard/tasks",
    "rental/components/dashboard/communication",
)

stats = {"files": 0, "radius": 0, "shadow": 0, "nested": 0, "dialogs": 0}


def process_surface_line(line: str) -> tuple[str, int, int]:
    if not SURFACE_RE.search(line) or "surface-frosted" in line or "surface-liquid" in line:
        return line, 0, 0
    r = len(SURFACE_RADIUS_REMOVE.findall(line))
    s = 0
    out = SURFACE_RADIUS_REMOVE.sub("", line)
    if SURFACE_RE.search(out):
        s = len(SURFACE_SHADOW_REMOVE.findall(out))
        out = SURFACE_SHADOW_REMOVE.sub("", out)
        if "border-border/" not in out:
            out = re.sub(r" ?border border-border\b", "", out)
    return out, r, s


def process_nested_line(line: str, rel: str) -> tuple[str, int]:
    if not any(rel.startswith(d) for d in NESTED_TILE_DIRS):
        return line, 0
    if SURFACE_RE.search(line) or "rounded-full" in line:
        return line, 0
    if "rounded-xl" in line and ("overflow-hidden" in line or "border" in line):
        return re.sub(r"\brounded-xl\b", "rounded-md", line), 1
    return line, 0


def process_dialog_line(line: str) -> tuple[str, int]:
    if not re.search(r"rounded-(?:t-)?2xl|sm:rounded-2xl", line):
        return line, 0
    if "surface-liquid" in line or "map-glass" in line:
        return line, 0
    orig = line
    line = line.replace("rounded-t-2xl", "rounded-t-dialog")
    line = line.replace("sm:rounded-2xl", "sm:rounded-dialog")
    if re.search(r"\brounded-2xl\b", line):
        if SURFACE_RE.search(line):
            line = SURFACE_RADIUS_REMOVE.sub("", line)
            for cls in ("surface-premium", "surface-solid", "surface-elevated"):
                if cls in line and "sq-dialog-panel" not in line:
                    line = line.replace(cls, f"{cls} sq-dialog-panel", 1)
                    break
        else:
            line = re.sub(r"\brounded-2xl\b", "rounded-dialog sq-dialog-panel", line)
    if SURFACE_RE.search(line):
        line = re.sub(r" ?shadow-(?:lg|xl|2xl)\b", "", line)
    return line, int(line != orig)


def migrate_file(path: Path) -> bool:
    rel = path.relative_to(ROOT).as_posix()
    if rel in SKIP_FILES:
        return False
    text = path.read_text(encoding="utf-8")
    orig = text
    for a, b in CARD_CONST_REPLACEMENTS:
        text = text.replace(a, b)
    lines = []
    for line in text.splitlines(keepends=True):
        body = line.rstrip("\n\r")
        ending = line[len(body) :]
        body, r, s = process_surface_line(body)
        stats["radius"] += r
        stats["shadow"] += s
        body, n = process_nested_line(body, rel)
        stats["nested"] += n
        body, d = process_dialog_line(body)
        stats["dialogs"] += d
        lines.append(body + ending)
    text = "".join(lines)
    if text != orig:
        path.write_text(text, encoding="utf-8")
        stats["files"] += 1
        return True
    return False


def main() -> int:
    for path in sorted(ROOT.rglob("*")):
        if path.suffix in {".tsx", ".ts"}:
            migrate_file(path)
    print(stats)
    return 0


if __name__ == "__main__":
    sys.exit(main())
