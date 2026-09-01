# Battery V2 — Publication & Readiness Reachability (Phase 3)

**Gap:** `BAT-V2-GAP-PUB-READINESS-001` (refined)  
**Handoff gaps:** `BAT-V2-GAP-LV-CANONICAL-ASSESSMENT-HANDOFF-001`, `BAT-V2-GAP-LV-PUBLICATION-HANDOFF-001`, `BAT-V2-GAP-LV-PUBLICATION-JOB-CHAIN-001`  
**Epistemic:** CONFIRMED from config + code trace

## Separate concepts (do not collapse)

| Concept | Artifact / service | Customer-facing? |
|---------|-------------------|------------------|
| **Assessment** | `battery_assessments` | Usually no (shadow/diagnostic) |
| **Publication record** | `battery_publications` | When STABLE/PROVISIONAL |
| **Canonical read** | `CanonicalBatteryHealthService` + builder | Yes (API) |
| **Readiness decision** | `evaluateBatteryReadiness` | Rental block when flag on |
| **User-visible UI** | Rental health, tasks, insights | Partial / path-dependent |

## Flag defaults (`battery-health-v2.config.ts`)

| Flag | Default | Effect when OFF |
|------|---------|-----------------|
| `BATTERY_V2_REST_SHADOW_ENABLED` | **false** | No canonical REST ingestion pipeline |
| `BATTERY_V2_PUBLICATION_ENABLED` | **false** | No LV publication persist |
| `BATTERY_V2_READINESS_ENABLED` | **false** | Readiness returns READY noop |
| `BATTERY_V2_HV_CAPACITY_SHADOW_ENABLED` | **false** | No HV shadow recompute; **HV SOH gate execution authority** (handler + `HvSohGateAssessmentService` return null) |
| `BATTERY_V2_HV_SOH_PUBLICATION_ENABLED` | **false** | Adds `PUBLICATION_DISABLED` to SOH gate `gateReasonCodes` (publication-context only; does **not** gate execution) |

## Stage model (cutover policy)

| Stage | REST shadow | Publication | Readiness | Legacy rest capture |
|-------|-------------|-------------|-----------|---------------------|
| 1 | ON | OFF | OFF | ON (when pub off) |
| 2 | ON | ON | OFF | OFF |
| 3 | ON | ON | ON | OFF |
| Legacy-only | OFF | OFF | — | ON |

`isBatteryV2LegacyRestCaptureEnabled()`: when REST shadow ON **and** publication ON → legacy rest capture **OFF**.

## LV publication pipeline — two missing automatic handoffs

### Handoff A — canonical REST → assessment (MISSING)

```
REST target evaluate completes measurement
  ✗ does NOT enqueue BATTERY_ASSESSMENT_RECOMPUTE
```

Legacy path only:

```
snapshot classify + isBatteryV2LegacyRestCaptureEnabled()
  → legacy onSnapshot restCaptured
  → enqueueLvAssessmentRecompute
```

**Cutover trap:** Stage 2+ (shadow ON + publication ON) disables legacy capture → no automatic assessment enqueue from snapshots either.

`reconcilePendingAssessments()` selects stale `batteryFeatures` (`restObservationCount`/`crankObservationCount`), **not** canonical `BatteryMeasurement` REST rows.

### Handoff B — assessment → publication (MISSING)

```
battery-assessment-recompute.handler completes
  ✗ does NOT enqueue BATTERY_PUBLICATION_UPDATE
```

Handler exists and works when invoked:

```
battery-publication-update.handler (BATTERY_PUBLICATION_UPDATE)
  → BatteryPublicationService.updateLvPublication()
```

**Enqueue audit:** `BATTERY_V2_ENQUEUE_ENTRY_POINTS` lists assessment wrapper; **no publication enqueue wrapper** (`BAT-V2-EVID-AUDIT-PUBLICATION-ENQUEUE-ABSENCE-001`).

### End-to-end verdict

**NOT CURRENTLY END-TO-END REACHABLE** for canonical REST → assessment → publication. Enabling `BATTERY_V2_PUBLICATION_ENABLED` alone is **not sufficient**.

## HV SOH gate execution vs publication-intent (separate flags)

**Execution authority:** `BATTERY_V2_HV_CAPACITY_SHADOW_ENABLED`

- `HV_CAPACITY_SHADOW_RECOMPUTE` handler gated by this flag.
- `HvCapacityShadowService.recomputeM2ForSession()` chain: M2 → M3 validation → cross-session capacity assessment → `HvSohGateAssessmentService.recomputeForVehicle()`.
- `HvSohGateAssessmentService` returns null when this flag is OFF.

**Publication-intent / reason metadata:** `BATTERY_V2_HV_SOH_PUBLICATION_ENABLED`

- Passed into `hv-soh-gate.policy.ts` as `sohPublicationEnabled`.
- When OFF: adds `PUBLICATION_DISABLED` to `gateReasonCodes`.
- `PUBLICATION_DISABLED` is **excluded** from blocking reasons for internal SOH computation / `sohGatePassed` (`blockingWithoutPublication` filter).
- **`sohGatePassed` MAY BE TRUE while this flag is OFF.** The flag does **not** “unblock `sohGatePassed`”.

**`publicationEligible` (CONFIRMED):** `hv-soh-gate.policy.ts` sets `publicationEligible: false` on returned SOH gate assessments **regardless of** `sohPublicationEnabled`.

**Customer publication reachability:**

- No HV `BatteryPublication` / customer-publication carrier path identified.
- Enabling `BATTERY_V2_HV_SOH_PUBLICATION_ENABLED` alone does **not** create customer-visible HV SOH publication.
- Do **not** describe this flag as a working publication pipeline.

## Readiness (`battery-readiness.policy.ts`)

When `BATTERY_V2_READINESS_ENABLED` is ON, **independent** hard-block-capable inputs:

- confirmed workshop defect
- battery warning light
- safety-critical battery DTC
- stable qualified critical LV evidence
- fresh provider SOH below readiness threshold (with required confidence)

**Non-hard-blocking:** proxy/shadow/live-only paths. Readiness does **not** globally require STABLE LV publication.

**Consumer:** `RentalHealthService.evaluateBattery`. Tasks: `blocksVehicleAvailability: false`.

Production enablement — **not PRODUCTION_VALIDATED**.
