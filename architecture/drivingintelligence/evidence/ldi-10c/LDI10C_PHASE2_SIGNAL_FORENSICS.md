# LDI10C Phase 2 — Signal forensics

## Provenance

- Verification: **PASS**
- LDI08 snapshot SHA-256: `effe180fe128a6c9f5c5f74f52f34ddc0c7d6f9960825d55573b02ca5b2f7009`
- LDI09 frozen candidate IDs match live recompute: **yes**

## UNCLEAR vs UNTRUSTED sets

- UNCLEAR groups (**8**): MANEUVER_ACCELERATION_2, MANEUVER_ACCELERATION_3, MANEUVER_ACCELERATION_4, MANEUVER_ACCELERATION_6, MANEUVER_ACCELERATION_8, MANEUVER_ACCELERATION_9, MANEUVER_ACCELERATION_12, MANEUVER_ACCELERATION_13
- UNTRUSTED-touching groups (**8**): MANEUVER_ACCELERATION_2, MANEUVER_ACCELERATION_3, MANEUVER_ACCELERATION_4, MANEUVER_ACCELERATION_6, MANEUVER_ACCELERATION_8, MANEUVER_ACCELERATION_9, MANEUVER_ACCELERATION_12, MANEUVER_ACCELERATION_13
- **Intersection (8):** MANEUVER_ACCELERATION_2, MANEUVER_ACCELERATION_3, MANEUVER_ACCELERATION_4, MANEUVER_ACCELERATION_6, MANEUVER_ACCELERATION_8, MANEUVER_ACCELERATION_9, MANEUVER_ACCELERATION_12, MANEUVER_ACCELERATION_13
- UNCLEAR-only: *(none)*
- UNTRUSTED-only: *(none)*

**Finding:** Every UNCLEAR group overlaps at least one UNTRUSTED L3 QC bucket in-window; plausibility downgrade is driven by QC + CONFLICTED steps, not missing GPS rows in these eight cases.

## Per-case signal notes

### MANEUVER_ACCELERATION_2

- Window: 2026-10-13T15:53:14Z → 2026-10-13T15:53:19Z
- CONFLICTED steps: **2** / 5
- UNTRUSTED buckets in window: **1**
- GPS ROW_ABSENT in window: **0**
- Uncertainty: MULTIPLE_CAUSES, GPS_QC_FAILURE, SIGNAL_CONFLICT
- Evidence: 
  - 1 UNTRUSTED L3 QC bucket(s) with GPS present in window
  - CONFLICTED candidate steps: L3_ACCEL_4, L3_ACCEL_5 (L3 vs OBD threshold LDI-10A)
  - Integer-quantized OBD/HF at step(s): L3_ACCEL_3, L3_ACCEL_4, L3_ACCEL_5, L3_ACCEL_6, L3_ACCEL_7 (artifact screen)
- OBD witness (not independent): L3_ACCEL_6
- HF witness: L3_ACCEL_6

### MANEUVER_ACCELERATION_3

- Window: 2026-10-13T15:53:26Z → 2026-10-13T15:53:29Z
- CONFLICTED steps: **3** / 3
- UNTRUSTED buckets in window: **2**
- GPS ROW_ABSENT in window: **0**
- Uncertainty: MULTIPLE_CAUSES, GPS_QC_FAILURE, SIGNAL_CONFLICT
- Evidence: 
  - 2 UNTRUSTED L3 QC bucket(s) with GPS present in window
  - CONFLICTED candidate steps: L3_ACCEL_8, L3_ACCEL_9, L3_ACCEL_10 (L3 vs OBD threshold LDI-10A)
  - Integer-quantized OBD/HF at step(s): L3_ACCEL_8, L3_ACCEL_9, L3_ACCEL_10 (artifact screen)
- OBD witness (not independent): none
- HF witness: none

### MANEUVER_ACCELERATION_4

- Window: 2026-10-13T15:53:38Z → 2026-10-13T15:53:40Z
- CONFLICTED steps: **2** / 2
- UNTRUSTED buckets in window: **1**
- GPS ROW_ABSENT in window: **0**
- Uncertainty: MULTIPLE_CAUSES, GPS_QC_FAILURE, SIGNAL_CONFLICT
- Evidence: 
  - 1 UNTRUSTED L3 QC bucket(s) with GPS present in window
  - CONFLICTED candidate steps: L3_ACCEL_11, L3_ACCEL_12 (L3 vs OBD threshold LDI-10A)
  - Integer-quantized OBD/HF at step(s): L3_ACCEL_11, L3_ACCEL_12 (artifact screen)
