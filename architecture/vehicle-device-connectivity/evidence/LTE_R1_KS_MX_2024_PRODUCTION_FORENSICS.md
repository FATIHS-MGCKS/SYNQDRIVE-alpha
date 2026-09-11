# LTE_R1 — KS MX 2024 — Production Forensics (Phase 2)

| Field | Value |
|-------|-------|
| **Evidence ID** | VDC-EVID-LTE-R1-PROD-001 |
| **Source type** | `PRODUCTION_OBSERVATION` |
| **Epistemic status** | `CONFIRMED` (identity, timelines, poll ratios); `INFERRED` where noted |
| **Validation status** | `PRODUCTION_VALIDATED` (read-only forensics) |
| **Captured at** | `2026-09-11T23:15:18Z` |
| **Vehicle** | Mercedes-Benz C 63 AMG — **KS MX 2024** |
| **Hardware** | `LTE_R1` |
| **DIMO token ID** | 187336 |
| **Vehicle ID** | `a60c0749-a7cd-494e-b5b9-dea3c6b97d63` |
| **Organization ID** | `faa710c9-6d91-4079-a7d5-91fdccdec14a` |
| **Mutations** | **None** |

## 1. Vehicle identity (verified)

| Field | Production value | Classification |
|-------|------------------|----------------|
| License plate | KS MX 2024 | PRODUCTION_OBSERVATION |
| `hardwareType` | LTE_R1 | PRODUCTION_OBSERVATION |
| DIMO `tokenId` | 187336 | PRODUCTION_OBSERVATION |
| `connectionStatus` | CONNECTED | PRODUCTION_OBSERVATION |
| `dimoVehicle.lastSignal` | 2026-09-11T05:10:42.000Z | PRODUCTION_OBSERVATION |
| Active DIMO data source link | `e2bd6a49-f1fc-4d4f-bd60-e958b15d8142` (active) | PRODUCTION_OBSERVATION |
| VLS `sourceTimestamp` | 2026-09-11T05:10:42.000Z | PRODUCTION_OBSERVATION |
| VLS `providerFetchedAt` | 2026-09-11T23:13:16.901Z | PRODUCTION_OBSERVATION |
| VLS `obdIsPluggedIn` | 1 (plugged) | PRODUCTION_OBSERVATION |
| Fleet status | AVAILABLE | PRODUCTION_OBSERVATION |

## 2. Last trip → standby timeline

| Event | UTC | Europe/Berlin | Classification |
|-------|-----|---------------|----------------|
| Last completed trip start | 2026-09-08T04:51:36.000Z | 2026-09-08 06:51:36 | PRODUCTION_OBSERVATION |
| Last completed trip end (ignition-off proxy) | 2026-09-08T05:02:15.000Z | 2026-09-08 07:02:15 | PRODUCTION_OBSERVATION |
| Last driving `sourceTimestamp` (CH deduped) | 2026-09-08T05:02:15.000Z | 2026-09-08 07:02:15 | PRODUCTION_OBSERVATION |
| Stationary window start | 2026-09-08T05:02:15.000Z | — | PRODUCTION_OBSERVATION |
| Audit observation age | ~18 h since last strict source | — | PRODUCTION_OBSERVATION |

Prior trip same morning: 04:32–04:47 UTC (9.3 km). No movement trip detected after 2026-09-08 05:02:15 UTC through audit time.

## 3. Strict source-advance timeline (post-trip)

**Rule (VDC-CX-010):** strict advance only when `incoming sourceTimestamp > previous`. Equality is not a new source observation.

Deduplicated from ClickHouse `telemetry_snapshots.recorded_at` (mirrors `signalsLatest.lastSeen` / VLS `sourceTimestamp`).

| # | `sourceTimestamp` UTC | Europe/Berlin | Δ from previous (s) | Δ hh:mm:ss | Δ − 86,400 s |
|---|----------------------|---------------|---------------------|------------|--------------|
| 0 | 2026-09-08T05:02:15.000Z | 07:02:15 | — (trip end) | — | — |
| 1 | 2026-09-09T05:04:58.000Z | 07:04:58 | 86,563 | 24:02:43 | +163 |
| 2 | 2026-09-10T05:07:59.000Z | 07:07:59 | 86,581 | 24:03:01 | +181 |
| 3 | 2026-09-11T05:10:42.000Z | 07:10:42 | 86,563 | 24:02:43 | +163 |

