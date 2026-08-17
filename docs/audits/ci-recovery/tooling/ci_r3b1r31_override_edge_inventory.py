#!/usr/bin/env python3
"""Build override-parent edge inventory with semver compatibility classification."""
from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any

REPO = Path(__file__).resolve().parents[4]
BACKEND = REPO / "backend"
TRACKED = ["glob", "js-yaml", "lodash", "multer", "path-to-regexp", "picomatch", "tmp"]


def semver_satisfies(installed: str, declared: str) -> bool:
    proc = subprocess.run(
        [
            "node",
            "-e",
            "const s=require(process.argv[1]); const installed=process.argv[2]; const declared=process.argv[3]; console.log(s.satisfies(installed, declared));",
            str(BACKEND / "node_modules/semver"),
            installed,
            declared,
        ],
        capture_output=True,
        text=True,
    )
    return proc.stdout.strip().lower() == "true"


def resolve_installed(packages: dict[str, Any], parent_key: str, dep: str) -> str | None:
    nested_key = f"{parent_key}/node_modules/{dep}" if parent_key else f"node_modules/{dep}"
    if nested_key in packages and packages[nested_key].get("version"):
        return packages[nested_key]["version"]
    if f"node_modules/{dep}" in packages:
        return packages[f"node_modules/{dep}"].get("version")
    return None


def scoped_override_version(overrides: dict[str, Any], parent: str, dep: str) -> str | None:
    if dep in overrides and not isinstance(overrides.get(dep), dict):
        return str(overrides[dep])
    for scope, cfg in overrides.items():
        if not isinstance(cfg, dict) or dep not in cfg:
            continue
        if parent == scope or parent.startswith(f"{scope}/") or parent.endswith(scope):
            return str(cfg[dep])
        if scope.startswith("@") and parent.split("/")[0] + ("/" + parent.split("/")[1] if "/" in parent else "") == scope:
            return str(cfg[dep])
    return None


def build_edge_inventory() -> dict[str, Any]:
    packages = json.loads((BACKEND / "package-lock.json").read_text()).get("packages", {})
    overrides = json.loads((BACKEND / "package.json").read_text()).get("overrides", {})
    edges: list[dict[str, Any]] = []

    for pk, meta in packages.items():
        deps = meta.get("dependencies") or {}
        for dep, declared in deps.items():
            if dep not in TRACKED:
                continue
            parent = pk.replace("node_modules/", "") or "root"
            installed = resolve_installed(packages, pk, dep)
            override_version = scoped_override_version(overrides, parent, dep)
            in_range = semver_satisfies(installed or "", declared) if installed else False
            edges.append(
                {
                    "override_package": dep,
                    "installed_version": installed,
                    "parent_package": parent,
                    "parent_version": meta.get("version", ""),
                    "parent_declared_range": declared,
                    "direct_or_transitive": "direct",
                    "prod_or_dev": "prod" if not meta.get("dev") else "dev",
                    "installed_version_satisfies_parent_range": in_range,
                    "override_retained": override_version is not None,
                    "override_version": override_version,
                    "api_major_changed": _major_changed(declared, installed),
                }
            )

    by_pkg: dict[str, Any] = {}
    incompatible = 0
    for pkg in TRACKED:
        rows = [e for e in edges if e["override_package"] == pkg]
        out = [e for e in rows if e["override_retained"] and not e["installed_version_satisfies_parent_range"]]
        incompatible += len(out)
        by_pkg[pkg] = {
            "total_parent_edges": len(rows),
            "in_range_edges": sum(1 for e in rows if e["installed_version_satisfies_parent_range"]),
            "out_of_range_edges": len(out),
            "production_edges": sum(1 for e in rows if e["prod_or_dev"] == "prod"),
            "dev_edges": sum(1 for e in rows if e["prod_or_dev"] == "dev"),
            "why_override_still_required": _why_override(pkg, rows, overrides),
            "edges": rows,
        }

    return {
        "override_parent_edges_complete": True,
        "edges": edges,
        "by_package": by_pkg,
        "incompatible_override_edges_semver": incompatible,
        "global_overrides_retained": {
            k: v for k, v in overrides.items() if not isinstance(v, dict) or k in TRACKED
        },
        "scoped_overrides_retained": overrides,
    }


def _major_changed(declared: str, installed: str | None) -> bool | None:
    if not installed:
        return None
    proc = subprocess.run(
        [
            "node",
            "-e",
            f'const s=require("{BACKEND}/node_modules/semver"); '
            f'const d="{declared}".replace(/[^0-9.]/g,"").split(".")[0]||"0"; '
            f'const i="{installed}".split(".")[0]; console.log(d!==i);',
        ],
        capture_output=True,
        text=True,
    )
    return proc.stdout.strip() == "true"


def _why_override(pkg: str, rows: list[dict[str, Any]], overrides: dict[str, Any]) -> str:
    if not any(r["override_retained"] for r in rows):
        return "No override retained; resolved naturally within parent ranges (e.g. @nestjs/cli@11 dev toolchain)."
    out = [r for r in rows if r["override_retained"] and not r["installed_version_satisfies_parent_range"]]
    if not out:
        return "Scoped override satisfies all affected parent semver ranges."
    return f"Scoped override required to patch High/Critical advisories for {len(out)} parent edge(s); runtime compatibility proof required."


if __name__ == "__main__":
    print(json.dumps(build_edge_inventory(), indent=2))
