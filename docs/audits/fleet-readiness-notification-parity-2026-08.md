# Fleet Readiness ↔ Notification V2 Parity Audit

**Date:** 2026-08-19 (P2.4 evaluability aggregate + NO_ASSERTION hardening)  
**Scope:** P1.1 attentionScope foundation; **P2.1** service/compliance V2; **P2.2A/B** vehicle_alerts canonical + V2; **P2.3** fleet readiness aggregate (`VEHICLE_NOT_READY`); **P2.4** evaluability aggregate (`VEHICLE_READINESS_UNEVALUABLE`)  
**Code baseline:** `main` (#1070) + P2.4 PR [#1071](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/1071) (`cursor/vehicle-readiness-unevaluable-p24-dcd7`)

---

## 1. Executive Summary

### Dashboard split readiness: **YELLOW** (NOT READY FOR PHASE 2 UI cutover)

| Question | Rating | Rationale |
|----------|--------|-----------|
| Can vehicle messages be losslessly extracted from the general Operations notification box today? | **YELLOW** | **P2.1–P2.4** close compliance, vehicle_alerts, aggregate readiness (`VEHICLE_NOT_READY`), and evaluability aggregate (`VEHICLE_READINESS_UNEVALUABLE`). Remaining gaps: shadow producers, pipeline-degraded notifications (module-level), dashboard UI split. |

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
| Event Registry `attentionScope` | Attention routing classification (UI-neutral) | `notification-event-registry.*` |
| UI surfaces (dashboard, mobile, inbox, agents) | Projection only — **no cutover in P1.1** | Frontend Action Queue (unchanged) |

**Rules enforced in P1.1:**
- No new notification table / alert persistence
- No fingerprint / domain / sourceType / lifecycle semantic changes
- `attentionScope` is **not** stored in DB or fingerprints

---

## 3. Attention Scope Matrix

**Total registered event types:** 70  
**FLEET_READINESS:** 27  
**OPERATIONS:** 43

Lookup API: `getNotificationEventTypesByAttentionScope(scope)`, `getNotificationDefinitionsByAttentionScope(scope)`, `getNotificationAttentionScope(eventType)`.

| eventType | domain | entityType | producerModule | attentionScope | rationale |
|-----------|--------|------------|----------------|----------------|-----------|
| ACTIVE_DTC | VEHICLE_HEALTH | VEHICLE | vehicle-intelligence | FLEET_READINESS | Active fault code on vehicle |
| AUTHORIZATION_REQUIRED | SECURITY | VEHICLE | dimo | FLEET_READINESS | Per-vehicle authorization required for data access |
| BATTERY_CRITICAL | VEHICLE_HEALTH | VEHICLE | business-insights | FLEET_READINESS | Battery health affects vehicle readiness |
| BLOCKED_VEHICLE | OPERATIONS | VEHICLE | operations | FLEET_READINESS | **Legacy only** — no live producer (P2.3) |
| BOKRAFT_OVERDUE | VEHICLE_HEALTH | VEHICLE | vehicle-intelligence | FLEET_READINESS | BOKraft overdue blocks rental |
| BOOKING_CREATED | BOOKINGS | BOOKING | bookings | OPERATIONS | Booking workflow event |
| BOOKING_UPDATED | BOOKINGS | BOOKING | bookings | OPERATIONS | Booking workflow event |
| BRAKE_CRITICAL | VEHICLE_HEALTH | VEHICLE | business-insights | FLEET_READINESS | Brake safety/readiness |
| COMPLIANCE_EXPIRED | VEHICLE_HEALTH | VEHICLE | business-insights | FLEET_READINESS | Regulatory compliance expired on vehicle |
| CONNECTIVITY_STATE_UNKNOWN | SYSTEM | VEHICLE | dimo | FLEET_READINESS | Vehicle connectivity unevaluable |
| DATA_COVERAGE_INSUFFICIENT | SYSTEM | VEHICLE | dimo | FLEET_READINESS | Insufficient signal coverage for vehicle evaluation |
| DATA_QUALITY_LIMITED | DRIVING_ANALYSIS | VEHICLE | vehicle-intelligence | OPERATIONS | Driving analysis data quality info |
| DATA_SOURCE_DISCONNECTED | SYSTEM | VEHICLE | dimo | FLEET_READINESS | Vehicle data source disconnected |
| DEPOSIT_PROBLEM | BILLING | BOOKING | billing | OPERATIONS | Billing deposit issue |
| DEVICE_BINDING_CHANGED | SYSTEM | VEHICLE | dimo | FLEET_READINESS | Vehicle device binding change |
| DEVICE_RECONNECTED | SYSTEM | VEHICLE | dimo | FLEET_READINESS | Vehicle connectivity recovery event |
| DEVICE_UNPLUGGED | SYSTEM | VEHICLE | dimo | FLEET_READINESS | Device unplugged — vehicle data gap |
| DRIVING_ASSESSMENT_DEVICE_QUALITY | DRIVING_ANALYSIS | VEHICLE | vehicle-intelligence | OPERATIONS | Driving analysis device quality (not readiness) |
| HANDOVER_INCOMPLETE | HANDOVERS | BOOKING | bookings | OPERATIONS | Incomplete handover workflow |
| HM_SERVICE_NO_TRACKING | VEHICLE_HEALTH | VEHICLE | business-insights | FLEET_READINESS | HM service tracking gap affects evaluability |
| INTEGRATION_DISCONNECTED | SYSTEM | ORGANIZATION | integrations | OPERATIONS | Org-wide integration failure |
| INVOICE_OVERDUE | BILLING | INVOICE | billing | OPERATIONS | Billing invoice overdue |
| LEGAL_ACTIVATION_SCHEDULED | DOCUMENTS | ORGANIZATION | documents | OPERATIONS | Legal document org compliance issue |
| LEGAL_APPROVAL_PENDING | DOCUMENTS | ORGANIZATION | documents | OPERATIONS | Legal document org compliance issue |
| LEGAL_BUNDLE_INCOMPLETE | DOCUMENTS | BOOKING | documents | OPERATIONS | Legal document booking workflow issue |
| LEGAL_DOCUMENT_DELIVERY_FAILED | DOCUMENTS | BOOKING | documents | OPERATIONS | Legal document booking workflow issue |
| LEGAL_DOCUMENT_EXPIRING_SOON | DOCUMENTS | ORGANIZATION | documents | OPERATIONS | Legal document org compliance issue |
| LEGAL_INTEGRITY_CHECK_FAILED | DOCUMENTS | ORGANIZATION | documents | OPERATIONS | Legal document org compliance issue |
| LEGAL_PICKUP_BLOCKED_MISSING_PROOF | DOCUMENTS | BOOKING | documents | OPERATIONS | Legal document booking workflow issue |
| LEGAL_REQUIRED_DOCUMENT_MISSING | DOCUMENTS | ORGANIZATION | documents | OPERATIONS | Legal document org compliance issue |
| LEGAL_REQUIRED_JURISDICTION_MISSING | DOCUMENTS | ORGANIZATION | documents | OPERATIONS | Legal document org compliance issue |
| LEGAL_REQUIRED_LANGUAGE_MISSING | DOCUMENTS | ORGANIZATION | documents | OPERATIONS | Legal document org compliance issue |
| LEGAL_SCAN_FAILED | DOCUMENTS | ORGANIZATION | documents | OPERATIONS | Legal document org compliance issue |
| LEGAL_TECH_HASH_MISMATCH | SYSTEM | ORGANIZATION | documents | OPERATIONS | Legal document platform technical issue (org-wide) |
| LEGAL_TECH_MALWARE_SCANNER_UNAVAILABLE | SYSTEM | ORGANIZATION | documents | OPERATIONS | Legal document platform technical issue (org-wide) |
| LEGAL_TECH_MULTIPLE_ACTIVE_VERSIONS | SYSTEM | ORGANIZATION | documents | OPERATIONS | Legal document platform technical issue (org-wide) |
| LEGAL_TECH_OBJECT_STORAGE_UNAVAILABLE | SYSTEM | ORGANIZATION | documents | OPERATIONS | Legal document platform technical issue (org-wide) |
| LEGAL_TECH_QUEUE_JOB_DEAD | SYSTEM | ORGANIZATION | documents | OPERATIONS | Legal document platform technical issue (org-wide) |
| LEGAL_TECH_RECONCILIATION_FAILED | SYSTEM | ORGANIZATION | documents | OPERATIONS | Legal document platform technical issue (org-wide) |
| LEGAL_TECH_RESOLVER_CONFLICT_UNRESOLVABLE | SYSTEM | ORGANIZATION | documents | OPERATIONS | Legal document platform technical issue (org-wide) |
| LEGAL_TECH_STORAGE_OBJECT_MISSING | SYSTEM | ORGANIZATION | documents | OPERATIONS | Legal document platform technical issue (org-wide) |
| LEGAL_TECH_UNMAPPED_DOCUMENT_TYPE | SYSTEM | ORGANIZATION | documents | OPERATIONS | Legal document platform technical issue (org-wide) |
| LOW_UTILIZATION | OPERATIONS | VEHICLE | business-insights | OPERATIONS | Fleet utilization operations (not readiness) |
| MAINTENANCE_REQUIRED | OPERATIONS | VEHICLE | operations | FLEET_READINESS | **Legacy only** — maintenance grouping is UI taxonomy |
| MISUSE_DETECTED | DRIVING_ANALYSIS | TRIP | vehicle-intelligence | OPERATIONS | Driving analysis misuse detection |
| PAYMENT_FAILED | BILLING | INVOICE | billing | OPERATIONS | Billing payment failure |
| PICKUP_DUE | HANDOVERS | BOOKING | bookings | OPERATIONS | Handover pickup due |
| PICKUP_OVERDUE | HANDOVERS | BOOKING | business-insights | OPERATIONS | Handover pickup overdue |
| POSSIBLE_IMPACT | DRIVING_ANALYSIS | TRIP | vehicle-intelligence | OPERATIONS | Driving analysis impact suspicion (not confirmed technical) |
| REQUIRED_DOCUMENT_MISSING | DOCUMENTS | ORGANIZATION | documents | OPERATIONS | Required vehicle/booking document missing |
| RETURN_DUE | HANDOVERS | BOOKING | bookings | OPERATIONS | Handover return due |
| RETURN_NEEDS_INSPECTION | HANDOVERS | BOOKING | business-insights | OPERATIONS | Return inspection workflow |
| RETURN_OVERDUE | HANDOVERS | BOOKING | business-insights | OPERATIONS | Handover return overdue |
| SERVICE_BEFORE_BOOKING | HANDOVERS | VEHICLE | business-insights | OPERATIONS | Booking impact — service scheduling operations |
| SERVICE_OVERDUE | VEHICLE_HEALTH | VEHICLE | vehicle-intelligence | FLEET_READINESS | Service overdue affects readiness |
| SERVICE_WINDOW | VEHICLE_HEALTH | VEHICLE | business-insights | FLEET_READINESS | Upcoming service window on vehicle |
| STATION_SHORTAGE | OPERATIONS | STATION | business-insights | OPERATIONS | Station capacity / availability operations |
| TECHNICAL_OBSERVATION_ACTIVE | VEHICLE_HEALTH | VEHICLE | vehicle-complaints | FLEET_READINESS | Active technical observation on vehicle |
| TELEMETRY_OFFLINE | SYSTEM | VEHICLE | dimo | FLEET_READINESS | Vehicle telemetry offline — cannot evaluate state |
| TELEMETRY_SOFT_OFFLINE | SYSTEM | VEHICLE | dimo | FLEET_READINESS | Degraded telemetry — evaluability at risk |
| TIGHT_HANDOVER | HANDOVERS | BOOKING | business-insights | OPERATIONS | Booking handover timing operations |
| TIRE_CRITICAL | VEHICLE_HEALTH | VEHICLE | business-insights | FLEET_READINESS | Tire safety/readiness |
| TRIP_ANALYSIS_COMPLETED | DRIVING_ANALYSIS | TRIP | vehicle-intelligence | OPERATIONS | Driving analysis trip event |
| TUV_OVERDUE | VEHICLE_HEALTH | VEHICLE | vehicle-intelligence | FLEET_READINESS | TÜV overdue blocks rental |
| VEHICLE_NOT_READY | OPERATIONS | VEHICLE | operations | FLEET_READINESS | **Live canonical aggregate** from `rental_readiness` (P2.3) |
| VEHICLE_READINESS_UNEVALUABLE | OPERATIONS | VEHICLE | operations | FLEET_READINESS | **Live evaluability aggregate** from `rental_readiness=unevaluable` (P2.4) |
| WEBHOOK_FAILURE | SYSTEM | ORGANIZATION | webhooks | OPERATIONS | Org-wide webhook failure |

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
| **service_compliance** | TÜV/BOKraft overdue | blocks rental | TUV_OVERDUE / BOKRAFT_OVERDUE | `VehicleHealthNotificationSyncService` → `ServiceComplianceNotificationAdapter` | **Yes (P2.1)** | EventType-filtered sweep + grace | No | True overdue only; BI-independent trigger |
| **service_compliance** | HM service CRITICAL overdue | blocks rental | SERVICE_OVERDUE | same | **Yes (P2.1)** | EventType-filtered sweep + grace | No | `evaluateServiceComplianceRentalBlocking` shared with RentalHealth |
| **service_compliance** | service/TÜV/BOKraft due soon (WARNING) | no block | — (not P2.1) | — | **No** | — | Low | BI/tasks retain due-soon; not projected as `*_OVERDUE` |
| **service_compliance** | service warning window | no block | SERVICE_WINDOW | DashboardInsight only | No | — | Medium | Informational gap |
| **service_compliance** | HM no tracking | evaluability | HM_SERVICE_NO_TRACKING | resolve-only in V2 | **Resolve only** | Yes | **Yes** | Never ingested open in V2 |
| **complaints** | blocksRental=true | blocks rental | TECHNICAL_OBSERVATION_ACTIVE | `TechnicalObservationsService` | Shadow only | Yes | **Yes (P1)** | Shadow gate limits production visibility |
| **complaints** | critical urgency, no block | no block | TECHNICAL_OBSERVATION_ACTIVE | shadow | Shadow | Yes | Medium | Semantic split |
| **vehicle_alerts** | limp mode | blocks rental | `LIMP_MODE_ACTIVE` | `VehicleAlertsNotificationAdapter` | **Yes** | Yes | **No P0** | **P2.2B:** V2 wired; explicit clear resolution; UNEVALUABLE ≠ CLEARED |
| **vehicle_alerts** | oil minimum | blocks rental | `ENGINE_OIL_LEVEL_LOW` | `VehicleAlertsNotificationAdapter` | **Yes** | Yes | **No P0** | **P2.2B:** V2 wired; separate fingerprint from HIGH |
| **vehicle_alerts** | oil high warning | no block | `ENGINE_OIL_LEVEL_HIGH` | `VehicleAlertsNotificationAdapter` | **Yes** | Yes | Low | **P2.2B:** WARNING; no hard block; explicit clear |
| **overall_state** | warning/critical transition | indirect | vehicle.health.* workflow | `VehicleHealthWorkflowEmitter` | Workflow only | N/A | **Yes** | Not a V2 notification |
| **rental_blocked** | true (any cause) | aggregate | `VEHICLE_NOT_READY` | `VehicleReadinessNotificationAdapter` | **Yes** | Yes | **No P0** | **P2.3:** ONE canonical aggregate from `rental_readiness=not_ready`; no `BLOCKED_VEHICLE` |
| **rental_readiness** | `unevaluable` | evaluability aggregate | `VEHICLE_READINESS_UNEVALUABLE` | `VehicleReadinessEvaluabilityNotificationAdapter` | **Yes (P2.4)** | Yes | **No P0** | Generic unevaluable aggregate; connectivity events remain causes |
| **availability** | partial/unavailable + `rental_readiness=unevaluable` | `rental_readiness=unevaluable` | `VEHICLE_READINESS_UNEVALUABLE` + connectivity causes | P2.4 aggregate + connectivity producers | **Yes (P2.4)** | Yes | Low | Missing `rental_readiness` → NO_ASSERTION (no notification) |
| **vehicle_damage** | OPEN + BLOCK_RENTAL | blocks rental | — | — | No | — | **Yes** | Outside health modules |

---

## 5. Duplicate / Aggregation Analysis

Multiple notifications for the same vehicle are **intentional** — different fingerprints, different semantics. Do **not** deduplicate.

| Pattern | Cause notification(s) | Aggregate notification(s) | UI treatment (future) |
|---------|----------------------|---------------------------|----------------------|
| Tire issue + not ready | `TIRE_CRITICAL` | `VEHICLE_NOT_READY` | Child cause vs parent readiness status |
| Service overdue + maintenance | `SERVICE_OVERDUE`, `TUV_OVERDUE` | `VEHICLE_NOT_READY` (causes remain separate) | Compliance cause vs aggregate; maintenance grouping is UI taxonomy |
| DTC + blocked | `ACTIVE_DTC:{code}` | `VEHICLE_NOT_READY` | Per-code fault vs rental gate |
| Battery + not ready | `BATTERY_CRITICAL` | `VEHICLE_NOT_READY` | Module cause vs aggregate |
| Technical observation + blocked | `TECHNICAL_OBSERVATION_ACTIVE:{id}` | `VEHICLE_NOT_READY` | Observation vs gate |
| Connectivity + unevaluable | `TELEMETRY_OFFLINE`, `DATA_COVERAGE_INSUFFICIENT`, `CONNECTIVITY_STATE_UNKNOWN` | `VEHICLE_READINESS_UNEVALUABLE` | Cause vs evaluability aggregate — coexist, no dedup |

**Rule:** Cause notifications retain specific `conditionCode` variants; **one** aggregate fingerprint per vehicle (`VEHICLE_NOT_READY`). `BLOCKED_VEHICLE` and `MAINTENANCE_REQUIRED` are legacy/compatibility only — no live producer in P2.3.

---

## 6. Producer Gaps

| Priority | Gap | Detail |
|----------|-----|--------|
| ~~**P0**~~ | ~~Compliance notifications not live-ingested~~ | **Closed in P2.1** — `TUV_OVERDUE`, `BOKRAFT_OVERDUE`, `SERVICE_OVERDUE` via `ServiceComplianceNotificationAdapter` |
| ~~**P0**~~ | ~~`vehicle_alerts` (limp/oil)~~ | **Closed in P2.2B** |
| ~~**P0**~~ | ~~`BLOCKED_VEHICLE` / `VEHICLE_NOT_READY`~~ | **Closed in P2.3** — `VEHICLE_NOT_READY` live; `BLOCKED_VEHICLE` legacy-only |
| ~~**P0**~~ | ~~Unevaluable / data-availability aggregate~~ | **Closed in P2.4** — `VEHICLE_READINESS_UNEVALUABLE` live from `rental_readiness=unevaluable`; missing field → NO_ASSERTION |
| **P1** | `TECHNICAL_OBSERVATION_ACTIVE` | Shadow-only (`shadowModeEnabled: true`) |
| **P1** | `STATION_SHORTAGE` | Shadow-only (correctly OPERATIONS) |
| **P1** | `DRIVING_ASSESSMENT_DEVICE_QUALITY` | Shadow-only (correctly OPERATIONS) |
| **P1** | Most BI insight types | `TIGHT_HANDOVER`, `RETURN_NEEDS_INSPECTION`, `PICKUP_OVERDUE`, `SERVICE_BEFORE_BOOKING`, etc. — registry only |
| **P1** | Driving analysis types | `MISUSE_DETECTED`, `POSSIBLE_IMPACT`, `TRIP_ANALYSIS_COMPLETED`, `DATA_QUALITY_LIMITED` — registry only |
| **P2** | `HM_SERVICE_NO_TRACKING` | Resolve-only path; never opens in V2 |
| **P2** | `insight-candidate.mapper` | ~~`SERVICE_OVERDUE` conditionCode mismatch~~ — **fixed in P2.1** (`service_overdue`); legacy `overdue` fingerprints reconciled idempotently in `reconcileLegacyServiceOverdueFingerprints()` |
| **P2** | `VehicleHealthWorkflowEmitter` | Parallel workflow path, not V2 |

**Live V2 producers today (fleet-relevant):**
- `VehicleHealthNotificationAdapter` — ACTIVE_DTC, BATTERY_CRITICAL, TIRE_CRITICAL, BRAKE_CRITICAL (full)
- `ServiceComplianceNotificationAdapter` — TUV_OVERDUE, BOKRAFT_OVERDUE, SERVICE_OVERDUE (full, P2.1)
- `VehicleAlertsNotificationAdapter` — LIMP_MODE_ACTIVE, ENGINE_OIL_LEVEL_LOW/HIGH (full, P2.2B)
- `VehicleReadinessNotificationAdapter` — VEHICLE_NOT_READY aggregate (full, P2.3)
- `VehicleReadinessEvaluabilityNotificationAdapter` — VEHICLE_READINESS_UNEVALUABLE (full, P2.4)
- `ConnectivityAlertService` — 9 vehicle connectivity types (full)
- `TechnicalObservationNotificationAdapter` — TECHNICAL_OBSERVATION_ACTIVE (shadow)

---

## 7. Lifecycle Gaps

| Scenario | Risk | Detail |
|----------|------|--------|
| Health recovers, notification stale | Medium | Fleet sweep + 6h grace on health notifications; realtime ingest without sweep may leave stale OPEN |
| `rental_blocked` clears | ~~High~~ **Mitigated (P2.3)** | `VEHICLE_NOT_READY` live producer resolves on `rental_readiness=ready`; legacy `BLOCKED_VEHICLE` rows reconciled vehicle-scoped |
| Compliance resolved | ~~High~~ **Mitigated (P2.1)** | Live V2 ingest + fleet sweep resolve for TUV/BOKraft/SERVICE; DashboardInsight legacy path coexists |
| Shadow producers | Medium | TECHNICAL_OBSERVATION_ACTIVE may not appear in production inbox depending on flags |
| HM_SERVICE_NO_TRACKING | Low | Active resolve without corresponding open notification |
| Unevaluable health (`rental_blocked=null`, `rental_readiness=unevaluable`) | ~~High~~ **Mitigated (P2.4)** | `VEHICLE_READINESS_UNEVALUABLE` live aggregate; connectivity causes remain separate |
| Missing `rental_readiness` on snapshot | Medium | **P2.4:** NO_ASSERTION — no notification, no fail-open EVALUABLE; existing OPEN preserved |
| Per-observation resolve | OK | `TECHNICAL_OBSERVATION_ACTIVE:{id}` SUCCESS ingest on resolve/dismiss |

---

## 8. Data Availability / Unevaluable

| State | Health behavior | Notification today |
|-------|----------------|-------------------|
| `availability: partial` + `rental_readiness=unevaluable` | `rental_blocked=null` | **`VEHICLE_READINESS_UNEVALUABLE`** (P2.4) + optional connectivity causes |
| `availability: unavailable` + `rental_readiness=unevaluable` | Modules stubbed unknown | **`VEHICLE_READINESS_UNEVALUABLE`** (P2.4) when canonical field set |
| `availability: partial/unavailable` + `rental_readiness` **missing** | Degraded snapshot (e.g. `buildDegradedVehicleHealth`) | **NO_ASSERTION** — no aggregate; existing OPEN preserved |
| Module `unknown` (DTC stale) | May not block | No ACTIVE_DTC, no pipeline-degraded notification |
| `CONNECTIVITY_STATE_UNKNOWN` | Vehicle connectivity unevaluable | V2 producer exists (full) — **cause**, not aggregate replacement |
| `rental_readiness: unevaluable` | Canonical health field | **`VEHICLE_READINESS_UNEVALUABLE`** live aggregate (P2.4) |

---

## 9. Recommended Phase 2 Plan

### P0 — Correctness (before UI split)

1. ~~Wire compliance producers~~ — **Done (P2.1)**
2. ~~Vehicle alerts notifications (limp/oil)~~ — **Done (P2.2B)**
3. ~~Aggregate readiness producer~~ — **Done (P2.3)** — `VEHICLE_NOT_READY` only; `BLOCKED_VEHICLE`/`MAINTENANCE_REQUIRED` legacy-only
4. ~~Unevaluable aggregate notification~~ — **Done (P2.4)** — `VEHICLE_READINESS_UNEVALUABLE` from `rental_readiness=unevaluable`; NO_ASSERTION when field missing
5. ~~Fix `insight-candidate.mapper` SERVICE_OVERDUE conditionCode~~ — **Done (P2.1)**

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
| 2 | `rental_readiness=not_ready` emits `VEHICLE_NOT_READY`; `ready` resolves it | `vehicle-readiness-notification.spec.ts` lifecycle tests |
| 2b | `rental_readiness=unevaluable` emits `VEHICLE_READINESS_UNEVALUABLE`; `ready`/`not_ready` resolves it; missing field → NO_ASSERTION | `vehicle-readiness-evaluability-notification.spec.ts` |
| 3 | All `service_compliance` blockers emit TUV/BOKraft/SERVICE notifications | Parity test vs `blocking_reasons` |
| 4 | `vehicle_alerts` blockers emit notifications | New producer tests |
| 5 | `attentionScope` lookup drives API filter — no hardcoded event lists in controller/frontend | Lint/grep gate |
| 6 | No OPEN fleet notification remains > grace period after canonical health recovery | Lifecycle integration tests |
| 7 | Cause + aggregate notifications coexist with distinct fingerprints | Registry fingerprint tests |
| 8 | Unevaluable health (`rental_readiness=unevaluable`) emits `VEHICLE_READINESS_UNEVALUABLE`; connectivity causes coexist | `vehicle-readiness-evaluability-notification.spec.ts` cause coexistence |
| 9 | Shadow-only fleet types = 0 | `listShadowModeEventTypes()` ∩ FLEET_READINESS = ∅ |
| 10 | Full registry attention partition test passes | `notification-event-registry.spec.ts` |

---

## Appendix: Producer Module Reference

| Module | Fleet-relevant events | Status |
|--------|----------------------|--------|
| `business-insights` | BATTERY/TIRE/BRAKE_CRITICAL, TUV/BOKRAFT/SERVICE_OVERDUE (P2.1), SERVICE_WINDOW | Partial (health + compliance live) |
| `vehicle-intelligence` | ACTIVE_DTC | Live (DTC processor) |
| `vehicle-complaints` | TECHNICAL_OBSERVATION_ACTIVE | Shadow |
| `dimo` | Connectivity types | Live |
| `operations` | `BLOCKED_VEHICLE`, `MAINTENANCE_REQUIRED` (legacy only), `VEHICLE_NOT_READY` (live P2.3), `VEHICLE_READINESS_UNEVALUABLE` (live P2.4) | Legacy reconcile + live aggregates |
| `rental-health` | Workflow events only | Not V2 |

---

## Appendix B: P2.1 Service/Compliance Producer (2026-08-18)

### Source of truth chain

```
NotificationEvaluationService.executeRun()
        ↓
VehicleHealthNotificationSyncService.syncForOrganization()
        ↓
ServiceComplianceService.evaluateCompliance()
        ↓
projectServiceComplianceOverdueNotifications()   ← true overdue only
        ↓
ServiceComplianceNotificationAdapter
        ↓
NotificationProducerIngestService.syncServiceComplianceWarnings()
        ↓
NotificationCoreService → OPEN / REOPEN / RESOLVE
```

**Trigger:** `NotificationEvaluationService` on every evaluation run (scheduled / debounced / boot via `BusinessInsightsScheduler`). **Independent of Business Insights `policy.enabled`.** Fleet sync runs even when `runForOrganization()` throws; the evaluation job still fails (observability `error`) after fleet sync completes.

### Registry metadata (P2.1 final)

| Field | Value | Rationale |
|-------|-------|-----------|
| `producerModule` | `vehicle-intelligence` | Canonical SoT is `ServiceComplianceService` (live path: `VehicleHealthNotificationSyncService` → `ServiceComplianceNotificationAdapter`) |
| `sourceType` | `DASHBOARD_INSIGHT` | **Unchanged** — persisted notification contract / backfill compatibility; does not affect fingerprint or lifecycle |

Same pattern as `BATTERY_CRITICAL` / `TIRE_CRITICAL` (live fleet-health sync, registry `sourceType: DASHBOARD_INSIGHT`).

### Producer files

| File | Role |
|------|------|
| `service-compliance-notification.projector.ts` | Maps canonical evaluation → overdue-only adapter sources |
| `service-compliance-rental-blocking.policy.ts` | Shared rental-blocking predicate (RentalHealth + notifications) |
| `vehicle-health-notification-sync.service.ts` | Canonical fleet-readiness batch sync (BI-independent) |
| `service-compliance-notification.adapter.ts` | Registry-backed candidate builder |
| `notification-producer.ingest.service.ts` | `syncServiceComplianceWarnings()` + eventType-filtered sweep + legacy reconcile |
| `notification-evaluation.service.ts` | Invokes fleet-readiness sync on every eval run |

### Lifecycle

| Event | OPEN | RESOLVE | REOPEN |
|-------|------|---------|--------|
| TUV_OVERDUE | `tuvBokraft.tuvOverdue === true` | condition clears (sweep) | same fingerprint, same row |
| BOKRAFT_OVERDUE | `tuvBokraft.bokraftOverdue === true` | condition clears | same |
| SERVICE_OVERDUE | HM tracked + `severity === CRITICAL` | condition clears | same |

**Not in P2.1:** due-soon / WARNING windows do not emit `*_OVERDUE` notifications.

Severity: overdue sources always `critical` → CRITICAL.

### Fingerprint / conditionCode

| eventType | conditionCode | fingerprintVersion |
|-----------|---------------|-------------------|
| TUV_OVERDUE | `tuv_overdue` | 1 |
| BOKRAFT_OVERDUE | `bokraft_overdue` | 1 |
| SERVICE_OVERDUE | `service_overdue` | 1 |

### SERVICE_OVERDUE `overdue` vs `service_overdue` analysis

- **Registry + live producer:** `service_overdue` (canonical)
- **Legacy `insight-candidate.mapper`:** was `overdue` until P2.1 — DashboardInsight backfill **could** have persisted `org|SERVICE_OVERDUE|VEHICLE|vehicleId|overdue|v1`
- **Reconciliation:** `reconcileLegacyServiceOverdueFingerprints()` resolves **all** active legacy rows (paginated sweep):
  - **A)** legacy OPEN + canonical SERVICE_OVERDUE active → legacy resolves, canonical remains
  - **B)** legacy OPEN + canonical recovered → legacy resolves, no canonical row created
