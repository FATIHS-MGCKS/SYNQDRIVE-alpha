# Phase 4 Executive Summary

**Date:** 2026-09-01 (correction pass)  
**Verdict:** Phase 4 planning complete — gaps remain open; PKG-01/02 downgraded to IMPLEMENTATION_SPEC_REQUIRED

## Planning accounting

| Set | Count | P0 | P1 | P2 | P3 |
|-----|-------|----|----|----|-----|
| **Open gaps only** (`BAT-V2-GAP-*`) | 20 | 3 activation blockers | 3 | 5 | 9 |
| **All planning items** (+ 2 contra + 1 hyp) | 23 | 3 | 6 | 5 | 9 |

**P0_ACTIVATION_BLOCKER ≠ P0_ACTIVE_PRODUCTION_INCIDENT.** Canonical REST and publication flags default OFF — LV handoffs block Stage-2 cutover, not proven live-customer publication outages.

## DO NOW (highest leverage — after spec sign-off)

1. **PKG-01 + PKG-02** — Resolve `inputVersion` + `publicationVersion` specs, then implement LV handoffs (P0 activation blockers)
2. **PKG-09** — Execute post-#1445 natural soak (initial smoke tranche — not strong validation)

## VALIDATE NOW (no runtime change)

1. Post-#1445 production soak (`BAT-V2-HYP-POST-1445-SOAK-001`) — liveness dimensions separate from measurement
2. Read-only prod query: RUNNING orphan rows
3. HEV fleet mix audit (capability + shadow activity)
4. **Do not** run provenance distribution SQL — schema cannot answer exactly today

## DECIDE NOW (product / architecture)

1. **HEV canonical model** — Option A direction (LV canonical; D1/D2/D3 layering) — DECISION_NOT_READY
2. **Timestamp provenance enum** — approve PKG-03 target model (measurement only; not session opening)
3. **Stage 2 cutover policy** — when to enable handoff flags
4. **PKG-01 inputVersion** — measurement.id vs observedAt vs composite
5. **PKG-02 publicationVersion** — authoritative source for canonical handoff

## DEFER

1. SESSION_CHARGE / GROSS_CAPACITY compute (P3)
2. SKIPPED enum lifecycle (P3)
3. `providerSoh` DTO rename (API vNext)
4. Master/operator canonical panels (P3)
5. `hvPipelineAllowed` remove/wire (DECISION_REQUIRED — PKG-05)

## ACCEPT RISK (monitor)

1. RUNNING orphan hypothesis until prod query
2. Redis lock fail-open per scope (RESEARCH_REQUIRED — no "fail-open OK" claim)

## REJECT / REMOVE

1. `lv-assess:` job identity — use `assess:` builder
2. `battery-v2-lv-assessment.producer.ts` — file does not exist
3. Publication enqueue gated on `publicationEligible` in assessment handler
4. Signal-timestamp gate on primary trip-finalization REST opening
5. Current SQL provenance distribution claims
6. "10 trips = 95% reliability" statistical framing
7. 30m session-arm SLA (30m is REST target grace)
8. Invented threshold provenance (DOMAIN-HEURISTIC / CODE-CONVENIENCE without citation)
9. Bridge measurement rebinding / historical mutation
10. Reconciliation-only LV publication as sole solution
11. Status quo HEV side-effect without read alignment
12. Implementing GROSS_CAPACITY before reference model

## Top 5 next actions

1. Sign off PKG-01 `inputVersion` + PKG-02 `publicationVersion` specs
2. Implement PKG-01 + PKG-02 behind feature flags
3. Run PKG-09 initial smoke tranche (≥10 trips / 14 days — not strong validation)
4. Product decision on HEV Option A layering (DECISION_NOT_READY)
5. Approve timestamp provenance schema (PKG-03) before Stage-2 prod if strict policy selected
