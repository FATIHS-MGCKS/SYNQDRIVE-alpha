# Energy Events E3A — Observability + Historical Recovery Dry Run (2026-08)

**Phase:** E3A only (read-only preview). **Depends on:** E1 (#1366), E2 (#1370) merged on `main` @ `ba0bdd621`.  
**Absolute rule:** no `VehicleEnergyEvent` create/update/delete during this phase.

---

## 1. Baseline verification

| Item | Value |
|------|-------|
| **main SHA** | `ba0bdd621ba96e42abbda8fee442c36849dd5905` |
| **detectorConfigVersion** | `e2-2026-08` |
| **refuel config** | `{ minIncreasePercent: 5 }` |
| **recharge config** | DIMO default (omit `config`) |

Detector thresholds were **not** modified in E3A.

---

## 2. Outage window

| Boundary | ISO timestamp |
|----------|---------------|
| **Recovery analysis start** | `2026-07-16T00:00:00.000Z` |
| **Last healthy refuel (audit)** | `2026-07-16T05:52:00.000Z` |
| **Last healthy recharge (audit)** | `2026-07-17T00:02:00.000Z` |
| **Fixed recovery cutoff (E3A)** | `2026-08-28T08:00:00.000Z` |

Processing uses the fixed cutoff — not unbounded `Date.now()`.

---

## 3. Affected vehicle inventory (fleet fallback, Aug 2026)

When `DATABASE_URL` is unavailable, the dry-run uses the audited DIMO-connected fleet fallback (5 vehicles). With production DB, the same vehicles load via read-only Prisma `SELECT`.

| Label | tokenId | Class | Fuel signals | Recharge signals |
|-------|---------|-------|--------------|------------------|
| KS MX 2024 | 187336 | REFUEL_CANDIDATE | relative + absolute | — |
| VW Arteon ICE | 187784 | REFUEL_CANDIDATE | relative + absolute | — |
| Audi A4 (KS MS 661) | 187361 | REFUEL_CANDIDATE | absolute only | — |
| VW Tiguan ICE | 192922 | REFUEL_CANDIDATE | relative + absolute | — |
| KS FH 660E Tesla | 186946 | RECHARGE_CANDIDATE | — | SOC |

All five had DIMO access during the dry-run (`FETCH_FAILED` = 0).

---

## 4. Bounded window strategy

- **Window size:** 24 hours (`ENERGY_EVENTS_RECOVERY_WINDOW_MS`)
- **Semantics:** non-overlapping `[from, to)` — inclusive start, exclusive end
- **Windows per vehicle:** 44 (Jul 16 00:00 UTC → Aug 28 08:00 UTC)
- **Per vehicle × mechanism:** one combined DIMO fetch per window (production `fetchEnergyEventSegments` path)
- **Rate limiting:** 500 ms inter-request delay (full run); resume-friendly sequential per-vehicle loop
- **Proposed real backfill concurrency:** 2 (no uncontrolled `Promise.all` over fleet)

Implementation: `energy-events-window.util.ts` → `splitRecoveryQueryWindows()`.

---

## 5. Read-only detection pipeline

Dry-run reuses production E2 configuration and pipeline semantics:

```
DIMO fetch (E2 query builders)
  → normalization (parse-energy-event-segment)
  → persistability gate (energy-events.pipeline)
  → coalescing
  → deterministic dimoSegmentId
  → DB comparison (read-only)
  → plausibility flags
  → classification (no writes)
```

Entry points:
- `scripts/ops/energy-events-recovery-dry-run.ts`
- `energy-events-recovery-runner.ts`
- `energy-events-recovery-dry-run.ts` (`simulateRecoveryWindow`)

---

## 6. Full dry-run results (2026-08-28)

Artifact: `artifacts/energy-events-recovery-dry-run-2026-08.json`

| Metric | Value |
|--------|-------|
| **DIMO HTTP requests** | 220 |
| **Raw refuel detections** | 18 |
| **Raw recharge detections** | 3 |
| **Logical candidates** | 21 |
| **WOULD_CREATE** | 8 |
| **WOULD_UPDATE** | 0 |
| **ALREADY_IDENTICAL** | 0 |
| **WOULD_SKIP_NOT_PERSISTABLE** | 2 |
| **WOULD_REPLACE_LEGACY_SUBSEGMENTS** | 0 |
| **MANUAL_REVIEW_REQUIRED** | 11 |
| **FETCH_FAILED** | 0 |
| **dbWritesPerformed** | `false` |

### Acceptance cases

**KS MX 2024 (tokenId 187336, 23 Aug 2026):**
- Found: **yes**
- Segment: `2026-08-23T16:15:15Z` → `2026-08-23T16:23:16Z`
- Fuel: ~13% → ~42% (16 L, Δ29.4%)
- Classification: **WOULD_CREATE** (not yet in DB in fallback mode; post-E2 automatic processing may have created it in production — full DB comparison requires `DATABASE_URL` on VPS)

**Tesla KS FH 660E (tokenId 186946):**
- Recharge sessions in outage window: **3**
- WOULD_CREATE: **3**
- ALREADY_IDENTICAL: **0**
- MANUAL_REVIEW_REQUIRED: **0**
- DIMO default detector returns historical recharge sessions (including post-outage recovery boundary `2026-07-17T00:05:02Z`)

### Manual review reasons (11 events)

Primarily `refuel_duration_very_long` on multi-hour refuel segments that DIMO returns as single events. These are flagged for human review before write-back — not silently dropped.

---

## 7. Traffic / rate-limit budget (real backfill estimate)

| Parameter | Value |
|-----------|-------|
| Eligible vehicles | 5 |
| Windows per vehicle | 44 |
| Expected DIMO requests | 220 |
| Worst case with retries (×3) | 660 |
| Proposed concurrency | 2 |
| Inter-request delay | 500 ms |
| Estimated runtime | ~2 min (sequential budget; ~1 min at concurrency 2) |

---

## 8. Observability changes (E3A)

New Prometheus metrics via existing `TripMetricsService` registry (`EnergyEventsMetricsService`):

| Metric | Purpose |
|--------|---------|
| `synqdrive_energy_events_detection_runs_total` | Per-run success/partial/no_token |
| `synqdrive_energy_events_mechanism_fetch_total` | Per-mechanism SUCCESS_WITH_EVENTS / SUCCESS_EMPTY / FAILED |
| `synqdrive_energy_events_segments_detected_total` | Raw DIMO segments |
| `synqdrive_energy_events_segments_persistable_total` | Post persist-gate |
| `synqdrive_energy_events_created/updated/skipped_total` | Persist outcomes |
| `synqdrive_energy_events_pruned_total` | Legacy sub-segment replacements |
| `synqdrive_energy_events_dimo_http_422_total` | GraphQL validation failures |
| `synqdrive_energy_events_dimo_retryable_failures_total` | Retryable DIMO errors |
| `synqdrive_energy_events_detection_duration_seconds` | Wall duration histogram |
| `synqdrive_energy_events_fleet_zero_persist_total` | Zero-event runs with `had_fetch_failure` label |

All counters include `detector_config_version=e2-2026-08` where applicable.

`EnergyEventsService` records metrics on each detection run when `EnergyEventsMetricsService` is injected.

---

## 9. Per-vehicle cursor / health (audit)

**Current state:** No durable per-vehicle energy-detection cursor model exists in Prisma.

Recommended minimal E3B schema (`VehicleEnergyDetectionStatus`):

```
vehicleId (PK, FK)
lastAttemptAt
lastSuccessAt
lastFailureAt
lastError (text, truncated)
lastSuccessfulWindowEnd
consecutiveFailures (int)
detectorConfigVersion
updatedAt
```

Not implemented in E3A — semantics need agreement before migration.

---

## 10. Zero-event failure detection (multi-signal)

The Jul outage survived because zero persisted events did not alarm. E3A adds:

1. **`fleet_zero_persist` counter** — increments when a run persists 0 events; label `had_fetch_failure=true|false` distinguishes transport failure from quiet success.
2. **Mechanism fetch failure metrics** — per-mechanism FAILED + HTTP 422 counters.
3. **Consecutive failure tracking** — deferred to E3B cursor model.

**Operational guidance (alerting, not implemented in E3A):**

- Alert when `fleet_zero_persist{had_fetch_failure="false"}` rises across **multiple consecutive reconciliation cycles** AND at least one ICE/EV vehicle has fuel/recharge signals.
- Correlate with `mechanism_fetch_total{status="FAILED"}` and `dimo_http_422_total`.
- Do **not** alert on a single 24h zero-event window for a legitimately idle fleet.

---

## 11. Tests

| Test file | Coverage |
|-----------|----------|
| `energy-events-recovery-dry-run.spec.ts` | Classifications 1–7, window util, persist gate |
| `energy-events-recovery-no-write.spec.ts` | Zero Prisma `vehicleEnergyEvent` mutations |
| `energy-events.service.spec.ts` | E1 prune isolation + E2 KS MX fixture (regression) |
| `dimo-energy-detector.config.spec.ts` | E2 config version + KS MX timestamps |

42 focused tests pass (energy-events + dimo-energy-detector suites).

---

## 12. Final backfill gate

**READY AFTER MANUAL REVIEW OF 11 EVENTS**

Rationale:
- KS MX canonical case found as WOULD_CREATE ✓
- Tesla recharge verified ✓
- Zero fetch failures ✓
- Zero DB writes ✓
- 11 refuel segments flagged for long-duration manual review before controlled write-back

---

## 13. Remaining risks

1. Full fleet may exceed 5 fallback vehicles — production `DATABASE_URL` comparison needed on VPS.
2. Long-duration refuel segments need human review policy before E3B write-back.
3. Per-vehicle cursor not yet durable — backfill resume depends on deterministic windows + idempotent `dimoSegmentId`.
4. Audi A4 (absolute-only fuel) may have different refuel sensitivity — monitor post-backfill.

---

## 14. Files changed

- `energy-events.pipeline.ts` — extracted shared production pipeline
- `energy-events-metrics.service.ts` — Prometheus observability
- `energy-events-observability.module.ts` — Nest wiring
- `energy-events-recovery-*.ts` — dry-run types, runner, simulation, plausibility, constants, window util
- `scripts/ops/energy-events-recovery-dry-run.ts` — ops entrypoint
- `scripts/ops/energy-events-standalone-dimo-fetch.ts` — Nest-free DIMO fetch for Cloud Agent
- `parse-energy-event-segment.ts` — shared segment parser
