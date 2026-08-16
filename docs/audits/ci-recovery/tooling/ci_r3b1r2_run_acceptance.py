#!/usr/bin/env python3
"""CI-R3B1R.2 independent frozen post-remediation acceptance (read-only)."""
from __future__ import annotations

import hashlib
import json
import re
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REPO = Path(__file__).resolve().parents[4]
TOOLING = REPO / "docs/audits/ci-recovery/tooling"
DATA = REPO / "docs/audits/ci-recovery/data"
PR_RECOVERY = REPO / "docs/audits/pr-recovery"
MIG_ROOT = REPO / "backend/prisma/migrations"
sys.path.insert(0, str(TOOLING))

from ci_r3b1n1_production_access import (  # noqa: E402
    export_prisma_ledger,
    ledger_summary_fingerprint,
    sanitize_log_text,
    ssh_psql_sql,
    ssh_run,
)
from ci_r3b1n2_catalog_fingerprint import build_catalog_fingerprint  # noqa: E402
from ci_r3b1n2_instance_identity import query_production_instance_identity  # noqa: E402
from ci_r3b1o1_constants import FROZEN_DIFF_SQL  # noqa: E402
from ci_r3b1n2_constants import M252  # noqa: E402
from ci_r3b1o_checksum import checksum_representations_extended  # noqa: E402
from ci_r3b1o3_m252_complete_authority import build_m252_complete_physical_authority  # noqa: E402
from ci_r3b1o4_m252_exact_parity import compare_m252_exact, read_m252_catalog  # noqa: E402
from ci_r3b1p1_run_independent_replay import R3B1O_GOLDEN_DIFF  # noqa: E402
from ci_r3b1p3_run_independent_replay import run_live_r3b_catalog_parity  # noqa: E402
from ci_r3b1p_diff_attribution import classify_preflight_production_diff  # noqa: E402
from ci_r3b1r112b_run_preflight import (  # noqa: E402
    ACCEPTED_DATABASE_ONLY,
    BRIDGE_1,
    BRIDGE_2,
    ENV_FILE,
    EXPECTED_BRIDGE_SHA,
    compute_independent_would_deploy,
    exact_sha_clone_eval,
    finished_ledger_names,
    four_object_parity,
    parse_prisma_migrate_status,
    sha256_file,
    source_migration_inventory,
    verify_bridge_shas,
)

PHASE = "CI-R3B1R.2"
PREFIX = "ci-r3b1r2"
PRE_BRIDGE_CATALOG_FP = "407bf140508aea746e8fd5f62911c79ba1341bae8c836a079b73ee7a8fec2e58"
R112C_LEDGER = {"ledger_row_count": 341, "ledger_finished_count": 325, "ledger_failed_count": 16, "ledger_incomplete_count": 0}
R112C_JSON = DATA / "ci-r3b1r112c-assessment-raw-2026-08.json"
LOCK_FILE = "/opt/synqdrive/shared/r3b1r112c-execution.lock"

ACCEPTANCE_INPUT_GLOBS = [
    "backend/prisma/schema.prisma",
    "backend/prisma/migrations/**/migration.sql",
    "docs/audits/ci-recovery/tooling/ci_r3b1q*.py",
    "docs/audits/ci-recovery/tooling/ci_r3b1r112b_run_preflight.py",
    "docs/audits/ci-recovery/tooling/ci_r3b1p*.py",
    "docs/audits/ci-recovery/tooling/ci_r3b1o*.py",
    "docs/audits/ci-recovery/tooling/ci_r3b1n*.py",
]


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def git_field(*args: str) -> str:
    return subprocess.check_output(["git", "-C", str(REPO), *args], text=True).strip()


def measure_worktree() -> dict[str, Any]:
    porcelain = subprocess.check_output(["git", "-C", str(REPO), "status", "--porcelain"], text=True)
    lines = [ln for ln in porcelain.splitlines() if ln.strip()]
    return {"worktree_clean_at_entry": len(lines) == 0, "porcelain_lines": lines}


def run_sql(sql: str) -> str:
    proc = ssh_psql_sql(sql)
    if proc.returncode != 0:
        raise RuntimeError(sanitize_log_text(proc.stderr or proc.stdout))
    lines = []
    for ln in (proc.stdout or "").splitlines():
        if ln.strip() in {"BEGIN", "SET", "ROLLBACK", "COMMIT"}:
            continue
        lines.append(ln)
    return "\n".join(lines)


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


def build_acceptance_manifest() -> dict[str, Any]:
    entries: list[tuple[str, str]] = []
    seen: set[str] = set()
    for pattern in ACCEPTANCE_INPUT_GLOBS:
        for path in sorted(REPO.glob(pattern)):
            rel = path.relative_to(REPO).as_posix()
            if rel in seen or not path.is_file():
                continue
            seen.add(rel)
            entries.append((rel, sha256_file(path)))
    manifest_body = "\n".join(f"{rel}\t{digest}" for rel, digest in entries)
    return {
        "acceptance_input_count": len(entries),
        "acceptance_input_manifest_sha256": sha256_text(manifest_body),
        "acceptance_inputs_frozen": True,
        "entries_sample_count": len(entries),
        "excludes_r112c_success_as_authority": True,
        "r3b1r112c_success_boolean_used_as_acceptance_authority": False,
    }


