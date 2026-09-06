# SynqDrive Rental Architecture — Canonical Module Registry

**Purpose:** This is the **mandatory first routing point** for agents working on SynqDrive rental product and shared frontend/backend runtime domains — including frontend, backend, API, UI, workers, integrations, persistence, and cross-module runtime contracts. It is an index and governance authority — **not** a replacement for module-specific documentation.

**Last updated:** 2026-09-06 (registry bootstrap)

---

## 1. Why this registry exists

SynqDrive has multiple living architecture authorities with explicit epistemic discipline, validation scripts, and cross-module boundaries. Without a central registry, agents risk:

- reading stale flat `architecture/*.md` memos as current truth
- silently reconstructing module knowledge per task
- conflating ownership across related domains (for example REFUEL detection vs fuel-station enrichment)
- shipping behavior changes without updating canonical architectural memory

This registry routes every agent to the correct authority **before** code inspection or implementation.

---

## 2. Source-of-truth hierarchy

Apply this order when facts conflict:

| Priority | Layer | Role |
|----------|-------|------|
| 1 | **Code + verified runtime evidence** | What the system actually does today |
| 2 | **Registered module authority** | Canonical architectural memory, navigation, decisions, gaps, validation |
| 3 | **Supporting root-level phase/change records** | Historical evidence (`architecture/P1_*`, `architecture/BATTERY_V2_*`, etc.) unless a registered authority explicitly elevates one |
| 4 | **Plans, hypotheses, open questions** | **Not facts** — do not promote to architecture without evidence |

When code and registered authority disagree: **record the conflict**, investigate, update the authority in the same workstream/PR, and never silently overwrite either side.

---

## 3. Mandatory agent routing algorithm

```
1. READ this registry (SYNQDRIVE_RENTAL_ARCHITECTURE.md)
2. IDENTIFY affected module(s) from task scope
3. IF registered:
     a. Read all mandatory entry documents for that module (listed below)
     b. Read cross-referenced owning authorities when boundaries overlap
     c. Check open questions / contradictions before assuming facts
4. IF NOT registered:
     a. STOP — do not silently reconstruct for this task only
     b. Run full audit workflow (see §5)
     c. Register module in this file in same workstream/PR
5. IMPLEMENT with authority updates in same workstream/PR when substantive
6. RUN applicable authority validators
7. REPORT which authorities and change records were updated
```

---

## 4. Registered authorities

### Tankstellenerkennung (Fuel Station Identification)

| Field | Value |
|-------|-------|
| **Scope** | OSM fuel-station reference data, candidate lookup/scoring, `FuelStationLocationResolver` V1, async station enrichment persistence + BullMQ orchestration, cutover/no-backfill policy, API projection (Phase E), Fahrverlauf timeline presentation (Phase F). **Begins after** a REFUEL `VehicleEnergyEvent` exists. |
| **Authority directory** | [`architecture/tankstellenerkennung/`](tankstellenerkennung/) |
| **Status / maturity** | **Bootstrap V1** (2026-09-01) · Incremental / open scientific workstream · Runtime impact: documentation and knowledge graph only |
| **Ownership boundary** | **Does NOT decide whether refueling happened.** REFUEL detection belongs to **KG-EED**. Three confidence domains must never be conflated: event confidence (A), station match confidence (B), presentation trust (C). |
| **Mandatory entry documents** | [README.md](tankstellenerkennung/README.md) · [CURRENT_STATE.md](tankstellenerkennung/CURRENT_STATE.md) · [KNOWLEDGE_GRAPH.md](tankstellenerkennung/KNOWLEDGE_GRAPH.md) · [AGENT_CONTRACT.md](tankstellenerkennung/AGENT_CONTRACT.md) · [decisions/DECISION_REGISTER.md](tankstellenerkennung/decisions/DECISION_REGISTER.md) · [research/CHANGE_LEDGER.md](tankstellenerkennung/research/CHANGE_LEDGER.md) |
| **Validation** | `bash architecture/tankstellenerkennung/scripts/validate-graph.sh` (or `node architecture/tankstellenerkennung/scripts/validate-graph.mjs`) |

