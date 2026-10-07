# P25 APDS-9.2C — Exact replay blocker fixes (profile median + LV visibility)

| Field | Value |
|-------|--------|
| **Evidence ID** | VDC-EVID-P25-APDS-9-2C-001 |
| **PR** | #1916 (`cursor/apds-9-2b-replay-state-parity-dafe`) |
| **POST_FIX_PR_HEAD** | `0eab69df8e833ea33bd9f202adc984a4b6008b82` |
| **Production base SHA** | `a376c965ecedf855eb0fbcda42542ff15b74422c` |
| **Deploy / shadow / merge** | **NO** |

## Fix 1 — PS1 profile median parity

- `resolveP25ApdProfileMedianCadenceMs`: `medianSec * 1000` or `P25_APD_PS1_PROFILE_MEDIAN_INTERVAL_FALLBACK_MS` (8h).
- PS1 electric zero strict-rest row override → `PROVIDER_OBSERVABILITY_GAP` (classifier thresholds unchanged).

## Fix 2 — Historical LV visibility bound

- DB fallback: `observedAt <= pollCompletedAtMs`, latest by `providerTimestamp`.
- `DimoSnapshotProcessor` post-poll APD shadow path uses `findLatestHistoricallyVisibleLiveVoltageProviderTimestampMs`.

## Run-1 certification (read-only Production DB)

| Check | Result |
|-------|--------|
| Corpus | 5 / 57 / 24 / 33 / 533 LV |
| `PROFILE_MEDIAN_DIVERGENCE_COUNT` | 0 |
| `PROFILE_CLASS_DIVERGENCE_COUNT` | 0 |
| B2/B4 policy divergences | 0 |
| `RC_LV_FALLBACK_QUERY_BOUNDED_BY_POLL_COMPLETION` | YES |
| `EXACT_REPLAY_CERTIFICATION` | PASS |

Artifact: `/opt/cursor/artifacts/apds-92c-prod-replay.json` (Cloud Agent run).
