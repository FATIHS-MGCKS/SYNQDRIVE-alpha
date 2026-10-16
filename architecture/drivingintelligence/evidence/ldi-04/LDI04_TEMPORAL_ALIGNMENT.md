# LDI04 — Temporal alignment

**Pin:** `f502a4a0-02d2-421d-bb39-7c9af25ba38e` · **UTC** `2026-10-14T19:04:00Z`–`2026-10-14T19:22:10Z`

## 1 Hz HF assumption vs observation

| Metric | Expected (contract) | Observed on pin |
|--------|---------------------|-----------------|
| Query family | `HIGH_FREQUENCY_SUBSET` @ 1 s | 109 numeric speed buckets / 1090 shadow indices |
| Median Δt between OBD/HF buckets | 1000 ms | **5000 ms** |
| Min / max Δt | 1000 ms | 1000 / 37000 ms |
| Strict 1 Hz lattice | yes | **no** |

**Conclusion:** The DIMO R1 query requests 1 s buckets, but the **observed** delivery on this trip is **sparse and irregular** (median 5 s). Do not treat HF/OBD as a contiguous 1 Hz series.

## 6.1 % triple overlap (GPS + trusted L3 + HF + OBD same index)

- **Buckets:** 66 / 1090 (6.06%)
- **Within corroboration band** (max(5 km/h, 10% L3)): 66
- **Conflict band** (disagreement threshold): 0
- **Unresolved forensic dispositions:** 0 of 36 documented conflicts

No interpolation was applied between absent buckets.

## Temporal semantics

- R1/OBD payloads are **`INTERVAL_ONLY`** (`r1-temporal-containment.ts`, `DI_V0_R1_OBD_QUERY_V0_3`).
- Calendar bucket labels are an **evaluation index**, not proof of point-synchronous ECU vs GPS samples.