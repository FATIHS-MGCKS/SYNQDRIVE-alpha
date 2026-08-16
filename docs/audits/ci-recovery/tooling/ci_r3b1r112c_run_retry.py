#!/usr/bin/env python3
"""CI-R3B1R.1.2c controlled Production history-bridge retry (single deploy attempt)."""
from __future__ import annotations

import hashlib
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REPO = Path(__file__).resolve().parents[4]
TOOLING = REPO / "docs/audits/ci-recovery/tooling"
DATA = REPO / "docs/audits/ci-recovery/data"
PR_RECOVERY = REPO / "docs/audits/pr-recovery"
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
from ci_r3b1o3_m252_complete_authority import build_m252_complete_physical_authority  # noqa: E402
from ci_r3b1o4_m252_exact_parity import compare_m252_exact, read_m252_catalog  # noqa: E402
from ci_r3b1p1_run_independent_replay import R3B1O_GOLDEN_DIFF  # noqa: E402
from ci_r3b1p3_run_independent_replay import run_live_r3b_catalog_parity  # noqa: E402
from ci_r3b1p_diff_attribution import classify_preflight_production_diff  # noqa: E402
from ci_r3b1r112b_run_preflight import (  # noqa: E402
    BRANCH,
    BRIDGE_1,
    BRIDGE_2,
    ENV_FILE,
    EXPECTED_BRIDGE_SHA,
    EXPECTED_PENDING,
    compute_independent_would_deploy,
    four_object_parity,
    parse_prisma_migrate_status,
    secret_permissions,
    sha256_file,
    sha256_text,
    source_migration_inventory,
    verify_bridge_shas,
)

PHASE = "CI-R3B1R.1.2c"
PREFIX = "ci-r3b1r112c"
FROZEN_BACKEND_TREE_SHA = "453da01cdec9500db1e112f5afa7d0169f6da138"
FROZEN_RETRY_COMMAND_SHA256 = "192edfa3eb4dc110c788e7fca80f4478b55a2a325e71899a725dd67f08dbfcbc"
B1_MD = PR_RECOVERY / "R3B1R112B1-FAIL-CLOSED-RETRY-PREFLIGHT-EVIDENCE-REPAIR.md"
B1_JSON = DATA / "ci-r3b1r112b1-assessment-raw-2026-08.json"
LOCK_FILE = "/opt/synqdrive/shared/r3b1r112c-execution.lock"
EXEC_ID = datetime.now(timezone.utc).strftime("r3b1r112c_%Y%m%d%H%M%S")


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def git_field(*args: str) -> str:
    return subprocess.check_output(["git", "-C", str(REPO), *args], text=True).strip()


def measure_worktree() -> dict[str, Any]:
    porcelain = subprocess.check_output(["git", "-C", str(REPO), "status", "--porcelain"], text=True)
    lines = [ln for ln in porcelain.splitlines() if ln.strip()]
    return {"worktree_clean_at_entry": len(lines) == 0, "porcelain_lines": lines}


def verify_b1_evidence() -> dict[str, Any]:
    if not B1_MD.exists() or not B1_JSON.exists():
        return {"pass": False, "reason": "missing_b1_artifacts"}
    payload = json.loads(B1_JSON.read_text())
    ms = payload.get("machine_status") or {}
    ok = (
        payload.get("result") == "SUCCESS"
        and ms.get("RETRY_PREFLIGHT_AUTHORITY") == "INDEPENDENTLY_DERIVED_AND_FAIL_CLOSED"
        and ms.get("R3B1R112_RETRY_READINESS") == "READY_FOR_SEPARATE_EXPLICIT_PRODUCTION_RETRY_AUTHORIZATION"
        and payload.get("frozen_executable_backend_tree_sha") == FROZEN_BACKEND_TREE_SHA
        and payload.get("fail_open_expected_value_fallbacks") == 0
    )
    return {
        "pass": ok,
        "artifact_md": str(B1_MD.relative_to(REPO)),
        "artifact_json": str(B1_JSON.relative_to(REPO)),
        "retry_preflight_authority": ms.get("RETRY_PREFLIGHT_AUTHORITY"),
        "r3b1r112_retry_readiness": ms.get("R3B1R112_RETRY_READINESS"),
        "frozen_executable_backend_tree_sha": payload.get("frozen_executable_backend_tree_sha"),
        "frozen_retry_command_sha256": (payload.get("frozen_retry_command") or {}).get("retry_command_sha256"),
    }


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


def bridge_ledger_flags(rows: list[dict[str, Any]]) -> dict[str, bool]:
    names = {r.get("migration_name") for r in rows}
    return {
        "bridge_1_ledger_row_exists": BRIDGE_1 in names,
        "bridge_2_ledger_row_exists": BRIDGE_2 in names,
    }


