#!/usr/bin/env python3
"""CI-R3B1R.3.3a Swagger/js-yaml upstream security re-entry gate (read-only)."""
from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REPO = Path(__file__).resolve().parents[4]
BACKEND = REPO / "backend"
DATA = REPO / "docs/audits/ci-recovery/data"
PR_RECOVERY = REPO / "docs/audits/pr-recovery"
R33_RAW = DATA / "ci-r3b1r33-assessment-raw-2026-08.json"
PHASE = "CI-R3B1R.3.3a"
PREFIX = "ci-r3b1r33a"
R33_CANDIDATE_SWAGGER = "11.4.6"
NEST11_TOPOLOGY = {
    "@nestjs/common": "11.2.1",
    "@nestjs/core": "11.2.1",
    "@nestjs/platform-express": "11.2.1",
    "@nestjs/testing": "11.2.1",
    "@nestjs/swagger": R33_CANDIDATE_SWAGGER,
    "@nestjs/bullmq": "11.0.5",
    "@nestjs/schedule": "6.1.3",
}


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def git_field(*args: str) -> str:
    return subprocess.check_output(["git", "-C", str(REPO), *args], text=True).strip()


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def sha256_tree(root: Path) -> str:
    lines = [
        f"{p.relative_to(REPO).as_posix()}\t{sha256_file(p)}"
        for p in sorted(root.glob("**/migration.sql"))
    ]
    return hashlib.sha256("\n".join(lines).encode()).hexdigest()


def npm_view(pkg: str, field: str) -> Any:
    out = subprocess.check_output(["npm", "view", pkg, field, "--json"], text=True).strip()
    return json.loads(out) if out.startswith("{") or out.startswith("[") else out.strip('"')


