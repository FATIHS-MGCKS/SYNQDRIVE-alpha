# P2.5 Addendum — LTE_R1 standby battery-voltage device source cadence

| Field | Value |
|-------|-------|
| **Evidence ID** | VDC-EVID-P25-STANDBY-LV-CADENCE-001 |
| **Captured at (UTC)** | `2026-10-02T23:55:00Z` |
| **Method** | Read-only Production PostgreSQL (`battery_measurements`); no deploy, no mutation |
| **User operational context** | Ruptela/LTE_R1 devices **intentionally configured** for ~**8 h** standby **battery-voltage** uploads |
| **R9O-1/R9O-2** | **UNCHANGED** — this addendum is mandatory input for subsequent **APD / adaptive polling policy** only |

## A. Battery-voltage signal path (repository)

| Field | Value |
|-------|-------|
| **BATTERY_VOLTAGE_SIGNAL_PATH** | DIMO GraphQL `lowVoltageBatteryCurrentVoltage` → `SIGNAL_SPECS.lvBatteryVoltage` in `dimo-battery-signal.mapper.ts` → snapshot processor `lvBatteryVoltage` / `resolveLvBatteryObservedAt` → durable rest path `battery_measurements` type `LIVE_VOLTAGE` with **`provider_timestamp`** (provider/signal time, not fetch time) |
| **BATTERY_VOLTAGE_SOURCE_TIMESTAMP_AVAILABLE** | **YES** on DIMO signal object (`timestamp` on `lowVoltageBatteryCurrentVoltage`); persisted as `battery_measurements.provider_timestamp` for LIVE_VOLTAGE captures |
| **BATTERY_VOLTAGE_PROVIDER_TIMESTAMP_AVAILABLE** | **YES** (same field — DIMO provider time on the LV signal) |
| **BATTERY_VOLTAGE_ARRIVAL_TIMESTAMP_AVAILABLE** | **YES** as `battery_measurements.observed_at` (SynqDrive ingest/persist time) — **distinct** from `provider_timestamp` |

**Rule:** Do **not** use `vehicle_latest_states.providerFetchedAt` or poll `startedAt` as LV **source** time.

**HV note:** Tesla R9 vehicle KS FH 660E (`tokenId` 186946) is BEV; standby LV ICE cohort rules do not apply — use traction/HV signals separately for that unit.

## B. T7 cross-check (ANY_SOURCE vs LV-specific)

Prior T7 aggregate (user-reported, not re-derived in this pass):

`STANDBY_P95_ANY_SOURCE_ADVANCE_INTERVAL_SECONDS=30347.14` (~**8.43 h**).

**2026-10-02 Production read-only — R9 authorized ICE LTE_R1 strict-rest LV gaps** (`provider_timestamp` advances, engine off, speed ≤ 0.5 km/h, not charging):

| Statistic | Seconds | Hours |
|-----------|---------|-------|
| COUNT (gaps > 60 s) | 425 | — |
| P10 | 366 | 0.10 |
| P25 | 1,065 | 0.30 |
| **MEDIAN** | **8,413** | **2.34** |
| P75 | **29,941** | **8.32** |
| P90 | 70,244 | 19.5 |
| **P95** | **87,726** | **24.4** |
| P99 | 203,506 | 56.5 |
| MAX | 1,159,227 | 322 |

**Histogram (fleet, gaps > 60 s):**

| Bucket | Count |
|--------|------:|
| <1 h | 164 |
| 1–4 h | 68 |
| 4–6 h | 29 |
| 6–7 h | 7 |
| **7–9 h** | **63** |
| 9–12 h | 18 |
| 12–24 h | 44 |
| >24 h | 32 |

**Interpretation:**

- **P75 ≈ 8.3 h** is **consistent** with the user-configured ~8 h standby LV cadence **and** with T7’s ~8.43 h **P95 ANY_SOURCE** figure — but **LV-specific P95 is ~24.4 h** (top-level / other signals still advance on ~24 h scale per KS MX 2024 forensics).
- **Correlation of T7 ANY_SOURCE P95 with configured 8 h LV is PLAUSIBLE but NOT YET PROVEN source-specifically** — must not treat ANY_SOURCE_ADVANCE as battery-voltage cadence.

### Per-vehicle LV standby gaps (ICE subset of R9 cohort)

| tokenId | Plate | gap_n | P50 (s) | P95 (s) | 7–9 h gaps | % in 7–9 h |
|---------|-------|------:|--------:|--------:|-----------:|-----------:|
| 187336 | KS MX 2024 | 54 | 28,960 (~8.0 h) | 196,817 | 20 | 37.0% |
| 187361 | KS MS 661 | 81 | 28,885 (~8.0 h) | 167,661 | 17 | 21.0% |
| 187784 | HMÜ C 215 | 150 | 2,386 (~40 min) | 85,930 | 7 | 4.7% |
| 192922 | WOB L 7503 | 140 | 9,050 (~2.5 h) | 58,796 | 19 | 13.6% |

