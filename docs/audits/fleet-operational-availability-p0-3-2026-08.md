# P0.3 — Fleet Operational Availability Migration

**Date:** 2026-08-25  
**Status:** Implementation complete (consumer migration)  
**Baseline:** P0.2 merged (#1273), P0.1 connectivity runtime (#1263)

---

## A. Legacy badge authority (before P0.3)

| Layer | Authority |
|-------|-----------|
| Endpoint | `GET /api/v1/organizations/:orgId/fleet-map` |
| Service | `VehiclesService.getFleetMapData()` → `deriveFleetStatusContext()` |
| DTO field | `operationalState.status` + legacy `status` string |
| Frontend mapper | `mapFleetMapVehicleResponse()` → `VehicleData.operationalState` |
| Display | `resolveOperationalStatusBadge()` → `formatVehicleOperationalStatusLabel()` |
| Fleet UI | `FleetOperatorRow`, `FleetMapVehicleStatusHud` via `resolveFleetVehicleDisplayState().statusBadge` |

**Visible “Verfügbar”** came from **business/workflow operational state** (`AVAILABLE`), not P0.2 `operationalAvailability`. Long-offline vehicles with `businessState = AVAILABLE` incorrectly showed green “Verfügbar”.

---

## B. New authoritative source (P0.3)

| Layer | Authority |
|-------|-----------|
| Backend | `VehicleOperationalProjectionService.getVehicleProjections()` (batch) |
| DTO | `FleetMapVehicleDto.operationalAvailability` (`FleetOperationalAvailabilityDto`) |
| Frontend | `mapOperationalAvailabilityPresentation()` via `operationalAvailabilityBadge: true` on Fleet surfaces |

---

## C. Business vs operational semantics

| Concept | Field | Preserved |
|---------|-------|-----------|
| Business / workflow | `status`, `operationalState`, `rawVehicleStatus` | **Yes** — unchanged derivation |
| Operator operational availability | `operationalAvailability.state` | **New** — Fleet list badge only |

`businessState = AVAILABLE` and `operationalAvailability = NEEDS_VERIFICATION` **coexist by design**.

---

## D. Fleet DTO migration

Added to `FleetMapVehicleDto`:

```typescript
operationalAvailability?: {
  state: 'AVAILABLE' | 'NEEDS_VERIFICATION' | 'UNKNOWN' | 'UNAVAILABLE';
  primaryReason: OperationalReasonCode | null;
  reasonCodes: OperationalReasonCode[];
  recommendedAction: ConnectivityRecommendedAction;
  attention: AttentionState;
  generatedAt: string;
}
```

Mapper: `toFleetOperationalAvailabilityDto()` in `fleet-operational-availability.dto.ts`.

Failure / missing entry: `UNKNOWN` with fresh `generatedAt` — **never** `AVAILABLE`.

---

## E. Presentation states

| P0.2 state | DE | EN | Tone |
|------------|----|----|------|
| AVAILABLE | Verfügbar | Available | success |
| NEEDS_VERIFICATION | Prüfung erforderlich | Check required | watch |
| UNKNOWN | Status unbekannt | Status unknown | neutral |
| UNAVAILABLE | Nicht verfügbar | Unavailable | critical |

Central mapper: `frontend/src/rental/lib/operational-availability/presentation.ts`.

---

## F. Desktop / mobile

Both use `FleetOperatorRow` (shared). Map HUD uses `FleetMapVehicleStatusHud`.  
Both pass `operationalAvailabilityBadge: true` + i18n `t`.

**Not migrated (intentional):** Dashboard drawer, Vehicle Detail header — still business `statusBadge`.

---

## G. Filters / counts decision

| Surface | Decision |
|---------|----------|
| Fleet Command tabs (`Available`, `Rented`, …) | **Unchanged** — still `selectOperationalStatus` / `selectIsCurrentlyAvailable` (business) |
| Station filter ready/attention counts | **Unchanged** — business/visual semantics |
| KPI cards | **Unchanged** — out of P0.3 scope |

Documented as future Dashboard/readiness migration if operator-readiness counts should use P0.2.

---

## H. Failure fallback

| Condition | Behavior |
|-----------|----------|
| P0.2 batch throws | Log warning; per-vehicle `UNKNOWN` |
| Missing vehicle in projection map | `UNKNOWN` |
| Frontend missing `operationalAvailability` | Presentation normalizes to `UNKNOWN` |

Never defaults to green “Verfügbar”.

---

## I. Reference cases (semantic fixtures)

| Case | business | operationalAvailability | Fleet badge (DE) |
|------|----------|-------------------------|------------------|
| WOB L 7503 | AVAILABLE | NEEDS_VERIFICATION | Prüfung erforderlich |
| WOB L 9755 | AVAILABLE | NEEDS_VERIFICATION | Prüfung erforderlich |
| HMÜ C 215 | AVAILABLE | UNKNOWN | Status unbekannt |
| Hard block | OUT_OF_SERVICE / workflow | UNAVAILABLE | Nicht verfügbar |

---

## J. Production shadow delta (read-only)

**Expected delta after deploy:**

| Vehicle | Legacy badge | New badge |
|---------|--------------|-----------|
| WOB L 7503 | Verfügbar | Prüfung erforderlich |
| WOB L 9755 | Verfügbar | Prüfung erforderlich |
| HMÜ C 215 | Verfügbar | Status unbekannt |

P0.2 production shadow (pre-P0.3): HMÜ `UNKNOWN`, WOB both `NEEDS_VERIFICATION`, all `businessState = AVAILABLE`.

**Production mutations:** NONE (DTO read path only).

---

## K. Consumer compatibility

- Legacy `status` string **unchanged** in meaning.
- New additive field `operationalAvailability`.
- Non-Fleet consumers ignoring the new field continue to work.

---

## L. Final verdict

| Gate | Result |
|------|--------|
| P0.3 Fleet operational availability | **PASS** (implementation) |
| P0.3 consumer migration | **READY** (pending merge/deploy review) |
| P0.4 Health | **DO NOT START** |
| Vehicle Detail connectivity migration | **DO NOT START** |
| Production processing gate | **CONDITIONAL** (unchanged) |
