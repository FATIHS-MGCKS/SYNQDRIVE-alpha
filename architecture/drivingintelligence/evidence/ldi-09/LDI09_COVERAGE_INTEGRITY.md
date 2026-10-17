# LDI09 — Coverage integrity

**Source:** frozen `LDI08_COMBINED_SNAPSHOT.json` · **Trip:** `f3e1fa83-d1e3-46b9-9ab8-14b4676ec5c9`

## QC trust buckets (denominator = shadow grid rows)

| Class | Buckets | % of grid |
|-------|---------|-----------|
| **TRUSTED** (strict) | 289 | 79.83% |
| **TRUSTED_LIMITED** | 5 | 1.38% |
| **TRUSTED ∪ TRUSTED_LIMITED** | 294 | 81.22% |
| **UNTRUSTED** | 52 | 14.36% |
| **ROW_ABSENT** (GPS) | 16 | 4.42% |
| **UNKNOWN QC** | 0 | 0.00% |

## Fusion-assessable seconds (28 in LDI-08)

Single calendar bucket where gps.availability=PRESENT AND l3.speedKmh numeric AND l3.qcTrustLevel in {TRUSTED,TRUSTED_LIMITED} AND obd.speedKmh numeric AND hf.speedKmh numeric (LDI03_COVERAGE multiStreamNumeric; no interpolation)

- **Denominator:** shadow_interval_count (one row per 1s evaluation index in pin) (= 362 rows)
- **Numerator:** **28** buckets meeting all conjunctive stream predicates
- **Fraction:** 7.73%

<details><summary>Assessable bucket labels (UTC)</summary>

- `2026-10-13T15:53:06Z`
- `2026-10-13T15:53:07Z`
- `2026-10-13T15:53:14Z`
- `2026-10-13T15:53:17Z`
- `2026-10-13T15:53:18Z`
- `2026-10-13T15:53:25Z`
- `2026-10-13T15:53:33Z`
- `2026-10-13T15:53:37Z`
- `2026-10-13T15:53:38Z`
- `2026-10-13T15:53:50Z`
- `2026-10-13T15:53:51Z`
- `2026-10-13T15:53:57Z`
- `2026-10-13T15:54:06Z`
- `2026-10-13T15:54:28Z`
- `2026-10-13T15:54:36Z`
- `2026-10-13T15:54:43Z`
- `2026-10-13T15:54:50Z`
- `2026-10-13T15:54:55Z`
- `2026-10-13T15:55:01Z`
- `2026-10-13T15:55:06Z`
- `2026-10-13T15:55:26Z`
- `2026-10-13T15:55:46Z`
- `2026-10-13T15:56:06Z`
- `2026-10-13T15:56:50Z`
- `2026-10-13T15:57:00Z`
- `2026-10-13T15:58:34Z`
- `2026-10-13T15:58:38Z`
- `2026-10-13T15:58:39Z`

</details>

## HF cadence (context)

- Median Δt HF numeric buckets: **2000** ms
- Strict 1 Hz: **no**