- **Multi-cause:** `serviceOverdue` cause detection is separate from `serviceOverdueBlocksRental` (RentalHealth UX dedup only). TÜV + Service → both `TUV_OVERDUE` and `SERVICE_OVERDUE` with distinct fingerprints.
- **DashboardInsight coexistence:** `ComplianceOperationalDetector` still writes insights for display/tasks; live V2 producer is canonical for notification lifecycle

### Tests

- `service-compliance-notification.spec.ts` — overdue-only semantics, full lifecycle (all 3), legacy reconcile, sweep, registry 66/23/43
- `service-compliance-notification-blocking-parity.spec.ts` — RentalHealth `blocking_reasons` ↔ notification projection
- `vehicle-health-notification-sync.service.spec.ts` — BI policy disabled + BI runtime throw still runs sync
- `service-compliance-rental-blocking.policy.spec.ts` — shared blocking predicate

### Remaining risks / tech debt

- Duplicate `evaluateCompliance` per vehicle (inside `getVehicleHealth` + sync) — performance follow-up
- Pipeline-degraded notifications at module level (DTC stale, battery unknown) — not P2.4 scope

### P2.2A — Vehicle alerts canonical source (2026-08-19)

| Layer | Status |
|-------|--------|
| Canonical detailed source | `DashboardWarningLightsService` / telltale read model |
| Rental Health projection | **wired** — `projectVehicleAlertsToRentalHealth()` |
| Notification V2 | **Done (P2.2B)** — `VehicleAlertsNotificationAdapter` |
| Registry count | **69 / 26 / 43** (+3 from P2.2B) |

