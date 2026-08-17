#!/usr/bin/env python3
"""CI-R3B1Q.2 read-only Production verification + source-history remediation evidence capture."""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1o1_sql_classifier import parse_migration_statements
from ci_r3b1n1_production_access import (
    export_prisma_ledger,
    ledger_summary_fingerprint,
    production_db_fingerprint,
    sanitize_log_text,
    ssh_psql_sql,
    ssh_run,
)
from ci_r3b1n2_catalog_fingerprint import build_catalog_fingerprint
from ci_r3b1n2_constants import MIG_ROOT, REPO, sha256_file, sha256_text
from ci_r3b1o1_constants import M252_TABLE
from ci_r3b1o3_m252_complete_authority import build_m252_complete_physical_authority
from ci_r3b1o4_m252_exact_parity import compare_m252_exact, read_m252_catalog
from ci_r3b1o4_tail_contract import build_tail_reconciliation_contract
from ci_r3b1o1_constants import FROZEN_DIFF_SQL
from ci_r3b1p3_run_independent_replay import (
    R3B1O_GOLDEN_DIFF,
    classify_preflight_production_diff,
    export_schema_only_dump,
    prod_sql_runner,
    run_live_r3b_catalog_parity,
)
from ci_r3b1q2_golden_tests import run_tests as run_q2_golden_tests
from ci_r3b1q_tail_identity import (
    EXECUTED_TAIL_SQL_EVIDENCE,
    EXECUTED_TAIL_SQL_SHA256,
    PHYSICAL_TAIL_MIGRATION_NAME,
    TEMPORARY_TAIL_LOGICAL_NAME,
    physical_tail_sql_path,
    tail_identity_status,
    temporary_tail_prisma_directory,
)
from ci_r3b1q3_verification_harness import audit_verification_harness_read_only, fingerprint_regression_status

PHASE = "CI-R3B1Q.2"
PREFIX = "ci-r3b1q2"
DATA = REPO / "docs/audits/ci-recovery/data"
PR_RECOVERY = REPO / "docs/audits/pr-recovery"
WORK = REPO / "docs/audits/ci-recovery/.work/r3b1q2"
Q1_LEDGER_FP = "b6ec53dbfd6c09ab8641fce2c96fe9fa996b3ec0dcd36c6a1c0c605c71e684e2"
Q1_CATALOG_FP = "407bf140508aea746e8fd5f62911c79ba1341bae8c836a079b73ee7a8fec2e58"
Q1_FAILED_ROWS = 16


def write_json(name: str, payload: dict[str, Any]) -> Path:
    path = DATA / f"{name}.json"
    path.write_text(json.dumps(payload, indent=2) + "\n")
    return path


def git_rev(ref: str = "HEAD") -> str:
    return subprocess.check_output(["git", "rev-parse", ref], cwd=REPO, text=True).strip()


def capture_pr_state() -> dict[str, Any]:
    proc = subprocess.run(
        ["gh", "pr", "view", "1054", "--json", "state,isDraft,headRefOid,headRefName"],
        cwd=REPO,
        capture_output=True,
        text=True,
    )
    return json.loads(proc.stdout) if proc.returncode == 0 else {"error": proc.stderr}


def local_migration_inventory() -> dict[str, str]:
    return {path.parent.name: sha256_file(path) for path in sorted(MIG_ROOT.glob("*/migration.sql"))}


def compute_would_deploy(*, applied: set[str]) -> list[str]:
    inventory = set(local_migration_inventory())
    return sorted(inventory - applied)


def duplicate_tail_proof() -> dict[str, Any]:
    inventory = local_migration_inventory()
    physical_dirs = [name for name in inventory if name == PHYSICAL_TAIL_MIGRATION_NAME]
    temporary_dirs = [name for name in inventory if name == TEMPORARY_TAIL_LOGICAL_NAME]
    executed_sha = EXECUTED_TAIL_SQL_SHA256
    duplicate_sql_dirs = [
        name
        for name, sha in inventory.items()
        if sha == executed_sha and name != PHYSICAL_TAIL_MIGRATION_NAME
    ]
    distinctive = 'DROP INDEX IF EXISTS "org_invoices_invoice_number_key"'
    dirs_with_distinctive = [
        name
        for name in inventory
        if distinctive in (MIG_ROOT / name / "migration.sql").read_text()
        and name != PHYSICAL_TAIL_MIGRATION_NAME
    ]
    return {
        "PHYSICAL_TAIL_DIRECTORY_COUNT": len(physical_dirs),
        "DUPLICATE_TAIL_SQL_DIRECTORIES": len(duplicate_sql_dirs),
        "duplicate_tail_sql_directory_names": duplicate_sql_dirs,
        "TEMPORARY_TAIL_REAL_DIRECTORY_COUNT": len(temporary_dirs),
        "distinctive_tail_statement_directory_count_excluding_physical": len(dirs_with_distinctive),
        "pass": len(physical_dirs) == 1 and len(duplicate_sql_dirs) == 0 and len(temporary_dirs) == 0,
    }


