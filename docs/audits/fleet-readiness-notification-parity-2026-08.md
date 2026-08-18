# Fleet Readiness ↔ Notification V2 Parity Audit

**Date:** 2026-08-18  
**Scope:** Phase 1.1 — canonical `attentionScope` routing foundation + producer/lifecycle parity audit  
**Code baseline:** `main` + `cursor/notification-attention-scope-dcd7`

---

## 1. Executive Summary

### Dashboard split readiness: **YELLOW** (NOT READY FOR PHASE 2 UI cutover)

| Question | Rating | Rationale |
|----------|--------|-----------|
| Can vehicle messages be losslessly extracted from the general Operations notification box today? | **YELLOW** | Registry routing (`attentionScope`) is now complete and test-backed, but **producer parity and lifecycle coverage gaps** remain. Several rental-blocking health states have no live V2 producer; aggregate readiness events (`BLOCKED_VEHICLE`, `VEHICLE_NOT_READY`) are registered but unwired. |

**Verdict:** **NOT READY FOR PHASE 2** (dashboard UI split). Routing metadata is ready; notification materialization is not yet lossless for fleet readiness.

---

## 2. Canonical Architecture

```
Vehicle telemetry / health domains / operational state
                    │
                    ▼
        Canonical Rental / Vehicle Health  (rental-health/*)
                    │
                    ▼
          Notification Engine V2           (notification-core, registry, persistence)
                    │
          Registry + Fingerprint
          Lifecycle + Persistence
                    │
             attentionScope
              /           \
             /             \
    OPERATIONS        FLEET_READINESS   ← routing projection only (P1.1)
```

| Layer | Role | Source of truth |
|-------|------|-----------------|
| Rental Health | Vehicle module states, `rental_blocked`, `blocking_reasons`, `rental_readiness` | `RentalHealthService.getVehicleHealth()` |
| Notification Engine V2 | Persistent notification lifecycle (OPEN/RESOLVE/REOPEN) | `NotificationCoreService` + Prisma |
| Event Registry `attentionScope` | Dashboard attention routing classification | `notification-event-registry.*` |
| Dashboard UI | Projection only — **no cutover in P1.1** | Frontend Action Queue (unchanged) |

**Rules enforced in P1.1:**
- No new notification table / alert persistence
- No fingerprint / domain / sourceType / lifecycle semantic changes
- `attentionScope` is **not** stored in DB or fingerprints

---

## 3. Attention Scope Matrix

**Total registered event types:** 65  
**FLEET_READINESS:** 23  
**OPERATIONS:** 42

Full matrix is derived from code (`NOTIFICATION_EVENT_TYPE_DEFINITIONS` + `LEGAL_DOCUMENT_NOTIFICATION_EVENT_DEFINITIONS`). Lookup API:

- `getNotificationEventTypesByAttentionScope(scope)`
- `getNotificationDefinitionsByAttentionScope(scope)`
- `getNotificationAttentionScope(eventType)`

### FLEET_READINESS (23)

