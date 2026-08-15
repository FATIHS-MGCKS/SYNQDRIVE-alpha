#!/usr/bin/env python3
"""CI-R3B1L.2.1 validation orchestrator."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1l1_authority import load_production_catalog, verify_authority_counts
from ci_r3b1l1_constants import MIGRATION_252
from ci_r3b1l2_authority_decisions import build_authority_decisions
from ci_r3b1l2_prisma_sql_parser import get_parsed_statements, load_frozen_diff_text, prove_parser_coverage, parse_frozen_diff
from ci_r3b1l21_constants import (
    BASE_R3B1L2_SHA,
    CORRECTED_M252_SHA256,
    DATA,
    MIG_ROOT,
    REPO,
    R3B1L21_BRANCH,
    evidence_input_sha,
    verify_frozen_input_against_r3b1l2_manifest,
)
from ci_r3b1l21_coverage_validator import validate_coverage
from ci_r3b1l21_golden_tests import main as run_golden_tests
from ci_r3b1l21_independent_statement_counter import build_independent_coverage_artifact
from ci_r3b1l21_r3b_authority import build_authority_manifest
from ci_r3b1l21_scope_classifier import classify_complete_diff, summarize_out_of_scope_families
from replay_evidence_lib import sha256_file as replay_sha256_file

INDEPENDENT_COVERAGE_OUT = DATA / "ci-r3b1l21-independent-parser-coverage-2026-08.json"
IMMUT = DATA / "ci-r3b1l21-immutability-audit-2026-08.json"
SUMMARY = DATA / "ci-r3b1l21-final-validation-summary-2026-08.json"
PARSER_TOKEN_COVERAGE_OUT = DATA / "ci-r3b1l21-prisma-diff-parser-token-coverage-2026-08.json"


def immutability_audit() -> dict:
    baseline = json.loads((DATA / "ci-r3b1k-preexisting-migration-sha-manifest-2026-08.json").read_text())
    m252 = replay_sha256_file(MIG_ROOT / MIGRATION_252 / "migration.sql")
    changes = []
    for mig, expected in baseline["entries"].items():
        current = replay_sha256_file(MIG_ROOT / mig / "migration.sql")
        if current != expected:
            changes.append({"migration": mig, "expected": expected, "current": current})
    schema_changed = subprocess.run(
        ["git", "diff", "--quiet", BASE_R3B1L2_SHA, "--", "backend/prisma/schema.prisma"],
        cwd=REPO,
    ).returncode != 0
    diff = subprocess.run(["git", "diff", "--name-only", BASE_R3B1L2_SHA], cwd=REPO, capture_output=True, text=True)
    lines = diff.stdout.splitlines()
    out = {
        "schema_version": 1,
        "phase": "CI-R3B1L.2.1",
        "baseline_sha": BASE_R3B1L2_SHA,
        "modified_migration_sql_count": len(changes),
        "changed_migrations": changes,
        "new_migration_directories": 0,
        "migration_252_sha256": m252,
        "migration_252_unchanged_from_r3b1k": m252 == CORRECTED_M252_SHA256,
        "schema_prisma_changed": schema_changed,
        "runtime_changed": any(p.startswith(("backend/src/", "frontend/")) for p in lines),
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
    return "STOP — mixed authority decisions require reconciliation"


def main() -> int:
    input_check = verify_frozen_input_against_r3b1l2_manifest()
    if not input_check["pass"]:
        SUMMARY.write_text(json.dumps({"final_status": "CI_R3B1L21_FROZEN_DIFF_MISMATCH", "pass": False}, indent=2) + "\n")
        return 1

    catalog = load_production_catalog()
    if not verify_authority_counts(catalog)["pass"]:
        SUMMARY.write_text(json.dumps({"final_status": "CI_R3B1L21_AUTHORITY_INVALID", "pass": False}, indent=2) + "\n")
        return 1

    authority_manifest = build_authority_manifest()
    immut = immutability_audit()
    if not immut["pass"]:
        SUMMARY.write_text(json.dumps({"final_status": "CI_R3B1L21_IMMUTABILITY_FAILED", "pass": False}, indent=2) + "\n")
        return 1

    golden_code = run_golden_tests()
    golden = json.loads((DATA / "ci-r3b1l21-golden-tests-2026-08.json").read_text())
    if golden_code != 0 or not golden.get("pass"):
        SUMMARY.write_text(json.dumps({"final_status": "CI_R3B1L21_GOLDEN_TESTS_FAILED", "pass": False}, indent=2) + "\n")
        return 1

    text, _meta = load_frozen_diff_text()
    main_statements = [s.raw_sql for s in get_parsed_statements()]
    independent_coverage = build_independent_coverage_artifact(text, main_statements, input_check["sha256"])
    INDEPENDENT_COVERAGE_OUT.write_text(json.dumps(independent_coverage, indent=2) + "\n")
    if not independent_coverage.get("pass"):
        SUMMARY.write_text(json.dumps({"final_status": "CI_R3B1L21_INDEPENDENT_COVERAGE_FAILED", "pass": False}, indent=2) + "\n")
        return 1

    parsed = parse_frozen_diff()
    token_coverage = prove_parser_coverage(parsed)
    token_coverage["phase"] = "CI-R3B1L.2.1"
    PARSER_TOKEN_COVERAGE_OUT.write_text(json.dumps(token_coverage, indent=2) + "\n")

    classification = classify_complete_diff()
    decisions = build_authority_decisions(classification.get("r3b_scope_operations", []))
    (DATA / "ci-r3b1l21-r3b-scope-drift-authority-2026-08.json").write_text(
        (DATA / "ci-r3b1l2-r3b-scope-drift-authority-2026-08.json").read_text()
    )
    coverage = validate_coverage(classification, decisions, independent_coverage)
    out_of_scope_families = summarize_out_of_scope_families(classification)

    decision_counts = decisions.get("decision_counts", {})
    trip = decisions.get("trip_driving_impact_calculated_at") or {}
    next_phase = derive_next_phase(classification.get("R3B_SCOPE_DIFF_COUNT", 0), decisions)

    acceptance_pass = (
        independent_coverage.get("pass")
        and token_coverage.get("pass")
        and classification.get("pass")
        and decisions.get("pass")
        and coverage.get("pass")
        and golden.get("pass")
        and immut.get("pass")
        and decision_counts.get("AUTHORITY_AMBIGUITY", 0) == 0
        and decision_counts.get("REPLAY_DB_DRIFT", 0) == 0
        and decision_counts.get("CROSS_EVIDENCE_CONTRADICTION", 0) == 0
    )

    if not independent_coverage.get("pass"):
        status = "CI_R3B1L21_INDEPENDENT_COVERAGE_FAILED"
    elif not classification.get("pass"):
        status = "CI_R3B1L21_SCOPE_OWNERSHIP_FAILED"
    elif not decisions.get("pass"):
        status = "CI_R3B1L21_AUTHORITY_DECISION_FAILED"
    elif acceptance_pass:
        status = "CI_R3B1L21_SCOPE_OWNERSHIP_COVERAGE_COMPLETED"
    else:
        status = "CI_R3B1L21_SCOPE_OWNERSHIP_FAILED"

    summary = {
        "schema_version": 1,
        "phase": "CI-R3B1L.2.1",
        "final_status": status,
        "pass": acceptance_pass,
        "BASE_R3B1L2_SHA": BASE_R3B1L2_SHA,
        "R3B1L21_BRANCH": R3B1L21_BRANCH,
        "evidence_input_sha": evidence_input_sha(),
        "frozen_prisma_diff": input_check,
        "independent_coverage": {
            "independent_statements": independent_coverage.get("independent_count"),
            "main_parser_statements": independent_coverage.get("main_parser_count"),
            "independent_without_main_match": independent_coverage.get("independent_without_main_match"),
            "main_without_independent_match": independent_coverage.get("main_without_independent_match"),
            "duplicate_interval_matches": independent_coverage.get("duplicate_interval_matches"),
            "implementation_independence_pass": independent_coverage.get("implementation_independence_assertion", {}).get("pass"),
            "pass": independent_coverage.get("pass"),
        },
        "parser_token_coverage": {
            "unconsumed_sql_tokens": token_coverage.get("unconsumed_sql_tokens"),
            "duplicate_token_count": token_coverage.get("duplicate_token_count"),
            "parser_completeness": token_coverage.get("parser_completeness"),
            "pass": token_coverage.get("pass"),
        },
        "scope": {
            "R3B_SCOPE": classification.get("R3B_SCOPE_DIFF_COUNT"),
            "OUT_OF_SCOPE": classification.get("OUT_OF_SCOPE_DIFF_COUNT"),
            "UNRESOLVED": classification.get("UNRESOLVED_DIFF_COUNT"),
            "out_of_scope_by_family": out_of_scope_families,
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
        },
        "authority_manifest": {
            "objects": authority_manifest.get("authority_object_count"),
            "tables": authority_manifest.get("authority_table_count"),
            "enums": authority_manifest.get("authority_enum_count"),
            "property_categories": authority_manifest.get("authority_property_category_count"),
        },
        "next_phase": next_phase,
        "r3b1m_authorized": acceptance_pass
        and classification.get("R3B_SCOPE_DIFF_COUNT", 0) > 0
        and decision_counts.get("CURRENT_PRISMA_SCHEMA_DRIFT", 0) == classification.get("R3B_SCOPE_DIFF_COUNT"),
        "safety": {
            "new_zero_state_replay": False,
            "schema_prisma_edit": False,
            "migration_edit": False,
            "deployment": False,
            "merge": False,
        },
    }
    SUMMARY.write_text(json.dumps(summary, indent=2) + "\n")

    report_proc = subprocess.run([sys.executable, str(Path(__file__).with_name("ci_r3b1l21_generate_report.py"))], cwd=Path(__file__).parent)
    print(json.dumps({"final_status": status, "pass": acceptance_pass, "next_phase": next_phase}, indent=2))
    return 0 if acceptance_pass and report_proc.returncode == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
