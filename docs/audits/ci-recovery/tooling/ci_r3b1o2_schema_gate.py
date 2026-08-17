"""Schema authorized diff gate and validation artifacts for CI-R3B1O.2."""
from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any

from ci_r3b1m_constants import BACKEND, REPO, sha256_file, sha256_text
from ci_r3b1n2_constants import DATA

SCHEMA_PRISMA = BACKEND / "prisma" / "schema.prisma"


def schema_original_from_parent() -> tuple[str, dict[str, Any]]:
    proc = subprocess.run(
        ["git", "show", "origin/audit/ci-r3b1o1-final-strategy-acceptance-2026-08:backend/prisma/schema.prisma"],
        cwd=REPO,
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr or proc.stdout)
    text = proc.stdout
    manifest = {
        "schema_version": 1,
        "phase": "CI-R3B1O.2",
        "path": "backend/prisma/schema.prisma",
        "source": "origin/audit/ci-r3b1o1-final-strategy-acceptance-2026-08",
        "sha256": sha256_text(text),
        "byte_size": len(text.encode("utf-8")),
        "line_count": len(text.splitlines()),
    }
    return text, manifest


def build_schema_original_manifest() -> dict[str, Any]:
    _, manifest = schema_original_from_parent()
    out_path = DATA / "ci-r3b1o2-schema-original-manifest-2026-08.json"
    out_path.write_text(json.dumps(manifest, indent=2) + "\n")
    return manifest


def validate_authorized_schema_diff() -> dict[str, Any]:
    original, _ = schema_original_from_parent()
    final = SCHEMA_PRISMA.read_text()
    original_lines = original.splitlines()
    final_lines = final.splitlines()

    changed = []
    unauthorized = []
    authorized_markers = [
        '@id(map: "org_role_asgn_drift_recon_apps_pkey")',
        '@unique(map: "org_role_asgn_drift_recon_apps_idem_key")',
        'map: "org_role_asgn_drift_recon_apps_org_mbr_created_idx"',
        'map: "org_role_asgn_drift_recon_apps_org_id_fkey"',
        'map: "org_role_asgn_drift_recon_apps_mbr_id_fkey"',
    ]

    max_len = max(len(original_lines), len(final_lines))
    for i in range(max_len):
        o = original_lines[i] if i < len(original_lines) else ""
        f = final_lines[i] if i < len(final_lines) else ""
        if o != f:
            entry = {"line": i + 1, "before": o, "after": f}
            changed.append(entry)
            if not any(m in f or m in o for m in authorized_markers) and "OrganizationRoleAssignmentDriftReconciliationApplication" not in o + f:
                if o.strip() or f.strip():
                    unauthorized.append(entry)

    out = {
        "schema_version": 1,
        "phase": "CI-R3B1O.2",
        "changed_lines": changed,
        "authorized_change_count": len(changed),
        "unauthorized_lines": unauthorized,
        "unauthorized_count": len(unauthorized),
        "pass": len(unauthorized) == 0 and len(changed) > 0,
    }
    (DATA / "ci-r3b1o2-schema-authorized-diff-2026-08.json").write_text(json.dumps(out, indent=2) + "\n")
    (DATA / "ci-r3b1o2-final-source-scope-validation-2026-08.json").write_text(
        json.dumps(
            {
                "schema_version": 1,
                "phase": "CI-R3B1O.2",
                "original_sha256": sha256_text(original),
                "final_sha256": sha256_file(SCHEMA_PRISMA),
                "unauthorized_source_changes": len(unauthorized),
                "pass": len(unauthorized) == 0,
            },
            indent=2,
        )
        + "\n",
    )
    return out


def run_prisma_validation() -> dict[str, Any]:
    validate = subprocess.run(["npx", "prisma", "validate"], cwd=REPO / "backend", capture_output=True, text=True)
    generate = subprocess.run(["npx", "prisma", "generate"], cwd=REPO / "backend", capture_output=True, text=True)
    version = subprocess.run(["npx", "prisma", "-v"], cwd=REPO / "backend", capture_output=True, text=True)
    out = {
        "schema_version": 1,
        "phase": "CI-R3B1O.2",
        "validate_exit_code": validate.returncode,
        "generate_exit_code": generate.returncode,
        "prisma_version_output": (version.stdout or version.stderr or "").strip(),
        "pass": validate.returncode == 0 and generate.returncode == 0,
    }
    (DATA / "ci-r3b1o2-prisma-validation-2026-08.json").write_text(json.dumps(out, indent=2) + "\n")
    return out
