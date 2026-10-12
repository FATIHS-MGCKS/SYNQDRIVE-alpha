# E2E Reliability — Webhook → Wake → Snapshot → Persist (R4.5-C)

## Happy path (speed / ignition, RESTING FSM)

```
POST /webhooks/dimo
  → SnapshotWakeIntakeService.handleProviderWake
  → SnapshotWakeCoordinatorService.requestSnapshot (Redis scripts, job id coalesce)
  → Bull queue dimo.snapshot.poll
  → DimoSnapshotProcessor.runSnapshotPipeline
  → getVehicleJwt → fetchLatestVehicleSnapshot → normalizeSnapshot → VLS upsert
```

Trip FSM consumes VLS / wake handoff — **Trip Detection authority**.

## Documented loss / delay paths

| Stage | Condition | User-visible effect |
|-------|-----------|---------------------|
| Ingress | `unknown_vehicle` | No wake, no snapshot |
| Wake | `IGNORED_INELIGIBLE` (status / not CONNECTED) | No snapshot |
| Wake | `IGNORED_FSM_ACTIVE` | No snapshot (by design) |
| Wake | `INVALID_SIGNAL` | No snapshot |
| Coordinator | Redis unavailable / script failure | Delay or lost wake — **not production-quantified** |
| Queue | Job coalesced / already covered | `ALREADY_COVERED` metric |
| Snapshot | `registry_lifecycle` not operational | **skipped** (not failure) |
| Snapshot | JWT **403** | **FAILURE** — no VLS update (**DIM-DEF-001**) |
| VLS merge | Stale `source_timestamp` | Scalar skip; `providerFetchedAt` may still advance |
| Device connection | Inbox retry exhausted | Dead letter — episode may lag |

## Idempotency highlights

- Snapshot job id: `snapshot-{vehicleId}` coalesce (`snapshot-wake-queue.util.ts`)
- Device connection inbox: unique `provider_providerEventId`
- Episode resolution outbox: idempotency keys `episode:{id}:runtime:{snapshotId}`

## Redis / queue failure

**Code:** Vehicle JWT lock degrades without Redis; wake coordinator uses Redis Lua scripts (`snapshot-wake-redis.scripts.ts`).

**Production measurement:** NOT quantified in R4.5 — no Redis outage window observed. Classify as **OPEN** operational risk, not confirmed defect.

## Dead letter

- Connectivity webhook inbox → dead letter after max attempts
- Episode resolution outbox → dead letter — separate from R9 wake path
