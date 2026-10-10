# EED-EV-0104 Addendum — WOB concentration accounting correction (R4A)

**Parent evidence:** EED-EV-0104 (2026-10-01) — **historical body preserved unchanged**  
**Correcting agent:** R4A calibration integrity (2026-10-10)  
**Machine registry:** `evidence/data/RFRF-OQ014-R4A-EVENT-ACCOUNTING.json`

## Finding

EED-EV-0104 §2 eligible-event **table** lists **three** WOB L 7503 events:

| Event ID |
|----------|
| `WOB_7503_2026_09_19` |
| `WOB_7503_2026_09_27_EVENT_B` |
| `WOB_7503_2026_09_15` |

The same document’s narrative metrics state:

- `MAX_EVENTS_FROM_SINGLE_VEHICLE = 4`
- `FRACTION_EVENTS_FROM_SINGLE_VEHICLE = 0.667` (4/6)

Those narrative metrics are **inconsistent** with the authoritative eligible ID list (3/6 = **0.5**).

## Root cause (classification)

The locality sensitivity matrix (§5) reports `NATURAL_READY = 4` at the 30s cap — meaning **four events** still pass that **offline cap**, not **four WOB events**. The vehicle-concentration sentence appears to have conflated the two notions.

## Corrected concentration (eligible N=6)

| Field | Corrected value |
|-------|-----------------|
| WOB L 7503 eligible count | **3** |
| Fraction of eligible set | **0.5** |
| KS MS 661 | 1 |
| KS MX 2024 | 2 |

## Non-effects

- Eligible event **IDs** in EED-EV-0104 §2 table remain authoritative — no event added or removed.
- Drop/timing/locality population splits (N=6 / N=5 / N=5) unchanged.
- WOB 2026-09-19 delayed-observation semantics unchanged — **2325 s** is **observation delay**, not admissible physical settling duration for timing calibration.
