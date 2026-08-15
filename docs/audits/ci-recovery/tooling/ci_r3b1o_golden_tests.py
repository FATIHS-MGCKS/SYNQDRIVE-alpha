#!/usr/bin/env python3
"""Golden tests for CI-R3B1O preflight and contracts."""
from __future__ import annotations

import hashlib

from ci_r3b1n2_checksum import semantic_change_kind
from ci_r3b1n2_constants import DEPLOYED_SHA, M252, file_bytes_at
from ci_r3b1o_checksum import build_checksum_preflight, checksum_representations_extended, detect_post_deploy_mutation
from ci_r3b1o_constants import HM_DUAL_APP, R3B1G
from ci_r3b1o_effect_contracts import build_migration_effect_contract


def run_golden_tests(*, ledger_best: dict, recovered_inventory: dict, main_sha: str, recovered_sha: str, run_sql=None) -> dict:
    tests = []

    def add(name: str, ok: bool, expected: str, actual: str, detail=None):
        tests.append({"name": name, "pass": ok, "expected": expected, "actual": actual, "detail": detail})

    prod_m252 = None
    for name, row in ledger_best.items():
        if name == M252 and row.get("finished_at"):
            prod_m252 = row["checksum"]
            break

    deployed_m252 = file_bytes_at(DEPLOYED_SHA, M252)
    recovered_m252 = file_bytes_at(recovered_sha, M252)
    if prod_m252 and deployed_m252 and recovered_m252:
        post, kind, _ = detect_post_deploy_mutation(
            prod_checksum=prod_m252,
            deployed_content=deployed_m252,
            recovered_content=recovered_m252,
            main_content=file_bytes_at(main_sha, M252),
        )
        add("m252_post_deploy_historical_mutation", post is True, "YES", str(post), kind)
        add("m252_mutation_class_identifier_only", kind == "IDENTIFIER_ONLY", "IDENTIFIER_ONLY", str(kind))

    hm = ledger_best.get(HM_DUAL_APP, {})
    hm_prod = hm.get("checksum")
    hm_content = file_bytes_at(DEPLOYED_SHA, HM_DUAL_APP)
    if hm_prod and hm_content:
        reps = checksum_representations_extended(hm_content)
        hit = hm_prod in reps.values()
        mixed_hit = reps.get("mixed_lf_body_final_crlf") == hm_prod
        add("mixed_eol_hm_dual_app_match", hit and mixed_hit, "MATCH mixed_lf_body_final_crlf", str(hit))

    preflight = build_checksum_preflight(
        ledger_best=ledger_best,
        recovered_inventory=recovered_inventory,
        deployed_sha=DEPLOYED_SHA,
        main_sha=main_sha,
        recovered_sha=recovered_sha,
    )
    add("checksum_matches_none_zero", preflight["summary"]["matches_none"] == 0, "0", str(preflight["summary"]["matches_none"]))
    add("checksum_unresolved_zero", preflight["summary"]["unresolved"] == 0, "0", str(preflight["summary"]["unresolved"]))

    from ci_r3b1o_mutation_guard import guard_preflight_with_golden_tests

    guard_doc = guard_preflight_with_golden_tests(
        {"instance_fingerprint_sha256": "prod", "database_fingerprint_sha256": "proddb"},
        {"instance_fingerprint_sha256": "twin", "database_fingerprint_sha256": "twindb"},
    )
    wrong_db_test = next(t for t in guard_doc["tests"] if t["name"] == "wrong_database_same_instance_rejected")
    add("wrong_database_guard_hard_fail", wrong_db_test["pass"], "HARD FAIL", str(wrong_db_test["pass"]))

    if run_sql:
        partial_sql = """
ALTER TABLE "demo" ADD COLUMN "c" TEXT;
CREATE INDEX "demo_c_idx" ON "demo"("c");
"""
        def partial_run_sql(q: str) -> str:
            if "demo" in q and "pg_attribute" in q:
                return "text|YES|"
            if "demo_c_idx" in q:
                return "0"
            return "0"

        partial = build_migration_effect_contract("partial_fixture", partial_sql, run_sql=partial_run_sql)
        add("partial_effect_present_forbidden", partial["classification"] == "PARTIAL_EFFECT_PRESENT", "PARTIAL_EFFECT_PRESENT", partial["classification"])
        add("partial_resolve_forbidden", partial["resolve_as_applied_allowed"] is False, "False", str(partial["resolve_as_applied_allowed"]))

        dml = build_migration_effect_contract("dml_fixture", 'UPDATE "t" SET "x"=1;', run_sql=run_sql)
        add("dml_data_dependent", dml["classification"] == "DATA_DEPENDENT", "DATA_DEPENDENT", dml["classification"])

        full = build_migration_effect_contract(
            R3B1G,
            file_bytes_at(recovered_sha, R3B1G).decode("utf-8"),
            run_sql=run_sql,
        )
        add(
            "r3b1g_full_equivalent_on_golden",
            full["classification"] == "FULL_EFFECT_ALREADY_PRESENT_EQUIVALENT",
            "FULL_EFFECT_ALREADY_PRESENT_EQUIVALENT",
            full["classification"],
        )

    passed = sum(1 for t in tests if t["pass"])
    return {"schema_version": 1, "phase": "CI-R3B1O", "tests": tests, "total": len(tests), "passed": passed, "pass": passed == len(tests)}
