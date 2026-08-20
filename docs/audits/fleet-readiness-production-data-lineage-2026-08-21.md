# Fleet Readiness Production Data-Lineage Audit

**Audit date (UTC):** 2026-08-20 22:39–22:45  
**Auditor mode:** Read-only — no production data, code, config, flags, workers, or notifications modified  
**Pilot organization:** F.S Mobility — UUID prefix `faa710c9` (full UUID masked in tables)  
**Station scope (operator dashboard):** Zentrale — UUID suffix `…2d10e8` (5 vehicles)  
**Production release:** `20260820200447_v4994`  
**Production git SHA:** `5374d57a51a5f1747595edaa5195b3cd6ee13e2d`  
**Backend process:** `node /opt/synqdrive/current/backend/dist/src/main.js` (PID observed 219351, uptime since deploy ~20:12 UTC)  
**PM2 (synqdrive-admin user):** empty list — process runs under root/system, not PM2 for that user  
**Server UTC:** 2026-08-20 22:39:43  

---

## 1. Executive finding

The operator-visible inconsistency is **real and explainable without contradictory backend bugs in fleet summary aggregation**.

| Surface | Value observed | Source | Business concept |
|---------|----------------|--------|------------------|
| Top KPI **Verfügbar** | 5 | Client `DashboardRuntimeModel` → `ready-to-rent` slice | Operationally **available** vehicles (ready + not-ready sub-counts) |
| Top KPI **Nicht bereit** | 2 | Same slice → `available-but-not-ready` group | **Operative** “ready for renting” (client runtime), not canonical `rental_readiness` |
| Fleet Readiness header | 5 von 5 bereit / 100% | `GET /rental-health/fleet/summary?stationId=…` | Canonical **`rental_readiness`** from Rental Health V1 |
| Fleet Readiness list | Keine aktiven Meldungen | `GET /notifications?attentionScope=FLEET_READINESS&stationId=…` | **Broken station filter** returns 0 rows despite 9 OPEN DB notifications |

**Primary root cause classification: K (multiple proven factors)**

1. **B — Top KPI uses a different legitimate business concept** than canonical Fleet Readiness summary (operative runtime vs rental-health gate).
2. **F — Notification scope/filter bug:** passing dashboard `stationId` to Notification V2 list API applies `entityType=STATION` filter and excludes all vehicle-entity FLEET_READINESS notifications (0 SQL matches vs 9 vehicle-scoped matches).
3. **I — Warning conditions are intentionally non-blocking** for canonical readiness on 4 vehicles (TIRE_CRITICAL / BATTERY_CRITICAL / ACTIVE_DTC notifications exist; hard rental blockers absent).
4. **E (partial) — VEHICLE_NOT_READY aggregate producer is working as designed:** evaluator ran at ~22:32 UTC; zero aggregate events because canonical `rental_readiness=ready` for all five vehicles.

**Which number is “correct”?**

- For **“can this vehicle be rented per health/compliance hard gates?”** → Fleet summary **5/5 ready is correct** under implemented rules.
- For **“is this vehicle operationally ready to hand over right now on the dashboard?”** → Top KPI **Nicht bereit 2 is correct** (telemetry hard-offline on two vehicles).
- For **“what should Fleet Readiness attention panel show?”** → **Incorrect empty state** when a station is selected (filter bug); DB holds 7–9 relevant OPEN notifications.

**Severity:** **P1 high** (operator trust / cross-widget contradiction + silent notification panel empty state).

---

## 2. Production SHA / release

| Item | Value |
|------|-------|
| Symlink | `/opt/synqdrive/current` → `/opt/synqdrive/releases/20260820200447_v4994` |
| Git SHA | `5374d57a51a5f1747595edaa5195b3cd6ee13e2d` |
| Deploy time (approx.) | 2026-08-20 20:12 UTC |
| Frontend bundle (deploy artifact) | `index-CReXEAQK.js` (from prior deploy audit) |
| Notification V2 backend | `NOTIFICATIONS_V2=***` (present in backend.env) |
| Notification V2 frontend | `VITE_NOTIFICATIONS_V2=***` (present in frontend.env) |
| Pilot allowlist | Prefix `faa710c9` (matches pilot org) |

