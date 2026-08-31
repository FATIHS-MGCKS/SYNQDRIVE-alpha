# Changes — Phase 3A.1 Flight Recorder correction pass (2026-08-31)

## Changes

- **Dynamic reference query builder** replaces static `buildLatestSnapshotQuery()` ceiling for preflight and acquisition (`reference-capture-query-builder.ts`, `reference-capture-signal-schema.registry.ts`).
- **Temporal acquisition planner** drives real surface execution: `LATEST_LIVE`, `HF_HISTORICAL`, `LATEST_SLOW`, `NATIVE_EVENT_INCREMENTAL` (`reference-capture-acquisition-planner.ts`).
- **Autonomous BullMQ runner** (`reference.capture.recording` queue, `ReferenceCaptureProcessor`, `ReferenceCaptureRunnerService`) — recording continues without manual `/tick`.
- **Session-scoped event watermark** + SHA256 `providerEventFingerprint`; no 24h pre-session import; duplicate retrieval flagged in provenance.
- **HTTP ingress timing** at Axios response boundary (`postGraphQLWithHttpTiming`); `synqReceivedAt = httpResponseReceivedAt`.
- **Durable writer** with retry/backoff; terminal persist failure → session FAILED.
- **Evidence-based readiness** (`ReferenceCaptureReadinessService`) gates READY status.
- **Retention math corrected** (~147 MB/h logical, ~368 MB/h Postgres @ 80 signals); optional `ReferenceCaptureRetentionScheduler`.
- **Migration** `20260831200000_reference_capture_runner_state` — `event_watermark_at`, `acquisition_state_json`, `readiness_json`, `runner_job_id`, `provider_event_fingerprint`, `created_at` index.
- **Integration tests A–G** in `reference-capture-integration.spec.ts` (32 tests passing in reference-capture suite).

## Architektur

| Delta | Detail |
|-------|--------|
| Acquisition path | Preflight + capture use `buildBroadReferenceSignalsLatestQuery(fields[])` — per-vehicle dynamic, schema-validated |
| Runner | Isolated queue `reference.capture.recording`; self-rescheduling job; no production scheduler coupling |
| Event flow | Incremental from `sessionStartedAt` / `eventWatermarkAt`; identity separate from retrieval |
| Timestamps | RP-039 at HTTP client boundary; cycle/request IDs for traceability |
| Persistence | Failure-safe flush; session FAILED on terminal DB error |
| Retention | `created_at` index; purge manual or via optional cron when scheduler enabled |

**Phase 3A.1:** DONE  
**REFERENCE_DRIVE_READINESS:** READY (when feature enabled + preflight passes)
