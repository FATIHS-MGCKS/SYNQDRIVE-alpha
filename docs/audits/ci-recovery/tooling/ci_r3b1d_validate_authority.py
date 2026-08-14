#!/usr/bin/env python3
"""Validator for CI-R3B1D post-vendor replay harness and historical authority."""
from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1c_special_composite_index import SpecialCompositeIndexExecutor  # noqa: E402
from replay_evidence_lib import (  # noqa: E402
    REPO,
    R3B1B_REPAIR_MIGRATIONS,
    SPECIAL_MIGRATION,
    SPECIAL_MIGRATION_EXPECTED_SHA256,
    SPECIAL_MIGRATION_PATH,
    TARGET_SHA,
    audit_transaction_sensitive_migrations,
    migration_dirs,
    replay_input_manifest_files,
    replay_input_manifest_sha256,
    sha256_file,
)

DATA = REPO / "docs/audits/ci-recovery/data"
HARNESS = DATA / "ci-r3b1d-replay-harness-authority-2026-08.json"
INVENTORY = DATA / "ci-r3b1d-transaction-sensitive-migration-inventory-2026-08.json"
MATRIX = DATA / "ci-r3b1d-post-vendor-dependency-matrix-2026-08.json"
CONTRACTS = DATA / "ci-r3b1d-vendor-predecessor-ddl-contracts-2026-08.json"
REMAINING_CONTRACTS = DATA / "ci-r3b1d-remaining-predecessor-ddl-contracts-2026-08.json"
CLOSURE = DATA / "ci-r3b1d-post-vendor-repair-closure-2026-08.json"
TOPOLOGY = DATA / "ci-r3b1d-post-vendor-repair-topology-2026-08.json"
VENDOR_MIGRATION = REPO / "backend/prisma/migrations/20260613210000_vendor_management_overhaul/migration.sql"
TARGET_MIGRATION = REPO / "backend/prisma/migrations/20260425000000_retire_user_assignment_and_speeding_severity/migration.sql"
PRE_R3B1D_SHA = "9583d04f5d331f41e2b0e17a9cad3782062860d3"

EARLIER_R3B_MIGRATIONS = [
    "20260325161141_ci_r3b_bootstrap_trip_schema_baseline",
    "20260424235959_ci_r3b_trip_casing_pre_shim",
    "20260425000001_ci_r3b_trip_casing_post_shim",
    "20260814130000_ci_r3b_post_replay_parity_reconciliation",
]

PROTECTED_MIGRATIONS = (
    EARLIER_R3B_MIGRATIONS
    + R3B1B_REPAIR_MIGRATIONS
    + [SPECIAL_MIGRATION, "20260613210000_vendor_management_overhaul", "20260425000000_retire_user_assignment_and_speeding_severity"]
)


def bump(errors: list[str], msg: str) -> None:
    errors.append(msg)


def git_file_sha_at(rev: str, rel: str) -> str:
    proc = subprocess.run(
        ["git", "show", f"{rev}:{rel}"],
        cwd=REPO,
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"cannot read {rel} at {rev}: {proc.stderr}")
    return hashlib.sha256(proc.stdout.encode("utf-8")).hexdigest()


def validate_immutability(errors: list[str]) -> None:
    mismatches = []
    for mig in PROTECTED_MIGRATIONS:
        rel = f"backend/prisma/migrations/{mig}/migration.sql"
        expected = git_file_sha_at(PRE_R3B1D_SHA, rel)
        current = sha256_file(REPO / rel)
        if expected != current:
            mismatches.append({"migration": mig, "expected": expected, "current": current})
    if mismatches:
        bump(errors, f"protected migration SHA mismatches: {len(mismatches)}")
    if sha256_file(TARGET_MIGRATION) != TARGET_SHA:
        bump(errors, "target migration SHA drift from replay_evidence_lib.TARGET_SHA")