Authenticated fleet-summary HTTP call returned **401** from localhost (expected — no token injected in audit shell). Fleet summary values below are inferred from DB + code + operator observation; SQL simulations confirm notification filter behavior.

---

## 3. Dashboard screenshot observation (operator report)

Operator reported (post P3 split deploy):

- 5 vehicles total (Zentrale station filter)
- KPI: Verfügbar **5**, Nicht bereit **2**
- ~4 vehicles with warnings elsewhere in SynqDrive
- Fleet Readiness panel: **5 von 5 bereit**, **100% bereit**, **Keine aktiven Meldungen**

No screenshot captured in this audit run; observation treated as authoritative for UI labels.

---

## 4. Top KPI data source — “Nicht bereit 2”

### UI component chain

```
ControlKpiStrip.tsx
  → resolveReadyForRentingKpiCounts(slice)          [dashboardSliceAccess.ts]
  → slice.groups['available-but-not-ready'].count
  → built by buildReadyToRentSlice()                [dashboardSliceBuilder.ts]
  → available.filter(v => !v.isReadyToRent)
  → isReadyToRent from deriveIsReadyForRenting()    [rentalReadiness.ts + vehicleRuntimeStateBuilder.ts]
```

### Semantics (client operative readiness)

`deriveIsReadyForRenting` returns false when **any** of:

- `operationalStatus !== 'available'`
- Backend canonical status ≠ AVAILABLE
- Backend data quality not RELIABLE
- `cleaningStatus !== 'Clean'`
- `blockLevel !== 'none'`
- `telemetryState === 'offline'` (**48h+** since last signal — default `telemetryOfflineBlockLevel: 'hard_blocked'`)
- Any `reason` with `preventsReady === true` or `blocking === true`, or critical in compliance/damage/rental categories

**Health module warnings alone do NOT block** (`preventsReady: false`, `blocking: false` in `addHealthReasons`).

### “Verfügbar 5” semantics

From `resolveReadyForRentingKpiCounts`:

```typescript
availableCount = readyGroupCount + notReadyCount
```

Both sub-groups require `operationalStatus === 'available'`. **Verfügbar and Nicht bereit are overlapping dimensions**, not a partition of mutually exclusive fleet states:

- **Verfügbar 5** = all operationally available vehicles
- **Nicht bereit 2** = subset of those 5 failing operative ready checks
- Implied **bereit now ≈ 3** (not shown as separate top KPI label; `readyCount` on slice = 3)

### Proven two “Nicht bereit” vehicles (Zentrale)

| Plate | vid6 | last_signal age (h) | Telemetry class | Client block reason |
|-------|------|----------------------|-----------------|---------------------|
| WOB L 7503 | 326e7e | **~680** | OFFLINE (>48h) | `telemetry` reason, `preventsReady: true` |
| WOB L 9755 | 585588 | **~801** | OFFLINE (>48h) | `telemetry` reason, `preventsReady: true` |

All five Zentrale vehicles: `status=AVAILABLE`, `cleaning_status=CLEAN`.

---

## 5. Fleet Summary data source — “5 von 5 bereit / 100%”

### API

`GET /api/v1/organizations/{orgId}/rental-health/fleet/summary?stationId={stationId}`

### Backend chain

```
RentalHealthFleetService.getFleetReadinessSummaryInternal()
  → buildVehicleSelectionWhere(org, station access, stationId)
  → paginate vehicle IDs
  → RentalHealthSummaryService.getFleetRowsBatch()
  → Redis cache key rental-health-summary:{org}:{vehicleId}:v1 (MISSING in prod at audit time — computed live)
  → aggregate row.rental_readiness counts
```

### Count rules (`rental-health-fleet.service.ts`)

