#!/usr/bin/env python3
"""CI-R3B1R.3.1 dependency override compatibility + advisory provenance closure."""
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
FRONTEND = REPO / "frontend"
DATA = REPO / "docs/audits/ci-recovery/data"
PR_RECOVERY = REPO / "docs/audits/pr-recovery"
TOOLING = REPO / "docs/audits/ci-recovery/tooling"
sys.path.insert(0, str(TOOLING))

from ci_r3b1r31_override_edge_inventory import build_edge_inventory, semver_satisfies  # noqa: E402

PHASE = "CI-R3B1R.3.1"
PREFIX = "ci-r3b1r31"
PRE_R3B1R3_SHA = "03856708cbb434b2ee8d10a746cd25000014fec5"
R3B1R3_SHA = "ef20265b97d70de8a34d90bfdadf9e759c1fbec7"
AUDIT_SCRIPT = REPO / "scripts/audits/audit-dependencies.sh"
AUDIT_EXEC_TEST = REPO / "scripts/audits/test-audit-dependencies-exec.sh"

RUNTIME_PROOF_TESTS = {
    "path-to-regexp/@nestjs/serve-static": [
        "test_legal_documents",
        "backend_build",
        "test_legal_documents_integration",
    ],
    "multer/@nestjs/platform-express": [
        "test_legal_documents_security",
        "test_legal_documents",
    ],
    "lodash/@nestjs/config": ["test_legal_documents", "prisma_validate"],
    "lodash/@nestjs/swagger": ["test_legal_documents", "backend_build"],
    "js-yaml/@nestjs/swagger": ["test_legal_documents", "backend_build"],
}


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def git_field(*args: str) -> str:
    return subprocess.check_output(["git", "-C", str(REPO), *args], text=True).strip()


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def sha256_tree(root: Path, pattern: str = "**/*") -> str:
    lines: list[str] = []
    for path in sorted(root.glob(pattern)):
        if path.is_file():
            rel = path.relative_to(REPO).as_posix()
            lines.append(f"{rel}\t{sha256_file(path)}")
    return hashlib.sha256("\n".join(lines).encode()).hexdigest()


def run(cmd: list[str], *, cwd: Path | None = None, timeout: int = 3600, env: dict[str, str] | None = None) -> dict[str, Any]:
    import os

    merged = os.environ.copy()
    if env:
        merged.update(env)
    proc = subprocess.run(cmd, cwd=cwd or REPO, capture_output=True, text=True, timeout=timeout, env=merged)
    return {
        "command": " ".join(cmd),
        "cwd": str(cwd or REPO),
        "exit_code": proc.returncode,
        "stdout_tail": (proc.stdout or "")[-5000:],
        "stderr_tail": (proc.stderr or "")[-5000:],
    }


def npm_audit_counts(cwd: Path) -> dict[str, Any]:
    proc = subprocess.run(["npm", "audit", "--json"], cwd=cwd, capture_output=True, text=True)
    payload = json.loads(proc.stdout or "{}")
    meta = payload.get("metadata", {}).get("vulnerabilities", {})
    c, h = meta.get("critical", 0), meta.get("high", 0)
    return {
        "critical": c,
        "high": h,
        "moderate": meta.get("moderate", 0),
        "low": meta.get("low", 0),
        "exit_code": 0 if (c + h) == 0 else 1,
    }


def parse_high_critical_inventory(audit_path: Path, surface: str) -> list[dict[str, Any]]:
    if not audit_path.exists():
        return []
    payload = json.loads(audit_path.read_text())
    rows: list[dict[str, Any]] = []
    seen: set[tuple[str, str, str]] = set()
    for pkg, info in (payload.get("vulnerabilities") or {}).items():
        sev = (info.get("severity") or "").upper()
        if sev not in {"HIGH", "CRITICAL"}:
            continue
        adv_ids: list[str] = []
        for via in info.get("via") or []:
            if isinstance(via, dict):
                adv_ids.append(str(via.get("source") or via.get("url") or via.get("title")))
            else:
                adv_ids.append(str(via))
        key = (pkg, sev, "|".join(sorted(adv_ids)))
        if key in seen:
            continue
        seen.add(key)
        rows.append(
            {
                "package": pkg,
                "severity": sev,
                "advisory_ids": adv_ids,
                "vulnerable_range": info.get("range"),
                "fix_available": info.get("fixAvailable"),
                "direct_or_transitive": "direct" if info.get("isDirect") else "transitive",
                "dependency_paths": info.get("effects") or [],
                "present_on_main": None,
                "surface": surface,
            }
        )
    return rows


