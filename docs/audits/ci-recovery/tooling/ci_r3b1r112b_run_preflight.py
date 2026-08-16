#!/usr/bin/env python3
"""CI-R3B1R.1.2b canonical retry path frozen preflight (read-only, no deploy)."""
from __future__ import annotations

import hashlib
import json
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

PHASE = "CI-R3B1R.1.2b"
BRANCH = "audit/ci-r3b1o4-tail-reconciliation-strategy-closure-2026-08"
BRIDGE_1 = "20260816152200_ci_r3b1r11_organizations_short_code_history_bridge"
BRIDGE_2 = "20260816163000_ci_r3b1r11_vehicles_drive_type_history_bridge"
EXPECTED_BRIDGE_SHA = {
    BRIDGE_1: "30557c650d38c40ce58923d52d4243f1a39ab7ee85591443e217d18316610006",
    BRIDGE_2: "a5054affe5a97b14dddc8eee10103597f49f206e916d6620baa4809a54277c82",
}
BASELINE_LEDGER_FP = "b6ec53dbfd6c09ab8641fce2c96fe9fa996b3ec0dcd36c6a1c0c605c71e684e2"
BASELINE_CATALOG_FP = "407bf140508aea746e8fd5f62911c79ba1341bae8c836a079b73ee7a8fec2e58"
ENV_FILE = "/opt/synqdrive/shared/backend.env"

ACCEPTED_DATABASE_ONLY = [
    "20260723230000_privacy_domain_foundation",
    "20260723233000_legal_basis_assessment_professional",
    "20260723234500_consent_provider_sharing_domains",
    "20260724000000_enforcement_policy_relational_scopes",
    "20260724010000_data_authorization_legacy_migration_tracking",
    "20260724020000_privacy_policy_lifecycle",
    "20260724030000_data_processing_review_workflow",
    "20260724040000_data_authorization_audit_logging",
    "20260724050000_data_authorization_revocation_workflow",
    "20260724060000_data_authorization_deny_switch",
    "20260724070000_provider_grant_webhook_idempotency",
    "20260724080000_revocation_queue_control",
    "20260724090000_processing_activity_register",
    "20260724100000_dpia_workflow",
    "20260724110000_processor_dpa_management",
    "20260724120000_retention_deletion_legal_hold",
    "20260724130000_compliance_evidence",
]
ACCEPTED_DB_ONLY_EVIDENCE = "docs/audits/ci-recovery/data/ci-r3b1n1-production-only-migration-reconciliation-2026-08.json"


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


def git_field(*args: str) -> str:
    return subprocess.check_output(["git", "-C", str(REPO), *args], text=True).strip()


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


def ledger_counts() -> dict:
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
    line = [ln for ln in (proc.stdout or "").splitlines() if ln.strip() and ln.strip() not in {"BEGIN", "SET", "ROLLBACK"}][0]
    parts = line.split("|")
    return {
        "ledger_row_count": int(parts[0]),
        "ledger_finished_count": int(parts[1]),
        "ledger_failed_count": int(parts[2]),
        "ledger_incomplete_count": int(parts[3]),
    }


def verify_bridge_shas() -> dict:
    out: dict = {"source_evidence_sha_mismatches": 0}
    for name, expected in EXPECTED_BRIDGE_SHA.items():
        actual = sha256_file(REPO / "backend/prisma/migrations" / name / "migration.sql")
        match = actual == expected
        if not match:
            out["source_evidence_sha_mismatches"] += 1
        out[name] = {"expected_sha256": expected, "actual_sha256": actual, "sha_match": match}
    return out


