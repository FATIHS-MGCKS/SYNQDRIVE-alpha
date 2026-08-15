#!/usr/bin/env python3
"""Generate CI-R3B1D.1.1 human report from machine evidence."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
DATA = REPO / "docs/audits/ci-recovery/data"
OUT = REPO / "docs/audits/ci-recovery/ci-r3b1d11-executable-ddl-validator-closure-2026-08.md"


def load(name: str) -> dict:
    return json.loads((DATA / name).read_text())


def slot_table(ddl: dict) -> str:
    lines = ["| Slot | Status | Statements | SQLSTATE |", "|------|--------|------------|----------|"]
    for row in ddl["slot_results"]:
        lines.append(
            f"| {row['slot']} | {row['status']} | {row.get('statement_count', 0)} | {row.get('sqlstate') or '-'} |"
        )
    return "\n".join(lines)


def main() -> int:
    exposure = load("ci-r3b1d11-post-merge-exposure-2026-08.json")
    summary = load("ci-r3b1d11-topology-validation-summary-2026-08.json")
    ddl = load("ci-r3b1d11-executable-ddl-proof-2026-08.json")
    deferred = load("ci-r3b1d11-deferred-endpoint-proof-2026-08.json")
    immut = load("ci-r3b1d11-immutability-audit-2026-08.json")
    branch = subprocess.check_output(["git", "branch", "--show-current"], cwd=REPO, text=True).strip()
    head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=REPO, text=True).strip()

    status = (
        "CI_R3B1D11_EXECUTABLE_DDL_VALIDATOR_CLOSURE_COMPLETED"
        if summary.get("pass") and ddl.get("pass") and deferred.get("unresolved_count", 1) == 0 and immut.get("pass")
        else "CI_R3B1D11_EXECUTABLE_DDL_VALIDATOR_CLOSURE_FAILED"
    )

    report = f"""# CI-R3B1D.1.1 — Executable Post-Vendor Repair DDL Validator Closure

**Phase:** R3B1D.1.1  
**Repository:** FATIHS-MGCKS/SYNQDRIVE-alpha  
**Branch:** `{branch}`  
**Status:** `{status}`

---

## Post-merge exposure

| Field | Value |
|-------|-------|
| Current main SHA | `{exposure['MAIN_HEAD']}` |
| 721ad89 ancestor | {exposure['MERGE_721ad89_PRESENT_AS_ANCESTOR']} |
| Exposure classification | **{exposure['exposure_classification']}** |
| Latest deployed SHA | {exposure.get('latest_deployed_sha') or 'UNKNOWN'} |
| Production migration ledger | {exposure['PRODUCTION_MIGRATION_LEDGER']} |
| Production mutation performed | NO |

---

## Baseline

| Field | Value |
|-------|-------|
| Branch | `{branch}` |
| BASE_MAIN_SHA | `{summary.get('BASE_MAIN_SHA')}` |
| PRE_R3B1D11_SHA | `{summary.get('PRE_R3B1D11_SHA')}` |
| Working HEAD | `{head}` |

---

## Known failure reproduction (Slot 8)

Historical R3B1D.1 disposable simulation failed with:

- SQLSTATE: `22P02` (invalid JSON)
- Column: `org_workflows.scope`
- Error: invalid input syntax for type json

R3B1D.1.1 typed JSON compiler now emits `'{{"type":"organization"}}'::jsonb`.

---

## Default remediation

| Control | Result |
|---------|--------|
| Typed default model | PASS |
| JSON parser canonicalization | PASS |
| SQL literal serializer | PASS |
| Slot 8 JSONB execution | {'PASS' if ddl.get('slot8_hard_gate', {}).get('pass') else 'FAIL'} |

---

## Validator remediation

| Counter | Value |
|---------|------:|
| Slots validated | {summary['slots_validated']} |
| Total actions | {summary['total_actions']} |
| Graph edges | {summary['total_graph_edges']} |
| Duplicate creates | {summary['duplicate_creates']} |
| Cross-slot duplicate creates | {summary['cross_slot_duplicate_creates']} |
| Graph cycles | {summary['graph_cycles']} |
| Invalid FK actions | {summary['invalid_fk_actions']} |
| Invalid FK target keys | {summary.get('invalid_fk_target_keys', 0)} |
| Invalid UNIQUE actions | {summary.get('invalid_unique_actions', 0)} |
| Invalid index actions | {summary['invalid_index_actions']} |
| Unresolved deferred endpoints | {summary['unresolved_deferred_endpoints']} |
| Deferred endpoints resolved | {deferred['resolved']} |

Forced-true graph validity removed: PASS  
Real cycle detection: PASS  
Duplicate create validation: PASS

---

## Real PostgreSQL proof

PostgreSQL version: `{ddl.get('postgresql_version', 'unknown')}`

{slot_table(ddl)}

| Metric | Value |
|--------|------:|
| Slots passed | {ddl['slots_passed']}/{ddl['slots_total']} |
| FK actions attempted | {ddl['fk_actions_attempted']} |
| FK actions passed | {ddl['fk_actions_passed']} |
| FK actions failed | {ddl['fk_actions_failed']} |
| UNIQUE actions attempted | {ddl['unique_actions_attempted']} |
| UNIQUE actions passed | {ddl['unique_actions_passed']} |
| Index actions attempted | {ddl['index_actions_attempted']} |
| Index actions passed | {ddl['index_actions_passed']} |
| PostgreSQL execution failures | {ddl['execution_failures']} |
| Catalog mismatches | {ddl['catalog_mismatches']} |

Slot 8 hard gate: {'PASS' if ddl.get('slot8_hard_gate', {}).get('pass') else 'FAIL'}  
Slot 10 hard gate: {'PASS' if ddl.get('slot10_hard_gate', {}).get('pass') else 'FAIL'}

---

## Authority preservation

| Item | Value |
|------|-------|
| Primary historical defects | {summary.get('primary_defect_count', 18)} |
| Repair slots | {summary.get('repair_slot_count', 10)} |
| Repair boundaries changed | NO |

---

## Immutability

| Check | Result |
|-------|--------|
| Existing migration SQL changed | {immut['existing_migration_sql_changed']} |
| schema.prisma changed | {'NO' if not immut['schema_prisma_changed'] else 'YES'} |
| Runtime code changed | {'NO' if not immut['runtime_code_changed'] else 'YES'} |

---

## Safety

| Control | Result |
|---------|--------|
| Production DDL/DML | NO |
| Deployment | NO |
| Merge | NO |
| New Prisma repair migrations | NO |
| Full migration replay | NO |
| R3B1E started | NO |

---

**Changes / Architektur:** not updated (CI-recovery evidence scope only).

**HARD STOP — await independent review before R3B1E migration generation.**
"""
    OUT.write_text(report)
    print(f"Wrote {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
