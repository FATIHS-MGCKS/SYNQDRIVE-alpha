# Implementation Packages (Phase 4)

**Status:** PROPOSED — not implemented

| Package | Title | Readiness | Priority |
|---------|-------|-----------|----------|
| `BAT-V2-RUNTIME-PKG-01` | LV canonical assessment handoff | IMPLEMENTATION_READY | P0 |
| `BAT-V2-RUNTIME-PKG-02` | LV publication handoff + reconcile | IMPLEMENTATION_READY | P0 |
| `BAT-V2-RUNTIME-PKG-03` | Timestamp provenance model | DECISION_REQUIRED | P1 |
| `BAT-V2-RUNTIME-PKG-04` | HV SOH usable-candidate iteration | IMPLEMENTATION_READY | P2 |
| `BAT-V2-RUNTIME-PKG-05` | HEV product-policy alignment | DECISION_REQUIRED | P1 |
| `BAT-V2-RUNTIME-PKG-06` | Bridge fallback supersede/dedupe | RESEARCH_REQUIRED | P2 |
| `BAT-V2-RUNTIME-PKG-07` | Lock scope degrade policy | RESEARCH_REQUIRED | P2 |
| `BAT-V2-RUNTIME-PKG-08` | HV method eligibility cleanup | DEFERRED | P3 |
| `BAT-V2-VALIDATION-PKG-09` | Post-#1445 natural soak | PRODUCTION_VALIDATION_ONLY | P1 |

## PKG-01 — LV assessment handoff

| Field | Value |
|-------|-------|
| **Dependencies** | None hard; soft: timestamp PKG-03 before Stage 2 prod |
| **Modules** | `battery-rest-target-evaluate.handler`, producers, reconciliation |
| **DB migration** | Optional index for reconcile |
| **Feature flag** | `BATTERY_V2_LV_HANDOFF_ENABLED` (recommended) |
| **Rollback** | Disable flag |
| **Test scope** | Handler unit + integration |
| **Production validation** | Assessment row within 1h of REST on canary org |
| **Blocked by** | None |
| **Does not solve** | Publication, timestamp provenance, readiness |

## PKG-02 — LV publication handoff

| Field | Value |
|-------|-------|
| **Dependencies** | PKG-01 |
| **Modules** | `battery-assessment-recompute.handler`, publication producer, reconcile |
| **DB migration** | No |
| **Feature flag** | `BATTERY_V2_PUBLICATION_ENABLED` + handoff flag |
| **Rollback** | Disable publication flag |
| **Test scope** | E2E REST→pub |
| **Production validation** | `battery_publications` row on canary |
| **Blocked by** | PKG-01 |
| **Does not solve** | HV publication, readiness auto-enable |

## PKG-03 — Timestamp provenance

| Field | Value |
|-------|-------|
| **Dependencies** | Product decision on REST eligibility |
| **Modules** | Mapper, ingestion, REST eval, Prisma |
| **DB migration** | Yes — provenance enum |
| **Feature flag** | Strict mode flag |
| **Rollback** | Flag OFF preserves legacy accept |
| **Blocked by** | DECISION on provenance table |
| **Does not solve** | LV handoffs |

## PKG-04 — HV SOH iteration

| Field | Value |
|-------|-------|
| **Dependencies** | Independent |
| **Modules** | `canonical-battery-health.service.ts` |
| **DB migration** | No |
| **Feature flag** | Optional behavior flag |
| **Blocked by** | None |
| **Does not solve** | SOH gate shadow path, naming debt |

## PKG-05 — HEV authority

| Field | Value |
|-------|-------|
| **Dependencies** | Product workshop |
| **Modules** | Ingestion gates, policy materialization, possibly snapshot service |
| **Blocked by** | Fleet audit |
| **Does not solve** | PHEV paths |

## PKG-09 — Post-#1445 soak

| Field | Value |
|-------|-------|
| **Dependencies** | None |
| **Runtime change** | NO |
| **Blocked by** | Natural trip volume |
| **Does not solve** | Publication chain |
