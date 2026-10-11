# R1 — Repository inventory (DIMO Integration)

| Field | Value |
|-------|-------|
| **Audit head SHA** | `0633d08311803b1473c6e7a274e5074e4cb69a08` |
| **Generated** | `2026-10-11` (see machine inventory) |
| **Epistemic** | **CONFIRMED_FROM_CODE** unless noted |

## Scope

Full-repository scan per R1 mission: not limited to `backend/src/modules/dimo/`. Indirect consumers include Trip Detection, Vehicle & Device Connectivity, Driving Intelligence / EXP-021, Battery V2, Energy Events, Tankstellenerkennung, DTC, tire/brake health, reference-capture tooling, master admin surfaces, and ops scripts.

## Machine-readable index

- [`evidence/R1_REPOSITORY_INVENTORY.json`](../evidence/R1_REPOSITORY_INVENTORY.json) — regenerated via `node architecture/dimo-integration/scripts/r1-generate-inventory.mjs`

## Counts (R1 generator @ `0633d0831…`)

| Metric | Count |
|--------|------:|
| TypeScript files under `backend/src/modules/dimo/` | **337** |
| Repo paths with filename containing `dimo` (excl. node_modules) | **273** |
| Repo files mentioning dimo/Dimo/DIMO (broad rg) | **2232** |
| Dedicated `*.query.ts` builders in dimo module | **16** |

## Runtime entry points (Nest + workers)

| Entry | Path | Role |
|-------|------|------|
| Nest module | `backend/src/modules/dimo/dimo.module.ts` | DI graph, exports provider gateway + telemetry + triggers |
| REST | `backend/src/modules/dimo/dimo.controller.ts` | Ops/diagnostic HTTP surface |
| Webhook ingress | `backend/src/modules/dimo/dimo-webhook.controller.ts` | `POST /webhooks/dimo` — triggers, DTC, OBD plug, R9 wake handoff |
| Snapshot scheduler | `backend/src/workers/schedulers/dimo-snapshot.scheduler.ts` | 30s tick → `dimo.snapshot.poll` queue |
| Snapshot processor | `backend/src/workers/processors/dimo-snapshot.processor.ts` | Q001-shaped fetch → VLS persistence |
| Vehicle sync worker | `dimo.vehicle.sync` queue (see `queue-names.ts`) | Identity/link reconciliation |
| DTC processor | `backend/src/workers/processors/dimo-dtc.processor.ts` | Scheduled/on-demand DTC poll |

## Query builder files (canonical GraphQL string builders)

Listed in `R1_REPOSITORY_INVENTORY.json` → `queryBuilderPaths`. Additional inline GraphQL exists in `dimo-telemetry.service.ts`, `dimo-segments.service.ts`, `recharge-segments/`, and cross-module reference-capture adapters.

## Indirect alias search (verified hotspots)

| Alias / symbol | Primary owner module |
|----------------|---------------------|
| `VehicleDataSourceLink` | `dimo-vehicle-data-source-link.service.ts` |
| `getVehicleJwt` | `dimo-auth.service.ts` (+ **53** backend files referencing) |
| `signalsLatest` | Telemetry + many consumers |
| `SnapshotWake*` | `backend/src/workers/snapshot-wake/` (Trip Detection boundary) |
| `availableSignals` / `dataSummary` | Capability preflight (DI + battery + dimo queries) |
| `tokenId` | Prisma vehicle link + webhook payload normalization |

## Dormant / ops-only / competing paths

| Path | Runtime status | Notes |
|------|----------------|-------|
| `DimoTriggersService.subscribeVehicle` → `POST …/vehicles/{tokenId}` | **DORMANT_IN_RUNTIME** — service comment: manual console + ops scripts | **CONTRADICTED** vs current Vehicle Triggers API (`DIM-CX-002`) |
| `backend/scripts/ops/r9-*` | **OPS_ACTIVE** | Uses `/subscribe/{tokenDID}` per current docs |
| `mcp-dimo-main/` (if present) | See repo glob | MCP template for agents; not Production runtime |
| `DIMO_TRIGGER_BOOTSTRAP_ENABLED` | **Default false** | No auto-bootstrap on startup (`dimo.config.ts`) |

## Symbol reference density (file count with symbol name)

From R1 JSON: `DimoSnapshotProcessor` **11**, `getVehicleJwt` **53**, `availableSignals` **63** files (includes non-DIMO modules).

## Historical audits (supporting evidence, not authority)

- Phase 2A query registry: `docs/audits/dimo-phase-2a-current-query-surface-audit-2026-08-31.md` (**HISTORICAL** baseline; R1 re-validates at `0633d0831…` in [`GRAPHQL_QUERY_REGISTRY.md`](GRAPHQL_QUERY_REGISTRY.md))
