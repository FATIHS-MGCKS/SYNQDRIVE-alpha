#!/usr/bin/env python3
"""Generate CI-R3B1F audit report."""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "data"
OUT = Path(__file__).resolve().parents[1] / "ci-r3b1f-tire-lifecycle-expression-dependency-closure-2026-08.md"


def load(name: str) -> dict:
    return json.loads((DATA / name).read_text())


def main() -> int:
    semantics = load("ci-r3b1f-r3b1e-runtime-semantics-correction-2026-08.json")
    snapshot = load("ci-r3b1f-pre-157-catalog-snapshot-2026-08.json")
    gap = load("ci-r3b1f-tire-lifecycle-predecessor-gap-2026-08.json")
    matrix = load("ci-r3b1f-expression-aware-dependency-matrix-2026-08.json")
    simulation = load("ci-r3b1f-tire-targeted-simulation-2026-08.json")
    summary = load("ci-r3b1f-validation-summary-2026-08.json")
    immutability = load("ci-r3b1f-immutability-audit-2026-08.json")
    topology = load("ci-r3b1f-expression-gap-repair-topology-2026-08.json")
    head = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()

    tracked = snapshot.get("tracked_properties", {})
    lines = [
        "# CI-R3B1F — Tire Lifecycle Expression Dependency Closure",
        "",
        "## Baseline",
        "",
        f"- Branch: `fix/ci-r3b1f-tire-predicate-dependency-closure-2026-08`",
        f"- PRE_R3B1F_SHA: `{semantics['PRE_R3B1F_SHA']}`",
        f"- Base R3B1E SHA: `{semantics['BASE_R3B1E_SHA']}`",
        f"- HEAD: `{head}`",
        "",
        "## R3B1E failure correction",
        "",
        "- Slot 13 repair: **PASS**",
        "- Slot 13 consumer (`20260716183000_tire_lifecycle_invariants`): **FAIL**",
        "- Slots 14–16: **NOT_REACHED**",
        "- Classification: **AUTHORITY_GAP_AT_PROTECTED_CONSUMER**",
        "",
        "Original R3B1E evidence incorrectly marked Slot 13 consumer as NOT_REACHED because full replay halted at the same migration; successor correction records consumer reached and failed.",
        "",
        "## Pre-157 snapshot",
        "",
    ]
    for key in [
        "vehicle_tire_setups.vehicle_id",
        "vehicle_tire_setups.status",
        "vehicle_tire_setups.removed_at",
        "tires.tire_set_id",
        "tires.current_position",
        "tires.active",
    ]:
        item = tracked.get(key, {})
        gap_item = next((g for g in gap.get("gaps", []) if f"{g['relation']}.{g['property']}" == key), {})
        lines.append(f"- `{key}`: **{gap_item.get('classification', 'UNKNOWN')}** (exists={item.get('exists')})")

    lines.extend(
        [
            "",
            "## Tire authority",
            "",
            "Primary missing property: `vehicle_tire_setups.status` (TireSetupStatus, NOT NULL, default ACTIVE).",
            "",
            "Slot 13 created `TireSetupStatus` enum but did not ADD COLUMN `status`. Migration 157 partial unique index predicate references `status` and `removed_at`; only `status` is missing pre-157.",
            "",
            f"Should Slot 13 authority have included status? **YES** — {gap.get('slot_13_should_have_included_status_rationale', '')}",
            "",
            "## Analyzer root cause",
            "",
            "`sql_migration_analyzer.py` CREATE INDEX handler extracted only parenthesized key columns via regex; **WHERE partial-index predicates were not parsed**. TireSetupStatus enum was captured via ALTER TYPE / CREATE TYPE paths, but predicate column `status` was invisible to the matrix.",
            "",
            "## Analyzer hardening",
            "",
            "Added `expression_dependency_extractor.py` and integrated into `check_statement_dependencies`:",
            "",
            "- partial-index predicates (`PARTIAL_INDEX_PREDICATE`)",
            "- index expressions (`INDEX_EXPRESSION`)",
            "- CHECK expressions (`CHECK_EXPRESSION`)",
            "- generated expressions (`GENERATED_EXPRESSION`)",
            "- ALTER USING (`ALTER_USING_EXPRESSION`)",
            "- UPDATE SET expressions (`UPDATE_EXPRESSION`)",
            "- casts, qualified identifiers, IS NULL / boolean predicates",
            "- false-positive control for keywords, functions, type names, literals",
            "",
            "## Remaining-range sweep",
            "",
            f"- First migration: `{matrix['audit_scope']['first_migration']}`",
            f"- Last migration: `{matrix['audit_scope']['last_migration']}`",
            f"- Migrations scanned: {matrix['audit_scope']['migrations_scanned']}",
            f"- Dependency records: {matrix['audit_scope']['dependency_checks_generated']}",
            f"- Expression/predicate records: {matrix['audit_scope']['expression_predicate_records']}",
            "",
            "## Classification counters",
            "",
        ]
    )
    for k, v in matrix["classification_totals"].items():
        if k != "TOTAL":
            lines.append(f"- {k}: {v}")

    lines.extend(
        [
            "",
            "## New authority gaps",
            "",
            f"- Previous primary defects: {matrix.get('previous_primary_defects')}",
            f"- New expression-derived primary defects: {matrix.get('new_expression_derived_primary_defects')}",
            f"- Total revised defects: {matrix.get('total_revised_defects')}",
            "",
        ]
    )
    for defect in matrix.get("unique_new_defects", []):
        lines.append(
            f"- `{defect['relation']}.{defect['property']}` — {defect['classification']} — first consumer `{defect['first_consumer_migration']}`"
        )

    lines.extend(
        [
            "",
            "## Proposed repair topology",
            "",
        ]
    )
    for slot in topology.get("slots", []):
        lines.append(
            f"- `{slot['topology_id']}` after `{slot['after_migration']}` before `{slot['before_migration']}` — repairs {', '.join(slot['objects_properties_repaired'])}"
        )

    lines.extend(
        [
            "",
            "## Targeted simulations",
            "",
            f"- Temporary predecessor repair: **{'PASS' if simulation.get('temporary_repair_executed') else 'FAIL'}**",
            f"- Unchanged migration 157: **{'PASS' if simulation.get('migration_157_pass') else 'FAIL'}**",
            f"- `vehicle_tire_setups` partial unique index: **{'PASS' if simulation.get('partial_index_vehicle_tire_setups_pass') else 'FAIL'}**",
            f"- `tires` partial unique index: **{'PASS' if simulation.get('partial_index_tires_pass') else 'FAIL'}**",
            "",
            "## Immutability",
            "",
            f"- migration SQL changed: {immutability.get('existing_migration_sql_changed', 'unknown')}",
            f"- schema.prisma changed: {'NO' if not immutability.get('schema_prisma_changed') else 'YES'}",
            f"- runtime changed: {'NO' if not immutability.get('runtime_code_changed') else 'YES'}",
            "",
            "## Safety",
            "",
            "- new Prisma migration created: **NO**",
            "- full replay beyond 157: **NO**",
            "- production mutation: **NO**",
            "- deployment: **NO**",
            "- merge: **NO**",
            "",
            f"## Final status",
            "",
            f"**{summary['final_status']}**",
            "",
        ]
    )
    OUT.write_text("\n".join(lines) + "\n")
    print(f"Wrote {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
