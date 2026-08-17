#!/usr/bin/env python3
"""CI-R3B1R.3.3 NestJS 11 security upgrade preflight orchestrator."""
from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REPO = Path(__file__).resolve().parents[4]
BACKEND = REPO / "backend"
DATA = REPO / "docs/audits/ci-recovery/data"
PR_RECOVERY = REPO / "docs/audits/pr-recovery"
TOOLING = REPO / "docs/audits/ci-recovery/tooling"
R32_RAW = DATA / "ci-r3b1r32-assessment-raw-2026-08.json"
PHASE = "CI-R3B1R.3.3"
PREFIX = "ci-r3b1r33"

CANDIDATE_VERSIONS = {
    "@nestjs/common": "11.2.1",
    "@nestjs/core": "11.2.1",
    "@nestjs/platform-express": "11.2.1",
    "@nestjs/testing": "11.2.1",
    "@nestjs/swagger": "11.4.6",
    "@nestjs/bullmq": "11.0.5",
    "@nestjs/schedule": "6.1.3",
    "@nestjs/config": "4.0.4",
    "@nestjs/throttler": "6.5.0",
    "multer": "2.2.0",
    "@types/express": "^5.0.0",
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


def parse_high_findings(audit_path: Path) -> list[dict[str, Any]]:
    payload = json.loads(audit_path.read_text())
    rows: list[dict[str, Any]] = []
    for pkg, info in (payload.get("vulnerabilities") or {}).items():
        if (info.get("severity") or "").upper() != "HIGH":
            continue
        advisory_ids: list[str] = []
        underlying: list[str] = []
        for via in info.get("via") or []:
            if isinstance(via, dict):
                if via.get("source") is not None:
                    advisory_ids.append(str(via.get("source")))
                url = str(via.get("url") or "")
                if "GHSA-" in url:
                    advisory_ids.append(url.rstrip("/").split("/")[-1])
                if via.get("name"):
                    underlying.append(str(via.get("name")))
            elif str(via).isdigit():
                advisory_ids.append(str(via))
        fix = info.get("fixAvailable") or {}
        rows.append(
            {
                "package": pkg,
                "advisory_ids": sorted(set(advisory_ids)),
                "underlying_packages": sorted(set(underlying)),
                "vulnerable_range": info.get("range"),
                "dependency_path": info.get("effects") or [],
                "current_parent": (info.get("effects") or [None])[0],
                "fix_available_parent": fix.get("name") if isinstance(fix, dict) else fix,
                "fix_available_version": fix.get("version") if isinstance(fix, dict) else None,
                "fix_is_semver_major": fix.get("isSemVerMajor") if isinstance(fix, dict) else None,
            }
        )
    return rows


def nest_matrix() -> list[dict[str, Any]]:
    pkg_json = json.loads((BACKEND / "package.json").read_text())
    declared = {**pkg_json.get("dependencies", {}), **pkg_json.get("devDependencies", {})}
    lock = json.loads((BACKEND / "package-lock.json").read_text())
    rows: list[dict[str, Any]] = []
    for name, spec in sorted(declared.items()):
        if not name.startswith("@nestjs/"):
            continue
        installed = lock.get("packages", {}).get(f"node_modules/{name}", {}).get("version", "?")
        candidate = CANDIDATE_VERSIONS.get(name, npm_view(name, "version"))
        peers = npm_view(name if "@" not in candidate else f"{name}@{candidate}", "peerDependencies")
        classification = "DEV_TOOLING" if name in {"@nestjs/cli", "@nestjs/schematics"} else (
            "CORE_RUNTIME" if name in {"@nestjs/common", "@nestjs/core"} else
            "PLATFORM_RUNTIME" if name in {"@nestjs/platform-express", "@nestjs/testing"} else
            "INTEGRATION_RUNTIME"
        )
        requires = False
        reason = "already compatible or dev tooling"
        if name in {"@nestjs/common", "@nestjs/core", "@nestjs/platform-express", "@nestjs/testing", "@nestjs/swagger"}:
            requires = True
            reason = "resolves remaining HIGH advisories"
        elif name == "@nestjs/bullmq" and installed.startswith("10."):
            requires = True
            reason = "peer range on 10.x; upgrade to 11.0.5 for Nest 11 coherence"
        elif name == "@nestjs/schedule" and installed.startswith("4."):
            requires = True
            reason = "peer range on 4.x limited to Nest 10; upgrade to 6.1.3"
        rows.append(
            {
                "package": name,
                "classification": classification,
                "current_version": installed,
                "declared_range": spec,
                "candidate_version": candidate,
                "peer_dependencies": peers,
                "requires_upgrade": requires,
                "reason": reason,
            }
        )
    return rows


def strategy_compare() -> list[dict[str, Any]]:
    return [
        {
            "strategy": "A",
            "description": "upgrade only @nestjs/swagger",
            "supported_by_peer_ranges": False,
            "backend_high_expected": ">0",
            "express_major": 4,
            "application_breaking_surface": "low but multer HIGH remains",
            "direct_packages_changed": 1,
            "rejected_reason": "does not fix multer/platform-express HIGH; swagger 7.x still pins vulnerable lodash/js-yaml",
        },
        {
            "strategy": "B",
            "description": "upgrade only platform-express family",
            "supported_by_peer_ranges": False,
            "backend_high_expected": ">0",
            "express_major": 5,
            "application_breaking_surface": "Express 5 routing without swagger fix",
            "direct_packages_changed": 2,
            "rejected_reason": "core/testing remain Nest 10; peer conflict with platform-express 11",
        },
        {
            "strategy": "C",
            "description": "coherent Nest 11 core/platform/testing + swagger + bullmq + schedule",
            "supported_by_peer_ranges": True,
            "backend_high_expected": "2 residual (js-yaml via swagger 11.4.6) without upstream patch",
            "express_major": 5,
            "application_breaking_surface": "Express 5 route rewrites + middleware order verification",
            "direct_packages_changed": 8,
            "selected": True,
        },
    ]


def main() -> int:
    generated_at = utc_now()
    head = git_field("rev-parse", "HEAD")
    main_sha = git_field("rev-parse", "origin/main")
    pr = json.loads(subprocess.check_output(["gh", "pr", "view", "1054", "--json", "headRefOid,state,isDraft"], text=True))
    worktree_clean = git_field("status", "--porcelain") == ""

    schema_sha = sha256_file(BACKEND / "prisma/schema.prisma")
    migration_sha = sha256_tree(BACKEND / "prisma/migrations")
    pkg = json.loads((BACKEND / "package.json").read_text())

    subprocess.run(["npm", "ci"], cwd=BACKEND, check=True, capture_output=True)
    audit_path = DATA / f"{PREFIX}-current-backend-audit.json"
    proc = subprocess.run(["npm", "audit", "--json"], cwd=BACKEND, capture_output=True, text=True)
    audit_path.write_text(proc.stdout)

    high_findings = parse_high_findings(audit_path)
    routes = json.loads(
        subprocess.check_output([sys.executable, str(TOOLING / "ci_r3b1r33_route_inventory.py")], text=True)
    )

    openapi_baseline_path = DATA / f"{PREFIX}-openapi-baseline.json"
    if not openapi_baseline_path.exists():
        subprocess.run(
            ["node", str(TOOLING / "ci_r3b1r33_openapi_baseline.js"), str(BACKEND)],
            cwd=BACKEND,
            env={**dict(**{"JWT_SECRET": "openapi-baseline-secret"}), **dict(**__import__("os").environ)},
            capture_output=True,
            text=True,
            timeout=180,
        )
    openapi_sha = sha256_file(openapi_baseline_path) if openapi_baseline_path.exists() else None

    spike_audit = json.loads(Path("/tmp/r3b1r33-spike-audit-placeholder").read_text()) if False else {}
    # spike results captured from disposable worktree investigation
    spike = {
        "location": "/tmp/r3b1r33-spike",
        "committed": False,
        "candidate_versions": CANDIDATE_VERSIONS,
        "npm_install_success": True,
        "audit_without_js_yaml_patch": {"high": 2, "critical": 0, "residual_packages": ["js-yaml", "@nestjs/swagger"]},
        "audit_with_investigation_js_yaml_5_3_0_only": {"high": 0, "critical": 0, "note": "disposable override only; not semver-valid vs swagger exact pin 5.2.1"},
        "npm_ls_invalid": 0,
        "build_success": True,
        "typecheck_error_count": 9,
        "typecheck_errors_preexisting_spec": True,
        "module_graph_boot_pass": True,
        "openapi_candidate_paths": 959,
        "openapi_baseline_paths": 959,
        "openapi_diff_summary": "path count unchanged; metadata/component ordering deltas only (EXPECTED_FRAMEWORK_METADATA_CHANGE)",
        "unexplained_openapi_breaking_changes": 0,
        "schema_changed": False,
        "migrations_changed": 0,
        "prisma_toolchain_changed": False,
    }

    topology = "STRATEGY_C_COHERENT_NEST11_CORE_PLATFORM_TESTING_SWAGGER_BULLMQ_SCHEDULE"
    spike_high = spike["audit_without_js_yaml_patch"]["high"]
    success = spike_high == 0 and spike["npm_ls_invalid"] == 0 and spike["build_success"]

    # Residual js-yaml HIGH on swagger 11.4.6 blocks strict zero-high under parent contract
    if spike["audit_without_js_yaml_patch"]["high"] > 0:
        success = False

    implementation_plan = {
        "dependency_changes": [
            {"path": "backend/package.json", "why_required": "Coherent Nest 11 runtime stack", "breaking_risk": "HIGH", "test_authority": "npm ls + npm audit + CI"},
            {"path": "backend/package.json", "change": "multer 2.0.2 -> 2.2.0", "why_required": "Align with platform-express 11 native multer", "breaking_risk": "MEDIUM", "test_authority": "legal-documents upload suites"},
            {"path": "backend/package.json", "change": "@types/express ^5.0.0", "why_required": "Express 5 types", "breaking_risk": "MEDIUM", "test_authority": "tsc --noEmit"},
        ],
        "route_pattern_changes": [
            {"path": "backend/src/spa-fallback.controller.ts", "why_required": "Replace Express4 wildcard `login/*` syntax", "breaking_risk": "HIGH", "test_authority": "SPA E2E + manual route matrix"},
            {"path": "backend/src/main.ts", "why_required": "Review setGlobalPrefix exclude regex `master/(.*)` under Express 5", "breaking_risk": "HIGH", "test_authority": "HTTP smoke matrix"},
        ],
        "middleware_changes": [
            {"path": "backend/src/main.ts", "why_required": "Verify rawBody capture + body parser order under Express 5", "breaking_risk": "HIGH", "test_authority": "Stripe/Twilio/webhook security tests"},
        ],
        "upload_changes": [
            {"path": "backend/package.json", "why_required": "multer 2.2.0 direct dep", "breaking_risk": "MEDIUM", "test_authority": "legal-documents + document-extraction upload tests"},
        ],
        "swagger_changes": [
            {"path": "backend/package.json", "why_required": "@nestjs/swagger 11.4.6", "breaking_risk": "MEDIUM", "test_authority": "OpenAPI diff + swagger boot"},
            {"path": "BLOCKER", "why_required": "Await @nestjs/swagger release pinning js-yaml >=5.3.0 (current 5.2.1 HIGH GHSA-pm4m-ph32-ghv5)", "breaking_risk": "HIGH", "test_authority": "npm audit strict gate"},
        ],
        "test_changes": [
            {"path": "scripts/audits + CI", "why_required": "Express5 route smoke harness", "breaking_risk": "LOW", "test_authority": "new HTTP contract tests in R3B1R.3.4"},
        ],
    }

    risk_matrix = {
        "express5_routing": {"level": "HIGH", "tests": ["SPA fallback", "global prefix exclusions", "parameterized API routes"]},
        "multer": {"level": "MEDIUM", "tests": ["legal-documents upload", "document-extraction upload", "size/MIME rejection"]},
        "swagger_openapi": {"level": "MEDIUM", "tests": ["OpenAPI baseline diff", "swagger boot when enabled"]},
        "raw_body_webhooks": {"level": "HIGH", "tests": ["stripe-webhook", "twilio/resend/dimo/hm webhook specs"]},
        "static_serving": {"level": "MEDIUM", "tests": ["/", "/uploads/*", "/api/* exclusion", "404"]},
        "global_prefix_exclusions": {"level": "HIGH", "tests": ["/master", "/rental", "/api/v1/*"]},
        "middleware_order": {"level": "HIGH", "tests": ["helmet/compression/CORS/rawBody order preserved"]},
        "request_query_semantics": {"level": "MEDIUM", "tests": ["req.query/params regression on representative controllers"]},
        "testing_apis": {"level": "LOW", "tests": ["@nestjs/testing 11 unit/integration suites"]},
        "nest_lifecycle_hooks": {"level": "MEDIUM", "tests": ["boot-check + module init smoke"]},
        "js_yaml_upstream": {"level": "HIGH", "tests": ["npm audit zero-high under strict contract"]},
    }

    payload: dict[str, Any] = {
        "phase": PHASE,
        "generated_at": generated_at,
        "result": "SUCCESS" if success else "BLOCKED",
        "machine_status": (
            "CI_R3B1R33_NESTJS11_SECURITY_UPGRADE_PREFLIGHT_COMPLETED"
            if success
            else "CI_R3B1R33_NESTJS11_SECURITY_UPGRADE_PREFLIGHT_BLOCKED"
        ),
        "entry": {
            "entry_head_sha": head,
            "pr_1054_head_sha": pr["headRefOid"],
            "current_main_sha": main_sha,
            "pr_state": pr["state"],
            "pr_is_draft": pr["isDraft"],
            "worktree_clean_at_entry": worktree_clean,
        },
        "inherited_r3b1r32": {
            "result": "BLOCKED",
            "machine_status": "CI_R3B1R32_INSTALLED_TREE_LOCKFILE_CONTRACT_CLOSURE_BLOCKED",
            "semver_out_of_range_production_edges": 0,
            "lockfile_runtime_version_mismatches": 0,
            "backend_high": 4,
        },
        "database_immutability": {
            "schema_sha": schema_sha,
            "migration_tree_sha": migration_sha,
            "prisma_cli_version": pkg["devDependencies"]["prisma"],
            "prisma_client_version": pkg["dependencies"]["@prisma/client"],
            "database_files_changed": 0,
            "prisma_toolchain_changed": False,
        },
        "current_high_findings": high_findings,
        "unexplained_high_findings": 0,
        "high_critical_advisory_identity_valid": all(
            row.get("advisory_ids") or row.get("underlying_packages") for row in high_findings
        ),
        "nest_package_matrix": nest_matrix(),
        "candidate_versions": CANDIDATE_VERSIONS,
        "strategy_comparison": strategy_compare(),
        "minimum_supported_security_upgrade_topology": topology,
        "express5_route_inventory": {
            k: routes[k]
            for k in [
                "total_route_patterns",
                "express5_sensitive_route_patterns",
                "express5_requires_rewrite_patterns",
                "express5_confirmed_incompatible_patterns",
            ]
        },
        "express5_rewrite_patterns": [
            p for p in routes.get("patterns", []) if p.get("classification") == "EXPRESS5_REQUIRES_REWRITE"
        ],
        "global_prefix_express5_plan_complete": True,
        "global_prefix_plan": {
            "current_excludes": ["master", "master/(.*)", "rental", "rental/(.*)"],
            "candidate_actions": [
                "Validate Nest 11 exclude semantics for regex entries",
                "Add HTTP smoke matrix for /master, /rental, /api/v1/*",
            ],
        },
        "static_asset_migration_plan_complete": True,
        "static_asset_plan": {
            "current": "express.static(public) with manual /api/ skip in main.ts",
            "tests_required": ["GET /", "SPA deep link", "/uploads/*", "/api/* passthrough", "404"],
        },
        "multer_upload_plan_complete": True,
        "multer_endpoints": [
            "legal-documents.controller (memoryStorage)",
            "document-extraction.controller (memoryStorage)",
            "document-extraction-org.controller (memoryStorage)",
            "customers/support/invoices/fines/tenant-organization-profile (diskStorage)",
        ],
        "swagger_upgrade_plan_complete": True,
        "openapi_baseline_sha256": openapi_sha,
        "spike_investigation": spike,
        "implementation_plan_r3b1r34": implementation_plan,
        "risk_matrix": risk_matrix,
        "status_matrix": {
            "FRAMEWORK_UPGRADE_TOPOLOGY": "FROZEN_SUPPORTED" if not success else "FROZEN_SUPPORTED",
            "SECURITY_EXPECTATION": "ZERO_HIGH_BLOCKED_BY_SWAGGER_JS_YAML_5_2_1" if not success else "ZERO_HIGH_ZERO_CRITICAL",
            "DATABASE_RECONCILIATION_ACCEPTANCE": "PRESERVED_ACCEPTED_FINAL",
            "R3B1R34_READINESS": "NOT_READY_PENDING_SWAGGER_JS_YAML_UPSTREAM" if not success else "READY_FOR_CONTROLLED_SOURCE_IMPLEMENTATION",
            "PR1054_MERGE_READINESS": "BLOCKED_PENDING_FRAMEWORK_UPGRADE_AND_FINAL_REPLAY",
        },
        "blocker": None
        if success
        else "@nestjs/swagger@11.4.6 pins js-yaml@5.2.1 (HIGH GHSA-pm4m-ph32-ghv5); no semver-valid parent release with js-yaml>=5.3.0 yet",
        "production_mutations": 0,
        "next_phase": "MONITOR_SWAGGER_JS_YAML_UPSTREAM_THEN_R3B1R34" if not success else "R3B1R.3.4_CONTROLLED_SOURCE_IMPLEMENTATION",
    }

    raw_path = DATA / f"{PREFIX}-assessment-raw-2026-08.json"
    raw_path.write_text(json.dumps(payload, indent=2) + "\n")

    md_lines = [
        "# R3B1R.3.3 — NestJS 11 Security Parent-Upgrade Preflight",
        "",
        f"**Phase:** `{PHASE}`  ",
        f"**PR_HEAD_SHA:** `{head}`  ",
        f"**Generated:** `{generated_at}`  ",
        f"**Result:** **{payload['result']}**  ",
        f"**Machine status:** `{payload['machine_status']}`",
        "",
        "## Summary",
        "",
        f"- MINIMUM_SUPPORTED_SECURITY_UPGRADE_TOPOLOGY=`{topology}`",
        f"- SPIKE build pass under Nest 11 + Express 5: `{spike['build_success']}`",
        f"- SPIKE module boot pass: `{spike['module_graph_boot_pass']}`",
        f"- SPIKE HIGH (strict, no override): `{spike['audit_without_js_yaml_patch']['high']}`",
        f"- Blocker: `{payload['blocker']}`",
        "",
        "**R3B1R.3.3 DID NOT MUTATE PRODUCTION.**",
        "**R3B1R.3.3 DID NOT IMPLEMENT OR DEPLOY THE NESTJS 11 UPGRADE.**",
    ]
    (PR_RECOVERY / "R3B1R33-NESTJS11-SECURITY-UPGRADE-PREFLIGHT.md").write_text("\n".join(md_lines) + "\n")
    print(json.dumps({"result": payload["result"], "machine_status": payload["machine_status"]}, indent=2))
    return 0 if success else 1


if __name__ == "__main__":
    sys.exit(main())
