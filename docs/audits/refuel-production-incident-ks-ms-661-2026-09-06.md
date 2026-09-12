# Production REFUEL incident — KS MS 661 (2026-09-06)

**Incident date:** 2026-09-06 ~11:38 Europe/Berlin (= ~09:38 UTC)  
**Audit date:** 2026-09-12 (read-only production forensics)  
**Auditor mode:** READ-ONLY — no mutation, replay, synthetic events, deploy, or config changes  
**Epistemic status:** `PRODUCTION_INCIDENT` — user-visible REFUEL absent ~6 days after confirmed physical refuel  
**Audit base main SHA:** `49b07a023e39b5cec71015da749984e9af1b3e05`

## 0. Executive summary

User-confirmed physical refuel at **Esso Ysenburgstraße, Kassel** on **2026-09-06 ~11:38 CEST** is **not visible in SynqDrive UI** as of **2026-09-12** (~6 days).

Forensics prove the loss occurs **before SynqDrive persistence** — at the **DIMO native RefuelDetector** layer:

| Layer | Status |
|-------|--------|
| Physical refuel (ground truth) | CONFIRMED |
| Esso forecourt dwell (route) | CONFIRMED (~31 m) |
| DIMO raw absolute fuel rise | CONFIRMED (7 L → 31 L) |
| DIMO relative fuel signal | **MISSING** (0 samples all day) |
| DIMO native `segments(refuel)` | **0 segments** (still today) |
| SynqDrive `VehicleEnergyEvent` | **NONE** (ever for this vehicle) |
| G2 / enrichment / API / UI | **NOT REACHED** |

**Primary classification:** `LOSS_LAYER = DIMO_NATIVE_REFUEL_DETECTOR`  
**Root cause:** DIMO native RefuelDetector emitted zero REFUEL segments despite a confirmed +24 L absolute fuel rise at the Esso forecourt. Relative fuel telemetry was entirely absent during the relevant period. The exact internal DIMO detector failure mechanism is **not observable from SynqDrive**. Because SynqDrive has no raw-signal REFUEL fallback when native DIMO segments are absent, the physical refuel never entered `VehicleEnergyEvent` persistence.

**Epistemic boundary:** Direct DIMO probe returned **zero** refuel segments both with production `{ minIncreasePercent: 5 }` **and** with default config (no override). Missing relative fuel is **confirmed** but is **not proven** to be the internal RefuelDetector causal mechanism.

**Product severity:** **P1** — not ordinary latency; six-day recovery window exhausted with provider still returning zero segments.

---

## 1. Vehicle identity

| Field | Value |
|-------|-------|
| vehicleId | `c10351f8-b6a2-4258-947f-631aeaa6d359` |
| license_plate | `KS MS 661` |
| VIN | `WAUZZZF48GA096957` |
| make/model | Audi A4 |
| organizationId | `faa710c9-6d91-4079-a7d5-91fdccdec14a` |
| DIMO tokenId | **187361** |

**VEHICLE_IDENTITY_UNAMBIGUOUS = YES** (exactly one production row)

---

## 2. Event-time vs current production runtime

### At refuel instant (~2026-09-06T09:38:00Z)

| Field | Value |
|-------|-------|
| PRODUCTION_RELEASE_AT_EVENT_TIME | `20260905231643_v4994` (deployed 2026-09-05T23:16:43Z — last release before event) |
| PRODUCTION_SHA_AT_EVENT_TIME | `a4377f3a200ca45a97b7ce422caf8d92faddabbe` |
| Replicas | 2 (synqdrive + synqdrive-b) — INFERRED from architecture |
| PHYSICAL_REFUEL_RECONCILIATION_V2_ENABLED | `true` |
| PHYSICAL_REFUEL_RECONCILIATION_V2_CUTOVER_AT | `2026-09-04T18:40:13.000Z` |
| PHYSICAL_REFUEL_RECONCILIATION_RECOVERY_ENABLED | `true` |
| Refuel detector config | `{ minIncreasePercent: 5 }` (`DIMO_PRODUCTION_REFUEL_DETECTOR_CONFIG`) |

