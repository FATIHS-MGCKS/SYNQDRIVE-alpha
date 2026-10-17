# LDI-10D Phase 3D — Evidence quality specification

## Tags (multi-label)

| Tag | Layer | Rule |
| --- | --- | --- |
| `POSITION_PRESENT` | Observed | `availability=PRESENT` and finite lat/lon |
| `ROW_ABSENT` | Observed | Provider row absent on 1 Hz grid |
| `FROZEN_COORDINATE` | Observed | Consecutive identical coordinates |
| `TIMESTAMP_IRREGULARITY` | Observed | Calendar Δt ≠ 1 s vs previous bucket |
| `GPS_GEOMETRY_OUTLIER` | **Inferred** | Leg speed > 50 m/s between present fixes |
| `QC_UNTRUSTED` | Observed | QC not TRUSTED/TRUSTED_LIMITED |
| `TRUSTED_SPEED` | Observed | TRUSTED QC + pinned production L3 numeric |
| `INSUFFICIENT_EVIDENCE` | Observed | No trusted numeric speed / abstention |

Tags may overlap. **Inferred** tags are never treated as measured ground truth.

## Authorities preserved

- GPS/L3 production authority unchanged (offline replay only).
- No QC threshold mutation, no automatic promotion.