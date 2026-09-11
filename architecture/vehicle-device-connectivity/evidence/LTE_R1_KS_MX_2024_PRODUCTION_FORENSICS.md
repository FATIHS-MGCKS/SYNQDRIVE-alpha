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

## 4. VDC-Q-011 — 24 h threshold analysis (theoretical vs actual evaluation)

Runtime thresholds (unchanged in Phase 2): `standby` < 24 h; `signal_delayed` ≥ 24 h and < 48 h.

### 4a. Potential transient classification windows (theoretical)

If freshness were evaluated continuously, each cycle would cross the 86,400 s boundary before the next strict source advance:

| Cycle | Previous strict source | Threshold crossing (prev + 86,400 s) | Next strict advance | Potential window (s) |
|-------|------------------------|----------------------------------------|---------------------|----------------------|
| C1 | 2026-09-08T05:02:15Z | 2026-09-09T05:02:15Z | 2026-09-09T05:04:58Z | **163** |
| C2 | 2026-09-09T05:04:58Z | 2026-09-10T05:04:58Z | 2026-09-10T05:07:59Z | **181** |
| C3 | 2026-09-10T05:07:59Z | 2026-09-11T05:07:59Z | 2026-09-11T05:10:42Z | **163** |

These are **potential transient classification windows**, not demonstrated false positives.

### 4b. Actual Production evaluation per cycle

**Method:** Query `dimo_poll_logs` (SNAPSHOT) in `[threshold crossing, next strict advance)`, plus `notifications` / `notification_occurrences` for `TELEMETRY_SOFT_OFFLINE` and `TELEMETRY_OFFLINE`. Alert sync runs only via `VehicleConnectivityRuntimeProjectionService.projectForVehicle()` (demand-driven) — **not** on every snapshot poll (`dimo-snapshot.processor` has no `projectForVehicle` call). CODE.

| Cycle | Polls in window | SUCCESS / FAILURE | Alerts in window | Classification |
|-------|-----------------|-------------------|------------------|----------------|
| C1 | **0** | — | **0** | **THEORETICAL_WINDOW_ONLY** |
| C2 | **0** | — | **0** | **THEORETICAL_WINDOW_ONLY** |
| C3 | **0** | — | **0** | **THEORETICAL_WINDOW_ONLY** |

**Expanded context (±10 min):** Nearest polls were ~5 min **before** threshold crossing (source still `< 24 h` → `standby`). No poll occurred inside the 163–181 s windows because scheduled SNAPSHOT cadence (~5.5 min) exceeds window duration. C2 had a poll at `2026-09-10T05:06:51Z` (inside expanded range, before advance) that would imply `signal_delayed` **if** `syncRuntimeAlerts` had run — but **no** `TELEMETRY_SOFT_OFFLINE` notification was persisted in that interval.

**Conclusion:** Sep 8–11 ~24 h cycles produced **no observed `signal_delayed` alert false positives**. Windows are real classification-risk intervals under continuous evaluation, but Production did not persist or emit soft-offline alerts during them.

**Historical note:** `TELEMETRY_SOFT_OFFLINE` on 2026-08-27 (resolved same day) predates the Sep stationary cycles and is **not** attributed to these windows without further correlation.

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
| Historical CH duplicate `recorded_at` rows | Max 11,293 rows at one timestamp (Jun–Jul 2026) | **CONFIRMED** duplicates exist; causal link to VDC-CX-010 **UNKNOWN** (VDC-Q-012) |
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

### Timestamp semantics (CODE — verified against Production schema)

| Field | Table | Meaning |
|-------|-------|---------|
| `observedAt` | inbox + canonical | Provider-reported event instant from webhook payload |
| `receivedAt` | inbox | SynqDrive HTTP intake instant (`new Date()` in `device-connection-webhook-inbox.service`) |
| `processedAt` | inbox | Inbox row processing completion |
| `receivedAt` | canonical | SynqDrive canonicalization instant when `persistDeviceConnectionEvent` runs (`new Date()` — **not** copied from inbox) |
| `processedAt` | canonical | Episode lifecycle completion after persist |
| `openedAt` | episode | Episode open instant (aligned to canonical `observedAt` for webhook-opened episodes) |

