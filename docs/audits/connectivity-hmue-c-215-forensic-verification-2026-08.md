# HMÜ C 215 — Connectivity Forensic Verification (August 2026)

| Field | Value |
|-------|-------|
| **Audit ID** | `connectivity-hmue-c-215-forensic-verification-2026-08` |
| **Mode** | Production read-only forensic verification |
| **Production modified** | **No** |
| **Deployed SHA (context)** | `2022e586` with cutover `2026-08-25T07:48:30.000Z` |
| **Investigation time (UTC)** | `2026-08-25T08:34Z` |

---

## A. Executive Summary

**HMÜ C 215** (`8c850ff1-4201-432b-af2e-2711dbc7ca48`, DIMO token `187784`) is confirmed as a real historical Production reference case for **P0.1 evidence ordering**, not for post-cutover webhook pipeline proof.

**Key findings:**

1. **Canonical July 20 unplug** persisted (`5389a9c7…`) with `processed_at = NULL`, **no episode**, **no inbox** — historical lifecycle incomplete.
2. **Additional pre-cutover inbox unplug signals** (July 28, Aug 8) remain stuck `RECEIVED` / `attempts=0` — historical `UNCLAIMED_PROCESSING_GAP`.
3. **Telemetry/trip evidence shows recovery after unplug** — first trip **+15 minutes** after July 20 unplug; **176 trips** since; current snapshot `obdIsPluggedIn=1` (2026-08-24T20:30:48Z).
4. **Current P0.1 runtime projection is correct:** `physicalDeviceState=PLUGGED_INFERRED`, `overallState=UNKNOWN` (not `DEVICE_UNPLUGGED`), reason codes include `DEVICE_RECONNECTED_SNAPSHOT`.
5. **7-day API event window hides** the July 20 unplug from live device-connection endpoints — important P0.2/UI lineage note.
6. **Legacy read-model with full history** would still compute `openUnpluggedEpisode=true` (no persisted episode to close) even though snapshot anchor is plugged — canonical runtime does **not** emit unplugged.

**Verdict:** HMÜ C 215 supports **P0.1 PASS** for snapshot-recovery precedence. Does **not** upgrade Production Processing Gate (no post-cutover lifecycle observed).

---

## B. Vehicle Identity

| Field | Value |
|-------|-------|
| Vehicle ID | `8c850ff1-4201-432b-af2e-2711dbc7ca48` |
| Organization ID | `faa710c9-6d91-4079-a7d5-91fdccdec14a` |
| License plate | **HMÜ C 215** |
| VIN | `WVW***` (redacted) |
| Make / model / year | Volkswagen Arteon 2020 |
| Hardware | `LTE_R1` (physical OBD applicable) |
| DIMO vehicle ID | `623a3934-d75a-4b23-9830-ae970f49d55a` |
| DIMO token ID | `187784` |
| DIMO external ID | `187784` |
| Connection status | `CONNECTED` |
| Fleet status | `AVAILABLE` |
| Home station | HMÜ Filiale |
| Vehicle data source links (DIMO) | **0 rows** |

---

## C. Historical Unplug Evidence

### Canonical event (authoritative persisted row)

| Field | Value |
|-------|-------|
| Event ID | `5389a9c7-33c3-4f50-ba07-0338da4841d6` |
| Type | `OBD_DEVICE_UNPLUGGED` |
| observedAt | **2026-07-20T11:05:00.000Z** |
| receivedAt | 2026-07-20T11:05:03.768Z |
| processedAt | **NULL** |
| tokenId | 187784 |
| Inbox row | **none** |
| Episode | **none** |
| Lifecycle audits | **0** |

### Additional inbox-only unplug signals (same vehicle/token)

| inbox id | observedAt | receivedAt | status | attempts | domain_event_id |
|----------|------------|------------|--------|----------|-----------------|
| `da2601ce-904e-4087-a1c3-916a0b51d96b` | 2026-07-28T07:56:47Z | 2026-07-28T07:56:52Z | RECEIVED | 0 | null |
| `c19d5eed-e627-41fa-b9c8-4f7a69d0e22c` | 2026-08-08T06:59:18Z | 2026-08-08T06:59:20Z | RECEIVED | 0 | null |

