# APDS V3 P1B0 — Scientific limitations (offline only)

1. **No counterfactual DIMO responses** — Replay cannot observe telemetry that would have arrived only if a skipped poll had executed; projected request reduction is an estimate.
2. **Heuristic information gain** — `estimateVsiInformationGain` is explicitly not validated as calibrated probability; conservative decisions default to poll on hard safety and contradictory evidence.
3. **Limited fleet diversity** — Holdout epochs and vehicle counts in unit replay fixtures do not represent full production fleet heterogeneity.
4. **UNKNOWN consumer freshness** — Several registry consumers retain `UNKNOWN` max age; policy must not invent thresholds for them.
5. **KS_MX_2024** — Excluded from optimization calibration; provider-error ticks reported separately and classified `NOT_ASSESSABLE` when flagged.
6. **Baseline scheduler model** — Offline baseline uses verified `isSnapshotPollDue` via `apds-v3-baseline-poll-due.adapter.ts`; BullMQ coalescing/dedupe is modeled separately via `physicalRequestDedupKey`.
7. **Oracle vs observable** — `strictLvAdvancesPotentiallyMissed` and `p2cTopLevelAdvancesAtRisk` are hindsight risk indicators under skip decisions, not proven production misses.