### At audit instant (2026-09-12)

| Field | Value |
|-------|-------|
| CURRENT_PRODUCTION_SHA | `f6f5eaa3a9fd9525d10b5d0b8130e7ed42eeaa50` |
| CURRENT_PRODUCTION_RELEASE | `20260911234818_v4994` |
| V2 flags | unchanged enabled |

Multiple deployments occurred between event and audit; **DIMO probe at audit time still returns zero refuel segments** for the event window — later deploys did not repair the missing event.

---

## 3. Forensic windows

| Window | Range |
|--------|-------|
| Ground truth center | `2026-09-06T09:38:00Z` |
| Primary physical | `09:15Z` → `10:15Z` |
| Broad detection | `08:30Z` → `12:00Z` |
| Recovery | `2026-09-06T08:30Z` → `2026-09-07T12:00Z` |
| Six-day persistence | `2026-09-06T00:00Z` → audit now |

---

## 4. PostgreSQL — VehicleEnergyEvent

```sql
SELECT id, kind, start_time, created_at, fuel_delta_liters, dimo_segment_id
FROM vehicle_energy_events
WHERE vehicle_id = 'c10351f8-b6a2-4258-947f-631aeaa6d359'
  AND kind = 'REFUEL'
  AND start_time >= '2026-09-06';
-- 0 rows

SELECT count(*) FROM vehicle_energy_events
WHERE vehicle_id = 'c10351f8-b6a2-4258-947f-631aeaa6d359' AND kind = 'REFUEL';
-- 0 (lifetime)
```

| Metric | Value |
|--------|-------|
| **DB_REFUEL_EVENT_EXISTS** | **NO** |
| **DB_REFUEL_EVENT_ID** | **NONE** |

Fleet-wide REFUEL rows on 2026-09-06: **0**.

**Branch:** UI/API/G2 investigation **not applicable** — event never persisted.

---

## 5. Direct DIMO provider probe (2026-09-12)

Used deployed production query builder `buildEnergyEventSegmentsQuery` + auth path identical to `EnergyEventsService.detectEnergyEvents`.

| Window | HTTP | Refuel segments |
|--------|------|-----------------|
| Primary `08:30`–`12:00` Sep 6 | 200 | **0** |
| Recovery `00:00` Sep 6 – `12:00` Sep 7 | 200 | **0** |
| Six-day `00:00` Sep 6 – now | 200 | **0** |
| Default config (no minIncreasePercent) | 200 | **0** |
| Production config (5%) | 200 | **0** |

| Metric | Value |
|--------|-------|
| **DIMO_NATIVE_REFUEL_SEGMENT_EXISTS** | **NO** |

GraphQL errors: none. Auth: success.

---

## 6. Raw fuel telemetry (DIMO `signals()` API)

Window `2026-09-06T08:00:00Z` → `12:00:00Z`, interval `30s`:

| Metric | Value |
|--------|-------|
| Total buckets | 56 |
| Absolute fuel samples | **56** |
| Relative fuel samples | **0** (entire window) |
| Pre-refuel absolute (plateau) | **7 L** (`09:28:30Z` – `09:35:00Z`) |
| First post-rise sample | **16.4 L** @ `09:39:30Z` |
| Peak absolute | **31 L** @ `09:43:00Z`–`09:47:00Z` |
| Observed absolute rise | **+24 L** (7 → 31) |
| Max fuel signal gap | **~4.5 min** (7 L plateau → 16.4 L) |

Focused window `09:00`–`10:30`: same pattern — absolute rise visible, **relative always NULL**.

| Metric | Value |
|--------|-------|
| **RAW_FUEL_RISE_PRESENT** | **YES** (absolute liters) |
| Relative fuel rise | **NOT AVAILABLE** (signal absent) |

**CASE A applies:** raw fuel rise YES + DIMO native refuel NO → **`DIMO_NATIVE_REFUEL_DETECTOR_MISS`**. Relative fuel channel absent (**confirmed**). **`EXACT_DIMO_INTERNAL_FAILURE_MECHANISM = UNKNOWN`** — relative-channel absence is correlated context, not a proven internal RefuelDetector cause.

