# Suite: SPEED_BENCHMARK

**Goal:** Compare **L3** (or declared speed authority) against an independent or proxy reference — **never** score missing GT as zero error.

## Eligible benchmarks

| BMK_ID | Reference | Tier | Metrics allowed |
|--------|-----------|------|-----------------|
| `BMK-TESLA-LDI10D-20261016` | `VIDEO_TACHO_REFERENCE.json` | PROXY_ONLY | MAE/P95/bias on paired seconds |
| `BMK-TACHO-123-LEGACY` | Unknown pin | NOT_VERIFIED | Cited 3.13 MAE — **do not re-use until pinned** |
| `BMK-P21-R3-AUDI-20261014` | None | — | **Coverage only** (763 NO_NUMERIC taxonomy) |
| `BMK-RD003` | Video clips | PROXY_ONLY | In-sample MAE ~8.5 — **not** INDEPENDENTLY_VALIDATED |

## Pin contract

| Field | Required |
|-------|----------|
| Position grid or S4 snapshot gzip | sha256 in manifest |
| Code | `git rev-parse` on `origin/main` or documented replay SHA |
| L3 policy | `L3_CENTERED_PATH` + S1 hold/release as in `compute-trip-intervals.ts` |
| QC policy | Declare V1 vs V2 explicitly |

## Commands (examples)

```bash
cd backend && npm run test:di:s4-research
# Tesla grid analytics: local script on pinned JSON only — no DIMO fetch
```

## Evaluation rules

- Exclude `ROW_ABSENT` / null tacho from denominator unless suite explicitly includes gap semantics.
- Report **denominator** (n) with every MAE.
- **PROXY_ONLY** ≠ fleet validation.

## Output schema

Per-second or per-interval: `{ bucketLabelUtc, l3Kmh, referenceKmh, referenceTier, errorKmh, excludedReason }`
