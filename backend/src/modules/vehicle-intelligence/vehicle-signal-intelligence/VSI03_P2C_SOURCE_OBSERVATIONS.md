# VSI-03 P2C — Durable per-poll aggregated source observations

## Feature flags (default OFF)

| Env | Purpose |
|-----|---------|
| `VSI03_P2C_SOURCE_OBSERVATION_CAPTURE_ENABLED=true` | Append observations from `DimoSnapshotProcessor` |
| `VSI03_P2C_STRICT_ADVANCE_FROM_OBSERVATIONS_ENABLED=true` | Composer reads observations for `strictSourceAdvanced` |

Do not enable in production without owner approval and migration apply.

## Data model

Table `vehicle_provider_source_observations` — append-only, one row per successful DIMO snapshot **fetch** (before monotonic VLS guard). Captures both `VLS_APPLIED` and `MONOTONIC_STALE_SKIPPED`.

`providerSourceTimestamp` is DIMO `lastSeen` only — never wall-clock or ClickHouse `recorded_at`.

## Strict advance semantics

- Compare **latest** vs **immediate predecessor** by `observationIndex` within `(org, vehicle, provider, binding scope, token scope)`.
- `observationIndex` gap → `UNKNOWN` (fail-closed).
- Latest row must align with current VLS binding/fetch/source when outcome is `VLS_APPLIED`.
- ClickHouse is **not** used for `strictSourceAdvanced`.

## Resource impact (forecast)

Assumptions: ~1 snapshot poll / vehicle / 30s for DIMO cohort vehicles; ~2.9k polls / vehicle / 7d (matches production Ruptela cohort).

| Scale | Rows / day / vehicle | 30-day rows / vehicle | Notes |
|-------|----------------------|------------------------|-------|
| 1 vehicle | ~2,880 | ~86k | ~200 bytes/row → ~17 MB / vehicle / 30d |
| 1,000 vehicles | ~2.88M | ~86M | ~17 GB / 30d (order-of-magnitude) |

Indexes: unique `idempotency_key`; scope + `observation_index`; `(org, vehicle, binding, provider_fetched_at DESC)`.

**Proposed retention:** align with `dimo_poll_logs` retention policy when activated (ops follow-up); until then table grows append-only.

**Read path:** `take: 2` by `observation_index DESC` — bounded.

**Write latency:** one transactional insert per snapshot when capture flag on; failures logged, snapshot pipeline continues.

**Gap detection:** `OBSERVATION_SEQUENCE_GAP` when index delta ≠ 1; composer abstains (`UNKNOWN`).

## Tests

```bash
cd backend && npm test -- --testPathPattern=vehicle-signal-intelligence
VSI03_READONLY_COMPOSER_PG=1 npx jest vsi-readonly-composer.postgres.integration --runInBand
```
