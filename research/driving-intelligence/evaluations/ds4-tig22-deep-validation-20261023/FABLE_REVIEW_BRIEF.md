# Fable review brief — TIG22 deep validation

Independent review requested on **mathematics** and **architecture coupling**, not on parameter tuning against the same video tables.

## Scope

- Trip `98d2a8e0-8b7d-4529-bf76-acee44d61fbe`, VW Tiguan, 2026-10-22 (user window 20:30–21:04 Europe/Berlin).
- Video GT ends **2026-10-22T19:03:02Z**; later seconds are `UNSCORED_VIDEO_GAP` by policy.
- Code pin **716f93fed**; C5.1 V1.2 frozen safety profile.

## Open mathematical questions

1. **L3 vs QC vs C4 on scored seconds:** Raw L3 still carries rare catastrophic errors (max abs error ≫ 100 km/h) while QC-trusted and C4 agree closely (MAE ≈ 2.9 km/h, P95 ≈ 5.9 km/h). Is the QC policy’s exclusion of outliers sufficient as the product-facing contract, or should L3 estimation itself fail-closed earlier on RUPTELA_R1 legs?
2. **C5.1 repair acceptance rate on TIG22:** Only **1** `REPAIR_ACCEPTED` bucket vs **22** `REPAIR_REJECTED` on this trip. Are Q5/Q6 gates appropriately conservative for Tiguan 4.5 m/s², or is the trip simply devoid of repairable C4 defects?
3. **Event oracle v2_gap2s:** Twelve of eighteen oracle manoeuvres `ERKANNT`, four `VERPASST_GRENZWERTIG`, one `VERPASST_KEINE_DS4_GESCHWINDIGKEIT`, one hard `VERPASST`. Is borderline classification stable under ±1 s reference uncertainty without re-picking the best shift?
4. **FSM stop/start timing:** Several video zero-runs show `stopOffsetS` up to **+5 s** (e.g. ref stop 18:41:01Z). Is this within acceptable product latency for rental ops, or a fundamental C4-speed input issue?

## Open architecture questions

1. **FSM remains on C4** while C5.1 can feed the event detector only in shadow (`processDiV0MotionCoreShadowTrip`). Confirm whether any production path could consume C5.1 speed without an explicit FSM re-wire.
2. **OBD excluded from DS4 FSM** (`R1_VEHICLE_SPEED_EXCLUDED_FROM_DS4_FSM`). On Tiguan, does sparse OBD still help human operators even when correctly non-authoritative?
3. **Post-video tail (19:03–19:04Z):** Large C4 values with `SPARSE_SUPPORT` / `NO_POSITION` while FSM stays `MOVING`. What is the correct user-facing behaviour when GT is absent?

## Artifacts to read first

1. `outputs/metrics.json` — authoritative numerators/denominators
2. `outputs/per_second.csv` — full trip grid
3. `outputs/anomalies.csv` — problem windows
4. `outputs/events_comparison.csv` — oracle v2_gap2s rows (C4 and C5.1 event series)

Do **not** re-optimize thresholds using these sealed references; classify findings as CONFIRMED / LIKELY / OPEN / UNSCORED only.
