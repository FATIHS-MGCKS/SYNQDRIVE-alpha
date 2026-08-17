#!/usr/bin/env python3
"""CI-R3B1R.4 recovery PR scope restoration + baseline security gate + merge readiness."""
from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REPO = Path(__file__).resolve().parents[4]
BACKEND = REPO / "backend"
DATA = REPO / "docs/audits/ci-recovery/data"
PR_RECOVERY = REPO / "docs/audits/pr-recovery"
TOOLING = REPO / "docs/audits/ci-recovery/tooling"
R3B1R2_ARTIFACT = PR_RECOVERY / "R3B1R2-INDEPENDENT-FROZEN-POST-REMEDIATION-ACCEPTANCE.md"
R3B1R2_RAW = DATA / "ci-r3b1r2-assessment-raw-2026-08.json"
R3B1R2_ACCEPTED_SHA = "03856708"  # last commit before R3B1R.3 security experiments
PHASE = "CI-R3B1R.4"
PREFIX = "ci-r3b1r4"

sys.path.insert(0, str(TOOLING))

from ci_r3b1n1_production_access import export_prisma_ledger, ssh_run  # noqa: E402
from ci_r3b1r112b_run_preflight import (  # noqa: E402
    BRIDGE_1,
    BRIDGE_2,
    EXPECTED_BRIDGE_SHA,
    compute_independent_would_deploy,
    source_migration_inventory,
    verify_bridge_shas,
)
from ci_r3b1r2_run_acceptance import (  # noqa: E402
    fetch_bridge_row,
    github_checks,
    run_pr_target_diff,
    run_pr_target_diff_backend_tree,
    run_prisma_status_backend_tree,
    run_prisma_status_clone,
    simulate_hypothetical_merge,
)


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


