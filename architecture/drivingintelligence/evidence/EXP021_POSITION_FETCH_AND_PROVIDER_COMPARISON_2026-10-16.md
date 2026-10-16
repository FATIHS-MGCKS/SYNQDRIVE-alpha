# EXP021 — Original position fetch audit & bounded provider comparison plan

| Field | Value |
| --- | --- |
| PR | [#2046](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/2046) |
| Analysis HEAD | (see commit at run) |
| Trip | `533b2bf8-fa07-4f0b-bc40-d540447a1542` |
| Work item | `339856c6-a4af-43f8-aecd-07baacec3d22` |
| Vehicle | `19fedd4b-c4e8-4de8-a125-dab293326e7e` |
| Provider calls this workstream | **1** (bounded compare run 2026-10-16) |

## Evidence terminology (final)

| Earlier wording | Correct statement |
| --- | --- |
| `center_gap=3040`, `neighbor_only=0` | **Misleading metric names.** 3040 = POSITION_GAP interval-seconds = **2966** center-bucket `ROW_ABSENT` + **74** neighbor-only support gaps (center `PRESENT`, t±1 `ROW_ABSENT`). `neighbor_only=0` counted any t−1/t/t+ gap as “center gap.” |
| Longest run pin | Half-open `[14:55:43Z, 15:21:53Z)` → **1550** `ROW_ABSENT` + **20** valid coordinate buckets |
| Persisted V2 aggregates | **2 PASS**, **18 N/A** (20 trips analyzed) |
| Coverage fleet % | **Unchanged** (selection/partition not affected by persist filter) |

## Original fetch implementation (identified from pin + code binding)

| Layer | Binding |
| --- | --- |
| **Sealed in pin** | `DI_V0_POSITION_ACQUISITION_ADAPTER_V0_1`, `DI_V0_POSITION_EVIDENCE_SNAPSHOT_V0_1`, query spec `DIMO_SIGNALS_HISTORICAL_LOCATION_1S_AVG_V0_1` |
| **S4 live path** | `DiV0S4cExecutor` → `runDimo({ category: POST_TRIP_ENRICHMENT })` → `acquireDiV0HistoricalPositions` → `DimoTelemetryDiV0HistoricalPositionTransport.queryGraphQL` |
| **Repository git SHA at fetch** | **UNKNOWN** — not stored in POSITION snapshot |
| **Interpretation rule** | Pin adapter/query lines define **fetch contract**, not today’s `main` unless they match sealed versions |

Production extract script: `backend/scripts/ops/exp021-position-fetch-metadata.ts`  
Artifact: `/opt/cursor/artifacts/exp021-position-fetch-metadata.json` (read-only VPS run)

### Production extract (`533b2bf8…`, verified pin)

| Field | Value |
| --- | --- |
| `workItemCompletedAtUtc` | `2026-10-14T16:22:44.138Z` (fetch instant proxy — **not** wire timestamp) |
| `dimoTokenId` (sealed) | **192922** |
| POSITION window | `[2026-10-14T14:47:05Z, 2026-10-14T16:05:19Z)` → **4694** buckets |
| Provider rows matched | **1728** (`sum(providerRowCount)`) |
| Pin availability | **2966** `ROW_ABSENT`, **1728** present, **0** `SIGNAL_NULL` |
| Rejected provider rows | **0** (this trip) |
| `providerSignalsNull` | **false** |
| S4 `source_family` | `RUPTELA_R1` (envelope label; POSITION query still DIMO `currentLocationCoordinates`) |

## Pagination & completeness (from code + pin counters)

| Topic | Finding |
| --- | --- |
| S3A pagination | **Single** GraphQL `signals(tokenId, from, to, interval: "1s")` — **no** `after` / `limit` / `pageInfo` in `buildDiV0HistoricalPositionQuery` |
| Multi-page merge | **Not implemented** for POSITION S3A |
| Completeness evidence in pin | `expectedBucketCount`, per-bucket `providerRowCount`, `rejectedProviderRows`, `providerSignalsNull`, availability totals |
| Silent partial HTTP success | Transport errors → `FAILED` acquisition (not sealed as full grid) — covered by `exp021-position-s3a-fetch-contract.unit.spec.ts` |
| DIMO implicit truncation | **UNKNOWN** — if provider returns sparse `signals[]` without error, normalizer marks missing indices `ROW_ABSENT` |

## Normalization review

| Rule | Location |
| --- | --- |
| Window | `[fromUtc, toUtc)` second-aligned UTC (`gridBoundary: FROM_INCLUSIVE_TO_EXCLUSIVE`) |
| Bucket label | Provider `timestamp` → grid index; outside window → rejected row |
| Empty index | `ROW_ABSENT`, `providerRowCount: 0`, provenance `EXPECTED_GRID_ROW_ABSENT` |
| Present coords | Not downgraded to `ROW_ABSENT` when provider row exists — fixture in `exp021-position-s3a-fetch-contract.unit.spec.ts` |

## Confirmed defect

**None** in read-only audit. No product change proposed.

## Remaining unknown

- Provider row density at original fetch instant vs pin `ROW_ABSENT` count  
- Historical `vehicle_data_source_links` at fetch time (only **current** DB rows available)  
- Whether DIMO returned truncated `signals` array without error for this window  

## Bounded provider comparison (executed 2026-10-16)

| Field | Value |
| --- | --- |
| **Original fetch proxy time** | `2026-10-14T16:22:44.138Z` (`workItem.completed_at`) |
| **Comparison execution time** | `2026-10-16T04:32:54.559Z` (DIMO HTTP start; see artifact `timing`) |
| **Production release SHA** | `7de8f3ae2040a229f2a9c4b6a663117f1871fe55` (`SYNQDRIVE_RELEASE_BACKEND`) |
| **Analysis overlay SHA** | `b71dd19cd5` (PR #2046 branch; ops overlay + compare matrix) |
| **Result** | `COMPLETE` — matrix reconciled **4694** / **4694** |
| **Matrix** | `PIN_PRESENT_PROVIDER_PRESENT` **1728** (coords **unchanged**), `PIN_ABSENT_PROVIDER_ABSENT` **2966**, all other disjoint categories **0** |
| **Sub-window** `[14:55:43Z, 15:21:53Z)` | `PIN_ABSENT_PROVIDER_ABSENT` **1550**, `PIN_PRESENT_PROVIDER_PRESENT` **20** |
| **Completeness** | HTTP 200, **1728** provider rows vs **4694** expected buckets → `SPARSE_PROVIDER_ROWS_HTTP_OK` (same sparsity as pin) |
| **Raw signals** | **1728** rows, **0** duplicate timestamps, **0** rejected normalization rows |
| **Longest absent run (pin & provider)** | **1364 s** `[14:58:36Z, 15:21:20Z)` (61 runs) |
| **Artifacts** | `/opt/cursor/artifacts/exp021-provider-position-compare-533b2bf8.json`, raw signals at VPS `/tmp/…raw.json` (coordinates only; no auth) |

**Interpretation (per experiment rules):** Today's DIMO replay **does not** show extra coordinates in pin-`ROW_ABSENT` buckets (`PIN_ABSENT_PROVIDER_PRESENT=0`). Pin and provider agree on the same sparse grid on **2026-10-16**; this neither proves an original fetch fault nor disproves later data availability — it shows **reproducible sparse delivery** for this window at both acquisition time (pin) and replay.

## Exact provider comparison plan (reference)

| Field | Value |
| --- | --- |
| **Original fetch proxy time** | `workItem.completed_at` (UTC) from WI row — not wire-time |
| **Comparison execution time** | Recorded in compare JSON `executedAtUtc` / `timing` |
| **Provider identity** | DIMO via sealed `dimoTokenId` in POSITION snapshot + `currentLocationCoordinates` |
| **Vehicle identity** | `vehicleId` + org scope; verify `dimoTokenId` matches active DIMO link when run |
| **UTC window** | Sealed `requestedWindow.fromUtc` / `toUtc` from POSITION pin (must match S4 `acquisition_window_*` on evidence snapshot) |
| **Canonical query** | `buildDiV0HistoricalPositionQuery(dimoTokenId, window)` — same as pin query line |
| **Pagination** | **1 request** (no cursor); if response row count ≪ expected buckets, log as **incomplete response**, not auto backfill |
| **Max provider requests** | **1** GraphQL call for comparison replay; transport retries per DIMO gateway policy — cap operator run at **3** attempts total then abort |
| **Budget** | Category `POST_TRIP_ENRICHMENT`, priority `BACKGROUND`; subject to `DIMO_GLOBAL_MAX_IN_FLIGHT` (default **50** per process config) — verify gauge on VPS before run |
| **Artifact path** | `/tmp/exp021-provider-position-compare-<tripId>.json` (or `/opt/cursor/artifacts/…` on agent); **never** under `/opt/synqdrive/current` |
| **Per-bucket matrix** | `PIN_ABSENT_PROVIDER_PRESENT`, `PIN_ABSENT_PROVIDER_ABSENT`, `PIN_PRESENT_PROVIDER_PRESENT`, `PIN_PRESENT_PROVIDER_ABSENT`, `NULL_INVALID`, `NOT_COMPARABLE` (outside window / rejected label) |
| **Interpretation** | Later provider data **cannot alone** prove original fetch fault; only correlates pin `ROW_ABSENT` with independent query |
| **Forbidden** | Backfill, pin mutation, new projection, QC change |

### Operator preflight (before first provider call)

1. Read `exp021-position-fetch-metadata.json` for `dimoTokenId` and window.  
2. Confirm `READY_FOR_BOUNDED_PROVIDER_COMPARISON=true` checklist in comparison JSON template.  
3. Record `comparisonRequestedAtUtc` and `originalFetchProxyUtc`.

## Tests added

- `exp021-position-s3a-fetch-contract.unit.spec.ts` — no pagination in query, transport fail, sparse rows → selective `ROW_ABSENT`
- `di-v0-exp021-position-provider-compare.unit.spec.ts` — disjoint bucket matrix reconciliation

## Ops script

`backend/scripts/ops/exp021-position-provider-compare.ts` — Nest `AppModule.forRootAsync()` + DIMO gateway (`POST_TRIP_ENRICHMENT` / `BACKGROUND`), budget preflight probe, max **3** HTTP attempts (`DIMO_GLOBAL_MAX_RETRIES=2`). VPS: `SYNQDRIVE_RELEASE_BACKEND` + `EXP021_OVERLAY_ROOT` for PR-only compare modules.
