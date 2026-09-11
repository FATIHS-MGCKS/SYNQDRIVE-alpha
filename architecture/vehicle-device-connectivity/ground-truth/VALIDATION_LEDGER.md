# Vehicle & Device Connectivity — Validation Ledger

Append-only record of validation runs and ground-truth gates.

| ID | Date | Type | Scope | Result | Evidence |
|----|------|------|-------|--------|----------|
| VDC-VAL-001 | 2026-09-11 | Repository audit | Phase 1 code/doc reconstruction | PASS | `evidence/REPOSITORY_INVENTORY.md` |
| VDC-VAL-002 | 2026-09-11 | Graph validator | Knowledge graph schema | PASS | `scripts/validate-graph.sh` |
| VDC-VAL-003 | 2026-09-11 | Registry validator | Central module registry | PASS | `architecture/scripts/validate-module-registry.sh` |
| VDC-VAL-004 | 2026-09-11 | Production read-only | LTE_R1 KS MX 2024 forensics | PASS | `evidence/LTE_R1_KS_MX_2024_PRODUCTION_FORENSICS.md` |
| VDC-VAL-005 | 2026-09-11 | Production baseline | VPS topology + drift | PASS | `evidence/PRODUCTION_BASELINE.md` |
| VDC-VAL-006 | 2026-09-11 | Threshold window forensics | Poll/alert queries per 24 h cycle | PASS | `evidence/LTE_R1_KS_MX_2024_PRODUCTION_FORENSICS.md` §4b |
| VDC-VAL-007 | 2026-09-11 | Runtime semantic drift | `git diff` connectivity paths Production vs main | PASS — NONE_OBSERVED | `evidence/PRODUCTION_BASELINE.md` |
| VDC-VAL-GT-001 | — | Ground truth | GT-R1-UNPLUG-001 physical unplug/replug | **NOT EXECUTED** | Requires explicit user authorization |

## Pending ground truth

| Protocol | Status | Path |
|----------|--------|------|
| GT-R1-UNPLUG-001 | Prepared, not executed | [TEST_STRATEGY.md](./TEST_STRATEGY.md#gt-r1-unplug-001) |