| eventType | domain | entityType | producerModule | attentionScope | rationale |
|-----------|--------|------------|----------------|----------------|-----------|
| BLOCKED_VEHICLE | OPERATIONS | VEHICLE | operations | FLEET_READINESS | Aggregate rental-blocking state |
| VEHICLE_NOT_READY | OPERATIONS | VEHICLE | operations | FLEET_READINESS | Aggregate readiness-not-ready state |
| MAINTENANCE_REQUIRED | OPERATIONS | VEHICLE | operations | FLEET_READINESS | Maintenance blocks deployment readiness |
| ACTIVE_DTC | VEHICLE_HEALTH | VEHICLE | vehicle-intelligence | FLEET_READINESS | Active fault code on vehicle |
| BATTERY_CRITICAL | VEHICLE_HEALTH | VEHICLE | business-insights | FLEET_READINESS | Battery health blocks/warns readiness |
| TIRE_CRITICAL | VEHICLE_HEALTH | VEHICLE | business-insights | FLEET_READINESS | Tire safety/readiness |
| BRAKE_CRITICAL | VEHICLE_HEALTH | VEHICLE | business-insights | FLEET_READINESS | Brake safety/readiness |
| COMPLIANCE_EXPIRED | VEHICLE_HEALTH | VEHICLE | business-insights | FLEET_READINESS | Regulatory compliance expired |
| SERVICE_OVERDUE | VEHICLE_HEALTH | VEHICLE | business-insights | FLEET_READINESS | Service overdue affects readiness |
| SERVICE_WINDOW | VEHICLE_HEALTH | VEHICLE | business-insights | FLEET_READINESS | Upcoming service window on vehicle |
| TUV_OVERDUE | VEHICLE_HEALTH | VEHICLE | business-insights | FLEET_READINESS | TÜV overdue blocks rental |
| BOKRAFT_OVERDUE | VEHICLE_HEALTH | VEHICLE | business-insights | FLEET_READINESS | BOKraft overdue blocks rental |
| HM_SERVICE_NO_TRACKING | VEHICLE_HEALTH | VEHICLE | business-insights | FLEET_READINESS | HM service tracking gap affects evaluability |
| TECHNICAL_OBSERVATION_ACTIVE | VEHICLE_HEALTH | VEHICLE | vehicle-complaints | FLEET_READINESS | Active technical observation |
| TELEMETRY_OFFLINE | SYSTEM | VEHICLE | dimo | FLEET_READINESS | Vehicle telemetry offline — cannot evaluate state |
| TELEMETRY_SOFT_OFFLINE | SYSTEM | VEHICLE | dimo | FLEET_READINESS | Degraded telemetry — evaluability at risk |
| DEVICE_UNPLUGGED | SYSTEM | VEHICLE | dimo | FLEET_READINESS | Device unplugged — data gap |
| DEVICE_RECONNECTED | SYSTEM | VEHICLE | dimo | FLEET_READINESS | Vehicle connectivity recovery (evaluability restored) |
| AUTHORIZATION_REQUIRED | SECURITY | VEHICLE | dimo | FLEET_READINESS | Per-vehicle auth required for data access |
| DATA_SOURCE_DISCONNECTED | SYSTEM | VEHICLE | dimo | FLEET_READINESS | Vehicle data source disconnected |
| DATA_COVERAGE_INSUFFICIENT | SYSTEM | VEHICLE | dimo | FLEET_READINESS | Insufficient signal coverage for evaluation |
| DEVICE_BINDING_CHANGED | SYSTEM | VEHICLE | dimo | FLEET_READINESS | Device binding change on vehicle |
| CONNECTIVITY_STATE_UNKNOWN | SYSTEM | VEHICLE | dimo | FLEET_READINESS | Connectivity unevaluable for vehicle |

### OPERATIONS (42) — summary by category

| Category | eventTypes |
|----------|------------|
| Station / fleet ops | STATION_SHORTAGE, LOW_UTILIZATION |
| Handovers / bookings | PICKUP_OVERDUE, RETURN_OVERDUE, TIGHT_HANDOVER, RETURN_NEEDS_INSPECTION, SERVICE_BEFORE_BOOKING, BOOKING_CREATED, BOOKING_UPDATED, PICKUP_DUE, RETURN_DUE, HANDOVER_INCOMPLETE |
| Driving analysis | DRIVING_ASSESSMENT_DEVICE_QUALITY, TRIP_ANALYSIS_COMPLETED, MISUSE_DETECTED, POSSIBLE_IMPACT, DATA_QUALITY_LIMITED |
| Documents | REQUIRED_DOCUMENT_MISSING, LEGAL_* (19 types) |
| Billing | PAYMENT_FAILED, INVOICE_OVERDUE, DEPOSIT_PROBLEM |
| Org-wide system | INTEGRATION_DISCONNECTED, WEBHOOK_FAILURE |

**Explicit boundary cases (verified in tests):**
- `VEHICLE_NOT_READY` / `BLOCKED_VEHICLE` → FLEET_READINESS despite `domain: OPERATIONS`
- `LOW_UTILIZATION` / `SERVICE_BEFORE_BOOKING` → OPERATIONS despite `entityType: VEHICLE`
- `INTEGRATION_DISCONNECTED` → OPERATIONS (org-wide integration failure)

---

## 4. Vehicle Health → Notification Parity Matrix

