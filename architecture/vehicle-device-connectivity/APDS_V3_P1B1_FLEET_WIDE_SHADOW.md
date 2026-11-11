# APDS V3 P1B1 — Fleet-wide shadow (draft)

**Mode:** `SHADOW_ONLY` — separate kill switch `WORKER_APDS_V3_SHADOW_ENABLED` + activation version `WORKER_APDS_V3_SHADOW_ACTIVATION_VERSION=APDS_V3_SHADOW_ACTIVATION_V1`.

## FLEET_WIDE_ELIGIBILITY

Dynamic: operational registry vehicle + active DIMO `dataSourceLink` + connectivity not `DISCONNECTED`/`HARD_OFFLINE`. **No vehicle allowlist.**

## ZERO_ADDITIONAL_DIMO_REQUESTS

Hook: `DimoSnapshotProcessor` after existing P25 shadow observe-only path at **baseline physical poll start** only. No new scheduler, no extra DIMO fetch.

## Observation scope

`BASELINE_PHYSICAL_POLL_START_ONLY` — savings are **not** certified; bounded observation space when only actual baseline polls are visible.

## TWO_REPLICA_IDEMPOTENCY

Unique `(organizationId, vehicleId, physicalRequestId, policyVersion)` on `apds_v3_shadow_decisions`. Insert-only with `decisionFingerprint`; conflicting replay raises immutable conflict (no overwrite).

## P1_BASELINE_NON_INTERFERENCE

`scheduleBaselineObserve` on processor critical path: no await, no V3-only extra DB round trips, try/catch fail-open. Bounded queue + timeout off critical path.

## P1_PHYSICAL_IDENTITY (R2 / hotfix)

Production canonical BullMQ job ids (`snapshot-${vehicleId}`) recycle across completed jobs. Physical identity is **execution-bound**: `physical-fetch:exec:{enqueueAttemptId}:run:{attemptsMade}` when admissible enqueue evidence exists; `correlationAttemptId` remains the enqueue UUID. Without enqueue evidence on a canonical job id, physical identity is **unverified** (fail-closed). Non-canonical job ids may still use `physical-fetch:{jobId}:run:{attemptsMade}`.

## BASELINE_SOURCE_LINK (R2)

`baselineProviderSourceLinkId` from the baseline poll envelope is mandatory. Missing/inactive/wrong-tenant/superseded → eligibility fail-closed (`BASELINE_SOURCE_LINK_*`). No fallback to another active DIMO link.

## RUNTIME_RESOURCE_SAFETY (R2)

`ApdsV3ShadowRuntimeQueue` holds concurrency until work settles; `AbortSignal` + `WORKER_APDS_V3_SHADOW_DB_STATEMENT_TIMEOUT_MS` (`SET LOCAL statement_timeout` in causal load transaction). Budget mutex is limited to atomic write-budget reservation only (not eligibility/causal/persist).

## POSTGRES_CONCURRENCY_CERT

`apds-v3-shadow-concurrency.postgres.integration.spec.ts` (disposable PG, `APDS_V3_SHADOW_PG=1`) — wired in `backend/scripts/test/p25-apd-shadow-postgres-ci.sh`.

## KILL_SWITCH

`WORKER_APDS_V3_SHADOW_ENABLED` default off. Rate cap `WORKER_APDS_V3_SHADOW_MAX_WRITES_PER_MINUTE` (default 600/replica).