### Jitter statistics (3 post-trip intervals)

| Statistic | Seconds | Notes |
|-----------|---------|-------|
| Sample count | 3 | PRODUCTION_OBSERVATION |
| Minimum | 86,563 | PRODUCTION_OBSERVATION |
| Maximum | 86,581 | PRODUCTION_OBSERVATION |
| Mean | 86,569 | PRODUCTION_OBSERVATION |
| Median | 86,563 | PRODUCTION_OBSERVATION |
| Std dev | ~10.4 | PRODUCTION_OBSERVATION |
| Δ from 21,600 s (6 h) | +64,969 to +64,987 | **Not 6 h periodic** — CONTRADICTED for 6 h hypothesis |
| Δ from 86,400 s (24 h) | +163 to +181 | PRODUCTION_OBSERVATION |

**Wording:** OBSERVED ~24 h strict DIMO source advances. STRONGLY_SUPPORTED periodic standby source behavior. **NOT YET PROVEN:** Ruptela IO174 physical timer wake.

## 4. VDC-Q-011 — 24 h threshold false-positive analysis

Runtime thresholds (unchanged in Phase 2): `standby` < 24 h; `signal_delayed` ≥ 24 h and < 48 h.

For each observed standby cycle, the vehicle remains in `signal_delayed` classification for the interval between crossing 86,400 s and the next strict source advance:

| Cycle end advance | Interval (s) | Transient `signal_delayed` window (s) | Runtime would classify before advance? |
|-------------------|-------------|---------------------------------------|----------------------------------------|
| 2026-09-09T05:04:58Z | 86,563 | **163** | Yes — ≥24 h, <48 h |
| 2026-09-10T05:07:59Z | 86,581 | **181** | Yes |
| 2026-09-11T05:10:42Z | 86,563 | **163** | Yes |

At audit capture (~18 h after 2026-09-11T05:10:42Z), runtime classified `telemetryState: standby` (not yet `signal_delayed`). Poll cadence ~5.5 min does not change source age; it only refreshes `providerFetchedAt`.

**TELEMETRY_SOFT_OFFLINE policy:** Historical notification `TELEMETRY_SOFT_OFFLINE` opened 2026-08-27 (resolved same day) — predates current 3-day stationary window; not attributed to the Sep 8–11 ~24 h cycle without further correlation. **INFERRED** prior incident may relate to older SIM/provider stale episode (Aug 2026 architecture notes).

## 5. Poll success vs strict source advance (VDC-HYP-003)

Stationary window: 2026-09-08T05:02:15Z → audit (~3.75 days).

| Metric | Value | Classification |
|--------|-------|----------------|
| Scheduled SNAPSHOT polls | 1,030 | PRODUCTION_OBSERVATION |
| SUCCESS | 1,030 | PRODUCTION_OBSERVATION |
| FAILURE | 0 | PRODUCTION_OBSERVATION |
| Strict source advances (post-trip) | 3 | PRODUCTION_OBSERVATION |
| SUCCESS : strict advance ratio | **1030 : 3** (~343:1) | PRODUCTION_OBSERVATION |
| Equal-`sourceTimestamp` full upserts (estimate) | ~1,027 | INFERRED (SUCCESS − strict advances) |
| CH unique `recorded_at` post-trip | 4 | PRODUCTION_OBSERVATION |
| `providerFetchedAt` advances | Every poll (~2 min age at audit) | PRODUCTION_OBSERVATION |

**Conclusion:** Poll success ≠ provider source advance — **CONFIRMED**.

## 6. VDC-CX-010 Production impact

| Finding | Evidence | Impact class |
|---------|----------|--------------|
| Equality upserts occur at high frequency during standby | ~1,027 SUCCESS polls vs 3 strict advances | **MATERIAL** |
| Full VLS upsert path executes on equality (code) | Phase 1 repo audit | CODE |
| CH ingest dedupes equal `recorded_at` per vehicle | Post-trip: 1 row per distinct source timestamp | PRODUCTION_OBSERVATION |
| Historical CH duplicate `recorded_at` rows | Max 11,293 rows at one timestamp (Jun–Jul 2026) | **MATERIAL** — multi-replica / replay |
| Downstream episode/trip on equality | No new episodes in Sep 8–11 window; trip FSM resting | PRODUCTION_OBSERVATION |
| Runtime at audit | `providerReachable: true`, `observationAgeMs` ~18 h, `providerFetchAgeMs` ~2 min | PRODUCTION_OBSERVATION |

