# EXP021 EV Ground Truth — evaluation schema

**Version:** `EXP021_EV_GROUND_TRUTH_EVALUATION_SCHEMA_V1`  
**Applies to:** offline comparison of production algorithm output vs external reference (primarily video + tachometer after ingest).

## Inputs

| Input | Source | Required for |
|-------|--------|----------------|
| `PRE_*_BASELINE_MANIFEST.json` | Read-only DB capture | Identity, boundaries, projection aggregates |
| `PRE_*_PER_SECOND_REPLAY.json` | Pinned snapshot + shadow + V2 QC replay | Second-aligned L3/QC timeline |
| Video second table | Future ingest | Tacho, overlay GPS, pedal/power displays |
| Post-deploy manifest | Future capture | Deploy SHA + admission state delta |

## Speed error metrics (when reference speed exists)

Report separately per reference class (tacho vs video GPS vs other):

- bias (mean error)  
- MAE  
- error quantiles (P50, P90, P95, max)  
- temporal lag (cross-correlation / event alignment)  
- numeric coverage vs trusted coverage (do not conflate)

## Dynamics

- Acceleration from centered or trailing windows (document window length and overlap).  
- Account for **1 s L3 grid** correlation across overlapping derivative windows.  
- **No** dynamics across data gaps.

## Event-based checks

False positive / negative only where reference events are **sufficiently evidenced** (e.g. standstill, hard brake display, regen display). Otherwise omit.

## EV-specific sections

| Section | Metrics | Notes |
|---------|---------|-------|
| Standstill / creep | duration, speed band | Tacho vs L3 |
| Launch / acceleration | peak derived accel | reference required |
| Deceleration | peak negative accel | not regen proof |
| Recuperation display | ordinal / categorical | UNKNOWN if unreadable |
| Pedal overlay | ordinal | verify semantics at ingest |

## Development vs validation split

This trip is **development reference** only. Fleet-wide quality requires additional independent drives held out from tuning.

## Output artifact (future)

`EVAL_RUN_<id>.json` with schema version, baseline manifest hashes, reference table hash, metrics, and explicit `UNKNOWN` fields.
