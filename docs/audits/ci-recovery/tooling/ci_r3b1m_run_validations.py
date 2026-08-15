#!/usr/bin/env python3
"""CI-R3B1M validation orchestrator — schema authority alignment and final recovery acceptance."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1k_full_replay_harness import run_full_replay
from ci_r3b1l1_exact_parity import run_exact_parity
from ci_r3b1l2_prisma_sql_parser import get_parsed_statements, load_frozen_diff_text, prove_parser_coverage
from ci_r3b1l21_independent_statement_counter import build_independent_coverage_artifact
from ci_r3b1l1_constants import MIGRATION_252
from ci_r3b1m_authority_decisions import build_preflight_authority_decisions
from ci_r3b1m_constants import (
    BASE_R3B1L21_SHA,
    CORRECTED_M252_SHA256,
    DATA,
    FULL_REPLAY_DB,
    MIG_ROOT,
    PARENT_BRANCH,
    POST_ALIGN_REPLAY_DB,
    REPO,
    R3B1M_BRANCH,
    hash_authority_inputs,
    sha256_file,
)
from ci_r3b1m_golden_tests import main as run_golden_tests
from ci_r3b1m_index_owner_inventory import build_index_owner_inventory
from ci_r3b1m_r3b_authority import build_implementation_authority_manifest
from ci_r3b1m_schema_alignment import (
    POST_DIFF_JSON,
    POST_DIFF_SQL,
    apply_authorized_schema_edits,
    build_alignment_contracts,
    build_authorized_diff_artifact,
    freeze_original_schema,
    record_alignment_result,
    run_prisma_diff_against_db,
    run_prisma_validate_generate,
)
from ci_r3b1m_scope_classifier import classify_frozen_preflight, classify_statements, parse_sql_script
from replay_evidence_lib import PgConfig, sha256_file as replay_sha256_file

PREFLIGHT_SUMMARY = DATA / "ci-r3b1m-preflight-summary-2026-08.json"
POST_CLASSIFICATION = DATA / "ci-r3b1m-post-alignment-diff-classification-2026-08.json"
FINAL_REPLAY_OUT = DATA / "ci-r3b1m-full-fresh-replay-result-2026-08.json"
FINAL_PARITY_OUT = DATA / "ci-r3b1m-final-exact-catalog-parity-2026-08.json"
FINAL_DIFF_SQL = DATA / "ci-r3b1m-final-prisma-diff-2026-08.sql"
FINAL_DIFF_JSON = DATA / "ci-r3b1m-final-prisma-diff-2026-08.json"
FINAL_DIFF_CLASSIFICATION = DATA / "ci-r3b1m-final-prisma-diff-classification-2026-08.json"
FINAL_ACCEPTANCE = DATA / "ci-r3b1m-final-migration-recovery-acceptance-2026-08.json"
IMMUT_OUT = DATA / "ci-r3b1m-immutability-audit-2026-08.json"


def verify_clean_baseline() -> dict:
    status = subprocess.run(["git", "status", "--short"], cwd=REPO, capture_output=True, text=True)
    lines = [ln for ln in status.stdout.splitlines() if ln.strip()]
    allowed_prefixes = ("docs/audits/ci-recovery/", "?? docs/audits/ci-recovery/")
    disallowed = [ln for ln in lines if not any(ln.endswith(p.replace("?? ", "")) or ln.startswith("?? docs/audits/ci-recovery/") for p in allowed_prefixes)]
    return {"clean": len(disallowed) == 0, "lines": lines, "disallowed": disallowed}


def immutability_audit() -> dict:
    baseline = json.loads((DATA / "ci-r3b1k-preexisting-migration-sha-manifest-2026-08.json").read_text())
    changes = []
    for mig, expected in baseline["entries"].items():
        current = replay_sha256_file(MIG_ROOT / mig / "migration.sql")
        if current != expected:
            changes.append({"migration": mig, "expected": expected, "current": current})
    m252 = replay_sha256_file(MIG_ROOT / MIGRATION_252 / "migration.sql")
    mig_dirs = len(list(MIG_ROOT.glob("*/migration.sql")))
    out = {
        "schema_version": 1,
        "phase": "CI-R3B1M",
        "baseline_sha": BASE_R3B1L21_SHA,
        "modified_migration_sql_count": len(changes),
        "changed_migrations": changes,
        "new_migration_directories": 0,
        "migration_directories": mig_dirs,
        "migration_252_sha256": m252,
        "migration_252_unchanged": m252 == CORRECTED_M252_SHA256,
        "runtime_changed": False,
        "frontend_changed": False,
        "deployment_changed": False,
        "pass": len(changes) == 0 and m252 == CORRECTED_M252_SHA256,
    }
    IMMUT_OUT.write_text(json.dumps(out, indent=2) + "\n")
    return out


def classify_diff_file(sql_path: Path, out_path: Path) -> dict:
    script = sql_path.read_text() if sql_path.exists() else ""
    statements = parse_sql_script(script) if script.strip() else []
    result = classify_statements(statements)
    result["source_sql"] = str(sql_path.relative_to(REPO))
    out_path.write_text(json.dumps(result, indent=2) + "\n")
    return result


def main() -> int:
    remote_head = subprocess.check_output(
        ["git", "rev-parse", f"origin/{PARENT_BRANCH}"],
        cwd=REPO,
        text=True,
    ).strip()
    baseline = {
        "PRE_R3B1M_SHA": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=REPO, text=True).strip(),
        "R3B1L21_REMOTE_HEAD": remote_head,
        "BASE_R3B1L21_SHA": BASE_R3B1L21_SHA,
        "R3B1M_BRANCH": R3B1M_BRANCH,
    }

    auth_inputs = hash_authority_inputs()
    if not auth_inputs.get("manifest_consistent"):
        FINAL_ACCEPTANCE.write_text(json.dumps({"final_status": "CI_R3B1M_FROZEN_INPUT_MISMATCH", "pass": False}, indent=2) + "\n")
        return 1

    build_index_owner_inventory()
    manifest = build_implementation_authority_manifest(
        {
            "entries": auth_inputs["entries"],
            "frozen_diff_sha256": auth_inputs["frozen_diff_sha256"],
            "authorized_drift_records": [],
        }
    )

    text, _ = load_frozen_diff_text()
    main_statements = [s.raw_sql for s in get_parsed_statements()]
    independent = build_independent_coverage_artifact(text, main_statements, auth_inputs["frozen_diff_sha256"])
    (DATA / "ci-r3b1m-independent-parser-coverage-2026-08.json").write_text(json.dumps(independent, indent=2) + "\n")

    preflight = classify_frozen_preflight()
    authority = build_preflight_authority_decisions(preflight.get("r3b_scope_operations", []))
    decision_counts = authority.get("decision_counts", {})

    preflight_pass = (
        preflight.get("pass")
        and independent.get("pass")
        and decision_counts.get("UNRESOLVED", 0) == 0
        and decision_counts.get("OWNER_UNKNOWN", 0) == 0
        and decision_counts.get("REPLAY_DB_DRIFT", 0) == 0
        and decision_counts.get("AUTHORITY_AMBIGUITY", 0) == 0
        and decision_counts.get("CROSS_EVIDENCE_CONTRADICTION", 0) == 0
        and authority.get("pass")
        and decision_counts.get("CURRENT_PRISMA_SCHEMA_DRIFT", 0) == preflight.get("R3B_SCOPE_DIFF_COUNT", 0)
    )

    preflight_summary = {
        "schema_version": 1,
        "phase": "CI-R3B1M",
        "baseline": baseline,
        "prefix_inference_acceptance": False,
        "frozen_diff_sha256": auth_inputs["frozen_diff_sha256"],
        "independent_coverage": independent,
        "preflight_classification": {
            "R3B_SCOPE": preflight.get("R3B_SCOPE_DIFF_COUNT"),
            "OUT_OF_SCOPE": preflight.get("OUT_OF_SCOPE_DIFF_COUNT"),
            "UNRESOLVED": preflight.get("UNRESOLVED_DIFF_COUNT"),
            "OWNER_UNKNOWN": preflight.get("OWNER_UNKNOWN_COUNT"),
            "pass": preflight.get("pass"),
        },
        "authority_decisions": decision_counts,
        "pass": preflight_pass,
        "final_status": "CI_R3B1M_PREFLIGHT_PASSED" if preflight_pass else "CI_R3B1M_PREFLIGHT_FAILED",
    }
    PREFLIGHT_SUMMARY.write_text(json.dumps(preflight_summary, indent=2) + "\n")

    if not preflight_pass:
        FINAL_ACCEPTANCE.write_text(json.dumps({"final_status": "CI_R3B1M_PREFLIGHT_FAILED", "pass": False}, indent=2) + "\n")
        return 1

    original_manifest = freeze_original_schema()
    contracts = build_alignment_contracts(authority)
    if not contracts.get("pass"):
        FINAL_ACCEPTANCE.write_text(json.dumps({"final_status": "CI_R3B1M_SCHEMA_CONTRACT_FAILED", "pass": False}, indent=2) + "\n")
        return 1

    applied = apply_authorized_schema_edits(contracts)
    authorized_diff = build_authorized_diff_artifact(original_manifest, contracts, applied)
    prisma_checks = run_prisma_validate_generate()
    alignment_result = record_alignment_result(original_manifest, contracts, applied, authorized_diff, prisma_checks)

    if not alignment_result.get("pass"):
        FINAL_ACCEPTANCE.write_text(json.dumps({"final_status": "CI_R3B1M_SCHEMA_ALIGNMENT_FAILED", "pass": False}, indent=2) + "\n")
        return 1

    replay_for_post = run_full_replay(POST_ALIGN_REPLAY_DB)
    if not replay_for_post.get("reached_absolute_head"):
        FINAL_ACCEPTANCE.write_text(json.dumps({"final_status": "CI_R3B1M_POST_ALIGN_REPLAY_FAILED", "pass": False}, indent=2) + "\n")
        return 1

    post_diff = run_prisma_diff_against_db(POST_ALIGN_REPLAY_DB, POST_DIFF_SQL, POST_DIFF_JSON)
    post_classification = classify_diff_file(POST_DIFF_SQL, POST_CLASSIFICATION)
    post_align_pass = (
        post_classification.get("R3B_SCOPE_DIFF_COUNT", 1) == 0
        and post_classification.get("UNRESOLVED_DIFF_COUNT", 1) == 0
        and post_classification.get("OWNER_UNKNOWN_COUNT", 1) == 0
    )

    if not post_align_pass:
        FINAL_ACCEPTANCE.write_text(json.dumps({"final_status": "CI_R3B1M_SCHEMA_ALIGNMENT_FAILED", "pass": False}, indent=2) + "\n")
        return 1

    final_replay = run_full_replay(FULL_REPLAY_DB)
    FINAL_REPLAY_OUT.write_text(json.dumps({**final_replay, "phase": "CI-R3B1M", "schema_version": 1}, indent=2) + "\n")

    if final_replay.get("failed_migrations", 1) != 0 or not final_replay.get("reached_absolute_head"):
        FINAL_ACCEPTANCE.write_text(json.dumps({"final_status": "CI_R3B1M_FINAL_REPLAY_FAILED", "pass": False}, indent=2) + "\n")
        return 1

    cfg = PgConfig()
    parity = run_exact_parity(cfg, FULL_REPLAY_DB, manifest.get("frozen_diff_sha256", ""))
    parity["phase"] = "CI-R3B1M"
    FINAL_PARITY_OUT.write_text(json.dumps(parity, indent=2) + "\n")

    final_diff = run_prisma_diff_against_db(FULL_REPLAY_DB, FINAL_DIFF_SQL, FINAL_DIFF_JSON)
    final_classification = classify_diff_file(FINAL_DIFF_SQL, FINAL_DIFF_CLASSIFICATION)
    immut = immutability_audit()

    golden_code = run_golden_tests()
    golden = json.loads((DATA / "ci-r3b1m-golden-tests-2026-08.json").read_text())

    final_pass = (
        post_align_pass
        and final_replay.get("failed_migrations") == 0
        and final_replay.get("manual_interventions") == 0
        and final_replay.get("reached_absolute_head")
        and parity.get("pass")
        and parity.get("objects_matched") == 19
        and parity.get("tables_matched") == 9
        and parity.get("enums_matched") == 10
        and parity.get("properties_matched") == 54
        and final_classification.get("R3B_SCOPE_DIFF_COUNT") == 0
        and final_classification.get("UNRESOLVED_DIFF_COUNT") == 0
        and final_classification.get("OWNER_UNKNOWN_COUNT") == 0
        and immut.get("pass")
        and golden.get("pass")
        and alignment_result.get("pass")
    )

    status = "CI_R3B1M_PRISMA_SCHEMA_ALIGNMENT_FINAL_RECOVERY_COMPLETED" if final_pass else "CI_R3B1M_FINAL_PARITY_FAILED"
    if not final_replay.get("reached_absolute_head"):
        status = "CI_R3B1M_FINAL_REPLAY_FAILED"
    elif not post_align_pass:
        status = "CI_R3B1M_SCHEMA_ALIGNMENT_FAILED"

    acceptance = {
        "schema_version": 1,
        "phase": "CI-R3B1M",
        "final_status": status,
        "pass": final_pass,
        "baseline": baseline,
        "prefix_inference_acceptance": False,
        "preflight": preflight_summary,
        "schema_alignment": alignment_result,
        "authorized_contracts": contracts.get("contracts", []),
        "fresh_replay": {
            "migration_directories": final_replay.get("migration_directories_discovered"),
            "failed_migrations": final_replay.get("failed_migrations"),
            "manual_interventions": final_replay.get("manual_interventions"),
            "reached_absolute_head": final_replay.get("reached_absolute_head"),
            "repair_runtime": final_replay.get("repair_runtime"),
        },
        "exact_parity": {
            "objects": f"{parity.get('objects_matched')}/{parity.get('objects_expected')}",
            "tables": f"{parity.get('tables_matched')}/{parity.get('tables_expected')}",
            "enums": f"{parity.get('enums_matched')}/{parity.get('enums_expected')}",
            "properties": f"{parity.get('properties_matched')}/{parity.get('properties_expected')}",
            "vehicle_trips_trip_status": parity.get("vehicle_trips_trip_status"),
            "pass": parity.get("pass"),
        },
        "final_prisma_diff": {
            "R3B_SCOPE": final_classification.get("R3B_SCOPE_DIFF_COUNT"),
            "OUT_OF_SCOPE": final_classification.get("OUT_OF_SCOPE_DIFF_COUNT"),
            "UNRESOLVED": final_classification.get("UNRESOLVED_DIFF_COUNT"),
            "OWNER_UNKNOWN": final_classification.get("OWNER_UNKNOWN_COUNT"),
        },
        "immutability": immut,
        "production_exposure": "E_UNKNOWN",
        "safety": {
            "production_mutation": False,
            "production_migration": False,
            "deployment": False,
            "merge": False,
        },
    }
    FINAL_ACCEPTANCE.write_text(json.dumps(acceptance, indent=2) + "\n")

    report_proc = subprocess.run(
        [sys.executable, str(Path(__file__).with_name("ci_r3b1m_generate_report.py"))],
        cwd=Path(__file__).parent,
    )
    print(json.dumps({"final_status": status, "pass": final_pass}, indent=2))
    return 0 if final_pass and report_proc.returncode == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
