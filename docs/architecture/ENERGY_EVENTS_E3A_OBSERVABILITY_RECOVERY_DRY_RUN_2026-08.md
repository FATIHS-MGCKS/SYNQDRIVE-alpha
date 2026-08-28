# Energy Events E3A — Observability + Historical Recovery Dry Run (2026-08)

**Phase:** E3A only (read-only preview). **Depends on:** E1 (#1366), E2 (#1370) merged on `main` @ `ba0bdd621`.  
**Absolute rule:** no `VehicleEnergyEvent` create/update/delete during this phase.

---

## Safety corrections (PR #1373 review)

| Fix | Behavior |
|-----|----------|
| E1 mechanism isolation | REFUEL success survives RECHARGE failure; prune preview suppressed when any mechanism failed |
| Full-mode DB gate | `dbComparisonEnabled=true` required; otherwise `NOT READY` + `DB_COMPARISON_UNAVAILABLE` |
| Request accounting | Mechanism-aware queries; telemetry GraphQL requests counted per mechanism (not per wrapper) |
| Cross-window dedup | Global reconciliation by `dimoSegmentId`, overlap detection, existing-DB overlap flags |
| Conservative same-ID dedup | If any window occurrence is `MANUAL_REVIEW_REQUIRED` or payloads differ → stays MR; merges reasons; `same_id_material_payload_mismatch` |
| Per-vehicle DB mapping | `dbVehicleMapped` required in FULL mode; synthetic `dry-run-token-*` never eligible for writes |
| Material identity | `isMateriallyIdentical` matches full production upsert payload (kind, mechanism, coords, odometer, rawDetectionMeta) |
| Network isolation | Standalone fetch isolates per-mechanism thrown errors; request accounting preserved |
| Quick windows | `QUICK_ACCEPTANCE_WINDOWS` each ≤24h (KS MX Aug 23, Tesla Jun 15/17) |
| Artifact privacy | Committed artifacts strip `startLatitude`/`startLongitude`; `codeShaUnderTest` + `baseMainSha` provenance |
| Fuel quality flag | `fuel_signal_contradiction` surfaced in preview without changing persist gate |
| No-write proof | `EnergyEventsRecoveryReadRepository` + mutation-guarded Prisma client |
| Fetch failure gate | Any unresolved `FETCH_FAILED` in FULL mode → `NOT READY` |
| Fleet inventory | VW Golf `190497` included as `DIMO_ACCESS_FAILED` (known HTTP 403) |
| Metrics | `synqdrive_energy_events_zero_persist_runs_total` (per-run supporting signal only) |
| Parser drift | `DimoSegmentsService` delegates to shared `parseDimoEnergyEventSegment` |

---

## 1. Baseline verification

| Item | Value |
|------|-------|
| **main SHA** | `ba0bdd621ba96e42abbda8fee442c36849dd5905` |
| **detectorConfigVersion** | `e2-2026-08` |
| **refuel config** | `{ minIncreasePercent: 5 }` |
| **recharge config** | DIMO default (omit `config`) |

---

## 2. Outage window

| Boundary | ISO timestamp |
|----------|---------------|
| **Recovery analysis start** | `2026-07-16T00:00:00.000Z` |
| **Fixed recovery cutoff** | `2026-08-28T08:00:00.000Z` |

Window semantics: non-overlapping `[from, to)` 24h windows. DIMO may return `startedBeforeRange=true` segments in the first window containing their start; global dedup keeps one candidate per `dimoSegmentId`.

---

## 3. Vehicle inventory

| Label | tokenId | Class | DIMO access |
|-------|---------|-------|-------------|
| KS MX 2024 | 187336 | REFUEL_CANDIDATE | yes |
| VW Arteon ICE | 187784 | REFUEL_CANDIDATE | yes |
| Audi A4 (KS MS 661) | 187361 | REFUEL_CANDIDATE | yes |
| VW Tiguan ICE | 192922 | REFUEL_CANDIDATE | yes |
| KS FH 660E Tesla | 186946 | RECHARGE_CANDIDATE | yes |
| VW Golf ICE | 190497 | DIMO_ACCESS_FAILED | no (HTTP 403) |

---

## 4. Request accounting (corrected)

Per eligible vehicle/window, only required mechanisms are queried:

- `REFUEL_CANDIDATE` → refuel only (1 telemetry GraphQL request)
- `RECHARGE_CANDIDATE` → recharge only (1 request)
- `BOTH` → refuel + recharge (2 requests)

**Full fleet budget (5 eligible × 44 windows):**

| Metric | Value |
|--------|-------|
| Expected telemetry GraphQL requests | **220** (not 440) |
| Token exchange requests | ≤5 (cached per tokenId) |
| Worst case with retries (×3) | 660 |

---

## 5. Backfill gate invariants

**FULL mode requires:**

1. `dbComparisonEnabled=true` (production `DATABASE_URL` read path)
2. Zero unresolved `FETCH_FAILED` candidates
3. All manual-review entries explicitly resolved (`APPROVE_FOR_BACKFILL`)
4. KS MX canonical case present
5. Zero-write guarantee via read-only repository

**QUICK mode:** detector acceptance only — never `READY FOR CONTROLLED WRITE BACKFILL`.

---

## 6. Observability

Prometheus metrics via `TripMetricsService` registry:

- `synqdrive_energy_events_detection_runs_total`
- `synqdrive_energy_events_mechanism_fetch_total`
- `synqdrive_energy_events_segments_detected_total` / `_persistable_total`
- `synqdrive_energy_events_created_total` / `_updated_total` / `_skipped_total` (no misleading mechanism label)
- `synqdrive_energy_events_zero_persist_runs_total{had_fetch_failure}` — **per-run supporting signal only**

**Health semantics (multi-signal, not zero-count alone):**

- Reconciliation/scheduler heartbeat presence
- Mechanism fetch failure rate + HTTP 422 trend
- Consecutive per-vehicle failures (E3B cursor)
- `zero_persist_runs_total` correlated with `had_fetch_failure=false` across cycles

---

## 7. Per-vehicle cursor (deferred to E3B)

No durable cursor model in E3A. Recommended E3B schema:

```
VehicleEnergyDetectionStatus
- vehicleId (PK)
- lastAttemptAt
- lastSuccessAt
- lastFailureAt
- lastError
- lastSuccessfulWindowEnd
- consecutiveFailures
- detectorConfigVersion
```

---

## 8. Tests

47 focused tests pass:

- E1 mechanism isolation in dry-run
- Full mode without DB → NOT READY
- QUICK mode never write-back ready; bounded ≤24h windows
- Conservative same-ID dedup + cross-window overlap flags
- FULL-mode `DB_VEHICLE_MAPPING_MISSING` for unmapped fleet
- Material identity vs production upsert payload
- Standalone per-mechanism network failure isolation
- Mutation-guarded repository path
- Mechanism-aware request accounting
- E1 prune + E2 KS MX regressions

---

## 9. Artifacts

- `artifacts/energy-events-recovery-quick-evidence-2026-08.json` (QUICK acceptance, no coordinates)
- `artifacts/energy-events-recovery-full-db-preview-2026-08.json` (FULL DB-backed read-only preview)
- Prior branch commit `dd9ed2f8d` contained precise GPS coordinates in artifacts (removed; history not rewritten)

**No historical backfill executed.**

---

## 10. FULL DB-backed preview (VPS production, 2026-08-28)

Executed on `srv1374778.hstgr.cloud` with production `DATABASE_URL`, `dbComparisonEnabled=true`, `dbComparisonStatus=ok`, mutation-guarded Prisma, zero writes.

### Before refuel plausibility hardening

| Metric | Value |
|--------|-------|
| WOULD_CREATE | 7 (5 refuels incl. 4 moving-vehicle false positives) |
| MANUAL_REVIEW_REQUIRED | 12 |
| Gate | `READY AFTER MANUAL REVIEW OF 12 EVENTS` |

### After refuel plausibility hardening (HEAD `160b9b571`)

| Metric | Value |
|--------|-------|
| Telemetry GraphQL requests | 220 |
| Refuel detections | 18 |
| WOULD_CREATE | 3 (KS MX refuel + 2 Tesla recharge) |
| WOULD_UPDATE | 1 (Tesla Jul-16 extended session) |
| MANUAL_REVIEW_REQUIRED | 15 (13 refuel + 2 ambiguous) |
| FETCH_FAILED | 0 |
| KS MX canonical | WOULD_CREATE @ 2026-08-23T16:15:15Z |
| Gate | `READY AFTER MANUAL REVIEW OF 15 EVENTS` |

4 refuel candidates reclassified from WOULD_CREATE → MANUAL_REVIEW (`refuel_high_odometer_movement`). Sole refuel WOULD_CREATE: KS MX (+16 L, ~6 km).

---

## 11. Refuel movement/duration plausibility calibration (v4.9.979)

FULL prod dry-run exposed DIMO RefuelDetector false positives: large fuel increases during 122–205 km odometer travel. KS MX canonical refuel (positive control): 8 min, +16 L, ~6 km apparent spread — must remain eligible.

| Rule | Threshold | Rationale |
|------|-----------|-----------|
| `refuel_high_odometer_movement` | odometer Δ ≥ 50 km AND liters ≥ 10 | All confirmed false positives had ≥122 km; KS MX has 6 km |
| `refuel_elevated_movement_during_refuel` | odometer Δ ≥ 20 km AND implied speed ≥ 40 km/h AND liters ≥ 10 | Catches sustained driving refuels below 50 km |
| `refuel_odometer_movement_during_event` | odometer Δ > 5 km AND liters < 10 | Preserved for small-volume contradictions |

**Production recommendation:** Apply same movement plausibility to live `EnergyEventsService.detectEnergyEvents` after recovery gate validates — DIMO false positives can occur in production too. **Not changed in this PR** (recovery-only hardening).

**Tesla Jul-16 overlap:** Extended recharge (`dimo-recharge-186946-1784220138893`) → `WOULD_UPDATE` on existing DB row `ddb44b81` (same physical session, expanded detector window). No duplicate create.
