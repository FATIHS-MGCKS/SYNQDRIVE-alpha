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
| FULL capability discovery | Runtime/canonical: `Vehicle.fuelType`, `VehicleBatteryCapability`, DIMO `availableSignals` probe; existing events supplemental only — never sole source |
| CAPABILITY_UNKNOWN gate | DIMO probe failure without canonical DB coverage → `CAPABILITY_UNKNOWN`; FULL gate `NOT READY` (not `NO_ENERGY_SIGNAL`) |
| Synthetic QUICK isolation | `mergeAuditedFleetIntoDbVehicles` never injects synthetic QUICK profiles in FULL mode |
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

### 3.1 Vehicle-slot aliases

One alias per inventory slot. Every energy class has an alias prefix, so a `BOTH`
vehicle can never fall through to `UNKNOWN` merely because of its class.

| Class | Prefix | Example |
|-------|--------|---------|
| `REFUEL_CANDIDATE` | `ICE` | `ICE_A` |
| `RECHARGE_CANDIDATE` | `EV` | `EV_A` |
| `BOTH` | `PHEV` | `PHEV_A` |
| `NO_ENERGY_SIGNAL` | `NO_ENERGY_SIGNAL` | `NO_ENERGY_SIGNAL_A` |
| `DIMO_ACCESS_FAILED` | `INACCESSIBLE` | `INACCESSIBLE_A` |
| `CAPABILITY_UNKNOWN` | `CAPABILITY_UNKNOWN` | `CAPABILITY_UNKNOWN_A` |

### 3.2 Canonical roles are event-scoped, not vehicle-scoped

`CANONICAL_REFUEL_CASE` and `CANONICAL_RECHARGE_OVERLAP_CASE` name a single
acceptance *event*, not a vehicle slot. Sibling events on the same vehicle keep
the vehicle alias, so two independent `WOULD_CREATE` recharge sessions on the
same EV stay `EV_A` while only the overlap `WOULD_UPDATE` event wears the
canonical role. Every sanitized event also carries `vehicleAlias`, which always
holds the slot alias.

Role matching uses an in-process candidate identity (`mechanism` +
`dimoSegmentId`) that is only a map key — the segment id never reaches a
committed artifact.

Alias assignment is deterministic by inventory order and energy class at artifact-sanitization time. No production tokenId ↔ alias mapping is stored in git.

---

## 4. Request accounting (single run-level authority)

`energy-events-recovery-accounting.ts` owns one `DimoRequestAccounting` record
per run. The dry-run script creates it, capability discovery records into it, and
the recovery loop merges its deltas into the same record. Previously the
capability-probe helpers built local accounting objects that were discarded, so
committed evidence reported mechanism-only traffic as if it were the total and
showed `tokenExchangeRequests=0`.

Per eligible vehicle/window, only *applicable* mechanisms are queried:

- `REFUEL_CANDIDATE` → refuel only (1 telemetry GraphQL request)
- `RECHARGE_CANDIDATE` → recharge only (1 request)
- `BOTH` (PHEV) → refuel + recharge (2 requests)

### Reported fields

| Field | Meaning |
|-------|---------|
| `telemetryGraphqlRequests` | **TOTAL** — capability probes + mechanism requests |
| `capabilityProbeRequests` | `availableSignals` GraphQL probes |
| `mechanismRequests` | refuel + recharge segment requests |
| `refuelSegmentRequests` / `rechargeSegmentRequests` | per-mechanism split |
| `tokenExchangeRequests` | per-tokenId vehicle JWT exchanges |
| `developerAuthRequests` | developer JWT acquisitions |
| `retries` | retried requests |

`isTelemetryTotalConsistent()` asserts
`telemetryGraphqlRequests === capabilityProbeRequests + mechanismRequests`; the
dry-run script exits non-zero if that invariant breaks, so mechanism-only traffic
can never again be published as the total.

Budget figures in `trafficBudget` are derived from the resolved per-vehicle
applicability at runtime, not hardcoded.

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

Focused energy-events tests (101, of which 70 are net-new versus `main`) plus
E3A privacy regression checks:

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
- Capability discovery regression (ICE/EV zero-event probe, CAPABILITY_UNKNOWN gate, synthetic QUICK FULL isolation)
- Canonical powertrain applicability: ICE listing traction SOC stays `REFUEL_CANDIDATE`; EV with a stray fuel signal stays `RECHARGE_CANDIDATE`; PHEV with both capabilities is `BOTH`; PHEV taxonomy never flattened to ICE; `UNKNOWN` without sufficient evidence is `CAPABILITY_UNKNOWN`
- Run-level accounting: `availableSignals` probes contribute to the TOTAL telemetry count; token-exchange and developer-auth accounting is not silently lost; per-mechanism split merges additively
- Sanitizer alias correctness: canonical recharge role applies only to the overlap update event; sibling recharge sessions on the same EV remain `EV_A`; `BOTH` inventory aliases never fall through to `UNKNOWN`

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

