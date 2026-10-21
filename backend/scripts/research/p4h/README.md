# G5C-N16 P4H historical cranking research

Isolated harness for DIMO crank-window benchmarks. **Not** wired into production ingest.

## Modules (testable)

`backend/src/modules/vehicle-intelligence/battery-health/lv-start-proxy/research/`

- `p4h-raw-archive.v1.ts` — sealed JSON archives (SHA-256)
- `p4h-evaluation-semantics.ts` — `LIVE_INGEST` vs `HISTORICAL_REPLAY` `evaluatedAt`
- `p4h-offline-trip-evaluation.ts` — full offline metrics + gate slices
- `p4h-bucket-temporal-coherence.ts` — 5s bucket limitation assessment

## Scripts

| Script | Purpose |
|--------|---------|
| `g5c-n16-p4h-historical-crank-benchmark.ts` | Live DIMO (owner auth) + raw archive write |
| `g5c-n16-p4h-offline-replay-from-archive.ts` | Replay sealed `raw/*.p4h-raw.v1.json` |

## Tests

```bash
cd backend && npm test -- p4h-historical-research.harness.spec.ts
```