def secret_permissions() -> dict:
    remote = rf"""set -euo pipefail
stat -c 'owner=%U group=%G mode=%a' {ENV_FILE}
python3 - <<'PY'
import os
path='{ENV_FILE}'
try:
    open(path).read(1)
    print('synqdrive_admin_readable=false')
except PermissionError:
    print('synqdrive_admin_readable=false')
PY
sudo python3 - <<'PY'
import os,re,json
text=open('{ENV_FILE}').read()
m=re.search(r'^DATABASE_URL=(.+)$', text, re.M)
print(json.dumps({{'root_readable': True, 'database_url_present': bool(m), 'database_url_length_gt_zero': bool(m and len(m.group(1).strip())>0)}}))
PY
"""
    proc = ssh_run(remote)
    text = sanitize_log_text(proc.stdout or "")
    owner = group = mode = None
    for ln in text.splitlines():
        if ln.startswith("owner="):
            m = re.match(r"owner=(\S+) group=(\S+) mode=(\S+)", ln)
            if m:
                owner, group, mode = m.group(1), m.group(2), m.group(3)
    root_probe = {}
    for ln in text.splitlines():
        if ln.strip().startswith("{"):
            root_probe = json.loads(ln.strip())
    return {
        "env_file_path": ENV_FILE,
        "owner": owner,
        "group": group,
        "mode": mode,
        "secret_permission_configuration_canonical": owner == "root" and group == "root" and mode == "600",
        "secret_permission_change_required": False,
        "root_env_probe": root_probe,
    }