---

### Battery V2

| Field | Value |
|-------|-------|
| **Scope** | Battery V2 architectural memory: ICE/HEV/PHEV/BEV profiles, HV/LV signal authority, health model (capacity, SOH, publication readiness), lifecycle (charge sessions, REST bridge, trip-to-battery), execution (jobs, locking, idempotency, DLQ), persistence, API/frontend consumers, Phase 4 resolution planning. |
| **Authority directory** | [`architecture/battery-v2/`](battery-v2/) |
| **Status / maturity** | **Phase 4 resolution planning** (2026-09-01) · Incremental / open scientific workstream — implementation packages defined, gaps remain open · Runtime impact: documentation and knowledge graph only |
| **Ownership boundary** | Owns Battery V2 behavior, policy, lifecycle, signals, health model, queues, persistence, scheduling, reconciliation, publication, and safety boundaries. Orthogonal to HV charge session semantics referenced by KG-ATE/KG-EED. |
| **Mandatory entry documents** | [README.md](battery-v2/README.md) · [CURRENT_STATE.md](battery-v2/CURRENT_STATE.md) · [KNOWLEDGE_GRAPH.md](battery-v2/KNOWLEDGE_GRAPH.md) · [AGENT_CONTRACT.md](battery-v2/AGENT_CONTRACT.md) · [resolution/README.md](battery-v2/resolution/README.md) · [research/CHANGE_LEDGER.md](battery-v2/research/CHANGE_LEDGER.md) |
| **Validation** | `bash architecture/battery-v2/scripts/validate-graph.sh` (or `node architecture/battery-v2/scripts/validate-graph.mjs`) |

---

### Scaling Process

| Field | Value |
|-------|-------|
| **Scope** | Horizontal scaling, multi-replica coordination, production scale gates, deployment lifecycle: scheduler leader election, DIMO global provider budget, reconciliation execution mutex, BullMQ/worker model, PM2/nginx topology, failure/recovery, scaling envelopes, validation evidence. |
| **Authority directory** | [`architecture/scaling-process/`](scaling-process/) |
| **Status / maturity** | **Bootstrap established** 2026-09-01 · Living architecture authority (not a final report) |
| **Ownership boundary** | Owns scheduler leader election, DIMO provider budget algorithm, reconciliation mutex, multi-replica deploy/rollback lifecycle. Shared infrastructure referenced by KG-ATE (leader, mutex, budget) — ATE documents usage, not algorithm internals. |
| **Mandatory entry documents** | [README.md](scaling-process/README.md) · [CURRENT_STATE.md](scaling-process/CURRENT_STATE.md) · [SCALING_PROCESS_KNOWLEDGE_GRAPH.md](scaling-process/SCALING_PROCESS_KNOWLEDGE_GRAPH.md) · [AGENT_MAINTENANCE_POLICY.md](scaling-process/AGENT_MAINTENANCE_POLICY.md) · [SYSTEM_TOPOLOGY.md](scaling-process/SYSTEM_TOPOLOGY.md) · [DECISION_LOG.md](scaling-process/DECISION_LOG.md) · [VALIDATION_EVIDENCE.md](scaling-process/VALIDATION_EVIDENCE.md) · [OPEN_QUESTIONS_AND_FUTURE_WORK.md](scaling-process/OPEN_QUESTIONS_AND_FUTURE_WORK.md) |
| **Validation** | Per [AGENT_MAINTENANCE_POLICY.md](scaling-process/AGENT_MAINTENANCE_POLICY.md): `node architecture/scaling-process/scripts/validate-open-questions.mjs` when editing OQ IDs; `node architecture/scaling-process/scripts/validate-current-state-keys.mjs` when editing CURRENT_STATE machine header |

---

### Automatic Trip Enrichment (ATE) — KG-ATE

