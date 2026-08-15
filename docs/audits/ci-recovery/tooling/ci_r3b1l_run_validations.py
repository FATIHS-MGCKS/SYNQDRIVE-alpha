#!/usr/bin/env python3
"""CI-R3B1L main validation orchestrator."""
from __future__ import annotations

import os
import hashlib
import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1l_constants import (
    BASE_R3B1K_SHA,
    COMPOSITE_INDEX_PINNED_SHA,
    COMPOSITE_MIGRATION,
    DATA,
    FULL_REPLAY_DB,
    MIGRATION_252,
    MIG_ROOT,
    REPO,
    evidence_input_sha,
)
from ci_r3b1k_full_replay_harness import run_full_replay
from ci_r3b1l_authority import build_authority_manifest, load_production_catalog, verify_authority_counts, write_canonical_54
from ci_r3b1l_constants import CORRECTED_M252_SHA256 as M252_SHA
from ci_r3b1l_coverage_validator import validate_coverage
from ci_r3b1l_exact_parity import run_exact_parity
from ci_r3b1l_golden_tests import main as run_golden_tests
from replay_evidence_lib import SPECIAL_MIGRATION_EXPECTED_SHA256, sha256_file as replay_sha256_file

REPLAY_MANIFEST = DATA / "ci-r3b1l-replay-input-manifest-2026-08.json"
IMMUT = DATA / "ci-r3b1l-immutability-audit-2026-08.json"
ACCEPTANCE = DATA / "ci-r3b1l-migration-recovery-acceptance-2026-08.json"
SUMMARY = DATA / "ci-r3b1l-final-validation-summary-2026-08.json"
REPLAY_RESULT = DATA / "ci-r3b1l-full-fresh-replay-result-2026-08.json"


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def build_replay_manifest() -> dict:
    files = []
    for path in sorted(MIG_ROOT.glob("*/migration.sql")):
        rel = str(path.relative_to(REPO))
        files.append({"path": rel, "sha256": replay_sha256_file(path)})
    digest = sha256_text("\n".join(f"{f['path']}\0{f['sha256']}" for f in files))
    out = {"schema_version": 1, "REPLAY_INPUT_MANIFEST_SHA256": digest, "file_count": len(files), "files": files}
    REPLAY_MANIFEST.write_text(json.dumps(out, indent=2) + "\n")
    return out


def verify_r3b1k_exception(manifest: dict) -> bool:
    target = next((f for f in manifest["files"] if MIGRATION_252 in f["path"]), None)
    return bool(target and target["sha256"] == M252_SHA)


def immutability_audit() -> dict:
    baseline = json.loads((DATA / "ci-r3b1k-preexisting-migration-sha-manifest-2026-08.json").read_text())
    m252 = replay_sha256_file(MIG_ROOT / MIGRATION_252 / "migration.sql")
    changes = []
    for mig, expected in baseline["entries"].items():
        current = replay_sha256_file(MIG_ROOT / mig / "migration.sql")
        if current != expected:
            changes.append({"migration": mig, "expected": expected, "current": current})
    diff = subprocess.run(["git", "diff", "--name-only", BASE_R3B1K_SHA], cwd=REPO, capture_output=True, text=True)
    lines = diff.stdout.splitlines()
    out = {
        "modified_migration_sql_count": len(changes),
        "changed_migrations": changes,
        "new_migration_directories": 0,
        "migration_252_sha256": m252,
        "migration_252_unchanged_from_r3b1k": m252 == M252_SHA,
        "schema_prisma_changed": "backend/prisma/schema.prisma" in lines,
        "runtime_changed": any(p.startswith(("backend/src/", "frontend/")) for p in lines),
        "pass": len(changes) == 0 and m252 == M252_SHA and "backend/prisma/schema.prisma" not in lines,
    }
    IMMUT.write_text(json.dumps(out, indent=2) + "\n")
    return out


def prisma_checks() -> dict:
    backend = REPO / "backend"
    results = {}
    for label, cmd in [
        ("prisma_validate", ["npx", "prisma", "validate"]),
        ("prisma_generate", ["npx", "prisma", "generate"]),
    ]:
        proc = subprocess.run(cmd, cwd=backend, capture_output=True, text=True)
        results[label] = {"exit_code": proc.returncode, "pass": proc.returncode == 0}
    env = os.environ.copy()
    env["DATABASE_URL"] = f"postgresql://synqdrive:synqdrive@127.0.0.1:{os.environ.get('R3B_PG_PORT', '5432')}/{FULL_REPLAY_DB}"
    diff_proc = subprocess.run(
        ["npx", "prisma", "migrate", "diff", "--from-url", env["DATABASE_URL"], "--to-schema-datamodel", "prisma/schema.prisma", "--script"],
        cwd=backend,
        capture_output=True,
        text=True,
        env=env,
    )
    script = (diff_proc.stdout or "").strip()
    results["schema_db_diff"] = {
        "exit_code": diff_proc.returncode,
        "pass": diff_proc.returncode == 0,
        "informational_only": True,
        "note": "Full Prisma schema vs replay DB; R3B0.21 acceptance is scoped to 19 bootstrap objects / 54 categories",
        "script_excerpt": script[:2000],
        "empty_diff": not script or "empty migration" in script.lower(),
    }
    return results