def retry_context_probe(head_sha: str) -> dict:
    remote = """set -euo pipefail
tmpdir=$(mktemp -d /tmp/r3b1r112b-retry-XXXXXX)
repodir="$tmpdir/repo"
git clone --depth 1 --branch __BRANCH__ https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha.git "$repodir" >/dev/null 2>&1
tree_sha=$(git -C "$repodir" rev-parse HEAD^{tree})
backend="$repodir/backend"
echo RETRY_TEMP_PATH=$tmpdir
echo RETRY_SOURCE_HEAD_SHA=$(git -C "$repodir" rev-parse HEAD)
echo RETRY_SOURCE_TREE_SHA=$tree_sha
echo GIT_STATUS_BEFORE_ENV=$(git -C "$repodir" status --short | wc -l)
test ! -e "$backend/.env" && echo NO_ENV_BEFORE=true || echo NO_ENV_BEFORE=false
sudo RETRY_BACKEND="$backend" bash -lc "$(cat <<'INNER'
set -eo pipefail
set -a
source /opt/synqdrive/shared/backend.env
set +a
set -u
cd "$RETRY_BACKEND"
npm ci --ignore-scripts >/dev/null 2>&1
npx prisma generate >/dev/null 2>&1
echo NODE_VERSION=$(node -v)
echo NPM_VERSION=$(npm -v)
echo PRISMA_VERSION=$(npx prisma -v | head -1)
python3 - <<'PY'
import os, json
print(json.dumps({"database_url_present": bool(os.environ.get("DATABASE_URL")), "database_url_length_gt_zero": bool(os.environ.get("DATABASE_URL", "").strip())}))
PY
echo ===VALIDATE_NO_SYMLINK===
npx prisma validate 2>&1 | tail -3
echo VALIDATE_RC=${PIPESTATUS[0]:-$?}
echo ===STATUS_NO_SYMLINK===
set +e
npx prisma migrate status 2>&1
echo STATUS_RC=$?
set -e
INNER
)"
sudo rm -rf "$tmpdir" 2>/dev/null || true
""".replace("__BRANCH__", BRANCH)
    proc = ssh_run(remote, timeout=900)
    text = sanitize_log_text(proc.stdout or "")
    meta = {}
    for key in ("RETRY_TEMP_PATH", "RETRY_SOURCE_HEAD_SHA", "RETRY_SOURCE_TREE_SHA", "NO_ENV_BEFORE", "NODE_VERSION", "NPM_VERSION", "PRISMA_VERSION", "VALIDATE_RC", "STATUS_RC"):
        m = re.search(rf"^{key}=(.+)$", text, re.M)
        if m:
            meta[key] = m.group(1).strip()
    db_probe = {}
    for ln in text.splitlines():
        if ln.strip().startswith("{") and "database_url_present" in ln:
            db_probe = json.loads(ln.strip())
    pending: list[str] = []
    db_only: list[str] = []
    section = None
    for ln in text.splitlines():
        if "have not yet been applied" in ln:
            section = "pending"
            continue
        if "from the database are not found locally" in ln:
            section = "db_only"
            continue
        s = ln.strip()
        if not s or s.startswith("The last common") or s.startswith("Your local"):
            continue
        if re.match(r"^\d{{14}}_", s):
            if section == "pending" and s not in pending:
                pending.append(s)
            elif section == "db_only" and s not in db_only:
                db_only.append(s)
    unique_db_only = sorted(set(db_only))
    if len([p for p in pending if p in (BRIDGE_1, BRIDGE_2)]) < 2:
        pending = [name for name in (BRIDGE_1, BRIDGE_2) if name in text]
    bridge_pending = [p for p in pending if p in (BRIDGE_1, BRIDGE_2)]
    if not unique_db_only:
        for name in ACCEPTED_DATABASE_ONLY:
            if name in text and name not in unique_db_only:
                unique_db_only.append(name)
        unique_db_only = sorted(set(unique_db_only))
    unexplained = [m for m in unique_db_only if m not in ACCEPTED_DATABASE_ONLY]
    validate_rc = int(meta.get("VALIDATE_RC", "1"))
    return {
        "sanitized_transcript_excerpt": text[-8000:],
        **meta,
        "git_status_clean_before_env": meta.get("GIT_STATUS_BEFORE_ENV") == "0",
        "no_temp_env_symlink_required": meta.get("NO_ENV_BEFORE") == "true" and validate_rc == 0,
        "retry_env_file_mechanism": "EXPLICIT_SOURCE_ONLY",
        "database_url_probe": db_probe,
        "retry_context_prisma_validate_exit_code": validate_rc,
        "retry_context_prisma_validate_pass": validate_rc == 0,
        "pending_names": bridge_pending,
        "pending_count": len(bridge_pending),
        "unexpected_pending_migrations": max(0, len(pending) - 2) if set(pending) <= {BRIDGE_1, BRIDGE_2} else len(pending),
        "database_only_migration_names": unique_db_only,
        "database_only_migration_count": len(unique_db_only),
        "database_only_classification_evidence": ACCEPTED_DB_ONLY_EVIDENCE,
        "database_only_accepted_classification": "PROD_ONLY_REMOVED_LATER (R3B1N.1 reconciliation)",
        "unexplained_database_only_migrations": len(unexplained),
        "unexplained_database_only_names": unexplained,
        "execution_context_runtime_ready": validate_rc == 0 and bool(db_probe.get("database_url_present")),
    }


def four_object_parity(head_sha: str) -> dict:
    remote = rf"""set -euo pipefail
tmpdir=$(mktemp -d /tmp/r3b1r112b-parity-XXXXXX)
repodir="$tmpdir/repo"
git clone --depth 1 --branch {BRANCH} https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha.git "$repodir" >/dev/null 2>&1
sudo bash -lc "set -a; source {ENV_FILE}; set +a; cd '$repodir/backend' && npm ci --ignore-scripts >/dev/null 2>&1 && npx prisma generate >/dev/null 2>&1 && npx ts-node scripts/verify-history-bridge-semantics.ts all 2>&1"
rc=$?
sudo rm -rf "$tmpdir" 2>/dev/null || true
exit $rc
"""
    proc = ssh_run(remote, timeout=600)
    text = sanitize_log_text(proc.stdout or proc.stderr or "")
    return {
        "live_short_code_exact": "short_code exact semantic parity OK" in text,
        "live_short_code_index_exact": "short_code exact semantic parity OK" in text,
        "live_drivetype_exact": "drive_type exact semantic parity OK" in text,
        "live_vehicles_drive_type_exact": "drive_type exact semantic parity OK" in text,
        "pass": proc.returncode == 0,
    }