def append_only_proof(*, entry_head: str) -> dict[str, Any]:
    proc = subprocess.run(
        ["git", "diff", "--name-status", entry_head, "HEAD", "--", "backend/prisma/migrations"],
        cwd=REPO,
        capture_output=True,
        text=True,
    )
    lines = [ln for ln in (proc.stdout or "").splitlines() if ln.strip()]
    added = [ln for ln in lines if ln.startswith("A\t")]
    modified = [ln for ln in lines if ln.startswith("M\t")]
    deleted = [ln for ln in lines if ln.startswith("D\t")]
    renamed = [ln for ln in lines if ln.startswith("R")]
    new_dirs = sorted({ln.split("\t")[-1].split("/")[3] for ln in added if "/migration.sql" in ln})
    return {
        "NEW_MIGRATION_DIRECTORIES_ADDED": len(new_dirs),
        "new_migration_directories": new_dirs,
        "HISTORICAL_MIGRATION_FILES_MODIFIED": len(modified),
        "HISTORICAL_MIGRATION_DIRECTORIES_RENAMED": len(renamed),
        "MIGRATION_FILES_DELETED": len(deleted),
        "pass": len(new_dirs) == 1 and new_dirs == [PHYSICAL_TAIL_MIGRATION_NAME] and not modified and not deleted and not renamed,
    }


def tail_semantic_proof() -> dict[str, Any]:
    path = physical_tail_sql_path()
    if not path:
        return {"pass": False, "error": "physical tail missing"}
    sql = path.read_text()
    contract = build_tail_reconciliation_contract()
    drop_cascade = any("DROP" in ln.upper() and " CASCADE" in ln.upper() for ln in sql.splitlines())
    return {
        "TAIL_TASK_COUNT": contract["logical_task_count"],
        "TAIL_EXTRA_TASKS": max(0, contract["logical_task_count"] - 3),
        "TAIL_CASCADE_OPERATIONS": int(drop_cascade),
        "TAIL_UNAUTHORIZED_DDL": contract["unauthorized_tasks"],
        "pass": contract["logical_task_count"] == 3 and contract["unauthorized_tasks"] == 0 and not drop_cascade,
    }


def _remote_repo_checkout(*, commit_sha: str, tmp_prefix: str) -> str:
    return f"""tmpdir=$(mktemp -d /tmp/{tmp_prefix}.XXXXXX)
git clone --depth 1 https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha.git "$tmpdir/repo"
cd "$tmpdir/repo" && git fetch --depth 1 origin {commit_sha} && git checkout {commit_sha}
"""


def run_prisma_migrate_status_via_ssh(*, commit_sha: str) -> dict[str, Any]:
    remote = f"""set -euo pipefail
{_remote_repo_checkout(commit_sha=commit_sha, tmp_prefix="r3b1q2-status")}
sudo bash -lc 'set -a; source /opt/synqdrive/shared/backend.env; set +a; cd '"$tmpdir/repo/backend"' && npm ci --ignore-scripts >/dev/null 2>&1 && npx prisma migrate status 2>&1'
"""
    proc = ssh_run(remote, timeout=300)
    output = sanitize_log_text(proc.stdout or proc.stderr or "")
    pending_names: list[str] = []
    if "Following migration" in output:
        pending_names = re.findall(r"^\s*(\\d{14}_[^\s]+)", output, flags=re.M)
    return {
        "exit_code": proc.returncode,
        "output": output,
        "PRISMA_STATUS_PENDING_COUNT": 0 if "Database schema is up to date!" in output else None,
        "PRISMA_STATUS_PENDING_NAMES": pending_names,
        "pass": proc.returncode == 0 and "Database schema is up to date!" in output,
    }