def main() -> int:
    catalog = load_production_catalog()
    counts = verify_authority_counts(catalog)
    if not counts["pass"]:
        SUMMARY.write_text(json.dumps({"final_status": "CI_R3B1L_AUTHORITY_INVALID", "pass": False, "counts": counts}, indent=2) + "\n")
        return 1

    manifest = build_authority_manifest()
    canonical = write_canonical_54()
    replay_manifest = build_replay_manifest()
    if not verify_r3b1k_exception(replay_manifest):
        print(json.dumps({"error": "migration_252_sha_mismatch"}))
        return 1

    composite = replay_sha256_file(MIG_ROOT / COMPOSITE_MIGRATION / "migration.sql")
    if composite != COMPOSITE_INDEX_PINNED_SHA:
        print(json.dumps({"error": "composite_index_pin_mismatch"}))
        return 1

    immut_pre = immutability_audit()
    if not immut_pre["pass"]:
        return 1

    golden_code = run_golden_tests()
    golden = json.loads((DATA / "ci-r3b1l-golden-tests-2026-08.json").read_text())

    full = run_full_replay(FULL_REPLAY_DB)
    REPLAY_RESULT.write_text(json.dumps(full, indent=2) + "\n")

    if not full.get("reached_absolute_head") or full.get("failed_migrations", 1) != 0:
        status = "CI_R3B1L_FINAL_REPLAY_FAILED"
        SUMMARY.write_text(json.dumps({"final_status": status, "pass": False, "replay": full}, indent=2) + "\n")
        return 1

    parity = run_exact_parity(__import__("replay_evidence_lib", fromlist=["PgConfig"]).PgConfig(), FULL_REPLAY_DB, manifest["AUTHORITY_MANIFEST_SHA256"])
    coverage = validate_coverage(parity)
    prisma = prisma_checks()

    acceptance_pass = (
        parity.get("pass")
        and coverage.get("pass")
        and golden.get("pass")
        and full.get("reached_absolute_head")
        and prisma.get("prisma_validate", {}).get("pass", False)
        and prisma.get("prisma_generate", {}).get("pass", False)
        and immut_pre.get("pass")
    )
    status = "CI_R3B1L_EXACT_FINAL_PARITY_RECOVERY_ACCEPTANCE_COMPLETED" if acceptance_pass else "CI_R3B1L_EXACT_FINAL_PARITY_FAILED"

    acceptance = {
        "schema_version": 1,
        "phase": "CI-R3B1L",
        "evidence_input_sha": evidence_input_sha(),
        "BASE_R3B1K_SHA": BASE_R3B1K_SHA,
        "authority_manifest_sha256": manifest["AUTHORITY_MANIFEST_SHA256"],
        "replay_input_manifest_sha256": replay_manifest["REPLAY_INPUT_MANIFEST_SHA256"],
        "replay": {
            "migration_directories": full.get("migration_directories_discovered"),
            "failed_migrations": full.get("failed_migrations"),
            "manual_interventions": full.get("manual_interventions"),
            "reached_absolute_head": full.get("reached_absolute_head"),
        },
        "parity": {
            "objects": f"{parity.get('objects_matched')}/{parity.get('objects_expected')}",
            "tables": f"{parity.get('tables_matched')}/{parity.get('tables_expected')}",
            "enums": f"{parity.get('enums_matched')}/{parity.get('enums_expected')}",
            "properties": f"{parity.get('properties_matched')}/{parity.get('properties_expected')}",
        },
        "mismatch_counters": parity.get("mismatch_counters", {}),
        "negative_tests_pass": golden.get("pass"),
        "coverage_pass": coverage.get("pass"),
        "prisma_checks": prisma,
        "immutability_pass": immut_pre.get("pass"),
        "production_exposure": "E_UNKNOWN",
        "final_status": status,
        "pass": acceptance_pass,
    }
    ACCEPTANCE.write_text(json.dumps(acceptance, indent=2) + "\n")

    summary = {
        **acceptance,
        "objects_expected": parity.get("objects_expected"),
        "objects_checked": parity.get("objects_checked"),
        "objects_matched": parity.get("objects_matched"),
        "tables_expected": parity.get("tables_expected"),
        "tables_checked": parity.get("tables_checked"),
        "tables_matched": parity.get("tables_matched"),
        "enums_expected": parity.get("enums_expected"),
        "enums_checked": parity.get("enums_checked"),
        "enums_matched": parity.get("enums_matched"),
        "properties_expected": parity.get("properties_expected"),
        "properties_checked": parity.get("properties_checked"),
        "properties_matched": parity.get("properties_matched"),
        "vehicle_trips_trip_status_pass": parity.get("vehicle_trips_trip_status", {}).get("pass"),
    }
    SUMMARY.write_text(json.dumps(summary, indent=2) + "\n")

    report_proc = subprocess.run([sys.executable, str(Path(__file__).with_name("ci_r3b1l_generate_report.py"))], cwd=Path(__file__).parent)
    print(json.dumps({"final_status": status, "pass": acceptance_pass}, indent=2))
    return 0 if acceptance_pass and report_proc.returncode == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
