# G5C-N16 P4H-R2 — Planned second historical measurement wave (not authorized)

## 1. Original raw recovery (before any new DIMO spend)

| Source | Status |
|--------|--------|
| `/opt/cursor/artifacts/p4h/raw/*.p4h-raw.v1.json` | **Empty until next authorized P4H run** — P4H v1 did not persist voltage/RPM |
| Repo / workspace grep | **No** stored GraphQL response bodies for the 30 trips |
| P4H CSV `provider_timestamps` only | **Insufficient** for crank metrics |

**Conclusion:** Re-query is required for crank voltage evidence unless owner supplies external raw dumps.

## 2. Priority re-query cohort (technical follow-up, not fleet rate)

**12 trips** that passed cadence/coverage gates under `HISTORICAL_REPLAY` in P4H-R1 (`evaluatedAt = windowEnd`):

| # | trip_id |
|---|---------|
| 1 | `98113ec4-59b4-4a61-8f38-b4f16ed91298` |
| 2 | `ec93e749-2465-419f-82ce-e4d2aae88d51` |
| 3 | `3fd4f006-41ec-4349-bebd-11a322a9d9dc` |
| 4 | `8e83f3a8-4eab-4213-8451-f6b1d1585fe4` |
| 5 | `2cc2bced-b6b2-488b-bf16-c09657696eaf` |
| 6 | `1ff9f47b-1152-4d69-8882-a6661e0811ff` |
| 7 | `1698898d-fcd6-43f2-b43d-558a186857b6` |
| 8 | `e9208508-7277-4db6-90cc-10fb2133e563` |
| 9 | `7c0594ee-a0a8-48ce-b147-c460aa244187` |
| 10 | `ca141ac2-4a72-4072-a36a-10bb97e911e8` |
| 11 | `26121555-27fd-4aa5-8477-dd497cd70260` |
| 12 | `62d04fbc-2515-4293-a41d-378591290cad` |

Use `P4H_TRIP_MANIFEST.json` for windows and vehicle IDs. This cohort is **biased** toward Arteon-heavy cadence success — not a fleet hit-rate sample.

## 3. Optional expansion trips

Only from manifest metadata (stratified pool, duration class) after owner approves scope — e.g. 5 empty-series trips for provider-gap forensics:

- `6f25760e-73ee-458c-acf6-0ed1064e6465`
- `c65e7b49-358c-4f9b-b34f-0354aa1f1949`
- (plus Audi/Arteon empties if any)

## 4. Request budget (proposal — owner gate required)

| Scenario | Max DIMO telemetry POSTs | Notes |
|----------|-------------------------|--------|
| Minimal crank evidence | **12** | Priority cohort only |
| Cohort + empty forensics | **17** | +5 empty P4H trips |
| Full re-benchmark with raw archive | **30** | Same manifest, new harness writes `raw/*.p4h-raw.v1.json` |

Auth/token exchange calls are out of band (same as P4H).

## 5. Cost & retention

- **Cost:** 1 GraphQL `signals(interval:5s)` per trip per wave; identical to P4H.
- **Retention risk:** Cloud Agent artifact paths (`/opt/cursor/artifacts`) are ephemeral — copy `raw/` + index to durable storage before session end; never commit raw JSON to git.

## 6. Execution prerequisites

1. `P4H_HISTORICAL_CRANK_OWNER_AUTHORIZED=1`
2. Updated benchmark script (post-R2) — writes sealed archives + dual-mode CSV columns
3. Offline replay script validates integrity before analysis
4. Owner explicit approval of **request limit** row from table above

**No requests in P4H-R2 preparation turn.**
