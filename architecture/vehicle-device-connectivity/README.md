# Vehicle & Device Connectivity — Module Authority (Bootstrap)

| Field | Value |
|-------|-------|
| **Registry coverage status** | `AUDIT_IN_PROGRESS` |
| **Authority-native status** | Bootstrap audit · current-state reconstruction in progress |
| **Authority directory** | `architecture/vehicle-device-connectivity/` |
| **Last updated** | 2026-09-11 |

## Status banner

This authority is **not complete** and **must not** be treated as `AUTHORITY_ACTIVE`.

Bootstrap Phase 0 establishes scope, ownership boundaries, graph scaffolding, initial hypotheses, ground-truth methodology, and registry routing per [`MODULE_AUTHORITY_STANDARD.md`](../MODULE_AUTHORITY_STANDARD.md).

| Phase | Status |
|-------|--------|
| **0 — Entry and scope** | **Complete** |
| **1 — Repository current-state audit** | **Complete** (2026-09-11) — see [CURRENT_STATE.md](./CURRENT_STATE.md) |
| **2 — Production read-only audit** | **Pending** — immediate next phase |
| **3 — Reconciliation and classification** | **Not started** |
| **4 — Authority construction** | **Bootstrap scaffold** |
| **5 — Validation and promotion gate** | **Pending** |

## Abbreviation

**VDC** = **Vehicle & Device Connectivity** (canonical module abbreviation).

## Purpose

Provider-neutral **vehicle and connectivity-device lifecycle** semantics: hardware/provider freshness, standby vs disconnect vs reconnect evidence, physical/device evidence, fault classification, and connectivity-state projection across DIMO hardware (initial focus: Ruptela LTE_R1; future DIMO Smart5) and High Mobility OEM/cloud providers.

Vehicle & Device Connectivity owns **what vehicle and device connectivity mean** and **how resulting evidence is interpreted**. It does **not** own provider API clients, trip FSM, or fleet CRUD.

## Scope (intended)

Vehicle & Device Connectivity includes semantic ownership of **both**:

- **A) vehicle connectivity state** — provider link, telemetry freshness, standby/disconnect/reconnect projection
- **B) connectivity-device state** — physical connectivity hardware; DIMO LTE R1 / Ruptela; future DIMO Smart5; device plugged/unplugged state; device power state where observable; device sleep/wake behavior; modem/LTE reachability where observable; device heartbeat/periodic records; device native events; provider device binding; device disconnect/reconnect evidence; device hardware failure indicators; expected device silence; hardware-vs-provider-vs-vehicle fault classification; per-device/provider connectivity profiles

Additional scope topics:

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
| Notifications — inventory | Delivery channels; VDC owns **connectivity-state-based alert semantics** only |

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
| [signals/SIGNAL_AUTHORITY.md](./signals/SIGNAL_AUTHORITY.md) | Timestamp authority matrix (Phase 1) |
| [signals/FRESHNESS_SEMANTICS.md](./signals/FRESHNESS_SEMANTICS.md) | Freshness thresholds and dimensions |
| [lifecycle/CURRENT_SEMANTIC_MAP.md](./lifecycle/CURRENT_SEMANTIC_MAP.md) | Current-state label map |
| [evidence/REPOSITORY_INVENTORY.md](./evidence/REPOSITORY_INVENTORY.md) | Complete source path inventory |

## Validation

```bash
bash architecture/vehicle-device-connectivity/scripts/validate-graph.sh
bash architecture/scripts/validate-module-registry.sh
```

## Runtime impact

**None in this bootstrap workstream** — documentation and knowledge graph only.