| Field | Value |
|-------|-------|
| **Scope** | Post-finalize trip behavior enrichment orchestration: enqueue/sync lifecycle, hardware-path routing (SMART5 HF vs LTE_R1 native), route/safety enrichment stage, misuse trigger, driving-impact job enqueue, reconciliation repair → enrichment chain, `behaviorEnrichmentStatus` FSM, UI/manual fallback paths. |
| **Authority directory** | [`architecture/knowledge-graphs/automatic-trip-enrichment/`](knowledge-graphs/automatic-trip-enrichment/) |
| **Status / maturity** | **`CANONICAL`** (per [GRAPH.yaml](knowledge-graphs/automatic-trip-enrichment/GRAPH.yaml) and [README.md](knowledge-graphs/automatic-trip-enrichment/README.md)) · Canonicalized 2026-09-01 @ `4843a4ebc` |
| **Ownership boundary** | **MAY_TRIGGER** `detectEnergyEvents` from reconciliation step 5. **Does NOT own** REFUEL/RECHARGE semantics (→ KG-EED), DI V2 scoring (→ KG-Driving-Intelligence), DIMO budget internals (→ Scaling Process), Battery HV sessions (→ Battery V2). See [governance/AUTHORITY_BOUNDARIES.md](knowledge-graphs/automatic-trip-enrichment/governance/AUTHORITY_BOUNDARIES.md). |
| **Mandatory entry documents** | [README.md](knowledge-graphs/automatic-trip-enrichment/README.md) · [GRAPH.yaml](knowledge-graphs/automatic-trip-enrichment/GRAPH.yaml) · [governance/AGENT_PROTOCOL.md](knowledge-graphs/automatic-trip-enrichment/governance/AGENT_PROTOCOL.md) · [governance/AUTHORITY_BOUNDARIES.md](knowledge-graphs/automatic-trip-enrichment/governance/AUTHORITY_BOUNDARIES.md) · [graph/nodes.yaml](knowledge-graphs/automatic-trip-enrichment/graph/nodes.yaml) · [graph/edges.yaml](knowledge-graphs/automatic-trip-enrichment/graph/edges.yaml) · [graph/invariants.yaml](knowledge-graphs/automatic-trip-enrichment/graph/invariants.yaml) · [open-questions/OPEN_QUESTIONS.md](knowledge-graphs/automatic-trip-enrichment/open-questions/OPEN_QUESTIONS.md) |
| **Validation** | `node architecture/knowledge-graphs/automatic-trip-enrichment/scripts/validate-graph.mjs` |

---

### Energy Event Detection (EED) — KG-EED

| Field | Value |
|-------|-------|
| **Scope** | REFUEL and RECHARGE detection, parsing, coalescing, persistence; `durationSeconds` vs `fuelLevelRiseDurationSeconds` semantics; sibling reconciliation; `VehicleEnergyEvent` and API DTO semantics; trip timeline energy card UI semantics. |
| **Authority directory** | [`architecture/knowledge-graphs/energy-event-detection/`](knowledge-graphs/energy-event-detection/) |
| **Status / maturity** | **`APPROVED_FOR_CANONICAL_MERGE`** per [GRAPH.yaml](knowledge-graphs/energy-event-detection/GRAPH.yaml) (`status` and `authority_state`; `main_sha_at_canonicalization: null`) and [README.md](knowledge-graphs/energy-event-detection/README.md). PR #1486 is **already merged** on `main` (merge commit `182731fe48cd25578668f102ed847f4791fbaabd`), but EED’s own lifecycle metadata has **not** been promoted to `CANONICAL`. That post-merge promotion gap is an explicit lifecycle/documentation inconsistency requiring a **separate EED-authority follow-up**. Until that follow-up occurs, agents must **not** infer or silently assign `CANONICAL` status. |
| **Ownership boundary** | **OWNS** all REFUEL/RECHARGE detection semantics, coalescing, persist gates, fuel-rise derivation, sibling reconciliation, energy API/UI contracts. **KG-ATE** may trigger `detectEnergyEvents` only — EED owns meaning. Fuel station enrichment trust detail is downstream (Tankstellenerkennung consumes persisted REFUEL events). See [governance/AUTHORITY_BOUNDARIES.md](knowledge-graphs/energy-event-detection/governance/AUTHORITY_BOUNDARIES.md). |
| **Mandatory entry documents** | [README.md](knowledge-graphs/energy-event-detection/README.md) · [GRAPH.yaml](knowledge-graphs/energy-event-detection/GRAPH.yaml) · [governance/AGENT_PROTOCOL.md](knowledge-graphs/energy-event-detection/governance/AGENT_PROTOCOL.md) · [governance/AUTHORITY_BOUNDARIES.md](knowledge-graphs/energy-event-detection/governance/AUTHORITY_BOUNDARIES.md) · [graph/nodes.yaml](knowledge-graphs/energy-event-detection/graph/nodes.yaml) · [graph/edges.yaml](knowledge-graphs/energy-event-detection/graph/edges.yaml) · [graph/invariants.yaml](knowledge-graphs/energy-event-detection/graph/invariants.yaml) · [open-questions/OPEN_QUESTIONS.md](knowledge-graphs/energy-event-detection/open-questions/OPEN_QUESTIONS.md) |
| **Validation** | `node architecture/knowledge-graphs/energy-event-detection/scripts/validate-graph.mjs` |

