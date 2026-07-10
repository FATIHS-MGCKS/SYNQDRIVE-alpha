# Driving Assessment Device Quality — Phase 0 Evidence (2026-07-10)

## Target

| Field | Value |
|-------|-------|
| Vehicle | WOB L 7503 — VW Tiguan |
| hardwareType | LTE_R1 |
| DIMO tokenId | 192922 |
| vehicleId | `19fedd4b-c4e8-4de8-a125-dab293326e7e` |
| Org | `faa710c9-6d91-4079-a7d5-91fdccdec14a` |
| DIMO connectionStatus | CONNECTED |

## Executive finding

**Confirmed:** The Tiguan exhibits sustained **native `behavior.harshAcceleration` event spam** far above fleet baseline, beginning ~2026-07-08. This is **volume/frequency anomaly**, not primarily ±2s burst duplication.

- System marks all affected trips `analysisAssessability=FULL` — no quality warning today.
- `drivingScore` drops to ~34–38 on spam trips (vs calm trips ~7.8).
- OBD contact flutter is **not** the dominant signal (1 unplug webhook in 21d).

Aligns with DIMO diagnosis: loose OBD fit / incorrect self-calibration → unreliable harsh-event stream.

## Metrics (21 days, 20 completed trips)

### Target vehicle

| Metric | Value |
|--------|-------|
| Total raw native events | 382 |
| Median raw events / trip | 10.5 |
| Max raw events / trip | 84 |
| Median events / km | 3.04 |
| Max events / km | **60.0** (1.4 km trip) |
| Median burst-dup ratio (±2s same type) | 1.9% |
| Max burst-dup ratio | 17% |
| Median raw vs visible dedup ratio | 1.02 |
| Trips with ≥5 raw events | 12 / 20 |

### Fleet baseline (5 peer LTE_R1, same org)

| Metric | Value |
|--------|-------|
| Trips with any native events | 15 |
| Median raw events / trip | **2** |
| P95 raw events / trip | **3** |
| Median events / km | **0.20** |
| P95 events / km | **1.11** |

**Target vs fleet:** ~5× median events/trip, ~15× median events/km, up to **54×** on worst short trip.

## Temporal pattern

| Period | Behavior |
|--------|----------|
| Before 2026-07-08 | Mostly 0 native events; one cornering event on 2026-07-07 |
| From 2026-07-08 | Sustained high-volume `HARSH_ACCELERATION` on almost every trip |

## Event character (worst trip: 2026-07-08, 84 events / 1.4 km)

- **Types:** 78× `HARSH_ACCELERATION`, 6× `HARSH_CORNERING`
- **DIMO name:** `behavior.harshAcceleration`
- **counterValue distribution:** 56× counter=1, 21× counter=2, 6× counter=3, 1× counter=4
- **Median inter-event gap:** 14s (machine-like cadence)
- **min gap:** 0ms (some co-timestamped pairs)

“Duplizierend” in user terms = repetitive same-type firing every ~14–20s with recurring counter values, not heavy same-second duplicate buckets (`sameSecGroups=0` on all trips).

## KPI / assessment gap

- `hardAccelerationCount` matches raw ingest (e.g. 52 accel KPI = 52 raw events).
- `hardBrakingCount` / `abuseEvents` = 0 (spam is acceleration-only).
- `analysisAssessability` = **FULL** on all spam trips — **false confidence**.
- Read-model ±2s dedup removes only ~5–20% of rows — insufficient for this failure mode.

## Device connection (secondary)

- 21d: 1× `OBD_DEVICE_UNPLUGGED` — not comparable to WOB X 6511 contact-flutter case.

## Detector preview (proposed thresholds)

Using draft rules: `eventsPerKm ≥ 2` OR `raw ≥ 8` OR `burstRatio ≥ 30%` OR `raw/visible ≥ 2`:

- **12 / 20 trips flagged**
- **Vehicle-level DEGRADED would activate** (≥2 flagged trips)

**Recommendation:** Primary detector signal = **eventsPerKm vs org LTE_R1 baseline** + **median inter-event cadence < 30s with high count**, not burst-duplicate ratio alone.

## Diagnostic script

`backend/scripts/analyze-lte-r1-driving-event-quality.ts`

```bash
cd backend && npx ts-node -r tsconfig-paths/register scripts/analyze-lte-r1-driving-event-quality.ts --plate 7503 --days 21
```
