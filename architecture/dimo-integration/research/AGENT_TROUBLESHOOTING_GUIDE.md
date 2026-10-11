# Agent quickstart — DIMO Integration

Read first: [`AGENT_CONTRACT.md`](../AGENT_CONTRACT.md) → [`CURRENT_STATE.md`](../CURRENT_STATE.md) → this page.

## I want to change the DIMO snapshot (Q001) poll

1. **Authority:** `architecture/dimo-integration/` + Trip Detection (tier interaction).
2. **Code:** `latest-vehicle-snapshot.query.ts`, `dimo-telemetry.service.ts`, `dimo-snapshot.processor.ts`, `dimo-snapshot.scheduler.ts`, `snapshot-polling-tier.config.ts`.
3. **Flags:** `WORKER_SNAPSHOT_*`, `WORKER_SNAPSHOT_ACTIVITY_TIER_POLLING_ENABLED`, `WORKER_SNAPSHOT_LEGACY_FIXED_CADENCE`.
4. **Queues:** `dimo.snapshot.poll` (`queue-names.ts`).
5. **Consumers:** VLS, fleet map, health boxes, Battery/tire context — grep `fetchLatestVehicleSnapshot`.
6. **Tests:** `dimo-telemetry.service.spec.ts`, `dimo-snapshot.processor*.spec.ts`, tier simulation specs.
7. **Do not:** confuse scheduler interval with GraphQL bucket interval.

## I want to change auth / privileges

1. **Code:** `dimo-auth.service.ts`, `dimo.config.ts`.
2. **Call sites:** ripgrep `getVehicleJwt(` (**53** files @ R1).
3. **Cache:** Redis keys `dimo:developer:jwt`, `dimo:vehicle:jwt:*`.
4. **Evidence:** [`research/AUTHENTICATION_AND_PRIVILEGES.md`](AUTHENTICATION_AND_PRIVILEGES.md).

## I want to change segments / trips

1. **DIMO:** `dimo-segments.service.ts`, `trip-segments.query.ts`, `validate-dimo-segments-query.ts`.
2. **Owner of boundaries:** Trip Detection authority — not DIMO.
3. **422 guard:** `fixtures/dimo-telemetry-segments.schema.fixture.ts`.

## I want to change webhooks / R9 wake

1. **Ingress:** `dimo-webhook.controller.ts`, `dimo-webhook-payload.util.ts`.
2. **Wake handoff:** `SnapshotWakeIntakeService` (Trip Detection) — update **both** authorities.
3. **Provider mutations:** `operations/WEBHOOK_OPERATIONS.md`, `r9-*.mjs` scripts — **not** runtime bootstrap by default.
4. **Do not use** `DimoTriggersService.subscribeVehicle` for new work without verifying API — prefer ops script pattern (`/subscribe/{tokenDID}`).

## I want to add a GraphQL query

1. Add builder under `backend/src/modules/dimo/queries/`.
2. Register invocation via `DimoTelemetryService` + executor context.
3. Update [`research/GRAPHQL_QUERY_REGISTRY.md`](GRAPHQL_QUERY_REGISTRY.md) and Phase 2A successor entry.
4. Run `bash architecture/dimo-integration/scripts/validate-graph.sh`.

## Validators

```bash
bash architecture/scripts/validate-module-registry.sh
bash architecture/dimo-integration/scripts/validate-graph.sh
git diff --check
```