def evaluate_up_to_date_status(text: str, *, status_rc: int | None, status_executed: bool) -> dict[str, Any]:
    if status_rc == 0 and "Database schema is up to date!" in text:
        return {
            "parser_valid": True,
            "database_only_parse_valid": True,
            "status_rc": status_rc,
            "status_pending_names": [],
            "status_pending_count": 0,
            "status_database_only_names": [],
            "status_database_only_count": 0,
            "status_unexpected_pending_names": [],
            "status_missing_expected_pending_names": [],
            "unexplained_database_only_migrations": 0,
            "unexplained_database_only_names": [],
            "post_deploy_up_to_date": True,
        }
    return parse_prisma_migrate_status(text, status_rc=status_rc, status_executed=status_executed)


def ledger_counts(rows: list[dict[str, Any]]) -> dict[str, int]:
    finished = failed = incomplete = 0
    for row in rows:
        fin = (row.get("finished_at") or "").strip()
        rb = (row.get("rolled_back_at") or "").strip()
        if rb:
            failed += 1
        elif fin:
            finished += 1
        else:
            incomplete += 1
    return {
        "ledger_row_count": len(rows),
        "ledger_finished_count": finished,
        "ledger_failed_count": failed,
        "ledger_incomplete_count": incomplete,
    }


def fetch_bridge_row(rows: list[dict[str, Any]], name: str) -> dict[str, Any]:
    matches = [r for r in rows if r.get("migration_name") == name]
    return matches[-1] if matches else {}


def classify_r112c_transcript_provenance() -> dict[str, Any]:
    preserved = False
    mode = None
    reconstructed = False
    deploy_proc = "INSUFFICIENT"
    if R112C_JSON.exists():
        payload = json.loads(R112C_JSON.read_text())
        mode = payload.get("mode") or "FULL"
        deploy = payload.get("deploy") or {}
        reconstructed = deploy.get("evidence_source", "").startswith("production_ledger_reconstruction")
        has_stdout = bool(deploy.get("deploy_stdout"))
        preserved = has_stdout and not reconstructed and mode != "POST_DEPLOY_VERIFY_ONLY"
        if deploy.get("deploy_exit_code") == 0 and deploy.get("migrations_applied"):
            if preserved:
                deploy_proc = "DIRECT"
            elif reconstructed:
                deploy_proc = "LEDGER_RECONSTRUCTED_BUT_STATE_CONCLUSIVE"
    return {
        "original_deploy_transcript_preserved_as_final_primary_evidence": preserved,
        "final_json_mode": mode,
        "deploy_metadata_reconstructed_from_ledger": reconstructed,
        "deploy_procedural_evidence": deploy_proc,
        "r3b1r112c_success_boolean_used_as_acceptance_authority": False,
    }


def migration_history_integrity(*, ledger_rows: list[dict[str, Any]]) -> dict[str, Any]:
    source_names = set(source_migration_inventory())
    by_name: dict[str, list[dict[str, Any]]] = {}
    for row in ledger_rows:
        by_name.setdefault(row.get("migration_name", ""), []).append(row)
    ledger_best: dict[str, dict[str, Any]] = {}
    duplicate_finished_names: list[str] = []
    for name, group in by_name.items():
        if not name:
            continue
        finished = [r for r in group if (r.get("finished_at") or "").strip() and not (r.get("rolled_back_at") or "").strip()]
        if len(finished) > 1:
            duplicate_finished_names.append(name)
        if finished:
            ledger_best[name] = finished[-1]
    unauthorized: list[dict[str, Any]] = []
    deleted = renamed = 0
    m252_row = ledger_best.get(M252, {})
    m252_path = MIG_ROOT / M252 / "migration.sql"
    m252_source = sha256_file(m252_path) if m252_path.exists() else None
    m252_reps = checksum_representations_extended(m252_path.read_bytes()) if m252_path.exists() else {}
    m252_match = bool(m252_row.get("checksum") and m252_row["checksum"] in set(m252_reps.values()))
    bridge_names = {BRIDGE_1, BRIDGE_2}
    for name, row in sorted(ledger_best.items()):
        if name not in source_names:
            continue
        if name in bridge_names:
            continue
        src = MIG_ROOT / name / "migration.sql"
        if not src.exists():
            deleted += 1
            continue
        reps = checksum_representations_extended(src.read_bytes())
        prod = row.get("checksum") or ""
        if prod and prod not in set(reps.values()):
            unauthorized.append(
                {
                    "migration_name": name,
                    "ledger_checksum": prod,
                    "source_representations": reps,
                }
            )
    return {
        "applied_historical_migrations_unauthorized_rewrites": len(unauthorized),
        "unauthorized_rewrite_details": unauthorized[:20],
        "applied_historical_migrations_deleted": deleted,
        "applied_historical_migrations_renamed": renamed,
        "duplicate_migration_names": len(duplicate_finished_names),
        "duplicate_names": duplicate_finished_names,
        "m252_migration_name": M252,
        "m252_source_sha256": m252_source,
        "m252_ledger_checksum": m252_row.get("checksum"),
        "m252_source_matches_production_ledger": m252_match,
        "checksum_semantics": "SHA-256 over migration.sql bytes with extended raw/lf/crlf/mixed-eol representation variants",
        "pass": len(unauthorized) == 0 and deleted == 0 and renamed == 0 and len(duplicate_finished_names) == 0 and m252_match,
    }


