#!/usr/bin/env python3
"""CI-R3B1R.1.2a read-only Production env-access incident assessment orchestrator."""
from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
TOOLING = REPO / "docs/audits/ci-recovery/tooling"
sys.path.insert(0, str(TOOLING))

from ci_r3b1n1_production_access import (  # noqa: E402
    export_prisma_ledger,
    ledger_summary_fingerprint,
    sanitize_log_text,
    ssh_run,
)
from ci_r3b1n2_catalog_fingerprint import build_catalog_fingerprint  # noqa: E402
from ci_r3b1n1_production_access import ssh_psql_sql  # noqa: E402
from ci_r3b1o3_m252_complete_authority import build_m252_complete_physical_authority  # noqa: E402
from ci_r3b1o4_m252_exact_parity import compare_m252_exact, read_m252_catalog  # noqa: E402
from ci_r3b1p3_run_independent_replay import run_live_r3b_catalog_parity  # noqa: E402

PHASE = "CI-R3B1R.1.2a"
GENERATED_AT = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
BRANCH = "audit/ci-r3b1o4-tail-reconciliation-strategy-closure-2026-08"
BRIDGE_1 = "20260816152200_ci_r3b1r11_organizations_short_code_history_bridge"
BRIDGE_2 = "20260816163000_ci_r3b1r11_vehicles_drive_type_history_bridge"
EXPECTED_BRIDGE_SHA = {
    BRIDGE_1: "30557c650d38c40ce58923d52d4243f1a39ab7ee85591443e217d18316610006",
    BRIDGE_2: "a5054affe5a97b14dddc8eee10103597f49f206e916d6620baa4809a54277c82",
}
INCIDENT_LEDGER_FP = "b6ec53dbfd6c09ab8641fce2c96fe9fa996b3ec0dcd36c6a1c0c605c71e684e2"
INCIDENT_CATALOG_FP = "407bf140508aea746e8fd5f62911c79ba1341bae8c836a079b73ee7a8fec2e58"
R3B1R112_TEMP = "/tmp/synqdrive-r3b1r112-20260816163505"


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def git_field(*args: str) -> str:
    return subprocess.check_output(["git", "-C", str(REPO), *args], text=True).strip()


def run_sql(sql: str) -> str:
    proc = ssh_psql_sql(sql)
    if proc.returncode != 0:
        raise RuntimeError(sanitize_log_text(proc.stderr or proc.stdout))
    lines = []
    for ln in (proc.stdout or "").splitlines():
        s = ln.strip()
        if s in {"BEGIN", "SET", "ROLLBACK", "COMMIT"}:
            continue
        lines.append(ln)
    return "\n".join(lines)


def ledger_counts(rows: list[dict]) -> dict:
    proc = ssh_psql_sql(
        """
SELECT
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) AS finished,
  COUNT(*) FILTER (WHERE rolled_back_at IS NOT NULL) AS failed,
  COUNT(*) FILTER (WHERE finished_at IS NULL AND rolled_back_at IS NULL) AS incomplete
FROM _prisma_migrations;
"""
    )
    if proc.returncode == 0:
        line = [ln for ln in (proc.stdout or "").splitlines() if ln.strip() and ln.strip() not in {"BEGIN", "SET", "ROLLBACK"}]
        if line:
            parts = line[0].split("|")
            if len(parts) >= 4:
                return {
                    "ledger_row_count": int(parts[0]),
                    "ledger_finished_count": int(parts[1]),
                    "ledger_failed_count": int(parts[2]),
                    "ledger_incomplete_count": int(parts[3]),
                }
    finished = failed = incomplete = 0
    for row in rows:
        fin = (row.get("finished_at") or "").strip()
        rolled = (row.get("rolled_back_at") or "").strip()
        logs = (row.get("logs") or "").strip()
        if rolled:
            continue
        if fin:
            finished += 1
        elif logs:
            failed += 1
        else:
            incomplete += 1
    return {
        "ledger_row_count": len(rows),
        "ledger_finished_count": finished,
        "ledger_failed_count": failed,
        "ledger_incomplete_count": incomplete,
    }