**Classification:** **MATERIAL** for observability/storage churn; **LOW** for incorrect trip/episode opens in current stationary window.

## 7. Per-signal timestamp heterogeneity (VDC-HYP-004)

Latest VLS `rawPayloadJson` per-signal `.timestamp` at audit:

| Signal group | Timestamp UTC | Advances on standby wake? |
|--------------|---------------|---------------------------|
| speed, isIgnitionOn, obdEngineLoad, obdIsPluggedIn, currentLocationCoordinates, lowVoltageBatteryCurrentVoltage | 2026-09-11T05:10:42Z | Yes (latest wake) |
| powertrainType, powertrainTransmissionTravelledDistance (odometer) | 2026-09-09T05:04:58Z | Partial wake Sep 9 only |
| powertrainCombustionEngineECT, fuel absolute/relative | 2026-09-08T05:02:15Z | **Stale since trip end** |

Historical per-wake raw payload archive: **not retained** in Postgres beyond latest VLS row. Per-wake signal analysis limited to CH scalar mirrors + latest payload.

**Conclusion:** **CONFIRMED** — signal groups do not advance in lockstep.

## 8. IO174 / Ruptela raw visibility (VDC-HYP-002)

Searched latest VLS payload + device connection event payloads for: IO174, 174, sleep timer, wakeup, Ruptela, 0x10, keepalive, heartbeat.

| Classification | Result |
|----------------|--------|
| **IO174_NOT_EXPOSED_BY_CURRENT_INGEST** | No matches in SynqDrive DIMO `signalsLatest` path |

Does not prove IO174 absent on physical device.

## 9. Heartbeat / periodic device signal

No separate Ruptela heartbeat, 0x10, or keepalive event surface observed in Production persistence for this vehicle. The ~24 h `sourceTimestamp` advance is **not** equated to a Ruptela protocol heartbeat without device-level evidence.

## 10. Unplug / plug webhook evidence

### Historical events (all time)

| Type | observed_at UTC | received_at (inbox) | received_at (canonical event) | Episode |
|------|-----------------|---------------------|-------------------------------|---------|
| OBD_DEVICE_UNPLUGGED | 2026-08-25T20:41:54Z | 2026-08-25T20:41:58Z (+4 s) | 2026-08-25T22:22:30Z (+6036 s) | Opened |
| OBD_DEVICE_UNPLUGGED | 2026-08-25T20:42:02Z | 2026-08-25T20:42:06Z (+4 s) | 2026-08-25T22:22:30Z (+6028 s) | Duplicate bucket |

**Episode:** OPENED 2026-08-25T20:41:54Z → RESOLVED 2026-08-26T11:58:27Z via `SNAPSHOT_PLUG_SIGNAL` (no `OBD_DEVICE_PLUGGED_IN` webhook in canonical events).

### Recovery layer separation (Aug 2026 sequence)

| Stage | Timestamp | Layer |
|-------|-----------|-------|
| PHYSICAL_UNPLUG | 2026-08-25 ~20:41 UTC | INFERRED from webhook |
| Provider webhook (inbox) | +4 s latency | PRODUCTION_OBSERVATION |
| Episode open | 2026-08-25T20:41:54Z | PRODUCTION_OBSERVATION |
| PHYSICAL_REPLUG / plug signal | 2026-08-26T11:58:27Z | SNAPSHOT evidence — not webhook |
| TELEMETRY_RESUMED | After replug (strict source advanced subsequently) | INFERRED |
| FULL_CONNECTIVITY_RECOVERED | CONNECTED + plugged + fresh source at audit | PRODUCTION_OBSERVATION (current) |

No unplug/plug webhooks in Sep 8–11 stationary window.

## 11. VDC-CX-007 cases (Sep 8–11 window)