### Aug 2025 sequence (reconstructed)

| Step | Timestamp UTC | Metric |
|------|---------------|--------|
| Provider `observedAt` | 2026-08-25T20:41:54.000Z | Provider event time |
| Inbox `receivedAt` | 2026-08-25T20:41:58.738Z | **PROVIDER_DELIVERY_LATENCY = +4.7 s** |
| Inbox `createdAt` | 2026-08-25T20:41:58.742Z | Row persisted |
| Inbox `lastErrorCode` | `enqueue_failed` | Initial processing failure (PRODUCTION_OBSERVATION) |
| Inbox `processedAt` | 2026-08-25T22:22:30.067Z | **INBOX_PROCESSING_DELAY = +6,031 s (~100.5 min)** from inbox receipt |
| Canonical `receivedAt` | 2026-08-25T22:22:30.039Z | **SYNQDRIVE_CANONICALIZATION_DELAY = +6,031 s** from inbox receipt |
| Canonical `processedAt` | 2026-08-25T22:22:30.047Z | Lifecycle complete (+8 ms) |
| Episode `openedAt` | 2026-08-25T20:41:54.000Z | Uses provider `observedAt` |
| Episode `resolvedAt` | 2026-08-26T11:58:27.000Z | `SNAPSHOT_PLUG_SIGNAL` |

Duplicate unplug at `20:42:02Z` shares the same canonicalization delay pattern (+6,028 s inbox → canonical).

**Root cause:** **Partially evidenced, not fully proven.** Inbox rows show `lastErrorCode: enqueue_failed` with `processingAttempts: 1`, then successful `processedAt` at 22:22:30Z — consistent with scheduler retry after enqueue failure (supporting repo note: natural scheduler retry processed stuck inbox rows at 22:22:30Z). Worker unavailability, deployment timing, or other factors **not independently proven** from retained logs in this audit. See **VDC-Q-013**.

Fast provider delivery (~4 s) did **not** imply fast SynqDrive disconnect detection (~100 min to canonical event).

### Recovery layer separation (Aug 2026 — epistemic precision)

| Stage | Evidence class | Notes |
|-------|----------------|-------|
| Provider unplug signal | **OBSERVED** | Webhook `observedAt` 2026-08-25T20:41:54Z |
| Episode open | **OBSERVED** | `openedAt` aligned to provider `observedAt` |
| Snapshot plug signal | **OBSERVED** | `SNAPSHOT_PLUG_SIGNAL` at 2026-08-26T11:58:27Z; `obdIsPluggedIn=true` in snapshot path |
| Physical replug | **INFERRED** | Likely device reinserted/present again — **not** human-observed in this incident |
| Strict source advance after recovery | **INFERRED** | Subsequent telemetry resumed; exact first strict-advance instant not reconstructed here |
| Full connectivity healthy at audit | **OBSERVED** (2026-09-11) | Current state only — **not** the historical recovery instant |

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
| `providerLinkState` | **UNKNOWN** | vs DIMO `connectionStatus` CONNECTED — **VDC-CX-011** |

**Observed combination:** CONNECTED + successful poll + stale source + plugged + standby + `providerLinkState: UNKNOWN` — healthy sleeping LTE_R1 signature with provider-link projection contradiction.

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

1. **Do not change thresholds in Phase 2** — document 163–181 s **potential** classification windows; verify alert emission under continuous evaluation in Phase 3 (VDC-Q-011).
2. **GT-R1-UNPLUG-001** — execute controlled physical test when authorized.
3. **VDC-CX-010** — design equality short-circuit (metadata-only path) before promotion to `AUTHORITY_ACTIVE`.
4. **CH duplicate `recorded_at`** — investigate multi-replica mirror idempotency (VDC-Q-010).
5. **HM runtime** — out of LTE_R1 scope; remains VDC-GAP-009.
6. **Secondary control** — capture next long-stationary LTE_R1 in fleet or use GT test vehicle.