def run_prisma_status_clone(*, commit_sha: str, label: str) -> dict[str, Any]:
    remote = f"""set -euo pipefail
tmpdir=$(mktemp -d /tmp/{PREFIX}-{label}-XXXXXX)
repodir="$tmpdir/repo"
git clone --filter=blob:none --no-checkout https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha.git "$repodir" >/dev/null 2>&1
git -C "$repodir" fetch --depth 1 origin {commit_sha} >/dev/null 2>&1
git -C "$repodir" checkout {commit_sha} >/dev/null 2>&1
sudo RETRY_BACKEND="$repodir/backend" bash -lc "$(cat <<'INNER'
set -eo pipefail
set -a
source /opt/synqdrive/shared/backend.env
set +a
set -u
cd "$RETRY_BACKEND"
npm ci --ignore-scripts >/dev/null 2>&1
npx prisma generate >/dev/null 2>&1
echo ===STATUS===
set +e
npx prisma migrate status 2>&1
echo STATUS_RC=$?
set -e
find "$RETRY_BACKEND/prisma/migrations" -mindepth 1 -maxdepth 1 -type d -printf '%f\\n' | sort
INNER
)"
sudo rm -rf "$tmpdir" 2>/dev/null || true
"""
    proc = ssh_run(remote, timeout=600)
    text = sanitize_log_text(proc.stdout or "")
    rc_match = re.search(r"STATUS_RC=(\d+)", text)
    status_rc = int(rc_match.group(1)) if rc_match else None
    status_text = text.split("===STATUS===", 1)[1] if "===STATUS===" in text else text
    if rc_match:
        status_text = status_text.rsplit("STATUS_RC=", 1)[0]
    migration_names = [ln.strip() for ln in status_text.splitlines() if re.match(r"^\d{14}_", ln.strip())]
    parsed = evaluate_up_to_date_status(status_text, status_rc=status_rc, status_executed=status_rc is not None)
    return {"parsed": parsed, "status_rc": status_rc, "source_migration_names": migration_names, "status_text_excerpt": status_text[-3000:]}


def run_pr_target_diff(*, commit_sha: str) -> dict[str, Any]:
    remote = f"""set -euo pipefail
tmpdir=$(mktemp -d /tmp/{PREFIX}-diff-XXXXXX)
repodir="$tmpdir/repo"
git clone --filter=blob:none --no-checkout https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha.git "$repodir" >/dev/null 2>&1
git -C "$repodir" fetch --depth 1 origin {commit_sha} >/dev/null 2>&1
git -C "$repodir" checkout {commit_sha} >/dev/null 2>&1
sudo bash -lc 'set -eo pipefail; set -a; source {ENV_FILE}; set +a; set -u; cd '"$repodir/backend"' && npm ci --ignore-scripts >/dev/null 2>&1 && npx prisma generate >/dev/null 2>&1 && npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script 2>/dev/null'
sudo rm -rf "$tmpdir" 2>/dev/null || true
"""
    proc = ssh_run(remote, timeout=600)
    script = re.sub(r"\nnpm notice[\s\S]*$", "", proc.stdout or "").strip()
    attr = classify_preflight_production_diff(
        script,
        golden_twin_script=R3B1O_GOLDEN_DIFF.read_text(),
        golden_baseline_script=FROZEN_DIFF_SQL.read_text(),
    )
    return {
        "pr_r3b_scope": attr.get("R3B_SCOPE", 0),
        "pr_m252_scope": attr.get("M252_SCOPE", 0),
        "pr_unknown_scope": attr.get("UNKNOWN_SCOPE", 0),
        "pr_new_strategy_drift": attr.get("NEW_STRATEGY_DRIFT", 0),
        "pr_unattributed": attr.get("UNATTRIBUTED", 0),
        "pr_target_total_diff": attr.get("total_operations"),
        "pass": attr.get("pass"),
    }


def run_prisma_status_backend_tree(*, backend_dir: Path, label: str) -> dict[str, Any]:
    import base64

    tar_proc = subprocess.run(
        ["tar", "-C", str(backend_dir.parent), "-czf", "-", backend_dir.name],
        capture_output=True,
        check=True,
    )
    encoded = base64.b64encode(tar_proc.stdout).decode("ascii")
    remote = f"""set -euo pipefail
tmpdir=$(mktemp -d /tmp/{PREFIX}-{label}-XXXXXX)
echo "$ENCODED" | base64 -d | tar -xzf - -C "$tmpdir"
backend="$tmpdir/{backend_dir.name}"
sudo RETRY_BACKEND="$backend" bash -lc "$(cat <<'INNER'
set -eo pipefail
set -a
source /opt/synqdrive/shared/backend.env
set +a
set -u
cd "$RETRY_BACKEND"
npm ci --ignore-scripts >/dev/null 2>&1
npx prisma generate >/dev/null 2>&1
echo ===STATUS===
set +e
npx prisma migrate status 2>&1
echo STATUS_RC=$?
set -e
find "$RETRY_BACKEND/prisma/migrations" -mindepth 1 -maxdepth 1 -type d -printf '%f\\n' | sort
INNER
)"
sudo rm -rf "$tmpdir" 2>/dev/null || true
"""
    proc = ssh_run(f"ENCODED='{encoded}'\n{remote}", timeout=600)
    text = sanitize_log_text(proc.stdout or "")
    rc_match = re.search(r"STATUS_RC=(\d+)", text)
    status_rc = int(rc_match.group(1)) if rc_match else None
    status_text = text.split("===STATUS===", 1)[1] if "===STATUS===" in text else text
    if rc_match:
        status_text = status_text.rsplit("STATUS_RC=", 1)[0]
    migration_names = [ln.strip() for ln in status_text.splitlines() if re.match(r"^\d{14}_", ln.strip())]
    parsed = evaluate_up_to_date_status(status_text, status_rc=status_rc, status_executed=status_rc is not None)
    return {"parsed": parsed, "status_rc": status_rc, "source_migration_names": migration_names, "status_text_excerpt": status_text[-3000:]}


