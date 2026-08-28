# Energy Events E3A — Observability + Historical Recovery Dry Run (2026-08)

**Phase:** E3A only (read-only preview). **Depends on:** E1 (#1366), E2 (#1370) merged on `main` @ `ba0bdd621`.  
**Absolute rule:** no `VehicleEnergyEvent` create/update/delete during this phase.

---

## Safety corrections

| Fix | Behavior |
|-----|----------|
| E1 mechanism isolation | REFUEL success survives RECHARGE failure; prune preview suppressed when any mechanism failed |
| Full-mode DB gate | `dbComparisonEnabled=true` required; otherwise `NOT READY` + `DB_COMPARISON_UNAVAILABLE` |
| Request accounting | Mechanism-aware queries; telemetry GraphQL requests counted per mechanism (not per wrapper) |
| Cross-window dedup | Global reconciliation by `dimoSegmentId`, overlap detection, existing-DB overlap flags |
| Conservative same-ID dedup | If any window occurrence is `MANUAL_REVIEW_REQUIRED` or payloads differ → stays MR; merges reasons; `same_id_material_payload_mismatch` |
| Per-vehicle DB mapping | `dbVehicleMapped` required in FULL mode; synthetic dry-run IDs never eligible for writes |
| Material identity | `isMateriallyIdentical` matches full production upsert payload (kind, mechanism, coords, odometer, rawDetectionMeta) |
| Network isolation | Standalone fetch isolates per-mechanism thrown errors; request accounting preserved |
| Quick windows | `QUICK_ACCEPTANCE_WINDOWS` each ≤24h |
| Artifact privacy | Committed artifacts use inventory-order aliases only; no production fleet reverse-mapping in source |
| Fuel quality flag | `fuel_signal_contradiction` surfaced in preview without changing persist gate |
| No-write proof | `EnergyEventsRecoveryReadRepository` + mutation-guarded Prisma client |
| Fetch failure gate | Any unresolved `FETCH_FAILED` in FULL mode → `NOT READY` |
| Fleet inventory | One synthetic inaccessible ICE profile in QUICK mode; FULL mode loads vehicles from DB |
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

## 3. Vehicle inventory (repository-safe aliases)

FULL mode loads real vehicles from the database at runtime. Committed documentation and artifacts use aliases only:

| Alias | Class | DIMO access |
|-------|-------|-------------|
| `CANONICAL_REFUEL_CASE` | REFUEL_CANDIDATE | yes |
| `ICE_A` | REFUEL_CANDIDATE | yes |
| `ICE_B` | REFUEL_CANDIDATE | yes |
| `ICE_C` | REFUEL_CANDIDATE | yes |
| `EV_A` | RECHARGE_CANDIDATE | yes |
| `INACCESSIBLE_ICE` | DIMO_ACCESS_FAILED | no |

Alias assignment is deterministic by inventory order and energy class at artifact-sanitization time. No production tokenId ↔ alias mapping is stored in git.

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
3. All manual-review entries resolved per disposition semantics below
4. `CANONICAL_REFUEL_CASE` present (`WOULD_CREATE`, behavioral signature: ~8 min, +14–18 L, ≤10 km apparent odometer spread)
5. Zero-write guarantee via read-only repository

**Manual-review disposition semantics (write-backfill phase, not executed in E3A):**

| Disposition | Meaning | Gate effect |
|-------------|---------|-------------|
| `APPROVE_FOR_BACKFILL` | Eligible for write | Resolved |
| `EXCLUDE_FROM_BACKFILL` | Intentionally skipped; considered resolved | Resolved |
| `NEEDS_FURTHER_EVIDENCE` | Unresolved blocker | Blocks write-backfill |

The gate counts only **unresolved** manual-review entries (`NEEDS_FURTHER_EVIDENCE`). `EXCLUDE_FROM_BACKFILL` does **not** require conversion to `APPROVE_FOR_BACKFILL`.

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

Focused energy-events tests (74) plus E3A privacy regression checks:

- E1 mechanism isolation in dry-run
- Full mode without DB → NOT READY
- QUICK mode never write-back ready; bounded ≤24h windows
- Conservative same-ID dedup + cross-window overlap flags
- FULL-mode `DB_VEHICLE_MAPPING_MISSING` for unmapped fleet
- Material identity vs production upsert payload
- Standalone per-mechanism network failure isolation
- Mutation-guarded repository path
- Mechanism-aware request accounting
- Refuel movement plausibility (canonical positive control + false-positive exclusions)
- Manual-review disposition resolution (`EXCLUDE` counts as resolved)
- Sanitized artifact builder (inventory-order aliases, no forbidden identifier fields)
- Privacy regression scan of committed artifacts + architecture doc

---

## 9. Artifacts and private evidence policy

**Committed (repository-safe, sanitized only):**

- `artifacts/energy-events-recovery-quick-evidence-2026-08.json`
- `artifacts/energy-events-recovery-full-sanitized-summary-2026-08.json`

Both contain aliases (`ICE_A`, `EV_A`, `CANONICAL_REFUEL_CASE`, …), coarse duration/odometer/fuel buckets, and aggregate counts only.

**Not in git (secured operational storage only):**

- Raw FULL DB preview reports generated during secured production infrastructure dry-run execution
- These contain operational identifiers and historical telemetry detail required for recovery execution review
- Retain raw reports only in private operational output, private CI artifacts, or other secured internal storage — never commit them
- `.gitignore` blocks `artifacts/energy-events-recovery-full-db-preview-*.json`

**No historical backfill executed.**

---

## 10. FULL DB-backed preview (secured production infrastructure, 2026-08-28)

FULL DB-backed read-only run executed on secured production infrastructure with production `DATABASE_URL`, `dbComparisonEnabled=true`, `dbComparisonStatus=ok`, mutation-guarded Prisma, zero writes.

### After refuel plausibility hardening

| Metric | Value |
|--------|-------|
| Telemetry GraphQL requests | 220 |
| Refuel detections | 18 |
| WOULD_CREATE | 3 (`CANONICAL_REFUEL_CASE` + 2 `EV_A` recharge) |
| WOULD_UPDATE | 1 (`CANONICAL_RECHARGE_OVERLAP_CASE`) |
| MANUAL_REVIEW_REQUIRED | 15 (13 `EXCLUDE_FROM_BACKFILL` + 2 `NEEDS_FURTHER_EVIDENCE`) |
| Unresolved manual review | 2 (`NEEDS_FURTHER_EVIDENCE` only) |
| FETCH_FAILED | 0 |
| `CANONICAL_REFUEL_CASE` | `WOULD_CREATE` (Aug 2026) |
| Gate | `READY AFTER MANUAL REVIEW OF 2 EVENTS` (`MANUAL_REVIEW_UNRESOLVED:2`) |

4 refuel candidates reclassified from WOULD_CREATE → MANUAL_REVIEW (`refuel_high_odometer_movement`). Sole refuel WOULD_CREATE: `CANONICAL_REFUEL_CASE` (+16 L bucket, ~6 km bucket).

**Write-phase recharge overlap invariant:** The canonical Jul-16 extended recharge session is `SAME_PHYSICAL_SESSION` / `WOULD_UPDATE`. Before any real write-back, verify overlapping legacy recharge subsegments are explicitly reconciled so a parent update does not leave duplicate logical charge sessions.

---

## 11. Refuel movement/duration plausibility calibration (v4.9.979)

FULL prod dry-run exposed DIMO RefuelDetector false positives: large fuel increases during 122–205 km odometer travel. Canonical refuel positive control: 8 min, +16 L, ~6 km apparent spread — must remain eligible.

| Rule | Threshold | Rationale |
|------|-----------|-----------|
| `refuel_high_odometer_movement` | odometer Δ ≥ 50 km AND liters ≥ 10 | All confirmed false positives had ≥122 km; canonical case has ~6 km |
| `refuel_elevated_movement_during_refuel` | odometer Δ ≥ 20 km AND implied speed ≥ 40 km/h AND liters ≥ 10 | Catches sustained driving refuels below 50 km |
| `refuel_odometer_movement_during_event` | odometer Δ > 5 km AND liters < 10 | Preserved for small-volume contradictions |

**Production recommendation:** Apply same movement plausibility to live `EnergyEventsService.detectEnergyEvents` after recovery gate validates — DIMO false positives can occur in production too. **Not changed in this PR** (recovery-only hardening).

**Recharge overlap:** Extended recharge → `WOULD_UPDATE` on existing DB row (same physical session, expanded detector window). No duplicate create. Before write-back: reconcile overlapping legacy recharge subsegments (see write-phase invariant above).
