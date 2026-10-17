# LDI-10D Phase 3C — Trip f3e1fa83…

| Metric | Value |
| --- | --- |
| Buckets | 362 |
| GPS present | 346 |
| ROW_ABSENT | 16 |
| Phase 3A events | 69 (unchanged) |

## Plausible improvements (no assumed true speed)

- **Motion-gated abstention** at repeated coordinates already aligns with production frozen handling; extending gates would reduce phantom crawl speeds but **lower numeric coverage**.
- **Adaptive Δt** helps only where grid gaps exist; this trip has mostly 1 s spacing with 16 ROW_ABSENT buckets — limited upside.
- **Causal EMA** would damp acceleration spikes (witness conflicts with OBD on this trip) but adds **lag** — risky for event detection without independent reference.
- **Noncausal offline smooth** is labeled separately; not suitable for streaming authority.

## Witness note

OBD/HF conflict buckets (≥5 km/h or 25% rule): **11** — informative only, not ground truth.