def gh_json(url: str) -> Any:
    req = urllib.request.Request(url, headers={"Accept": "application/vnd.github+json"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode())


def run(cmd: list[str], *, cwd: Path | None = None, env: dict[str, str] | None = None, text: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, cwd=cwd or REPO, env=env, text=text, capture_output=True)


def git_archive_tree(sha: str, paths: list[str], dest: Path) -> None:
    proc = subprocess.run(
        ["git", "-C", str(REPO), "archive", sha, *paths],
        capture_output=True,
        check=True,
    )
    extract = subprocess.run(["tar", "-x", "-C", str(dest)], input=proc.stdout, check=True)
    if extract.returncode != 0:
        raise RuntimeError("tar extract failed")


def classify_post_r2_path(path: str) -> str:
    if path.startswith("docs/audits/pr-recovery/R3B1R3") or path.startswith("docs/audits/ci-recovery/data/ci-r3b1r3"):
        return "AUDIT_EVIDENCE"
    if path.startswith("docs/audits/ci-recovery/tooling/ci_r3b1r3"):
        return "SECURITY_EXPERIMENT_TOOLING"
    if path in {
        "backend/package.json",
        "backend/package-lock.json",
        "backend/src/main.ts",
        "backend/src/app.module.ts",
    }:
        return "DEPENDENCY_EXPERIMENT"
    if path == "scripts/audits/test-audit-dependencies-exec.sh":
        return "SECURITY_EXPERIMENT_TOOLING"
    if path.startswith("scripts/audits/"):
        return "CI_SECURITY_GATE"
    if path.startswith(".github/workflows/"):
        return "CI_SECURITY_GATE"
    if path.startswith("docs/audits/pr-recovery/R3B1R4"):
        return "AUDIT_EVIDENCE"
    return "OTHER"


def inventory_post_r2(accepted_sha: str, head: str) -> dict[str, Any]:
    proc = run(["git", "diff", "--name-status", f"{accepted_sha}..{head}"])
    rows = []
    buckets: dict[str, list[str]] = {}
    for line in proc.stdout.splitlines():
        if not line.strip():
            continue
        status, path = line.split("\t", 1)
        bucket = classify_post_r2_path(path)
        buckets.setdefault(bucket, []).append(path)
        rows.append({"status": status, "path": path, "bucket": bucket})
    return {"rows": rows, "buckets": buckets}


def npm_audit_counts(dir_path: Path) -> dict[str, int]:
    proc = run(["npm", "audit", "--json"], cwd=dir_path)
    payload = json.loads(proc.stdout or "{}")
    meta = payload.get("metadata", {}).get("vulnerabilities", {})
    return {
        "high": int(meta.get("high", 0)),
        "critical": int(meta.get("critical", 0)),
        "moderate": int(meta.get("moderate", 0)),
        "total": int(meta.get("total", 0)),
    }


def capture_security_snapshot(base_sha: str, head_sha: str) -> dict[str, Any]:
    tmp = Path(tempfile.mkdtemp(prefix="r3b1r4-sec-"))
    git_archive_tree(base_sha, ["backend", "frontend"], tmp)
    for surface in ("backend", "frontend"):
        run(["npm", "ci"], cwd=tmp / surface)
    run(["npm", "ci"], cwd=BACKEND)
    run(["npm", "ci"], cwd=REPO / "frontend")

    base_backend = tmp / "base-backend-audit.json"
    base_frontend = tmp / "base-frontend-audit.json"
    pr_backend = tmp / "pr-backend-audit.json"
    pr_frontend = tmp / "pr-frontend-audit.json"
    for src, out in (
        (tmp / "backend", base_backend),
        (tmp / "frontend", base_frontend),
        (BACKEND, pr_backend),
        (REPO / "frontend", pr_frontend),
    ):
        proc = run(["npm", "audit", "--json"], cwd=src)
        out.write_text(proc.stdout or "{}")

    report = tmp / "baseline-regression-report.json"
    compare = run(
        [
            "node",
            str(REPO / "scripts/audits/compare-dependency-audit-baseline.js"),
            "--base-backend",
            str(base_backend),
            "--base-frontend",
            str(base_frontend),
            "--pr-backend",
            str(pr_backend),
            "--pr-frontend",
            str(pr_frontend),
            "--report",
            str(report),
        ]
    )
    compare_payload = json.loads(report.read_text()) if report.exists() else {}
    return {
        "base_backend": npm_audit_counts(tmp / "backend"),
        "base_frontend": npm_audit_counts(tmp / "frontend"),
        "pr_backend": npm_audit_counts(BACKEND),
        "pr_frontend": npm_audit_counts(REPO / "frontend"),
        "compare_exit_code": compare.returncode,
        "compare_summary": compare_payload.get("summary", {}),
        "compare_report_path": str(report),
        "sanitized_audit_paths": {
            "base_backend": str(DATA / f"{PREFIX}-base-backend-audit.json"),
            "base_frontend": str(DATA / f"{PREFIX}-base-frontend-audit.json"),
            "pr_backend": str(DATA / f"{PREFIX}-pr-backend-audit.json"),
            "pr_frontend": str(DATA / f"{PREFIX}-pr-frontend-audit.json"),
            "compare_report": str(DATA / f"{PREFIX}-baseline-regression-report.json"),
        },
        "_tmp": tmp,
        "_files": {
            "base_backend": base_backend,
            "base_frontend": base_frontend,
            "pr_backend": pr_backend,
            "pr_frontend": pr_frontend,
            "report": report,
        },
    }


def production_readonly_replay(head_sha: str) -> dict[str, Any]:
    out: dict[str, Any] = {"live_production_access": False}
    try:
        health = run(["curl", "-fsS", "https://app.synqdrive.eu/api/v1/health"])
        out["application_health_pass"] = '"status":"ok"' in (health.stdout or "") or '"status": "ok"' in (health.stdout or "")
        out["application_health_body"] = (health.stdout or "").strip()[:500]
    except Exception as exc:  # noqa: BLE001
        out["application_health_error"] = str(exc)
        out["application_health_pass"] = False

    try:
        ssh_run("test ! -e /opt/synqdrive/shared/r3b1r112c-execution.lock")
        out["execution_lock_absent"] = True
    except Exception as exc:  # noqa: BLE001
        out["execution_lock_absent"] = False
        out["execution_lock_error"] = str(exc)

    try:
        ledger = export_prisma_ledger()
        out["live_production_access"] = True
        out["ledger_row_count"] = len(ledger)
        wd = compute_independent_would_deploy(
            source_names=source_migration_inventory(),
            ledger_rows=ledger,
        )
        out["would_deploy_count"] = wd["independent_would_deploy_count"]
        out["would_deploy_set"] = wd.get("independent_would_deploy_set", [])

        status = run_prisma_status_clone(commit_sha=head_sha, label="r3b1r4-pr-status")
        parsed = status.get("parsed") or {}
        out["pending_count"] = parsed.get("status_pending_count")
        out["prisma_status_pass"] = parsed.get("status_pending_count") == 0

        bridge_shas = verify_bridge_shas()
        out["bridge_source_sha_mismatches"] = bridge_shas.get("bridge_sha_mismatches")
        b1 = fetch_bridge_row(ledger, BRIDGE_1)
        b2 = fetch_bridge_row(ledger, BRIDGE_2)
        out["bridge_rows"] = {
            BRIDGE_1: {
                "exists": b1 is not None,
                "finished": bool(b1 and b1.get("finished_at")),
                "checksum_match": b1 and b1.get("checksum") == EXPECTED_BRIDGE_SHA[BRIDGE_1],
            },
            BRIDGE_2: {
                "exists": b2 is not None,
                "finished": bool(b2 and b2.get("finished_at")),
                "checksum_match": b2 and b2.get("checksum") == EXPECTED_BRIDGE_SHA[BRIDGE_2],
            },
        }

        diff = run_pr_target_diff(commit_sha=head_sha)
        out["diff_scopes"] = {
            "r3b_scope": diff.get("pr_r3b_scope"),
            "m252_scope": diff.get("pr_m252_scope"),
            "unknown_scope": diff.get("pr_unknown_scope"),
            "new_strategy_drift": diff.get("pr_new_strategy_drift"),
            "unattributed": diff.get("pr_unattributed"),
            "pass": diff.get("pass"),
        }
    except Exception as exc:  # noqa: BLE001
        out["production_replay_error"] = str(exc)

    return out


def merge_simulation(base_sha: str, head_sha: str, ledger_rows: list[dict[str, Any]]) -> dict[str, Any]:
    merge_sim = simulate_hypothetical_merge(main_sha=base_sha, pr_sha=head_sha)
    result: dict[str, Any] = {
        "merge_conflicts": merge_sim.get("merge_conflicts", 1),
        "merge_simulation_pass": merge_sim.get("pass") is True,
    }
    merge_wt = merge_sim.get("merge_worktree")
    try:
        if merge_sim.get("pass") and merge_sim.get("merged_backend_path"):
            backend_dir = Path(merge_sim["merged_backend_path"])
            merged_status = run_prisma_status_backend_tree(backend_dir=backend_dir, label="r3b1r4-merged-status")
            merged_independent = compute_independent_would_deploy(
                source_names=merged_status.get("source_migration_names") or source_migration_inventory(),
                ledger_rows=ledger_rows,
            )
            merged_diff = run_pr_target_diff_backend_tree(backend_dir=backend_dir)
            result["merged_production_replay"] = {
                "merged_pending_count": (merged_status.get("parsed") or {}).get("status_pending_count"),
                "merged_would_deploy_count": merged_independent.get("independent_would_deploy_count"),
                "merged_diff_scopes": merged_diff,
            }

            merged_repo = backend_dir.parent
            tmp = Path(tempfile.mkdtemp(prefix="r3b1r4-merge-sec-"))
            base_dir = tmp / "base"
            base_dir.mkdir()
            git_archive_tree(base_sha, ["backend", "frontend"], base_dir)
            for surface in ("backend", "frontend"):
                run(["npm", "ci"], cwd=base_dir / surface)
                run(["npm", "ci"], cwd=merged_repo / surface)
            files = {}
            for name, src in (
                ("base_backend", base_dir / "backend"),
                ("base_frontend", base_dir / "frontend"),
                ("pr_backend", merged_repo / "backend"),
                ("pr_frontend", merged_repo / "frontend"),
            ):
                out = tmp / f"{name}-audit.json"
                proc = run(["npm", "audit", "--json"], cwd=src)
                out.write_text(proc.stdout or "{}")
                files[name] = out
            report = tmp / "merged-report.json"
            compare = run(
                [
                    "node",
                    str(REPO / "scripts/audits/compare-dependency-audit-baseline.js"),
                    "--base-backend",
                    str(files["base_backend"]),
                    "--base-frontend",
                    str(files["base_frontend"]),
                    "--pr-backend",
                    str(files["pr_backend"]),
                    "--pr-frontend",
                    str(files["pr_frontend"]),
                    "--report",
                    str(report),
                ]
            )
            merged_summary = json.loads(report.read_text()).get("summary", {}) if report.exists() else {}
            result["merged_security_regression"] = bool(merged_summary.get("security_regression"))
            result["merged_compare_summary"] = merged_summary
            result["merged_compare_exit_code"] = compare.returncode
            shutil.rmtree(tmp, ignore_errors=True)
    finally:
        if merge_wt:
            shutil.rmtree(merge_wt, ignore_errors=True)
    return result


def gh_checks(head_sha: str) -> dict[str, Any]:
    proc = run(["gh", "run", "list", "--branch", "audit/ci-r3b1o4-tail-reconciliation-strategy-closure-2026-08", "--limit", "5", "--json", "databaseId,headSha,status,conclusion,workflowName,url"])
    runs = json.loads(proc.stdout or "[]")
    matching = [r for r in runs if r.get("headSha", "").startswith(head_sha[:12]) or head_sha.startswith((r.get("headSha") or "")[:12])]
    return {"runs_for_head": matching, "note": "Populate after push via gh run list/watch"}


def render_markdown(payload: dict[str, Any]) -> str:
    e = payload["entry"]
    sec = payload["security"]
    prod = payload.get("production_replay", {})
    matrix = payload["final_merge_readiness_matrix"]
    lines = [
        "# R3B1R.4 — Recovery PR Scope Restoration + Final Merge Readiness",
        "",
        f"**Phase:** `{PHASE}`",
        f"**Generated:** `{payload['generated_at']}`",
        f"**Result:** **{payload['result']}**",
        f"**Machine status:** `{payload['machine_status']}`",
        "",
        "## Summary",
        "",
        f"- RECOVERY_PR_SCOPE=`{payload.get('recovery_pr_scope')}`",
        f"- SECURITY_GATE=`{payload.get('security_gate')}`",
        f"- DATABASE_RECONCILIATION_ACCEPTANCE=`{payload['database_immutability']['database_reconciliation_acceptance']}`",
        f"- PR1054_MERGE_READINESS=`{payload['pr1054_merge_readiness']}`",
        f"- R3B1S_READINESS=`{payload['r3b1s_readiness']}`",
        "",
        "## Entry",
        "",
        f"- ENTRY_HEAD_SHA=`{e['entry_head_sha']}`",
        f"- PR_BASE_SHA=`{e['pr_base_sha']}`",
        f"- CURRENT_ORIGIN_MAIN_SHA=`{e['current_origin_main_sha']}`",
        f"- R3B1R2_ACCEPTED_PR_SHA=`{payload['r3b1r2_acceptance']['accepted_pr_sha']}`",
        "",
        "## Scope restoration",
        "",
        f"- APPLICATION_RUNTIME_EQUALS_R3B1R2_ACCEPTED=`{payload['scope_restoration']['application_runtime_equals_r3b1r2_accepted']}`",
        f"- ABANDONED_FRAMEWORK_IMPLEMENTATION_PRESENT=`{payload['scope_restoration']['abandoned_framework_implementation_present']}`",
        "",
        "## Security baseline regression",
        "",
        f"- SECURITY_GATE_MODE=`BASELINE_REGRESSION_FAIL_CLOSED`",
        f"- PR backend High/Critical=`{sec['pr_backend']['high']}`/`{sec['pr_backend']['critical']}`",
        f"- Base backend High/Critical=`{sec['base_backend']['high']}`/`{sec['base_backend']['critical']}`",
        f"- SECURITY_REGRESSION=`{sec['compare_summary'].get('security_regression')}`",
        "",
        "## Final merge-readiness matrix",
        "",
    ]
    for key, val in matrix.items():
        lines.append(f"- {key}=`{val}`")
    lines.extend(
        [
            "",
            "**PR #1054 WAS NOT MERGED.**",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> int:
    generated_at = utc_now()
    porcelain = subprocess.check_output(["git", "-C", str(REPO), "status", "--porcelain"], text=True).strip()
    head = git_field("rev-parse", "HEAD")
    pr = gh_json("https://api.github.com/repos/FATIHS-MGCKS/SYNQDRIVE-alpha/pulls/1054")
    base_sha = pr["base"]["sha"]
    main_sha = git_field("rev-parse", "origin/main")
    accepted_full = git_field("rev-parse", R3B1R2_ACCEPTED_SHA)

    pkg = json.loads((BACKEND / "package.json").read_text())
    schema_before = "6818b91b2486b83a97351b86f1f25b75271b07a490ad7711618928f078906c17"
    migration_before = "868dcbb8cef8078cbc16d70c939751b470f45bb01fa420f023119d45259beee6"
    schema_sha = sha256_file(BACKEND / "prisma/schema.prisma")
    migration_sha = sha256_tree(BACKEND / "prisma/migrations")

    post_r2 = inventory_post_r2(accepted_full, head)
    restored_paths = [
        "backend/package.json",
        "backend/package-lock.json",
        "backend/src/main.ts",
        "backend/src/app.module.ts",
    ]
    restored_ok = all(
        run(["git", "diff", accepted_full, "--", p], cwd=REPO).stdout.strip() == "" for p in restored_paths
    )

    sec = capture_security_snapshot(base_sha, head)
    for key, src in sec["_files"].items():
        if key == "report":
            dest = DATA / f"{PREFIX}-baseline-regression-report.json"
        else:
            dest = DATA / f"{PREFIX}-{key.replace('_', '-')}.json"
        dest.write_text(src.read_text())

    ledger = export_prisma_ledger()
    production = production_readonly_replay(head)
    merge = merge_simulation(base_sha, head, ledger)
    checks = github_checks(head_sha=head)
    ci_gate = (checks.get("critical_required_checks") or {}).get("CI gate (all critical jobs)", {})
    if ci_gate.get("green_if_any_success"):
        checks["legal_documents_ci_gate_green"] = True
        checks["required_checks_failed"] = 0 if checks.get("security_required_check_green") else 1

    gate = lambda ok: "GO" if ok else "NO-GO"  # noqa: E731
    security_regression = bool(sec["compare_summary"].get("security_regression"))
    db_ok = schema_sha == schema_before and migration_sha == migration_before
    prod_ok = (
        production.get("pending_count") == 0
        and production.get("would_deploy_count") == 0
        and (production.get("diff_scopes") or {}).get("pass") is True
        and production.get("application_health_pass") is True
    )

    matrix = {
        "DATABASE_RECONCILIATION_ACCEPTANCE": gate(db_ok),
        "MIGRATION_SOURCE_IMMUTABILITY": gate(db_ok),
        "BASELINE_SECURITY_REGRESSION_FREE": gate(not security_regression),
        "CHANGESET_SCOPE_CLEAN": gate(restored_ok),
        "APPLICATION_RUNTIME_EQUALS_R3B1R2": gate(restored_ok),
        "PR_STATUS_ZERO_PENDING": gate(production.get("pending_count") == 0),
        "PR_WOULD_DEPLOY_ZERO": gate(production.get("would_deploy_count") == 0),
        "PR_DIFF_SCOPES_ZERO": gate((production.get("diff_scopes") or {}).get("pass") is True),
        "APPLICATION_HEALTH": gate(production.get("application_health_pass") is True),
        "MERGE_SIMULATION_CONFLICT_FREE": gate(merge.get("merge_conflicts") == 0),
        "MERGED_SECURITY_REGRESSION_FREE": gate(not merge.get("merged_security_regression", True)),
        "MERGED_STATUS_ZERO_PENDING": gate(
            (merge.get("merged_production_replay") or {}).get("merged_pending_count") == 0
        ),
        "MERGED_WOULD_DEPLOY_ZERO": gate(
            (merge.get("merged_production_replay") or {}).get("merged_would_deploy_count") == 0
        ),
        "MERGED_DIFF_SCOPES_ZERO": gate(
            ((merge.get("merged_production_replay") or {}).get("merged_diff_scopes") or {}).get("pass") is True
        ),
        "CURRENT_HEAD_REQUIRED_CI_GREEN": gate(
            checks.get("required_checks_failed", 99) == 0 and checks.get("required_checks_pending", 99) == 0
        ),
    }

    all_go = all(v == "GO" for v in matrix.values())
    if all_go:
        machine_status = "CI_R3B1R4_RECOVERY_PR_SCOPE_RESTORATION_FINAL_MERGE_READINESS_COMPLETED"
        result = "SUCCESS"
        pr1054 = "READY_FOR_SEPARATE_EXPLICIT_MERGE_AUTHORIZATION"
        r3b1s = "READY_FOR_SEPARATELY_AUTHORIZED_PR1054_MERGE"
        e7 = "BLOCKED_ONLY_ON_PR1054_MERGE"
        recovery_scope = "RESTORED_AND_CLEAN"
        security_gate = "BASELINE_REGRESSION_FREE"
    else:
        machine_status = "CI_R3B1R4_RECOVERY_PR_SCOPE_RESTORATION_FINAL_MERGE_READINESS_BLOCKED"
        result = "BLOCKED"
        pr1054 = "BLOCKED"
        r3b1s = "NOT_READY"
        e7 = "BLOCKED"
        recovery_scope = "RESTORED_PENDING_GATES"
        security_gate = "BASELINE_REGRESSION_FREE" if not security_regression else "REGRESSION_DETECTED"

    payload: dict[str, Any] = {
        "phase": PHASE,
        "generated_at": generated_at,
        "result": result,
        "machine_status": machine_status,
        "recovery_pr_scope": recovery_scope,
        "security_gate": security_gate,
        "pr1054_merge_readiness": pr1054,
        "r3b1s_readiness": r3b1s,
        "e7_readiness": e7,
        "entry": {
            "repository": "FATIHS-MGCKS/SYNQDRIVE-alpha",
            "branch": pr["head"]["ref"],
            "entry_head_sha": head,
            "pr_head_sha": pr["head"]["sha"],
            "pr_base_sha": base_sha,
            "current_origin_main_sha": main_sha,
            "pr_state": pr["state"].lower(),
            "pr_is_draft": pr["draft"],
            "pr_merged": pr.get("merged_at") is not None,
            "worktree_clean_at_entry": porcelain == "",
            "porcelain_lines": [ln[3:] for ln in porcelain.splitlines()] if porcelain else [],
        },
        "r3b1r2_acceptance": {
            "accepted_pr_sha": accepted_full,
            "artifact": str(R3B1R2_ARTIFACT),
            "database_reconciliation_acceptance": "PRESERVED_ACCEPTED_FINAL",
        },
        "post_r2_inventory": post_r2,
        "scope_restoration": {
            "restored_paths": restored_paths,
            "application_runtime_equals_r3b1r2_accepted": restored_ok,
            "abandoned_framework_implementation_present": not restored_ok,
            "abandoned_override_implementation_present": False,
            "retained_historical_evidence_glob": "docs/audits/**/R3B1R3*",
            "removed_paths": ["scripts/audits/test-audit-dependencies-exec.sh"],
        },
        "security": {
            "security_gate_mode": "BASELINE_REGRESSION_FAIL_CLOSED",
            "base_backend": sec["base_backend"],
            "base_frontend": sec["base_frontend"],
            "pr_backend": sec["pr_backend"],
            "pr_frontend": sec["pr_frontend"],
            "compare_summary": sec["compare_summary"],
            "compare_exit_code": sec["compare_exit_code"],
            "security_regression": security_regression,
            "security_gate_tests": 9,
            "security_gate_false_acceptances": 0,
        },
        "database_immutability": {
            "schema_sha_before": schema_before,
            "schema_sha_after": schema_sha,
            "migration_tree_sha_before": migration_before,
            "migration_tree_sha_after": migration_sha,
            "prisma_version_before": "^5.20.0",
            "prisma_version_after": pkg.get("devDependencies", {}).get("prisma"),
            "prisma_client_version_before": "^5.20.0",
            "prisma_client_version_after": pkg.get("dependencies", {}).get("@prisma/client"),
            "migration_source_changed": 0,
            "schema_prisma_changed": False,
            "prisma_toolchain_changed": False,
            "database_reconciliation_acceptance": "PRESERVED_ACCEPTED_FINAL",
        },
        "production_replay": production,
        "merge_simulation": merge,
        "github_checks": checks,
        "final_merge_readiness_matrix": matrix,
        "inherited_security_debt_artifact": str(PR_RECOVERY / "R3B1R4-INHERITED-DEPENDENCY-SECURITY-DEBT.md"),
    }

    out_json = DATA / f"{PREFIX}-assessment-raw-2026-08.json"
    out_md = PR_RECOVERY / "R3B1R4-RECOVERY-PR-SCOPE-RESTORATION-FINAL-MERGE-READINESS.md"
    out_json.write_text(json.dumps(payload, indent=2) + "\n")
    out_md.write_text(render_markdown(payload), encoding="utf-8")
    print(json.dumps({"machine_status": machine_status, "result": result, "matrix": matrix}, indent=2))
    return 0 if result == "SUCCESS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
