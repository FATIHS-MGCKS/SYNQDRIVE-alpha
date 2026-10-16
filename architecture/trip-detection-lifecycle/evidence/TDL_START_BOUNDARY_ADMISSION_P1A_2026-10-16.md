# TDL — Trip Start Boundary Admission (P1A offline resolver)

| Field | Value |
|-------|-------|
| **Epistemic** | `CONFIRMED` (code + unit tests on `main` @ `c1013265…`, hardened P1A.1 on PR #2055) |
| **Decision status** | `PROPOSED` — not wired to live `createTrip` writer |
| **Related trip** | `358d0158-b2a9-47ed-af26-33926c5770b4` (Tesla token `186946`) |
| **Evidence reuse** | DI EXP021 PR #2051 frozen exports (not modified) |

## Core principle (P1A.1)

**Provider segment existence may establish candidate trip context, but physical start-boundary authority requires temporally localized movement corroboration.**

Segment-level aggregates (`distanceKm`, segment odometer delta, `maxSpeedKmh`) may support **trip activity** inference — they do **not** authorize the exact `segment.startTime` without timestamp-bound core/route movement (or an explicit provider contract guaranteeing start semantics — **not assumed**).

## Provenance axes (do not conflate)

| Field | Meaning |
|-------|---------|
| `integrationModality` | `SOFTWARE_INTEGRATION` \| `HARDWARE_DEVICE` \| `UNKNOWN` (vehicle connection identity) |
| `providerSegmentDetectionMechanism` | `changePointDetection` \| `frequencyAnalysis` \| `ignitionDetection` \| `UNKNOWN` — from **segment payload** when matched |
| `segmentDetectionMechanismIndependentlyProven` | `true` only when historical evidence proves mechanism for **this trip** — **not** inferred from integration modality |

**Tesla reference:** `integrationModality=SOFTWARE_INTEGRATION` (vehicle). Segment mechanism on payload may be present in tests/fixtures; **independent mechanism proof = NO** unless EXP021 export explicitly certifies mechanism for this segment (not claimed here).

## External departure anchor

`departureReviewAnchorAt` (EXP021 video PTS 0 ≈ `2026-10-16T03:37:41Z`):

- documents departure-review / maneuver **context**
- **not** exact physical movement
- **not** guaranteed stationary
- **does not** set `canonicalStartAt`

## Authority drift (OQ-006 vs live code)

Historical audit [`TDL_OQ_006_DIMO_SEGMENT_FSM_BOUNDARY_AUDIT_2026-09-25.md`](TDL_OQ_006_DIMO_SEGMENT_FSM_BOUNDARY_AUDIT_2026-09-25.md) states that live FSM start confirmation does **not** consult DIMO segments. **That statement is stale.**

**Current production (`TripDetectionOrchestrationService.resolveConfirmedStartBoundary`):** when `selectConfirmedStartSegment` matches, **`matchingSegment.startTime` becomes canonical start** without additional movement corroboration for the segment prefix.

P1A adds offline `resolveEvidenceBackedStartBoundary` + shadow — **production writer unchanged**.

## Semantic separation (four times)

| Term | Meaning |
|------|---------|
| `providerSegmentStartAt` | DIMO segment `startTime` |
| `earliestSupportedMovementAt` | Earliest trusted **timestamped** core/route movement |
| `candidateStartAt` | FSM `possibleStartAt` / start-candidate clock |
| `canonicalStartAt` | Proposed trip boundary (shadow only in P1A) |

## Tesla reference (offline classification)

| Input | Value |
|-------|-------|
| Provider segment | `dimo-seg-186946-1792121760000` @ `2026-10-16T03:36:00.000Z` |
| FSM candidate | `2026-10-16T03:38:26.989Z` |
| Legacy effective start | `03:36:00Z` (`boundaryAdjustmentMs = -146989`) |
| P1A decision | `PROVIDER_START_UNCORROBORATED` |
| P1A proposed canonical | `2026-10-16T03:38:26.989Z` (candidate fallback) |

Prefix `03:36:00`–`03:37:40`: EXP021 documents **101 s** with **98× ROW_ABSENT**, **3× PRESENT**, no trusted numeric movement — **NO_DATA != STATIONARY**.

## Downstream revision impact (design only)

| Artifact | On future boundary correction |
|----------|------------------------------|
| `VehicleTrip.startTime` / duration | Recompute; versioned correction event |
| Route artifacts / waypoints | Re-materialize or mark stale for affected window |
| DI acquisition window | Re-open only via explicit **BOUNDARY_CORRECTION** admission — not silent |
| Post-finalize DI / behavior | Invalidate analysis runs tied to superseded boundary |
| Battery / EED hooks | Re-emit trip-start hooks only after confirmed correction workflow |

**BOUNDARY CORRECTION** ≠ **FINALIZATION / ADMISSION** (EXP021 S4 remains post-FSM-finalize).

## Validation

```bash
cd backend && npx jest trip-start-boundary-admission.spec.ts
```

(15 regression cases incl. H1–H6 after P1A.1 hardening.)