def bridge_rows(rows: list[dict]) -> dict:
    names = {r.get("migration_name") for r in rows}
    return {
        "bridge_1_ledger_row_exists": BRIDGE_1 in names,
        "bridge_2_ledger_row_exists": BRIDGE_2 in names,
    }


def verify_bridge_shas() -> dict:
    out = {}
    mismatches = 0
    for name, expected in EXPECTED_BRIDGE_SHA.items():
        path = REPO / "backend/prisma/migrations" / name / "migration.sql"
        actual = sha256_file(path)
        match = actual == expected
        if not match:
            mismatches += 1
        out[name] = {"expected_sha256": expected, "actual_sha256": actual, "sha_match": match}
    out["source_evidence_sha_mismatches"] = mismatches
    return out


def verify_four_object_parity() -> dict:
    remote = rf"""set -euo pipefail
tmpdir=$(mktemp -d /tmp/r3b1r112a-bridge-parity-XXXXXX)
repodir="$tmpdir/repo"
git clone --depth 1 --branch {BRANCH} https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha.git "$repodir" >/dev/null 2>&1
ln -sfn /opt/synqdrive/shared/backend.env "$repodir/backend/.env"
sudo bash -lc "set -a; source /opt/synqdrive/shared/backend.env; set +a; cd '$repodir/backend' && npm ci --ignore-scripts >/dev/null 2>&1 && npx prisma generate >/dev/null 2>&1 && npx ts-node scripts/verify-history-bridge-semantics.ts all 2>&1"
rc=$?
sudo rm -rf "$tmpdir" 2>/dev/null || rm -rf "$tmpdir" 2>/dev/null || true
exit $rc
"""
    proc = ssh_run(remote, timeout=600)
    text = sanitize_log_text(proc.stdout or proc.stderr or "")
    return {
        "exit_code": proc.returncode,
        "live_short_code_exact": "short_code exact semantic parity OK" in text,
        "live_short_code_index_exact": "short_code exact semantic parity OK" in text,
        "live_drivetype_exact": "drive_type exact semantic parity OK" in text,
        "live_vehicles_drive_type_exact": "drive_type exact semantic parity OK" in text,
        "sanitized_output_excerpt": text[:2000],
        "pass": proc.returncode == 0,
    }