**Most recent canonical unplug:** July 20 (inbox rows never became canonical events).

---

## D. Pre-Unplug Telemetry

| Evidence | Timestamp (UTC) | Notes |
|----------|-----------------|-------|
| Last trip before unplug (end) | 2026-07-20T08:36:55Z | Active reporting same day |
| Unplug observedAt (**T1**) | 2026-07-20T11:05:00Z | Canonical event |
| **T1 − last trip end** | **~2h 28m** | Device was operational earlier same day |
| Postgres `dimo_poll_logs` | Earliest **2026-07-26T03:30:06Z** | No poll log history before July 26 for this vehicle |
| ClickHouse `telemetry_snapshots` | Query unavailable (env sourcing error on VPS) | Not used for T0 |

**T0 (best available):** last operational trip window ending **2026-07-20T08:36:55Z** — establishes device was actively reporting trips before the unplug window.

---

## E. Post-Unplug Snapshot Recovery

| Evidence | Timestamp (UTC) | Notes |
|----------|-----------------|-------|
| First trip after unplug (**T2 proxy**) | **2026-07-20T11:20:08Z** | **+15m 8s** after T1 |
| Trips after July 20 unplug | **176** total | Sustained operational use |
| First postgres poll log | 2026-07-26T03:30:06Z | +5d 16h after T1 (poll retention gap) |
| Current `VehicleLatestState.lastSeenAt` | **2026-08-24T20:30:48Z** | Fresh (<48h at investigation) |
| Current `obdIsPluggedIn` | **1** (true) | Snapshot anchor plugged |
| DIMO `last_signal` | 2026-08-23T20:26:14Z | Provider link active |

**Recovery delay (T2 − T1):** **~15 minutes** (trip-based proxy).  
**Recovery class:** **immediate** (operational telemetry resumed within minutes).

---

## F. Device/Binding Continuity

| Check | Result |
|-------|--------|
| tokenId across all events/inbox | **187784** (unchanged) |
| DIMO connection status | CONNECTED |
| providerBindingId on latest snapshot | null (not populated) |
| Data source link rows | none |

**Classification:** **SAME_DEVICE_RECOVERY** — same DIMO token/vehicle identity; no evidence of replacement or binding change.

---

## G. Full Evidence Timeline

| Marker | UTC timestamp | Event |
|--------|---------------|-------|
| **T0** | 2026-07-20T08:36:55Z | Last pre-unplug trip ends |
| **T1** | 2026-07-20T11:05:00Z | `OBD_DEVICE_UNPLUGGED` observed (canonical) |
| T1a | 2026-07-20T11:05:03.768Z | Canonical event received/persisted |
| T1b | — | **No inbox row** for July 20 event |
| T1c | — | **No episode OPEN** attempted/succeeded |
| **T2** | 2026-07-20T11:20:08Z | First post-unplug trip (recovery proxy) |
| T3 | 2026-07-20 → 2026-08-23 | 176 trips; sustained telemetry |
| T4 | 2026-08-24T20:30:48Z | Latest snapshot (`obdIsPluggedIn=1`) |
| — | 2026-07-28T07:56:52Z | Inbox unplug #2 RECEIVED (stuck) |
| — | 2026-08-08T06:59:20Z | Inbox unplug #3 RECEIVED (stuck) |
| **NOW** | 2026-08-25T08:34Z | Runtime: `PLUGGED_INFERRED`, not unplugged |

Local (CEST): T1 ≈ 13:05 CEST, T2 ≈ 13:20 CEST on 2026-07-20.

---

## H. Historical Processing Result

| Stage | July 20 canonical | July 28 / Aug 8 inbox |
|-------|-------------------|------------------------|
| Webhook persisted | **YES** (canonical only) | **YES** (inbox) |
| Inbox processing | **N/A** (no inbox) | **STUCK** (RECEIVED, attempts=0) |
| Canonical event | **YES** | **NO** (never linked) |
| processedAt | **NULL** | N/A |
| Episode created | **NO** | **NO** |
| Episode resolved | N/A | N/A |
| Lifecycle audit | **absent** | **absent** |
| BullMQ processing | **not provable** | **not provable** (no jobs retained) |

