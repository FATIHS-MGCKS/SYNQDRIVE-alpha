# EXP021 Phase 5A — Known limitations (frozen baseline)

These limits are **intentionally carried forward**; Phase 5A does not tune thresholds or claim new accuracy.

## Validation strength

- **No `TRUE_UNSEEN_HOLDOUT`** exists (Phase 4). Any comparison on historical drives is at most `HISTORICAL_RETROSPECTIVE_VALIDATION`.
- **Tiguan** is the **development set** used to choose M7's margin/gap thresholds; smoke replay on Tiguan proves **bit-identical reproducibility**, not independent validation.
- **Tesla LDI-10D** independent GT is stop/speed + GPS proxy only; **no `ROAD_CONFIRMED_FROM_VIDEO`** (dashboard camera).
- **GPS proxy disagreement ≠ proven road error** unless labels are `PROXY_ONLY` with unique-way rules satisfied.

## Tesla T2 (2026-10-20T10:43:29Z)

- Remains **`CORRECTNESS_NOT_ASSESSABLE`** (no Oct-20 video; no driver anchor at trip end).
- Phase 3 behavioural regression gate outcome is unchanged; Phase 4 location prior does not convert it into accuracy evidence.

## Stop / matcher interaction (API_SYNTHETIC)

- On Tesla LDI-10D, **all 117 video `STOP_CONFIRMED` seconds are `ROW_ABSENT`** in the pinned grid.
- Tests of “matcher behaviour while stopped **with positions present**” are **impossible** on this source family; zero stationary switches may reflect **missing input**, not matcher quality.

## Data and fixture gaps

| Item | Status |
|---|---|
| Tiguan MOVs TC_00068–72 | **NOT on VM / not in git** — nav GT tables exist, media absent |
| Tiguan L3 v1 grid | all `pinnedProductionL3Kmh` null — harness export omission (Phase 4) |
| Tiguan L3 v2 offline fixture | Phase 4 artifact only; **unvalidated**; **must not replace v1** in benchmarks without new manifest |
| Tesla Oct-20 TRIP grids | **cloud artifacts only** (`exp021-tesla-two-trip/`) — required for full Phase 3 replay, not for §2 smoke |
| RD001–RD004 / Audi / KS | **not assessable** for road GT (Phase 4) |

## Fleet generalisation

- A **single new reference drive** (even with exterior video) does not prove fleet-wide generalisation across source families (API_SYNTHETIC vs RUPTELA_R1) or geographies.

## Production boundary

- Frozen variants run in the **research harness** (`phase3_lib`); enabling them in production requires separate product integration, flags, and authority work — **out of scope for 5A**.

## Durable storage

- Large media and cloud-only artifact trees may be **`LOCAL_ONLY`** on a single Cloud Agent VM; see `FREEZE_MANIFEST.json` → `durableBackup` and git evidence pointer (if pushed).
