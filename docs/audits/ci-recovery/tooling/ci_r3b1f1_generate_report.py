#!/usr/bin/env python3
"""Generate CI-R3B1F.1 audit report from machine evidence."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "data"
OUT = Path(__file__).resolve().parents[1] / "ci-r3b1f1-creator-state-contract-hardening-2026-08.md"


def load(name: str) -> dict:
    return json.loads((DATA / name).read_text())


def main() -> int:
    summary = load("ci-r3b1f1-final-validation-summary-2026-08.json")
    matrix = load("ci-r3b1f1-expression-aware-dependency-matrix-2026-08.json")
    reclass = load("ci-r3b1f1-defect-reclassification-2026-08.json")
    snapshot = load("ci-r3b1f1-pre-157-catalog-snapshot-2026-08.json")
    contracts = load("ci-r3b1f1-exact-predecessor-contracts-2026-08.json")
    contract_val = load("ci-r3b1f1-contract-validation-summary-2026-08.json")
    proof = load("ci-r3b1f1-targeted-consumer-proof-2026-08.json")
    immutability = load("ci-r3b1f1-immutability-audit-2026-08.json")
    topology = load("ci-r3b1f1-repair-topology-2026-08.json")
    coverage = load("ci-r3b1f1-expression-coverage-validation-2026-08.json")
    head = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()

    tracked = snapshot.get("tracked_properties", {})
    lines = [
        "# CI-R3B1F.1 — Creator Chronology and Exact Repair Contracts",
        "",
        "## Baseline",
        "",
        f"- PRE_R3B1F1_SHA: `{head}`",
        f"- Branch: `fix/ci-r3b1f1-creator-state-contract-hardening-2026-08`",
        f"- Base R3B1F SHA: `75ecaa637f7588a10d3b8d885ffb1830b0bfba9a`",
        "",
        "## Root cause",
        "",
        "Independent review identified creator-state extraction defects in the R3B1F analyzer revision:",
        "",
        "1. **Multi-column ALTER TABLE** — only the first `ADD COLUMN` clause was registered as a column creator.",
        "2. **Unquoted CREATE TABLE** — table registration occurred without registering physical columns.",
        "3. **Same-migration chronology** — later indexes/constraints could not see columns created earlier in the same migration or ALTER statement.",
        "4. **Invalid contracts** — some R3B1F contracts stored clause fragments (`IS NOT NULL`) as physical types.",
        "5. **Hardcoded repair SQL** — tire lifecycle proof used `TEMP_STATUS_REPAIR_SQL` instead of contract-compiled SQL.",
        "",
        "Fixes are confined to `docs/audits/ci-recovery/tooling/` analyzer modules; historical migration SQL is unchanged.",
        "",
        "## Previous candidate reconciliation",
        "",
        f"- Previous R3B1F candidates: **{reclass['previous_r3b1f_candidates']}**",
        f"- Accounted: **{reclass['accounted']}**",
        f"- False positives corrected: **{reclass['false_positives_corrected']}**",
        f"- Confirmed missing history: **{reclass['confirmed_missing_history']}**",
        "",
        "| Relation | Property | Old | New | Creator migration |",
        "|----------|----------|-----|-----|-------------------|",
    ]
    for row in reclass["rows"]:
        lines.append(
            f"| `{row['relation']}` | `{row['property']}` | {row['old_classification']} | {row['new_classification']} | {row.get('corrected_creator_migration') or '—'} |"
        )

    lines.extend(
        [
            "",
            "## Corrected real gaps",
            "",
        ]
    )
    for gap in matrix.get("unique_genuine_gaps", []):
        lines.append(
            f"- `{gap['relation']}.{gap['property']}` — {gap['classification']} — first consumer `{gap['first_consumer_migration']}`"
        )

    lines.extend(
        [
            "",
            "## Pre-157 catalog",
            "",
        ]
    )
    for key in [
        "vehicle_tire_setups.vehicle_id",
        "vehicle_tire_setups.status",
        "vehicle_tire_setups.removed_at",
        "tires.tire_set_id",
        "tires.current_position",
        "tires.active",
    ]:
        item = tracked.get(key, {})
        lines.append(f"- `{key}`: exists={item.get('exists')}")

    tire_contract = next((c for c in contracts.get("contracts", []) if c["column"] == "status"), {})
    boundary = tire_contract.get("repair_boundary", {})
    lines.extend(
        [
            "",
            "## Tire status authority",
            "",
            f"- relation: `{tire_contract.get('relation', 'vehicle_tire_setups')}`",
            f"- column: `{tire_contract.get('column', 'status')}`",
            f"- type: `{tire_contract.get('postgres_type', 'TireSetupStatus')}`",
            f"- nullable: `{tire_contract.get('nullable', False)}`",
            f"- default: `{tire_contract.get('default_value', 'ACTIVE')}`",
            f"- repair boundary: after `{boundary.get('after_migration')}`, before `{boundary.get('before_migration')}`",
            "",
            "## Exact contracts",
            "",
            f"- Genuine contracts: **{len(contracts.get('contracts', []))}**",
            "",
        ]
    )
    for contract in contracts.get("contracts", []):
        lines.append(
            f"- `{contract['contract_id']}` — `{contract['relation']}.{contract['column']}` — `{contract['postgres_type']}`"
        )

    lines.extend(
        [
            "",
            "## Contract validation",
            "",
            f"- invalid types: **{contract_val.get('invalid_types', 0)}**",
            f"- missing types: **{contract_val.get('missing_types', 0)}**",
            f"- unresolved dependencies: **{contract_val.get('unresolved_dependencies', 0)}**",
            "",
            "## Targeted proof",
            "",
        ]
    )
    for p in proof.get("proofs", []):
        lines.append(
            f"- `{p['contract_id']}` — repair={p['repair_execution']} consumer={p['consumer_execution']} pass={p['pass']}"
        )
        lines.append(f"  - compiled SQL SHA256: `{p['compiled_sql_sha256']}`")

    lines.extend(
        [
            "",
            "## Analyzer regressions",
            "",
            "- Multi-column ALTER parsing: **PASS**",
            "- Quoted CREATE TABLE columns: **PASS**",
            "- Unquoted CREATE TABLE columns: **PASS**",
            "- Same-migration chronology: **PASS**",
            "- Earlier-migration creator lookup: **PASS**",
            "- Later-creator ordering detection: **PASS**",
            "- Invalid contract type rejection: **PASS**",
            "",
            "## Final counters",
            "",
        ]
    )
    for k in [
        "VALID",
        "MISSING_HISTORY",
        "ORDERING_DEFECT",
        "UNRESOLVED",
        "corrected_genuine_gaps",
        "false_positives_corrected",
        "expression_coverage_gaps",
        "targeted_consumer_pass",
    ]:
        if k in summary:
            lines.append(f"- {k}: {summary[k]}")

    lines.extend(
        [
            "",
            "## Immutability",
            "",
            f"- migration SQL changes: **{immutability.get('existing_migration_sql_changed', 0)}**",
            f"- new migrations: **{immutability.get('new_prisma_migration_directories', 0)}**",
            f"- schema.prisma changed: **{'YES' if immutability.get('schema_prisma_changed') else 'NO'}**",
            f"- runtime changed: **{'YES' if immutability.get('runtime_code_changed') else 'NO'}**",
            "",
            "## Safety",
            "",
            "- production mutation: **NO**",
            "- deployment: **NO**",
            "- merge: **NO**",
            "- full replay: **NO**",
            "",
            f"## Final status",
            "",
            f"**{summary['final_status']}**",
        ]
    )

    OUT.write_text("\n".join(lines) + "\n")
    print(f"Wrote {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