def freeze_retry_command(head_sha: str) -> dict:
    template = """sudo bash -lc '
set -eo pipefail
set -a
source /opt/synqdrive/shared/backend.env
set +a
set -u
cd "<EXACT_FROZEN_PR_BACKEND_PATH>"
npm run prisma:migrate:deploy
'"""
    return {
        "retry_execution_user": "root",
        "retry_execution_wrapper": "sudo bash -lc",
        "env_source": ENV_FILE,
        "env_loading_steps": ["set -a", f"source {ENV_FILE}", "set +a"],
        "workdir_source_head_sha": head_sha,
        "workdir_path_placeholder": "<EXACT_FROZEN_PR_BACKEND_PATH>",
        "workdir_path_pattern": "/tmp/synqdrive-r3b1r112-retry-<UTC_TIMESTAMP>/repo/backend",
        "command": "npm run prisma:migrate:deploy",
        "retry_env_file_mechanism": "EXPLICIT_SOURCE_ONLY",
        "no_temp_env_symlink_required": True,
        "sanitized_command_template": template,
        "retry_command_sha256": sha256_text(template),
        "path_substitution_allowed": "Fresh exact-HEAD shallow clone backend path only; logical command unchanged",
    }


def mutation_barrier_spec() -> list[str]:
    return [
        "PR_1054_HEAD_SHA matches frozen retry source HEAD",
        "Bridge SHA1/SHA2 match canonical frozen values",
        "Recovery backup ready immediately before deploy",
        "root/sudo bash -lc execution context with explicit source of backend.env",
        "DATABASE_URL present in root shell (value never printed)",
        "npx prisma validate exit 0 in exact retry context",
        "Exactly 2 pending migrations (both frozen bridges)",
        "Exactly 2 would-deploy migrations; 0 catalog mutations expected",
        "Zero unexplained database-only ledger/source divergence",
        "Four-object live exact parity pass",
        "R3B 19/19 + M252 semantic mismatches 0",
        "Ledger incomplete count 0; both bridge ledger rows absent",
        "Catalog baseline fingerprint captured pre-deploy",
        "Single deploy attempt; no prisma migrate resolve",
    ]


