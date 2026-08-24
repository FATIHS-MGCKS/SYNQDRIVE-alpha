#!/usr/bin/env python3
"""Cleanup mistaken rounded-dialog application."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "src"

MODAL_LINE = re.compile(
    r"max-h-\[(?:8|9)|"
    r"w-full max-w-|sm:max-w-|"
    r"SheetContent|"
    r"fixed top-\[|fixed inset|"
    r"translate-x-\[-50%\]|"
    r"HandoverProtocol|"
    r"StationFormModal|StationAssignVehicleModal|"
    r"MasterAccountSheet|"
    r"MfaStepUpDialog|MfaEnrollmentPanel|"
    r"VendorDetailView.*max-h|"
    r"overflow-y-auto rounded-dialog.*shadow-2xl|"
    r"flex flex-col rounded-dialog.*shadow-2xl|"
    r"showImportModal|ImportModal|importStep"
)

stats = {"modal": 0, "surface": 0, "control": 0, "panel": 0}


def cleanup_line(line: str) -> str:
    if "rounded-dialog" not in line or "rounded-t-dialog" in line:
        return line

    if MODAL_LINE.search(line):
        if re.search(r"\bsurface-(?:solid|premium|elevated)\b", line):
            line = re.sub(r" ?shadow-\[var\(--shadow-[1234]\)\]", "", line)
            line = re.sub(r" ?shadow-(?:lg|xl|2xl)\b", "", line)
        stats["modal"] += 1
        return line

    if "DataCard" in line or "MetricCard" in line or "SkeletonCard" in line:
        stats["surface"] += 1
        return (
            line.replace("rounded-dialog sq-dialog-panel ", "")
            .replace(" rounded-dialog sq-dialog-panel", "")
            .replace("shadow-[var(--shadow-1)] ", "")
            .replace(" shadow-[var(--shadow-1)]", "")
        )

    if re.search(r"\bsurface-(?:solid|premium|elevated)\b", line):
        stats["surface"] += 1
        return line.replace("rounded-dialog sq-dialog-panel", "").replace("  ", " ")

    if re.search(r"<(?:select|input|button)\b", line) or "appearance-none" in line or "sq-tab-bar" in line:
        stats["control"] += 1
        return line.replace("rounded-dialog sq-dialog-panel", "rounded-md")

    if "px-4 py-3" in line or "px-5 py-2" in line:
        stats["control"] += 1
        return line.replace("rounded-dialog sq-dialog-panel", "rounded-md")

    stats["panel"] += 1
    return line.replace("rounded-dialog sq-dialog-panel", "rounded-lg")


def main() -> None:
    n = 0
    for path in sorted(ROOT.rglob("*")):
        if path.suffix not in {".tsx", ".ts"}:
            continue
        text = path.read_text(encoding="utf-8")
        out = []
        changed = False
        for line in text.splitlines(keepends=True):
            body, end = line.rstrip("\n\r"), line[len(line.rstrip("\n\r")) :]
            new = cleanup_line(body)
            changed = changed or new != body
            out.append(new + end)
        if changed:
            path.write_text("".join(out), encoding="utf-8")
            n += 1
    print({"files": n, **stats})


if __name__ == "__main__":
    main()
