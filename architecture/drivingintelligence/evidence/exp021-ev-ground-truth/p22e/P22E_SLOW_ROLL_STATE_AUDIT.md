# EXP021 P22E — Slow-Roll & Stillstand State Audit

Tesla reference trip `358d0158-b2a9-47ed-af26-33926c5770b4` · frozen pre-deploy replay · **no detector input from video labels**.

## A — 135 video tacho=0 seconds

- Count from comparison.json alignment: **135**
- ROW_ABSENT among them: **133** (display zero does not prove physics; pipeline abstains)
- PRESENT among them: **2**

## B — 14 TRUSTED_LIMITED (null numeric) band seconds

- Total: **14**
- With readable video tacho 1–3 km/h: **11**
- STATIONARY_SUPPORTED / TRUSTED_LIMITED null is V2 band semantics (L3<3 km/h or hold-stop), not “tacho exactly 0”.

## C — 52 retrospective SLOW_ROLL geometry seconds

- Source: frozen v0_2 freeze review (`DEVELOPMENT_STATUS_CONSOLIDATED.json` / `REVIEW_SUMMARY.md`).
- Video breakdown (all 52): tacho1–3: 20, tacho3–5: 19, tacho>5: 1, unknown: 12; **not** aggregate strict-stop candidates.

## D — Five large tacho-0 blocks & ten natural GPS gaps

- See `MAIN_HALTS_HONEST.json` + `TEN_GAP_EVENTS.json` (unchanged). Stationary prototype: 135/135 annotated zeros missed for V2 STATIONARY_BAND when ROW_ABSENT dominates.

## E — GAP_EVT_002, GAP_EVT_003, GAP_EVT_008

| Event | v0_2 (frozen) | Video decisiveness |
|-------|---------------|-------------------|
| GAP_EVT_002 | LIKELY_HALT / slow-roll family | Before video anchor — NOT_VERIFIABLE |
| GAP_EVT_003 | LIKELY_HALT | Predominantly pre-anchor — NOT_DECISIVE |
| GAP_EVT_008 | Shared position gap (H4/H5) | NOT_DECISIVE; optional clip context only |

## False-halt risks

- Natural gaps tagged LIKELY_HALT: **6**
- Without overlapping main halt window: **2**
- Retrospective v0_2 can label LIKELY_HALT on small chord across ROW_ABSENT without video tacho-0 in gap.

## Leg geometry for slow-roll (within full PRESENT chains)

Where ±1s L3 support is calendar-complete and legs imply 1.5–5 km/h, v0_2 **already** emits SLOW_ROLL geometry labels; conflict with video >3 km/h on 52s shows **classification semantics**, not missing numeric coverage. Extending without QC change → **UNSAFE_OR_UNPROVEN**.