---

## 7. Route / Esso forecourt corroboration

Trip `77f5f1cc-f79d-4e14-af03-4cd1219c8d04` started **`2026-09-06T09:38:51Z`** (aligns with user 11:38 CEST).

**Stationary dwell at pump coordinates:**

| Time (UTC) | Lat | Lon | Speed |
|------------|-----|-----|-------|
| 09:38:51 – 09:39:05 | 51.32125 | 9.5142366 | 0 (stationary) |

**OSM match:**

| Station | Distance to dwell |
|---------|-------------------|
| Esso Station Kassel Ysenburgstraße | **~31 m** |

| Metric | Value |
|--------|-------|
| **ESSO_FORECOURT_DWELL_CONFIRMED** | **YES** |

Fuel rise continued during departure (09:39:30+), consistent with refuel-then-drive-off.

---

## 8. Six-day recovery audit

Between event and audit (~6 days):

| Mechanism | Ran? | Outcome for KS MS 661 |
|-----------|------|------------------------|
| Fast repair (15 min) | INFERRED | No vehicle-scoped proof; DIMO still 0 segments |
| Warm reconciliation (4 h) | INFERRED | Multiple cycles; cannot create event without provider segment |
| G2 Physical Refuel V2 recovery | N/A | No reconciliation row possible without `VehicleEnergyEvent` |
| Direct DIMO re-fetch today | **YES** | Still **0** refuel segments |

| Metric | Value |
|--------|-------|
| ENERGY_EVENT_RECOVERY_OPPORTUNITIES | Many scheduled passes (fast + warm × 6 days) |
| **RECOVERY_EVENTUALLY_DETECTED_REFUEL** | **NO** |

G2 reconciliation recovery **cannot** backfill an event that was never ingested.

---

## 9. Event-time logs

Searched PM2 logs (`synqdrive-out*`, `synqdrive-b-out*`) for `c10351f8` / `187361` on 2026-09-06: **no retained matches** (likely rotated). Cannot prove per-vehicle detector execution from logs.

`dimo_poll_logs` at event time: SNAPSHOT + TRIP_TRACKING **SUCCESS** every ~60s — transport healthy.

No `Energy-event detection failed` or `DIMO energy-event fetch failed` entries found for token 187361 in retained logs. Absence of error ≠ successful segment ingestion.

---

## 10. API / UI path (downstream — not reached)

Because **DB_REFUEL_EVENT_EXISTS = NO**:

| Check | Result |
|-------|--------|
| API_REFUEL_EVENT_EXISTS | **NO** (backend `listEnergyEvents` / `buildTripsTimeline` read same PG table) |
| Authenticated live API curl | Not executed (no audit credentials in scope); DB is canonical API source |
| UI suppression | **NOT APPLICABLE** — `useVehicleTrips` renders all timeline energy events from API; no enrichment-required filter in hook |
| UI_REFUEL_EVENT_EXPECTED | **YES** (product expectation) |
| UI_REFUEL_EVENT_VISIBLE | **NO** (correct given empty pipeline) |

**Not** a UI/API projection defect — event absent at source.

---

## 11. Physical Refuel V2 / enrichment / BullMQ

Not applicable — no `VehicleEnergyEvent`, no reconciliation row, no BullMQ enrichment job.

| Field | Value |
|-------|-------|
| V2_OWNERSHIP | NOT_APPLICABLE |
| RECONCILIATION_EXISTS | NO |
| G2_STUCK_AFTER_SIX_DAYS | NOT_APPLICABLE |
| BULLMQ_JOB_EXISTS | NOT_APPLICABLE |
| ENRICHMENT_ROW_EXISTS | NO |

---

## 12. Architecture chain analysis

SynqDrive EED ingestion path (event-time and current code):

```
detectEnergyEvents
  → fetchEnergyEventSegments(tokenId, window, refuel, { minIncreasePercent: 5 })
  → GraphQL segments(mechanism: refuel)
  → isSegmentPersistable (fuelDeltaLiters > 1.0)
  → upsert VehicleEnergyEvent
  → (V2) PhysicalRefuelReconciliationRuntime
```

