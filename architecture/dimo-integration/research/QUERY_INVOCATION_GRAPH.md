# R2 — Query invocation graph

| Audit repository | `0633d08311803b1473c6e7a274e5074e4cb69a08` |
|------------------|---------------------------------------------|

## Machine artifacts

- Nodes: [`graph/query-invocation-nodes.json`](../graph/query-invocation-nodes.json)
- Edges: [`graph/query-invocation-edges.json`](../graph/query-invocation-edges.json)
- Regenerator: `node architecture/dimo-integration/scripts/r2-build-query-invocation-graph.mjs`
- Validator: `node architecture/dimo-integration/scripts/validate-query-invocation-graph.mjs`

## Summary @ R2

| Metric | Count |
|--------|------:|
| Invocation surfaces documented | **25** |
| Unique GraphQL builder files | **16** |
| Registry IDs Q001–Q027 | **27** entries (22 definitions + 5 invocation contexts per Phase 2A) |
| `DORMANT` | **1** (Q011 `fetchTirePressureHistory` — no external callers) |
| `FLAG_GATED` | Reference capture, DI S4 dormant |
| `OPS_ONLY` | `DimoController.queryGraphQL` arbitrary query |

## Reachability: legacy triggers (R2-B proof)

| Symbol | Reachable at runtime? | Evidence |
|--------|----------------------|----------|
| `DimoTriggersService.subscribeVehicle` | **Only if** `DIMO_TRIGGER_BOOTSTRAP_ENABLED=true` | Sole caller chain: `DimoTriggersBootstrapService.onModuleInit` → `registerAllTriggersForVehicle` (`dimo-triggers-bootstrap.service.ts:48`) |
| Production bootstrap flag | **false** (unset) | `R2_PRODUCTION_RUNTIME_CONTRACT.md` |
| Runtime read path | `getVehicleWebhookSubscriptions` (GET) | `device-connection-webhook-configuration.service.ts:56` |

**Verdict:** `API_SCHEMA_CONTRADICTION` for dormant Nest client methods; **not** `PRODUCTION_FAILURE_CONFIRMED` for R9 (ops-created CEL webhooks + subscribe API).

## Answer template (per invocation row)

Each node in `query-invocation-nodes.json` includes fields for the R2 twelve questions: entrypoints, JWT, budget category, frequency, normalizer, persistence, consumers, error semantics, flags, reachability, production verification, and evidence file references.

## Inline GraphQL (not separate builder files)

| implementationId | queryId | Location |
|------------------|---------|----------|
| IMPL-Q003 | Q003 | `fetchVehicleSummary` inline `signalsLatest` |
| IMPL-Q004 | Q004 | `fetchVehicleVin` → `vinVCLatest` |

## Unresolved / follow-up

Static script does not yet auto-parse all `DimoSegmentsService` private methods — manual curation for Q007/Q010/Q012/Q013. R2.1 could add TypeScript AST pass.
