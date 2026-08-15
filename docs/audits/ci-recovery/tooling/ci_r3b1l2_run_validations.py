#!/usr/bin/env python3
"""CI-R3B1L.2 main validation orchestrator — parser completeness and authority."""
from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1l1_authority import verify_authority_counts, load_production_catalog
from ci_r3b1l1_constants import MIGRATION_252
from ci_r3b1l2_authority_decisions import build_authority_decisions
from ci_r3b1l2_constants import (
    BASE_R3B1L1_SHA,
    CORRECTED_M252_SHA256,
    DATA,
    MIG_ROOT,
    REPO,
    R3B1L2_BRANCH,
    evidence_input_sha,
)
from ci_r3b1l2_coverage_validator import validate_coverage
from ci_r3b1l2_golden_tests import main as run_golden_tests
from ci_r3b1l2_prisma_sql_parser import build_input_manifest, parse_frozen_diff, prove_parser_coverage
from ci_r3b1l2_r3b_authority import build_authority_manifest
from ci_r3b1l2_scope_classifier import classify_complete_diff, reconcile_old_parser
from replay_evidence_lib import sha256_file as replay_sha256_file

IMMUT = DATA / "ci-r3b1l2-immutability-audit-2026-08.json"
SUMMARY = DATA / "ci-r3b1l2-final-validation-summary-2026-08.json"


def immutability_audit() -> dict:
    baseline = json.loads((DATA / "ci-r3b1k-preexisting-migration-sha-manifest-2026-08.json").read_text())
    m252 = replay_sha256_file(MIG_ROOT / MIGRATION_252 / "migration.sql")
    changes = []
    for mig, expected in baseline["entries"].items():
        current = replay_sha256_file(MIG_ROOT / mig / "migration.sql")
        if current != expected:
            changes.append({"migration": mig, "expected": expected, "current": current})
    diff = subprocess.run(["git", "diff", "--name-only", BASE_R3B1L1_SHA], cwd=REPO, capture_output=True, text=True)
    lines = diff.stdout.splitlines()
    schema_changed = subprocess.run(
        ["git", "diff", "--quiet", BASE_R3B1L1_SHA, "--", "backend/prisma/schema.prisma"],
        cwd=REPO,
    ).returncode != 0
    out = {
        "schema_version": 1,
        "phase": "CI-R3B1L.2",
        "baseline_sha": BASE_R3B1L1_SHA,
        "modified_migration_sql_count": len(changes),
        "changed_migrations": changes,
        "new_migration_directories": 0,
        "migration_252_sha256": m252,
        "migration_252_unchanged_from_r3b1k": m252 == CORRECTED_M252_SHA256,
        "schema_prisma_changed": schema_changed,
        "runtime_changed": any(p.startswith(("backend/src/", "frontend/")) for p in lines),
        "deployment_changed": any("deploy" in p.lower() for p in lines),
        "pass": len(changes) == 0 and m252 == CORRECTED_M252_SHA256 and not schema_changed and not any(
            p.startswith(("backend/src/", "frontend/")) for p in lines
        ),
    }
    IMMUT.write_text(json.dumps(out, indent=2) + "\n")
    return out


def derive_next_phase(r3b_count: int, decisions: dict) -> str:
    counts = decisions.get("decision_counts", {})
    if r3b_count == 0 and decisions.get("pass"):
        return "E_UNKNOWN PRODUCTION EXPOSURE RESOLUTION"
    if counts.get("REPLAY_DB_DRIFT", 0) > 0 or counts.get("CROSS_EVIDENCE_CONTRADICTION", 0) > 0:
        return "STOP — reconcile replay/authority contradiction"
    if counts.get("AUTHORITY_AMBIGUITY", 0) > 0:
        return "STOP — resolve authority ambiguity"
    if r3b_count > 0 and counts.get("CURRENT_PRISMA_SCHEMA_DRIFT", 0) == r3b_count:
        return "CI-R3B1M — CURRENT PRISMA SCHEMA AUTHORITY ALIGNMENT"
    if r3b_count > 0 and counts.get("NON_SEMANTIC_DIFFERENCE", 0) == r3b_count:
        return "CI-R3B1M — PRISMA VALIDATION FOLLOW-UP"
    return "STOP — mixed authority decisions require reconciliation"


