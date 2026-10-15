# VSI-03 P2C — Durable per-poll aggregated source observations

## Feature flags (default OFF)

| Env | Purpose |
|-----|---------|
| `VSI03_P2C_SOURCE_OBSERVATION_CAPTURE_ENABLED=true` | Append observations from `DimoSnapshotProcessor` |
| `VSI03_P2C_STRICT_ADVANCE_FROM_OBSERVATIONS_ENABLED=true` | Composer reads observations for `strictSourceAdvanced` |

Do not enable in production without owner approval and migration apply.

## Data model

Table `vehicle_provider_source_observations` — append-only fetch evidence:

| Phase | When | Outcome |
|-------|------|---------|
| `PROVIDER_FETCH` | After DIMO response normalization, **before** monotonic guard | `PROVIDER_FETCH_RECORDED` or `MONOTONIC_STALE_SKIPPED` or `PERSISTENCE_FAILED` |
| `VLS_APPLICATION` | After successful `vehicle_latest_states` upsert | `VLS_COMMITTED` |

`providerSourceTimestamp` is DIMO `lastSeen` only — never wall-clock or ClickHouse `recorded_at`.

### Continuity (P2C-R1 / R2)

- `vehicle_provider_source_observation_counters` allocates monotonic `observationIndex` per scope via **atomic PostgreSQL upsert** (committed before row insert).
- A failed insert attempts a `PERSISTENCE_FAILED` tombstone at the reserved index.
- **Counter authority:** fetch rows without a matching `vehicle_provider_source_observation_counters` row abstain (`OBSERVATION_COUNTER_AUTHORITY_MISSING`) — no counter, no proven continuity.
- **Counter head gate:** `nextObservationIndex - 1` must have a `PROVIDER_FETCH` row; otherwise strict advance abstains (`COUNTER_ALLOCATED_HEAD_MISSING_OBSERVATION`). A newer `PERSISTENCE_FAILED` at the head also abstains — older successful pairs are not evaluated.
- **Outage before allocation:** if the process dies before the counter transaction commits, that poll attempt leaves no ledger evidence and cannot be reconstructed retroactively.
- **Strict advance evidence scope:** `LATEST_RECORDED_OBSERVATION_PAIR` only — advancement between two durable observations at the counter head. This is **not** latest actual provider-poll advancement and **not** proof of complete poll history.
- **Strict advance** additionally requires consecutive successful head pair indices, VLS provenance complete, and `VLS_COMMITTED` for the latest fetch (except stale-skip fetches).
- **ClickHouse `telemetry_snapshots` row counts are not successful poll counts** — descriptive/historical only for P2C strict advance.

### Idempotency

- Fetch: `vsi03-p2c:fetch:{jobId}:attempt:{attemptsMade}`
- VLS application: `vsi03-p2c:vls-application:{fetchCorrelationId}`

Distinct BullMQ attempts on the same job ID produce distinct fetch rows.

## Strict advance semantics

- Does **not** use ClickHouse.
- Does **not** use `MAX(recorded_at) < VLS.source`.
- Abstains (`UNKNOWN`) on missing VLS fields, continuity gaps, missing VLS application proof, or retention-induced index gaps.

## Resource impact (forecast)

**Observed fleet cadence (production P2B/P2A cohort, 7d):** ~2.4k–3.3k SUCCESS snapshot polls per vehicle per 7 days (~340–470 fetches/day per active DIMO vehicle), not 2,880/minute.

**Theoretical upper bound** (~30s poll interval): up to **2,880 PROVIDER_FETCH rows / vehicle / day** if every poll succeeds and capture is enabled.

| Scale | Rows / day / vehicle (observed order-of-magnitude) | 30-day rows / vehicle | Storage hint |
|-------|-----------------------------------------------------|------------------------|--------------|
| 1 vehicle | ~400–500 | ~12k–15k | ~200 bytes/row → ~3 MB / 30d |
| 1,000 vehicles | ~0.4–0.5M | ~12–15M | ~2.5 GB / 30d |

Two rows per successful apply path (`PROVIDER_FETCH` + `VLS_APPLICATION`) increases volume by up to ~2× for non-stale polls.

Indexes: `idempotency_key` (unique); scope + `observation_index` + `record_phase`; fetch correlation; counter PK.

**Retention (pre-activation):** align with `dimo_poll_logs` retention when enabling capture; pruning without tombstone preservation will force `UNKNOWN` strict advance. Do not prune counter table without operational review.

**Read path:** bounded (`take: 50` max for pair selection; evaluator uses latest two successful fetches).

**Write latency:** one counter transaction + one–two inserts per snapshot when capture enabled; failures are non-blocking for the snapshot pipeline.

## Tests

```bash
cd backend && npm test -- --testPathPatterns=vehicle-signal-intelligence
VSI03_READONLY_COMPOSER_PG=1 npx jest vsi-provider-source-observation.concurrency.postgres.integration --runInBand
```
