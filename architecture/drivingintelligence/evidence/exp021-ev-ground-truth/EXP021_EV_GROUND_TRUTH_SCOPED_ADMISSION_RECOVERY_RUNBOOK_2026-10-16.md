# EXP021 — Scoped boundary-admission recovery (execution-ready, not executed)

**Production SHA:** `c1013265bc10af7ac5fe7e86ff372772373acd36`  
**Prepared at (UTC):** `2026-10-16T16:30:00Z` (read-only analysis)  
**Scope:** Single vehicle, single 30-minute reconciliation window — **Tesla reference only** for admission write intent.  
**Explicit non-goals:** No 13-trip batch release; no manual `jsonb_set` admission; no skipping step-4 scan.

---

## 1. Canonical call path

Smallest **existing** writer path (same code as schedulers / `TripReconciliationService`):

```text
TripReconciliationService.reconcileWindow(
  vehicleId = 68868291-5478-42cd-b0c4-cc77b2a78e21,
  from      = 2026-10-16T03:30:00.000Z,
  to        = 2026-10-16T04:00:00.000Z,
  tier      = 'cold',   // metadata only (gap-split audit reason); does NOT widen selection vs warm/fast
  options   = { useDimoSegmentFallback: false },
)
```

**Not sufficient for minimal provider surface:**

- `POST …/vehicles/:vehicleId/trips/reconcile?from=&to=` always calls `triggerManualReconciliation` with **`useDimoSegmentFallback: true`** hard-coded (`vehicle-intelligence.controller.ts`) — **do not use** for this recovery without a code change.
- `triggerManualReconciliation` supports `useDimoSegmentFallback: false` but is only reachable from **Nest application context** (same pattern as `scripts/ops/repair-vehicle-trips-from-dimo.ts`, without its destructive prelude).

**Tier label:** `cold` vs `warm` does **not** change step-4 trip selection (only `from`/`to`). Use `cold` to match operator intent / audit semantics.

### Step-4 trip selection rule (authoritative)

From `repairIntraTripGapSplits`:

```sql
vehicle_id = :vehicleId
AND trip_status = 'COMPLETED'
AND start_time >= :from AND start_time < :to   -- half-open [from, to)
AND end_time IS NOT NULL
AND end_detection_mode IS DISTINCT FROM 'MID_TRIP_GAP_SPLIT'
```

**Overlap:** Window overlap with trip **end** is irrelevant; **start_time** alone gates inclusion.

### Production-preflight list for proposed window (vehicle `68868291…`)

| trip_id | start (UTC) | end (UTC) | step-4 selected |
|---------|-------------|-----------|-----------------|
| `358d0158-b2a9-47ed-af26-33926c5770b4` | `2026-10-16T03:36:00` | `2026-10-16T03:54:55.989` | **YES** (only row) |

`EXACT_AFFECTED_TRIPS` for step-4 scan on this vehicle/window: **`358d0158-b2a9-47ed-af26-33926c5770b4`**.

