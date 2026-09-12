# DIMO Integration — Partial Module Authority

| Field | Value |
|-------|-------|
| **Registry coverage status** | `AUDIT_IN_PROGRESS` |
| **Authority maturity** | `PARTIAL_RECONSTRUCTION` |
| **Authority directory** | `architecture/dimo-integration/` |
| **Last updated** | 2026-09-08 |

## Status banner

This authority is **not complete** and **must not** be treated as `AUTHORITY_ACTIVE`.

Bootstrap triggered by **R9 pre-merge governance correction** — substantive webhook/module changes on PR #1553 required DIMO Integration reconstruction per [`MODULE_AUTHORITY_STANDARD.md`](../MODULE_AUTHORITY_STANDARD.md).

| Phase | Status |
|-------|--------|
| **0 — Entry and scope** | **Complete** |
| **1 — Repository current-state audit** | **Initial consolidated baseline** — in progress |
| **2 — Production read-only audit** | **Verified baseline established** — R9 runtime **deployed** @ `0ba96e03…`; five-vehicle provider canary **PASS** (5/5 speed+ignition); natural wake delivery **not yet validated** |
| **3 — Reconciliation and classification** | **Pending / in progress** |
| **4 — Authority construction** | **Partial** — bootstrap graph + R9 cross-module decision + canary evidence |
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

## Validation

```bash
bash architecture/scripts/validate-module-registry.sh
bash architecture/dimo-integration/scripts/validate-graph.sh
git diff --check
```