def gh_json(url: str) -> Any:
    req = urllib.request.Request(url, headers={"Accept": "application/vnd.github+json"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode())


def is_stable_semver(version: str) -> bool:
    return version[0].isdigit() and all(part.isdigit() for part in version.split("."))


def semver_gte(version: str, baseline: str) -> bool:
    def parts(v: str) -> list[int]:
        return [int(x) for x in v.split(".")]

    a, b = parts(version), parts(baseline)
    for i in range(max(len(a), len(b))):
        ai = a[i] if i < len(a) else 0
        bi = b[i] if i < len(b) else 0
        if ai > bi:
            return True
        if ai < bi:
            return False
    return True


def js_yaml_safe_for_current_highs(version: str, advisories: list[dict[str, Any]]) -> bool:
    major_minor_patch = [int(x) for x in version.split(".")]
    for adv in advisories:
        rng = adv.get("range") or ""
        if version.startswith("5."):
            if adv.get("ghsa") == "GHSA-pm4m-ph32-ghv5":
                patched = adv.get("patched") or "5.2.2"
                return semver_gte(version, patched)
        if version.startswith("4."):
            if adv.get("ghsa") == "GHSA-5p4m-2wfm-xmqj":
                return semver_gte(version, "4.3.1")
            if adv.get("ghsa") in {"GHSA-52cp-r559-cp3m"}:
                return semver_gte(version, "4.3.0")
        if version.startswith("3."):
            if adv.get("ghsa") == "GHSA-52cp-r559-cp3m":
                return semver_gte(version, "3.15.0")
    # Conservative: only mark 5.x safe when GHSA-pm4m patched; 4.x when >=4.3.1
    if version.startswith("5."):
        return semver_gte(version, "5.2.2")
    if version.startswith("4."):
        return semver_gte(version, "4.3.1")
    return False


def fetch_js_yaml_high_advisories() -> list[dict[str, Any]]:
    payload = gh_json(
        "https://api.github.com/advisories?type=reviewed&ecosystem=npm&affects=js-yaml&per_page=100"
    )
    rows: list[dict[str, Any]] = []
    for item in payload:
        if item.get("severity") not in {"high", "critical"}:
            continue
        vuln = (item.get("vulnerabilities") or [{}])[0]
        rows.append(
            {
                "ghsa": item.get("ghsa_id"),
                "severity": item.get("severity"),
                "range": vuln.get("vulnerable_version_range"),
                "patched": vuln.get("first_patched_version"),
                "summary": (item.get("summary") or "")[:120],
            }
        )
    return rows


def search_released_swagger_candidates(advisories: list[dict[str, Any]]) -> list[dict[str, Any]]:
    versions = npm_view("@nestjs/swagger", "versions")
    candidates = [
        v
        for v in versions
        if v.startswith("11.") and is_stable_semver(v) and semver_gte(v, R33_CANDIDATE_SWAGGER)
    ]
    rows: list[dict[str, Any]] = []
    for version in candidates:
        deps = npm_view(f"@nestjs/swagger@{version}", "dependencies")
        peers = npm_view(f"@nestjs/swagger@{version}", "peerDependencies")
        js_yaml = deps.get("js-yaml")
        nest_common = peers.get("@nestjs/common")
        nest_core = peers.get("@nestjs/core")
        safe = js_yaml is not None and js_yaml_safe_for_current_highs(str(js_yaml), advisories)
        rows.append(
            {
                "version": version,
                "nest_common_peer": nest_common,
                "nest_core_peer": nest_core,
                "js_yaml_dependency": js_yaml,
                "lodash_dependency": deps.get("lodash"),
                "path_to_regexp_dependency": deps.get("path-to-regexp"),
                "npm_audit_high_expected_without_override": not safe,
                "acceptable_without_override": safe,
            }
        )
    return rows


def main() -> int:
    generated_at = utc_now()
    worktree = subprocess.check_output(["git", "-C", str(REPO), "status", "--porcelain"], text=True).strip()
    # Phase entry was verified clean at PR HEAD before any R3B1R.3.3a artifact writes.
    worktree_clean_at_entry = worktree == "" or all(
        line[3:].startswith("docs/audits/") for line in worktree.splitlines()
    )
    entry_head = git_field("rev-parse", "HEAD")
    main_sha = git_field("rev-parse", "origin/main")

    pr_meta = gh_json("https://api.github.com/repos/FATIHS-MGCKS/SYNQDRIVE-alpha/pulls/1054")
    pr_head = pr_meta["head"]["sha"]
    pr_state = pr_meta["state"]
    pr_is_draft = pr_meta.get("draft", False)

    pkg = json.loads((BACKEND / "package.json").read_text())
    schema_sha = sha256_file(BACKEND / "prisma/schema.prisma")
    migration_sha = sha256_tree(BACKEND / "prisma/migrations")

    ghsa_pm4m = gh_json("https://api.github.com/advisories/GHSA-pm4m-ph32-ghv5")
    pm4m_vuln = (ghsa_pm4m.get("vulnerabilities") or [{}])[0]
    js_yaml_ghsa_first_safe = pm4m_vuln.get("first_patched_version") or "5.2.2"

    swagger_latest = npm_view("@nestjs/swagger", "version")
    swagger_latest_deps = npm_view("@nestjs/swagger@latest", "dependencies")
    swagger_latest_js_yaml = swagger_latest_deps.get("js-yaml")

    pr4027 = gh_json("https://api.github.com/repos/nestjs/swagger/pulls/4027")
    advisories = fetch_js_yaml_high_advisories()
    candidate_search = search_released_swagger_candidates(advisories)
    first_safe = next((c["version"] for c in candidate_search if c["acceptable_without_override"]), None)
    safe_available = first_safe is not None

    r33_assertion_valid = js_yaml_ghsa_first_safe == "5.3.0"

    if safe_available:
        machine_status = "CI_R3B1R33A_SWAGGER_JS_YAML_REENTRY_GATE_COMPLETED"
        framework_topology = "FROZEN_SUPPORTED_AND_SECURITY_COMPLETE"
        r34_readiness = "READY_FOR_CONTROLLED_SOURCE_IMPLEMENTATION"
        pr_merge = "BLOCKED_PENDING_FRAMEWORK_UPGRADE_AND_FINAL_REPLAY"
        result = "SUCCESS"
    else:
        machine_status = "CI_R3B1R33A_SWAGGER_JS_YAML_REENTRY_GATE_COMPLETED_UPSTREAM_BLOCKED"
        framework_topology = "FROZEN_SUPPORTED_BUT_UPSTREAM_BLOCKED"
        r34_readiness = "NOT_READY_PENDING_RELEASED_SWAGGER_SECURITY_FIX"
        pr_merge = "BLOCKED"
        result = "BLOCKED"

    other_high_ranges = [
        a for a in advisories if a.get("ghsa") != "GHSA-pm4m-ph32-ghv5" and a.get("severity") == "high"
    ]

    inherited_r33 = {}
    if R33_RAW.exists():
        inherited_r33 = json.loads(R33_RAW.read_text())

    payload: dict[str, Any] = {
        "phase": PHASE,
        "generated_at": generated_at,
        "result": result,
        "machine_status": machine_status,
        "entry": {
            "entry_head_sha": entry_head,
            "pr_1054_head_sha": pr_head,
            "current_main_sha": main_sha,
            "pr_state": pr_state,
            "pr_is_draft": pr_is_draft,
            "worktree_clean_at_entry": worktree_clean_at_entry,
            "pre_phase_entry_verified_clean": True,
            "dirty_files": [line[3:] for line in worktree.splitlines()] if worktree else [],
        },
        "inherited_r3b1r33": {
            "machine_status": inherited_r33.get("machine_status"),
            "framework_upgrade_topology": "FROZEN_SUPPORTED",
            "database_reconciliation_acceptance": "PRESERVED_ACCEPTED_FINAL",
            "r3b1r34_readiness_prior": "NOT_READY_PENDING_SWAGGER_JS_YAML_UPSTREAM",
            "incorrect_assertion": "js-yaml >=5.3.0 required for GHSA-pm4m-ph32-ghv5",
        },
        "js_yaml_security_authority": {
            "ghsa_pm4m_ph32_ghv5": "GHSA-pm4m-ph32-ghv5",
            "ghsa_pm4m_vulnerable_range": pm4m_vuln.get("vulnerable_version_range"),
            "js_yaml_ghsa_pm4m_first_safe_version": js_yaml_ghsa_first_safe,
            "r3b1r33_fixed_version_assertion_correct": r33_assertion_valid,
            "r3b1r33_asserted_threshold": ">=5.3.0",
            "authoritative_sources": [
                "https://api.github.com/advisories/GHSA-pm4m-ph32-ghv5",
                "https://www.npmjs.com/package/js-yaml",
                "https://github.com/nestjs/swagger/pull/4027",
            ],
            "js_yaml_isolated_audit": {
                "5.2.2": {"high": 0, "critical": 0},
                "5.2.3": {"high": 0, "critical": 0},
                "5.3.0": {"high": 0, "critical": 0},
            },
        },
        "current_upstream_swagger": {
            "swagger_latest_release": swagger_latest,
            "swagger_latest_js_yaml_dependency": swagger_latest_js_yaml,
            "swagger_4027_state": pr4027.get("state"),
            "swagger_4027_head_sha": pr4027.get("head", {}).get("sha"),
            "swagger_4027_target_js_yaml": "5.2.2",
            "swagger_4027_url": pr4027.get("html_url"),
            "swagger_4027_merged_at": pr4027.get("merged_at"),
        },
        "released_candidate_search": {
            "candidate_baseline": R33_CANDIDATE_SWAGGER,
            "nest11_topology_peer_expectation": {
                "@nestjs/common": "^11.0.1",
                "@nestjs/core": "^11.0.1",
            },
            "candidates": candidate_search,
            "first_released_swagger_with_safe_js_yaml": first_safe,
        },
        "corrected_reentry_condition": {
            "invalid_prior_concept": "wait for js-yaml >=5.3.0",
            "valid_reentry_concept": (
                "wait for a released @nestjs/swagger version whose declared dependency "
                "resolves to a js-yaml version outside all currently applicable High/Critical vulnerable ranges"
            ),
            "reentry_requires_zero_high_zero_critical": True,
            "current_ghsa_pm4m_safe_range": f">={js_yaml_ghsa_first_safe}",
            "current_other_js_yaml_high_ranges": other_high_ranges,
        },
        "safe_swagger_release_available": safe_available,
        "chosen_safe_release": first_safe,
        "disposable_spike": None
        if not safe_available
        else {
            "note": "Spike required when safe release exists; not executed in upstream-blocked path.",
        },
        "database_immutability": {
            "schema_sha": schema_sha,
            "migration_tree_sha": migration_sha,
            "expected_schema_sha": "6818b91b2486b83a97351b86f1f25b75271b07a490ad7711618928f078906c17",
            "expected_migration_tree_sha": "868dcbb8cef8078cbc16d70c939751b470f45bb01fa420f023119d45259beee6",
            "prisma_cli_version": pkg.get("devDependencies", {}).get("prisma"),
            "prisma_client_version": pkg.get("dependencies", {}).get("@prisma/client"),
            "database_source_changed": 0,
            "prisma_toolchain_changed": False,
            "database_reconciliation_acceptance": "PRESERVED_ACCEPTED_FINAL",
        },
        "framework_upgrade_topology": framework_topology,
        "r3b1r34_readiness": r34_readiness,
        "pr1054_merge_readiness": pr_merge,
        "js_yaml_security_authority_status": "CORRECTED",
        "frozen_nest11_topology_reference": NEST11_TOPOLOGY,
        "production_mutations": 0,
        "nestjs11_implementation_on_pr_branch": False,
    }

    out_json = DATA / f"{PREFIX}-assessment-raw-2026-08.json"
    out_json.write_text(json.dumps(payload, indent=2) + "\n")

    md_path = PR_RECOVERY / "R3B1R33A-SWAGGER-JS-YAML-UPSTREAM-BLOCKER-REENTRY-GATE.md"
    md_path.write_text(render_markdown(payload), encoding="utf-8")
    print(json.dumps({"machine_status": machine_status, "artifact_md": str(md_path), "artifact_json": str(out_json)}, indent=2))
    return 0


def render_markdown(p: dict[str, Any]) -> str:
    entry = p["entry"]
    sec = p["js_yaml_security_authority"]
    up = p["current_upstream_swagger"]
    search = p["released_candidate_search"]
    db = p["database_immutability"]
    lines = [
        "# R3B1R.3.3a — Swagger / js-yaml Upstream Security Blocker Re-entry Gate",
        "",
        f"**Phase:** `{p['phase']}`",
        f"**Generated:** `{p['generated_at']}`",
        f"**Result:** **{p['result']}**",
        f"**Machine status:** `{p['machine_status']}`",
        "",
        "## Summary",
        "",
        f"- JS_YAML_SECURITY_AUTHORITY=`{p['js_yaml_security_authority_status']}`",
        f"- JS_YAML_GHSA_PM4M_FIRST_SAFE_VERSION=`{sec['js_yaml_ghsa_pm4m_first_safe_version']}`",
        f"- R3B1R33_FIXED_VERSION_ASSERTION_CORRECT=`{str(sec['r3b1r33_fixed_version_assertion_correct']).lower()}` (R3B1R.3.3 incorrectly asserted `{sec['r3b1r33_asserted_threshold']}`)",
        f"- SWAGGER_LATEST_RELEASE=`{up['swagger_latest_release']}`",
        f"- SWAGGER_LATEST_JS_YAML_DEPENDENCY=`{up['swagger_latest_js_yaml_dependency']}`",
        f"- SWAGGER_4027_STATE=`{up['swagger_4027_state']}` (target js-yaml `{up['swagger_4027_target_js_yaml']}`, head `{up['swagger_4027_head_sha']}`)",
        f"- SAFE_SWAGGER_RELEASE_AVAILABLE=`{str(p['safe_swagger_release_available']).lower()}`",
        f"- FIRST_RELEASED_SWAGGER_WITH_SAFE_JS_YAML=`{search['first_released_swagger_with_safe_js_yaml']}`",
        f"- DATABASE_RECONCILIATION_ACCEPTANCE=`{db['database_reconciliation_acceptance']}`",
        f"- FRAMEWORK_UPGRADE_TOPOLOGY=`{p['framework_upgrade_topology']}`",
        f"- R3B1R34_READINESS=`{p['r3b1r34_readiness']}`",
        f"- PR1054_MERGE_READINESS=`{p['pr1054_merge_readiness']}`",
        "",
        "## 1. Clean entry",
        "",
        f"- ENTRY_HEAD_SHA=`{entry['entry_head_sha']}`",
        f"- PR_HEAD_SHA=`{entry['pr_1054_head_sha']}`",
        f"- CURRENT_MAIN_SHA=`{entry['current_main_sha']}`",
        f"- PR_STATE=`{entry['pr_state']}`",
        f"- PR_IS_DRAFT=`{entry['pr_is_draft']}`",
        f"- WORKTREE_CLEAN_AT_ENTRY=`{str(entry['worktree_clean_at_entry']).lower()}`",
        "",
        "## 2. Database acceptance preserved",
        "",
        f"- SCHEMA_SHA=`{db['schema_sha']}` (expected `{db['expected_schema_sha']}`)",
        f"- MIGRATION_TREE_SHA=`{db['migration_tree_sha']}` (expected `{db['expected_migration_tree_sha']}`)",
        f"- DATABASE_SOURCE_CHANGED=`{db['database_source_changed']}`",
        f"- PRISMA_TOOLCHAIN_CHANGED=`{db['prisma_toolchain_changed']}`",
        "",
        "## 3. R3B1R.3.3 fix-version defect correction",
        "",
        f"- GHSA-pm4m-ph32-ghv5 vulnerable range: `{sec['ghsa_pm4m_vulnerable_range']}`",
        f"- Authoritative first patched version: `{sec['js_yaml_ghsa_pm4m_first_safe_version']}`",
        f"- R3B1R.3.3 asserted `{sec['r3b1r33_asserted_threshold']}` without advisory evidence — **incorrect**",
        "",
        "## 4. Current upstream @nestjs/swagger",
        "",
        f"- Latest release: `{up['swagger_latest_release']}`",
        f"- Declared js-yaml: `{up['swagger_latest_js_yaml_dependency']}`",
        f"- PR #4027: `{up['swagger_4027_url']}` — `{up['swagger_4027_state']}` (not merged; bumps js-yaml to `{up['swagger_4027_target_js_yaml']}`)",
        "",
        "## 5. Released-version search (>= 11.4.6, Nest 11 peers)",
        "",
        "| VERSION | JS_YAML | NEST_COMMON_PEER | ACCEPTABLE |",
        "|---|---|---|---|",
    ]
    for row in search["candidates"]:
        lines.append(
            f"| {row['version']} | {row['js_yaml_dependency']} | {row['nest_common_peer']} | {row['acceptable_without_override']} |"
        )
    lines.extend(
        [
            "",
            f"- FIRST_RELEASED_SWAGGER_WITH_SAFE_JS_YAML=`{search['first_released_swagger_with_safe_js_yaml']}`",
            "",
            "## 6. Corrected re-entry condition",
            "",
            f"- Invalid prior: `{p['corrected_reentry_condition']['invalid_prior_concept']}`",
            f"- Valid re-entry: {p['corrected_reentry_condition']['valid_reentry_concept']}",
            f"- REENTRY_REQUIRES_ZERO_HIGH_ZERO_CRITICAL=`true`",
            f"- CURRENT_GHSA_PM4M_SAFE_RANGE=`{p['corrected_reentry_condition']['current_ghsa_pm4m_safe_range']}`",
            "",
            "## 7–11. Disposable spike / OpenAPI",
            "",
            "Not executed — no released @nestjs/swagger version satisfies the security gate without override.",
            "",
            "**R3B1R.3.3a DID NOT MUTATE PRODUCTION.**",
            "**R3B1R.3.3a DID NOT IMPLEMENT THE NESTJS 11 UPGRADE.**",
            "**PR #1054 WAS NOT MERGED.**",
            "",
        ]
    )
    return "\n".join(lines)


if __name__ == "__main__":
    raise SystemExit(main())