| Health source | Health state / cause | Readiness / block impact | Expected eventType | Current producer | V2 wired? | Resolve wired? | Gap? | Risk |
|---------------|---------------------|--------------------------|-------------------|------------------|-----------|----------------|------|------|
| **battery** | critical (block-worthy readiness) | `rental_blocked` | BATTERY_CRITICAL | `projectVehicleHealthWarnings` + BI sweep | **Yes** (full) | Sweep + grace | Partial | Parallel `BatteryCriticalDetector` path may diverge from readiness policy |
| **battery** | warning (non-block) | none | BATTERY_CRITICAL | same | Yes | Yes | Low | May over-notify vs block |
| **battery** | unknown / unavailable | `rental_blocked=null` | — | — | No | — | **Yes** | Unevaluable battery → no notification |
| **tires** | critical (hard block) | blocks rental | TIRE_CRITICAL | projector + open `tireHealthAlert` + BI sweep | **Yes** | Sweep | Partial | Hard block without open alert row may lack notification |
| **tires** | REVIEW_REQUIRED / MEASUREMENT_REQUIRED | no block | — | — | No | — | **Yes** | Ops gap without alert |
| **brakes** | critical (hard block) | blocks rental | BRAKE_CRITICAL | projector + open `brakeHealthAlert` + BI sweep | **Yes** | Sweep | Partial | Safety DTC review state — no dedicated notification |
| **brakes** | DATA_NO_BASELINE | no block | — | — | No | — | **Yes** | Measurement gap silent |
| **error_codes** | active DTC (per code) | blocks if safety-critical band | ACTIVE_DTC | `DimoDtcProcessor` + BI sweep | **Yes** | Per-code resolve | No | Module-level `unknown` has no notification |
| **error_codes** | stale/unavailable poll | `rental_blocked=null` | — | — | No | — | **Yes** | Pipeline failure silent |
| **service_compliance** | TÜV/BOKraft overdue | blocks rental | TUV_OVERDUE / BOKRAFT_OVERDUE | DashboardInsight only | **No live ingest** | Legacy only | **Yes (P0)** | Blocks rental without guaranteed V2 notification |
| **service_compliance** | HM service critical | blocks rental | SERVICE_OVERDUE | DashboardInsight only | **No live ingest** | Legacy only | **Yes (P0)** | Same |
| **service_compliance** | service warning window | no block | SERVICE_WINDOW | DashboardInsight only | No | — | Medium | Informational gap |
| **service_compliance** | HM no tracking | evaluability | HM_SERVICE_NO_TRACKING | resolve-only in V2 | **Resolve only** | Yes | **Yes** | Never ingested open in V2 |
| **complaints** | blocksRental=true | blocks rental | TECHNICAL_OBSERVATION_ACTIVE | `TechnicalObservationsService` | Shadow only | Yes | **Yes (P1)** | Shadow gate limits production visibility |
| **complaints** | critical urgency, no block | no block | TECHNICAL_OBSERVATION_ACTIVE | shadow | Shadow | Yes | Medium | Semantic split |
| **vehicle_alerts** | limp mode | blocks rental | — (none registered) | — | No | — | **Yes (P0)** | Blocks rental, zero notification type |
| **vehicle_alerts** | oil minimum | blocks rental | — (none registered) | — | No | — | **Yes (P0)** | Same |
| **vehicle_alerts** | oil high warning | no block | — | — | No | — | Low | |
| **overall_state** | warning/critical transition | indirect | vehicle.health.* workflow | `VehicleHealthWorkflowEmitter` | Workflow only | N/A | **Yes** | Not a V2 notification |
| **rental_blocked** | true (any cause) | aggregate | BLOCKED_VEHICLE / VEHICLE_NOT_READY | — | **Unwired** | — | **Yes (P0)** | Aggregate readiness not materialized |
| **availability** | partial/unavailable | `rental_readiness=unevaluable` | CONNECTIVITY_STATE_UNKNOWN? | partial (connectivity only) | Partial | Partial | **Yes** | Health pipeline failure under-notified |
| **vehicle_damage** | OPEN + BLOCK_RENTAL | blocks rental | — | — | No | — | **Yes** | Outside health modules |

---

## 5. Duplicate / Aggregation Analysis

Multiple notifications for the same vehicle are **intentional** — different fingerprints, different semantics. Do **not** deduplicate.