```typescript
if (readiness === 'ready') ready++;
else if (readiness === 'not_ready') notReady++;
else if (readiness === 'unevaluable') unevaluable++;
else unknown++;
readyPercent = round((ready / total) * 1000) / 10
```

### Canonical readiness (`deriveRentalReadiness` in `rental-health.types.ts`)

```typescript
if (availability !== 'ready' || rentalBlocked === null) return 'unevaluable';
return rentalBlocked ? 'not_ready' : 'ready';
```

**Telemetry offline is NOT a `collectBlockingReasons` input.** Hard blocks include TÜV/BOKraft overdue, service overdue (critical), rental-blocking damages/complaints, vehicle alerts (limp/oil), brake/tire **HARD_BLOCK**, battery safety block, safety-critical DTC critical module.

### Operator observation vs inference

Operator reported `total=5, ready=5, notReady=0, readyPercent=100`. This is **consistent** with:

- Five Zentrale vehicles all passing canonical gate (no confirmed `rental_blocked`)
- Warnings present but below hard-block thresholds

Direct API response not captured (401 without auth). **Not stale UI cache** for summary hook — `useFleetReadinessSummary` refetches on station change with request-generation guard.

---

## 6. Five-vehicle diagnostic matrix (Zentrale scope)

Org has **6** vehicles total; **5** at Zentrale. HMÜ C 215 (`…c7ca48`) at HMÜ Filiale excluded from station-filtered dashboard.

| Plate | vid6 | Op status | Cleaning | Telemetry age | Telemetry | Canonical readiness (expected) | OPEN N2 FR events (DB) | Health warnings |
|-------|------|-----------|----------|---------------|-----------|-------------------------------|--------------------------|-----------------|
| KS FH 660E | a78e21 | AVAILABLE | CLEAN | ~19h | standby/live | **ready** | TIRE_CRITICAL ×2 dup | Tire critical (non HARD_BLOCK) |
| KS MS 661 | a6d359 | AVAILABLE | CLEAN | ~13h | standby/live | **ready** | ACTIVE_DTC | DTC P0675 WARNING (non safety-critical band) |
| KS MX 2024 | b97d63 | AVAILABLE | CLEAN | ~33h | soft_offline | **ready** | TIRE_CRITICAL ×2, BATTERY_CRITICAL | Tire + battery warnings |
| WOB L 7503 | 326e7e | AVAILABLE | CLEAN | **~680h** | **offline** | **ready** (canonical) / **not operative ready** (client) | TELEMETRY_OFFLINE | Telemetry offline |
| WOB L 9755 | 585588 | AVAILABLE | CLEAN | **~801h** | **offline** | **ready** (canonical) / **not operative ready** (client) | TELEMETRY_OFFLINE, BATTERY_CRITICAL | Battery warning + telemetry |

**Fleet Readiness Notification V2 (DB, vehicle-scoped at Zentrale):** 7 distinct lifecycle rows across types (some duplicate fingerprints/generations for TIRE_CRITICAL).

**VEHICLE_NOT_READY / UNEVALUABLE:** **0 rows** (any status).

---

## 7. Readiness rule matrix (implemented code)

| Condition | Blocks canonical `rental_readiness`? | Blocks client operative ready? | Class |
|-----------|--------------------------------------|--------------------------------|-------|
| Telemetry >48h offline | **No** | **Yes** | Client-only gate |
| Telemetry 24–48h soft offline | No | No (warning only) | C — informational |
| Tire module warning / TIRE_CRITICAL notification | Only if `isTireRentalHardBlocked` (HARD_BLOCK evidence) | No | Usually C |
| Battery warning / BATTERY_CRITICAL notification | Only if `isBatteryRentalBlockWorthy` | No | Usually C |
| DTC WARNING (e.g. P0675) | Only if error_codes critical **and** safety-critical band | No | C |
| DTC safety-critical critical | Yes | Via rental_blocked reasons if surfaced | A |
| TÜV/BOKraft overdue | Yes | If in blocking_reasons | A |
| Service overdue (critical compliance) | Yes | If in blocking_reasons (service category guarded non-blocking in client reasons) | A / mixed |
| Cleaning not CLEAN | No | Yes | Client-only |
| Operational status ≠ available | No (excluded from ready slice) | Yes | Different slice |