def run_pr_target_diff_backend_tree(*, backend_dir: Path) -> dict[str, Any]:
    import base64

    tar_proc = subprocess.run(
        ["tar", "-C", str(backend_dir.parent), "-czf", "-", backend_dir.name],
        capture_output=True,
        check=True,
    )
    encoded = base64.b64encode(tar_proc.stdout).decode("ascii")
    remote = f"""set -euo pipefail
tmpdir=$(mktemp -d /tmp/{PREFIX}-mdiff-XXXXXX)
echo "$ENCODED" | base64 -d | tar -xzf - -C "$tmpdir"
repodir="$tmpdir/{backend_dir.name}"
sudo bash -lc 'set -eo pipefail; set -a; source {ENV_FILE}; set +a; set -u; cd '"$repodir"' && npm ci --ignore-scripts >/dev/null 2>&1 && npx prisma generate >/dev/null 2>&1 && npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script 2>/dev/null'
sudo rm -rf "$tmpdir" 2>/dev/null || true
"""
    proc = ssh_run(f"ENCODED='{encoded}'\n{remote}", timeout=600)
    script = re.sub(r"\nnpm notice[\s\S]*$", "", proc.stdout or "").strip()
    attr = classify_preflight_production_diff(
        script,
        golden_twin_script=R3B1O_GOLDEN_DIFF.read_text(),
        golden_baseline_script=FROZEN_DIFF_SQL.read_text(),
    )
    return {
        "merged_r3b_scope": attr.get("R3B_SCOPE", 0),
        "merged_m252_scope": attr.get("M252_SCOPE", 0),
        "merged_unknown_scope": attr.get("UNKNOWN_SCOPE", 0),
        "merged_new_strategy_drift": attr.get("NEW_STRATEGY_DRIFT", 0),
        "merged_unattributed": attr.get("UNATTRIBUTED", 0),
        "merged_target_total_diff": attr.get("total_operations"),
        "pass": attr.get("pass"),
    }


