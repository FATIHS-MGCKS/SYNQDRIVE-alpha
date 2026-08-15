#!/usr/bin/env python3
"""Build CI-R3B1E implementation authority manifest with SHA-256 bindings."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from ci_r3b1e_constants import BASE_R3B1D12_SHA, DATA, IMPLEMENTATION_AUTHORITY_FILES, REPO

OUT = DATA / "ci-r3b1e-implementation-authority-manifest-2026-08.json"


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


def main() -> int:
    entries = []
    for role, path in IMPLEMENTATION_AUTHORITY_FILES.items():
        rel = str(path.relative_to(REPO))
        entries.append({"role": role, "path": rel, "sha256": sha256_file(path)})
    entries.sort(key=lambda e: e["path"])
    manifest_body = "\n".join(f"{e['path']}\0{e['sha256']}" for e in entries)
    manifest_sha = sha256_text(manifest_body)
    out = {
        "schema_version": 1,
        "phase": "CI-R3B1E",
        "BASE_R3B1D12_SHA": BASE_R3B1D12_SHA,
        "IMPLEMENTATION_AUTHORITY_MANIFEST_SHA256": manifest_sha,
        "entries": entries,
        "pass": True,
    }
    OUT.write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps({"manifest_sha256": manifest_sha, "entries": len(entries)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
