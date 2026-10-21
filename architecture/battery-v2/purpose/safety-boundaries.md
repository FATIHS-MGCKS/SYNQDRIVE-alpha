# Battery V2 — Safety Boundaries

**Epistemic status:** CONFIRMED (from engineering rules + verified code patterns in bootstrap scope)

## Hard boundaries (agents must not cross without explicit user request)

| Boundary | Rationale |
|----------|-----------|
| No production data mutation | Tenant safety; auditability |
| No historical backfill / mass re-evaluation | Risk of corrupting canonical history |
| No auto-apply of unconfirmed OCR/extraction | Shared AI Upload architecture (adjacent) |
| No enabling `BATTERY_V2_PUBLICATION_ENABLED` / `READINESS` without explicit approval | Stage gating |
| No Stage 2 activation in Stage 1 workstreams | Product phase separation |
| No hardcoded org/vehicle/trip IDs | Multi-tenant isolation |

## Trip lifecycle isolation

Battery enqueue failures at trip finalization **must not** invalidate an already-persisted authoritative trip.

**Evidence:** `trip-detection-orchestration.service.ts` wraps `enqueueSessionOpenForFinalizedTrip` in try/catch with warn-only logging after COMPLETED trip + RESTING transition are persisted.

**Graph:** `BAT-V2-INV-TRIP-LIFECYCLE-ISO-001`

## Measurement integrity

REST evaluation **must not** manufacture numeric measurements when required telemetry evidence is absent. `MISSED` / missing evidence ≠ numeric zero.

**Graph:** `BAT-V2-POL-NO-FABRICATE-001`, `BAT-V2-INV-NO-FABRICATE-001`

## Tenant scoping

All persistence and reconciliation queries must remain organization/vehicle scoped. Trip binding repair verifies authoritative COMPLETED trip matches anchor before mutating `trip_id`.

**Evidence:** `battery-measurement-session.repository.ts` — `repairCanonicalTripBindingIfNeeded()`

## Reconciliation repair scope

Reconciliation may **arm missing sessions** and **reschedule stuck targets**; it must **not** run recurring historical trip-binding backfill scans (removed in #1445).

**Evidence:** `battery-v2-reconciliation.service.ts` — no `repairLvRestWindowTripBindings` in `reconcileAll()`