**Tests:** `vehicle-alerts-rental-health.projector.spec.ts`, `vehicle-alerts-rental-health-blocking-parity.spec.ts`, `dashboard-warning-lights.*`, `rental-health.service.spec.ts`

**Hardening (2026-08-19):** per-signal stale with group fresh; `getAiHealthCareRawState` reject → provider_error envelope → RH `unknown`; stale historical active never `isCurrentActive`.

**Pipeline failure (2026-08-19):** fulfilled `provider_error` / `freshness: error` envelopes are canonical pipeline failures (`moduleLoadFailures.vehicle_alerts`) — not only Promise reject. Fail-closed aggregate: `vehicle_alerts.state=unknown`, `pipeline_available=false`, `availability=partial`, `rental_blocked=null`, `rental_readiness=unevaluable`. `not_connected` remains `n_a` without marking pipeline unavailable.

**CI closure (2026-08-19):**

| Check | `main` (`d936b785`) | PR (`f2326b63`) | Δ |
|-------|---------------------|-----------------|----|
| `npx tsc --noEmit -p tsconfig.json` | 5 errors | 5 errors | **0** |
| `test:vehicle-detail:verify:unit` | 1 failed suite / 11 passed / 56 tests | 1 failed suite / 11 passed / 56 tests | **0** |
| P2.2A targeted Jest | — | parsing 10/10, service 23/23, projector 17/17, blocking-parity 7/7, registry 25/25 | — |