| Pattern | Cause notification(s) | Aggregate notification(s) | UI treatment (future) |
|---------|----------------------|---------------------------|----------------------|
| Tire issue + not ready | `TIRE_CRITICAL` | `VEHICLE_NOT_READY`, `BLOCKED_VEHICLE` | Child cause vs parent readiness status |
| Service overdue + maintenance | `SERVICE_OVERDUE`, `TUV_OVERDUE` | `MAINTENANCE_REQUIRED`, `VEHICLE_NOT_READY` | Compliance cause vs ops aggregate |
| DTC + blocked | `ACTIVE_DTC:{code}` | `BLOCKED_VEHICLE` | Per-code fault vs rental gate |
| Battery + not ready | `BATTERY_CRITICAL` | `VEHICLE_NOT_READY` | Module cause vs aggregate |
| Technical observation + blocked | `TECHNICAL_OBSERVATION_ACTIVE:{id}` | `BLOCKED_VEHICLE` | Observation vs gate |
| Connectivity + unevaluable | `TELEMETRY_OFFLINE`, `DATA_COVERAGE_INSUFFICIENT` | `rental_readiness=unevaluable` (health only today) | Data gap vs readiness null state |

**Rule:** Cause notifications retain specific `conditionCode` variants; aggregates use stable single fingerprints per vehicle.

---

## 6. Producer Gaps

| Priority | Gap | Detail |
|----------|-----|--------|
| **P0** | Compliance notifications not live-ingested | `SERVICE_OVERDUE`, `TUV_OVERDUE`, `BOKRAFT_OVERDUE` — DashboardInsight only; BI sync does not call ingest for these |
| **P0** | `vehicle_alerts` (limp/oil) | Blocks rental in health; no registry event or producer |
| **P0** | `BLOCKED_VEHICLE` / `VEHICLE_NOT_READY` | Registered, no producer wired to `rental_blocked` transitions |
| **P1** | `TECHNICAL_OBSERVATION_ACTIVE` | Shadow-only (`shadowModeEnabled: true`) |
| **P1** | `STATION_SHORTAGE` | Shadow-only (correctly OPERATIONS) |
| **P1** | `DRIVING_ASSESSMENT_DEVICE_QUALITY` | Shadow-only (correctly OPERATIONS) |
| **P1** | Most BI insight types | `TIGHT_HANDOVER`, `RETURN_NEEDS_INSPECTION`, `PICKUP_OVERDUE`, `SERVICE_BEFORE_BOOKING`, etc. — registry only |
| **P1** | Driving analysis types | `MISUSE_DETECTED`, `POSSIBLE_IMPACT`, `TRIP_ANALYSIS_COMPLETED`, `DATA_QUALITY_LIMITED` — registry only |
| **P2** | `HM_SERVICE_NO_TRACKING` | Resolve-only path; never opens in V2 |
| **P2** | `insight-candidate.mapper` | `SERVICE_OVERDUE` conditionCode mismatch (`overdue` vs `service_overdue`) — backfill fingerprint risk |
| **P2** | `VehicleHealthWorkflowEmitter` | Parallel workflow path, not V2 |

**Live V2 producers today (fleet-relevant):**
- `VehicleHealthNotificationAdapter` — ACTIVE_DTC, BATTERY_CRITICAL, TIRE_CRITICAL, BRAKE_CRITICAL (full)
- `ConnectivityAlertService` — 9 vehicle connectivity types (full)
- `TechnicalObservationNotificationAdapter` — TECHNICAL_OBSERVATION_ACTIVE (shadow)

---

## 7. Lifecycle Gaps

| Scenario | Risk | Detail |
|----------|------|--------|
| Health recovers, notification stale | Medium | Fleet sweep + 6h grace on health notifications; realtime ingest without sweep may leave stale OPEN |
| `rental_blocked` clears | High | No aggregate producer → no auto-resolve for BLOCKED_VEHICLE/VEHICLE_NOT_READY |
| Compliance resolved | High | No live V2 ingest → legacy insight may clear while V2 notification absent or stale |
| Shadow producers | Medium | TECHNICAL_OBSERVATION_ACTIVE may not appear in production inbox depending on flags |
| HM_SERVICE_NO_TRACKING | Low | Active resolve without corresponding open notification |
| Unevaluable health (`rental_blocked=null`) | High | Partial connectivity coverage; no generic "health pipeline unavailable" notification |
| Per-observation resolve | OK | `TECHNICAL_OBSERVATION_ACTIVE:{id}` SUCCESS ingest on resolve/dismiss |

---

## 8. Data Availability / Unevaluable