- OBD witness (not independent): none
- HF witness: none

### MANEUVER_ACCELERATION_6

- Window: 2026-10-13T15:54:05Z → 2026-10-13T15:54:09Z
- CONFLICTED steps: **2** / 4
- UNTRUSTED buckets in window: **2**
- GPS ROW_ABSENT in window: **0**
- Uncertainty: MULTIPLE_CAUSES, GPS_QC_FAILURE, SIGNAL_CONFLICT
- Evidence: 
  - 2 UNTRUSTED L3 QC bucket(s) with GPS present in window
  - CONFLICTED candidate steps: L3_ACCEL_17, L3_ACCEL_18 (L3 vs OBD threshold LDI-10A)
  - Integer-quantized OBD/HF at step(s): L3_ACCEL_15, L3_ACCEL_16, L3_ACCEL_17, L3_ACCEL_18 (artifact screen)
- OBD witness (not independent): none
- HF witness: none

### MANEUVER_ACCELERATION_8

- Window: 2026-10-13T15:54:36Z → 2026-10-13T15:54:39Z
- CONFLICTED steps: **3** / 3
- UNTRUSTED buckets in window: **3**
- GPS ROW_ABSENT in window: **0**
- Uncertainty: MULTIPLE_CAUSES, GPS_QC_FAILURE, SIGNAL_CONFLICT
- Evidence: 
  - 3 UNTRUSTED L3 QC bucket(s) with GPS present in window
  - CONFLICTED candidate steps: L3_ACCEL_21, L3_ACCEL_22, L3_ACCEL_23 (L3 vs OBD threshold LDI-10A)
  - Integer-quantized OBD/HF at step(s): L3_ACCEL_21, L3_ACCEL_22, L3_ACCEL_23 (artifact screen)
- OBD witness (not independent): none
- HF witness: none

### MANEUVER_ACCELERATION_9

- Window: 2026-10-13T15:56:23Z → 2026-10-13T15:56:26Z
- CONFLICTED steps: **1** / 3
- UNTRUSTED buckets in window: **1**
- GPS ROW_ABSENT in window: **0**
- Uncertainty: MULTIPLE_CAUSES, GPS_QC_FAILURE, SIGNAL_CONFLICT
- Evidence: 
  - 1 UNTRUSTED L3 QC bucket(s) with GPS present in window
  - CONFLICTED candidate steps: L3_ACCEL_26 (L3 vs OBD threshold LDI-10A)
  - Integer-quantized OBD/HF at step(s): L3_ACCEL_26 (artifact screen)
- OBD witness (not independent): none
- HF witness: none

### MANEUVER_ACCELERATION_12

- Window: 2026-10-13T15:56:53Z → 2026-10-13T15:56:55Z
- CONFLICTED steps: **1** / 2
- UNTRUSTED buckets in window: **1**
- GPS ROW_ABSENT in window: **0**
- Uncertainty: MULTIPLE_CAUSES, GPS_QC_FAILURE, SIGNAL_CONFLICT
- Evidence: 
  - 1 UNTRUSTED L3 QC bucket(s) with GPS present in window
  - CONFLICTED candidate steps: L3_ACCEL_33 (L3 vs OBD threshold LDI-10A)
  - Integer-quantized OBD/HF at step(s): L3_ACCEL_33 (artifact screen)
- OBD witness (not independent): none
- HF witness: none

### MANEUVER_ACCELERATION_13

- Window: 2026-10-13T15:56:56Z → 2026-10-13T15:56:58Z
- CONFLICTED steps: **2** / 2
- UNTRUSTED buckets in window: **1**
- GPS ROW_ABSENT in window: **0**
- Uncertainty: MULTIPLE_CAUSES, GPS_QC_FAILURE, SIGNAL_CONFLICT
- Evidence: 
  - 1 UNTRUSTED L3 QC bucket(s) with GPS present in window
  - CONFLICTED candidate steps: L3_ACCEL_34, L3_ACCEL_35 (L3 vs OBD threshold LDI-10A)
  - Integer-quantized OBD/HF at step(s): L3_ACCEL_34, L3_ACCEL_35 (artifact screen)
- OBD witness (not independent): none
- HF witness: none

No brake-pedal, regen, or driver-intent claims.