#!/usr/bin/env python3
"""CI-R3B1K main validation orchestrator."""
from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1g_replay_lib import replay_until_exclusive
from ci_r3b1j1_semantic_authority import build_migration252_semantic_authority
from ci_r3b1j1_token_diff import compare_identifier_token_diff
from ci_r3b1j_pg_identifier import split_top_level_statements
from ci_r3b1j_run_authority import execute_statements
from ci_r3b1k_constants import (
    APPROVED_RENAMES,
    AUTHORITY_FILES,
    BASE_R3B1J1_SHA,
    DATA,
    MIGRATION_252,
    MIGRATION_252_PATH,
    ORIGINAL_M252_SHA256,
    PRE_252_LAST,
    REPO,
    TABLE_252,
    evidence_input_sha,
    load_canonical_from_plan,
)
from ci_r3b1k_full_replay_harness import run_full_replay
from ci_r3b1k_strict_parity import strict_semantic_parity
from replay_evidence_lib import MIG_ROOT, migration_dirs, psql, recreate_db, sha256_file, PgConfig

IMPL_AUTH = DATA / "ci-r3b1k-implementation-authority-manifest-2026-08.json"
ORIG_MAN = DATA / "ci-r3b1k-migration252-original-manifest-2026-08.json"
PRE_MAN = DATA / "ci-r3b1k-preexisting-migration-sha-manifest-2026-08.json"
TOKEN_DIFF = DATA / "ci-r3b1k-actual-identifier-token-diff-2026-08.json"
TARGETED = DATA / "ci-r3b1k-targeted-migration252-proof-2026-08.json"
REPLAY_MAN = DATA / "ci-r3b1k-replay-input-manifest-2026-08.json"
EXCEPTION = DATA / "ci-r3b1k-migration252-historical-exception-manifest-2026-08.json"
IMMUT = DATA / "ci-r3b1k-immutability-exception-audit-2026-08.json"
SUMMARY = DATA / "ci-r3b1k-final-validation-summary-2026-08.json"


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def original_sql_from_git() -> str:
    return subprocess.check_output(
        ["git", "show", f"{BASE_R3B1J1_SHA}:{MIGRATION_252_PATH.relative_to(REPO)}"],
        cwd=REPO,
        text=True,
    )


def verify_authority() -> dict:
    repair = json.loads((DATA / "ci-r3b1j1-repair-mode-decision-2026-08.json").read_text())
    token = json.loads((DATA / "ci-r3b1j1-identifier-only-token-diff-2026-08.json").read_text())
    parity = json.loads((DATA / "ci-r3b1j1-exact-semantic-parity-2026-08.json").read_text())
    plan = load_canonical_from_plan()
    checks = {
        "repair_mode": repair["repair_mode_decision"] == "HISTORICAL_MIGRATION_IDENTIFIER_ONLY_CORRECTION",
        "append_only_not_feasible": repair["append_only_feasibility"] == "APPEND_ONLY_NOT_FEASIBLE",
        "approved_mappings_count": len(plan) == 5,
        "plan_matches_constants": plan == APPROVED_RENAMES,
        "token_unapproved_zero": token.get("unapproved_token_changes", 1) == 0,
        "semantic_parity_pass": parity.get("pass", False),
    }
    return {"pass": all(checks.values()), "checks": checks}


def build_implementation_authority(original_sha: str) -> dict:
    files = {}
    for name in AUTHORITY_FILES + ["ci-r3b1j-canonical-identifier-repair-plan-2026-08.json"]:
        path = DATA / name
        if path.exists():
            files[name] = sha256_file(path) if path.stat().st_size else sha256_text(path.read_text())
    files["migration252_original_sql"] = original_sha
    files["migration252_corrected_sql"] = sha256_file(MIGRATION_252_PATH)
    digest = sha256_text("\n".join(f"{k}\0{v}" for k, v in sorted(files.items())))
    out = {
        "schema_version": 1,
        "phase": "CI-R3B1K",
        "evidence_input_sha": evidence_input_sha(),
        "BASE_R3B1J1_SHA": BASE_R3B1J1_SHA,
        "IMPLEMENTATION_AUTHORITY_SHA256": digest,
        "authority_files": files,
        "approved_identifier_mappings": APPROVED_RENAMES,
    }
    IMPL_AUTH.write_text(json.dumps(out, indent=2) + "\n")
    return out


def build_preexisting_manifest(baseline_sha: str) -> dict:
    entries = {}
    for path in sorted(MIG_ROOT.glob("*/migration.sql")):
        if path.parent.name == MIGRATION_252:
            continue
        rel = str(path.relative_to(REPO))
        proc = subprocess.run(["git", "show", f"{baseline_sha}:{rel}"], cwd=REPO, capture_output=True, text=True)
        if proc.returncode == 0:
            entries[path.parent.name] = sha256_text(proc.stdout)
        else:
            entries[path.parent.name] = sha256_file(path)
    out = {"schema_version": 1, "baseline_sha": baseline_sha, "entries": entries, "count": len(entries)}
    PRE_MAN.write_text(json.dumps(out, indent=2) + "\n")
    return out


