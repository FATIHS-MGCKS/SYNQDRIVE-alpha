#!/usr/bin/env python3
"""Build CI-R3B1I replay input manifest including IAM repair migration."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from ci_r3b1i_constants import DATA, IAM_REPAIR_MIGRATION, REPO, evidence_input_sha

OUT = DATA / "ci-r3b1i-replay-input-manifest-2026-08.json"


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


def main() -> int:
    files: list[dict[str, str]] = []
    for path in sorted(REPO.glob("backend/prisma/migrations/*/migration.sql")):
        rel = str(path.relative_to(REPO))
        files.append({"path": rel, "sha256": sha256_file(path), "role": "migration_sql"})
    tooling = [
        "docs/audits/ci-recovery/tooling/replay_evidence_lib.py",
        "docs/audits/ci-recovery/tooling/ci_r3b1c_special_composite_index.py",
        "docs/audits/ci-recovery/tooling/ci_r3b1i_full_replay_harness.py",
        "docs/audits/ci-recovery/tooling/ci_r3b1c_r3b_parity.py",
        "docs/audits/ci-recovery/data/ci-r3b1c-special-replay-authority-2026-08.json",
        "docs/audits/ci-recovery/data/ci-r3b1i-input-provenance-2026-08.json",
    ]
    for rel in tooling:
        path = REPO / rel
        if path.exists():
            files.append({"path": rel, "sha256": sha256_file(path), "role": "replay_harness"})
    files.sort(key=lambda f: f["path"])
    digest = sha256_text("\n".join(f"{f['path']}\0{f['sha256']}" for f in files))
    out = {
        "schema_version": 1,
        "phase": "CI-R3B1I",
        "evidence_input_sha": evidence_input_sha(),
        "REPLAY_INPUT_MANIFEST_SHA256": digest,
        "file_count": len(files),
        "r3b1i_repair_migration": IAM_REPAIR_MIGRATION,
        "files": files,
    }
    OUT.write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps({"file_count": out["file_count"], "digest": digest[:16]}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