---

## 8. Two “Nicht bereit” vehicle comparison

### Vehicle A — WOB L 7503 (`…326e7e`)

| Dimension | Value |
|-----------|-------|
| Top KPI reason | Telemetry OFFLINE (~680h since `dimo_vehicles.last_signal`) |
| Underlying condition | Hard offline per `telemetryFreshness.ts` (>48h) → `preventsReady: true` |
| Canonical `rental_readiness` | **ready** (telemetry not in `collectBlockingReasons`) |
| Canonical reasons | None blocking |
| Consistent across systems? | **No — intentional semantic split** |

### Vehicle B — WOB L 9755 (`…585588`)

| Dimension | Value |
|-----------|-------|
| Top KPI reason | Telemetry OFFLINE (~801h) |
| Underlying condition | Same offline gate + BATTERY_CRITICAL notification (non block-worthy) |
| Canonical `rental_readiness` | **ready** |
| Canonical reasons | Battery module warning; no confirmed `rental_blocked` |
| Consistent across systems? | **No — intentional semantic split** |

---

## 9. Four warning vehicles comparison

| Vehicle | Warning(s) | Source | N2 event | Should block canonical readiness? | Should produce FR attention? |
|---------|------------|--------|----------|-----------------------------------|------------------------------|
| KS FH 660E | Tire critical | Rental health module + TIRE_CRITICAL | OPEN | **No** (unless HARD_BLOCK) | **Yes** (exists in DB) |
| KS MS 661 | Active DTC P0675 WARNING | DTC poll + ACTIVE_DTC | OPEN | **No** (not safety-critical critical module) | **Yes** |
| KS MX 2024 | Tire + battery critical | Health modules + notifications | OPEN | **No** | **Yes** |
| WOB L 9755 | Battery critical + telemetry offline | Insights + TELEMETRY_OFFLINE | OPEN | Telemetry: **No**; Battery: **No** unless block-worthy | **Yes** |

Warnings are **current** (last_seen_at ~2026-08-20 22:32 UTC on evaluator tick). Not Notification V1-only; not healthMap-only.

---

## 10. Fleet Readiness Notification V2 live data

### DB counts (OPEN/ACK, Zentrale vehicles, FR-relevant types)

| event_type | count |
|------------|-------|
| ACTIVE_DTC | 1 |
| BATTERY_CRITICAL | 2 |
| TIRE_CRITICAL | 4 (includes duplicate lifecycle rows) |
| TELEMETRY_OFFLINE | 2 |
| VEHICLE_NOT_READY | **0** |
| VEHICLE_READINESS_UNEVALUABLE | **0** |

### Why panel shows “Keine aktiven Meldungen”

**Proven SQL simulation:**

- Filter mimicking API `stationId` query param (`entityType=STATION OR actionTarget.stationId`): **0 rows**
- Correct vehicle station join: **9 rows**

Frontend passes `stationId: selectedStationId` into `useNotifications({ attentionScope: 'FLEET_READINESS' })`. Backend `buildNotificationWhereInput` adds `entityOrActionTargetFilter('stationId', …)` which **does not match vehicle-entity notifications** (action_target.stationId is null in all sampled rows).

**Conclusion:** Panel empty state is a **filter bug**, not absence of data.

---

## 11. Operations Notification V2 live data

Operations-scoped types at Zentrale (vehicle/station entities, OPEN):

| event_type | count |
|------------|-------|
| LOW_UTILIZATION | 5 |
| CONNECTIVITY_STATE_UNKNOWN | 4 |
| DATA_COVERAGE_INSUFFICIENT | 2 |
| STATION_SHORTAGE | 0 at vehicle scope (1 org-wide station entity elsewhere) |