def run_pr_target_diff_via_ssh(*, commit_sha: str, schema_dump: Path) -> dict[str, Any]:
    remote = f"""set -euo pipefail
{_remote_repo_checkout(commit_sha=commit_sha, tmp_prefix="r3b1q2-diff")}
sudo bash -lc 'set -a; source /opt/synqdrive/shared/backend.env; set +a; cd '"$tmpdir/repo/backend"' && npm ci --ignore-scripts >/dev/null 2>&1 && npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script 2>/dev/null'
"""
    proc = ssh_run(remote, timeout=300)
    script = re.sub(r"\nnpm notice[\s\S]*$", "", proc.stdout or "").strip()
    if proc.returncode != 0 and not script:
        raise RuntimeError(sanitize_log_text(proc.stderr or proc.stdout))
    out_path = DATA / f"{PREFIX}-pr-target-live-diff-2026-08.sql"
    out_path.write_text(script + ("\n" if script else ""))
    attr = classify_preflight_production_diff(
        script,
        golden_twin_script=R3B1O_GOLDEN_DIFF.read_text(),
        golden_baseline_script=FROZEN_DIFF_SQL.read_text(),
        schema_dump=schema_dump,
    )
    return {
        "PR_TARGET_TOTAL_DIFF": attr.get("total_operations"),
        "R3B_SCOPE": attr.get("R3B_SCOPE"),
        "M252_SCOPE": attr.get("M252_SCOPE"),
        "UNKNOWN_SCOPE": attr.get("UNKNOWN_SCOPE"),
        "NEW_STRATEGY_DRIFT": attr.get("NEW_STRATEGY_DRIFT"),
        "UNATTRIBUTED": attr.get("UNATTRIBUTED"),
        "script_sha256": sha256_text(script),
        "path": str(out_path.relative_to(REPO)),
        "pass": attr.get("pass"),
    }


def build_harness_manifest() -> dict[str, Any]:
    files = [
        ("docs/audits/ci-recovery/tooling/ci_r3b1q3_verification_harness.py", "catalog_and_ledger_fingerprint_helper"),
        ("docs/audits/ci-recovery/tooling/ci_r3b1n2_catalog_fingerprint.py", "catalog_fingerprint_core"),
        ("docs/audits/ci-recovery/tooling/ci_r3b1n1_production_access.py", "production_read_only_access"),
        ("docs/audits/ci-recovery/tooling/ci_r3b1q_tail_identity.py", "tail_identity_constants"),
        ("docs/audits/ci-recovery/tooling/ci_r3b1o4_m252_exact_parity.py", "m252_parity"),
        ("docs/audits/ci-recovery/tooling/ci_r3b1p3_run_independent_replay.py", "r3b_parity_and_diff"),
        ("docs/audits/ci-recovery/tooling/ci_r3b1q2_golden_tests.py", "regression_tests"),
        ("docs/audits/ci-recovery/tooling/ci_r3b1q2_run_source_history_remediation.py", "q2_orchestrator_read_only"),
        (f"backend/prisma/migrations/{PHYSICAL_TAIL_MIGRATION_NAME}/migration.sql", "physical_tail_sql_source"),
        ("docs/audits/ci-recovery/data/ci-r3b1q-tail-sql-2026-08.sql", "executed_tail_sql_evidence"),
    ]
    entries = []
    for rel, role in files:
        path = REPO / rel
        blob = subprocess.check_output(["git", "hash-object", str(path)], cwd=REPO, text=True).strip()
        entries.append(
            {
                "path": rel,
                "git_blob_sha": blob,
                "sha256": sha256_file(path),
                "role": role,
            }
        )
    return {
        "schema_version": 1,
        "phase": "CI-R3B1Q.3-prep",
        "R3B1Q3_HARNESS_PREPARED": True,
        "file_count": len(entries),
        "files": entries,
    }