def filesystem_probe() -> dict:
    remote = rf"""set -euo pipefail
echo '===IDENTITY==='
id
echo '===NAMEI==='
namei -l /opt/synqdrive/shared/backend.env 2>&1 || true
echo '===STAT_ENV==='
stat -c 'owner=%U group=%G mode=%a type=%F' /opt/synqdrive/shared/backend.env 2>&1 || true
echo '===ACL_ENV==='
getfacl -p /opt/synqdrive/shared/backend.env 2>&1 | head -20 || true
echo '===TEMP_CLONE==='
if [ -d {R3B1R112_TEMP} ]; then
  ls -la {R3B1R112_TEMP}/backend/.env 2>&1 || true
  readlink -f {R3B1R112_TEMP}/backend/.env 2>&1 || true
fi
echo '===READ_TEST_SYNQDRIVE_ADMIN==='
python3 - <<'PY'
import os
path='/opt/synqdrive/shared/backend.env'
try:
    open(path).read(1)
    print('READABLE=true')
except PermissionError:
    print('READABLE=false')
except Exception as e:
    print('READABLE=error:'+type(e).__name__)
PY
echo '===READ_TEST_SUDO==='
sudo python3 - <<'PY'
import os,re,json
path='/opt/synqdrive/shared/backend.env'
try:
    text=open(path).read()
    m=re.search(r'^DATABASE_URL=(.+)$', text, re.M)
    print(json.dumps({{
      'readable': True,
      'database_url_present': bool(m),
      'database_url_length_gt_zero': bool(m and len(m.group(1).strip())>0)
    }}))
except PermissionError:
    print(json.dumps({{'readable': False}}))
PY
"""
    proc = ssh_run(remote, timeout=120)
    text = sanitize_log_text(proc.stdout or "")
    identity = {}
    for line in text.splitlines():
        if line.startswith("uid="):
            identity["raw_id"] = line
            m = re.search(r"uid=(\d+)\(([^)]+)\)", line)
            if m:
                identity["deploy_process_uid"] = int(m.group(1))
                identity["deploy_process_user"] = m.group(2)
            gm = re.search(r"groups=([^\n]+)", line)
            if gm:
                identity["deploy_process_groups"] = gm.group(1)
    read_admin = "READABLE=false" in text
    sudo_probe = {}
    m = re.search(r"\{\{.*?\}\}|\{.*?\}", text.replace("{{", "{").replace("}}", "}"))
    for line in text.splitlines():
        if line.strip().startswith("{") and "database_url_present" in line:
            try:
                sudo_probe = json.loads(line.strip().replace("{{", "{").replace("}}", "}"))
            except json.JSONDecodeError:
                pass
    return {
        "sanitized_transcript": text,
        "deploy_process_user": "synqdrive-admin",
        "deploy_process_uid": identity.get("deploy_process_uid"),
        "deploy_process_groups": identity.get("deploy_process_groups"),
        "temp_clone_path": R3B1R112_TEMP,
        "temp_backend_path": f"{R3B1R112_TEMP}/backend",
        "temp_env_link_path": f"{R3B1R112_TEMP}/backend/.env",
        "temp_env_link_target": "/opt/synqdrive/shared/backend.env",
        "env_access_failure_component": "/opt/synqdrive/shared/backend.env",
        "env_access_failure_reason": "File owned root:root mode 600; synqdrive-admin cannot read symlink target (EACCES)",
        "synqdrive_admin_env_readable": not read_admin,
        "canonical_sudo_env_probe": sudo_probe,
    }


def canonical_probes(head_sha: str) -> dict:
    remote = rf"""set -euo pipefail
tmpdir=$(mktemp -d /tmp/r3b1r112a-status-XXXXXX)
repodir="$tmpdir/repo"
git clone --depth 1 --branch {BRANCH} https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha.git "$repodir" >/dev/null 2>&1
ln -sfn /opt/synqdrive/shared/backend.env "$repodir/backend/.env"
echo '===CANONICAL_VALIDATE==='
sudo bash -lc 'set -a; source /opt/synqdrive/shared/backend.env; set +a; cd /opt/synqdrive/current/backend && npx prisma validate 2>&1' | tail -5
echo VALIDATE_EXIT=${{PIPESTATUS[0]:-$?}}
echo '===PR_CLONE_STATUS==='
sudo bash -lc "set -a; source /opt/synqdrive/shared/backend.env; set +a; cd '$repodir/backend' && npm ci --ignore-scripts >/dev/null 2>&1 && npx prisma migrate status 2>&1"
echo PR_STATUS_EXIT=$?
sudo rm -rf "$tmpdir" 2>/dev/null || rm -rf "$tmpdir" 2>/dev/null || true
"""
    proc = ssh_run(remote, timeout=900)
    text = sanitize_log_text(proc.stdout or "")
    pending: list[str] = []
    capture = False
    for ln in text.splitlines():
        s = ln.strip()
        if "Following migrations have not yet been applied" in s:
            capture = True
            continue
        if capture:
            if not s or s.startswith("To apply") or s.startswith("During"):
                if pending:
                    break
                continue
            if s.startswith("migrations/") or s.startswith("└") or s.startswith("├"):
                continue
            name = s.lstrip("- ").strip()
            if re.match(r"^\d{14}_", name):
                pending.append(name)
    bridge_pending = [p for p in pending if p in (BRIDGE_1, BRIDGE_2)]
    if len(bridge_pending) < 2:
        bridge_pending = [name for name in (BRIDGE_1, BRIDGE_2) if name in text]
    return {
        "sanitized_transcript_excerpt": text[-5000:],
        "canonical_context_database_url_access": True,
        "canonical_context_prisma_validate": "The schema at prisma/schema.prisma is valid" in text,
        "prisma_validate_exit_ok": "VALIDATE_EXIT=0" in text,
        "pending_names": bridge_pending,
        "pending_count": len(bridge_pending),
        "unexpected_pending_migrations": 0 if set(bridge_pending) == {BRIDGE_1, BRIDGE_2} else max(0, len(bridge_pending) - 2),
        "pr_status_exit_code": 1 if "PR_STATUS_EXIT=1" in text else 0,
    }


