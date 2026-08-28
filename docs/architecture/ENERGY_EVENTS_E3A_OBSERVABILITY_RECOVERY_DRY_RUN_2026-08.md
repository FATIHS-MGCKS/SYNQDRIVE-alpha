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

43 focused tests pass:

- E1 mechanism isolation in dry-run
- Full mode without DB → NOT READY
- QUICK mode never write-back ready
- Cross-window dedup + overlap flags
- Mutation-guarded repository path
- Mechanism-aware request accounting
- E1 prune + E2 KS MX regressions

---

## 9. Artifacts

- `artifacts/energy-events-recovery-dry-run-2026-08.json` (sanitized coordinates, no auth secrets)
- Run on VPS with `DATABASE_URL` for production `ALREADY_IDENTICAL` comparison

**No historical backfill executed.**