| Field | Value |
|-------|-------|
| **CONFIGURED_STANDBY_VOLTAGE_INTERVAL_HOURS** | 8 |
| **OBSERVED_8H_CADENCE_PRESENT** | **YES** (63 fleet gaps in 7–9 h; KS MX / KS MS medians ~8 h) |
| **OBSERVED_8H_CADENCE_VEHICLE_COUNT** | **2** (median gap within 7–9 h: KS MX, KS MS 661) |
| **OBSERVED_8H_CADENCE_MATCH_RATE** | **14.8%** of fleet LV gaps in 7–9 h (63/425); per-vehicle rates vary |

Prior M3.3B fleet forensics ([`M3_3B_R1_NATURAL_CADENCE_FORENSICS_2026-09-21.md`](../../battery-v2/research/M3_3B_R1_NATURAL_CADENCE_FORENSICS_2026-09-21.md)): **multimodal** rest cadence — **8 h component supported**, not a tight unimodal clock; **automatic REST_WAKE tolerance not validated**.

## C. Separate sources (status)

| Source | STANDBY per-signal advance audit | Notes |
|--------|----------------------------------|-------|
| **BATTERY_VOLTAGE (LV)** | **DONE** (this document, Production PG) | `LIVE_VOLTAGE` + `provider_timestamp` |
| **TOP_LEVEL_SOURCE** | **CONFIRMED_HISTORICAL** | KS MX ~24 h strict `sourceTimestamp` advances ([LTE_R1_KS_MX_2024_PRODUCTION_FORENSICS.md](./LTE_R1_KS_MX_2024_PRODUCTION_FORENSICS.md)) |
| **OBD / SPEED / IGNITION** | **NOT_RUN** (ClickHouse auth blocked on 2026-10-02 agent pass) | Requires read-only CH `telemetry_snapshots` strict advances by signal family during RESTING/STANDBY windows |

**Required follow-up:** run `TOTAL_POLLS`, `SOURCE_ADVANCE_EVENTS`, `INFORMATION_GAIN_RATE`, and per-source P95 on CH + `dimo_poll_logs` when CH credentials available.

## D. Device cadence vs provider/fetch cadence

| Stage | LV standby evidence |
|-------|---------------------|
| **DEVICE_SOURCE_ADVANCE** | New distinct `battery_measurements.provider_timestamp` for LIVE_VOLTAGE |
| **PROVIDER_AVAILABILITY** | DIMO exposes new `lowVoltageBatteryCurrentVoltage.timestamp` when device uploads (~8 h configured; observed multimodal) |
| **SYNQDRIVE_DISCOVERY** | SynqDrive learns via snapshot/rest capture paths; **poll interval ≠ source interval** ([`battery-signal-cadence-reality.md`](../../../docs/audits/battery-signal-cadence-reality.md): ~30 s polls, **median unique provider gap 0 s** on top-level CH mirror) |

| Field | Value |
|-------|-------|
| **API_POLLING_CAN_FORCE_NEW_BATTERY_DATA** | **NO** — polling cannot create device uploads; it only re-reads provider state |
| **API_POLLING_ONLY_REPEATS_LAST_PROVIDER_DATA** | **YES** (dominant for snapshot mirror until provider advances) |

## E. Phase-locked polling (evaluation only — not implemented)

Concept: `EXPECTED_NEXT_VOLTAGE_WINDOW = lastTrustworthyLvSourceAt + observedDeviceCadence ± tolerance`.

| Field | Value |
|-------|-------|
| **PHASE_LOCKED_RECONCILIATION_FEASIBLE** | **YES_WITH_BOUNDED_TOLERANCE** for **battery reconciliation** only, after per-vehicle cadence calibration — **not** for exact 8 h phase lock (jitter + 24 h top-level modes); M3.3B policy gate remains **CADENCE_EXISTS_BUT_POLICY_TOLERANCE_NOT_READY** |

## F–G. R9 independence and watchdog separation

| Invariant | Status |
|-----------|--------|
| **TRIP_WAKE_REMAINS_INDEPENDENT** | **YES** — R9 speed/ignition webhook → canonical snapshot → Trip FSM unchanged by this addendum |
| **BATTERY_RECONCILIATION_SEPARATED_FROM_TRIP_WATCHDOG** | **YES** — long LV cadence must not lengthen Trip Start watchdog; separate **TRIP_START_WATCHDOG** vs **BATTERY_DATA_RECONCILIATION** intervals in future APD design |

## Tooling

Read-only script: `backend/scripts/ops/p25-standby-lv-cadence-audit-readonly.cjs` (run from VPS `backend` with `DATABASE_URL` or via embedded SQL pattern in ops runbook).
