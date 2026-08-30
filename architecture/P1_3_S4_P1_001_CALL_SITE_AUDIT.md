# P1.3-S4 P1-001 Call-Site Audit (Final Remediation)

**Date:** 2026-08-30  
**PR:** #1429  
**Invariant:** Registered-vehicle production paths must propagate `{ organizationId, vehicleId, tokenId }` via `buildDimoProviderRequestContext()` where available.

## Summary

| Classification | Count |
|----------------|------:|
| FULL_CONTEXT_REQUIRED | 43 |
| TOKEN_ONLY_LEGITIMATE | 6 |
| CONTEXT_UNAVAILABLE_BUT_REGISTERED_PATH | **0** |
| NOT_PROVIDER_BOUND | 0 |
| **TOTAL** | **49** |

## Why first remediation was incomplete

The first P1-001 pass fixed gateway infrastructure and scheduler-heavy paths but did not thread context through **trip enrichment**, **behavior enrichment**, **braking intake**, **shadow detector**, **event-context**, **misuse reconcile**, **segment validation**, **battery crank proxy**, and **vehicle live GPS** — all registered-vehicle paths with org/vehicle in scope.

## Newly fixed production paths (second remediation)

| File | Methods |
|------|---------|
| `trips.service.ts` | `fetchRouteEnrichment`, `fetchEnvironmentTemperature`, `fetchPerformance` |
| `trip-behavior-enrichment.service.ts` | `fetchHighFrequency`, `fetchFuelSummary` (HF + LTE_R1) |
| `lte-r1-behavior-enrichment.service.ts` | braking intake + `fetchHighFrequency` |
| `dimo-braking-event-intake.service.ts` | `fetchEventDataSummary`, `fetchDrivingEventsPaginated` |
| `shadow-detector-enrichment.service.ts` | `fetchHighFrequency`, `fetchTripSegmentsForMechanism` |
| `event-context-enrichment.service.ts` | `fetchContextSignals` → `fetchHighFrequency` |
| `misuse-case-reconcile.service.ts` | `fetchSafetyEvents` |
| `dimo-trip-segment-validation.service.ts` | `fetchTripSegmentsForMechanism` |
| `battery-start-proxy-extract.service.ts` | `fetchCrankWindow` |
| `battery-v2.service.ts` | `fetchCrankWindow` (deprecated `onTripStart`) |
| `vehicles.service.ts` | `fetchLastSeenLocation` (telemetry + live GPS) |
| `rpm-webhook-candidate.service.ts` | `enrichAnchorContext` |
| `scripts/ops/repair-vehicle-trips-from-dimo.ts` | `fetchTripSegments` |

## TOKEN_ONLY_LEGITIMATE (6)

| File | Reason |
|------|--------|
| `dimo-api-sync.service.ts` | Pre-registration identity sync — no SynqDrive vehicle/org |
| `dimo.controller.ts` | Non-registered vehicle refresh + debug GraphQL |
| `dimo-segments.service.ts` | Internal gateway implementation |
| `dimo-telemetry.service.ts` | Internal gateway implementation |
| `dimo-recharge-segments.graphql.ts` | Receives context from caller |
| `dimo-recharge-segments.client.ts` | Receives context from caller |

## Architectural regression guard

- `dimo-provider-call-site-audit.util.ts` — repository scanner
- `dimo-provider-call-site-audit.spec.ts` — fails CI if category **C** reappears
- `dimo-provider-registered-vehicle-context.regression.spec.ts` — canary cross-path consistency

**Limitation:** Static scan inspects ±250/900 chars around each call for context markers or inline `organizationId`/`vehicleId` fields. Context built >250 chars before the call may require extending markers or assigning to a named `providerContext` variable.

---

*Generated as part of P1-001 final remediation on PR #1429.*
