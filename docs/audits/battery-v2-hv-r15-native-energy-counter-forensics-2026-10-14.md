# Battery V2 HV R15 — Native Added-Energy Counter Forensics

| Field | Value |
|-------|-------|
| Mode | Read-only provider forensics + isolated offline evaluator (no production wiring) |
| Production SHA | `6d68289018b65ce0c061dc5dbf8c66db7954ab29` |
| R14 reference | `2026-10-14T07:48:10.708Z` |
| Fixture capture | `2026-10-14T08:07:19.083Z` |
| Fixture digest | `137a1e3d9225847948edfddc1e40cbe4387a188dc4ea7889e794b8c793c979f8` |
| Vehicle / token | `68868291-5478-42cd-b0c4-cc77b2a78e21` / DIMO `186946` |

## Frozen evidence

- Summary aggregates: R14 agent artifacts (`r14-dimo-interval-result.json`, `r14-episode-monotonicity.json`) — not committed; superseded by repo fixture.
- Canonical fixture: `backend/src/modules/vehicle-intelligence/battery-health/hv-h4/fixtures/r15-dimo-added-energy-interval.v1.fixture.json`
- Regeneration (authorized read-only): `node backend/scripts/ops/capture-r15-dimo-interval-fixtures.cjs`

## Counter semantics (provider)

- Signal: `powertrainTractionBatteryChargingAddedEnergy` (kWh), session-cumulative counter.
- Interval query: `signals(..., interval: "1m")` with `FloatAggregation` per bucket (`LAST` evaluated here; `MIN`/`MAX` included in fixture).
- Bucket `timestamp` labels the **query bucket**, not a certified MCU sample instant.
- Values are **aggregates within the bucket**; `MIN`=`MAX`=`LAST` in both episodes (no intra-bucket spread observed), which does **not** prove absence of intra-bucket resets.

## October 12 — session `3e5fe028-a217-4dfd-b165-76993117c794`

| Quantity | Value |
|----------|-------|
| HV `energyAddedKwh` | **5.06** kWh |
| HV SOC (persisted) | 89.18 → **99** % |
| Provider recharge envelope | 13:06:55.314 → 15:10:30.313 UTC |
| Segment added MIN/MAX delta | **5.92** kWh (0.02 → 5.94) |
| Segment pack-energy MIN/MAX delta | **5.26** kWh |
| Interval LAST counter (first→last in episode) | **5.92** kWh (0.02 → 5.94 @ 13:07–15:10 buckets) |
| Interval LAST counter (pre-baseline → last) | **5.94** kWh (0 @ 13:06 → 5.94 @ 15:10) |
| First SOC ≥ 94 % in interval | 13:57 UTC @ 2.44 kWh counter |
| First SOC = 100 % in interval | 15:10 UTC @ 5.94 kWh counter |
| Missing added-energy buckets in interval | 4 |

**0.86 kWh gap (5.92 vs 5.06):** The interval added-counter delta and segment added-extrema delta (**5.92 kWh**) agree with each other. The persisted HV value (**5.06 kWh**) is **not** equal to that added-counter delta. It is closer to the **pack-energy segment extrema delta (5.26 kWh)** and to pack levels around **15:00 UTC** (~54.68 kWh vs pack min 49.62 + 5.06), while HV end SOC (**99 %**) sits below the provider segment SOC max (**100 %**) and below the interval bucket that first reports **100 % SOC (15:10 UTC, 5.94 kWh counter)**. Plausible contributors to the residual (~0.20–0.86 kWh) include: (a) energy added after the HV-effective SOC ceiling (99 % vs 100 % segment max), (b) sparse/missing added buckets (4), (c) coalesced revision timing not replayed in this fixture-only audit. **Exact HV write revision is not reconstructed here** (no DB read in R15).

## October 13 — session `795c7dcb-4f71-4105-9868-5830ebc67597`

| Quantity | Value |
|----------|-------|
| HV `energyAddedKwh` | **5.14** kWh |
| HV SOC (persisted) | 84.00 → **94.02** % |
| Provider recharge envelope | 13:06:30.194 → 16:12:09.193 UTC |
| Segment added MIN/MAX delta | **8.64** kWh (0 → 8.64) |
| Segment pack-energy MIN/MAX delta | **8.14** kWh |
| Interval LAST absolute at last in-episode bucket | **8.64** kWh @ 16:12 UTC |
| Interval LAST delta (first→last in episode) | **8.60** kWh (0.04 → 8.64) |
| Interval LAST delta (pre-baseline → last) | **8.64** kWh (0 @ 13:06 → 8.64 @ 16:12) |
| First SOC ≥ 94 % in interval | **14:56 UTC** @ **5.14 kWh** counter, SOC **94.02 %** |
| First SOC ≥ 100 % in interval | **16:12 UTC** @ **8.64 kWh** counter |
| SOC 100 % after official segment end | Post-16:12 buckets sparse; 16:20 UTC still ~100 % SOC, 8.62 kWh counter |
| Missing added-energy buckets in interval | 6 |
| Overlapping recharge fragments | **1** (no duplicate fragment stack) |

**3.50 kWh gap (8.64 vs 5.14):** At the **first minute bucket reporting ~94 % SOC (14:56 UTC)**, the added-energy counter reads **5.139999885 kWh**, matching the persisted HV session energy (**5.14 kWh**) and HV end SOC (**94.02 %**) within bucket granularity. Charging **continues inside the same DIMO recharge envelope** until **16:12 UTC**, where interval buckets report **100 % SOC** and **8.64 kWh** counter — energy accumulated **after** the HV-aligned ~94 % point accounts for most of the gap (~3.50 kWh). This pattern is **not** explained by overlapping recharge fragments (only one segment). It is **inconsistent with treating full-segment added-extrema (8.64 kWh) as equivalent to the HV session projection** without an explicit boundary contract. The owner’s later 100 % observation is **not** substituted for HV’s 94.02 % endpoint.

## Offline evaluator

- Code: `m3-3-hv-h4-added-energy-counter-offline-evaluator.v1.ts`
- Always ends with `SCIENTIFIC_AUTHORITY_NOT_ESTABLISHED` — not a production provenance classifier.

## Scientific limitations

- No raw per-sample counter stream; only 1m aggregates.
- `isCharging` not used for isolation (sparse in R14/R15).
- HV persistence history not loaded; forensic alignment uses current durable HV numbers cited in mission brief.
- Interval SOC 100 % inside provider window does not override HV 94.02 % without separate attainment evidence.
