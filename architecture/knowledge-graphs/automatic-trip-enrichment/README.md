# KG-ATE — Automatic Trip Enrichment Knowledge Graph

**Status:** CANONICAL  
**Workstream ID:** KG-ATE  
**Canonicalized:** 2026-09-01 @ `4843a4ebc`  
**Discovery source:** `architecture/knowledge-graphs/discovery/AUTOMATIC_TRIP_ENRICHMENT_DISCOVERY_2026-09-01.md`

## Purpose

This directory is the **repository-native knowledge authority** for Automatic Trip Enrichment (ATE). It answers, for human and AI agents:

- What ATE is and why it exists
- Where enrichment starts and how it is triggered automatically
- How jobs, concurrency, idempotency, retries, and provider budgeting interact
- How hardware-specific paths, route enrichment, misuse analysis, and driving-impact chaining work
- How reconciliation, repair, fallback, and manual paths relate to the automatic architecture
- Which decisions were made, with evidence and explicit open questions

**This is not a static architecture essay.** It is an open, maintainable graph (`graph/*.yaml`) with governance, evidence registry, and validation.

## Scope boundary

| KG-ATE owns | External authority (reference only) |
|-------------|-------------------------------------|
| Post-finalize behavior enrichment orchestration | REFUEL/RECHARGE semantics → **KG-EED** |
| Route/safety enrichment stage in ATE pipeline | DI V2 scoring models → **KG-Driving-Intelligence** |
| Reconciliation → repair → enrichment chain | Scheduler leader algorithm → **KG-Scaling-Process** |
| Hardware routing (SMART5 HF / LTE_R1 native) | DIMO budget internals → **KG-Scaling-Process** |
| `behaviorEnrichmentStatus` state machine | Battery HV sessions → **Battery V2** |

## Directory layout

```
automatic-trip-enrichment/
  GRAPH.yaml              # Machine-readable workstream manifest
  README.md               # This file
  graph/
    schema.yaml           # Node/edge/invariant schema
    nodes.yaml            # Canonical nodes (stable ATE-* IDs)
    edges.yaml            # Execution + authority edges
    invariants.yaml       # Must-not-break rules
  decisions/DECISIONS.md
  evidence/EVIDENCE_REGISTRY.md
  open-questions/OPEN_QUESTIONS.md
  history/CHANGELOG.md
  governance/
    AGENT_PROTOCOL.md
    AUTHORITY_BOUNDARIES.md
  scripts/validate-graph.mjs
```

## Quick start for agents

1. Read `GRAPH.yaml` and `governance/AGENT_PROTOCOL.md`
2. Load `graph/nodes.yaml`, `graph/edges.yaml`, `graph/invariants.yaml`
3. Check `open-questions/OPEN_QUESTIONS.md` before assuming facts
4. After code changes affecting ATE, update graph + evidence + changelog
5. Run: `node architecture/knowledge-graphs/automatic-trip-enrichment/scripts/validate-graph.mjs`

## Discovery → canonical audit (Phase M)

| Metric | Count |
|--------|------:|
| Discovery components | 48 |
| Canonical graph nodes (non-evidence) | 52 |
| Evidence nodes | 34 |
| Decisions | 12 |
| Invariants | 9 |
| Open questions (remaining) | 6 |
| Open questions resolved | 6 |

See `history/CHANGELOG.md` for merge/reclassify/drop accounting.

## Cross-graph contract (EED)

ATE **MAY_TRIGGER** `detectEnergyEvents` from reconciliation step 5.  
KG-EED **OWNS** energy-event detection and all REFUEL/RECHARGE semantics.

Do **not** canonicalize EED in this directory.