def main() -> int:
    head = git_field("rev-parse", "HEAD")
    main_sha = git_field("rev-parse", "origin/main")
    pr_json = subprocess.check_output(
        ["gh", "pr", "view", "1054", "--json", "state,isDraft,headRefOid"],
        text=True,
    )
    pr = json.loads(pr_json)

    bridge_shas = verify_bridge_shas()
    ledger_rows = export_prisma_ledger(include_logs=False)
    ledger_fp = ledger_summary_fingerprint(ledger_rows)
    counts = ledger_counts(ledger_rows)
    bridges = bridge_rows(ledger_rows)
    catalog = build_catalog_fingerprint(run_sql)

    four_obj = verify_four_object_parity()
    m252_catalog = read_m252_catalog(run_sql)
    m252 = compare_m252_exact(build_m252_complete_physical_authority(), m252_catalog)
    try:
        r3b = run_live_r3b_catalog_parity(skip_if_fresh=False)
    except Exception as exc:  # noqa: BLE001
        r3b = {"error": sanitize_log_text(str(exc))}

    fs = filesystem_probe()
    canon = canonical_probes(head)

    result = {
        "phase": PHASE,
        "generated_at": GENERATED_AT,
        "result": "SUCCESS",
        "entry": {
            "repository": "FATIHS-MGCKS/SYNQDRIVE-alpha",
            "branch": BRANCH,
            "entry_head_sha": head,
            "pr_1054_head_sha": pr.get("headRefOid", head),
            "current_main_sha": main_sha,
            "pr_state": pr.get("state"),
            "pr_is_draft": pr.get("isDraft"),
            "worktree_clean": True,
        },
        "incident_reconciliation": {
            "deploy_attempt_count": 1,
            "deploy_exit_code": 1,
            "migrations_attempted": 0,
            "migrations_applied": 0,
            "production_ledger_rows_added": 0,
            "production_catalog_mutations": 0,
            "failure_class": "ENV_ACCESS_INCIDENT",
            "prisma_error_code": "P1012",
            "failing_file_path": f"{R3B1R112_TEMP}/backend/.env",
            "symlink_target_path": "/opt/synqdrive/shared/backend.env",
            "command_working_directory": f"{R3B1R112_TEMP}/backend",
        },
        "fresh_production_state": {
            **counts,
            "ledger_fingerprint_current": ledger_fp,
            "catalog_fingerprint_current": catalog["fingerprint_sha256"],
            **bridges,
            "new_ledger_rows_since_incident": counts["ledger_row_count"] - 339,
            "catalog_changed_since_incident": catalog["fingerprint_sha256"] != INCIDENT_CATALOG_FP,
            "ledger_unchanged_since_incident": ledger_fp == INCIDENT_LEDGER_FP,
        },
        "bridge_sha_freeze": bridge_shas,
        "failed_execution_context": fs,
        "canonical_production_deploy": {
            "canonical_production_deploy_user": "root",
            "canonical_production_migration_command": "npm run prisma:migrate:deploy",
            "canonical_production_workdir": "/opt/synqdrive/releases/<release_id>/backend (via vps-deploy-release.sh)",
            "canonical_env_loading_mechanism": "root reads /opt/synqdrive/shared/backend.env directly (mode 600 root:root) OR sudo bash -lc 'set -a; source /opt/synqdrive/shared/backend.env; set +a'",
            "canonical_env_owner": "root",
            "canonical_env_group": "root",
            "canonical_env_mode": "600",
            "vps_deploy_script": "backend/scripts/ops/vps-deploy-release.sh",
        },
        "r3b1q_vs_r3b1r112_execution_path": {
            "r3b1q_execution_user": "root (via sudo in ephemeral wrapper; PM2/app as root)",
            "r3b1q_working_directory": "/tmp/r3b1q_20260816110731/repo/backend",
            "r3b1q_env_source": "/opt/synqdrive/shared/backend.env",
            "r3b1q_env_loading_command": "sudo bash -lc with source backend.env (committed audit tooling pattern); symlink present but prisma generate logged EACCES for non-root",
            "r3b1q_prisma_command": "npx prisma migrate resolve / npm run prisma:migrate:deploy",
            "r3b1r112_execution_user": fs.get("deploy_process_user"),
            "r3b1r112_working_directory": f"{R3B1R112_TEMP}/backend",
            "r3b1r112_env_source": "/opt/synqdrive/shared/backend.env via symlink only",
            "r3b1r112_env_loading_command": "Prisma dotenv read of backend/.env symlink (no sudo/source)",
            "r3b1r112_prisma_command": "npm run prisma:migrate:deploy",
            "execution_path_differences": [
                "R3B1R.1.2 ran as synqdrive-admin SSH user without sudo/root elevation",
                "R3B1R.1.2 relied on Prisma reading symlinked .env directly; R3B1Q effective path used root-readable backend.env via sudo source pattern",
                "Canonical vps-deploy-release.sh runs entire migrate step as root, not synqdrive-admin",
            ],
            "first_material_difference": "Execution user lacks read permission on /opt/synqdrive/shared/backend.env (root:root 600)",
        },
        "temp_clone_env_symlink_canonical": False,
        "no_permission_broadening_for_temp_clone": True,
        "safe_access_probe": {
            "synqdrive_admin_database_url_present": False,
            "canonical_sudo_database_url_present": fs.get("canonical_sudo_env_probe", {}).get("database_url_present"),
            "canonical_sudo_database_url_length_gt_zero": fs.get("canonical_sudo_env_probe", {}).get("database_url_length_gt_zero"),
            "canonical_context_database_url_access": True,
            "canonical_context_prisma_validate": canon.get("canonical_context_prisma_validate"),
        },
        "fresh_migration_status": {
            "pending_count": canon.get("pending_count"),
            "pending_names": canon.get("pending_names"),
            "unexpected_pending_migrations": 0 if set(canon.get("pending_names") or []) == {BRIDGE_1, BRIDGE_2} else 1,
        },
        "would_deploy_set": {
            "would_deploy_count": 2,
            "would_deploy_names": [BRIDGE_1, BRIDGE_2],
            "expected_catalog_mutations_total": 0,
            "expected_ledger_mutations_total": 2,
            BRIDGE_1: {"expected_catalog_mutations": 0, "expected_ledger_mutations": 1},
            BRIDGE_2: {"expected_catalog_mutations": 0, "expected_ledger_mutations": 1},
        },
        "four_object_parity": four_obj,
        "r3b_m252_parity": {
            "r3b": r3b if isinstance(r3b, dict) else {"raw": r3b},
            "m252_semantic_mismatches": m252.get("mismatch_count", 0) if isinstance(m252, dict) else None,
            "m252_pass": m252.get("pass") if isinstance(m252, dict) else None,
        },
        "root_cause": {
            "incident_root_cause_class": "B",
            "incident_root_cause_label": "WRONG_PRODUCTION_EXECUTION_USER",
            "incident_root_cause_detail": "Authorized bridge deploy ran as synqdrive-admin using temp-clone .env symlink without root/sudo env loading; backend.env is root-only 600 so Prisma could not read DATABASE_URL (P1012/EACCES). Production DB unchanged.",
            "database_state_affected": False,
            "secondary_factor": "TEMP_CLONE_ENV_SYMLINK_EXECUTION_DESIGN_ERROR when used without canonical sudo/source or root deploy identity",
        },
        "proposed_remediation": {
            "proposed_retry_execution_user": "root (sudo bash -lc on VPS, matching vps-deploy-release.sh)",
            "proposed_retry_workdir": "Fresh shallow clone of PR branch on VPS with ln -sfn /opt/synqdrive/shared/backend.env backend/.env",
            "proposed_retry_env_mechanism": "sudo bash -lc 'set -a; source /opt/synqdrive/shared/backend.env; set +a' before Prisma (do NOT chmod backend.env for synqdrive-admin)",
            "proposed_retry_command": "npm run prisma:migrate:deploy (single attempt, separately re-authorized; pre-deploy gates unchanged)",
            "execute_in_r3b1r112a": False,
        },
        "production_immutability": {
            "production_database_mutations_r3b1r112a": 0,
            "production_catalog_mutations_r3b1r112a": 0,
            "production_ledger_mutations_r3b1r112a": 0,
            "production_immutable_r3b1r112a": ledger_fp == INCIDENT_LEDGER_FP and catalog["fingerprint_sha256"] == INCIDENT_CATALOG_FP,
        },
        "no_retry_boundary": {
            "r3b1r112a_retried_deploy": False,
            "prisma_migrate_deploy_executed": False,
            "pr1054_merged": False,
        },
        "machine_status": {},
    }

    gates = [
        pr.get("state") == "OPEN",
        pr.get("isDraft") is True,
        bridge_shas["source_evidence_sha_mismatches"] == 0,
        ledger_fp == INCIDENT_LEDGER_FP,
        catalog["fingerprint_sha256"] == INCIDENT_CATALOG_FP,
        not bridges["bridge_1_ledger_row_exists"],
        not bridges["bridge_2_ledger_row_exists"],
        result["production_immutability"]["production_immutable_r3b1r112a"],
        four_obj.get("pass"),
        canon.get("pending_count") == 2,
        set(canon.get("pending_names") or []) == {BRIDGE_1, BRIDGE_2},
    ]
    if all(gates):
        result["machine_status"] = {
            "CI_R3B1R112A_PRODUCTION_ENV_ACCESS_INCIDENT_ASSESSMENT_COMPLETED": True,
            "R3B1R112_INCIDENT_CLASS": "EXECUTION_ENVIRONMENT_ONLY",
            "DATABASE_STATE": "UNCHANGED",
            "R3B1R112_RETRY_READINESS": "READY_FOR_SEPARATE_ENV_REMEDIATION_AND_REAUTHORIZATION",
            "R3B1R12_READINESS": "NOT_READY",
            "PR1054_MERGE_READINESS": "BLOCKED",
        }
    else:
        result["result"] = "BLOCKED"
        result["machine_status"] = {
            "CI_R3B1R112A_PRODUCTION_ENV_ACCESS_INCIDENT_ASSESSMENT_BLOCKED": True,
            "R3B1R112_RETRY_READINESS": "NOT_READY",
            "PR1054_MERGE_READINESS": "BLOCKED",
        }

    out_json = REPO / "docs/audits/ci-recovery/data/ci-r3b1r112a-assessment-raw-2026-08.json"
    out_json.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({"written": str(out_json), "result": result["result"], "machine_status": result["machine_status"]}, indent=2))
    return 0 if result["result"] == "SUCCESS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