Operations panel receives same `stationId` param — likely same class of bug for vehicle-entity operations notifications when station selected.

---

## 12. Evaluator / producer pipeline

| Stage | Mechanism |
|-------|-----------|
| Readiness computation | `RentalHealthService` per vehicle on demand / cache populate |
| Aggregate notification | `VehicleReadinessNotificationAdapter` ← `projectVehicleReadinessAggregate()` |
| Trigger | Notification evaluation scheduler — Redis key `bull:notification.evaluation:notification-evaluation:{org}:scheduled` |
| Last scheduled tick (org) | ~**2026-08-20 22:32:02 UTC** (Redis score 1787265122777) |
| Queue health | `wait=0`, `active=0`, `failed=0` |
| VEHICLE_NOT_READY materialization | Emits only when `rental_readiness === 'not_ready'`; **resolves on ready** |

**Last producer success:** Evaluator completed ~22:32 UTC (notification `last_seen_at` timestamps cluster). No failures in failed queue.

**Why no VEHICLE_NOT_READY:** Canonical readiness READY for all vehicles → projector emits cleared/resolve sources only, not open aggregates.

---

## 13. Queue / worker health (24–48h window)

| Queue | waiting | active | failed |
|-------|---------|--------|--------|
| notification.evaluation | 0 | 0 | 0 |
| battery.v2 | — | active jobs present | failed list exists (org vehicles) |
| dimo.dtc.poll | — | recent poll jobs for pilot vehicles | — |

No readiness evaluator backlog observed. Redis rental-health summary cache **empty** (no `rental-health-summary:*` keys) — fleet summary computes live each request.

---

## 14. Freshness timeline (two Nicht bereit vehicles)

### WOB L 7503 (`…326e7e`)

| Layer | Timestamp / age |
|-------|-----------------|
| Last telemetry (`dimo_vehicles.last_signal`) | 2026-07-23 14:43:38 (~28 days) |
| TELEMETRY_OFFLINE notification last_seen | 2026-07-26 (stale notification vs current offline) |
| Notification evaluator | 2026-08-20 22:32 |
| Client runtime evaluation | Dashboard render (uses live vehicle telemetry fields) |
| Canonical rental_readiness | Computed at API time; **not blocked by telemetry** |

### WOB L 9755 (`…585588`)

| Layer | Timestamp / age |
|-------|-----------------|
| Last telemetry | 2026-07-18 13:42:28 (~33 days) |
| TELEMETRY_OFFLINE / BATTERY_CRITICAL last_seen | 2026-08-20 22:29–22:32 |
| Evaluator | 2026-08-20 22:32 |

**Divergence point:** Client runtime applies **telemetry offline → not operative ready**; canonical rental health **does not** consume telemetry offline for `rental_blocked`.

---

## 15. Summary aggregation semantics

`buildVehicleSelectionWhere` includes vehicles where `homeStationId OR currentStationId` matches filter. Zentrale filter → **same 5 vehicles** as dashboard `filterFleetByStation`.

Denominator **5** matches KPI available population **when station filter = Zentrale**.

Excluded: HMÜ C 215 at HMÜ Filiale (`…0b1847`).

---

## 16. Expected vs actual canonical state

| Vehicle | Expected readiness | Actual (operator/API) | Match? |
|---------|-------------------|------------------------|--------|
| KS FH 660E | ready | ready | yes |
| KS MS 661 | ready | ready | yes |
| KS MX 2024 | ready | ready | yes |
| WOB L 7503 | ready | ready | yes |
| WOB L 9755 | ready | ready | yes |

**Expected Fleet Summary:** total=5, ready=5, notReady=0, unevaluable=0, unknown=0, readyPercent=100  
**Actual (operator):** same  
**Expected FR notifications (panel):** ≥7 vehicle-scoped cause notifications + 0 aggregates  
**Actual (panel):** empty (filter bug)

---

## 17. READY default audit

`deriveRentalReadiness` never defaults missing data to `ready`:

