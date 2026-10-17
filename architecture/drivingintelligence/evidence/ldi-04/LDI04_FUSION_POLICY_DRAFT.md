# LDI04 — Fusion policy draft (offline)

**Status:** design-only · **no threshold tuning** · **no production arm**

## Epistemic classes

| Class | Meaning |
|-------|---------|
| `CONFIRMED` | Multiple independent witnesses agree within corroboration band |
| `CORROBORATED` | Primary L3 trusted + OBD agrees (not necessarily multi-witness) |
| `CONFLICTED` | Witnesses disagree beyond disagreement threshold |
| `PARTIAL` | Some streams present; others missing or LIMITED |
| `UNKNOWN` | Cannot assert kinematics (gaps, UNTRUSTED, or no data) |

## Decision matrix

| Scenario | Policy output | Notes |
|----------|---------------|-------|
| L3 **TRUSTED** + OBD agrees (≤ max(5,10% L3)) | **CORROBORATED** kinematic speed | OBD is witness, not primary |
| L3 **TRUSTED** + OBD conflicts | **CONFLICTED** — withhold promotion | Do **not** auto-pick OBD; mark `CONFLICTED` + forensic flags |
| L3 **TRUSTED_LIMITED** + OBD available | **PARTIAL** | Use L3 as index; OBD may inform QC only |
| L3 missing + OBD available | **PARTIAL** / **UNKNOWN** | `INTERVAL_ONLY` — no OBD fallback to define trip speed surface |
| L3 available + HF dynamics (≥2 HF points) | **PARTIAL** kinematic derivative | HF braking/accel detectors — separate from speed claim |
| Native event + L3 agreement (±2 s) | **CORROBORATED** event envelope | Native remains **NATIVE_*_REPORTED**, not CONFIRMED physics |
| Native event without corroboration | **PARTIAL** (report only) | Class `NATIVE_BRAKING_EVENT_REPORTED` |
| All sources missing | **UNKNOWN** | No interpolation |

## LDI-04 pin implications

- Only **~10%** of seconds have OBD/HF speed — fusion must default to **L3-first** with **UNKNOWN** elsewhere.
- **36** L3/OBD conflicts on overlap buckets — **OBD fallback infeasible** as default.
- **0** native events — native row of matrix **not exercised** on this pin.

## Prohibitions (carry-forward)

- No harsh threshold changes.
- No automatic OBD override of L3.
- No native event → ground truth promotion.