### Classification

| Event | Category |
|-------|----------|
| July 20 canonical | **INITIAL_LIFECYCLE_FAILURE** + **IDEMPOTENCY_RETRY_DEFECT** (retry could not complete once row existed) |
| July 28 / Aug 8 inbox | **UNCLAIMED_PROCESSING_GAP** |
| All | **HISTORICAL_ONLY** relative to cutover `2026-08-25T07:48:30.000Z` |

**Why initial processing failed:** unproven root cause (episode sync exception, worker gap, etc.).  
**Why self-repair failed:** no episode row to reconcile; inbox rows never claimed; pre-cutover policy now blocks automatic materialization.

---

## I. Episode Lifecycle Result

- **OPEN episodes:** 0 (historical and current)
- **No episode was ever created** for HMÜ C 215 unplug evidence
- Therefore: no resolution path executed; snapshot recovery service had no episode to resolve
- This is the expected gap for **HISTORICAL_ONLY** events excluded from automatic backfill

---

## J. Current P0.1 Runtime Projection

Executed read-only via `forensic-vehicle-connectivity-readonly.ts` against Production DB + `VehicleConnectivityRuntimeStateBuilder` (2026-08-25T08:34:22Z).

| Field | Value |
|-------|-------|
| **physicalDeviceState** | `PLUGGED_INFERRED` |
| **telemetryState** | `standby` |
| **overallState** | `UNKNOWN` |
| **providerLinkState** | `UNKNOWN` |
| **dataCoverageState** | `GOOD` |
| **attentionState** | `NONE` |
| **reasonCodes** | `TELEMETRY_STANDBY`, `DEVICE_RECONNECTED_SNAPSHOT` |
| **recommendedAction** | `WAIT_FOR_TELEMETRY` |
| **activeEpisodeId** | null |
| **lastTelemetryAt** | 2026-08-24T20:30:48Z |
| **lastObdPlugObservedAt** | 2026-08-24T20:30:48Z |
| **openUnpluggedEpisode (evidence)** | false |
| **DEVICE_UNPLUGGED emitted?** | **NO** |

### Read-model comparison (same evidence)

| Window | openUnpluggedEpisode | currentDeviceConnectionStatus |
|--------|----------------------|-------------------------------|
| All-time events | **true** | plugged (snapshot anchor wins) |
| 7-day API window | **false** | plugged |

---

## K. 48h Staleness Analysis

| Metric | Value |
|--------|-------|
| Investigation time | 2026-08-25T08:34Z |
| Latest snapshot | 2026-08-24T20:30:48Z |
| **Snapshot age** | **~12 hours** (< 48h threshold) |

**Case classification:** **A** — unplug → snapshots resumed → snapshots still current (within 48h).

**Expected:** `PLUGGED_INFERRED` or connected equivalent — **observed: PLUGGED_INFERRED ✓**  
**Not expected:** `UNPLUGGED_CONFIRMED` or `DEVICE_UNPLUGGED` — **not observed ✓**

If snapshot ages beyond 48h without new evidence, canonical model should degrade to `UNKNOWN` + `DEVICE_CHECK_REQUIRED` — not tested live at investigation time.

---

## L. Interruption Knowledge

Canonical runtime does not expose a separate `interruptionKnowledge` dimension on `VehicleConnectivityRuntimeState`; fleet DTO may derive `interruptionKnowledge` from episode + runtime evidence.

For HMÜ C 215:

- No active episode → not `active`
- Historical unplug exists but **not in 7d API window** → live surfaces likely `known_none` or `unknown`
- Canonical runtime: `activeEpisodeId=null`, `openUnpluggedEpisode=false` in evidence
- **Appropriate:** do not claim strong `KNOWN_NONE` from incomplete historical lifecycle; **UNKNOWN** overall state is consistent

---

## M. Current UI Representation (read-only inference from API contracts)

