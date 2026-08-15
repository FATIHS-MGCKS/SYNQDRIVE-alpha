"""Shared constants for CI-R3B1G tire status repair and full replay."""
from __future__ import annotations

from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
DATA = REPO / "docs/audits/ci-recovery/data"
MIG_ROOT = REPO / "backend/prisma/migrations"
BACKEND = REPO / "backend"
SCHEMA = BACKEND / "prisma/schema.prisma"

R3B1F111_BRANCH = "fix/ci-r3b1f111-sql-scope-classification-closure-2026-08"
BASE_R3B1F111_SHA = "795962d438457e05b5c55c0a7724b2c4b6f45305"

SLOT13_REPAIR = "20260716182500_ci_r3b_post_vendor_predecessor_slot13"
TIRE_CONSUMER = "20260716183000_tire_lifecycle_invariants"
R3B1G_REPAIR_MIGRATION = "20260716182730_ci_r3b_tire_setup_status_predecessor"

R3B1B_REPAIR_MIGRATIONS = [
    "20260412025000_ci_r3b_historical_predecessor_slot1",
    "20260412610000_ci_r3b_historical_predecessor_slot2",
    "20260413201500_ci_r3b_historical_predecessor_slot3",
    "20260413225000_ci_r3b_historical_predecessor_slot4",
    "20260417170000_ci_r3b_historical_predecessor_slot5",
    "20260421180000_ci_r3b_historical_predecessor_slot6",
]

R3B1E_REPAIR_MIGRATIONS = [
    "20260613203000_ci_r3b_post_vendor_predecessor_slot07",
    "20260616130000_ci_r3b_post_vendor_predecessor_slot08",
    "20260617120000_r3b_post_vendor_predecessor_slot09",
    "20260617203000_ci_r3b_post_vendor_predecessor_slot10",
    "20260620183000_ci_r3b_post_vendor_predecessor_slot11",
    "20260716180000_r3b_post_vendor_predecessor_slot12",
    "20260716182500_ci_r3b_post_vendor_predecessor_slot13",
    "20260716200000_r3b_post_vendor_predecessor_slot14",
    "20260723245000_ci_r3b_post_vendor_predecessor_slot15",
    "20260724210000_ci_r3b_post_vendor_predecessor_slot16",
]

CONTRACTS_PATH = DATA / "ci-r3b1f111-exact-predecessor-contracts-2026-08.json"
TARGETED_PROOF_PATH = DATA / "ci-r3b1f111-targeted-consumer-proof-2026-08.json"
FINAL_SUMMARY_PATH = DATA / "ci-r3b1f111-final-validation-summary-2026-08.json"
COMPILER_PATH = REPO / "docs/audits/ci-recovery/tooling/ci_r3b1f111_contract_compiler.py"
AUTHORITY_REF = DATA / "ci-r3b1d12-authority-reference-2026-08.json"

IMPLEMENTATION_AUTHORITY_FILES = {
    "exact_predecessor_contracts": CONTRACTS_PATH,
    "targeted_consumer_proof": TARGETED_PROOF_PATH,
    "final_validation_summary": FINAL_SUMMARY_PATH,
    "strict_add_column_compiler": COMPILER_PATH,
    "authority_reference": AUTHORITY_REF,
}