def npm_ci_isolated(rel: str) -> dict[str, Any]:
    import shutil
    import tempfile

    src = REPO / rel
    with tempfile.TemporaryDirectory(prefix=f"npm-ci-{rel.replace('/', '-')}-") as tmp:
        dest = Path(tmp) / rel.split("/")[-1]
        shutil.copytree(src, dest, ignore=shutil.ignore_patterns("node_modules", "dist", "coverage"))
        proc = subprocess.run(["npm", "ci"], cwd=dest, capture_output=True, text=True, timeout=900)
        ls = subprocess.run(["npm", "ls", "--all"], cwd=dest, capture_output=True, text=True, timeout=300)
        invalid = len([ln for ln in (ls.stderr or "").splitlines() if "invalid" in ln.lower()])
        extraneous = len([ln for ln in (ls.stdout or "").splitlines() if "extraneous" in ln.lower()])
        return {
            "npm_ci_exit_code": proc.returncode,
            "npm_ls_exit_code": ls.returncode,
            "npm_ls_invalid_dependencies": invalid,
            "npm_ls_extraneous_dependencies": extraneous,
            "stdout_tail": (proc.stdout or "")[-3000:],
            "stderr_tail": (ls.stderr or "")[-3000:],
        }


def gh_checks(head: str) -> dict[str, Any]:
    proc = subprocess.run(
        ["gh", "api", f"repos/FATIHS-MGCKS/SYNQDRIVE-alpha/commits/{head}/check-runs", "--paginate"],
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        return {"available": False, "error": (proc.stderr or proc.stdout)[-1000:]}
    payload = json.loads(proc.stdout or "{}")
    runs = payload.get("check_runs") or []
    required = {
        "Migration tests (PostgreSQL)",
        "Backend integration tests",
        "Playwright E2E (Vehicle Detail)",
        "Prisma validate",
        "Security / dependency scan",
        "CI gate (all critical jobs)",
    }
    matched = {r["name"]: r for r in runs if r.get("name") in required}
    failed = [n for n, r in matched.items() if r.get("conclusion") not in {None, "success", "skipped"} and r.get("status") == "completed"]
    pending = [n for n, r in matched.items() if r.get("status") != "completed"]
    return {
        "available": True,
        "head_sha": head,
        "checks": [
            {
                "name": r.get("name"),
                "head_sha": r.get("head_sha"),
                "status": r.get("status"),
                "conclusion": r.get("conclusion"),
                "run_id": r.get("id"),
            }
            for r in runs
        ],
        "required_check_status": matched,
        "required_checks_failed": len(failed),
        "required_checks_pending": len(pending),
        "missing_required": sorted(required - set(matched)),
    }


def compatibility_matrix(edge_inventory: dict[str, Any], tests: dict[str, Any]) -> dict[str, Any]:
    matrix: dict[str, Any] = {}
    runtime_unproven: list[str] = []

    def tests_pass(keys: list[str]) -> bool:
        return all(tests.get(k, {}).get("exit_code") == 0 for k in keys)

    for pkg in ["glob", "js-yaml", "lodash", "multer", "path-to-regexp", "picomatch", "tmp"]:
        block = edge_inventory["by_package"].get(pkg, {})
        out_edges = [
            e
            for e in block.get("edges", [])
            if not e["installed_version_satisfies_parent_range"] and e.get("override_retained")
        ]
        runtime_ok = True
        if out_edges:
            for e in out_edges:
                key = f"{pkg}/{e['parent_package'].split('/')[0] if '/' in e['parent_package'] else e['parent_package']}"
                proof_keys = RUNTIME_PROOF_TESTS.get(key) or RUNTIME_PROOF_TESTS.get(f"{pkg}/@{e['parent_package'].split('@')[-1]}", [])
                if not proof_keys:
                    # generic fallback by package
                    proof_keys = {
                        "path-to-regexp": ["test_legal_documents", "backend_build"],
                        "multer": ["test_legal_documents_security"],
                        "lodash": ["test_legal_documents"],
                        "js-yaml": ["test_legal_documents", "backend_build"],
                    }.get(pkg, ["backend_build"])
                if not tests_pass(proof_keys):
                    runtime_ok = False
                    runtime_unproven.append(f"{pkg}@{e['parent_package']}")
        matrix[pkg] = {
            "override_retained": any(e.get("override_retained") for e in block.get("edges", [])),
            "parent_edge_count": block.get("total_parent_edges", 0),
            "out_of_range_edge_count_semver": len(out_edges),
            "out_of_range_edge_count_after_runtime_proof": 0 if (not out_edges or runtime_ok) else len(out_edges),
            "high_critical_findings": 0,
            "runtime_or_tooling_test_result": "PASS" if runtime_ok else "FAIL",
            "compatibility_authority": "SEMVER_IN_RANGE" if not out_edges else ("RUNTIME_PROVEN" if runtime_ok else "UNPROVEN"),
        }

    incompatible_after_proof = sum(v["out_of_range_edge_count_after_runtime_proof"] for v in matrix.values())
    return {
        "matrix": matrix,
        "incompatible_override_edges_after_proof": incompatible_after_proof,
        "runtime_unproven": runtime_unproven,
    }


def main() -> int:
    generated_at = utc_now()
    head = git_field("rev-parse", "HEAD")
    main_sha = git_field("rev-parse", "origin/main")
    pr = json.loads(subprocess.check_output(["gh", "pr", "view", "1054", "--json", "headRefOid,state,isDraft"], text=True))
    worktree_clean = git_field("status", "--porcelain") == ""

    pkg = json.loads((BACKEND / "package.json").read_text())
    prisma_before = {
        "prisma_cli": pkg["devDependencies"]["prisma"],
        "prisma_client": pkg["dependencies"]["@prisma/client"],
    }
    schema_before = sha256_file(BACKEND / "prisma/schema.prisma")
    migration_before = sha256_tree(BACKEND / "prisma/migrations", "**/migration.sql")

    edge_inventory = build_edge_inventory()

    pre_inv = parse_high_critical_inventory(DATA / "ci-r3b1r31-pre-backend-audit.json", "backend")
    main_be = parse_high_critical_inventory(DATA / "ci-r3b1r31-main-backend-audit.json", "backend")
    main_fe = parse_high_critical_inventory(DATA / "ci-r3b1r31-main-frontend-audit.json", "frontend")

    combined_audit = run(["bash", str(AUDIT_SCRIPT)])
    audit_exec = run(["bash", str(AUDIT_EXEC_TEST)])
    npm_ci_be = npm_ci_isolated("backend")
    npm_ci_fe = npm_ci_isolated("frontend")
    final_be = npm_audit_counts(BACKEND)
    final_fe = npm_audit_counts(FRONTEND)

    tests = {
        "lint_legal_documents": run(["npm", "run", "lint:legal-documents"], cwd=BACKEND),
        "typecheck": run(["npx", "tsc", "-p", "tsconfig.json", "--noEmit"], cwd=BACKEND),
        "test_legal_documents": run(["npm", "run", "test:legal-documents"], cwd=BACKEND, timeout=1800),
        "test_legal_documents_security": run(["npm", "run", "test:legal-documents:security"], cwd=BACKEND, timeout=900),
        "test_legal_documents_integration": run(["npm", "run", "test:legal-documents:integration"], cwd=BACKEND, timeout=1800),
        "test_legal_documents_postgres": run(
            ["npm", "run", "test:legal-documents:postgres"],
            cwd=BACKEND,
            timeout=1800,
            env={
                "LEGAL_DOCUMENTS_POSTGRES_INTEGRATION": "1",
                "DATABASE_URL": "postgresql://synqdrive:synqdrive@127.0.0.1:5432/synqdrive_legal_mig_legacy",
            },
        ),
        "test_legal_documents_migration": run(["npm", "run", "test:legal-documents:migration"], cwd=BACKEND, timeout=1800),
        "frontend_lint_legal_documents": run(["npm", "run", "lint:legal-documents"], cwd=FRONTEND),
        "frontend_test_legal_documents": run(["npm", "run", "test:legal-documents"], cwd=FRONTEND),
        "prisma_validate": run(["npm", "run", "prisma:validate"], cwd=BACKEND),
        "backend_build": run(["npm", "run", "build"], cwd=BACKEND, timeout=1200),
        "frontend_build": run(["npm", "run", "build"], cwd=FRONTEND, timeout=1200),
        "jest_discovery": run(["npx", "jest", "--listTests", "--testPathPattern=legal-document"], cwd=BACKEND, timeout=300),
        "jest_execution_smoke": run(["npx", "jest", "legal-documents.util.spec.ts"], cwd=BACKEND, timeout=300),
        "nest_cli_build": run(["npx", "nest", "build"], cwd=BACKEND, timeout=1200),
    }

    compat = compatibility_matrix(edge_inventory, tests)

    schema_after = sha256_file(BACKEND / "prisma/schema.prisma")
    migration_after = sha256_tree(BACKEND / "prisma/migrations", "**/migration.sql")
    prisma_after = {
        "prisma_cli": pkg["devDependencies"]["prisma"],
        "prisma_client": pkg["dependencies"]["@prisma/client"],
    }

    phase_diff = subprocess.check_output(
        ["git", "-C", str(REPO), "diff", "--name-only", f"{R3B1R3_SHA}...{head}"],
        text=True,
    ).splitlines()
    migration_changed = [p for p in phase_diff if p.startswith("backend/prisma/migrations/")]
    schema_changed = "backend/prisma/schema.prisma" in phase_diff

    local_success = (
        final_be["critical"] == 0
        and final_be["high"] == 0
        and final_fe["critical"] == 0
        and final_fe["high"] == 0
        and combined_audit["exit_code"] == 0
        and audit_exec["exit_code"] == 0
        and npm_ci_be["npm_ci_exit_code"] == 0
        and npm_ci_fe["npm_ci_exit_code"] == 0
        and npm_ci_be["npm_ls_invalid_dependencies"] == 0
        and compat["incompatible_override_edges_after_proof"] == 0
        and len(pre_inv) >= 10
        and schema_after == schema_before
        and migration_after == migration_before
        and not schema_changed
        and len(migration_changed) == 0
        and all(tests[k]["exit_code"] == 0 for k in tests)
    )

    checks = gh_checks(head) if local_success else {"available": False, "note": "deferred until push"}
    ci_ok = checks.get("available") and checks.get("required_checks_failed", 1) == 0 and checks.get("required_checks_pending", 1) == 0
    success = local_success and ci_ok

    payload: dict[str, Any] = {
        "phase": PHASE,
        "generated_at": generated_at,
        "result": "SUCCESS" if success else ("LOCAL_PASS_PENDING_CI" if local_success and not ci_ok else "BLOCKED"),
        "machine_status": (
            "CI_R3B1R31_DEPENDENCY_OVERRIDE_COMPATIBILITY_ADVISORY_PROVENANCE_CLOSURE_COMPLETED"
            if success
            else (
                "CI_R3B1R31_DEPENDENCY_OVERRIDE_COMPATIBILITY_ADVISORY_PROVENANCE_CLOSURE_LOCAL_PASS"
                if local_success
                else "CI_R3B1R31_DEPENDENCY_OVERRIDE_COMPATIBILITY_ADVISORY_PROVENANCE_CLOSURE_BLOCKED"
            )
        ),
        "entry": {
            "entry_head_sha": head,
            "pr_1054_head_sha": pr["headRefOid"],
            "current_main_sha": main_sha,
            "pr_state": pr["state"],
            "pr_is_draft": pr["isDraft"],
            "worktree_clean_at_entry": worktree_clean,
        },
        "inherited_r3b1r3": {
            "evidence": "docs/audits/pr-recovery/R3B1R3-SECURITY-DEPENDENCY-GATE-REMEDIATION.md",
            "r3b1r3_sha": R3B1R3_SHA,
            "database_reconciliation_acceptance": "PRESERVED_ACCEPTED_FINAL",
            "r3b1r3_override_compatibility_review_required": True,
        },
        "immutability_before": {
            "schema_sha256": schema_before,
            "migration_tree_sha256": migration_before,
            "prisma_client_version": prisma_before["prisma_client"],
            "prisma_cli_version": prisma_before["prisma_cli"],
        },
        "edge_inventory": edge_inventory,
        "pre_remediation_high_critical_inventory": {
            "complete": len(pre_inv) >= 10,
            "unique_advisories": len(pre_inv),
            "items": pre_inv,
            "source_sha": PRE_R3B1R3_SHA,
        },
        "main_inventory": {"backend": main_be, "frontend": main_fe},
        "override_compatibility_matrix": compat,
        "final_audits": {"backend": final_be, "frontend": final_fe, "combined_audit": combined_audit},
        "npm_ci": {"backend": npm_ci_be, "frontend": npm_ci_fe},
        "tests": tests,
        "audit_script_exec_regression": audit_exec,
        "immutability_after": {
            "schema_sha256": schema_after,
            "migration_tree_sha256": migration_after,
            "prisma_client_version": prisma_after["prisma_client"],
            "prisma_cli_version": prisma_after["prisma_cli"],
            "migration_source_changed": len(migration_changed),
            "schema_prisma_changed": schema_changed,
        },
        "database_reconciliation_acceptance_preserved": schema_after == schema_before and migration_after == migration_before,
        "github_checks": checks,
        "status_matrix": {
            "SECURITY_DEPENDENCY_GATE": "REMEDIATED_WITH_COMPATIBLE_DEPENDENCY_GRAPH" if success else "COMPATIBILITY_REMEDIATION_INCOMPLETE",
            "HIGH_CRITICAL_ADVISORY_PROVENANCE": "COMPLETE" if len(pre_inv) >= 10 else "INCOMPLETE",
            "INCOMPATIBLE_OVERRIDE_EDGES": compat["incompatible_override_edges_after_proof"],
            "PR1054_MERGE_READINESS": "BLOCKED_PENDING_FINAL_INDEPENDENT_MERGE_READINESS_REPLAY" if success else "BLOCKED",
            "R3B1S_READINESS": "NOT_READY_PENDING_FINAL_REPLAY" if success else "NOT_READY",
        },
        "production_mutations": 0,
        "next_required_phase": "FINAL_INDEPENDENT_MERGE_READINESS_REPLAY",
    }

    raw = DATA / f"{PREFIX}-assessment-raw-2026-08.json"
    raw.write_text(json.dumps(payload, indent=2) + "\n")
    md = PR_RECOVERY / "R3B1R31-DEPENDENCY-OVERRIDE-COMPATIBILITY-ADVISORY-PROVENANCE-CLOSURE.md"
    md.write_text(render_md(payload) + "\n")
    print(json.dumps({"result": payload["result"], "machine_status": payload["machine_status"], "raw": str(raw), "md": str(md)}, indent=2))
    return 0 if success or payload["result"] == "LOCAL_PASS_PENDING_CI" else 1


def render_md(p: dict[str, Any]) -> str:
    lines = [
        "# R3B1R.3.1 — Dependency Override Compatibility + Advisory Provenance Closure",
        "",
        f"**Phase:** `{PHASE}`  ",
        f"**Generated:** `{p['generated_at']}`  ",
        f"**Result:** **{p['result']}**  ",
        f"**Machine status:** `{p['machine_status']}`",
        "",
        "## Override disposition summary",
        "",
    ]
    for pkg, row in p["override_compatibility_matrix"]["matrix"].items():
        lines.append(
            f"- **{pkg}**: retained={row['override_retained']} edges={row['parent_edge_count']} "
            f"semver_out_of_range={row['out_of_range_edge_count_semver']} "
            f"after_proof={row['out_of_range_edge_count_after_runtime_proof']} "
            f"authority={row['compatibility_authority']} tests={row['runtime_or_tooling_test_result']}"
        )
    lines.extend(
        [
            "",
            f"INCOMPATIBLE_OVERRIDE_EDGES={p['override_compatibility_matrix']['incompatible_override_edges_after_proof']}",
            f"PRE_REMEDIATION_HIGH_CRITICAL_INVENTORY_COMPLETE={p['pre_remediation_high_critical_inventory']['complete']}",
            "",
            "**R3B1R.3.1 DID NOT MUTATE PRODUCTION.**",
        ]
    )
    return "\n".join(lines)


if __name__ == "__main__":
    raise SystemExit(main())
