# DIMO Integration — Partial Module Authority

| Field | Value |
|-------|-------|
| **Registry coverage status** | `AUDIT_IN_PROGRESS` |
| **Authority maturity** | `PARTIAL_RECONSTRUCTION` |
| **Authority directory** | `architecture/dimo-integration/` |
| **Last updated** | 2026-10-11 (R1 deep audit) |

## Status banner

This authority is **not complete** and **must not** be treated as `AUTHORITY_ACTIVE`.

Bootstrap triggered by **R9 pre-merge governance correction** — substantive webhook/module changes on PR #1553 required DIMO Integration reconstruction per [`MODULE_AUTHORITY_STANDARD.md`](../MODULE_AUTHORITY_STANDARD.md).

| Phase | Status |
|-------|--------|
| **0 — Entry and scope** | **Complete** |
| **1 — Repository current-state audit** | **Initial consolidated baseline** — in progress |
| **2 — Production read-only audit** | **R1 refresh @ 2026-10-11** — Production `2b89f746…` @ `20261011154442_v4994` ([evidence/R1_PRODUCTION_FORENSICS_2026-10-11.md](evidence/R1_PRODUCTION_FORENSICS_2026-10-11.md)); historical R9 cohort evidence retained |
| **3 — Reconciliation and classification** | **In progress** — R1 repo vs Production SHA drift documented (`DIM-CX-004`) |
| **4 — Authority construction** | **Partial** — bootstrap graph + **R1 `research/*` corpus** + machine inventory |
| **5 — Validation and promotion gate** | **Pending** |

## Scope

**In scope (DIMO Integration):**

- Provider authentication (`DimoAuthService`, JWT/token paths)
- Provider gateway, admission, limiter, budget (`provider/`, `provider-budget/`)
- Telemetry acquisition (`DimoTelemetryService`, GraphQL queries)
- Segments (`DimoSegmentsService`, recharge segments client)
- Triggers registration/bootstrap (`DimoTriggersService`, bootstrap services)
- Webhooks (`DimoWebhookController`, payload verification, device-connection inbox)
- Device connection episodes and connectivity lifecycle
- Vehicle data-source link / DIMO vehicle binding
- DIMO worker queue wiring (snapshot poll, vehicle sync, DTC, connectivity webhook process)

**Out of scope (neighbor authorities):**

| Neighbor | Owns |
|----------|------|
| [Trip Detection & Lifecycle](../trip-detection-lifecycle/) | Trip FSM, wake mailboxes, handoff, trip-start evidence semantics |
| [Scaling Process](../scaling-process/) | Leader election, generic DIMO budget algorithm internals |
| [Battery V2](../battery-v2/) | Battery health models consuming telemetry |
| [Driving Intelligence](../drivingintelligence/) | Post-trip behavior — not provider gateway |
| [KG-EED](../knowledge-graphs/energy-event-detection/) | REFUEL/RECHARGE event semantics |

Flat `architecture/DIMO_*.md` files are **supporting evidence**, not routing authority.

## Operations runbooks

| Document | Role |
|----------|------|
| [operations/WEBHOOK_OPERATIONS.md](operations/WEBHOOK_OPERATIONS.md) | Verified DIMO Vehicle Triggers API workflows (R9-proven); webhook recovery design |

## R1 deep audit research corpus (`2026-10-11`)

| Document | Topic |
|----------|--------|
| [research/REPOSITORY_INVENTORY.md](research/REPOSITORY_INVENTORY.md) | Repo-wide file/symbol inventory |
| [research/DIMO_PROVIDER_CAPABILITIES.md](research/DIMO_PROVIDER_CAPABILITIES.md) | Provider APIs vs SynqDrive |
| [research/AUTHENTICATION_AND_PRIVILEGES.md](research/AUTHENTICATION_AND_PRIVILEGES.md) | JWT chain + privileges |
| [research/GRAPHQL_QUERY_REGISTRY.md](research/GRAPHQL_QUERY_REGISTRY.md) | Q001–Q027 re-validation |
| [research/SIGNAL_CAPABILITY_CATALOG.md](research/SIGNAL_CAPABILITY_CATALOG.md) | Signal layers + preflight |
| [research/POLLING_AND_WAKE_ARCHITECTURE.md](research/POLLING_AND_WAKE_ARCHITECTURE.md) | Scheduler, tiers, R9 wake |
| [research/WEBHOOK_AND_TRIGGER_ARCHITECTURE.md](research/WEBHOOK_AND_TRIGGER_ARCHITECTURE.md) | Ingress trust + triggers API drift |
| [research/PROVIDER_BUDGET_AND_FAILURES.md](research/PROVIDER_BUDGET_AND_FAILURES.md) | Budget executor + failures |
| [research/VEHICLE_IDENTITY_AND_CONSENT.md](research/VEHICLE_IDENTITY_AND_CONSENT.md) | Links + consent pointers |
| [research/CROSS_MODULE_CONSUMER_GRAPH.md](research/CROSS_MODULE_CONSUMER_GRAPH.md) | Downstream consumers |
| [research/DIMO_CAPABILITY_GAP_ANALYSIS.md](research/DIMO_CAPABILITY_GAP_ANALYSIS.md) | Gaps and R2 backlog |
| [research/AGENT_TROUBLESHOOTING_GUIDE.md](research/AGENT_TROUBLESHOOTING_GUIDE.md) | Agent quickstart |
| [research/QUERY_INVOCATION_GRAPH.md](research/QUERY_INVOCATION_GRAPH.md) | R2 invocation graph |
| [research/END_TO_END_CONSUMER_TRACES.md](research/END_TO_END_CONSUMER_TRACES.md) | Consumer traces |
| [research/R1_QUALITY_RECONCILIATION.md](research/R1_QUALITY_RECONCILIATION.md) | R1 QA |
| [research/AUTHORITY_PROMOTION_ASSESSMENT.md](research/AUTHORITY_PROMOTION_ASSESSMENT.md) | Promotion gate |

Machine inventory: [evidence/R1_REPOSITORY_INVENTORY.json](evidence/R1_REPOSITORY_INVENTORY.json)

Query graph: [graph/query-invocation-nodes.json](graph/query-invocation-nodes.json)

## Validation

```bash
bash architecture/scripts/validate-module-registry.sh
bash architecture/dimo-integration/scripts/validate-graph.sh
git diff --check
```