def validate_harness(errors: list[str]) -> None:
    if not HARNESS.is_file():
        bump(errors, "missing ci-r3b1d-replay-harness-authority-2026-08.json")
        return
    doc = json.loads(HARNESS.read_text())
    if doc.get("accepted_immutable_sha256") != SPECIAL_MIGRATION_EXPECTED_SHA256:
        bump(errors, "harness accepted_immutable_sha256 != SPECIAL_MIGRATION_EXPECTED_SHA256")
    if doc.get("observed_sha256") != sha256_file(SPECIAL_MIGRATION_PATH):
        bump(errors, "harness observed_sha256 stale")
    if not doc.get("sha256_match"):
        bump(errors, "harness sha256_match is false")
    manifest = replay_input_manifest_sha256()
    if doc.get("REPLAY_INPUT_MANIFEST_SHA256") != manifest:
        bump(errors, "harness REPLAY_INPUT_MANIFEST_SHA256 stale")
    files = replay_input_manifest_files()
    if len(files) < 300:
        bump(errors, f"replay input manifest too small: {len(files)} files")
    inv = doc.get("transaction_sensitive_scan", {})
    if inv.get("unresolved_count", 1) != 0:
        bump(errors, "harness transaction scan UNRESOLVED != 0")


def validate_inventory(errors: list[str]) -> None:
    if not INVENTORY.is_file():
        bump(errors, "missing transaction-sensitive inventory")
        return
    doc = json.loads(INVENTORY.read_text())
    live = audit_transaction_sensitive_migrations()
    if doc.get("unresolved_count") != 0:
        bump(errors, "inventory UNRESOLVED != 0")
    if doc.get("migrations_scanned") != len(migration_dirs()):
        bump(errors, "inventory migrations_scanned mismatch")
    if doc.get("special_execution_required_migrations") != live["special_execution_required_migrations"]:
        bump(errors, "inventory special migrations stale")


def validate_matrix(errors: list[str]) -> dict[str, int]:
    if not MATRIX.is_file():
        bump(errors, "missing post-vendor dependency matrix")
        return {}
    doc = json.loads(MATRIX.read_text())
    totals = doc.get("classification_totals", {})
    if totals.get("UNRESOLVED", 1) != 0:
        bump(errors, "post-vendor matrix UNRESOLVED != 0")
    counter = Counter(r["classification"] for r in doc.get("records", []))
    if counter["UNRESOLVED"]:
        bump(errors, f"record-level UNRESOLVED={counter['UNRESOLVED']}")
    return dict(totals)


def validate_vendor_contracts(errors: list[str]) -> None:
    if not CONTRACTS.is_file():
        bump(errors, "missing vendor predecessor contracts")
        return
    doc = json.loads(CONTRACTS.read_text())
    by_obj = {c["object"]: c for c in doc.get("contracts", [])}
    for obj in ["VendorCategory", "vendors", "vendor_vehicles", "VendorSourceType"]:
        if obj not in by_obj:
            bump(errors, f"missing contract for {obj}")
    vc = by_obj.get("VendorCategory", {})
    expected_labels = {
        "WORKSHOP", "SERVICE_PARTNER", "PAINT_SHOP", "BODY_REPAIR", "AUTO_GLASS",
        "TIRE_DEALER", "PARTS_DEALER", "DETAILING", "TUV_STATION", "ONLINE_SUPPLIER", "OTHER",
    }
    if set(vc.get("labels", [])) != expected_labels:
        bump(errors, "VendorCategory predecessor labels mismatch")
    overhaul_labels = {"INSURANCE", "APPRAISER", "TOWING", "DEALERSHIP", "OEM_SERVICE"}
    if overhaul_labels & set(vc.get("labels", [])):
        bump(errors, "VendorCategory contract includes overhaul-only labels")


