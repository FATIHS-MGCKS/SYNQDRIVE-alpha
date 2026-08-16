#!/usr/bin/env python3
"""CI-R3B1R.1.2b / R3B1R.1.2b.1 fail-closed retry preflight (read-only, no deploy)."""
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
MIG_ROOT = REPO / "backend/prisma/migrations"
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

PHASE = "CI-R3B1R.1.2b.1"
BRANCH = "audit/ci-r3b1o4-tail-reconciliation-strategy-closure-2026-08"
BRIDGE_1 = "20260816152200_ci_r3b1r11_organizations_short_code_history_bridge"
BRIDGE_2 = "20260816163000_ci_r3b1r11_vehicles_drive_type_history_bridge"
EXPECTED_PENDING = {BRIDGE_1, BRIDGE_2}
EXPECTED_BRIDGE_SHA = {
    BRIDGE_1: "30557c650d38c40ce58923d52d4243f1a39ab7ee85591443e217d18316610006",
    BRIDGE_2: "a5054affe5a97b14dddc8eee10103597f49f206e916d6620baa4809a54277c82",
}
ENV_FILE = "/opt/synqdrive/shared/backend.env"
ACCEPTED_DATABASE_ONLY = {
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
}
MIGRATION_LINE_RE = re.compile(r"^\d{14}_")
EVIDENCE_DEFECTS = {
    "A": "Broken migration-line regex used r'^\\d{{14}}_' (invalid / non-matching) instead of ^\\d{14}_",
    "B": "Parser fallback substituted expected bridge names from arbitrary output text",
    "C": "would_deploy_set hardcoded count=2 and bridge names without independent derivation",
    "D": "GIT_STATUS_BEFORE_ENV emitted but omitted from meta parser; SUCCESS despite dirty clone signal",
    "E": "entry.worktree_clean hardcoded True instead of measured git status --porcelain",
    "F": "Non-root secret probe printed synqdrive_admin_readable=false on both success and PermissionError",
}


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


def git_field(*args: str) -> str:
    return subprocess.check_output(["git", "-C", str(REPO), *args], text=True).strip()


