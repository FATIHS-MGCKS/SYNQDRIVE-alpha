# Runbook: Brake Health Measurement Campaign

| Field | Value |
|-------|-------|
| **Valid from** | Post-remediation branch `fix/brake-health-production-readiness-2026-07` (Prompt 26) |
| **Purpose** | Collect repeatable ground-truth thickness measurements for model validation — **not** automatic calibration |
| **Related** | [`brake-health-production-rollout.md`](./brake-health-production-rollout.md), [`brake-health-component-baseline-backfill.md`](./brake-health-component-baseline-backfill.md) |

> **Principle:** Technically repaired ≠ empirically validated. Until sufficient repeated measurements exist per component, the correct model-validity verdict remains **`NOT_ENOUGH_DATA`**. Do **not** enable thickness-based auto-calibration or claim MAE/RMSE accuracy.

---

## 1. Campaign goals

1. Establish **verified** pad/disc thickness per component (Front/Rear Pads, Front/Rear Discs).
2. Link each measurement to **odometer**, **timestamp**, and **workshop method**.
3. Confirm **reference spec** and **component minimum thickness** per vehicle.
4. Confirm **component installation** rows after replacement events.
5. Enable future backtest (`audit-brake-health-backtest.ts`) with `TRUE_PAD_MEASUREMENT` / `TRUE_DISC_MEASUREMENT` rows.

**Out of scope for this campaign:**

- Automatic k-factor calibration writes (`calibrateFromMeasurement` is not production-ready).
- Fleet-wide production backfill without supervised staging validation.
- Treating registration spec or rotor width as measured thickness.

---

## 2. Pilot vehicle selection

Select **3–5 pilot vehicles** covering:

| Profile | Why |
|---------|-----|
| NEW registration with documented spec only | Validates spec vs measured separation |
| USED with recent brake service | Validates scoped installation + evidence |
| High TDI coverage (≥80% trip km modeled) | Validates wear model inputs |
| DIMO braking events present | Validates event ledger correlation |
| Active brake-related DTC (if any) | Validates safety evidence path |

Record anonymized IDs in campaign log (never VIN in shared docs).

---

## 3. Per-vehicle protocol (7 steps)

### Step 1 — Baseline measurement (T0)

Measure **all four components** where accessible:

- Front pad thickness (mm)
- Rear pad thickness (mm)
- Front disc thickness / minimum (mm) if measurable
- Rear disc thickness / minimum (mm) if measurable

Record:

- `measuredAt` (UTC)
- `odometerKm` (from canonical vehicle state, not guessed)
- Workshop / method (e.g. visual gauge, workshop protocol, AI upload confirmed)
- Operator ID

**API:** `POST /vehicles/:id/brake-health/service` with `kind: inspection_only` and `measured: { frontPadMm, rearPadMm, frontDiscMm, rearDiscMm }`  
Or dedicated measurement intake per org process.

### Step 2 — Reference spec confirmation

- Open vehicle brake reference spec in admin / registration flow.
- Confirm per-component nominal and **minimum thickness** where known.
- Mark `userConfirmedAt` when operator validates manufacturer/workshop values.
- Reject legacy rotor width as disc thickness (see Prompt 10 semantics).

### Step 3 — Component installation confirmation

After any replacement service:

- Verify `brake_component_installations` row exists for replaced scope only.
- Verify anchor thickness matches service measured values or documented replacement.
- Verify unaffected components unchanged (partial service regression).

### Step 4 — Driving period

- Target **≥ 1 500 km** or **≥ 30 days** (whichever comes first) before T1.
- Ensure trips complete and `trip_driving_impact` rows materialize.
- Monitor `synqdrive_brake_trip_coverage_ratio` and `synqdrive_brake_trip_missing_impact_total`.

### Step 5 — Repeat measurement (T1)

Repeat Step 1 protocol. Same workshop method preferred.

### Step 6 — Service / replacement events

When pads or discs are replaced during campaign:

- Record full service with explicit `scope` (never implicit full-vehicle reset).
- Capture post-service measurement.
- Document fluid-only and inspection-only controls (anchors must not reset).

### Step 7 — Documentation package

Per pilot vehicle, archive:

- T0/T1 measurement sheets (anonymized)
- Odometer screenshots / export
- Service event IDs
- Component installation IDs
- Snapshot IDs after recalculation
- Screenshot of UI evidence panel (`BrakeEvidencePanel`) showing MEASURED vs ESTIMATED labels

---

## 4. Data quality gates

| Check | Pass criteria |
|-------|---------------|
| Spec ≠ measurement | `dataBasis` must not be `MEASURED` when only spec exists |
| Partial service | Only scoped components change anchors |
| Duplicate evidence | Same measurement bucket does not create duplicate rows |
| Temporal leakage | Pre-T1 replay must not use post-T1 evidence |
| Estimated critical | Rental decision `MEASUREMENT_REQUIRED`, not `HARD_BLOCK` without measured basis |

---

## 5. Backtest readiness criteria

Run `scripts/audits/audit-brake-health-backtest.ts` only when:

| Component | Minimum paired points (predicted + measured) |
|-----------|---------------------------------------------|
| Front Pads | ≥ 5 |
| Rear Pads | ≥ 5 |
| Front Discs | ≥ 3 |
| Rear Discs | ≥ 3 |

Until then, report **`NOT_ENOUGH_DATA`** for all MAE/RMSE/Bias metrics.

---

## 6. Reporting template

```markdown
## Pilot <VEHICLE_ANON> — measurement campaign

| Field | T0 | T1 |
|-------|----|----|
| Date | | |
| Odometer km | | |
| Front pad mm | | |
| Rear pad mm | | |
| Front disc mm | | |
| Rear disc mm | | |
| Method | | |

- Reference spec confirmed: yes/no
- Installations verified: yes/no
- km since T0:
- Recalculation snapshots:
- Backtest eligible: yes/no (NOT_ENOUGH_DATA until thresholds met)
```

---

## 7. Explicit non-actions

- **Do not** run `calibrateFromMeasurement` fleet-wide.
- **Do not** treat `brakePadPercent` HM telemetry as ground truth.
- **Do not** promote `SPEC_ONLY` backfill candidates to measured anchors without workshop proof.
- **Do not** enable production hard blocks from estimated wear until campaign + shadow replay sign-off.
