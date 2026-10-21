# HMÜ C 215 — Live Production Operational-State Forensic

| Field | Value |
|-------|-------|
| **Audit ID** | `hmue-c215-operational-state-forensic-2026-08` |
| **Mode** | Production read-only |
| **Production modified** | **No** |
| **Investigation time (UTC)** | `2026-08-25T14:21Z` – `2026-08-25T14:27Z` |
| **Deployed release** | `/opt/synqdrive/current` (main, pre–PR #1277) |

---

## A. Vehicle identity

| Field | Value |
|-------|-------|
| vehicleId | `8c850ff1-4201-432b-af2e-2711dbc7ca48` |
| organizationId | `faa710c9-6d91-4079-a7d5-91fdccdec14a` |
| licensePlate | **HMÜ C 215** |
| make / model / year | Volkswagen Arteon 2020 |
| hardwareType | `LTE_R1` (physical OBD applicable) |

---

## B. Current Production evidence (snapshot)

| Field | Value |
|-------|-------|
| Production now | `2026-08-25T14:27:00.703Z` |
| sourceTimestamp (canonical) | `2026-08-25T12:46:00.000Z` |
| lastSeenAt | `2026-08-25T12:46:00.000Z` |
| providerFetchedAt (ingest) | `2026-08-25T14:26:50.641Z` |
| providerSource | `DIMO` |
| snapshot age | **~1.7 hours** |
| obdIsPluggedIn | **`true`** (`value: 1`, timestamp `2026-08-25T12:46:00Z`) |
| providerBindingId | `null` |
| DIMO connectionStatus | `CONNECTED` |
| DIMO tokenId | `187784` |
| DIMO lastSignal | `2026-08-24T20:30:48.000Z` (not used when sourceTimestamp present) |

**Loader validity:** snapshot is valid and consumed by P0.1 (`hasTelemetrySnapshot: true`, `dataCoverageState: GOOD`, 100% signal coverage).

---

## C. Latest unplug vs snapshot ordering

| Evidence | Timestamp (UTC) |
|----------|-----------------|
| Latest canonical unplug (`OBD_DEVICE_UNPLUGGED`) | `2026-07-20T11:05:00.000Z` |
| Latest snapshot (sourceTimestamp) | `2026-08-25T12:46:00.000Z` |

**Snapshot newer than unplug:** **YES** (~36 days newer).

**Runtime treatment:** `derivePhysicalDeviceEvidence()` → newest evidence = `positive_snapshot` → `PLUGGED_INFERRED` + `DEVICE_RECONNECTED_SNAPSHOT`. The July unplug does **not** win; recovery via snapshot is recognized.

**obdIsPluggedIn semantics:** **POSITIVE_PHYSICAL_EVIDENCE** (`true` → positive_snapshot candidate).

---

## D. Provider link & mapping gap (decisive)

| Check | Value |
|-------|-------|
| VehicleDataSourceLink (DIMO) | **0 rows** (`hasActiveMapping: false`) |
| Provider consent | `ACTIVE` (granted 2026-06-30) |
| Org DIMO authorization | `ACTIVE` |
| dimoVehicleId | present (historical identity) |
| tokenId | `187784` |

**ProviderLinkStateBuilder path:**

- `hasAnyProviderIdentity` → true (token + historical DimoVehicle)
- `fullyActive` → **false** (requires `hasActiveMapping`)
- Falls through → **`ProviderLinkState.UNKNOWN`** (`provider-link-state.builder.ts:219`)

This is **not** caused by revoked consent or missing token. It is caused by **missing active data-source mapping row** despite live telemetry.

---

## E. P0.1 derivation

**Services:** `assembleVehicleConnectivityRuntimeBundle()` → `VehicleConnectivityRuntimeStateBuilder.build()`

| Dimension | Value | Derivation |
|-----------|-------|------------|
| telemetryState | `standby` | `deriveTelemetryState()` → `classifyTelemetryFreshness(sourceTimestamp, now)` → age ~1.7h → `standby` → `TELEMETRY_STANDBY` |
| physicalDeviceState | `PLUGGED_INFERRED` | `derivePhysicalDeviceEvidence()` → fresh positive snapshot after older unplug |
| providerLinkState | `UNKNOWN` | no active mapping (see §D) |
| dataCoverageState | `GOOD` | 100% applicable signals |
| interruptionKnowledge (episode) | no OPEN episode in DB; `activeEpisodeId: null`; `openUnpluggedEpisode: false` in runtime |
| episodeEvidenceReliable | `false` | production default: `CONNECTIVITY_LIFECYCLE_RECONCILE_AFTER` unset → `automaticLifecycleReconciliationEnabled: false` |
| **overallState** | **`UNKNOWN`** | `resolveOverallState()` → candidates `[UNKNOWN (providerLink), STANDBY (telemetry)]` → **`pickHighestPriorityOverallState`** → UNKNOWN wins (priority 60 < 70) |
| reasonCodes | `TELEMETRY_STANDBY`, `DEVICE_RECONNECTED_SNAPSHOT` | |
| recommendedAction | `WAIT_FOR_TELEMETRY` | `overallState === UNKNOWN` branch |
| attentionState | `NONE` | |

### Why overallState = UNKNOWN (exact branch)

```
resolveOverallState()
  providerLinkState === UNKNOWN  → candidate OverallConnectivityState.UNKNOWN
  telemetryState === 'standby'   → candidate OverallConnectivityState.STANDBY
pickHighestPriorityOverallState([UNKNOWN, STANDBY])
  → UNKNOWN (priority 60 beats STANDBY 70)
```

**Not caused by:** open unplug episode, physical UNKNOWN, or stale/offline telemetry.

**Is UNKNOWN caused by unreliable episode history despite fresh telemetry?** **NO.** Episodes table is empty; runtime has no active episode. `episodeEvidenceReliable: false` adds `INSUFFICIENT_CROSS_DOMAIN_EVIDENCE` to P0.2 reason codes but does **not** set `operationalAvailability`.

---

## F. P0.2 derivation

**Inputs (production-equivalent):**

| Input | Value |
|-------|-------|
| businessState | `AVAILABLE` |
| connectivity.overallState | `UNKNOWN` |
| connectivity.telemetryState | `standby` |
| connectivity.physicalDeviceState | `PLUGGED_INFERRED` |
| connectivity.providerLinkState | `UNKNOWN` |
| healthEvaluability | `PARTIALLY_EVALUABLE` (separate domain; does not block operational availability) |
| episodeEvidenceReliable | `false` |

**operationalAvailability branch:**

```typescript
// vehicle-operational-projection.builder.ts:244-245
if (connectivity.overallState === OverallConnectivityState.UNKNOWN) {
  return OperationalAvailabilityState.UNKNOWN;
}
```

| Output | Value |
|--------|-------|
| operationalAvailability | **`UNKNOWN`** |
| primaryReason | **`TELEMETRY_STANDBY`** (first connectivity reason code; not in `selectPrimaryReason` precedence list) |
| recommendedAction | `WAIT_FOR_TELEMETRY` (from connectivity) |

**Note:** `TELEMETRY_STANDBY` as primaryReason is **misleading** — the decisive gate is `overallState === UNKNOWN` from provider-link UNKNOWN, not standby telemetry itself. Standby telemetry alone would yield `overallState: STANDBY` → `operationalAvailability: AVAILABLE`.

---

## G. Counterfactuals (pure in-memory, production inputs)

| CF | Change | operationalAvailability |
|----|--------|----------------------|
| Baseline | real production connectivity | **UNKNOWN** |
| CF1 | `interruptionKnowledge = known_none` (N/A — not a P0.2 builder input) | **UNKNOWN** (unchanged) |
| CF2 | `physicalDeviceState = PLUGGED_INFERRED` (already true) | **UNKNOWN** |
| CF3 | `overallState = STANDBY` | **AVAILABLE** ✓ |
| CF4 | `episodeEvidenceReliable = true` | **UNKNOWN** (unchanged) |
| CF5 | `providerLinkState = ACTIVE` + `overallState = STANDBY` | **AVAILABLE** ✓ |

**Decisive flip:** **`overallState: UNKNOWN → STANDBY`** (equivalently: resolve provider link to ACTIVE so standby telemetry wins overall synthesis).

---

## H. UI vs backend timestamp

| Source | Timestamp |
|--------|-----------|
| P0.1 `lastTelemetryAt` | `2026-08-25T12:46:00.000Z` (sourceTimestamp via `resolveCanonicalTelemetryFreshness`) |
| Fleet UI list `lastTelemetryAt` | same runtime field |
| DIMO `lastSignal` | `2026-08-24T20:30:48.000Z` (older; not used when sourceTimestamp exists) |
| UI Standby label | from `telemetryState: standby` on **same** canonical observation instant |

**UI timestamp source == P0.1 source:** **YES** (both use `sourceTimestamp` / `runtime.lastTelemetryAt`). UI shows Standby correctly for ~1.7h age; P0.1 agrees on telemetry dimension.

---

## I. Root-cause classification

**Primary: TOO_CONSERVATIVE**

Fresh snapshot + positive plug evidence + active consent/auth/token + CONNECTED DIMO status should not block operational availability, but **missing `VehicleDataSourceLink`** forces `providerLinkState: UNKNOWN`, which outranks `STANDBY` in overall synthesis.

**Secondary: DATA_QUALITY_ISSUE**

Operational DIMO telemetry flows without a persisted active data-source mapping row for this vehicle.

**Not:** P0.2 mapping bug (P0.2 correctly maps UNKNOWN overall → UNKNOWN operational).  
**Not:** P0.1 physical-device bug (PLUGGED_INFERRED is correct).  
**Not:** Episode-history dominance (no open episode).

---

## J. Proposed minimal correction (documentation only — not implemented)

1. **Data repair (preferred):** Create/backfill active `VehicleDataSourceLink` for HMÜ C 215 DIMO binding (org-scoped), then verify `providerLinkState → ACTIVE`, `overallState → STANDBY`, `operationalAvailability → AVAILABLE`.
2. **Policy alternative (narrow code change, future):** Allow `ProviderLinkState.ACTIVE` when `hasHistoricalDimoRecord && hasToken && consent/auth ACTIVE && connectionStatus CONNECTED` even without mapping row — only if product accepts historical-identity path.

Do **not** change P0.2 operational mapping; fix upstream provider-link evidence or data.

---

## K. Final verdict

| Gate | Verdict |
|------|---------|
| HMÜ C 215 current operational state | **INCORRECT** (operator-trust sense) |
| P0.1 execution vs code | **CORRECT** (rules applied as written) |
| Production mutations | **NONE** |
| PR #1277 merge | **HOLD** (unchanged; out of scope) |