**No code path** converts raw `signals()` absolute fuel rise into `VehicleEnergyEvent` when DIMO native segment is absent.

**Deepest layer where evidence exists:** DIMO raw absolute fuel telemetry (rise confirmed).  
**Deepest layer where product event should exist but does not:** DIMO native refuel segment.

---

## 13. Severity decision

| Scenario | Applies? |
|----------|----------|
| A — No provider evidence | **NO** — absolute fuel rise + forecourt dwell confirmed |
| B — Provider segment existed, SynqDrive absent | **NO** — provider segment never existed |
| C — DB exists, API absent | **NO** |
| D — API exists, UI absent | **NO** |
| E — G2 stuck six days | **NO** — never entered G2 |

**Primary:** P1 production REFUEL capability failure — real refuel invisible after 6 days despite corroborated telemetry.

| Metric | Value |
|--------|-------|
| SYNQDRIVE_PRODUCT_SEVERITY | **P1** |
| PRODUCTION_REFUEL_FEATURE_READY | **NO** |
| KNOWN_P0_BLOCKERS | 0 |
| KNOWN_P1_BLOCKERS | 1 |

---

## 14. Technical cause vs product defect

| Classification | Description |
|----------------|-------------|
| **TECHNICAL_PROVIDER_FAILURE** | DIMO native REFUEL segment missing despite raw absolute fuel evidence (+24 L at Esso forecourt dwell). |
| **SYNQDRIVE_ARCHITECTURE_GAP** | No independent raw-fuel fallback exists when native DIMO `segments(refuel)` is absent. |
| **PRODUCT_IMPACT** | Real refuel invisible for ~6 days; API/UI/G2/BullMQ never reached. |

**P1** is a SynqDrive **product readiness** classification even though the first missing canonical event belongs to the DIMO provider layer.

| Epistemic claim | Status |
|-----------------|--------|
| Physical refuel occurred | **CONFIRMED** |
| Absolute fuel 7 L → 31 L (+24 L) | **CONFIRMED** |
| Relative fuel absent (0 samples) | **CONFIRMED** |
| DIMO native refuel segments = 0 | **CONFIRMED** (incl. default-config probe) |
| SynqDrive raw-signal REFUEL fallback | **ABSENT** (confirmed in code) |
| Exact DIMO internal RefuelDetector failure mechanism | **UNKNOWN** |

---

## 15. Required final classification

| Field | Value |
|-------|-------|
| **LOSS_LAYER** | **DIMO_NATIVE_REFUEL_DETECTOR** |
| **ROOT_CAUSE** | DIMO native RefuelDetector emitted zero REFUEL segments despite +24 L absolute fuel rise at Esso forecourt. Relative fuel absent. Exact internal DIMO mechanism not observable. SynqDrive has no raw-signal fallback → REFUEL never reached DB/API/UI. |
| **SYNQDRIVE_RAW_REFUEL_FALLBACK_EXISTS** | **NO** |
| **EXACT_DIMO_INTERNAL_FAILURE_MECHANISM** | **UNKNOWN** |

---

## 16. Comparison note (KS MX 2024 / Esso Ysenburgstraße)

Prior architecture reference confirms **Esso Ysenburgstraße** exists in production OSM (~31 m from this dwell). Station dataset absence is **ruled out**. This incident differs from KS MX sibling/coalesce issues — here **zero** native segment and **zero** DB row.

---

## 17. Recommended follow-up (documentation only — not executed)

1. DIMO escalation: zero native REFUEL segments for token 187361 on 2026-09-06 despite +24 L absolute rise; include relative-fuel absence as **context** (not asserted internal cause).
2. Product architecture review: fallback ingestion when absolute fuel rise + forecourt dwell corroborated but native segment absent.
3. Observability: alert when relative fuel NULL rate high for ICE fleet (fleet health signal; not proven per-incident root cause).
4. Do **not** manually backfill without operator authorization.

---

## 18. Canonical evidence nodes

- **EED:** `EED-EV-0040`
- **FST:** `FST-EVID-KS-MS-661-PRODUCTION-REFUEL-INCIDENT-2026-09-06-001`
