# DS4 Layer 3-B — decision package (2026-10-29)

Offline statistical research on immutable **batch v1** exports plus read-only Production inventory for C5.1.

## Upstream (immutable)

- `../ds4-historical-batch-v1-20261029/` — 157-trip C4 Path-B replay cohort
- Copied verbatim under `inputs/` (not modified)

## This package

| Path | Role |
|------|------|
| `analyze-l3b.mjs` | Regenerates statistics from `inputs/` only |
| `outputs/l3b-statistics.json` | Parts A–D numeric summary |
| `outputs/trip-layer2-partial-index.json` | Per-candidate trip B_k + event-derived a50/a90/amax |
| `outputs/c51-post-activation-manifest.json` | 48 Tesla/Tiguan trips with post-activation pinned S4 (Production SQL) |
| `outputs/c51-offline-pilot-evidence.json` | Two pilot C5.1 offline replays (reference only) |
| `sql/c5_1-post-activation-inventory.sql` | Read-only inventory query |

## Known artifact gap (batch v1)

`layer2-observables-index.json` stores **B_k impulses only**, not `exposureSeconds` / full L2 JSON. Trip-level **I_k, Phi_k, Phi_d_k, S_k** cannot be reconstructed without motion-derived exposure or per-trip `l2` blobs (no new replay in this workstream).

## Regenerate

```bash
node analyze-l3b.mjs
```