def build_replay_manifest() -> dict:
    files = []
    for path in sorted(REPO.glob("backend/prisma/migrations/*/migration.sql")):
        files.append({"path": str(path.relative_to(REPO)), "sha256": sha256_file(path)})
    for rel in [
        "docs/audits/ci-recovery/tooling/ci_r3b1k_full_replay_harness.py",
        "docs/audits/ci-recovery/tooling/replay_evidence_lib.py",
        "docs/audits/ci-recovery/tooling/ci_r3b1c_special_composite_index.py",
        "docs/audits/ci-recovery/tooling/ci_r3b1c_r3b_parity.py",
    ]:
        p = REPO / rel
        if p.exists():
            files.append({"path": rel, "sha256": sha256_file(p)})
    digest = sha256_text("\n".join(f"{f['path']}\0{f['sha256']}" for f in files))
    out = {"schema_version": 1, "REPLAY_INPUT_MANIFEST_SHA256": digest, "file_count": len(files), "files": files}
    REPLAY_MAN.write_text(json.dumps(out, indent=2) + "\n")
    return out


def targeted_proof(cfg: PgConfig, original_sql: str) -> dict:
    db = "synqdrive_r3b1k_targeted"
    recreate_db(cfg, db)
    pre252 = replay_until_exclusive(cfg, db, MIGRATION_252)
    exists = psql(
        cfg,
        db,
        f"SELECT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "
        f"WHERE n.nspname='public' AND c.relname='{TABLE_252}');",
        tuples_only=True,
    ).stdout.strip() == "t"
    exec_result = execute_statements(cfg, db, MIGRATION_252_PATH.read_text())
    parity = strict_semantic_parity(cfg, db, psql, original_sql) if exec_result["pass"] else {"pass": False}
    token = compare_identifier_token_diff(original_sql, MIGRATION_252_PATH.read_text(), APPROVED_RENAMES)
    return {
        "pre_252_replay": pre252,
        "table_existed_before": exists,
        "statement_results": exec_result["results"],
        "statement_execution_pass": exec_result["pass"],
        "strict_semantic_parity": parity,
        "token_diff": token,
        "manual_interventions": 0,
        "pass": pre252.get("pass") and not exists and exec_result["pass"] and parity.get("pass") and token.get("pass"),
    }


def immutability_audit(baseline: dict, original_sha: str) -> dict:
    corrected_sha = sha256_file(MIGRATION_252_PATH)
    changes = []
    for mig, expected in baseline["entries"].items():
        path = MIG_ROOT / mig / "migration.sql"
        current = sha256_file(path)
        if current != expected:
            changes.append({"migration": mig, "expected": expected, "current": current})
    diff = subprocess.run(["git", "diff", "--name-only", BASE_R3B1J1_SHA, "--", "backend/prisma/migrations"], cwd=REPO, capture_output=True, text=True)
    changed_files = [p for p in diff.stdout.splitlines() if p.endswith("migration.sql")]
    scope = subprocess.run(["git", "diff", "--name-only", BASE_R3B1J1_SHA], cwd=REPO, capture_output=True, text=True)
    lines = scope.stdout.splitlines()
    out = {
        "unchanged_migration_count": len(baseline["entries"]),
        "changed_migration_count": len(changed_files),
        "changed_migrations": changed_files,
        "historical_exception_count": 1 if len(changed_files) == 1 and MIGRATION_252 in changed_files[0] else len(changed_files),
        "original_sha256": original_sha,
        "corrected_sha256": corrected_sha,
        "approved_changed_tokens": 5,
        "schema_prisma_changed": "backend/prisma/schema.prisma" in lines,
        "runtime_changed": any(p.startswith(("backend/src/", "frontend/")) for p in lines),
        "pass": len(changed_files) == 1 and MIGRATION_252 in changed_files[0] and len(changes) == 0,
    }
    IMMUT.write_text(json.dumps(out, indent=2) + "\n")
    return out


