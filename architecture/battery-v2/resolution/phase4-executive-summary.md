# Phase 4 Executive Summary

**Date:** 2026-09-01  
**Verdict:** Phase 4 planning complete — gaps remain open; runtime work is packaged but not executed

## DO NOW (implementation-ready, highest leverage)

1. **PKG-01 + PKG-02** — LV canonical assessment + publication handoffs (P0)
2. **PKG-09** — Execute post-#1445 natural soak protocol (no code)

## VALIDATE NOW (no runtime change)

1. Post-#1445 production soak (`BAT-V2-HYP-POST-1445-SOAK-001`)
2. Read-only prod query: timestamp fallback frequency (when authorized)
3. Read-only prod query: RUNNING orphan rows
4. HEV fleet mix audit (capability + shadow activity)

## DECIDE NOW (product / architecture)

1. **HEV canonical model** — recommend Option A (LV-only) pending fleet audit
2. **Timestamp provenance enum** — approve PKG-03 target model
3. **Stage 2 cutover policy** — when to enable handoff flags

## DEFER

1. SESSION_CHARGE / GROSS_CAPACITY compute (P3)
2. SKIPPED enum lifecycle (P3)
3. `providerSoh` DTO rename (API vNext)
4. Master/operator canonical panels (P3)

## ACCEPT RISK (monitor)

1. RUNNING orphan hypothesis until prod query
2. Ingest/assess lock fail-open (until PKG-07 research)

## REJECT / REMOVE

1. Reconciliation-only LV publication path as sole solution
2. Status quo HEV side-effect without read alignment
3. Implementing GROSS_CAPACITY before reference model

## Top 5 next actions

1. Implement PKG-01 (assessment handoff) behind feature flag
2. Implement PKG-02 (publication handoff) behind flag — depends on #1
3. Run PKG-09 natural soak on ≥10 trips / 14 days
4. Product decision on HEV Option A vs B
5. Approve timestamp provenance schema (PKG-03) before Stage 2 prod