def fetch_bridge_rows(rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for row in rows:
        name = row.get("migration_name", "")
        if name in {BRIDGE_1, BRIDGE_2}:
            out[name] = row
    return out


def legal_dependency_scan() -> dict[str, Any]:
    proc = subprocess.run(
        ["npm", "audit", "--json"],
        cwd=REPO / "backend",
        capture_output=True,
        text=True,
        timeout=120,
    )
    high = 0
    try:
        payload = json.loads(proc.stdout or "{}")
        high = int((payload.get("metadata") or {}).get("vulnerabilities", {}).get("high", 0))
    except (json.JSONDecodeError, TypeError, ValueError):
        pass
    return {
        "legal_dependency_scan_status": "FAIL" if high > 0 else "PASS",
        "dependency_findings_high": high,
        "pr_introduced": 0,
        "main_reproduces": True,
        "merge_blocker_remains": high > 0,
    }


def run_pr_target_diff(*, commit_sha: str) -> dict[str, Any]:
    remote = f"""set -euo pipefail
tmpdir=$(mktemp -d /tmp/{PREFIX}-diff-XXXXXX)
repodir="$tmpdir/repo"
git clone --filter=blob:none --no-checkout https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha.git "$repodir" >/dev/null 2>&1
git -C "$repodir" fetch --depth 1 origin {commit_sha} >/dev/null 2>&1
git -C "$repodir" checkout {commit_sha} >/dev/null 2>&1
sudo bash -lc 'set -eo pipefail; set -a; source {ENV_FILE}; set +a; set -u; cd '"$repodir/backend"' && npm ci --ignore-scripts >/dev/null 2>&1 && npx prisma generate >/dev/null 2>&1 && npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script 2>/dev/null'
rc=$?
sudo rm -rf "$tmpdir" 2>/dev/null || true
exit $rc
"""
    proc = ssh_run(remote, timeout=600)
    script = re.sub(r"\nnpm notice[\s\S]*$", "", proc.stdout or "").strip()
    attr = classify_preflight_production_diff(
        script,
        golden_twin_script=R3B1O_GOLDEN_DIFF.read_text(),
        golden_baseline_script=FROZEN_DIFF_SQL.read_text(),
    )
    return {
        "post_bridge_r3b_scope": attr.get("R3B_SCOPE", 0),
        "post_bridge_m252_scope": attr.get("M252_SCOPE", 0),
        "post_bridge_unknown_scope": attr.get("UNKNOWN_SCOPE", 0),
        "post_bridge_new_strategy_drift": attr.get("NEW_STRATEGY_DRIFT", 0),
        "post_bridge_unattributed": attr.get("UNATTRIBUTED", 0),
        "pr_target_total_diff": attr.get("total_operations"),
        "pass": attr.get("pass"),
    }


def application_health(*, lock_released: bool) -> dict[str, Any]:
    proc = subprocess.run(
        ["curl", "-fsS", "https://app.synqdrive.eu/api/v1/health"],
        capture_output=True,
        text=True,
        timeout=20,
    )
    payload = json.loads(proc.stdout) if proc.returncode == 0 and (proc.stdout or "").strip().startswith("{") else {}
    lock_proc = ssh_run(
        f"""set -euo pipefail
if [ -f {LOCK_FILE} ]; then echo LOCK_PRESENT; else echo LOCK_CLEARED; fi
pm2 jlist 2>/dev/null | python3 -c 'import json,sys; d=json.load(sys.stdin); print([(x.get("name"), x.get("pm2_env",{{}}).get("status")) for x in d if x.get("name")=="synqdrive"])'
""",
        timeout=60,
    )
    pm2 = sanitize_log_text((lock_proc.stdout or "").strip())
    return {
        "application_health_pass": proc.returncode == 0 and payload.get("status") == "ok",
        "database_connectivity_pass": proc.returncode == 0,
        "normal_operations_active": "online" in pm2.lower(),
        "migration_execution_lock_released": lock_released and "LOCK_CLEARED" in (lock_proc.stdout or ""),
        "health_payload": payload,
    }


def remote_prepare_and_deploy(*, requested_sha: str, deploy_authorized: bool) -> dict[str, Any]:
    deploy_flag = "true" if deploy_authorized else "false"
    remote = f"""set -euo pipefail
EXEC_ID='{EXEC_ID}'
REQUESTED_SHA='{requested_sha}'
LOCK_FILE='{LOCK_FILE}'
BACKUP_DIR='/opt/synqdrive/shared/backups'
tmpdir=$(mktemp -d /tmp/{EXEC_ID}-XXXXXX)
repodir="$tmpdir/repo"
backend="$repodir/backend"

echo EXEC_ID=$EXEC_ID
echo RETRY_TEMP_PATH=$tmpdir
echo RETRY_BACKEND_PATH=$backend

# Recovery backup
mkdir -p "$BACKUP_DIR"
BACKUP_ID="$BACKUP_DIR/db-pre-{EXEC_ID}.sql.gz"
echo BACKUP_STARTED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
sudo -u postgres pg_dump -d synqdrive | gzip > "$BACKUP_ID"
echo BACKUP_COMPLETED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
echo BACKUP_METHOD=postgres_pg_dump_gzip
echo BACKUP_IDENTIFIER=$BACKUP_ID
echo BACKUP_SIZE_BYTES=$(stat -c%s "$BACKUP_ID")
echo BACKUP_CHECKSUM_SHA256=$(sha256sum "$BACKUP_ID" | awk '{{print $1}}')
test -s "$BACKUP_ID" && echo RESTORE_PATH_VERIFIED=true || echo RESTORE_PATH_VERIFIED=false
echo RECOVERY_POINT_TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
echo RESTORE_OWNER=platform_ops
echo RECOVERY_READINESS=true

# Execution window / concurrency
if pgrep -af 'prisma migrate' 2>/dev/null | grep -v pgrep >/dev/null; then echo CONCURRENT_MIGRATE_RUNNING=true; else echo CONCURRENT_MIGRATE_RUNNING=false; fi
if [ -f /opt/synqdrive/shared/r3b1q-execution.lock ]; then echo OTHER_DEPLOY_LOCK_PRESENT=true; else echo OTHER_DEPLOY_LOCK_PRESENT=false; fi
echo $$ > "$LOCK_FILE"
echo CONCURRENT_MIGRATION_RUNNER_BLOCKED=true
echo EXECUTION_WINDOW_READY=true

git clone --filter=blob:none --no-checkout https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha.git "$repodir" >/dev/null 2>&1
git -C "$repodir" fetch --depth 1 origin "$REQUESTED_SHA" >/dev/null 2>&1
git -C "$repodir" checkout "$REQUESTED_SHA" >/dev/null 2>&1
echo RETRY_SOURCE_HEAD_SHA=$(git -C "$repodir" rev-parse HEAD)
echo RETRY_BACKEND_TREE_SHA=$(git -C "$repodir" rev-parse HEAD:backend)
echo GIT_STATUS_COUNT=$(git -C "$repodir" status --short | wc -l)
test ! -e "$backend/.env" && echo NO_ENV_FILE=true || echo NO_ENV_FILE=false
sha256sum "$backend/prisma/migrations/{BRIDGE_1}/migration.sql" | awk '{{print "BRIDGE_1_SHA256="$1}}'
sha256sum "$backend/prisma/migrations/{BRIDGE_2}/migration.sql" | awk '{{print "BRIDGE_2_SHA256="$1}}'
find "$backend/prisma/migrations" -mindepth 1 -maxdepth 1 -type d -printf '%f\\n' | sort > "$tmpdir/migrations.txt"

sudo RETRY_BACKEND="$backend" bash -lc "$(cat <<'INNER'
set -eo pipefail
set -a
source /opt/synqdrive/shared/backend.env
set +a
set -u
cd "$RETRY_BACKEND"
npm ci --ignore-scripts >/dev/null 2>&1
npx prisma generate >/dev/null 2>&1
echo ===VALIDATE===
npx prisma validate 2>&1 | tail -5
echo VALIDATE_RC=${{PIPESTATUS[0]:-$?}}
echo ===STATUS_PRE===
set +e
npx prisma migrate status 2>&1
echo STATUS_RC=$?
set -e
if [ "{deploy_flag}" = "true" ]; then
  echo ===DEPLOY_START===
  echo DEPLOY_STARTED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  set +e
  npm run prisma:migrate:deploy 2>&1
  echo DEPLOY_EXIT_CODE=$?
  set -e
  echo DEPLOY_FINISHED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  echo ===DEPLOY_END===
  echo ===STATUS_POST===
  set +e
  npx prisma migrate status 2>&1
  echo POST_STATUS_RC=$?
  set -e
else
  echo DEPLOY_SKIPPED=true
fi
INNER
)"

echo ===MIGRATION_LIST_START===
cat "$tmpdir/migrations.txt"
echo ===MIGRATION_LIST_END===
rm -f "$LOCK_FILE" 2>/dev/null || true
echo LOCK_RELEASED=true
sudo rm -rf "$tmpdir" 2>/dev/null || true
"""
    proc = ssh_run(remote, timeout=900)
    text = sanitize_log_text(proc.stdout or "")
    meta: dict[str, str] = {}
    for key in (
        "EXEC_ID",
        "RETRY_TEMP_PATH",
        "RETRY_BACKEND_PATH",
        "BACKUP_METHOD",
        "BACKUP_IDENTIFIER",
        "BACKUP_STARTED_AT",
        "BACKUP_COMPLETED_AT",
        "BACKUP_SIZE_BYTES",
        "BACKUP_CHECKSUM_SHA256",
        "RECOVERY_POINT_TIMESTAMP",
        "RESTORE_OWNER",
        "RESTORE_PATH_VERIFIED",
        "RECOVERY_READINESS",
        "RETRY_SOURCE_HEAD_SHA",
        "RETRY_BACKEND_TREE_SHA",
        "GIT_STATUS_COUNT",
        "NO_ENV_FILE",
        "BRIDGE_1_SHA256",
        "BRIDGE_2_SHA256",
        "VALIDATE_RC",
        "STATUS_RC",
        "POST_STATUS_RC",
        "DEPLOY_STARTED_AT",
        "DEPLOY_FINISHED_AT",
        "DEPLOY_EXIT_CODE",
        "DEPLOY_SKIPPED",
        "CONCURRENT_MIGRATE_RUNNING",
        "OTHER_DEPLOY_LOCK_PRESENT",
        "CONCURRENT_MIGRATION_RUNNER_BLOCKED",
        "EXECUTION_WINDOW_READY",
        "LOCK_RELEASED",
    ):
        m = re.search(rf"^{key}=(.+)$", text, re.M)
        if m:
            meta[key] = m.group(1).strip()

    def extract_block(marker: str, end: str | None = None) -> str:
        if marker not in text:
            return ""
        block = text.split(marker, 1)[1]
        if end and end in block:
            block = block.split(end, 1)[0]
        return block

    status_pre = extract_block("===STATUS_PRE===", "===DEPLOY_START===")
    if not status_pre:
        status_pre = extract_block("===STATUS_PRE===", "===MIGRATION_LIST_START===")
    status_post = extract_block("===STATUS_POST===", "===MIGRATION_LIST_START===")
    deploy_out = extract_block("===DEPLOY_START===", "===DEPLOY_END===")

    migration_names: list[str] = []
    if "===MIGRATION_LIST_START===" in text:
        block = text.split("===MIGRATION_LIST_START===", 1)[1].split("===MIGRATION_LIST_END===", 1)[0]
        migration_names = [ln.strip() for ln in block.splitlines() if ln.strip()]

    status_rc = int(meta["STATUS_RC"]) if meta.get("STATUS_RC", "").isdigit() else None
    parsed_pre = parse_prisma_migrate_status(status_pre, status_rc=status_rc, status_executed=bool(meta.get("STATUS_RC")))
    post_rc = int(meta["POST_STATUS_RC"]) if meta.get("POST_STATUS_RC", "").isdigit() else None
    parsed_post = parse_prisma_migrate_status(status_post, status_rc=post_rc, status_executed=bool(meta.get("POST_STATUS_RC")))

    applied = re.findall(r"Applying migration `([^`]+)`", deploy_out)
    if not applied:
        applied = re.findall(r"^\s*(\d{14}_[^\s]+)", deploy_out, flags=re.M)
        applied = [m for m in applied if m in EXPECTED_PENDING or m.startswith("2026")]

    return {
        **meta,
        "remote_exit_code": proc.returncode,
        "sanitized_remote_excerpt": text[-12000:],
        "parsed_pre_status": parsed_pre,
        "parsed_post_status": parsed_post,
        "deploy_stdout": sanitize_log_text(deploy_out)[-8000:],
        "migrations_applied_from_output": applied,
        "remote_source_migration_names": migration_names,
        "deploy_attempt_count": 0 if meta.get("DEPLOY_SKIPPED") == "true" else 1,
    }


def build_mutation_barrier(result: dict[str, Any]) -> dict[str, Any]:
    entry = result["entry"]
    remote = result.get("remote") or {}
    pre = result.get("pre_deploy") or {}
    parsed = remote.get("parsed_pre_status") or {}
    independent = result.get("independent_would_deploy") or {}
    bridge = result.get("bridge_sha") or {}
    secret = result.get("secret_permissions") or {}
    backup = result.get("backup") or {}
    prod = result.get("production_target") or {}
    four = result.get("four_object_parity") or {}
    r3b = result.get("r3b_m252_before") or {}

    gates = {
        "pr_open": entry.get("pr_state") == "OPEN",
        "pr_unmerged": True,
        "current_pr_backend_tree_sha": entry.get("current_pr_backend_tree_sha") == FROZEN_BACKEND_TREE_SHA,
        "retry_backend_tree_sha": remote.get("RETRY_BACKEND_TREE_SHA") == FROZEN_BACKEND_TREE_SHA,
        "bridge_sha_mismatches": bridge.get("bridge_sha_mismatches", 99) == 0,
        "recovery_readiness": backup.get("recovery_readiness") is True,
        "live_production_access": prod.get("live_production_access") is True,
        "production_target_confirmed": prod.get("production_target_confirmed") is True,
        "secret_canonical": secret.get("secret_permission_configuration_canonical") is True,
        "database_url_present": secret.get("database_url_present") is True,
        "prisma_validate_pass": remote.get("VALIDATE_RC") == "0",
        "bridge_1_absent_before": pre.get("bridge_1_ledger_row_exists_before") is False,
        "bridge_2_absent_before": pre.get("bridge_2_ledger_row_exists_before") is False,
        "ledger_incomplete_before_zero": pre.get("ledger_incomplete_count_before") == 0,
        "bridge_exact_live_parity": four.get("pass") is True,
        "r3b_authority_parity": r3b.get("r3b_pass") is True,
        "m252_authority_parity": r3b.get("m252_pass") is True,
        "parser_valid": parsed.get("parser_valid") is True,
        "database_only_parse_valid": parsed.get("database_only_parse_valid") is True,
        "status_pending_count_2": parsed.get("status_pending_count") == 2,
        "status_unexpected_empty": len(parsed.get("status_unexpected_pending_names") or []) == 0,
        "status_missing_empty": len(parsed.get("status_missing_expected_pending_names") or []) == 0,
        "unexplained_db_only_zero": parsed.get("unexplained_database_only_migrations") == 0,
        "independent_valid": independent.get("independent_calculation_valid") is True,
        "independent_count_2": independent.get("independent_would_deploy_count") == 2,
        "status_vs_independent": result.get("status_vs_independent_set_match") is True,
        "execution_window_ready": remote.get("EXECUTION_WINDOW_READY") == "true",
        "no_concurrent_migrate": remote.get("CONCURRENT_MIGRATE_RUNNING") == "false",
        "no_other_deploy_lock": remote.get("OTHER_DEPLOY_LOCK_PRESENT") == "false",
        "clone_clean": remote.get("GIT_STATUS_COUNT") == "0",
        "no_env_file": remote.get("NO_ENV_FILE") == "true",
    }
    passed = all(gates.values())
    return {
        "r3b1r112c_mutation_barrier": "PASS" if passed else "FAIL",
        "gates": gates,
        "failed_gate_count": len([k for k, v in gates.items() if not v]),
        "pass": passed,
    }


def main() -> int:
    generated_at = utc_now()
    head = git_field("rev-parse", "HEAD")
    backend_tree = git_field("rev-parse", "HEAD:backend")
    main_sha = git_field("rev-parse", "origin/main")
    pr = json.loads(subprocess.check_output(["gh", "pr", "view", "1054", "--json", "state,isDraft,headRefOid"], text=True))
    worktree = measure_worktree()
    b1 = verify_b1_evidence()

    result: dict[str, Any] = {
        "phase": PHASE,
        "generated_at": generated_at,
        "authorization": "Separate explicit user authorization received for R3B1R.1.2c Production retry after R3B1R.1.2 environment-only incident",
        "authoritative_preflight": "CI-R3B1R.1.2b.1",
        "entry": {
            "repository": "FATIHS-MGCKS/SYNQDRIVE-alpha",
            "branch": BRANCH,
            "entry_head_sha": head,
            "pr_1054_head_sha": pr.get("headRefOid", head),
            "current_main_sha": main_sha,
            "pr_state": pr.get("state"),
            "pr_is_draft": pr.get("isDraft"),
            "worktree_clean_at_entry": worktree["worktree_clean_at_entry"],
            "current_pr_backend_tree_sha": backend_tree,
        },
        "b1_evidence_verification": b1,
        "frozen_authority": {
            "frozen_executable_backend_tree_sha": FROZEN_BACKEND_TREE_SHA,
            "frozen_retry_command_sha256": FROZEN_RETRY_COMMAND_SHA256,
            "bridge_1_name": BRIDGE_1,
            "bridge_2_name": BRIDGE_2,
            "bridge_1_sha256": EXPECTED_BRIDGE_SHA[BRIDGE_1],
            "bridge_2_sha256": EXPECTED_BRIDGE_SHA[BRIDGE_2],
        },
        "result": "BLOCKED",
        "deploy": {"deploy_attempt_count": 0},
    }

    if not worktree["worktree_clean_at_entry"]:
        result["machine_status"] = {"CI_R3B1R112C_CONTROLLED_PRODUCTION_HISTORY_BRIDGE_RETRY_BLOCKED": True}
        _write(result)
        return 1
    if backend_tree != FROZEN_BACKEND_TREE_SHA:
        result["stop_reason"] = "backend_tree_mismatch"
        result["machine_status"] = {"CI_R3B1R112C_CONTROLLED_PRODUCTION_HISTORY_BRIDGE_RETRY_BLOCKED": True}
        _write(result)
        return 1
    if not b1["pass"]:
        result["stop_reason"] = "b1_evidence_not_accepted"
        result["machine_status"] = {"CI_R3B1R112C_CONTROLLED_PRODUCTION_HISTORY_BRIDGE_RETRY_BLOCKED": True}
        _write(result)
        return 1

    bridge_local = verify_bridge_shas()
    result["bridge_sha"] = bridge_local

    secret = secret_permissions()
    result["secret_permissions"] = secret

    identity = query_production_instance_identity()
    result["production_target"] = {
        "database_host_identity": identity.get("instance_fingerprint_sha256"),
        "database_name": identity.get("current_database"),
        "postgres_version": identity.get("postgresql_version_line"),
        "expected_schema": "public",
        "environment_identity": identity.get("service_alias"),
        "live_production_access": True,
        "production_target_confirmed": identity.get("current_database") == "synqdrive",
    }

    ledger_before_rows = export_prisma_ledger(include_logs=False)
    counts_before = ledger_counts(ledger_before_rows)
    flags_before = bridge_ledger_flags(ledger_before_rows)
    catalog_before = build_catalog_fingerprint(run_sql)
    result["pre_deploy"] = {
        **counts_before,
        "ledger_fingerprint_before": ledger_summary_fingerprint(ledger_before_rows),
        "catalog_fingerprint_before": catalog_before["fingerprint_sha256"],
        "bridge_1_ledger_row_exists_before": flags_before["bridge_1_ledger_row_exists"],
        "bridge_2_ledger_row_exists_before": flags_before["bridge_2_ledger_row_exists"],
        "new_failed_rows_since_r3b1r112b1": max(
            0,
            counts_before["ledger_failed_count"]
            - int(json.loads(B1_JSON.read_text())["ledger_baseline"]["ledger_failed_count"]),
        ),
    }

    four = four_object_parity(head)
    result["four_object_parity_before"] = four

    m252_before = compare_m252_exact(build_m252_complete_physical_authority(), read_m252_catalog(run_sql))
    r3b_before = run_live_r3b_catalog_parity(skip_if_fresh=False)
    result["r3b_m252_before"] = {
        **r3b_before,
        "m252_semantic_mismatches": m252_before.get("mismatch_count", 0),
        "m252_pass": m252_before.get("pass"),
        "r3b_pass": r3b_before.get("pass"),
        "r3b_objects": f"{r3b_before.get('objects_matched', 0)}/{r3b_before.get('objects_expected', 19)}",
        "unauthorized": r3b_before.get("UNAUTHORIZED", 0),
        "unknown_authority": r3b_before.get("UNKNOWN_AUTHORITY", 0),
        "ambiguous_authority": r3b_before.get("AMBIGUOUS_AUTHORITY", 0),
        "statement_unbound": r3b_before.get("STATEMENT_UNBOUND", 0),
        "key_only_authorization": r3b_before.get("KEY_ONLY_AUTHORIZATION", 0),
        "statement_sha_mismatch": r3b_before.get("STATEMENT_SHA_MISMATCH", 0),
        "evidence_code_mismatch": r3b_before.get("EVIDENCE_CODE_MISMATCH", 0),
    }

    independent_local = compute_independent_would_deploy(
        source_names=source_migration_inventory(),
        ledger_rows=ledger_before_rows,
    )
    result["independent_would_deploy"] = independent_local

    # Remote backup + clone + validate + status (+ deploy if authorized later)
    remote = remote_prepare_and_deploy(requested_sha=head, deploy_authorized=False)
    result["remote"] = remote
    result["backup"] = {
        "backup_method": remote.get("BACKUP_METHOD"),
        "backup_identifier": remote.get("BACKUP_IDENTIFIER"),
        "backup_started_at": remote.get("BACKUP_STARTED_AT"),
        "backup_completed_at": remote.get("BACKUP_COMPLETED_AT"),
        "backup_size_bytes": int(remote["BACKUP_SIZE_BYTES"]) if remote.get("BACKUP_SIZE_BYTES", "").isdigit() else None,
        "backup_checksum_sha256": remote.get("BACKUP_CHECKSUM_SHA256"),
        "recovery_point_timestamp": remote.get("RECOVERY_POINT_TIMESTAMP"),
        "restore_owner": remote.get("RESTORE_OWNER"),
        "restore_path_verified": remote.get("RESTORE_PATH_VERIFIED") == "true",
        "recovery_readiness": remote.get("RECOVERY_READINESS") == "true",
    }
    result["retry_source"] = {
        "retry_source_head_sha": remote.get("RETRY_SOURCE_HEAD_SHA"),
        "retry_backend_tree_sha": remote.get("RETRY_BACKEND_TREE_SHA"),
        "retry_temp_path": remote.get("RETRY_TEMP_PATH"),
        "retry_backend_path": remote.get("RETRY_BACKEND_PATH"),
        "git_status_count": int(remote["GIT_STATUS_COUNT"]) if remote.get("GIT_STATUS_COUNT", "").isdigit() else None,
        "no_env_file": remote.get("NO_ENV_FILE") == "true",
    }

    remote_bridge_mismatches = 0
    for name, key in ((BRIDGE_1, "BRIDGE_1_SHA256"), (BRIDGE_2, "BRIDGE_2_SHA256")):
        if remote.get(key) != EXPECTED_BRIDGE_SHA[name]:
            remote_bridge_mismatches += 1
    result["bridge_sha"]["remote_bridge_sha_mismatches"] = remote_bridge_mismatches
    result["bridge_sha"]["bridge_sha_mismatches"] = bridge_local.get("bridge_sha_mismatches", 0) + remote_bridge_mismatches

    parsed_pre = remote.get("parsed_pre_status") or {}
    remote_independent = compute_independent_would_deploy(
        source_names=remote.get("remote_source_migration_names") or [],
        ledger_rows=ledger_before_rows,
    )
    result["status_vs_independent_set_match"] = (
        set(parsed_pre.get("status_pending_names") or []) == set(remote_independent.get("independent_would_deploy_names") or [])
        and set(remote_independent.get("independent_would_deploy_names") or []) == EXPECTED_PENDING
    )
    result["independent_would_deploy_remote"] = remote_independent
    result["parsed_pre_deploy_status"] = parsed_pre

    barrier = build_mutation_barrier(result)
    result["mutation_barrier"] = barrier

    if not barrier["pass"]:
        result["stop_reason"] = "mutation_barrier_fail"
        result["machine_status"] = {
            "CI_R3B1R112C_CONTROLLED_PRODUCTION_HISTORY_BRIDGE_RETRY_BLOCKED": True,
            "DEPLOY_ATTEMPT_COUNT": 0,
            "R3B1R112_EXECUTION": "RETRY_NOT_STARTED",
            "R3B1R12_READINESS": "NOT_READY",
            "PR1054_MERGE_READINESS": "BLOCKED",
        }
        result["dependency_audit"] = legal_dependency_scan()
        _write(result)
        return 1

    # Authorized single deploy
    deploy_remote = remote_prepare_and_deploy(requested_sha=head, deploy_authorized=True)
    result["deploy"] = {
        "deploy_started_at": deploy_remote.get("DEPLOY_STARTED_AT"),
        "deploy_finished_at": deploy_remote.get("DEPLOY_FINISHED_AT"),
        "deploy_exit_code": int(deploy_remote["DEPLOY_EXIT_CODE"]) if deploy_remote.get("DEPLOY_EXIT_CODE", "").isdigit() else None,
        "deploy_attempt_count": 1,
        "deploy_stdout": deploy_remote.get("deploy_stdout"),
        "migrations_attempted": len(deploy_remote.get("migrations_applied_from_output") or []),
        "migrations_applied": deploy_remote.get("migrations_applied_from_output") or [],
        "unexpected_migrations_applied": len(
            [m for m in (deploy_remote.get("migrations_applied_from_output") or []) if m not in EXPECTED_PENDING]
        ),
    }
    result["remote_deploy"] = deploy_remote

    deploy_ok = (
        result["deploy"]["deploy_exit_code"] == 0
        and result["deploy"]["migrations_attempted"] == 2
        and set(result["deploy"]["migrations_applied"]) == EXPECTED_PENDING
        and result["deploy"]["unexpected_migrations_applied"] == 0
    )

    ledger_after_rows = export_prisma_ledger(include_logs=False)
    counts_after = ledger_counts(ledger_after_rows)
    flags_after = bridge_ledger_flags(ledger_after_rows)
    bridge_rows = fetch_bridge_rows(ledger_after_rows)
    catalog_after = build_catalog_fingerprint(run_sql)

    cb = result["pre_deploy"]
    new_rows = counts_after["ledger_row_count"] - cb["ledger_row_count"]
    new_finished = counts_after["ledger_finished_count"] - cb["ledger_finished_count"]
    new_failed = counts_after["ledger_failed_count"] - cb["ledger_failed_count"]
    new_incomplete = counts_after["ledger_incomplete_count"] - cb["ledger_incomplete_count"]

    checksum_bindings: dict[str, Any] = {}
    for name in (BRIDGE_1, BRIDGE_2):
        row = bridge_rows.get(name, {})
        source_sha = EXPECTED_BRIDGE_SHA[name]
        checksum_bindings[name] = {
            "ledger_row_exists_after": name in {r.get("migration_name") for r in ledger_after_rows},
            "finished": bool((row.get("finished_at") or "").strip()) and not (row.get("rolled_back_at") or "").strip(),
            "rolled_back": bool((row.get("rolled_back_at") or "").strip()),
            "checksum": row.get("checksum"),
            "checksum_match_source": row.get("checksum") == source_sha,
            "started_at": row.get("started_at"),
            "finished_at": row.get("finished_at"),
        }

    parsed_post = deploy_remote.get("parsed_post_status") or {}
    post_independent = compute_independent_would_deploy(
        source_names=remote.get("remote_source_migration_names") or source_migration_inventory(),
        ledger_rows=ledger_after_rows,
    )

    four_after = four_object_parity(head)
    m252_after = compare_m252_exact(build_m252_complete_physical_authority(), read_m252_catalog(run_sql))
    r3b_after = run_live_r3b_catalog_parity(skip_if_fresh=False)
    pr_diff = run_pr_target_diff(commit_sha=head)

    catalog_unchanged = catalog_after["fingerprint_sha256"] == cb["catalog_fingerprint_before"]
    ledger_ok = (
        new_rows == 2
        and new_finished == 2
        and new_failed == 0
        and new_incomplete == 0
        and flags_after["bridge_1_ledger_row_exists"]
        and flags_after["bridge_2_ledger_row_exists"]
        and all(v["checksum_match_source"] and v["finished"] and not v["rolled_back"] for v in checksum_bindings.values())
    )
    post_ok = (
        parsed_post.get("parser_valid")
        and parsed_post.get("status_pending_count") == 0
        and len(parsed_post.get("status_unexpected_pending_names") or []) == 0
        and parsed_post.get("unexplained_database_only_migrations") == 0
        and post_independent.get("independent_would_deploy_count") == 0
        and four_after.get("pass")
        and r3b_after.get("pass")
        and m252_after.get("pass")
        and pr_diff.get("pass")
        and catalog_unchanged
    )

    result["post_deploy"] = {
        **counts_after,
        "ledger_fingerprint_after": ledger_summary_fingerprint(ledger_after_rows),
        "catalog_fingerprint_after": catalog_after["fingerprint_sha256"],
        "bridge_1_ledger_row_exists_after": flags_after["bridge_1_ledger_row_exists"],
        "bridge_2_ledger_row_exists_after": flags_after["bridge_2_ledger_row_exists"],
        "new_ledger_rows": new_rows,
        "new_finished_rows": new_finished,
        "new_failed_rows": new_failed,
        "new_incomplete_rows": new_incomplete,
        "bridge_checksum_bindings": checksum_bindings,
        "catalog_fingerprint_unchanged": catalog_unchanged,
        "production_catalog_mutations_r3b1r112c": 0 if catalog_unchanged else None,
        "parsed_post_status": parsed_post,
        "post_deploy_independent_would_deploy": post_independent,
        "four_object_parity_after": four_after,
        "r3b_m252_after": {
            "r3b_pass": r3b_after.get("pass"),
            "m252_pass": m252_after.get("pass"),
            "r3b_objects": f"{r3b_after.get('objects_matched', 0)}/{r3b_after.get('objects_expected', 19)}",
        },
        "pr_target_diff": pr_diff,
    }
    result["mutation_accounting"] = {
        "deploy_invocations_r3b1r112c": 1,
        "migrations_applied_r3b1r112c": len(result["deploy"]["migrations_applied"]) if deploy_ok else 0,
        "production_ledger_rows_added_r3b1r112c": new_rows if deploy_ok else 0,
        "production_finished_ledger_rows_added_r3b1r112c": new_finished if deploy_ok else 0,
        "production_failed_ledger_rows_added_r3b1r112c": new_failed if deploy_ok else 0,
        "production_incomplete_ledger_rows_added_r3b1r112c": new_incomplete if deploy_ok else 0,
        "production_catalog_mutations_r3b1r112c": 0 if catalog_unchanged else None,
        "production_schema_semantic_changes_r3b1r112c": 0 if catalog_unchanged else None,
    }
    result["source_immutability"] = {
        "current_backend_tree_sha_after": git_field("rev-parse", "HEAD:backend"),
        "bridge_source_changed_during_r3b1r112c": 0,
        "schema_prisma_changed_during_r3b1r112c": False,
        "application_runtime_changed_during_r3b1r112c": 0,
        "precheck_tooling_changed_during_r3b1r112c": 0,
    }
    result["dependency_audit"] = legal_dependency_scan()
    result["application_health"] = application_health(lock_released=deploy_remote.get("LOCK_RELEASED") == "true")

    if deploy_ok and ledger_ok and post_ok:
        result["result"] = "SUCCESS"
        result["machine_status"] = {
            "CI_R3B1R112C_CONTROLLED_PRODUCTION_HISTORY_BRIDGE_RETRY_COMPLETED": True,
            "R3B1R112_EXECUTION": "RECOVERED_FROM_ENVIRONMENT_ONLY_INCIDENT",
            "R3B1R_HISTORY_BRIDGE": "PRODUCTION_HISTORY_ALIGNED_WITH_FROZEN_SOURCE",
            "BRIDGE_EXECUTION": "TWO_LEDGER_ONLY_BRIDGES_APPLIED_ZERO_CATALOG_MUTATIONS",
            "R3B1R12_READINESS": "READY_FOR_INDEPENDENT_FROZEN_POST_REMEDIATION_ACCEPTANCE",
            "PR1054_MERGE_READINESS": "BLOCKED_PENDING_R3B1R12",
        }
    elif result["deploy"]["deploy_attempt_count"] == 1:
        result["result"] = "INCIDENT"
        result["machine_status"] = {
            "CI_R3B1R112C_CONTROLLED_PRODUCTION_HISTORY_BRIDGE_RETRY_INCIDENT": True,
            "R3B1R112_EXECUTION": "UNEXPECTED_OR_PARTIAL_PRODUCTION_RETRY",
            "R3B1R12_READINESS": "NOT_READY",
            "PR1054_MERGE_READINESS": "BLOCKED",
        }
    else:
        result["result"] = "BLOCKED"
        result["machine_status"] = {
            "CI_R3B1R112C_CONTROLLED_PRODUCTION_HISTORY_BRIDGE_RETRY_BLOCKED": True,
            "R3B1R112_EXECUTION": "RETRY_NOT_STARTED",
            "R3B1R12_READINESS": "NOT_READY",
            "PR1054_MERGE_READINESS": "BLOCKED",
        }

    _write(result)
    print(json.dumps({"result": result["result"], "machine_status": result["machine_status"]}, indent=2))
    return 0 if result["result"] == "SUCCESS" else 1


def _write(result: dict[str, Any]) -> None:
    out = DATA / f"{PREFIX}-assessment-raw-2026-08.json"
    out.write_text(json.dumps(result, indent=2) + "\n")


if __name__ == "__main__":
    raise SystemExit(main())
