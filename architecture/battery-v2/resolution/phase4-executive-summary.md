# Phase 4 Executive Summary

**Date:** 2026-09-02 (D5 LV publication version authority)  
**Verdict:** Phase 4 planning complete — gaps remain open; PKG-01 **IMPLEMENTATION_READY** (D1/D2/D3); PKG-02 **IMPLEMENTATION_READY** (D4/D5 VALIDATED)

## Planning accounting

| Set | Count | P0 | P1 | P2 | P3 |
|-----|-------|----|----|----|-----|
| **Open gaps only** (`BAT-V2-GAP-*`) | 20 | 3 activation blockers | 3 | 5 | 9 |
| **All planning items** (+ 2 contra + 1 hyp) | 23 | 3 | 6 | 5 | 9 |

**P0_ACTIVATION_BLOCKER ≠ P0_ACTIVE_PRODUCTION_INCIDENT.** Canonical REST and publication flags default OFF — LV handoffs block Stage-2 cutover, not proven live-customer publication outages.

## DO NOW (highest leverage — documentation / validation only)

1. **PKG-09** — Execute post-#1445 natural soak (initial smoke tranche — not strong validation)
2. **Implementation authorization gate** — PKG-01 + PKG-02 **IMPLEMENTATION_READY** (D1–D5 VALIDATED); obtain **separate runtime implementation authorization** before coding. **Phase-4 documentation merge is not runtime authorization.**

## VALIDATE NOW (no runtime change)

1. Post-#1445 production soak (`BAT-V2-HYP-POST-1445-SOAK-001`) — liveness dimensions separate from measurement
2. Read-only prod query: RUNNING orphan rows
3. HEV fleet mix audit (capability + shadow activity)
4. **Do not** run provenance distribution SQL — schema cannot answer exactly today

## DECIDE NOW (product / architecture)

1. **HEV canonical model** — Option A direction (LV canonical; D1/D2/D3 layering) — DECISION_NOT_READY
2. **Timestamp provenance enum** — approve PKG-03 target model (measurement only; not session opening)
3. **Stage 2 cutover policy** — M4 single-authority cutover requires explicit authorization (D3); **not** authorized by documentation merge
4. **Provider VLS SOH gap** — **RECOMMENDED/PROPOSED:** retain current non-decision-fresh VLS-only semantics unless product authority requires decision-capable VLS SOH (separate spec) — **DECISION_REQUIRED**, pending sign-off; not PKG-04
5. **Canary scope** — deployment/environment isolation; org allowlist **SPEC REQUIRED** if desired

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
4. **“Enqueue every persistedAssessmentId”** as settled PKG-02 architecture
5. Signal-timestamp gate on primary trip-finalization REST opening
6. Current SQL provenance distribution claims
7. "10 trips = 95% reliability" statistical framing
8. 30m session-arm SLA (30m is REST target grace)
9. Invented threshold provenance (DOMAIN-HEURISTIC / CODE-CONVENIENCE without citation)
10. Bridge measurement rebinding / historical mutation
11. Reconciliation-only LV publication as sole solution
12. Status quo HEV side-effect without read alignment
13. Implementing GROSS_CAPACITY before reference model
14. Invented DB table names in soak protocol (`Trip`, `BatteryLvRestSession`)
15. **1–2-org canary** for process.env flags (no org-scoped flag authority)
16. **HANDOFF OFF = rollback complete** while PUBLICATION ON
17. **24h assessment/publication SLA** as PASS/FAIL threshold (observation window only)
18. Assessment/publication **row existence** as sole handoff success criterion
19. Provider LatestState SOH gap as **IMPLEMENTATION_READY** / future PKG-04 work (current runtime already non-decision-fresh)
20. Mandatory HEV in post-#1445 smoke when no HEV exposure exists
21. **`BATTERY_V2_LV_HANDOFF_ENABLED`** as steady-state gate (D3 rejected)
22. Permanent **REST_SHADOW** as final architecture gate (D3 — temporary scaffold only)

## Top 5 next actions

1. Authorize PKG-01 + PKG-02 runtime implementation (specs complete: D1–D5)
2. Obtain **separate runtime implementation authorization** for PKG-01 + PKG-02 (Phase-4 merge alone does not authorize)
3. Run PKG-09 initial smoke tranche (≥10 trips / 14 days — not strong validation; profile-stratified)
4. Product decision on HEV Option A layering (DECISION_NOT_READY)
5. Approve timestamp provenance schema (PKG-03) before Stage-2 prod if strict policy selected
