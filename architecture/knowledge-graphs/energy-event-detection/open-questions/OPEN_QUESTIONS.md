# KG-EED Open Questions — Classification (Phase 2B)

All 12 discovery open questions classified. **Do not force-close without evidence.**

| ID | Original question | Classification | Answer / status | Evidence | Blocks authority? | Production safety? | Owning workstream |
|----|-------------------|----------------|-----------------|----------|-------------------|--------------------|-------------------|
| EED-OQ-001 | Dedicated energy BullMQ scheduler vs reconciliation coupling? | **OPEN** | No dedicated energy scheduler. Detect cadence inherits trip reconciliation fast/warm/cold tiers. | EED-EV-0001 | NO — documented coupling | LOW — detect delayed if reconcile skipped | KG-EED / future platform |
| EED-OQ-002 | Safe automated backfill for NULL fuelLevelRise rows? | **RESOLVED** (policy) | Product owner: **no fleet backfill required**. Forward-correct only. | EED-EV-0017, EED-DEC-009 | NO | NO — NULL is acceptable | KG-EED (closed as policy) |
| EED-OQ-003 | Persist recharge `isCharging` / `addedEnergy` on VehicleEnergyEvent? | **OPEN** | Normalizer fetches; not persisted on row today. | EED-EV-0009 | NO | LOW | KG-EED |
| EED-OQ-004 | Link VehicleEnergyEvent RECHARGE to HvChargeSession? | **OUT_OF_SCOPE** | Battery V2 owns HV session lifecycle. No auto-link. | EED-EV-0022 | NO | NO | Battery V2 + KG-EED future |
| EED-OQ-005 | `detectorVersion` column for forensic replay? | **OPEN** | Version in logs/rawDetectionMeta only; no DB column. | EED-EV-0013 | NO | LOW | KG-EED |
| EED-OQ-006 | Plausibility flags in production rows vs recovery-only? | **PARTIALLY_RESOLVED** | Odometer plausibility in recovery tooling; not on canonical row. | discovery C2 | NO | LOW | KG-EED recovery |
| EED-OQ-007 | Fleet-wide overlapping sibling inventory (3 pairs) remediation? | **OPEN** | Sibling reconcile works at runtime; fleet inventory policy undecided. | EED-EV-0011 | NO | LOW — guarded deletes | KG-EED ops |
| EED-OQ-008 | Frontend POST detect — should UI ever call it? | **OPEN** | API exists; rental UI does not expose. | EED-EV-0012 | NO | LOW | KG-EED / frontend |
| EED-OQ-009 | Fuel station enrichment card vs EED semantics alignment? | **OPEN** | Phase F enrichment separate; EED consumes read projection. | discovery | NO | LOW | KG-EED + enrichment |
| EED-OQ-010 | ClickHouse mirror for fuel samples long-term? | **OUT_OF_SCOPE** | Analytics/telemetry authority; EED fetches live DIMO today. | EED-EV-0007 | NO | NO | Analytics platform |
| EED-OQ-011 | RECHARGE duration UI when coalesced multi-hour sessions? | **OPEN** | Coalesce may produce long envelopes; UI copy adequacy unproven at scale. | EED-EV-0006 | NO | LOW | KG-EED / frontend |
| EED-OQ-012 | Energy observability SLOs for derivation null rate? | **OPEN** | Metrics exist; no formal SLO thresholds. | EED-EV-0020 | NO | LOW — observability gap | KG-EED / SRE |

## Deferred (reference only — do not expand in KG-EED)

| Topic | Classification | Notes |
|-------|----------------|-------|
| KG-ATE FM-007 (workers-disabled stuck PENDING) | **DEFERRED** | ATE runtime defect; not EED authority |
| KG-ATE multi-replica assumptions | **DEFERRED** | ATE open questions; EED inherits indirect cadence only |

## Summary

| Metric | Count |
|--------|------:|
| Total discovery questions | 12 |
| RESOLVED (policy or code) | 2 (OQ-002, OQ-006 partial) |
| OPEN | 7 |
| OUT_OF_SCOPE | 2 |
| DEFERRED (ATE cross-ref) | 2 (not counted in EED-OQ nodes) |

**OPEN_QUESTIONS_RESOLVED:** 2  
**OPEN_QUESTIONS_REMAINING:** 10 (7 OPEN + 2 OUT_OF_SCOPE tracked + 1 PARTIALLY_RESOLVED counted open for SLO/inventory)

Graph nodes EED-OQ-001 … EED-OQ-012 remain for traceability even when policy-resolved (OQ-002 documented in EED-DEC-009).