| State | Health behavior | Notification today |
|-------|----------------|-------------------|
| `availability: partial` | `rental_blocked=null`, `rental_readiness=unevaluable` | No generic notification; bookings gate fails-safe to blocked |
| `availability: unavailable` | All modules stubbed unknown | `PIPELINE_UNAVAILABLE` degradation — no notification |
| Module `unknown` (DTC stale) | May not block | No ACTIVE_DTC, no pipeline-degraded notification |
| `CONNECTIVITY_STATE_UNKNOWN` | Vehicle connectivity unevaluable | V2 producer exists (full) when runtime projects it |
| `rental_readiness: unevaluable` | Canonical health field | **Not mirrored** as notification — gap for dashboard split |

---

## 9. Recommended Phase 2 Plan

### P0 — Correctness (before UI split)

1. Wire compliance producers: `TUV_OVERDUE`, `BOKRAFT_OVERDUE`, `SERVICE_OVERDUE` from `service_compliance` module state (not DashboardInsight-only).
2. Register + produce notifications for `vehicle_alerts` (limp mode, oil minimum) OR map to existing types with explicit condition codes.
3. Wire `BLOCKED_VEHICLE` / `VEHICLE_NOT_READY` producers from `rental_blocked` / `rental_readiness` transitions (aggregate only — do not replace cause notifications).
4. Add pipeline-degraded notification path for `availability !== ready` (or ensure connectivity types cover all cases).
5. Fix `insight-candidate.mapper` `SERVICE_OVERDUE` conditionCode mismatch.

### P1 — Producer parity

1. Promote `TECHNICAL_OBSERVATION_ACTIVE` from shadow to full production.
2. Ingest remaining BI fleet-relevant insights with live producers (SERVICE_WINDOW, HM_SERVICE_NO_TRACKING open path).
3. Ensure tire/brake hard-block states always emit even without persisted alert rows.
4. Align `BatteryCriticalDetector` with `battery-readiness.policy` block-worthy semantics.

### P2 — Cleanup

1. Migrate remaining BI-only insights to V2 producers (handovers, bookings).
2. Deprecate DashboardInsight parallel path for types with live V2 producers.
3. Document parent/child grouping contract for Fleet Readiness UI (no dedup).

**No UI work in P0/P1** — producers and lifecycle first.

---

## 10. Acceptance Gate for Dashboard Split

All must be machine/test verifiable before splitting Operations + Fleet Readiness UI:

| # | Gate | Verification |
|---|------|--------------|
| 1 | Every `FLEET_READINESS` event type with rental-blocking semantics has a live (non-shadow) V2 producer | Integration test per event type |
| 2 | `rental_blocked: true` emits `BLOCKED_VEHICLE` or `VEHICLE_NOT_READY`; clears resolve them | E2E health → notification test |
| 3 | All `service_compliance` blockers emit TUV/BOKraft/SERVICE notifications | Parity test vs `blocking_reasons` |
| 4 | `vehicle_alerts` blockers emit notifications | New producer tests |
| 5 | `attentionScope` lookup drives API filter — no hardcoded event lists in controller/frontend | Lint/grep gate |
| 6 | No OPEN fleet notification remains > grace period after canonical health recovery | Lifecycle integration tests |
| 7 | Cause + aggregate notifications coexist with distinct fingerprints | Registry fingerprint tests |
| 8 | Unevaluable health states emit connectivity or pipeline notifications | Coverage test matrix |
| 9 | Shadow-only fleet types = 0 | `listShadowModeEventTypes()` ∩ FLEET_READINESS = ∅ |
| 10 | Full registry attention partition test passes | `notification-event-registry.spec.ts` |

---

## Appendix: Producer Module Reference

| Module | Fleet-relevant events | Status |
|--------|----------------------|--------|
| `business-insights` | BATTERY/TIRE/BRAKE_CRITICAL, compliance types, SERVICE_WINDOW | Partial (health only live) |
| `vehicle-intelligence` | ACTIVE_DTC | Live (DTC processor) |
| `vehicle-complaints` | TECHNICAL_OBSERVATION_ACTIVE | Shadow |
| `dimo` | Connectivity types | Live |
| `operations` | BLOCKED_VEHICLE, VEHICLE_NOT_READY, MAINTENANCE_REQUIRED | Unwired |
| `rental-health` | Workflow events only | Not V2 |
