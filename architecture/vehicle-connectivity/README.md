# Vehicle Connectivity — Module Authority (Bootstrap)

| Field | Value |
|-------|-------|
| **Registry coverage status** | `AUDIT_IN_PROGRESS` |
| **Authority-native status** | Bootstrap audit · current-state reconstruction in progress |
| **Authority directory** | `architecture/vehicle-connectivity/` |
| **Last updated** | 2026-09-11 |

## Status banner

This authority is **not complete** and **must not** be treated as `AUTHORITY_ACTIVE`.

Bootstrap Phase 0 establishes scope, ownership boundaries, graph scaffolding, initial hypotheses, ground-truth methodology, and registry routing per [`MODULE_AUTHORITY_STANDARD.md`](../MODULE_AUTHORITY_STANDARD.md).

| Phase | Status |
|-------|--------|
| **0 — Entry and scope** | **Complete** (this workstream) |
| **1 — Repository current-state audit** | **Pending** — bounded discovery indexed only |
| **2 — Production read-only audit** | **Pending** — immediate next phase |
| **3 — Reconciliation and classification** | **Not started** |
| **4 — Authority construction** | **Bootstrap scaffold** |
| **5 — Validation and promotion gate** | **Pending** |

## Purpose

Provider-neutral **vehicle connectivity lifecycle** semantics: hardware/provider freshness, standby vs disconnect vs reconnect evidence, fault classification, and connectivity-state projection across DIMO hardware (initial focus: Ruptela LTE_R1) and High Mobility.

Vehicle Connectivity owns **what connectivity means** and **how evidence is interpreted**. It does **not** own provider API clients, trip FSM, or fleet CRUD.

## Scope (intended)

- Connectivity state semantics (`connected`, `standby`, `suspect`, `disconnected`, recovery)
- Source freshness semantics (`sourceTimestamp` vs `providerFetchedAt` vs poll time)
- Hardware/provider connectivity profiles (LTE_R1 first)
- Expected silence / sleep behavior and ground-truth methodology
- Fault classification (device vs provider vs permission vs CAN absence)
- Provider-neutral connectivity projection and consumer contracts
- Connectivity alert-policy semantics **where based on connection state**

## Explicit non-scope

| Neighbor | Continues to own |
|----------|------------------|
| [DIMO Integration](../dimo-integration/) | DIMO auth, API gateway, `signalsLatest` acquisition, webhooks, triggers, DIMO-specific normalization |
| [Trip Detection & Lifecycle](../trip-detection-lifecycle/) | Trip start/end, FSM, segment reconciliation, snapshot-wake handoff semantics |
| [Vehicles (Fleet Operations)](#) — inventory | Vehicle entity, fleet CRUD, operational presentation shell |
| High Mobility Integration — inventory | HM provider implementation, HM ingestion/webhooks |
| [Scaling Process](../scaling-process/) | Leader election, generic scheduler/multi-replica algorithms |
| Notifications — inventory | Delivery channels; VC owns **connectivity-state-based alert semantics** only |

Flat `architecture/*.md` memos and prior forensic chat output are **supporting evidence**, not routing authority, until indexed here with epistemic classification.

## Mandatory entry documents

| Document | Role |
|----------|------|
| [CURRENT_STATE.md](./CURRENT_STATE.md) | Best-known snapshot (bootstrap — incomplete) |
| [AUDIT_MANIFEST.md](./AUDIT_MANIFEST.md) | Audit metadata and coverage matrix |
| [AGENT_CONTRACT.md](./AGENT_CONTRACT.md) | Rules for future agents |
| [KNOWLEDGE_GRAPH.md](./KNOWLEDGE_GRAPH.md) | Human-readable graph overview |
| [research/OPEN_HYPOTHESES.md](./research/OPEN_HYPOTHESES.md) | Falsifiable research questions |
| [ground-truth/TEST_STRATEGY.md](./ground-truth/TEST_STRATEGY.md) | Reproducible connectivity test methodology |

## Validation

```bash
bash architecture/vehicle-connectivity/scripts/validate-graph.sh
bash architecture/scripts/validate-module-registry.sh
```

## Runtime impact

**None in this bootstrap workstream** — documentation and knowledge graph only.
