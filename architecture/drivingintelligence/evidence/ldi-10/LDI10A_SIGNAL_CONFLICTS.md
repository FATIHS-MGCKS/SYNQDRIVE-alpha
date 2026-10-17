# LDI10A — Signal conflicts & artifact screening

## L3/OBD conflicts (from frozen LDI-09)

Total **11** documented conflicts; dispositions preserved in `LDI09_CONFLICT_CLASSIFICATION.json`.

## Candidate-level screening (no interpolation)

- GPS jump flags: **0** candidates
- Unrealistic |a| > 6 m/s² (descriptive screen only): **0**
- Quantized integer OBD/HF speeds at endpoints: see per-candidate `quantizedObdOrHf`
- Missing buckets: candidates require consecutive 1s indices; non-1000ms Δt → UNKNOWN/CONFLICTED in LDI-09

## High-confidence review (not ground truth)

### Acceleration (24/40)

- OBD corroboration both ends: **3**
- L3-primary only: **21**
- **High confidence ≠ independent validation** — shared DIMO/R1 lineage

### Deceleration (35/35)

- OBD corroboration both ends: **0**
- L3-primary only: **35**
- **Deceleration ≠ brake pedal or regen** — no pedal/HV channel in pin

## Error classes

| Class | Meaning |
|-------|---------|
| `CROSS_SOURCE_CONFLICT` | L3 QC untrusted due to OBD disagreement at bucket |
| `INTERVAL_ONLY` | OBD/HF bucket label ≠ point sample |
| `GPS_JUMP_SUSPECT` | Path speed >> L3 band between endpoints |
| `SPARSE_HF_OBD` | Witness channels absent on most grid seconds |