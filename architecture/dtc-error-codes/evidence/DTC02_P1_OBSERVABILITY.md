# DTC-02 P1 — Observability & baseline (repository)

**Status:** implementation (not deployed)  
**Scope:** Prometheus metrics + fleet trust DB snapshots on existing scheduler ticks only.

## Metrics (prefix `synqdrive_dtc02_`)

| Area | Metrics |
|------|---------|
| Scheduler | `scheduler_tick_total`, `fan_out_vehicles_total`, `fan_out_skip_total` |
| Poll | `poll_total`, `poll_outcome_total`, `provider_request_total`, `poll_duration_seconds` |
| Webhook | `webhook_total`, `webhook_skip_total`, `webhook_evidence_total` |
| Source trust | `outbox_pending`, `outbox_unprocessed_errors`, `head_vls_divergence_vehicles`, `fleet_freshness_vehicles` |

**Cardinality:** no `vehicleId`, `tokenId`, VIN, tenant, or DTC code labels.

## Offboarded vehicles (scheduling eligibility — no P1 behavior change)

Code: `evaluateDtcPollJobAdmission` returns `enqueue: false` with `REGISTRY_LIFECYCLE_EXCLUDED` for `OFFBOARDED` / `ARCHIVED`.

Production historical note (2026-10-17): two OFFBOARDED DIMO-linked vehicles still show **403** on `last_dtc_poll_at` from **prior** scheduling / stale jobs. With current admission, **new fan-out must not enqueue** them. P1 records `fan_out_skip_total{reason="REGISTRY_LIFECYCLE_EXCLUDED"}` when scanned.

**P1 does not prove webhook delivery reliability** — webhook counters only observe handler paths when events arrive.

## occurrenceCount

See [`docs/dtc-02-occurrence-count-semantics.md`](../../../docs/dtc-02-occurrence-count-semantics.md).

## Code entrypoints

- `backend/src/modules/vehicle-intelligence/dtc/observability/*`
- Instrumentation: `dimo-dtc.processor.ts`, `dimo-webhook.controller.ts`, `dtc-snapshot-apply.service.ts` (webhook audit refs only for duplicate-safe 01A outcomes)
