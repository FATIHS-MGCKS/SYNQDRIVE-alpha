# Driving Intelligence — Evidence

**Canonical catalog:** [EVIDENCE_INDEX.md](./EVIDENCE_INDEX.md)

Evidence contract for the canonical authority. Graph nodes use `DI-EVID-*` and `DI-TEST-*` IDs.

## Classification

| Tag | Meaning |
|-----|---------|
| CURRENT_CODE | Verified in repository runtime |
| CURRENT_TEST | Automated test coverage |
| REFERENCE_DRIVE | RD001–RD004 DIMO LTE_R1 captures |
| AUDIT_DOCUMENT | `docs/audits/driving-intelligence-*` |
| ARCHITECTURE_DOCUMENT | `architecture/DI_EV_*`, `docs/architecture/*` |
| PRODUCTION_OBSERVATION | Deployed runtime observation (scoped) |

## Primary evidence bundles

| ID | Path | Topic |
|----|------|-------|
| DI-EVID-PHASE1-001 | `docs/audits/driving-intelligence-phase-1-current-state-forensic-audit-2026-08-30.md` | V1 baseline |
| DI-EVID-RD003-CADENCE-001 | `docs/audits/driving-intelligence-rd003-signal-quality-interpretation-2026-09.md` | 1s≠1Hz |
| DI-EVID-0035C-RECOVERY-001 | `architecture/DI_EV_0035C_HF_RECOVERY_RUNTIME_IMPLEMENTATION_2026-09-04.md` | HF recovery V2 |
| DI-EVID-0035C1-BLOCK-001 | `docs/audits/driving-intelligence-hf-block-polling-scalability-2026-09.md` | Block polling C.1–C.1e |
| DI-EVID-0034F-DESIGN-001 | `docs/audits/driving-intelligence-v2-canonical-design-2026-09.md` | Episode V2 design |

## Subdirectories

| Directory | Contract |
|-----------|----------|
| `signal-inventory/` | DIMO signal catalog, units, availability |
| `reference-capture/` | RD00x drives, HF recovery, calibration |
| `driving-events/` | Event taxonomy, thresholds, native vs HF |
| `driving-score/` | Impact V1 formulas, aggregation |
| `tire-brake-load/` | Load proxy semantics, health wiring |
| `temporal-analytics/` | Rolling windows, rental aggregation |
| `production/` | Production deployment observations |

## Registry note

`docs/audits/driving-intelligence-evidence-registry.md` indexes through DI-EV-0035C.1c. C.1d and C.1e are documented in the block-polling audit and this authority.