**Typecheck baseline (both branches, identical):**

1. `billing.controller.security.characterization.spec.ts:184` — `BillingController` ctor **22/23 args** (missing `operationalSubscriptionsService`; pre-existing on `main`, not P2.2A)
2. `vehicles-security-negative.spec.ts:367,533,569` — ctor arity mismatch (pre-existing)
3. `vehicles.controller.status-patch.spec.ts:25` — `undefined` vs `VehiclesOperationalService` (pre-existing; sole failing vehicle-detail suite)

**Verdict:** **P2.2B: merged (#1069).** **P2.3: merged (#1070).** **Overall: YELLOW / NOT READY FOR UI CUTOVER** (shadow producers + dashboard split remain).

### P2.3 — Fleet Readiness Aggregate Notification (2026-08-19)

| Layer | Status |
|-------|--------|
| Canonical source | `VehicleHealth.rental_readiness` (from existing `getVehicleHealth` snapshot — no second evaluation) |
| Aggregate projector | `projectVehicleReadinessAggregate()` — NOT_READY / READY / UNEVALUABLE |
| Adapter / sync | `VehicleReadinessNotificationAdapter` + `syncVehicleReadinessAggregate()` |
| Registry delta | **unchanged** (69/26/43 — no new event types) |
| Legacy | `BLOCKED_VEHICLE`, `MAINTENANCE_REQUIRED` — compatibility only; **vehicle-scoped** paginated reconcile when safe |
| Lifecycle | READY no-op without active fingerprint; UNEVALUABLE preserves OPEN; ingest-failure preserves legacy |

**Architecture:** ONE aggregate (`VEHICLE_NOT_READY`). Causes answer why; aggregate answers whether vehicle is rentable.

**Verdict:** **P2.3: merged (#1070).** **Overall: YELLOW / NOT READY FOR UI CUTOVER** (P2.4 + UI cutover addressed separately below).

### P2.4 — Fleet Readiness UNEVALUABLE Aggregate (2026-08-19)

| Layer | Status |
|-------|--------|
| Canonical source | `VehicleHealth.rental_readiness === 'unevaluable'` (same snapshot as P2.3) |
| Evaluability projector | `projectVehicleReadinessEvaluability()` — UNEVALUABLE / EVALUABLE / NO_ASSERTION |
| Adapter / sync | `VehicleReadinessEvaluabilityNotificationAdapter` + `syncVehicleReadinessEvaluabilityAggregate()` |
| Registry delta | **+1** (70/27/43) |
| P2.3 interaction | `VEHICLE_NOT_READY` preserved on UNEVALUABLE — fail-safe unchanged |
| Load failure | `rentalHealth === null` → no new aggregate (preserve existing OPEN) |
| Missing field | `rental_readiness === undefined` → NO_ASSERTION (no fail-open EVALUABLE) |
| Connectivity | Cause events independent — no semantic reuse of `DATA_COVERAGE_INSUFFICIENT` |

**Verdict:** **P2.4: READY FOR MERGE** (evaluability aggregate + NO_ASSERTION hardening). **Overall: YELLOW / NOT READY FOR UI CUTOVER** (shadow producers + dashboard split remain).

### P2.2B — Vehicle alerts Notification V2 (2026-08-19)

| Layer | Status |
|-------|--------|
| Canonical source | `DashboardWarningLightsService` (unchanged from P2.2A) |
| Notification projector | `projectVehicleAlertNotifications()` — ACTIVE/CLEARED/UNEVALUABLE |
| Adapter / sync | `VehicleAlertsNotificationAdapter` + `syncVehicleAlertsWarnings()` via `VehicleHealthNotificationSyncService` |
| Registry delta | **66/23/43 → 69/26/43** (+3 FLEET_READINESS) |
| Reconciliation | Cause-aware only — **no absent-fingerprint sweep**; stale/provider_error preserve OPEN |
| Failure isolation | Vehicle alerts projection isolated from DTC/compliance/rental-health/tire/brake; sync stages attempted independently |
| Healthy CLEARED | Active-fingerprint pre-check — CLEARED without OPEN row is no-op (no false recovery failures) |
| i18n | All 8 rental locales (`en`–`cs`) with native title/body keys |

**Lifecycle rule:** UNEVALUABLE does not equal CLEARED. Stale/provider_error/not_connected do not resolve existing cause notifications.

**Verdict:** **P2.2B: READY FOR MERGE** (notification scope). **Overall: YELLOW / NOT READY FOR UI CUTOVER**.

### P2.1 final verdict

**READY FOR MERGE** (P2.1 scope). **NOT READY FOR UI CUTOVER** (aggregate/P0 gaps remain).