FULL DB-backed read-only run executed on secured production infrastructure with production `DATABASE_URL`, `dbComparisonEnabled=true`, `dbComparisonStatus=ok`, mutation-guarded Prisma, zero writes. **Clean branch execution** (`codeShaUnderTest` = clean PR HEAD, not legacy #1373).

### Capability discovery: applicability vs. availability

FULL mode resolves two independent dimensions and never conflates them.

**A) Applicability** — from the canonical fleet authority
`resolveFleetPowertrainClass()`. Recovery does not define its own taxonomy, and
`PHEV` is preserved rather than flattened into `ICE`.

| Powertrain | refuel | recharge |
|------------|--------|----------|
| `ICE` | `APPLICABLE` | `NOT_APPLICABLE` |
| `EV` | `NOT_APPLICABLE` | `APPLICABLE` |
| `PHEV` | `APPLICABLE` | `APPLICABLE` |
| `UNKNOWN` | `UNKNOWN` | `UNKNOWN` |

**B) Provider signal availability** — from runtime evidence, never from the
absence of energy-event history:

1. DIMO `availableSignals` probe (authoritative runtime source)
2. `VehicleBatteryCapability` rows (`dimo.segments.recharge`, `hv.soc`)
3. Existing outage-window events — **supplemental only**

Availability can only *confirm* an applicable mechanism. It can never make an
inapplicable mechanism applicable. Claims against an inapplicable mechanism are
recorded as *suppressed* evidence so the provenance stays auditable.

`CAPABILITY_UNKNOWN` when the probe fails and no canonical source covers an
applicable mechanism (and always when the powertrain itself is `UNKNOWN`); FULL
gate `NOT READY`. Synthetic QUICK profiles (tokenIds 100001–100099) cannot enter
FULL inventory.

### Why ICE vehicles previously reported `rechargeSocAvailable=true`

The earlier clean FULL artifact classified reachable ICE vehicles as
`energyClass=BOTH`. Runtime audit (`energy-events-capability-source-audit.ts`,
private evidence only) attributed every ICE recharge claim to **stale/overbroad
`VehicleBatteryCapability` rows** — cause **(B)**:

- `dimo.segments.recharge` rows persisted with a *listed* status on ICE vehicles.
  The battery-capability preflight records **endpoint listing**, not powertrain
  applicability, so an ICE vehicle whose recharge-segments endpoint answers with
  zero segments still stores a listed row.
- DIMO `availableSignals` contributed **zero** ICE recharge claims
  (`suppressedRechargeSourceCounts.DIMO_AVAILABLE_SIGNALS = 0`), so cause (A) is
  excluded.
- `fuelType` was correct on every vehicle (5 ICE / 1 EV, zero `UNKNOWN`), so
  cause (C) is excluded.
- `hv.soc` rows were `NOT_LISTED` and correctly ignored.

The status filter was therefore left canonical — it reuses
`isCapabilityMeasurementEnabled()` from the battery-capability authority rather
than narrowing `AVAILABLE_NULL` locally, which would have forked the taxonomy.
The applicability matrix is the single suppression point.

### FULL run evidence

| Metric | Value |
|--------|-------|
| `codeShaUnderTest` | `dace008c12b385ab4ce6ccfa68fc224b46ff5615` |
| `baseMainSha` | `5037c543f17b719575e55433e70fcc3808db517c` |
| `dbComparisonEnabled` / `dbComparisonStatus` | `true` / `ok` |
| Telemetry GraphQL requests (TOTAL) | **225** |
| — capability probes | 5 |
| — mechanism requests | 220 (refuel 176 + recharge 44) |
| Token exchange requests | 6 |
| Developer auth requests | 1 |
| Retries | 0 |
| Vehicle classes | 4 ICE/refuel eligible + 1 EV/recharge + 1 inaccessible (ICE); 0 PHEV, 0 UNKNOWN, 0 `CAPABILITY_UNKNOWN` |
| Refuel detections | 18 |
| Recharge detections | 3 |
| WOULD_CREATE | 3 (`CANONICAL_REFUEL_CASE` + 2 `EV_A` recharge) |
| WOULD_UPDATE | 1 (`CANONICAL_RECHARGE_OVERLAP_CASE`) |
| WOULD_SKIP_NOT_PERSISTABLE | 2 |
| MANUAL_REVIEW_REQUIRED | 15 (13 `EXCLUDE_FROM_BACKFILL` + 2 `NEEDS_FURTHER_EVIDENCE`) |
| FETCH_FAILED | 0 |
| DB vehicle mapping failures | 0 |
| `dbWritesPerformed` | `false` |
| `CANONICAL_REFUEL_CASE` | `WOULD_CREATE` (Aug 2026) |
| Gate | `READY AFTER MANUAL REVIEW OF 2 EVENTS` (`MANUAL_REVIEW_UNRESOLVED:2`) |

**Telemetry note:** mechanism traffic moved 396 → 220 because canonical
applicability stops recharge-segment queries on ICE vehicles that merely had a
listed recharge-segments capability row. `availableSignals` probes (5) are now
included in the reported total, so `telemetryGraphqlRequests` is 225 rather than
mechanism-only 220. **All detection and classification counts are unchanged**,
which is the semantic-equivalence result: the fix removed wasted provider traffic
and a misleading vehicle classification without moving a single recovery outcome.

**Provenance note:** `codeShaUnderTest` is the code commit the run executed. The
commit that carries this artifact necessarily follows it, so the artifact commit
SHA differs from `codeShaUnderTest` by design.

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