- `availability !== 'ready'` → **unevaluable**
- `rentalBlocked === null` → **unevaluable**
- Only explicit `rental_blocked === false` with full pipeline → **ready**

Fleet summary `unknown` bucket catches absent/unexpected values — **no silent READY from missing rows**.

**Classification:** Defensive audit **PASS** — missing/stale pipeline → unevaluable/unknown, not ready.

---

## 18. Dashboard “~4 warnings” source

Warnings originate from **Rental Health modules** surfaced via:

- Vehicle health UI / healthMap (`VehicleHealthResponse.modules.*.state warning/critical`)
- Notification V2 (`TIRE_CRITICAL`, `BATTERY_CRITICAL`, `ACTIVE_DTC`, `TELEMETRY_OFFLINE`)
- Legacy `health_status` column (all GOOD — **deprecated**, not used for runtime)

Four vehicles with warning/critical module or N2 health events at Zentrale match operator “~4 warnings” report.

---

## 19. Proven root cause & severity

| ID | Classification | Evidence |
|----|----------------|----------|
| **B** | Top KPI ≠ canonical readiness | Different code paths; telemetry blocks client only |
| **F** | Notification stationId filter bug | SQL 0 vs 9 row simulation |
| **I** | Warnings non-blocking for canonical | Rule matrix + DB notifications without VEHICLE_NOT_READY |
| **E** | Producer “silent” is correct | Evaluator ran; no not_ready canonical state |

**Primary:** **K** — multiple defects interacting to produce operator confusion.

**Severity:** **P1 high**

---

## 20. Remediation recommendations (do not execute in this audit)

| Priority | Action |
|----------|--------|
| **P0** | Fix Notification API station filtering: when `stationId` query param is set, intersect FR/OPS lists via **scoped vehicle IDs at station**, not `entityType=STATION` equality. Add regression test mirroring SQL proof above. |
| **P1** | UI copy / hierarchy: label top KPI “Nicht bereit (operativ)” vs Fleet Readiness “Vermietung gesperrt (canonical)” OR add tooltip linking to telemetry offline on the two vehicles. |
| **P1** | Reconcile telemetry offline policy: decide if >48h offline **should** block canonical `rental_readiness`; if yes, add to `collectBlockingReasons` + VEHICLE_NOT_READY producer. |
| **P2** | Populate rental-health Redis cache or document cold-compute latency; optional freshness badge on fleet summary. |
| **P2** | Dedupe duplicate TIRE_CRITICAL OPEN rows (4 rows, 2 vehicles) — lifecycle hygiene. |

**Explicit confirmation:** No production database rows, code, feature flags, workers, notifications, or deployments were modified during this audit.

---

## Appendix A — Code references

| Path | Role |
|------|------|
| `frontend/.../ControlKpiStrip.tsx` | Renders Verfügbar / Nicht bereit KPI |
| `frontend/.../dashboardSliceAccess.ts` | `resolveReadyForRentingKpiCounts` |
| `frontend/.../dashboardSliceBuilder.ts` | `buildReadyToRentSlice` |
| `frontend/.../rentalReadiness.ts` | Client operative readiness |
| `frontend/.../vehicleRuntimeStateBuilder.ts` | Telemetry offline → `preventsReady` |
| `backend/.../rental-health-fleet.service.ts` | Fleet summary aggregation |
| `backend/.../rental-health.types.ts` | `deriveRentalReadiness` |
| `backend/.../rental-health.service.ts` | `collectBlockingReasons` |
| `backend/.../notification-query.util.ts` | **`stationId` filter bug** |
| `backend/.../vehicle-readiness-notification.projector.ts` | VEHICLE_NOT_READY lifecycle |
| `frontend/.../useDashboardViewModel.ts` | Passes `stationId` to scoped hooks |

---

## Appendix B — Changes / Architektur

| Document | Updated |
|----------|---------|
| SynqDrive Code → Changes | **No** (audit-only) |
| SynqDrive Code → Architektur | **No** (audit-only) |