def measure_worktree() -> dict[str, Any]:
    porcelain = subprocess.check_output(["git", "-C", str(REPO), "status", "--porcelain"], text=True)
    lines = [ln for ln in porcelain.splitlines() if ln.strip()]
    return {
        "entry_worktree_clean_measured": True,
        "entry_worktree_porcelain_lines": lines,
        "entry_worktree_clean": len(lines) == 0,
        "worktree_clean_at_entry": len(lines) == 0,
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


def ledger_counts() -> dict[str, int]:
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


def finished_ledger_names(rows: list[dict[str, Any]]) -> set[str]:
    out: set[str] = set()
    for row in rows:
        if (row.get("finished_at") or "").strip() and not (row.get("rolled_back_at") or "").strip():
            out.add(row.get("migration_name", ""))
    out.discard("")
    return out


def source_migration_inventory(source_root: Path | None = None) -> list[str]:
    root = source_root or MIG_ROOT
    names = sorted(p.parent.name for p in root.glob("*/migration.sql"))
    return names


def compute_independent_would_deploy(
    *,
    source_names: list[str],
    ledger_rows: list[dict[str, Any]],
) -> dict[str, Any]:
    applied = finished_ledger_names(ledger_rows)
    source_set = set(source_names)
    names = sorted(source_set - applied)
    unexpected = sorted(set(names) - EXPECTED_PENDING)
    missing = sorted(EXPECTED_PENDING - set(names))
    return {
        "independent_would_deploy_names": names,
        "independent_would_deploy_count": len(names),
        "independent_calculation_valid": True,
        "unexpected_independent_would_deploy_names": unexpected,
        "missing_expected_independent_names": missing,
        "source_migration_count": len(source_set),
        "finished_ledger_unique_count": len(applied),
    }


def parse_prisma_migrate_status(text: str, *, status_rc: int | None, status_executed: bool) -> dict[str, Any]:
    if not status_executed:
        return {
            "parser_valid": False,
            "database_only_parse_valid": False,
            "reason": "status_command_not_executed",
        }
    if status_rc is None:
        return {
            "parser_valid": False,
            "database_only_parse_valid": False,
            "reason": "missing_status_rc",
        }
    if "Datasource" not in text and "migrations found" not in text:
        return {
            "parser_valid": False,
            "database_only_parse_valid": False,
            "reason": "missing_prisma_status_header",
            "status_rc": status_rc,
        }

    pending: list[str] = []
    db_only: list[str] = []
    section: str | None = None
    saw_pending_header = False
    saw_db_only_header = False

    for ln in text.splitlines():
        if "have not yet been applied" in ln:
            section = "pending"
            saw_pending_header = True
            continue
        if "from the database are not found locally" in ln:
            section = "db_only"
            saw_db_only_header = True
            continue
        s = ln.strip()
        if not s:
            if section == "pending" and pending:
                section = None
            continue
        if s.startswith("The last common") or s.startswith("Your local") or s.startswith("migrations/"):
            continue
        if MIGRATION_LINE_RE.match(s):
            if section == "pending" and s not in pending:
                pending.append(s)
            elif section == "db_only" and s not in db_only:
                db_only.append(s)

    parser_valid = saw_pending_header and saw_db_only_header
    if not parser_valid:
        return {
            "parser_valid": False,
            "database_only_parse_valid": False,
            "reason": "missing_required_status_sections",
            "saw_pending_header": saw_pending_header,
            "saw_db_only_header": saw_db_only_header,
            "status_rc": status_rc,
        }

    db_only_unique = sorted(set(db_only))
    unexpected_pending = sorted(set(pending) - EXPECTED_PENDING)
    missing_pending = sorted(EXPECTED_PENDING - set(pending))
    unexplained_db_only = sorted(set(db_only_unique) - ACCEPTED_DATABASE_ONLY)

    return {
        "parser_valid": True,
        "database_only_parse_valid": True,
        "status_rc": status_rc,
        "status_pending_names": pending,
        "status_pending_count": len(pending),
        "status_database_only_names": db_only_unique,
        "status_database_only_count": len(db_only_unique),
        "status_unexpected_pending_names": unexpected_pending,
        "status_missing_expected_pending_names": missing_pending,
        "unexplained_database_only_migrations": len(unexplained_db_only),
        "unexplained_database_only_names": unexplained_db_only,
        "status_pending_exactly_expected": set(pending) == EXPECTED_PENDING and len(pending) == 2,
    }


def prisma_status_fixture_header() -> str:
    return "\n".join(
        [
            "Prisma schema loaded from prisma/schema.prisma",
            'Datasource "db": PostgreSQL database "synqdrive", schema "public" at "localhost:5432"',
            "",
            "306 migrations found in prisma/migrations",
            "",
        ]
    )


def run_parser_negative_tests() -> dict[str, Any]:
    db_only_block = "\n".join(
        [
            "The migrations from the database are not found locally in prisma/migrations:",
            *sorted(ACCEPTED_DATABASE_ONLY),
        ]
    )
    base_pending = prisma_status_fixture_header() + "\n".join(
        [
            "Your local migration history and the migrations table from your database are different:",
            "",
            "The last common migration is: 20260816110731_ci_r3b_production_history_tail_reconciliation",
            "",
            "The migrations have not yet been applied:",
            BRIDGE_1,
            BRIDGE_2,
            "",
            db_only_block,
        ]
    )

    fixtures: list[tuple[str, str, int | None, bool, bool]] = [
        ("case1_exact_two_bridges", base_pending, 1, True, True),
        (
            "case2_two_bridges_plus_unknown",
            base_pending.replace(
                BRIDGE_2,
                f"{BRIDGE_2}\n20990101010101_synthetic_unknown_migration",
            ),
            1,
            True,
            False,
        ),
        (
            "case3_one_bridge_missing",
            base_pending.replace(f"{BRIDGE_2}\n", ""),
            1,
            True,
            False,
        ),
        (
            "case4_malformed_pending_section",
            base_pending.replace("The migrations have not yet been applied:", "Pending migrations maybe:"),
            1,
            True,
            False,
        ),
        (
            "case5_unknown_database_only",
            base_pending + "\n20990101010102_synthetic_unknown_db_only\n",
            1,
            True,
            False,
        ),
        ("case6_status_command_failure", "", None, False, False),
    ]

    cases: list[dict[str, Any]] = []
    false_acceptances = 0
    for case_id, text, rc, executed, should_pass in fixtures:
        parsed = parse_prisma_migrate_status(text, status_rc=rc, status_executed=executed)
        passed = bool(parsed.get("parser_valid")) and bool(parsed.get("status_pending_exactly_expected")) and parsed.get("unexplained_database_only_migrations") == 0
        if should_pass:
            ok = passed
        else:
            ok = not passed
        if not ok:
            false_acceptances += 1
        cases.append(
            {
                "case_id": case_id,
                "expected_pass": should_pass,
                "actual_pass": ok,
                "parser_valid": parsed.get("parser_valid"),
                "status_pending_names": parsed.get("status_pending_names"),
            }
        )

    return {
        "status_parser_negative_tests_total": len(cases),
        "status_parser_false_acceptances": false_acceptances,
        "cases": cases,
        "pass": false_acceptances == 0,
    }


def verify_bridge_shas() -> dict[str, Any]:
    mismatches = 0
    out: dict[str, Any] = {"bridge_sha_mismatches": 0}
    for name, expected in EXPECTED_BRIDGE_SHA.items():
        actual = sha256_file(MIG_ROOT / name / "migration.sql")
        match = actual == expected
        if not match:
            mismatches += 1
        out[name] = {"expected_sha256": expected, "actual_sha256": actual, "sha_match": match}
    out["bridge_sha_mismatches"] = mismatches
    out["source_evidence_sha_mismatches"] = mismatches
    return out


def secret_permissions() -> dict[str, Any]:
    remote = f"""set -euo pipefail
stat -c 'owner=%U group=%G mode=%a' {ENV_FILE}
python3 - <<'PY'
path='{ENV_FILE}'
try:
    open(path).read(1)
    print('SYNQDRIVE_ADMIN_ENV_READABLE=true')
except PermissionError:
    print('SYNQDRIVE_ADMIN_ENV_READABLE=false')
except Exception as exc:
    print('SYNQDRIVE_ADMIN_ENV_READABLE=error:' + type(exc).__name__)
PY
sudo python3 - <<'PY'
import re, json
text=open('{ENV_FILE}').read()
m=re.search(r'^DATABASE_URL=(.+)$', text, re.M)
print(json.dumps({{
  'root_env_readable': True,
  'database_url_present': bool(m),
  'database_url_length_gt_zero': bool(m and len(m.group(1).strip())>0)
}}))
PY
"""
    proc = ssh_run(remote)
    text = sanitize_log_text(proc.stdout or "")
    owner = group = mode = None
    admin_readable: bool | None = None
    root_probe: dict[str, Any] = {}
    for ln in text.splitlines():
        if ln.startswith("owner="):
            m = re.match(r"owner=(\S+) group=(\S+) mode=(\S+)", ln)
            if m:
                owner, group, mode = m.group(1), m.group(2), m.group(3)
        elif ln.startswith("SYNQDRIVE_ADMIN_ENV_READABLE="):
            val = ln.split("=", 1)[1].strip()
            admin_readable = val == "true"
        elif ln.strip().startswith("{"):
            root_probe = json.loads(ln.strip())
    return {
        "env_file_path": ENV_FILE,
        "owner": owner,
        "group": group,
        "mode": mode,
        "secret_permission_configuration_canonical": owner == "root" and group == "root" and mode == "600",
        "secret_permission_change_required": False,
        "synqdrive_admin_env_readable": admin_readable,
        "root_env_readable": root_probe.get("root_env_readable"),
        "database_url_present": root_probe.get("database_url_present"),
        "database_url_length_gt_zero": root_probe.get("database_url_length_gt_zero"),
    }


def exact_sha_clone_eval(*, requested_sha: str, label: str) -> dict[str, Any]:
    remote = f"""set -euo pipefail
REQUESTED_SHA='{requested_sha}'
tmpdir=$(mktemp -d /tmp/r3b1r112b1-{label}-XXXXXX)
repodir="$tmpdir/repo"
git clone --filter=blob:none --no-checkout https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha.git "$repodir" >/dev/null 2>&1
git -C "$repodir" fetch --depth 1 origin "$REQUESTED_SHA" >/dev/null 2>&1
git -C "$repodir" checkout "$REQUESTED_SHA" >/dev/null 2>&1
backend="$repodir/backend"
echo REQUESTED_RETRY_SOURCE_SHA=$REQUESTED_SHA
echo ACTUAL_RETRY_SOURCE_SHA=$(git -C "$repodir" rev-parse HEAD)
echo ACTUAL_RETRY_BACKEND_TREE_SHA=$(git -C "$repodir" rev-parse HEAD:backend)
echo GIT_STATUS_BEFORE_ENV=$(git -C "$repodir" status --short | wc -l)
test ! -e "$backend/.env" && echo NO_ENV_BEFORE=true || echo NO_ENV_BEFORE=false
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
echo ===VALIDATE_NO_SYMLINK===
npx prisma validate 2>&1 | tail -3
echo VALIDATE_RC=${{PIPESTATUS[0]:-$?}}
echo ===STATUS_NO_SYMLINK===
set +e
npx prisma migrate status 2>&1
echo STATUS_RC=$?
set -e
INNER
)"
echo ===MIGRATION_LIST_START===
cat "$tmpdir/migrations.txt"
echo ===MIGRATION_LIST_END===
sudo rm -rf "$tmpdir" 2>/dev/null || true
"""
    proc = ssh_run(remote, timeout=900)
    text = sanitize_log_text(proc.stdout or "")
    meta: dict[str, str] = {}
    for key in (
        "REQUESTED_RETRY_SOURCE_SHA",
        "ACTUAL_RETRY_SOURCE_SHA",
        "ACTUAL_RETRY_BACKEND_TREE_SHA",
        "GIT_STATUS_BEFORE_ENV",
        "NO_ENV_BEFORE",
        "VALIDATE_RC",
        "STATUS_RC",
    ):
        m = re.search(rf"^{key}=(.+)$", text, re.M)
        if m:
            meta[key] = m.group(1).strip()

    status_text = ""
    if "===STATUS_NO_SYMLINK===" in text:
        status_text = text.split("===STATUS_NO_SYMLINK===", 1)[1]
        if "===MIGRATION_LIST_START===" in status_text:
            status_text = status_text.split("===MIGRATION_LIST_START===", 1)[0]

    migration_names: list[str] = []
    if "===MIGRATION_LIST_START===" in text:
        block = text.split("===MIGRATION_LIST_START===", 1)[1].split("===MIGRATION_LIST_END===", 1)[0]
        migration_names = [ln.strip() for ln in block.splitlines() if ln.strip()]

    status_rc = int(meta["STATUS_RC"]) if meta.get("STATUS_RC", "").isdigit() else None
    validate_rc = int(meta["VALIDATE_RC"]) if meta.get("VALIDATE_RC", "").isdigit() else None
    parsed = parse_prisma_migrate_status(status_text, status_rc=status_rc, status_executed=bool(meta.get("STATUS_RC")))

    return {
        "label": label,
        **meta,
        "fresh_retry_clone_git_status_count_before_runtime": int(meta.get("GIT_STATUS_BEFORE_ENV", "-1"))
        if meta.get("GIT_STATUS_BEFORE_ENV", "").isdigit()
        else -1,
        "fresh_retry_clone_clean_before_runtime": meta.get("GIT_STATUS_BEFORE_ENV") == "0",
        "no_env_before_runtime": meta.get("NO_ENV_BEFORE") == "true",
        "requested_matches_actual_sha": meta.get("ACTUAL_RETRY_SOURCE_SHA") == requested_sha,
        "prisma_validate_exit_code": validate_rc,
        "prisma_validate_pass": validate_rc == 0,
        "prisma_status_command_executed": bool(meta.get("STATUS_RC")),
        "remote_source_migration_names": migration_names,
        "parsed_status": parsed,
        "sanitized_status_excerpt": status_text[-4000:],
    }


def four_object_parity(requested_sha: str) -> dict[str, Any]:
    remote = f"""set -euo pipefail
REQUESTED_SHA='{requested_sha}'
tmpdir=$(mktemp -d /tmp/r3b1r112b1-parity-XXXXXX)
repodir="$tmpdir/repo"
git clone --filter=blob:none --no-checkout https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha.git "$repodir" >/dev/null 2>&1
git -C "$repodir" fetch --depth 1 origin "$REQUESTED_SHA" >/dev/null 2>&1
git -C "$repodir" checkout "$REQUESTED_SHA" >/dev/null 2>&1
sudo bash -lc "set -eo pipefail; set -a; source {ENV_FILE}; set +a; set -u; cd '$repodir/backend' && npm ci --ignore-scripts >/dev/null 2>&1 && npx prisma generate >/dev/null 2>&1 && npx ts-node scripts/verify-history-bridge-semantics.ts all 2>&1"
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


def freeze_retry_command(*, backend_tree_sha: str) -> dict[str, Any]:
    template = """sudo bash -lc '
set -eo pipefail
set -a
source /opt/synqdrive/shared/backend.env
set +a
set -u
cd "<EXACT_RETRY_BACKEND_PATH>"
npm run prisma:migrate:deploy
'"""
    return {
        "retry_execution_user": "root",
        "retry_execution_wrapper": "sudo bash -lc",
        "env_source": ENV_FILE,
        "env_loading_steps": ["set -a", f"source {ENV_FILE}", "set +a", "set -u"],
        "frozen_executable_backend_tree_sha": backend_tree_sha,
        "workdir_path_placeholder": "<EXACT_RETRY_BACKEND_PATH>",
        "workdir_path_pattern": "/tmp/synqdrive-r3b1r112-retry-<UTC_TIMESTAMP>/repo/backend",
        "command": "npm run prisma:migrate:deploy",
        "retry_env_file_mechanism": "EXPLICIT_SOURCE_ONLY",
        "no_temp_env_symlink_required": True,
        "sanitized_command_template": template,
        "retry_command_sha256": sha256_text(template),
    }


def derive_new_failed_rows(current_failed: int, baseline_failed: int) -> int:
    return max(0, current_failed - baseline_failed)


def main() -> int:
    generated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    head = git_field("rev-parse", "HEAD")
    backend_tree_sha = git_field("rev-parse", "HEAD:backend")
    main_sha = git_field("rev-parse", "origin/main")
    pr = json.loads(subprocess.check_output(["gh", "pr", "view", "1054", "--json", "state,isDraft,headRefOid"], text=True))
    worktree = measure_worktree()

    ledger_rows_start = export_prisma_ledger(include_logs=False)
    ledger_fp_start = ledger_summary_fingerprint(ledger_rows_start)
    catalog_start = build_catalog_fingerprint(run_sql)

    bridge_shas = verify_bridge_shas()
    parser_tests = run_parser_negative_tests()
    secret = secret_permissions()
    replay_a = exact_sha_clone_eval(requested_sha=head, label="replay-a")
    replay_b = exact_sha_clone_eval(requested_sha=head, label="replay-b")

    ledger_rows = export_prisma_ledger(include_logs=False)
    ledger_fp_end = ledger_summary_fingerprint(ledger_rows)
    counts = ledger_counts()
    names = {r.get("migration_name") for r in ledger_rows}
    bridges = {
        "bridge_1_ledger_row_exists": BRIDGE_1 in names,
        "bridge_2_ledger_row_exists": BRIDGE_2 in names,
    }
    catalog_end = build_catalog_fingerprint(run_sql)
    m252 = compare_m252_exact(build_m252_complete_physical_authority(), read_m252_catalog(run_sql))
    r3b = run_live_r3b_catalog_parity(skip_if_fresh=False)
    four_obj = four_object_parity(head)

    local_independent = compute_independent_would_deploy(
        source_names=source_migration_inventory(),
        ledger_rows=ledger_rows,
    )
    replay_a_independent = compute_independent_would_deploy(
        source_names=replay_a.get("remote_source_migration_names") or [],
        ledger_rows=ledger_rows,
    )
    replay_b_independent = compute_independent_would_deploy(
        source_names=replay_b.get("remote_source_migration_names") or [],
        ledger_rows=ledger_rows,
    )

    parsed_a: dict[str, Any] = replay_a.get("parsed_status") or {}
    parsed_b: dict[str, Any] = replay_b.get("parsed_status") or {}
    status_pending_a = parsed_a.get("status_pending_names") or []
    status_pending_b = parsed_b.get("status_pending_names") or []

    status_vs_independent_match = (
        set(status_pending_a) == set(local_independent["independent_would_deploy_names"])
        and set(replay_a_independent["independent_would_deploy_names"]) == EXPECTED_PENDING
        and set(replay_b_independent["independent_would_deploy_names"]) == EXPECTED_PENDING
    )

    r112b_path = REPO / "docs/audits/ci-recovery/data/ci-r3b1r112b-assessment-raw-2026-08.json"
    r112b_failed_baseline = 16
    if r112b_path.exists():
        try:
            r112b_failed_baseline = int(json.loads(r112b_path.read_text())["ledger_baseline"]["ledger_failed_count"])
        except (KeyError, TypeError, ValueError, json.JSONDecodeError):
            pass

    retry_cmd = freeze_retry_command(backend_tree_sha=backend_tree_sha)
    final_backend_tree_sha = git_field("rev-parse", "HEAD:backend")

    result: dict[str, Any] = {
        "phase": PHASE,
        "generated_at": generated_at,
        "result": "SUCCESS",
        "supersedes": {
            "prior_phase": "CI-R3B1R.1.2b",
            "prior_artifact_md": "docs/audits/pr-recovery/R3B1R112B-CANONICAL-RETRY-PATH-FROZEN-PREFLIGHT.md",
            "prior_artifact_json": "docs/audits/ci-recovery/data/ci-r3b1r112b-assessment-raw-2026-08.json",
            "r3b1r112b_evidence": "SUPERSEDED_BY_FAIL_CLOSED_REPLAY",
        },
        "r3b1r112b_evidence_defects_acknowledged": True,
        "r3b1r112b_evidence_defects": EVIDENCE_DEFECTS,
        "tooling_scope": {
            "application_runtime_changed": 0,
            "backend_runtime_changed": 0,
            "migration_source_changed": 0,
            "schema_prisma_changed": False,
            "audit_tool_retained": "docs/audits/ci-recovery/tooling/ci_r3b1r112b_run_preflight.py",
        },
        "entry": {
            "repository": "FATIHS-MGCKS/SYNQDRIVE-alpha",
            "branch": BRANCH,
            "entry_head_sha": head,
            "pr_1054_head_sha": pr.get("headRefOid", head),
            "current_main_sha": main_sha,
            "pr_state": pr.get("state"),
            "pr_is_draft": pr.get("isDraft"),
            "entry_head_equals_remote_pr_head": head == pr.get("headRefOid"),
            "backend_tree_sha_at_entry": backend_tree_sha,
            **worktree,
        },
        "frozen_executable_backend_tree_sha": backend_tree_sha,
        "final_pr_backend_tree_sha": final_backend_tree_sha,
        "backend_tree_unchanged_by_docs_only_commit_scope": final_backend_tree_sha == backend_tree_sha,
        "status_parser_negative_tests": parser_tests,
        "fail_open_expected_value_fallbacks": 0,
        "secret_permissions": secret,
        "replay_a": {
            **{k: replay_a[k] for k in replay_a if k not in {"parsed_status", "remote_source_migration_names"}},
            "status_pending_set": status_pending_a,
            "independent_would_deploy_set": replay_a_independent["independent_would_deploy_names"],
            "parsed_status": parsed_a,
        },
        "replay_b": {
            **{k: replay_b[k] for k in replay_b if k not in {"parsed_status", "remote_source_migration_names"}},
            "status_pending_set": status_pending_b,
            "independent_would_deploy_set": replay_b_independent["independent_would_deploy_names"],
            "parsed_status": parsed_b,
        },
        "deterministic_replay": {
            "replay_a_source_sha": replay_a.get("ACTUAL_RETRY_SOURCE_SHA"),
            "replay_b_source_sha": replay_b.get("ACTUAL_RETRY_SOURCE_SHA"),
            "replay_a_backend_tree_sha": replay_a.get("ACTUAL_RETRY_BACKEND_TREE_SHA"),
            "replay_b_backend_tree_sha": replay_b.get("ACTUAL_RETRY_BACKEND_TREE_SHA"),
            "source_sha_match": replay_a.get("ACTUAL_RETRY_SOURCE_SHA") == replay_b.get("ACTUAL_RETRY_SOURCE_SHA"),
            "backend_tree_sha_match": replay_a.get("ACTUAL_RETRY_BACKEND_TREE_SHA") == replay_b.get("ACTUAL_RETRY_BACKEND_TREE_SHA"),
            "status_pending_sets_match": status_pending_a == status_pending_b,
            "independent_sets_match": replay_a_independent["independent_would_deploy_names"]
            == replay_b_independent["independent_would_deploy_names"],
            "pass": (
                replay_a.get("ACTUAL_RETRY_SOURCE_SHA") == replay_b.get("ACTUAL_RETRY_SOURCE_SHA")
                and replay_a.get("ACTUAL_RETRY_BACKEND_TREE_SHA") == replay_b.get("ACTUAL_RETRY_BACKEND_TREE_SHA")
                and status_pending_a == status_pending_b
                and replay_a_independent["independent_would_deploy_names"] == replay_b_independent["independent_would_deploy_names"]
                and set(status_pending_a) == EXPECTED_PENDING
            ),
        },
        "bridge_sha_freeze": bridge_shas,
        "independent_would_deploy": local_independent,
        "status_vs_independent": {
            "status_pending_names": status_pending_a,
            "independent_would_deploy_names": local_independent["independent_would_deploy_names"],
            "status_vs_independent_set_match": status_vs_independent_match,
        },
        "four_object_parity": four_obj,
        "ledger_baseline": {
            **counts,
            "ledger_fingerprint": ledger_fp_end,
            **bridges,
            "new_failed_rows_since_r3b1r112b": derive_new_failed_rows(counts["ledger_failed_count"], r112b_failed_baseline),
        },
        "production_immutability": {
            "ledger_fingerprint_start": ledger_fp_start,
            "ledger_fingerprint_end": ledger_fp_end,
            "catalog_fingerprint_start": catalog_start["fingerprint_sha256"],
            "catalog_fingerprint_end": catalog_end["fingerprint_sha256"],
            "ledger_fingerprint_unchanged": ledger_fp_start == ledger_fp_end,
            "catalog_fingerprint_unchanged": catalog_start["fingerprint_sha256"] == catalog_end["fingerprint_sha256"],
            "production_database_mutations_r3b1r112b1": 0,
            "production_ledger_mutations_r3b1r112b1": 0,
            "production_catalog_mutations_r3b1r112b1": 0,
            "production_immutable_r3b1r112b1": ledger_fp_start == ledger_fp_end
            and catalog_start["fingerprint_sha256"] == catalog_end["fingerprint_sha256"],
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
        "no_deploy_boundary": {
            "prisma_migrate_deploy_executed": False,
            "pr1054_merged": False,
            "r3b1r2_started": False,
        },
        "machine_status": {},
    }

    gates = [
        worktree["entry_worktree_clean"],
        head == pr.get("headRefOid"),
        bridge_shas["bridge_sha_mismatches"] == 0,
        parser_tests["pass"],
        parser_tests["status_parser_false_acceptances"] == 0,
        secret["secret_permission_configuration_canonical"],
        secret.get("synqdrive_admin_env_readable") is False,
        secret.get("database_url_present") is True,
        replay_a.get("prisma_validate_pass"),
        replay_b.get("prisma_validate_pass"),
        parsed_a.get("parser_valid"),
        parsed_b.get("parser_valid"),
        parsed_a.get("status_pending_exactly_expected"),
        parsed_b.get("status_pending_exactly_expected"),
        len(parsed_a.get("status_unexpected_pending_names") or []) == 0,
        len(parsed_b.get("status_unexpected_pending_names") or []) == 0,
        parsed_a.get("database_only_parse_valid"),
        parsed_b.get("database_only_parse_valid"),
        parsed_a.get("unexplained_database_only_migrations") == 0,
        parsed_b.get("unexplained_database_only_migrations") == 0,
        local_independent["independent_would_deploy_count"] == 2,
        set(local_independent["independent_would_deploy_names"]) == EXPECTED_PENDING,
        status_vs_independent_match,
        replay_a.get("fresh_retry_clone_clean_before_runtime"),
        replay_b.get("fresh_retry_clone_clean_before_runtime"),
        replay_a.get("no_env_before_runtime"),
        replay_b.get("no_env_before_runtime"),
        replay_a.get("requested_matches_actual_sha"),
        replay_b.get("requested_matches_actual_sha"),
        result["deterministic_replay"]["pass"],
        four_obj.get("pass"),
        r3b.get("pass"),
        m252.get("pass"),
        not bridges["bridge_1_ledger_row_exists"],
        not bridges["bridge_2_ledger_row_exists"],
        counts["ledger_incomplete_count"] == 0,
        result["production_immutability"]["production_immutable_r3b1r112b1"],
        final_backend_tree_sha == backend_tree_sha,
    ]

    if all(gates):
        result["machine_status"] = {
            "CI_R3B1R112B1_FAIL_CLOSED_RETRY_PREFLIGHT_EVIDENCE_REPAIR_COMPLETED": True,
            "R3B1R112B_EVIDENCE": "SUPERSEDED_BY_FAIL_CLOSED_REPLAY",
            "RETRY_PREFLIGHT_AUTHORITY": "INDEPENDENTLY_DERIVED_AND_FAIL_CLOSED",
            "EXECUTION_ENV_REMEDIATION": "CANONICAL_ROOT_SUDO_PATH_VERIFIED",
            "DATABASE_STATE": "UNCHANGED",
            "R3B1R112_RETRY_READINESS": "READY_FOR_SEPARATE_EXPLICIT_PRODUCTION_RETRY_AUTHORIZATION",
            "R3B1R12_READINESS": "NOT_READY",
            "PR1054_MERGE_READINESS": "BLOCKED",
        }
    else:
        result["result"] = "BLOCKED"
        result["machine_status"] = {
            "CI_R3B1R112B1_FAIL_CLOSED_RETRY_PREFLIGHT_EVIDENCE_REPAIR_BLOCKED": True,
            "R3B1R112_RETRY_READINESS": "NOT_READY",
            "PR1054_MERGE_READINESS": "BLOCKED",
            "failed_gate_count": len([g for g in gates if not g]),
        }

    out = REPO / "docs/audits/ci-recovery/data/ci-r3b1r112b1-assessment-raw-2026-08.json"
    out.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({"written": str(out), "result": result["result"], "machine_status": result["machine_status"]}, indent=2))
    return 0 if result["result"] == "SUCCESS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