| Case | Finding |
|------|---------|
| A) `obdIsPluggedIn=false` without unplug episode | **Not observed** — plugged throughout |
| B) Unplug episode without snapshot unplug | **Not observed** in window |
| C) Plug webhook resolves before telemetry | Aug 2026: resolution via snapshot plug signal; **no plug webhook** |
| D) Telemetry resumes without plug webhook | **Observed** Aug 2026 recovery path |

Ground-truth controlled unplug (**GT-R1-UNPLUG-001**) still required for authoritative VDC-CX-007 quantification.

## 12. Provider status vs physical evidence (current)

| Dimension | Value | Combination |
|-----------|-------|-------------|
| DIMO `connectionStatus` | CONNECTED | |
| `providerLinkState` (runtime) | UNKNOWN | Contradictory label vs CONNECTED |
| `providerFetchedAt` | Fresh (~2 min) | Successful poll |
| `sourceTimestamp` | Stale (~18 h) | Standby sleep |
| `obdIsPluggedIn` | 1 | Plugged |
| `telemetryState` | standby | |
| `physicalDeviceState` | PLUGGED_INFERRED | |

**Observed combination:** CONNECTED + successful poll + stale source + plugged + standby — healthy sleeping LTE_R1 signature.

## 13. Alert behavior

| Alert | firstSeen | lastSeen | Status | Correlation |
|-------|-----------|----------|--------|-------------|
| TELEMETRY_SOFT_OFFLINE | 2026-08-27T14:24:11Z | 2026-08-27T19:56:52Z | RESOLVED | Predates Sep standby cycles; likely separate provider-stale incident |

No `TELEMETRY_OFFLINE` or device unplug alerts open at audit time.

## 14. Secondary control case

| Candidate | Result |
|-----------|--------|
| WOB L 7503 (LTE_R1) | **Rejected** — active driving; 130 distinct CH wakes Sep 8–11 |
| KS FH 660E (LTE_R1) | **Rejected** — active Sep 10 trips; dense CH timestamps |
| HMÜ C 215, KS MS 661 | Mixed movement / non-stationary |
| WOB L 9755 | Source frozen since 2026-07-18 — fault-like, not healthy standby |

**No clean secondary LTE_R1 long-standby control** in Production fleet at audit time.

## 15. Connectivity runtime snapshot (audit)

```json
{
  "telemetryState": "standby",
  "physicalDeviceState": "PLUGGED_INFERRED",
  "providerConnectionStatus": "CONNECTED",
  "observationAgeHours": 18,
  "providerFetchAgeMinutes": 2,
  "recommendedAction": "WAIT_FOR_TELEMETRY"
}
```

## 16. Hypothesis results

| ID | Result | Evidence summary |
|----|--------|------------------|
| VDC-HYP-001 | **STRONGLY_SUPPORTED** | 3 intervals ~86,563–86,581 s |
| VDC-HYP-002 | **STRONGLY_SUPPORTED** | IO174 not in ingest payloads |
| VDC-HYP-003 | **CONFIRMED** | 1030:3 poll:advance |
| VDC-HYP-004 | **CONFIRMED** | Fuel/ECT stale; LV/GNSS wake |
| VDC-HYP-005 | **STRONGLY_SUPPORTED** | CONNECTED+plugged+standby 18 h |
| VDC-HYP-006 | **STRONGLY_SUPPORTED** | Provider vs device vs telemetry split |
| VDC-HYP-007 | **STRONGLY_SUPPORTED** | Aug recovery via snapshot, not webhook-only |

## 17. Phase 3 recommendations

1. **Do not change thresholds in Phase 2** — document 163–181 s false `signal_delayed` window per ~24 h cycle (VDC-Q-011).
2. **GT-R1-UNPLUG-001** — execute controlled physical test when authorized.
3. **VDC-CX-010** — design equality short-circuit (metadata-only path) before promotion to `AUTHORITY_ACTIVE`.
4. **CH duplicate `recorded_at`** — investigate multi-replica mirror idempotency (VDC-Q-010).
5. **HM runtime** — out of LTE_R1 scope; remains VDC-GAP-009.
6. **Secondary control** — capture next long-stationary LTE_R1 in fleet or use GT test vehicle.
