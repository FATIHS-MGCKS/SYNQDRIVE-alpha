# KG-EED — Energy Event Detection Knowledge Graph

**Status:** CANONICAL  
**Workstream ID:** KG-EED  
**Canonicalized:** 2026-09-01 @ `da959784f`  
**Discovery source:** `architecture/knowledge-graphs/discovery/ENERGY_EVENT_DETECTION_DISCOVERY_2026-09-01.md`

## Purpose

This directory is the **repository-native knowledge authority** for Energy Event Detection (EED). It answers, for human and AI agents:

- How REFUEL and RECHARGE events are detected, parsed, coalesced, and persisted
- What `durationSeconds` means vs `fuelLevelRiseDurationSeconds` (REFUEL only)
- How sibling reconciliation and coalesce pruning work
- Who invokes detection (ATE MAY_TRIGGER; EED owns semantics)
- API and UI contracts for energy events on the trips timeline
- Historical decisions (KS MX 2024), evidence, and explicit open questions

**This is not a code refactor.** It documents the system as it exists on current `main`.

## Authority firewall (KG-ATE ↔ KG-EED)

| KG-ATE | KG-EED |
|--------|--------|
| MAY_TRIGGER `detectEnergyEvents` (reconciliation step 5) | OWNS REFUEL/RECHARGE detection semantics |
| Documents scheduler cadence indirectly | OWNS coalescing, persist gates, fuel-rise derivation |
| Must NOT own `durationSeconds` energy meaning | OWNS sibling reconciliation rules |
| References `ATE-EXT-006` only | OWNS API DTO and UI card semantics |

## Directory layout

```
energy-event-detection/
  GRAPH.yaml
  README.md
  graph/
    schema.yaml
    nodes.yaml
    edges.yaml
    invariants.yaml
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
2. Read `governance/AUTHORITY_BOUNDARIES.md` before any semantic change
3. Load `graph/nodes.yaml`, `graph/edges.yaml`, `graph/invariants.yaml`
4. Check `open-questions/OPEN_QUESTIONS.md` — do not promote INFERENCE to fact
5. After code changes affecting EED, update graph + evidence + changelog in same workstream
6. Run: `node architecture/knowledge-graphs/energy-event-detection/scripts/validate-graph.mjs`

## Discovery → canonical audit (Phase 2B)

| Metric | Discovery | Canonical |
|--------|----------:|----------:|
| Components (signals + pipeline + API + UI) | 52 | 58 operational nodes |
| Evidence nodes | 26 cited | 24 |
| Decisions | 14 | 12 canonical decision nodes |
| Invariants | — | 13 |
| Open questions | 12 | 12 (classified) |

See `history/CHANGELOG.md` for merge/reclassify accounting.

## Deferred topics (do not expand here)

- KG-ATE runtime defect **FM-007** — reference only if cross-graph dependency
- KG-ATE **multi-replica** open questions — intentionally deferred

## Cross-graph references

- **KG-ATE:** `architecture/knowledge-graphs/automatic-trip-enrichment/`
- **KG-Scaling-Process:** DIMO provider budget, scheduler leader
- **Battery V2:** orthogonal HV charge sessions