| Surface | Expected current output | Source |
|---------|-------------------------|--------|
| **Fleet list — Availability** | `AVAILABLE` | `vehicles.status` |
| **Fleet list — Health** | Not stored on vehicle row; health module separate | Health aggregation |
| **Fleet → Connectivity** | Standby/unknown connection; **not unplugged** | `VehicleConnectivityRuntimeState` + legacy mapper |
| **Vehicle Detail — OBD** | Plugged/inferred (snapshot); **no open episode** | `getDeviceConnection` (7d events) + runtime |
| **Vehicle Detail — interruption** | Likely none (no episode in window) | Episode query + 7d filter |

**Note:** Live browser verification not performed (auth required). Inference from production DB + canonical projection script.

---

## N. UI vs Canonical Truth Matrix

| Dimension | Canonical truth | Likely UI (7d window) | Discrepancy? |
|-----------|-----------------|----------------------|--------------|
| Physical device | PLUGGED_INFERRED | Plugged / connected | **No** |
| Overall connectivity | UNKNOWN (standby) | Standby / offline-ish label | Minor labeling |
| Open unplug episode | false (runtime) | false (7d API) | **No** |
| Historical unplug visible | exists in DB | hidden (>7d) | **Window gap** (P0.2) |
| Read-model all-history | openUnpluggedEpisode=true | not exposed directly | Internal inconsistency |

---

## O. Current UI Data Sources

| Surface | Backend source |
|---------|----------------|
| Availability badge | `vehicles.status` (+ operational state builder) |
| Health badge | Health modules (tires/brakes/errors aggregation) |
| Fleet → Connectivity | `VehicleConnectivityRuntimeProjectionService.projectForVehicles` |
| Vehicle Detail OBD card | `getDeviceConnection` → `DeviceConnectionQueryService` (**7d event filter**) |
| Connectivity runtime DTO | `serializeVehicleConnectivityRuntimeState(runtime)` |
| Legacy connection status | `projectLegacyFleetConnectivityFields(runtime)` |

**Key P0.2 finding:** Device connection query uses **7-day `observedAt` filter** — historical July unplug invisible to Vehicle Detail device-connection API despite DB persistence.

---

## P. P0.2 Implications

1. UI surfaces using **7d event window** will not show HMÜ C 215 historical unplug — by design today, but confusing for forensic cases.
2. **Canonical runtime** correctly prioritizes fresh snapshot over stale webhook — P0.2 should align UI badges with runtime, not raw last webhook.
3. **No episode row** means interruption UI has nothing to show even though canonical event exists — historical gap remains visible only in audits.
4. Fleet connectivity KPI `deviceUnpluggedOpenEpisodes` should be **0** for this vehicle (runtime evidence).

---

## Q. Production Processing Gate Implications

| Can prove | Cannot prove |
|-----------|--------------|
| P0.1 snapshot > stale webhook | Post-cutover webhook enqueue |
| Historical orphan exclusion | New episode OPEN |
| Pre-cutover inbox not auto-replayed | BullMQ consumption live |
| Runtime not emitting DEVICE_UNPLUGGED | Episode RESOLVE live |

**Cutover comparison:**

| | Timestamp |
|---|-----------|
| July 20 event `receivedAt` | 2026-07-20T11:05:03.768Z |
| `CONNECTIVITY_LIFECYCLE_RECONCILE_AFTER` | 2026-08-25T07:48:30.000Z |
| **Delta** | **~36 days pre-cutover** |

Gate remains **CONDITIONAL** — this case is intentionally **out of scope** for post-cutover pipeline proof.

---

## R. Final Verdict

```
HMÜ C 215 P0.1 FORENSIC VERIFICATION: PASS

PRODUCTION PROCESSING GATE: CONDITIONAL
P0.2 READY: NO-GO
```

**PASS rationale:** Canonical runtime respects newer snapshot evidence; does not emit `DEVICE_UNPLUGGED`; physical state `PLUGGED_INFERRED` with `DEVICE_RECONNECTED_SNAPSHOT`; 48h staleness test not triggered (snapshot fresh).

**Production mutations performed:** **NONE**

---

## Appendix — Investigation tooling

Read-only script (not deployed to production release permanently):

`backend/scripts/ops/forensic-vehicle-connectivity-readonly.ts`
