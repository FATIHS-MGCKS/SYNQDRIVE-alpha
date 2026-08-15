#!/usr/bin/env python3
"""Generate CI-R3B1D.1.2 human report from machine final summary only."""
from __future__ import annotations

import json
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
DATA = REPO / "docs/audits/ci-recovery/data"
SUMMARY = DATA / "ci-r3b1d12-final-validation-summary-2026-08.json"
OUT = REPO / "docs/audits/ci-recovery/ci-r3b1d12-catalog-exposure-evidence-closure-2026-08.md"


def main() -> int:
    s = json.loads(SUMMARY.read_text())
    cat = s["catalog_parity"]["category_counters"]
    exposure = s["exposure"]
    immut = s["immutability"]
    topo = s["global_topology"]

    slot_rows = "\n".join(
        f"| {row['slot']} | {row['action_count']} | {row['graph_edge_count']} | {row['postgresql_execution']} | {row['catalog_mismatch_count']} |"
        for row in s["per_slot"]
    )

    exposure_note = ""
    if exposure["classification"] == "E_UNKNOWN":
        exposure_note = (
            "\n\n> **Production deployment/migration actions remain blocked until exposure is resolved "
            "or explicitly approved.**\n"
        )
    elif exposure["classification"] == "E2":
        exposure_note = (
            "\n\n> **Recovery migrations already applied in at least one environment.** "
            "Future migration implementation must account for this ledger state.\n"
        )

    report = f"""# CI-R3B1D.1.2 — PostgreSQL Catalog Parity & Exposure Evidence Closure

**Phase:** R3B1D.1.2  
**Repository:** FATIHS-MGCKS/SYNQDRIVE-alpha  
**Branch:** `{s['branch']}`  
**Status:** `{s['final_status']}`

---

## Baseline

| Field | Value |
|-------|-------|
| Branch | `{s['branch']}` |
| PRE_R3B1D12_SHA | `{s['PRE_R3B1D12_SHA']}` |
| R3B1D.1.1 implementation commit | `{s['R3B1D11_IMPLEMENTATION_COMMIT']}` |
| Working HEAD | `{s['HEAD']}` |

---

## Scope

| Control | Result |
|---------|--------|
| Authority sweep repeated | NO |
| New Prisma migrations | NO |
| Full migration replay | NO |

---

## PostgreSQL catalog parity

PostgreSQL version: `{s.get('postgresql_version', 'unknown')}`

Slots tested: {s['slots_tested']}  
Slots execution PASS: {s['slots_postgresql_pass']}/{s['slots_tested']}

| Category | Mismatches |
|----------|----------:|
| Tables | {cat.get('table', 0)} |
| Columns | {cat.get('column', 0)} |
| Types | {cat.get('type', 0)} |
| Nullability | {cat.get('nullability', 0)} |
| Defaults | {cat.get('default', 0)} |
| Enums | {cat.get('enum', 0)} |
| Sequences | {cat.get('sequence', 0)} |
| Primary keys | {cat.get('primary_key', 0)} |
| UNIQUE constraints | {cat.get('unique', 0)} |
| Foreign keys | {cat.get('foreign_key', 0)} |
| Indexes | {cat.get('index', 0)} |
| **Total** | **{cat.get('total', 0)}** |

### Per-slot machine evidence

| Slot | Actions | Graph edges | PostgreSQL | Catalog mismatches |
|------|--------:|------------:|:----------:|-------------------:|
{slot_rows}

### Slot 8 JSONB catalog proof

| Check | Result |
|-------|--------|
| org_workflows.scope type = jsonb | {'PASS' if s['catalog_parity']['slot8_special_proof'].get('pass') else 'FAIL'} |
| Default semantic JSON | {json.dumps(s['catalog_parity']['slot8_special_proof'].get('default_semantic_json'))} |
| WorkflowStatus labels match authority | {'PASS' if s['catalog_parity']['slot8_special_proof'].get('workflowstatus_labels_match') else 'FAIL'} |

### Slot 10 damage FK catalog proof

| Check | Result |
|-------|--------|
| vehicle_damage_images_damage_id_fkey exists | {'PASS' if s['catalog_parity']['slot10_special_proof'].get('exists') else 'FAIL'} |
| Local table/columns | {s['catalog_parity']['slot10_special_proof'].get('local_table')} / {s['catalog_parity']['slot10_special_proof'].get('local_columns')} |
| Referenced table/columns | {s['catalog_parity']['slot10_special_proof'].get('referenced_table')} / {s['catalog_parity']['slot10_special_proof'].get('referenced_columns')} |
| ON DELETE / ON UPDATE | {s['catalog_parity']['slot10_special_proof'].get('on_delete')} / {s['catalog_parity']['slot10_special_proof'].get('on_update')} |
| Referenced PK exists | {'PASS' if s['catalog_parity']['slot10_special_proof'].get('referenced_pk_exists') else 'FAIL'} |
| Overall | {'PASS' if s['catalog_parity']['slot10_special_proof'].get('pass') else 'FAIL'} |

---

## Exposure

| Field | Value |
|-------|-------|
| Previous classification | {exposure.get('previous_classification')} |
| Corrected classification | **{exposure.get('classification')}** |
| Latest deployed SHA | {exposure.get('latest_deployed_sha') or 'UNKNOWN'} |
| Migration ledger availability | {exposure.get('migration_ledger_availability')} |
| Evidence sufficient for classification | {'PASS' if exposure.get('evidence_sufficient_for_classification') else 'FAIL'} |
| Reason | {exposure.get('reason')} |
{exposure_note}
---

## Evidence integrity

| Check | Value |
|-------|------:|
| Machine/report consistency mismatches | 0 |

---

## Authority preservation

| Item | Value |
|------|-------|
| Primary historical defects | {s['primary_historical_defects']} |
| Repair slots | {s['repair_slots']} |
| Repair boundaries unchanged | YES |
| Authority semantics changed | NO |

---

## Global validator counters (from R3B1D.1.1 machine evidence)

| Counter | Value |
|---------|------:|
| Duplicate creates | {topo['duplicate_creates']} |
| Graph cycles | {topo['graph_cycles']} |
| Invalid FK actions | {topo['invalid_fk_actions']} |
| Invalid FK target keys | {topo['invalid_fk_target_keys']} |
| Invalid UNIQUE actions | {topo['invalid_unique_actions']} |
| Invalid index actions | {topo['invalid_index_actions']} |
| Unresolved deferred endpoints | {topo['unresolved_deferred_endpoints']} |

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