After `findWaypointGapForSplit` (read waypoints), trip id is added to `boundaryScannedTripIds` even when **no** gap split is applied (EXP021 #2047 tests). Then `releaseForBoundaryScannedTripIds` → `tryReleaseForTripTransactional` → `jsonb_set` `diV0BoundaryAdmissionV1` if `canReleaseTripDiBoundaryAdmission` passes.

---

## 2. Possible writes (steps 1–6 + admission)

| Step | Can mutate? | What |
|------|-------------|------|
| 1 `repairStaleOngoingTrips` | Yes, if stale ONGOING | Finalize stale trips (vehicle-wide, `asOf=to`) |
| 2a `retryPendingBoundaryRefreshes` | Yes | Enqueue boundary-refresh jobs for recoverable trips (**vehicle-wide**, not window-limited) |
| 2b `detectAndRepairMissingTrips` | Yes | Missing-trip / partial-boundary repairs; **DIMO segments only if `useDimoSegmentFallback: true`**; with `false`, may still use **ClickHouse ignition/motion** for EV profile when assist enabled |
| 3 `repairMissingEnds` | Yes | Complete open trips missing end in window |
| 4 `repairIntraTripGapSplits` | Yes, if gap found | Split trip + new segment rows; **scan always runs first** |
| 5 `detectEnergyEvents` | Yes | `vehicle_energy_events` in same window (not trip boundaries) |
| 6 `reconcileUnresolvedWindow` | Yes | Event↔trip association in window |
| Admission hook | Yes | `raw_detection_meta.diV0BoundaryAdmissionV1` on scanned trip ids only |

**Reference trip expectation:** COMPLETED, no eligible gap → **no split**; **admission jsonb merge** only (if release preconditions hold).

**Other trips / FSM:** This window does not step-4-scan other vehicles. On **this** vehicle, FSM is `RESTING` and `active_trip_id` is null → no `FSM_STILL_ACTIVE_ON_TRIP` block for `358d0158…`.

---

## 3. Provider paths and budget

| Path | When (this call, `useDimoSegmentFallback: false`) |
|------|---------------------------------------------------|
| DIMO segment fetch (step 2) | **Skipped** when fallback false and no segment list returned |
| ClickHouse ignition/motion (step 2) | **Possible** for EV if `isClickHouseTripAssistEnabled()` and detectors wired — **not** disabled by `useDimoSegmentFallback: false` |
| DIMO via boundary refresh enqueue (step 2a) | **Possible** if vehicle has recoverable boundary-refresh trips (async jobs, not synchronous segment pull in reconcile) |
| Energy / association | DB + internal services; no DIMO segment API in typical path |

Entire reconcile runs inside `runWithDimoRequestContext({ category: 'RECONCILIATION', priority: 'NORMAL' })` — subject to existing DIMO provider budget / rate rules if any DIMO call occurs.

**Provider budget (this scoped window, Tesla, fallback false):** **Expected 0 DIMO segment API calls** for step-2 missing-trip path; **non-zero risk** from (a) CH assist motion/ignition evaluation, (b) vehicle-wide boundary-refresh enqueue. **Abort** if preflight shows recoverable boundary refresh in flight on reference trip (`BOUNDARY_REFRESH_IN_FLIGHT`).

---

## 4. Concurrency protection

| Mechanism | Role |
|-----------|------|
| `SchedulerLeaderGuardService` | Periodic ticks only on leader replica |
| `ReconciliationExecutionMutexService` | Redis lock `synqdrive:reconciliation:lock:{orgId}:{vehicleId}:trip` — one reconcile per vehicle at a time; concurrent run returns `skipped: true` |
| `tryReleaseForTripTransactional` | `FOR UPDATE` on trip row + re-check PROPOSED repairs / FSM |

**Execution rule:** Run on **scheduler leader** replica (`PORT=3001` at last verified deploy) during a quiet window; if mutex `skipped`, retry once after in-flight reconcile completes (do not bypass mutex).

---

## 5. Preconditions and abort rules (reference trip)

Execute only if **all** pass immediately before `reconcileWindow`:

| Check | Expected |
|-------|----------|
| `organization_id` | `faa710c9-6d91-4079-a7d5-91fdccdec14a` |
| `vehicle_id` | `68868291-5478-42cd-b0c4-cc77b2a78e21` |
| `trip_id` | `358d0158-b2a9-47ed-af26-33926c5770b4` |
| `trip_status` / `end_time` | `COMPLETED` with end `2026-10-16T03:54:55.989Z` |
| FSM | `RESTING`, `active_trip_id` null or ≠ reference trip |
| PROPOSED `trip_repairs` | `0` |
| `diV0BoundaryAdmissionV1` | absent (recovery still needed) |
| Live boundary FP | equals WI `99fe9d1b…` fingerprint `…59fcdaad…` |
| CURRENT V2 `567c3dc2…` | `lifecycle_status=CURRENT`, `content_fingerprint=9219741e…` unchanged vs frozen baseline |
| Deployed SHA | still `c1013265…` (or re-validate gates on new SHA) |

**Abort** on any mismatch; re-run read-only baseline + inventory before retry.

---

## 6. Post-execution verification (read-only)

1. `raw_detection_meta.diV0BoundaryAdmissionV1.revisionKey` = live boundary FP `…59fcdaad…`, `releasedBy=RECONCILIATION`.
2. `evaluateTripDiProductReadBoundaryGate` → `ok: true`.
3. `readCurrentOpsProjection(org, trip, DI_V0_SPEED_QC_POLICY_V2)` → **non-null** row (gate inside service).
4. `DiV0TripSpeedQualityProductReadService.readForTrip` → product payload **not** `UNAVAILABLE` (authenticated HTTP GET still separate).
5. Projection `content_fingerprint` and per-second replay metrics **unchanged** vs `pre-deploy/` / `post-deploy/` manifest (or document versioned supersede).

---

## 7. All 13 CURRENT V2 — automatic step-4 reachability

**Anchor:** `2026-10-16T16:30:00Z`. Periodic tiers use **start_time ∈ [from, to)** at tick time. Cold cron `03:00 UTC` uses `from = to - 7d`.

| trip_id (short) | vehicle FSM | Next automatic step-4 scan | Admission after scan (if RESTING) |
|-----------------|-------------|----------------------------|-----------------------------------|
| `9ead317c…` | RESTING | **Cold** `2026-10-17T03:00Z` (start Oct 15 — outside warm/fast now) | Yes |
| `72617129…` | RESTING | Cold Oct 17 | Yes |
| `84b14b8a…` | **ACTIVE_TRIP** (other active) | Cold Oct 17 scan; **release blocked** until RESTING | No until FSM RESTING |
| `65fc1342…` | RESTING | Cold Oct 17 | Yes |
| `14976b7b…` | RESTING | Cold Oct 17 | Yes |
| **`358d0158…`** | RESTING | **Outside** fast/warm now; **Cold Oct 17** OR scoped window | Yes (scoped) |
| `a30cac06…` | ACTIVE_TRIP | Warm ticks now (start 05:39) + cold | Blocked until RESTING |
| `b23e8161…` | ACTIVE_TRIP | Warm now + cold | Blocked until RESTING |
| `168567f4…` | RESTING | Warm now + cold | Yes |
| `c0ec3b30…` | RESTING | Warm now + cold | Yes |
| `3fb1938f…` | RESTING | Warm now + cold | Yes |
| `abbd40f0…` | ACTIVE_TRIP | Warm now + cold | Blocked until RESTING |
| `613a969d…` | RESTING | Warm now + cold | Yes |

**Summary counts (automatic periodic, not scoped):**

- **Step-4 reachable on next warm tick (16:30Z anchor):** 7 trips (Oct 16 starts ≥ `04:30Z`).
- **Step-4 reachable on cold Oct 17 only (Oct 15 / early Oct 16 starts):** 6 trips including Tesla reference.
- **Admission release blocked after scan (vehicle FSM ≠ RESTING):** 4 trips on `c10351f8…`.
- **Unknown:** 0 (fast cohort cap does not apply to warm/cold vehicle lists).

Cold tier name alone does not imply “all history”; selection is still **`start_time` half-open window**.

---

## 8. Deployed ops read vs product read (contract @ `c1013265`)

| Layer | Gate? | Behavior without admission |
|-------|-------|----------------------------|
| `DiV0TripSpeedQualityProjectionRepository.readCurrentForTrip` | **No** | Returns CURRENT row from DB |
| `DiV0TripSpeedQualityProjectionService.readCurrentOpsProjection` | **Yes** — `evaluateTripDiProductReadBoundaryGate` at lines 133–134 | Returns **`null`** |
| `DiV0TripSpeedQualityProductReadService.readForTrip` (HTTP product) | **Yes** — via `readCurrentOpsProjection` (+ redundant gate if non-null) | Unavailable product envelope |

**Correction:** Earlier post-deploy text implying ops read “returns CURRENT V2 while product blocks” was **stale**. On **`c1013265`**, **both** ops projection read and product read **hide** CURRENT V2 without admission. **DB CURRENT ≠ customer-visible.**

Repository-only callers (tests, internal tooling) may still see rows; production UI path uses `readCurrentOpsProjection` / `readForTrip`.

---

## 9. Execution command (leader VPS, owner-authorized)

```bash
# On scheduler LEADER replica only, after preflight passes.
# Uses existing Nest bootstrap pattern (no new product API).
cd /opt/synqdrive/current/backend
sudo bash -c 'set -a; source /opt/synqdrive/shared/backend.env; set +a;
npx ts-node -r tsconfig-paths/register <<'"'"'TS'"'"'
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./src/app.module";
import { TripReconciliationService } from "./src/modules/vehicle-intelligence/trips/reconciliation/trip-reconciliation.service";

const VEHICLE = "68868291-5478-42cd-b0c4-cc77b2a78e21";
const FROM = new Date("2026-10-16T03:30:00.000Z");
const TO   = new Date("2026-10-16T04:00:00.000Z");

(async () => {
  const app = await NestFactory.createApplicationContext(await AppModule.forRootAsync(), {
    logger: ["error", "warn", "log"],
  });
  try {
    const svc = app.get(TripReconciliationService);
    const result = await svc.reconcileWindow(VEHICLE, FROM, TO, "cold", {
      useDimoSegmentFallback: false,
    });
    console.log(JSON.stringify({ result, productionMutations: "SEE_RESULT", providerCalls: "SEE_LOGS" }, null, 2));
  } finally {
    await app.close();
  }
})();
TS'
```

**Do not run** until owner authorizes mutation. Preflight with `exp021:ev-ground-truth:baseline` POST_DEPLOY phase + SQL step-4 list above.

---

## 10. CI note (unchanged)

Run `38919698025`: postgres image pull `toomanyrequests` — infrastructure, not runtime regression.