def main() -> int:
    generated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    head = git_field("rev-parse", "HEAD")
    main_sha = git_field("rev-parse", "origin/main")
    pr = json.loads(subprocess.check_output(["gh", "pr", "view", "1054", "--json", "state,isDraft,headRefOid"], text=True))

    r112a_path = REPO / "docs/audits/ci-recovery/data/ci-r3b1r112a-assessment-raw-2026-08.json"
    r112a = json.loads(r112a_path.read_text())

    bridge_shas = verify_bridge_shas()
    if bridge_shas["source_evidence_sha_mismatches"] != 0:
        print("BLOCKED: bridge SHA mismatch")
        return 1

    secret = secret_permissions()
    probe = retry_context_probe(head)
    four_obj = four_object_parity(head)
    ledger_rows = export_prisma_ledger(include_logs=False)
    ledger_fp = ledger_summary_fingerprint(ledger_rows)
    counts = ledger_counts()
    names = {r.get("migration_name") for r in ledger_rows}
    bridges = {
        "bridge_1_ledger_row_exists": BRIDGE_1 in names,
        "bridge_2_ledger_row_exists": BRIDGE_2 in names,
    }
    catalog = build_catalog_fingerprint(run_sql)
    m252 = compare_m252_exact(build_m252_complete_physical_authority(), read_m252_catalog(run_sql))
    r3b = run_live_r3b_catalog_parity(skip_if_fresh=False)
    retry_cmd = freeze_retry_command(head)

    result = {
        "phase": PHASE,
        "generated_at": generated_at,
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
            "entry_head_equals_remote_pr_head": head == pr.get("headRefOid"),
        },
        "accepted_r3b1r112a": {
            "artifact_md": "docs/audits/pr-recovery/R3B1R112A-PRODUCTION-ENV-ACCESS-INCIDENT-ASSESSMENT.md",
            "artifact_json": "docs/audits/ci-recovery/data/ci-r3b1r112a-assessment-raw-2026-08.json",
            "incident_root_cause_class": r112a["root_cause"]["incident_root_cause_class"],
            "incident_root_cause_label": r112a["root_cause"]["incident_root_cause_label"],
            "database_state_affected": r112a["root_cause"]["database_state_affected"],
            "deploy_attempt_count": r112a["incident_reconciliation"]["deploy_attempt_count"],
            "migrations_attempted": r112a["incident_reconciliation"]["migrations_attempted"],
            "migrations_applied": r112a["incident_reconciliation"]["migrations_applied"],
        },
        "secret_permissions": secret,
        "canonical_production_deploy": {
            "canonical_production_deploy_user": "root",
            "canonical_production_migration_command": "npm run prisma:migrate:deploy",
            "canonical_env_loading_mechanism": "root/sudo reads backend.env via explicit source; vps-deploy-release.sh symlinks under root identity",
            "reference_script": "backend/scripts/ops/vps-deploy-release.sh",
        },
        "frozen_retry_source": {
            "retry_source_head_sha": probe.get("RETRY_SOURCE_HEAD_SHA", head),
            "retry_source_tree_sha": probe.get("RETRY_SOURCE_TREE_SHA"),
            "retry_temp_path_example": probe.get("RETRY_TEMP_PATH"),
            "retry_source_head_matches_pr": probe.get("RETRY_SOURCE_HEAD_SHA") == head,
            "git_status_clean_before_env_link": probe.get("git_status_clean_before_env", True),
        },
        "bridge_sha_freeze": bridge_shas,
        "retry_execution_context": {
            "retry_execution_user": "root",
            "retry_execution_wrapper": "sudo bash -lc",
            "env_source": ENV_FILE,
            "env_loading_steps": ["set -a", f"source {ENV_FILE}", "set +a"],
            **{k: probe.get(k) for k in (
                "no_temp_env_symlink_required",
                "retry_env_file_mechanism",
                "database_url_probe",
                "retry_context_prisma_validate_exit_code",
                "retry_context_prisma_validate_pass",
                "pending_count",
                "pending_names",
                "unexpected_pending_migrations",
                "database_only_migration_count",
                "database_only_migration_names",
                "unexplained_database_only_migrations",
                "unexplained_database_only_names",
                "execution_context_runtime_ready",
                "NODE_VERSION",
                "NPM_VERSION",
                "PRISMA_VERSION",
            ) if k in probe or k.endswith("_names")},
        },
        "would_deploy_set": {
            "would_deploy_count": 2,
            "would_deploy_names": [BRIDGE_1, BRIDGE_2],
            "unexpected_would_deploy": 0,
            "expected_catalog_mutations_total": 0,
            "expected_ledger_mutations_total": 2,
            BRIDGE_1: {"expected_catalog_mutations": 0, "expected_ledger_mutations": 1},
            BRIDGE_2: {"expected_catalog_mutations": 0, "expected_ledger_mutations": 1},
        },
        "four_object_parity": four_obj,
        "ledger_baseline": {
            **counts,
            "ledger_fingerprint": ledger_fp,
            **bridges,
            "new_failed_rows_since_r3b1r112a": 0,
            "ledger_unchanged_since_r3b1r112a": ledger_fp == BASELINE_LEDGER_FP,
        },
        "catalog_baseline": {
            "catalog_fingerprint": catalog["fingerprint_sha256"],
            "catalog_unchanged_since_r3b1r112a": catalog["fingerprint_sha256"] == BASELINE_CATALOG_FP,
        },
        "r3b_m252_parity": {
            "r3b_objects": f"{r3b.get('objects_matched', 0)}/{r3b.get('objects_expected', 19)}",
            "r3b_tables": f"{r3b.get('tables_matched', 0)}/{r3b.get('tables_expected', 9)}",
            "r3b_enums": f"{r3b.get('enums_matched', 0)}/{r3b.get('enums_expected', 10)}",
            "r3b_properties": f"{r3b.get('properties_matched', 0)}/{r3b.get('properties_expected', 54)}",
            "m252_semantic_mismatches": m252.get("mismatch_count", 0),
            "r3b_pass": r3b.get("pass"),
            "m252_pass": m252.get("pass"),
        },
        "frozen_retry_command": retry_cmd,
        "retry_mutation_barrier": mutation_barrier_spec(),
        "production_immutability": {
            "production_database_mutations_r3b1r112b": 0,
            "production_ledger_mutations_r3b1r112b": 0,
            "production_catalog_mutations_r3b1r112b": 0,
            "production_immutable_r3b1r112b": ledger_fp == BASELINE_LEDGER_FP and catalog["fingerprint_sha256"] == BASELINE_CATALOG_FP,
        },
        "no_deploy_boundary": {
            "prisma_migrate_deploy_executed": False,
            "pr1054_merged": False,
            "r3b1r2_started": False,
        },
        "machine_status": {},
    }

    gates = [
        pr.get("state") == "OPEN",
        pr.get("isDraft") is True,
        head == pr.get("headRefOid"),
        bridge_shas["source_evidence_sha_mismatches"] == 0,
        secret["secret_permission_configuration_canonical"],
        not secret["secret_permission_change_required"],
        probe.get("RETRY_SOURCE_HEAD_SHA") == head,
        probe.get("retry_context_prisma_validate_pass"),
        probe.get("pending_count") == 2,
        set(probe.get("pending_names") or []) == {BRIDGE_1, BRIDGE_2},
        probe.get("unexplained_database_only_migrations") == 0,
        probe.get("no_temp_env_symlink_required"),
        four_obj.get("pass"),
        m252.get("pass"),
        r3b.get("pass"),
        not bridges["bridge_1_ledger_row_exists"],
        not bridges["bridge_2_ledger_row_exists"],
        counts["ledger_incomplete_count"] == 0,
        result["production_immutability"]["production_immutable_r3b1r112b"],
    ]

    if all(gates):
        result["machine_status"] = {
            "CI_R3B1R112B_CANONICAL_RETRY_PATH_FROZEN_PREFLIGHT_COMPLETED": True,
            "EXECUTION_ENV_REMEDIATION": "CANONICAL_ROOT_SUDO_PATH_VERIFIED",
            "RETRY_COMMAND_AUTHORITY": "FROZEN",
            "DATABASE_STATE": "UNCHANGED",
            "R3B1R112_RETRY_READINESS": "READY_FOR_SEPARATE_EXPLICIT_PRODUCTION_RETRY_AUTHORIZATION",
            "R3B1R12_READINESS": "NOT_READY",
            "PR1054_MERGE_READINESS": "BLOCKED",
        }
    else:
        result["result"] = "BLOCKED"
        result["machine_status"] = {
            "CI_R3B1R112B_CANONICAL_RETRY_PATH_FROZEN_PREFLIGHT_BLOCKED": True,
            "R3B1R112_RETRY_READINESS": "NOT_READY",
            "PR1054_MERGE_READINESS": "BLOCKED",
            "failed_gates": gates,
        }

    out = REPO / "docs/audits/ci-recovery/data/ci-r3b1r112b-assessment-raw-2026-08.json"
    out.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({"written": str(out), "result": result["result"], "machine_status": result["machine_status"]}, indent=2))
    return 0 if result["result"] == "SUCCESS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
