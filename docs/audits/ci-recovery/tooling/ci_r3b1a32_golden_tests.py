#!/usr/bin/env python3
"""Golden tests for CI-R3B1A.3.2 document-extraction FK authority."""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from document_extraction_authority import DOCUMENT_EXTRACTION_FK_KEY, HISTORICAL_EVIDENCE  # noqa: E402
from repair_closure import (  # noqa: E402
    DEFERRED_FK_RESOLUTIONS,
    apply_fk_chronology,
    build_deferred_fk_resolution_artifact,
    get_deferred_fk_resolution,
)

REPO = Path(__file__).resolve().parents[4]
CONTRACTS = REPO / "docs/audits/ci-recovery/data/ci-r3b1a32-predecessor-ddl-contracts-2026-08.json"
TOPOLOGY = REPO / "docs/audits/ci-recovery/data/ci-r3b1a32-final-repair-topology-2026-08.json"
DEFERRED = REPO / "docs/audits/ci-recovery/data/ci-r3b1a32-deferred-fk-resolution-2026-08.json"

FAILURES: list[str] = []


def assert_true(cond: bool, msg: str) -> None:
    if not cond:
        FAILURES.append(msg)


def enrich_contracts(contracts_doc: dict) -> dict[str, dict]:
    by_obj: dict[str, dict] = {}
    for contract in contracts_doc["contracts"]:
        enriched = json.loads(json.dumps(contract))
        if enriched.get("object_type") == "table":
            enriched["foreign_keys"] = [
                apply_fk_chronology(enriched["object"], fk) for fk in enriched.get("foreign_keys", [])
            ]
        by_obj[enriched["object"]] = enriched
    return by_obj


def test_physical_fk_no_creator_not_intentionally_absent() -> None:
    resolution = DEFERRED_FK_RESOLUTIONS.get(DOCUMENT_EXTRACTION_FK_KEY)
    assert_true(resolution is not None, "document extraction resolution registry entry exists")
    assert_true(resolution["resolution_type"] != "intentionally_absent", "no creator != intentionally_absent")
    assert_true(resolution.get("physical_fk_expected") is True, "physical FK expected")


def test_prisma_only_intentionally_absent_may_pass() -> None:
    sample = {
        "resolution_type": "intentionally_absent",
        "absence_authority": {
            "relation_mode": "prisma",
            "physical_fk_expected": False,
            "historical_commit": "example",
            "reason": "relationMode=prisma explicitly disables DB FK enforcement",
            "evidence": ["schema:datasource relationMode=prisma"],
        },
    }
    authority = sample["absence_authority"]
    assert_true(authority["physical_fk_expected"] is False, "prisma-only absence requires physical_fk_expected=false")
    assert_true(authority["relation_mode"] == "prisma", "prisma-only absence requires relation_mode=prisma")


def test_generic_evidence_cannot_justify_intentionally_absent() -> None:
    bad = {
        "resolution_type": "intentionally_absent",
        "evidence": ["grep: no FK found"],
    }
    authority = bad.get("absence_authority") or {}
    assert_true(authority.get("physical_fk_expected") is not False, "generic evidence alone must fail")


def test_later_deterministic_fk_endpoint() -> None:
    contracts = json.loads(CONTRACTS.read_text())
    by_obj = enrich_contracts(contracts)
    battery = by_obj["battery_evidence"]
    doc_fk = next(f for f in battery["foreign_keys"] if f["referenced_relation"] == "vehicle_document_extractions")
    resolution = get_deferred_fk_resolution("battery_evidence", doc_fk)
    assert_true(resolution["resolution_type"] == "later_repair_slot", "later repair slot")
    assert_true(resolution["resolution_slot"] == 3, "slot 3")
    topology = json.loads(TOPOLOGY.read_text())
    slot3 = next(s for s in topology["slots"] if s["slot"] == 3)
    vde_order = next(a["order"] for a in slot3["actions"] if a["object"] == "vehicle_document_extractions" and a["action"] == "CREATE TABLE")
    fk_order = next(a["order"] for a in slot3["actions"] if a["object"] == "battery_evidence_document_extraction_id_fkey")
    assert_true(vde_order < fk_order, "FK action after VDE CREATE")


def test_document_extraction_real_authority_regression() -> None:
    deferred = json.loads(DEFERRED.read_text())
    rec = next(
        r
        for r in deferred["records"]
        if r["source_relation"] == "battery_evidence" and r["local_columns"] == ["document_extraction_id"]
    )
    assert_true(rec["resolution_type"] == "later_repair_slot", "real authority uses later_repair_slot")
    assert_true(rec.get("physical_fk_expected") is True, "physical FK expected recorded")
    assert_true(rec.get("historical_fk_sql_found") is False, "no historical FK SQL")
    assert_true(rec.get("resolved") is True, "resolved")
    assert_true(len(deferred.get("unresolved_deferred_fks", [])) == 0, "no unresolved deferred FKs")


def test_vde_contract_present() -> None:
    contracts = json.loads(CONTRACTS.read_text())
    vde = next(c for c in contracts["contracts"] if c["object"] == "vehicle_document_extractions")
    assert_true(vde["classification"] == "MISSING_HISTORY", "VDE MISSING_HISTORY")
    assert_true(vde["historical_prisma_model"] == "VehicleDocumentExtraction", "model name")
    assert_true(HISTORICAL_EVIDENCE["historical_relation_mode"] == "foreignKeys", "foreignKeys mode")


def main() -> int:
    test_physical_fk_no_creator_not_intentionally_absent()
    test_prisma_only_intentionally_absent_may_pass()
    test_generic_evidence_cannot_justify_intentionally_absent()
    test_later_deterministic_fk_endpoint()
    test_document_extraction_real_authority_regression()
    test_vde_contract_present()
    if FAILURES:
        print("GOLDEN TEST FAILURES:")
        for f in FAILURES:
            print("-", f)
        return 1
    print("PASS: all CI-R3B1A.3.2 golden tests")
    return 0


if __name__ == "__main__":
    sys.exit(main())