---

## 5. Unregistered-module bootstrap

**Absence from this registry triggers the full audit/documentation workflow** — not ad-hoc reconstruction.

1. Audit complete relevant current state (code, data flow, persistence, workers, integrations, consumers, tests, runtime evidence, neighbor boundaries).
2. Create `architecture/<module-slug>/` using [`architecture/tankstellenerkennung/`](tankstellenerkennung/) as the structural reference.
3. Minimum artifacts: `README.md`, `CURRENT_STATE.md`, `AGENT_CONTRACT.md` (or named maintenance protocol), `KNOWLEDGE_GRAPH.md` or machine-readable graph, `decisions/`, `evidence/`, `contradictions/` or gaps, append-only `history/`.
4. Classify knowledge on **two separate axes** (do not merge them):
   - **Epistemic state** — what is known about a claim (for example `CONFIRMED`, `INFERRED`, `HISTORICAL`, `UNKNOWN`, `CONTRADICTED`)
   - **Decision / validation status** — maturity of a decision or change (for example `PROPOSED`, `EXPERIMENTAL`, `VALIDATED`, `PRODUCTION_VALIDATED`, `REJECTED`, `SUPERSEDED`)
   Each module authority’s own schema is authoritative; use its equivalent vocabulary when it differs from these examples.
5. Add a registry entry in this file in the **same workstream/PR**.

**Existing flat `architecture/*.md` documents** remain supporting evidence. They do **not** automatically become canonical authorities when a module is bootstrapped.

---

## 6. Definition of done — architecture-affecting work

A workstream is **not complete** until:

- [ ] Affected registered authorities updated in the **same PR** when substantive behavior/architecture changed
- [ ] BEFORE / WHY / CHANGE / alternatives / expected effect / validation / observed effect / non-effects / tradeoffs / gaps recorded where applicable
- [ ] Open questions and contradictions updated — not silently deleted
- [ ] Cross-module boundaries consulted; every owning authority updated for cross-cutting changes
- [ ] Applicable authority validators run (or limitation documented if validators require unavailable runtime deps)
- [ ] Final agent report states which authorities and change records were updated
- [ ] This registry updated if module status, entry documents, validation commands, or boundaries changed

---

## 7. Registry maintenance triggers

Update this file when:

| Trigger | Action |
|---------|--------|
| Authority **created**, **renamed**, **moved**, **split**, **merged**, or **superseded** | Add/update/remove registry entry; link successor |
| **Status** or maturity classification changes | Update status field; preserve historical note in module authority |
| **Entry documents** or graph entry points change | Update mandatory entry document links |
| **Validation commands** change | Update validation column |
| **Ownership boundaries** change | Update boundary text; ensure both sides of cross-graph contracts updated |

---

## Cross-authority quick reference

```
REFUEL detected?     → KG-EED
Station identified?  → Tankstellenerkennung (after REFUEL event exists)
Trip enrichment?     → KG-ATE
Battery health?      → Battery V2
Multi-replica/scale? → Scaling Process
```

Do not conflate confidence domains across Tankstellenerkennung and KG-EED. Do not document energy-event field semantics in KG-ATE.
