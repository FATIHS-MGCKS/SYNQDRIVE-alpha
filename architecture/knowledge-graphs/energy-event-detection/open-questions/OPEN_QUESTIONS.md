# KG-EED Open Questions — Classification (Phase 2B.1)

All 12 discovery open questions classified. **Separate current-state facts from future architecture questions.**

## Current-state facts (CONFIRMED — not open questions)

| Fact | Node | Evidence |
|------|------|----------|
| No dedicated BullMQ energy scheduler today | `EED-ST-001` | EED-EV-0001 |
| Detect runs at reconciliation step 5 (when service injected) | `EED-ST-001`, `EED-FB-001` | EED-EV-0001 |
| Manual POST detect and ops scripts exist as alternate triggers | `EED-RETRY-001`, `EED-JOB-001` | EED-EV-0012 |

## Open question table

| ID | Question | Classification | Status | Blocks authority? | Production safety? |
|----|----------|----------------|--------|-------------------|------------------|
| EED-OQ-001 | Should EED get dedicated BullMQ scheduler? | **OPEN** | Future architecture only; current state in EED-ST-001 | NO | LOW |
| EED-OQ-002 | Safe automated backfill for NULL fuelLevelRise rows? | **RESOLVED** (policy) | EED-DEC-009: no fleet backfill | NO | NO |
| EED-OQ-003 | Persist recharge charging flags on VehicleEnergyEvent? | **OPEN** | Fetched in normalizer; not persisted | NO | LOW |
| EED-OQ-004 | Link RECHARGE to HvChargeSession? | **OUT_OF_SCOPE** | Battery V2 owns HV sessions; INFERRED orthogonality | NO | NO |
| EED-OQ-005 | detectorVersion DB column? | **OPEN** | Version in logs/meta only | NO | LOW |
| EED-OQ-006 | Plausibility flags on production rows? | **PARTIALLY_RESOLVED** | Recovery tooling only today | NO | LOW |
| EED-OQ-007 | Fleet overlapping sibling remediation policy? | **OPEN** | Runtime guard works; ~3 pairs inventory | NO | LOW |
| EED-OQ-008 | Should UI call POST detect? | **OPEN** | API exists; UI does not expose | NO | LOW |
| EED-OQ-009 | Fuel station enrichment vs EED semantics? | **OPEN** | Separate module; EED consumes projection | NO | LOW |
| EED-OQ-010 | ClickHouse fuel sample mirror? | **OUT_OF_SCOPE** | Analytics authority | NO | NO |
| EED-OQ-011 | RECHARGE UI for multi-hour coalesced sessions? | **OPEN** | Copy adequacy unproven at scale | NO | LOW |
| EED-OQ-012 | Observability SLOs for rise null rate? | **OPEN** | Metrics exist; no SLO thresholds | NO | LOW |

## Deferred (reference only)

| Topic | Classification |
|-------|----------------|
| KG-ATE FM-007 | **DEFERRED** — not EED authority |
| KG-ATE multi-replica | **DEFERRED** — indirect cadence only |

## Summary (corrected in 2B.1 review)

| Metric | Count |
|--------|------:|
| Total discovery questions | 12 |
| RESOLVED (policy) | 1 (OQ-002) |
| PARTIALLY_RESOLVED | 1 (OQ-006) |
| OPEN | 8 |
| OUT_OF_SCOPE | 2 |
| Current-state facts extracted | 3 (scheduler coupling — not counted as open) |

**OPEN_QUESTIONS_RESOLVED:** 1  
**OPEN_QUESTIONS_PARTIALLY_RESOLVED:** 1  
**OPEN_QUESTIONS_REMAINING:** 10 (8 OPEN + 2 OUT_OF_SCOPE)

Graph nodes EED-OQ-001 … EED-OQ-012 retained for traceability.