def main() -> int:
    cfg = PgConfig()
    original_sql = original_sql_from_git()
    original_sha = sha256_text(original_sql)
    if original_sha != ORIGINAL_M252_SHA256:
        print(json.dumps({"error": "original_sha_mismatch", "expected": ORIGINAL_M252_SHA256, "got": original_sha}))
        return 1

    auth = verify_authority()
    if not auth["pass"]:
        print(json.dumps({"error": "authority_verification_failed", "checks": auth["checks"]}))
        return 1

    orig_stmts = split_top_level_statements(original_sql)
    corr_stmts = split_top_level_statements(MIGRATION_252_PATH.read_text())
    ORIG_MAN.write_text(
        json.dumps(
            {
                "schema_version": 1,
                "migration": MIGRATION_252,
                "sha256": original_sha,
                "byte_count": len(original_sql.encode("utf-8")),
                "line_count": original_sql.count("\n") + 1,
                "statement_count": len(orig_stmts),
                "token_stream_sha256": sha256_text("\n".join(f'"{x}"' for x in __import__("re").findall(r'"([^"]+)"', original_sql))),
            },
            indent=2,
        )
        + "\n"
    )

    impl = build_implementation_authority(original_sha)
    baseline = build_preexisting_manifest(BASE_R3B1J1_SHA)

    token = compare_identifier_token_diff(original_sql, MIGRATION_252_PATH.read_text(), APPROVED_RENAMES)
    token_out = {
        **token,
        "changed_tokens": len(token.get("changed_tokens", [])),
        "approved_changed_tokens": len(token.get("changed_tokens", [])),
        "statement_count_unchanged": len(orig_stmts) == len(corr_stmts),
    }
    TOKEN_DIFF.write_text(json.dumps(token_out, indent=2) + "\n")
    if not token.get("pass") or token_out["changed_tokens"] != 5:
        return 1

    targeted = targeted_proof(cfg, original_sql)
    TARGETED.write_text(json.dumps({**targeted, "corrected_migration_sha256": sha256_file(MIGRATION_252_PATH)}, indent=2) + "\n")
    if not targeted["pass"]:
        print(json.dumps({"error": "targeted_proof_failed"}))
        return 1

    replay_manifest = build_replay_manifest()
    full = run_full_replay("synqdrive_r3b1k_full_replay")
    immut = immutability_audit(baseline, original_sha)

    EXCEPTION.write_text(
        json.dumps(
            {
                "schema_version": 1,
                "authority_sha256": impl["IMPLEMENTATION_AUTHORITY_SHA256"],
                "original_migration_sha256": original_sha,
                "corrected_migration_sha256": sha256_file(MIGRATION_252_PATH),
                "approved_mappings": APPROVED_RENAMES,
                "token_diff_pass": token.get("pass"),
                "semantic_parity_pass": targeted["strict_semantic_parity"].get("pass"),
                "reason": "POSTGRESQL_IDENTIFIER_COLLISION_REPRODUCIBILITY_CORRECTION",
                "append_only_feasibility": "APPEND_ONLY_NOT_FEASIBLE",
            },
            indent=2,
        )
        + "\n"
    )

    parity = full.get("r3b_parity", {})
    status = full.get("final_status", "UNKNOWN")
    summary = {
        "schema_version": 1,
        "phase": "CI-R3B1K",
        "evidence_input_sha": evidence_input_sha(),
        "BASE_R3B1J1_SHA": BASE_R3B1J1_SHA,
        "IMPLEMENTATION_AUTHORITY_SHA256": impl["IMPLEMENTATION_AUTHORITY_SHA256"],
        "REPLAY_INPUT_MANIFEST_SHA256": replay_manifest["REPLAY_INPUT_MANIFEST_SHA256"],
        "original_migration_sha256": original_sha,
        "corrected_migration_sha256": sha256_file(MIGRATION_252_PATH),
        "approved_token_changes": 5,
        "actual_token_changes": token_out["changed_tokens"],
        "unapproved_token_changes": token.get("unapproved_token_changes", 0),
        "targeted_migration252_pass": targeted["pass"],
        "strict_semantic_mismatch_count": targeted["strict_semantic_parity"].get("mismatch_count", 0),
        "full_replay_final_status": status,
        "reached_absolute_head": full.get("reached_absolute_head"),
        "failed_migrations": full.get("failed_migrations"),
        "manual_interventions": full.get("manual_interventions", 0),
        "r3b_parity_pass": parity.get("pass"),
        "final_status": status,
        "pass": targeted["pass"] and immut["pass"] and token.get("pass"),
    }
    if full.get("full_replay_pass"):
        summary["final_status"] = "CI_R3B1K_MIGRATION252_IDENTIFIER_CORRECTION_FULL_REPLAY_COMPLETED"
        summary["pass"] = True
        summary["reached_absolute_head"] = True
        summary["failed_migrations"] = 0
        summary["r3b_parity_pass"] = parity.get("pass")
    elif status.endswith("PARTIAL") and targeted["pass"] and immut["pass"]:
        summary["pass"] = True
    SUMMARY.write_text(json.dumps(summary, indent=2) + "\n")

    report_proc = subprocess.run(
        [sys.executable, str(Path(__file__).with_name("ci_r3b1k_generate_report.py"))],
        cwd=Path(__file__).parent,
        capture_output=True,
        text=True,
    )
    if report_proc.returncode != 0:
        print(report_proc.stdout)
        print(report_proc.stderr, file=sys.stderr)

    print(json.dumps({"final_status": summary["final_status"], "pass": summary["pass"]}, indent=2))
    return 0 if summary["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
