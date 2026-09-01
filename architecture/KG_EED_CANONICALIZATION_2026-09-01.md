# KG-EED Phase 2B Canonicalization Report

**Date:** 2026-09-01  
**Workstream:** KG-EED — Energy Event Detection  
**Base SHA:** `da959784f835a31482852d506daa137c90389b87`  
**Validator:** `node architecture/knowledge-graphs/energy-event-detection/scripts/validate-graph.mjs` — **PASS**

## Objective

Establish the first repository-native canonical Knowledge Graph for Energy Event Detection at:

`architecture/knowledge-graphs/energy-event-detection/`

This phase is **documentation and governance only**. No runtime, production data, or KG-ATE modifications.

## Method

1. Read discovery inputs (`ENERGY_EVENT_DETECTION_DISCOVERY_2026-09-01.md`, `ATE_EED_BOUNDARY_MAP_2026-09-01.md`, schema proposal)
2. Independently verify claims against `main` source: energy-events service/pipeline, refuel-fuel-rise, sibling reconciliation, DIMO config, ATE step 5 trigger, API DTO, UI semantics, KS MX fixture
3. Encode graph nodes, edges, invariants, decisions, evidence, open questions
4. Mirror KG-ATE / Battery V2 governance pattern
5. Run graph validator including KG-ATE reciprocal boundary check (`ATE-EXT-006`)

## Discovery audit

| Metric | Discovery | Canonical | Notes |
|--------|----------:|----------:|-------|
| Components | 52 | 69 operational nodes | Expanded triggers, failure modes, external authorities |
| Evidence artifacts cited | 26 | 24 evidence nodes | Deduplicated; maturity classified |
| Decisions | 14 | 12 decision nodes | Future/proposed discovery decisions not promoted without code |
| Open questions | 12 | 12 nodes | Classified in OPEN_QUESTIONS.md |
| Invariants | — | 13 | EED-INV-001 … EED-INV-010 required + 3 code-proven |
| Edges | — | 78 | Happy path + failure + cross-graph |

## Authority firewall

- **KG-ATE** documents `MAY_TRIGGER detectEnergyEvents` only (`ATE-EXT-006` ↔ `EED-EXT-001`)
- **KG-EED** owns all REFUEL/RECHARGE semantics, coalescing, fuel-rise, sibling reconciliation, API/UI
- **Deferred (not expanded):** KG-ATE FM-007, multi-replica assumptions

## Key verified findings

| Topic | Verdict |
|-------|---------|
| minIncreasePercent | 5 (production refuel config) |
| REFUEL coalesce gap | 300 s + 250 m geo |
| RECHARGE coalesce gap | 1800 s |
| Persist gate REFUEL | fuelDeltaLiters > 1.0 |
| KS MX 4818 s envelope | DIMO upstream; not parser/coalesce expansion |
| KS MX fuel rise | ~280–330 s from telemetry derivation |
| KS MX stale sibling | 685 s reconciled by token-scoped guard |
| No backfill | Product policy — forward-correct only |
| Mechanism isolation | E1 — refuel/recharge fetch outcomes decoupled |

## Graph areas canonicalized

- [x] Invocation / trigger ownership
- [x] DIMO request path
- [x] REFUEL detection chain
- [x] REFUEL coalescing
- [x] Fuel-level-rise derivation
- [x] Sibling reconciliation
- [x] RECHARGE chain (separate from REFUEL)
- [x] Persistence (VehicleEnergyEvent)
- [x] API contract
- [x] UI semantics
- [x] Observability
- [x] Failure behavior

## Changes / Architektur

- **Changes:** Not updated (docs-only canonicalization; no runtime change)
- **Architektur:** This report + KG-EED graph serve as new architecture authority for EED

## Ready for review

- Phase 2B.1: `architecture/KG_EED_INDEPENDENT_AUTHORITY_REVIEW_2026-09-01.md`
- Phase 2B.2: `architecture/KG_EED_FINAL_AUTHORITY_CLOSURE_2026-09-01.md`

## Graph count stages (historical — do not rewrite)

| Stage | Operational | Evidence | Edges | Invariants | Decisions |
|-------|------------:|---------:|------:|-----------:|----------:|
| INITIAL_PHASE_2B | 69 | 24 | 78 | 13 | 12 |
| POST_PHASE_2B_1 | 72 | 25 | 81 | 13 | 12 |
| FINAL_PHASE_2B_2 | 72 | 25 | 81 | 13 | 12 |