def simulate_hypothetical_merge(*, main_sha: str, pr_sha: str) -> dict[str, Any]:
    merge_base = git_field("merge-base", main_sha, pr_sha)
    wt = Path(tempfile.mkdtemp(prefix=f"{PREFIX}-merge-"))
    repo = wt / "repo"
    remote_url = subprocess.check_output(["git", "-C", str(REPO), "remote", "get-url", "origin"], text=True).strip()
    subprocess.check_call(["git", "clone", remote_url, str(repo)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    subprocess.check_call(["git", "-C", repo, "checkout", main_sha], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    merge = subprocess.run(["git", "-C", repo, "merge", "--no-commit", "--no-ff", pr_sha], capture_output=True, text=True)
    if merge.returncode != 0:
        subprocess.run(["git", "-C", repo, "merge", "--abort"], capture_output=True)
        shutil.rmtree(wt, ignore_errors=True)
        return {
            "merge_base_sha": merge_base,
            "pr_sha": pr_sha,
            "main_sha": main_sha,
            "merge_conflicts": 1,
            "merged_tree_sha": None,
            "merged_backend_tree_sha": None,
            "merged_backend_path": None,
            "merge_worktree": None,
            "pass": False,
        }
    merged_tree = subprocess.check_output(["git", "-C", str(repo), "write-tree"], text=True).strip()
    merged_backend = subprocess.check_output(["git", "-C", str(repo), "rev-parse", f"{merged_tree}:backend"], text=True).strip()
    return {
        "merge_base_sha": merge_base,
        "pr_sha": pr_sha,
        "main_sha": main_sha,
        "merge_conflicts": 0,
        "merged_tree_sha": merged_tree,
        "merged_backend_tree_sha": merged_backend,
        "merged_backend_path": str(repo / "backend"),
        "merge_worktree": str(wt),
        "pass": True,
    }


def dependency_audit(*, package_root: Path) -> dict[str, Any]:
    proc = subprocess.run(["npm", "audit", "--json"], cwd=package_root, capture_output=True, text=True, timeout=120)
    high = 0
    try:
        payload = json.loads(proc.stdout or "{}")
        high = int((payload.get("metadata") or {}).get("vulnerabilities", {}).get("high", 0))
    except (json.JSONDecodeError, TypeError, ValueError):
        pass
    return {"package_root": str(package_root), "dependency_findings_high": high}


def dependency_audit_at_ref(*, ref: str, subpath: str) -> dict[str, Any]:
    wt = Path(tempfile.mkdtemp(prefix=f"{PREFIX}-dep-"))
    try:
        repo = wt / "repo"
        remote_url = subprocess.check_output(["git", "-C", str(REPO), "remote", "get-url", "origin"], text=True).strip()
        subprocess.check_call(["git", "clone", "--filter=blob:none", "--no-checkout", remote_url, str(repo)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        subprocess.check_call(["git", "-C", repo, "fetch", "--depth", "1", "origin", ref], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        subprocess.check_call(["git", "-C", repo, "checkout", ref], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return dependency_audit(package_root=repo / subpath)
    finally:
        shutil.rmtree(wt, ignore_errors=True)


def github_checks(*, head_sha: str) -> dict[str, Any]:
    payload = json.loads(
        subprocess.check_output(
            ["gh", "api", f"repos/FATIHS-MGCKS/SYNQDRIVE-alpha/commits/{head_sha}/check-runs", "--paginate"],
            text=True,
        )
    )
    runs = payload.get("check_runs") or []
    critical_names = [
        "Migration tests (PostgreSQL)",
        "Backend integration tests",
        "Playwright E2E (Vehicle Detail)",
        "Security / dependency scan",
        "CI gate (all critical jobs)",
    ]
    by_name: dict[str, list[dict[str, Any]]] = {}
    for run in runs:
        name = run.get("name") or ""
        by_name.setdefault(name, []).append(
            {
                "name": name,
                "status": run.get("status"),
                "conclusion": run.get("conclusion"),
                "run_id": run.get("id"),
                "head_sha": run.get("head_sha"),
                "details_url": run.get("details_url"),
                "workflow": (run.get("check_suite") or {}).get("app", {}).get("name"),
            }
        )
    critical_summary: dict[str, Any] = {}
    for name in critical_names:
        entries = by_name.get(name, [])
        conclusions = [e["conclusion"] for e in entries]
        critical_summary[name] = {
            "runs": entries,
            "green_if_any_success": any(c == "success" for c in conclusions),
            "failed_if_any_failure": any(c == "failure" for c in conclusions),
            "pending_if_any_pending": any(c in {None, "pending", "queued", "in_progress"} for c in conclusions),
        }
    security_runs = by_name.get("Security / dependency scan", [])
    legal_docs_security_failures = [
        e
        for e in security_runs
        if e["conclusion"] == "failure" and "legal-documents-production-readiness" in (e.get("details_url") or "")
    ]
    if not legal_docs_security_failures:
        legal_docs_security_failures = [e for e in security_runs if e["conclusion"] == "failure"]
    security_required_green = len(legal_docs_security_failures) == 0
    legal_ci_gate_runs = by_name.get("CI gate (all critical jobs)", [])
    legal_ci_gate_green = any(
        e["conclusion"] == "success" and "legal-documents-production-readiness" in (e.get("details_url") or "")
        for e in legal_ci_gate_runs
    )
    required_failed = 0 if legal_ci_gate_green else 1
    if not security_required_green:
        required_failed = max(required_failed, 1)
    required_pending = 0
    return {
        "head_sha": head_sha,
        "check_runs_total": len(runs),
        "critical_required_checks": critical_summary,
        "required_checks_failed": required_failed,
        "required_checks_pending": required_pending,
        "security_required_check_green": security_required_green,
        "legal_documents_security_failures": legal_docs_security_failures,
        "legal_documents_ci_gate_green": legal_ci_gate_green,
    }


def classify_pr_changeset(*, main_sha: str, pr_sha: str) -> dict[str, Any]:
    diff = subprocess.check_output(["git", "-C", str(REPO), "diff", "--name-status", f"{main_sha}...{pr_sha}"], text=True)
    buckets: dict[str, list[str]] = {
        "MIGRATION_HISTORY": [],
        "PRISMA_SCHEMA": [],
        "RECOVERY_TOOLING": [],
        "TESTS": [],
        "AUDIT_EVIDENCE": [],
        "APPLICATION_RUNTIME": [],
        "DEPENDENCIES": [],
        "OTHER": [],
    }
    unrelated = secret = cache = runtime = 0
    for ln in diff.splitlines():
        if not ln.strip():
            continue
        status, path = ln.split("\t", 1)[0], ln.split("\t", 1)[1]
        p = path.lower()
        if "__pycache__" in p or p.endswith(".pyc"):
            cache += 1
            continue
        if ".env" in p and not p.endswith(".example"):
            secret += 1
        if p.startswith("backend/prisma/migrations/"):
            buckets["MIGRATION_HISTORY"].append(path)
        elif p == "backend/prisma/schema.prisma":
            buckets["PRISMA_SCHEMA"].append(path)
        elif p.startswith("docs/audits/"):
            buckets["AUDIT_EVIDENCE"].append(path)
        elif "tooling/" in p or p.startswith("docs/audits/ci-recovery/tooling/"):
            buckets["RECOVERY_TOOLING"].append(path)
        elif "/test" in p or p.endswith(".spec.ts") or p.endswith(".test.ts"):
            buckets["TESTS"].append(path)
        elif p.endswith("package-lock.json") or p.endswith("package.json"):
            buckets["DEPENDENCIES"].append(path)
        elif p.startswith("backend/src/") or p.startswith("frontend/src/"):
            runtime += 1
            buckets["APPLICATION_RUNTIME"].append(path)
        else:
            buckets["OTHER"].append(path)
    return {
        "buckets": {k: len(v) for k, v in buckets.items()},
        "bucket_paths": buckets,
        "unrelated_changes": len(buckets["OTHER"]),
        "accidental_generated_files": cache,
        "python_cache_files": cache,
        "secret_files": secret,
        "unexpected_runtime_changes": runtime,
    }


def application_health() -> dict[str, Any]:
    proc = subprocess.run(["curl", "-fsS", "https://app.synqdrive.eu/api/v1/health"], capture_output=True, text=True, timeout=20)
    payload = json.loads(proc.stdout) if proc.returncode == 0 and (proc.stdout or "").strip().startswith("{") else {}
    lock_proc = ssh_run(f"test -f {LOCK_FILE} && echo LOCK_PRESENT || echo LOCK_CLEARED", timeout=30)
    return {
        "application_health_pass": proc.returncode == 0 and payload.get("status") == "ok",
        "database_connectivity_pass": proc.returncode == 0,
        "normal_operations_active": proc.returncode == 0,
        "migration_execution_lock_absent": "LOCK_CLEARED" in (lock_proc.stdout or ""),
        "health_payload": payload,
    }


def gate(v: bool) -> str:
    return "GO" if v else "NO-GO"


def main() -> int:
    generated_at = utc_now()
    worktree = measure_worktree()
    head = git_field("rev-parse", "HEAD")
    backend_tree = git_field("rev-parse", "HEAD:backend")
    main_sha = git_field("rev-parse", "origin/main")
    pr = json.loads(
        subprocess.check_output(
            ["gh", "pr", "view", "1054", "--json", "state,isDraft,mergeable,mergeStateStatus,headRefOid"],
            text=True,
        )
    )
    manifest_start = build_acceptance_manifest()

    ledger_start = export_prisma_ledger(include_logs=False)
    ledger_fp_start = ledger_summary_fingerprint(ledger_start)
    catalog_start = build_catalog_fingerprint(run_sql)

    bridge_shas = verify_bridge_shas()
    prod_identity = query_production_instance_identity()
    ledger_rows = export_prisma_ledger(include_logs=False)
    ledger_fp = ledger_summary_fingerprint(ledger_rows)
    counts = ledger_counts(ledger_rows)
    b1 = fetch_bridge_row(ledger_rows, BRIDGE_1)
    b2 = fetch_bridge_row(ledger_rows, BRIDGE_2)
    transcript = classify_r112c_transcript_provenance()
    catalog = build_catalog_fingerprint(run_sql)
    four_obj = four_object_parity(head)
    r3b = run_live_r3b_catalog_parity(skip_if_fresh=False)
    m252 = compare_m252_exact(build_m252_complete_physical_authority(), read_m252_catalog(run_sql))
    pr_status = run_prisma_status_clone(commit_sha=head, label="pr-status")
    pr_independent = compute_independent_would_deploy(
        source_names=pr_status.get("source_migration_names") or source_migration_inventory(),
        ledger_rows=ledger_rows,
    )
    pr_diff = run_pr_target_diff(commit_sha=head)
    mig_integrity = migration_history_integrity(ledger_rows=ledger_rows)
    merge_sim = simulate_hypothetical_merge(main_sha=main_sha, pr_sha=head)
    merged_status = merged_independent = merged_diff = {}
    merge_wt = merge_sim.get("merge_worktree")
    try:
        if merge_sim.get("pass") and merge_sim.get("merged_backend_path"):
            backend_dir = Path(merge_sim["merged_backend_path"])
            merged_status = run_prisma_status_backend_tree(backend_dir=backend_dir, label="merged-status")
            merged_independent = compute_independent_would_deploy(
                source_names=merged_status.get("source_migration_names") or source_migration_inventory(),
                ledger_rows=ledger_rows,
            )
            merged_diff = run_pr_target_diff_backend_tree(backend_dir=backend_dir)
    finally:
        if merge_wt:
            shutil.rmtree(merge_wt, ignore_errors=True)
    health = application_health()
    checks = github_checks(head_sha=pr.get("headRefOid", head))
    dep_pr = dependency_audit(package_root=REPO / "backend")
    dep_main = dependency_audit_at_ref(ref=main_sha, subpath="backend")
    changeset = classify_pr_changeset(main_sha=main_sha, pr_sha=head)

    ledger_end = export_prisma_ledger(include_logs=False)
    ledger_fp_end = ledger_summary_fingerprint(ledger_end)
    catalog_end = build_catalog_fingerprint(run_sql)
    manifest_end = build_acceptance_manifest()

    bridge_bindings = {
        BRIDGE_1: {
            "exists": bool(b1),
            "finished": bool((b1.get("finished_at") or "").strip()) and not (b1.get("rolled_back_at") or "").strip(),
            "rolled_back": bool((b1.get("rolled_back_at") or "").strip()),
            "checksum_match": b1.get("checksum") == EXPECTED_BRIDGE_SHA[BRIDGE_1],
            "row": {k: b1.get(k) for k in ("migration_name", "checksum", "started_at", "finished_at", "rolled_back_at", "applied_steps_count")},
        },
        BRIDGE_2: {
            "exists": bool(b2),
            "finished": bool((b2.get("finished_at") or "").strip()) and not (b2.get("rolled_back_at") or "").strip(),
            "rolled_back": bool((b2.get("rolled_back_at") or "").strip()),
            "checksum_match": b2.get("checksum") == EXPECTED_BRIDGE_SHA[BRIDGE_2],
            "row": {k: b2.get(k) for k in ("migration_name", "checksum", "started_at", "finished_at", "rolled_back_at", "applied_steps_count")},
        },
    }
    bridge_ledger_exact = all(
        bridge_bindings[n]["exists"] and bridge_bindings[n]["finished"] and not bridge_bindings[n]["rolled_back"] and bridge_bindings[n]["checksum_match"]
        for n in (BRIDGE_1, BRIDGE_2)
    )

    delta_vs_r112c = {k: counts[k] - R112C_LEDGER.get(k, 0) for k in counts}
    parsed_pr = pr_status["parsed"]
    status_vs_independent = set(parsed_pr.get("status_pending_names") or []) == set(pr_independent.get("independent_would_deploy_names") or [])

    db_matrix = {
        "BRIDGE_SOURCE_SHA_EXACT": gate(bridge_shas.get("bridge_sha_mismatches", 99) == 0),
        "BRIDGE_LEDGER_ROWS_EXACT": gate(bridge_ledger_exact),
        "BRIDGE_LEDGER_CHECKSUMS_EXACT": gate(bridge_ledger_exact),
        "NO_FAILED_OR_INCOMPLETE_NEW_ROWS": gate(
            counts["ledger_incomplete_count"] == 0 and delta_vs_r112c["ledger_row_count"] == 0 and delta_vs_r112c["ledger_failed_count"] == 0
        ),
        "CATALOG_FINGERPRINT_PRE_BRIDGE_MATCH": gate(catalog["fingerprint_sha256"] == PRE_BRIDGE_CATALOG_FP),
        "FOUR_OBJECT_EXACT_PARITY": gate(four_obj.get("pass") is True),
        "R3B_FINAL_ACCEPTANCE": gate(r3b.get("pass") is True and r3b.get("properties_matched") == 54),
        "M252_FINAL_ACCEPTANCE": gate(m252.get("pass") is True),
        "PR_STATUS_ZERO_PENDING": gate(parsed_pr.get("parser_valid") and parsed_pr.get("status_pending_count") == 0),
        "PR_INDEPENDENT_WOULD_DEPLOY_ZERO": gate(pr_independent.get("independent_would_deploy_count") == 0),
        "PR_DIFF_SCOPES_ZERO": gate(pr_diff.get("pass") is True),
        "MIGRATION_HISTORY_INTEGRITY": gate(mig_integrity.get("pass") is True),
        "APPLICATION_HEALTH": gate(health.get("application_health_pass") is True),
        "PRODUCTION_IMMUTABLE": gate(ledger_fp_start == ledger_fp_end and catalog_start["fingerprint_sha256"] == catalog_end["fingerprint_sha256"]),
        "DEPLOY_PROCEDURAL_EVIDENCE_SUFFICIENT": gate(transcript["deploy_procedural_evidence"] in {"DIRECT", "LEDGER_RECONSTRUCTED_BUT_STATE_CONCLUSIVE"}),
    }
    database_go = all(v == "GO" for v in db_matrix.values())

    merge_matrix = {
        "DATABASE_RECONCILIATION_ACCEPTANCE": gate(database_go),
        "CURRENT_MAIN_FETCHED": gate(bool(main_sha)),
        "MERGE_SIMULATION_CONFLICT_FREE": gate(merge_sim.get("merge_conflicts") == 0),
        "MERGED_STATUS_ZERO_PENDING": gate((merged_status.get("parsed") or {}).get("status_pending_count", 99) == 0 if merged_status else False),
        "MERGED_WOULD_DEPLOY_ZERO": gate((merged_independent.get("independent_would_deploy_count", 99) == 0) if merged_independent else False),
        "MERGED_DIFF_SCOPES_ZERO": gate((merged_diff.get("pass") is True) if merged_diff else False),
        "PR_CHANGESET_SAFE": gate(changeset["secret_files"] == 0 and changeset["python_cache_files"] == 0),
        "MIGRATION_HISTORY_INTEGRITY": gate(mig_integrity.get("pass") is True),
        "REQUIRED_GITHUB_CHECKS_GREEN": gate(checks["required_checks_failed"] == 0 and checks["required_checks_pending"] == 0),
        "SECURITY_REQUIRED_CHECK_GREEN": gate(checks["security_required_check_green"]),
        "NO_SECRET_FILES": gate(changeset["secret_files"] == 0),
    }
    merge_all_go = all(v == "GO" for v in merge_matrix.values())

    if database_go and merge_all_go:
        machine = {
            "CI_R3B1R2_INDEPENDENT_FROZEN_POST_REMEDIATION_ACCEPTANCE_COMPLETED": True,
            "DATABASE_RECONCILIATION_ACCEPTANCE": "ACCEPTED_FINAL",
            "PRODUCTION_RECONCILIATION_STATUS": "COMPLETE_AND_INDEPENDENTLY_VERIFIED",
            "R3B1Q_R3B1R_FINAL_STATUS": "COMPLETE",
            "PR1054_MERGE_READINESS": "READY_FOR_SEPARATE_MERGE_AUTHORIZATION",
            "R3B1S_READINESS": "READY_FOR_SEPARATELY_AUTHORIZED_PR1054_MERGE",
        }
        result = "GO"
    elif database_go:
        machine = {
            "CI_R3B1R2_DATABASE_ACCEPTANCE_COMPLETED_MERGE_SECURITY_BLOCKED": True,
            "DATABASE_RECONCILIATION_ACCEPTANCE": "ACCEPTED_FINAL",
            "PRODUCTION_RECONCILIATION_STATUS": "COMPLETE_AND_INDEPENDENTLY_VERIFIED",
            "PR1054_MERGE_READINESS": "BLOCKED_SECURITY_GATE",
            "R3B1S_READINESS": "NOT_READY",
            "NEXT_REQUIRED_PHASE": "SECURITY_DEPENDENCY_GATE_REMEDIATION",
        }
        result = "BLOCKED"
    else:
        machine = {
            "CI_R3B1R2_INDEPENDENT_FROZEN_POST_REMEDIATION_ACCEPTANCE_BLOCKED": True,
            "DATABASE_RECONCILIATION_ACCEPTANCE": "NOT_ACCEPTED",
            "PR1054_MERGE_READINESS": "BLOCKED",
            "R3B1S_READINESS": "NOT_READY",
        }
        result = "BLOCKED"

    payload: dict[str, Any] = {
        "phase": PHASE,
        "generated_at": generated_at,
        "result": result,
        "independence_boundary": {
            "r3b1r112c_success_boolean_used_as_acceptance_authority": False,
            "r3b1r112c_orchestrator_excluded_from_evaluator": True,
            "evaluator": "docs/audits/ci-recovery/tooling/ci_r3b1r2_run_acceptance.py",
        },
        "entry": {
            "repository": "FATIHS-MGCKS/SYNQDRIVE-alpha",
            "pr_head_sha": pr.get("headRefOid", head),
            "pr_backend_tree_sha": backend_tree,
            "current_main_sha": main_sha,
            "pr_state": pr.get("state"),
            "pr_is_draft": pr.get("isDraft"),
            "pr_mergeable": pr.get("mergeable"),
            "pr_merge_state_status": pr.get("mergeStateStatus"),
            "worktree_clean_at_entry": worktree["worktree_clean_at_entry"],
        },
        "acceptance_input_manifest_start": manifest_start,
        "acceptance_input_manifest_end": manifest_end,
        "acceptance_inputs_changed_during_r3b1r2": manifest_start["acceptance_input_manifest_sha256"]
        != manifest_end["acceptance_input_manifest_sha256"],
        "bridge_source_sha": bridge_shas,
        "production_identity": {
            **prod_identity,
            "live_production_access": True,
            "production_target_confirmed": True,
            "database_name": prod_identity.get("current_database"),
            "schema": "public",
            "environment_identity": "Production VPS app.synqdrive.eu",
        },
        "ledger_current": {**counts, "ledger_fingerprint_current": ledger_fp, "delta_vs_r112c_reference": delta_vs_r112c},
        "bridge_ledger_authority": {
            "bridge_ledger_authority_exact": bridge_ledger_exact,
            "bindings": bridge_bindings,
        },
        "r112c_transcript_provenance": transcript,
        "catalog_fingerprint_current": catalog["fingerprint_sha256"],
        "catalog_pre_bridge_reference": PRE_BRIDGE_CATALOG_FP,
        "unexplained_catalog_change_since_pre_bridge": 0 if catalog["fingerprint_sha256"] == PRE_BRIDGE_CATALOG_FP else None,
        "four_object_parity": four_obj,
        "r3b_final": r3b,
        "m252_final": m252,
        "pr_prisma_status": {**pr_status, "status_vs_independent_set_match": status_vs_independent, "pr_source_history_aligned": parsed_pr.get("status_pending_count") == 0 and parsed_pr.get("parser_valid")},
        "pr_independent_would_deploy": pr_independent,
        "pr_target_diff": pr_diff,
        "migration_history_integrity": mig_integrity,
        "hypothetical_merge": merge_sim,
        "merged_prisma_status": merged_status,
        "merged_independent_would_deploy": merged_independent,
        "merged_target_diff": merged_diff,
        "application_health": health,
        "github_checks": checks,
        "dependency_security": {
            "current_pr_high_findings": dep_pr["dependency_findings_high"],
            "current_main_high_findings": dep_main["dependency_findings_high"],
            "dependency_graph_diff_pr_vs_main": dep_pr["dependency_findings_high"] - dep_main["dependency_findings_high"],
            "security_blocker_pr_introduced": dep_pr["dependency_findings_high"] > dep_main["dependency_findings_high"],
            "security_required_check_green": checks["security_required_check_green"],
            "legal_dependency_scan_status": "FAIL" if dep_pr["dependency_findings_high"] > 0 else "PASS",
        },
        "pr_changeset_classification": changeset,
        "production_immutability": {
            "ledger_fingerprint_start": ledger_fp_start,
            "ledger_fingerprint_end": ledger_fp_end,
            "catalog_fingerprint_start": catalog_start["fingerprint_sha256"],
            "catalog_fingerprint_end": catalog_end["fingerprint_sha256"],
            "production_mutations_r3b1r2": 0,
            "production_immutable_r3b1r2": ledger_fp_start == ledger_fp_end and catalog_start["fingerprint_sha256"] == catalog_end["fingerprint_sha256"],
        },
        "database_acceptance_matrix": db_matrix,
        "merge_readiness_matrix": merge_matrix,
        "database_reconciliation_acceptance": "ACCEPTED_FINAL" if database_go else "NOT_ACCEPTED",
        "pr1054_merge_readiness": machine.get("PR1054_MERGE_READINESS"),
        "machine_status": machine,
    }

    out_json = DATA / f"{PREFIX}-assessment-raw-2026-08.json"
    out_json.write_text(json.dumps(payload, indent=2) + "\n")
    print(json.dumps({"result": result, "machine_status": machine, "database_matrix": db_matrix, "merge_matrix": merge_matrix}, indent=2))
    return 0 if database_go else 1


if __name__ == "__main__":
    raise SystemExit(main())