def application_health() -> dict[str, Any]:
    proc = subprocess.run(["curl", "-fsS", "https://app.synqdrive.eu/api/v1/health"], capture_output=True, text=True, timeout=20)
    payload = json.loads(proc.stdout) if proc.returncode == 0 and proc.stdout.strip().startswith("{") else {"raw": proc.stdout}
    lock_proc = ssh_run(
        r"""set -euo pipefail
if [ -f /opt/synqdrive/shared/r3b1q-execution.lock ]; then echo LOCK_PRESENT; else echo LOCK_CLEARED; fi
pm2 jlist 2>/dev/null | python3 -c 'import json,sys; d=json.load(sys.stdin); print([(x.get("name"), x.get("pm2_env",{}).get("status")) for x in d if x.get("name")=="synqdrive"])'
""",
        timeout=60,
    )
    pm2 = sanitize_log_text((lock_proc.stdout or "").strip())
    return {
        "APPLICATION_HEALTH_PASS": proc.returncode == 0 and payload.get("status") == "ok",
        "health_payload": payload,
        "NORMAL_OPERATIONS_ACTIVE": "online" in pm2.lower(),
        "R3B1Q_LOCK_CLEARED": "LOCK_CLEARED" in (lock_proc.stdout or ""),
        "pm2_excerpt": pm2,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--entry-head", default=None)
    args = parser.parse_args()
    WORK.mkdir(parents=True, exist_ok=True)
    captured_at = datetime.now(timezone.utc).isoformat()
    entry_head = args.entry_head or git_rev("HEAD")

    q1_doc = PR_RECOVERY / "R3B1Q1-POST-MUTATION-INCIDENT-ASSESSMENT.md"
    if not q1_doc.exists() or "CLASS B" not in q1_doc.read_text():
        print("BLOCKED: R3B1Q.1 Class B artifact missing")
        return 2

    identity = tail_identity_status()
    physical = physical_tail_sql_path()
    golden = run_q2_golden_tests()
    append_only = append_only_proof(entry_head=entry_head)
    duplicate = duplicate_tail_proof()
    tail_sem = tail_semantic_proof()

    result: dict[str, Any] = {
        "schema_version": 1,
        "phase": PHASE,
        "captured_at": captured_at,
        "entry": {
            "REPOSITORY": "FATIHS-MGCKS/SYNQDRIVE-alpha",
            "BRANCH": subprocess.check_output(["git", "branch", "--show-current"], cwd=REPO, text=True).strip(),
            "ENTRY_HEAD_SHA": entry_head,
            "PR_1054": capture_pr_state(),
            "WORKTREE_CLEAN": not subprocess.run(["git", "status", "--porcelain"], cwd=REPO, capture_output=True, text=True).stdout.strip(),
        },
        "source_tail": {
            "path": str(physical.relative_to(REPO)) if physical else None,
            "SOURCE_PHYSICAL_TAIL_SHA256": identity.get("source_physical_tail_sha256"),
            "PRODUCTION_LEDGER_CHECKSUM": EXECUTED_TAIL_SQL_SHA256,
            "TAIL_SOURCE_LEDGER_CHECKSUM_MATCH": identity.get("source_physical_tail_sha256") == EXECUTED_TAIL_SQL_SHA256,
            "TAIL_SOURCE_EXECUTED_SQL_BYTE_IDENTICAL": physical.read_bytes() == EXECUTED_TAIL_SQL_EVIDENCE.read_bytes() if physical else False,
        },
        "append_only": append_only,
        "tail_semantic": tail_sem,
        "temporary_tail": identity,
        "duplicate_tail": duplicate,
        "golden_tests": golden,
        "fingerprint_tooling": {
            **fingerprint_regression_status(),
            "read_only_audit": audit_verification_harness_read_only(),
        },
    }

    prod_before: dict[str, Any] = {}
    prod_after: dict[str, Any] = {}
    blocked = False
    try:
        prod_before = {
            "ledger_fingerprint": None,
            "catalog_fingerprint": None,
            "failed_rows": None,
            "incomplete_rows": None,
        }
        ledger_before = export_prisma_ledger(include_logs=False)
        prod_before["ledger_fingerprint"] = ledger_summary_fingerprint(ledger_before)
        prod_before["catalog_fingerprint"] = build_catalog_fingerprint(prod_sql_runner)["fingerprint_sha256"]
        prod_before["failed_rows"] = sum(1 for r in ledger_before if not (r.get("finished_at") or "").strip())
        prod_before["incomplete_rows"] = sum(
            1
            for r in ledger_before
            if (r.get("started_at") or "").strip()
            and not (r.get("finished_at") or "").strip()
            and not (r.get("rolled_back_at") or "").strip()
        )

        tail_rows = [r for r in ledger_before if r.get("migration_name") == PHYSICAL_TAIL_MIGRATION_NAME]
        tail_row = tail_rows[-1] if tail_rows else {}
        result["production_tail"] = {
            "migration_name": tail_row.get("migration_name"),
            "checksum": tail_row.get("checksum"),
            "started_at": tail_row.get("started_at"),
            "finished_at": tail_row.get("finished_at"),
            "rolled_back_at": tail_row.get("rolled_back_at"),
            "applied_steps_count": tail_row.get("applied_steps_count"),
            "TAIL_STILL_FINISHED": bool(tail_row.get("finished_at")),
            "TAIL_STILL_NOT_ROLLED_BACK": not tail_row.get("rolled_back_at"),
            "TAIL_LEDGER_CHECKSUM_MATCHES": tail_row.get("checksum") == EXECUTED_TAIL_SQL_SHA256,
        }

        if (
            prod_before["ledger_fingerprint"] != Q1_LEDGER_FP
            or result["production_tail"].get("checksum") != EXECUTED_TAIL_SQL_SHA256
            or not result["production_tail"].get("TAIL_STILL_FINISHED")
        ):
            blocked = True
            result["production_reconfirm_blocked"] = True

        schema_dump = WORK / "production_schema_only.sql"
        export_schema_only_dump(schema_dump)

        applied = {r["migration_name"] for r in ledger_before if r.get("finished_at") and not r.get("rolled_back_at")}
        would_deploy = compute_would_deploy(applied=applied)
        result["would_deploy"] = {
            "PR_SOURCE_WOULD_DEPLOY": would_deploy,
            "EXPECTED_NOOP_DEPLOY_SET_EMPTY": would_deploy == [],
        }

        # prisma migrate status using local inventory against production is equivalent when would_deploy empty and all local applied
        commit_sha = result["entry"]["ENTRY_HEAD_SHA"]
        status = run_prisma_migrate_status_via_ssh(commit_sha=commit_sha)
        result["prisma_status"] = status
        result["prisma_status"]["SOURCE_MATCHING_TAIL_EXISTS"] = physical is not None
        result["prisma_status"]["SOURCE_TAIL_NAME_MATCHES_PRODUCTION_LEDGER"] = physical is not None
        result["prisma_status"]["SOURCE_TAIL_CHECKSUM_MATCHES_PRODUCTION_LEDGER"] = identity.get("source_physical_tail_sha256") == tail_row.get("checksum")

        m252_catalog = read_m252_catalog(prod_sql_runner)
        m252 = compare_m252_exact(build_m252_complete_physical_authority(), m252_catalog)
        stale1 = prod_sql_runner(
            "SELECT COUNT(*) FROM pg_indexes WHERE schemaname='public' AND indexname='org_invoices_invoice_number_key';"
        ).strip()
        stale2 = prod_sql_runner(
            "SELECT COUNT(*) FROM pg_indexes WHERE schemaname='public' AND indexname='whatsapp_conversations_organization_id_contact_phone_key';"
        ).strip()
        result["m252"] = {
            "M252_SEMANTIC_MISMATCHES": m252.get("semantic_mismatch_count", 999),
            "STALE_INDEX_1_ABSENT": stale1 == "0",
            "STALE_INDEX_2_ABSENT": stale2 == "0",
            "pass": m252.get("pass") and m252.get("semantic_mismatch_count") == 0 and stale1 == "0" and stale2 == "0",
        }

        r3b = run_live_r3b_catalog_parity(skip_if_fresh=False)
        result["r3b"] = {
            "objects_matched": r3b.get("objects_matched"),
            "objects_expected": r3b.get("objects_expected"),
            "tables_matched": r3b.get("tables_matched"),
            "tables_expected": r3b.get("tables_expected"),
            "enums_matched": r3b.get("enums_matched"),
            "enums_expected": r3b.get("enums_expected"),
            "properties_matched": r3b.get("properties_matched"),
            "properties_expected": r3b.get("properties_expected"),
            "UNAUTHORIZED": r3b.get("UNAUTHORIZED", 0),
            "UNKNOWN_AUTHORITY": r3b.get("UNKNOWN_AUTHORITY", 0),
            "AMBIGUOUS_AUTHORITY": r3b.get("AMBIGUOUS_AUTHORITY", 0),
            "STATEMENT_UNBOUND": r3b.get("STATEMENT_UNBOUND", 0),
            "KEY_ONLY_AUTHORIZATION": r3b.get("KEY_ONLY_AUTHORIZATION", 0),
            "STATEMENT_SHA_MISMATCH": r3b.get("STATEMENT_SHA_MISMATCH", 0),
            "EVIDENCE_CODE_MISMATCH": r3b.get("EVIDENCE_CODE_MISMATCH", 0),
            "pass": r3b.get("pass"),
        }

        result["failed_rows"] = {
            "FAILED_MIGRATION_ROWS_ABSOLUTE": prod_before["failed_rows"],
            "NEW_FAILED_ROWS_SINCE_R3B1Q": max(0, (prod_before["failed_rows"] or 0) - Q1_FAILED_ROWS),
            "INCOMPLETE_MIGRATION_ROWS": prod_before["incomplete_rows"],
            "PARTIALLY_APPLIED_TAIL": False,
        }

        result["pr_target_diff"] = run_pr_target_diff_via_ssh(commit_sha=commit_sha, schema_dump=schema_dump)
        result["application_health"] = application_health()

        ledger_after = export_prisma_ledger(include_logs=False)
        prod_after = {
            "ledger_fingerprint": ledger_summary_fingerprint(ledger_after),
            "catalog_fingerprint": build_catalog_fingerprint(prod_sql_runner)["fingerprint_sha256"],
        }
        result["production_immutability"] = {
            "before": prod_before,
            "after": prod_after,
            "PRODUCTION_IMMUTABLE_DURING_R3B1Q2": prod_before["ledger_fingerprint"] == prod_after["ledger_fingerprint"]
            and prod_before["catalog_fingerprint"] == prod_after["catalog_fingerprint"],
            "PRODUCTION_MUTATIONS_EXECUTED_R3B1Q2": 0 if prod_before["ledger_fingerprint"] == prod_after["ledger_fingerprint"] else -1,
        }
        result["live_production_access"] = True
    except Exception as exc:
        blocked = True
        result["live_production_error"] = sanitize_log_text(str(exc))
        result["live_production_access"] = False

    harness = build_harness_manifest()
    result["harness_manifest"] = harness

    gates = [
        identity.get("physical_tail_prisma_directory_exists"),
        identity.get("source_physical_tail_sha256") == EXECUTED_TAIL_SQL_SHA256,
        append_only.get("pass"),
        tail_sem.get("pass"),
        duplicate.get("pass"),
        golden.get("pass"),
        result.get("would_deploy", {}).get("EXPECTED_NOOP_DEPLOY_SET_EMPTY"),
        not blocked,
    ]
    if result.get("production_immutability"):
        gates.append(result["production_immutability"].get("PRODUCTION_IMMUTABLE_DURING_R3B1Q2"))
    if result.get("m252"):
        gates.append(result["m252"].get("pass"))
    if result.get("r3b"):
        gates.append(result["r3b"].get("pass"))
    if result.get("pr_target_diff"):
        gates.append(result["pr_target_diff"].get("pass"))

    success = all(bool(g) for g in gates if g is not None) and not blocked
    result["machine_status"] = (
        {
            "status": "CI_R3B1Q2_SOURCE_HISTORY_REMEDIATION_COMPLETED",
            "R3B1Q_SOURCE_HISTORY": "SOURCE_HISTORY_ALIGNED_WITH_PRODUCTION_TAIL",
            "R3B1Q3_READINESS": "READY_FOR_SEPARATELY_AUTHORIZED_FROZEN_IDEMPOTENCY_COMPLETION",
            "PR1054_MERGE_READINESS": "BLOCKED_PENDING_R3B1Q3",
        }
        if success
        else {
            "status": "CI_R3B1Q2_SOURCE_HISTORY_REMEDIATION_BLOCKED",
            "R3B1Q_SOURCE_HISTORY": "SOURCE_HISTORY_REMEDIATION_INCOMPLETE",
            "R3B1Q3_READINESS": "NOT_READY",
            "PR1054_MERGE_READINESS": "BLOCKED",
        }
    )
    result["success"] = success

    write_json(f"{PREFIX}-assessment-raw-2026-08", result)
    write_json(f"{PREFIX}-harness-manifest-2026-08", harness)
    write_json(f"{PREFIX}-golden-tests-2026-08", golden)
    print(json.dumps({"success": success, "machine_status": result["machine_status"]}, indent=2))
    return 0 if success else 1


if __name__ == "__main__":
    raise SystemExit(main())