def validate_topology_closure(errors: list[str]) -> None:
    if not CLOSURE.is_file():
        bump(errors, "missing post-vendor repair closure")
    if not TOPOLOGY.is_file():
        bump(errors, "missing post-vendor repair topology")
        return
    topo = json.loads(TOPOLOGY.read_text())
    slots = topo.get("slots", [])
    if not slots or slots[0].get("slot") != 7:
        bump(errors, "expected vendor repair slot 7 as first topology slot")
    slot7 = slots[0]
    if slot7.get("after_migration") != "20260613200000_booking_document_lifecycle":
        bump(errors, "slot 7 after_migration mismatch")
    if slot7.get("before_migration") != "20260613210000_vendor_management_overhaul":
        bump(errors, "slot 7 before_migration mismatch")
    created = set(slot7.get("objects_types_sequences_created", []))
    for obj in ["VendorCategory", "VendorSourceType", "vendors", "vendor_vehicles"]:
        if obj not in created:
            bump(errors, f"slot 7 missing created object {obj}")
    if topo.get("future_repair_slot_count") != len(slots):
        bump(errors, "topology future_repair_slot_count mismatch")


def validate_defect_contract_coverage(errors: list[str], totals: dict[str, int]) -> None:
    if not totals:
        return
    doc = json.loads(MATRIX.read_text())
    defects = {
        r["required_object"]
        for r in doc["records"]
        if r["classification"] in {"MISSING_HISTORY", "ORDERING_DEFECT"}
        and r["required_object_type"] in {"table", "enum"}
        and r["operation"] not in {
            "CREATE TABLE REFERENCES column",
            "CREATE TABLE enum prerequisite",
            "CREATE INDEX column",
            "ADD CONSTRAINT FK column",
        }
    }
    vendor_doc = json.loads(CONTRACTS.read_text())
    remaining_doc = json.loads(REMAINING_CONTRACTS.read_text()) if REMAINING_CONTRACTS.is_file() else {"contracts": []}
    all_contracts = {c["object"] for c in vendor_doc.get("contracts", [])} | {
        c["object"] for c in remaining_doc.get("contracts", [])
    }
    missing = sorted(defects - all_contracts)
    if missing:
        bump(errors, f"defect objects without exact contracts: {missing}")
    dupes = []
    seen: set[str] = set()
    for c in vendor_doc.get("contracts", []) + remaining_doc.get("contracts", []):
        obj = c["object"]
        if obj in seen:
            dupes.append(obj)
        seen.add(obj)
    if dupes:
        bump(errors, f"duplicate contract authority for: {sorted(set(dupes))}")
    closure = json.loads(CLOSURE.read_text())
    if set(closure.get("all_genuine_defect_objects", [])) != defects:
        bump(errors, "closure all_genuine_defect_objects mismatch with matrix unique defects")
    topo = json.loads(TOPOLOGY.read_text())
    for slot in topo.get("slots", []):
        if not slot.get("closure_validated"):
            bump(errors, f"slot {slot.get('slot')} closure_validated=false")
        if not slot.get("must_execute_before"):
            bump(errors, f"slot {slot.get('slot')} missing must_execute_before")


def main() -> int:
    errors: list[str] = []
    validate_immutability(errors)
    validate_harness(errors)
    validate_inventory(errors)
    totals = validate_matrix(errors)
    validate_vendor_contracts(errors)
    validate_topology_closure(errors)
    validate_defect_contract_coverage(errors, totals)

    # Pinned executor path must refuse wrong hash
    try:
        SpecialCompositeIndexExecutor(accepted_sha256="a" * 64).verify_checksum(sha256_file(SPECIAL_MIGRATION_PATH))
        bump(errors, "executor accepted wrong pinned hash without refusal")
    except RuntimeError:
        pass

    result = {
        "pass": len(errors) == 0,
        "errors": errors,
        "classification_totals": totals,
        "protected_migration_count": len(PROTECTED_MIGRATIONS),
        "migration_directories": len(migration_dirs()),
    }
    print(json.dumps(result, indent=2))
    return 0 if result["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