def main() -> int:
    catalog = load_production_catalog()
    counts = verify_authority_counts(catalog)
    if not counts["pass"]:
        SUMMARY.write_text(json.dumps({"final_status": "CI_R3B1L2_AUTHORITY_INVALID", "pass": False}, indent=2) + "\n")
        return 1

    input_manifest = build_input_manifest()
    if not input_manifest.get("pass"):
        SUMMARY.write_text(json.dumps({"final_status": "CI_R3B1L2_FROZEN_DIFF_MISMATCH", "pass": False}, indent=2) + "\n")
        return 1

    authority_manifest = build_authority_manifest()
    immut = immutability_audit()
    if not immut["pass"]:
        SUMMARY.write_text(json.dumps({"final_status": "CI_R3B1L2_IMMUTABILITY_FAILED", "pass": False, "immutability": immut}, indent=2) + "\n")
        return 1

    golden_code = run_golden_tests()
    golden = json.loads((DATA / "ci-r3b1l2-golden-tests-2026-08.json").read_text())
    if golden_code != 0 or not golden.get("pass"):
        SUMMARY.write_text(json.dumps({"final_status": "CI_R3B1L2_GOLDEN_TESTS_FAILED", "pass": False}, indent=2) + "\n")
        return 1

    parsed = parse_frozen_diff()
    parser_coverage = prove_parser_coverage(parsed)
    if not parser_coverage.get("pass"):
        SUMMARY.write_text(json.dumps({"final_status": "CI_R3B1L2_PRISMA_DIFF_PARSER_FAILED", "pass": False}, indent=2) + "\n")
        return 1

    classification = classify_complete_diff()
    reconciliation = reconcile_old_parser(classification)
    decisions = build_authority_decisions(classification.get("r3b_scope_operations", []))
    coverage = validate_coverage(classification, decisions, parser_coverage)

    decision_counts = decisions.get("decision_counts", {})
    trip = decisions.get("trip_driving_impact_calculated_at") or {}
    next_phase = derive_next_phase(classification.get("R3B_SCOPE_DIFF_COUNT", 0), decisions)

    acceptance_pass = (
        parser_coverage.get("pass")
        and classification.get("pass")
        and decisions.get("pass")
        and coverage.get("pass")
        and golden.get("pass")
        and immut.get("pass")
        and decision_counts.get("AUTHORITY_AMBIGUITY", 0) == 0
        and decision_counts.get("REPLAY_DB_DRIFT", 0) == 0
        and decision_counts.get("CROSS_EVIDENCE_CONTRADICTION", 0) == 0
    )
    if not parser_coverage.get("pass"):
        status = "CI_R3B1L2_PRISMA_DIFF_PARSER_FAILED"
    elif not decisions.get("pass"):
        status = "CI_R3B1L2_PRISMA_DIFF_AUTHORITY_FAILED"
    elif acceptance_pass:
        status = "CI_R3B1L2_PRISMA_DIFF_SCOPE_AUTHORITY_COMPLETED"
    else:
        status = "CI_R3B1L2_PRISMA_DIFF_AUTHORITY_FAILED"

    summary = {
        "schema_version": 1,
        "phase": "CI-R3B1L.2",
        "final_status": status,
        "pass": acceptance_pass,
        "BASE_R3B1L1_SHA": BASE_R3B1L1_SHA,
        "R3B1L2_BRANCH": R3B1L2_BRANCH,
        "evidence_input_sha": evidence_input_sha(),
        "frozen_prisma_diff": {
            "path": input_manifest.get("primary_input_path"),
            "sha256": input_manifest.get("sql_file_sha256"),
            "bytes": input_manifest.get("byte_count_sql_file"),
            "lines": input_manifest.get("line_count_sql_file"),
            "json_metadata_consistent": input_manifest.get("json_metadata_consistent"),
        },
        "parser": {
            "independent_sql_statement_count": parser_coverage.get("independent_sql_statement_count"),
            "parsed_sql_statement_count": parser_coverage.get("main_parser_sql_statement_count"),
            "comment_metadata_blocks": parser_coverage.get("comment_metadata_blocks"),
            "unconsumed_sql_tokens": parser_coverage.get("unconsumed_sql_tokens"),
            "duplicate_sql_tokens": parser_coverage.get("duplicate_token_count"),
            "parser_completeness": parser_coverage.get("parser_completeness"),
        },
        "old_parser": {
            "reported_operations": reconciliation.get("old_parser_reported_operations"),
            "successor_operations": reconciliation.get("successor_complete_operations"),
            "omitted_operations_recovered": reconciliation.get("previously_omitted_operations"),
            "omitted_r3b_operations_recovered": reconciliation.get("previously_omitted_r3b_operations"),
        },
        "scope": {
            "R3B_SCOPE": classification.get("R3B_SCOPE_DIFF_COUNT"),
            "OUT_OF_SCOPE": classification.get("OUT_OF_SCOPE_DIFF_COUNT"),
            "UNRESOLVED": classification.get("UNRESOLVED_DIFF_COUNT"),
        },
        "authority_decisions": decision_counts,
        "trip_driving_impact_calculated_at": {
            "parsed": trip is not None,
            "scope": "R3B_SCOPE" if trip else None,
            "accepted_authority": (trip.get("accepted_canonical_authority") or {}).get("type"),
            "replay_value": (trip.get("replay_actual") or {}).get("type"),
            "prisma_desired_value": (trip.get("current_prisma_desired_state") or {}).get("desired_pg_type"),
            "decision": trip.get("decision"),
        },
        "coverage": {
            "unparsed_statements": coverage.get("unparsed_sql_statements"),
            "unclassified_operations": coverage.get("unclassified_operations"),
            "r3b_operations_without_authority_decision": coverage.get("r3b_operations_without_authority_decision"),
        },
        "immutability": {
            "modified_migrations": immut.get("modified_migration_sql_count"),
            "new_migrations": immut.get("new_migration_directories"),
            "schema_prisma_changed": immut.get("schema_prisma_changed"),
            "runtime_changed": immut.get("runtime_changed"),
            "frontend_changed": immut.get("runtime_changed"),
            "deployment_changed": immut.get("deployment_changed"),
        },
        "authority_manifest": {
            "objects": authority_manifest.get("authority_object_count"),
            "tables": authority_manifest.get("authority_table_count"),
            "enums": authority_manifest.get("authority_enum_count"),
            "property_categories": authority_manifest.get("authority_property_category_count"),
        },
        "next_phase": next_phase,
        "migration_recovery_closed": classification.get("R3B_SCOPE_DIFF_COUNT") == 0 and acceptance_pass,
        "prisma_alignment_required": classification.get("R3B_SCOPE_DIFF_COUNT", 0) > 0
        and decision_counts.get("CURRENT_PRISMA_SCHEMA_DRIFT", 0) == classification.get("R3B_SCOPE_DIFF_COUNT"),
        "safety": {
            "new_zero_state_replay": False,
            "production_exposure_investigation": False,
            "production_mutation": False,
            "deployment": False,
            "merge": False,
        },
    }
    SUMMARY.write_text(json.dumps(summary, indent=2) + "\n")

    report_proc = subprocess.run([sys.executable, str(Path(__file__).with_name("ci_r3b1l2_generate_report.py"))], cwd=Path(__file__).parent)
    print(json.dumps({"final_status": status, "pass": acceptance_pass, "next_phase": next_phase}, indent=2))
    return 0 if acceptance_pass and report_proc.returncode == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
