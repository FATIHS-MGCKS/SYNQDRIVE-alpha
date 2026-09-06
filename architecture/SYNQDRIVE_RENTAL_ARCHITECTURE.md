# SynqDrive Rental Architecture — Canonical Module Registry

**Purpose:** This is the **mandatory first routing point** for agents working on SynqDrive rental product and shared frontend/backend runtime domains — including frontend, backend, APIs, UI contracts, persistence, workers, schedulers, integrations, signals, and cross-module runtime flows. It is an index and governance authority — **not** a replacement for module-specific documentation.

**Normative audit standard:** [`MODULE_AUTHORITY_STANDARD.md`](MODULE_AUTHORITY_STANDARD.md) — mandatory for current-state audits, module directory structure, repository/Production evidence requirements, Production read-only safety, and promotion from `AUDIT_IN_PROGRESS` to `AUTHORITY_ACTIVE`.

**Central registry validator:** `bash architecture/scripts/validate-module-registry.sh`

**Last updated:** 2026-09-06 (registry synchronization gate + central validator)

---

## Module inventory overview

Canonical overview of known modules. **Every row includes module name, mini description, and registry status.** Detailed authority sections below apply only where registry coverage status is `AUTHORITY_ACTIVE`.

| Module | Mini description | Registry status | Authority-native status | Authority path |
|--------|------------------|-----------------|-------------------------|----------------|
| Automatic Trip Enrichment (ATE) | Orchestrates post-finalize trip behavior enrichment, hardware routing, and reconciliation-driven enrichment chains. | `AUTHORITY_ACTIVE` | `CANONICAL` (per [GRAPH.yaml](knowledge-graphs/automatic-trip-enrichment/GRAPH.yaml)) | [`architecture/knowledge-graphs/automatic-trip-enrichment/`](knowledge-graphs/automatic-trip-enrichment/) |
| Battery V2 | Documents Battery V2 health model, signal authority, lifecycle, execution, persistence, and consumer contracts. | `AUTHORITY_ACTIVE` | Phase 4 resolution planning · gaps remain open | [`architecture/battery-v2/`](battery-v2/) |
| Driving Intelligence | Transforms vehicle telemetry and completed trip boundaries into driving-behavior events, operational-load scoring, durable post-trip analysis, misuse signals, and API/UI projections. | `AUTHORITY_ACTIVE` | Retrospective expansion V2 (2026-09-06) · SUBSTANTIAL reconstruction | [`architecture/drivingintelligence/`](drivingintelligence/) |
| Energy Event Detection (EED) | Owns REFUEL/RECHARGE detection semantics, persistence, coalescing, and energy-event API/UI contracts. | `AUTHORITY_ACTIVE` | `APPROVED_FOR_CANONICAL_MERGE` — PR #1486 merged on `main` (`182731fe48cd25578668f102ed847f4791fbaabd`); authority metadata not yet promoted to `CANONICAL` (see [EED section](#energy-event-detection-eed--kg-eed)) | [`architecture/knowledge-graphs/energy-event-detection/`](knowledge-graphs/energy-event-detection/) |
| Scaling Process | Documents horizontal scaling, multi-replica coordination, scheduler leader election, and production scale gates. | `AUTHORITY_ACTIVE` | Bootstrap established · living architecture authority | [`architecture/scaling-process/`](scaling-process/) |
| Tankstellenerkennung | Identifies physical fuel stations after a REFUEL `VehicleEnergyEvent` has been persisted. | `AUTHORITY_ACTIVE` | Bootstrap V1 · incremental/open scientific workstream | [`architecture/tankstellenerkennung/`](tankstellenerkennung/) |

**Next workstream boundary:** This registry currently inventories only the six structured authorities above. A repository-wide module inventory (adding all discoverable SynqDrive modules with name, mini description, and initial registry status — normally `NOT_STARTED`) is a **separate follow-up workstream**. Do not infer documentation from flat `architecture/*.md` mentions alone.

---

## Registry coverage status model

Registry coverage status answers: **Is there a usable architecture authority for this module?** It is separate from each module authority’s own native lifecycle, maturity, epistemic, and validation statuses.

Examples of **authority-native** statuses (not registry coverage): `CANONICAL`, `APPROVED_FOR_CANONICAL_MERGE`, `PRODUCTION_VALIDATED`, Bootstrap V1, Phase 4 resolution planning.

| Registry status | Meaning |
|-----------------|---------|
| **`NOT_STARTED`** | The module name and a short inventory-level description are known, but no complete current-state audit or canonical module authority exists. |
| **`AUDIT_IN_PROGRESS`** | Reconstruction and documentation have started but remain incomplete. Partial documentation must **not** be treated as complete authority. |
| **`AUTHORITY_ACTIVE`** | A structured, usable, living module authority exists and **must** be consulted before substantive work. It may still contain explicit gaps or open questions. |
| **`SUPERSEDED`** | This registry entry is no longer authoritative. Agents must follow the named successor authority. |

### Status transitions (not automatic)

```
NOT_STARTED → AUDIT_IN_PROGRESS → AUTHORITY_ACTIVE → SUPERSEDED
```

Transition arrows are **not** automatic. Each transition requires the gates defined in [`MODULE_AUTHORITY_STANDARD.md`](MODULE_AUTHORITY_STANDARD.md). All future repository-wide inventory rows begin as `NOT_STARTED` unless a usable authority is verified. Finding flat `architecture/*.md` documents does **not** satisfy the standard.

### Inventory placeholder semantics (future repository-wide inventory)

When modules are added in the separate inventory workstream:

| Field | `NOT_STARTED` placeholder |
|-------|---------------------------|
| Registry coverage status | `NOT_STARTED` |
| Authority-native status | `N/A — inventory only` (exact) |
| Authority path | `—` (exact) |
| Transition on reconstruction | Set `AUDIT_IN_PROGRESS` as soon as authority reconstruction begins |

Do not add undiscovered modules in governance-only PRs.

### SUPERSEDED successor notation

Record an explicit successor using the prefix `Successor:` in one or more of:

- overview **Authority-native status** (for example `Successor: Battery V2`)
- overview **Mini description** (only when necessary)
- detail section **Successor** row (for example `Successor: [Battery V2](#battery-v2)` or `Successor: [architecture/battery-v2/](battery-v2/)`)

The successor must name a registered module or provide a resolvable registry anchor / authority link. Broken or unnamed successors fail central validation.

### Registry synchronization protocol

After **every substantive module workstream**:

1. Re-read the **overview row** for each affected module (always).
2. For `AUTHORITY_ACTIVE`, also re-read the **mandatory detailed authority section**.
3. For `AUDIT_IN_PROGRESS`, review partial detail/authority material when present.
4. `NOT_STARTED` does not require an active detailed section.
5. `SUPERSEDED` follows its documented historical section and successor pointer when present.
6. Modify this registry **only when registry facts changed** (module name, mini description, registry coverage status, authority-native status, authority path, scope, boundaries, mandatory entry documents, validation commands, successor, Last updated).
7. `AUTHORITY_ACTIVE` does **not** change merely because implementation code changed.
8. Report every affected module as `UPDATED` or `UNCHANGED` with before/after coverage status and reason. `UNCHANGED` requires an explicit review — never skip.
9. Cross-module work requires **independent review** of all affected rows.
10. Run `bash architecture/scripts/validate-module-registry.sh` before completion.

### Knowledge classification axes (authority artifacts)

When bootstrapping or updating authorities, use **three separate axes** — never merge into one status field:

| Axis | Examples | Notes |
|------|----------|-------|
| **Registry coverage status** | `NOT_STARTED`, `AUDIT_IN_PROGRESS`, `AUTHORITY_ACTIVE`, `SUPERSEDED` | Governed by this registry |
| **Epistemic state** | `CONFIRMED`, `INFERRED`, `HISTORICAL`, `UNKNOWN`, `CONTRADICTED` | What is known about a claim |
| **Decision / validation status** | `PROPOSED`, `EXPERIMENTAL`, `VALIDATED`, `PRODUCTION_VALIDATED`, `REJECTED`, `SUPERSEDED` | Maturity of a decision or change |

Follow the owning module authority’s exact schema where it defines equivalent vocabulary. Do not require every example status if the domain uses another documented equivalent.

---

## 1. Why this registry exists

SynqDrive has multiple living architecture authorities with explicit epistemic discipline, validation scripts, and cross-module boundaries. Without a central registry, agents risk:

- reading stale flat `architecture/*.md` memos as current truth
- silently reconstructing module knowledge per task
- conflating ownership across related domains (for example REFUEL detection vs fuel-station enrichment)
- treating an inventoried module name as if it were already audited and safe to change
- shipping behavior changes without updating canonical architectural memory

This registry routes every agent to the correct authority **before** code inspection or implementation.

---

## 2. Source-of-truth hierarchy

Apply this order when facts conflict:

| Priority | Layer | Role |
|----------|-------|------|
| 1 | **Code + verified runtime evidence** | What the system actually does today |
| 2 | **Registered module authority** (`AUTHORITY_ACTIVE`) | Canonical architectural memory, navigation, decisions, gaps, validation |
| 3 | **Supporting root-level phase/change records** | Historical evidence (`architecture/P1_*`, `architecture/BATTERY_V2_*`, etc.) unless a registered authority explicitly elevates one |
| 4 | **Plans, hypotheses, open questions** | **Not facts** — do not promote to architecture without evidence |

When code and registered authority disagree: **record the conflict**, investigate, update the authority in the same workstream/PR, and never silently overwrite either side.

---

## 3. Mandatory agent routing algorithm

```
1. READ this registry (SYNQDRIVE_RENTAL_ARCHITECTURE.md)
2. READ MODULE_AUTHORITY_STANDARD.md when status is NOT_STARTED or AUDIT_IN_PROGRESS
3. FIND module in inventory overview table
4. BRANCH on registry coverage status:
     AUTHORITY_ACTIVE:
       a. Read all mandatory entry documents (detailed sections below)
       b. Read cross-referenced owning authorities when boundaries overlap
       c. Check open questions / contradictions before assuming facts
     NOT_STARTED:
       a. Treat as NO authority — do not assume understanding from inventory row
       b. Read and execute MODULE_AUTHORITY_STANDARD.md (Phases 0–5)
       c. Set AUDIT_IN_PROGRESS when reconstruction begins
       d. Update registry row + detailed section in same workstream/PR
     AUDIT_IN_PROGRESS:
       a. Continue under MODULE_AUTHORITY_STANDARD.md
       b. Read partial audit artifacts only — not complete authority
       c. Complete missing repository + Production audit surfaces
       d. Promote to AUTHORITY_ACTIVE only via standard promotion gate
     SUPERSEDED:
       a. Follow successor pointer; do not extend superseded authority
     ABSENT from inventory:
       a. Add row as NOT_STARTED (name, mini description, registry status)
       b. Then execute MODULE_AUTHORITY_STANDARD.md when substantive work is requested
5. IMPLEMENT with authority updates in same workstream/PR when substantive
6. RUN applicable authority validators
7. REPORT which authorities and change records were updated
```

---

## 4. Registered authorities (`AUTHORITY_ACTIVE`)

Detailed sections for modules with usable living authorities. See [Module inventory overview](#module-inventory-overview) for the canonical status summary.

### Tankstellenerkennung (Fuel Station Identification)

| Field | Value |
|-------|-------|
| **Registry coverage status** | `AUTHORITY_ACTIVE` |
| **Scope** | OSM fuel-station reference data, candidate lookup/scoring, `FuelStationLocationResolver` V1, async station enrichment persistence + BullMQ orchestration, cutover/no-backfill policy, API projection (Phase E), Fahrverlauf timeline presentation (Phase F). **Begins after** a REFUEL `VehicleEnergyEvent` exists. |
| **Authority directory** | [`architecture/tankstellenerkennung/`](tankstellenerkennung/) |
| **Authority-native status** | **Bootstrap V1** (2026-09-01) · Incremental / open scientific workstream · Runtime impact: documentation and knowledge graph only |
| **Ownership boundary** | **Does NOT decide whether refueling happened.** REFUEL detection belongs to **KG-EED**. Three confidence domains must never be conflated: event confidence (A), station match confidence (B), presentation trust (C). |
| **Mandatory entry documents** | [README.md](tankstellenerkennung/README.md) · [CURRENT_STATE.md](tankstellenerkennung/CURRENT_STATE.md) · [KNOWLEDGE_GRAPH.md](tankstellenerkennung/KNOWLEDGE_GRAPH.md) · [AGENT_CONTRACT.md](tankstellenerkennung/AGENT_CONTRACT.md) · [decisions/DECISION_REGISTER.md](tankstellenerkennung/decisions/DECISION_REGISTER.md) · [research/CHANGE_LEDGER.md](tankstellenerkennung/research/CHANGE_LEDGER.md) |
| **Validation** | `bash architecture/tankstellenerkennung/scripts/validate-graph.sh` (or `node architecture/tankstellenerkennung/scripts/validate-graph.mjs`) |

---

### Battery V2

| Field | Value |
|-------|-------|
| **Registry coverage status** | `AUTHORITY_ACTIVE` |
| **Scope** | Battery V2 architectural memory: ICE/HEV/PHEV/BEV profiles, HV/LV signal authority, health model (capacity, SOH, publication readiness), lifecycle (charge sessions, REST bridge, trip-to-battery), execution (jobs, locking, idempotency, DLQ), persistence, API/frontend consumers, Phase 4 resolution planning. |
| **Authority directory** | [`architecture/battery-v2/`](battery-v2/) |
| **Authority-native status** | **Phase 4 resolution planning** (2026-09-01) · Incremental / open scientific workstream — implementation packages defined, gaps remain open · Runtime impact: documentation and knowledge graph only |
| **Ownership boundary** | Owns Battery V2 behavior, policy, lifecycle, signals, health model, queues, persistence, scheduling, reconciliation, publication, and safety boundaries. Orthogonal to HV charge session semantics referenced by KG-ATE/KG-EED. |
| **Mandatory entry documents** | [README.md](battery-v2/README.md) · [CURRENT_STATE.md](battery-v2/CURRENT_STATE.md) · [KNOWLEDGE_GRAPH.md](battery-v2/KNOWLEDGE_GRAPH.md) · [AGENT_CONTRACT.md](battery-v2/AGENT_CONTRACT.md) · [resolution/README.md](battery-v2/resolution/README.md) · [research/CHANGE_LEDGER.md](battery-v2/research/CHANGE_LEDGER.md) |
| **Validation** | `bash architecture/battery-v2/scripts/validate-graph.sh` (or `node architecture/battery-v2/scripts/validate-graph.mjs`) |

---

### Driving Intelligence

| Field | Value |
|-------|-------|
| **Registry coverage status** | `AUTHORITY_ACTIVE` |
| **Scope** | DIMO telemetry acquisition (live + post-trip HF), trip-window association, HF reconstruction and behavior event detection, native DIMO driving events, driving impact/stress scoring (V1 production), tire and brake operational load proxies, V2 durable post-trip pipeline (stage orchestrator, assessability, evidence), reference capture/HF recovery testbed, rental and driver-subject aggregation, health module inputs, API and fleet/rental UI projection. **Consumes** completed trips and enriches them. |
| **Authority directory** | [`architecture/drivingintelligence/`](drivingintelligence/) |
| **Authority-native status** | **Retrospective expansion V2** (2026-09-06) · **SUBSTANTIAL reconstruction** — full workstream 2026-08-30 → present · Runtime impact: documentation and knowledge graph only |
| **Ownership boundary** | **Does NOT own canonical trip boundaries** — Trip Detection / DIMO Segments own trip start/end and live trip FSM. **Does NOT own** REFUEL/RECHARGE energy events (→ KG-EED). **Does NOT own** fuel-station identification (→ Tankstellenerkennung). Three confidence domains must never be conflated: assessability dimension status (A), event provenance native vs HF-reconstructed (B), driving stress score as operational load not driver quality (C). |
| **Mandatory entry documents** | [README.md](drivingintelligence/README.md) · [CURRENT_STATE.md](drivingintelligence/CURRENT_STATE.md) · [KNOWLEDGE_GRAPH.md](drivingintelligence/KNOWLEDGE_GRAPH.md) · [AGENT_CONTRACT.md](drivingintelligence/AGENT_CONTRACT.md) · [COVERAGE_MATRIX.md](drivingintelligence/COVERAGE_MATRIX.md) · [decisions/DECISION_REGISTER.md](drivingintelligence/decisions/DECISION_REGISTER.md) · [evidence/EVIDENCE_INDEX.md](drivingintelligence/evidence/EVIDENCE_INDEX.md) · [contradictions/CONTRADICTION_REGISTER.md](drivingintelligence/contradictions/CONTRADICTION_REGISTER.md) · [research/OPEN_QUESTIONS.md](drivingintelligence/research/OPEN_QUESTIONS.md) |
| **Validation** | `bash architecture/drivingintelligence/scripts/validate-graph.sh` · `bash architecture/drivingintelligence/scripts/validate-docs.sh` |

---

### Scaling Process

| Field | Value |
|-------|-------|
| **Registry coverage status** | `AUTHORITY_ACTIVE` |
| **Scope** | Horizontal scaling, multi-replica coordination, production scale gates, deployment lifecycle: scheduler leader election, DIMO global provider budget, reconciliation execution mutex, BullMQ/worker model, PM2/nginx topology, failure/recovery, scaling envelopes, validation evidence. |
| **Authority directory** | [`architecture/scaling-process/`](scaling-process/) |
| **Authority-native status** | **Bootstrap established** 2026-09-01 · Living architecture authority (not a final report) |
| **Ownership boundary** | Owns scheduler leader election, DIMO provider budget algorithm, reconciliation mutex, multi-replica deploy/rollback lifecycle. Shared infrastructure referenced by KG-ATE (leader, mutex, budget) — ATE documents usage, not algorithm internals. |
| **Mandatory entry documents** | [README.md](scaling-process/README.md) · [CURRENT_STATE.md](scaling-process/CURRENT_STATE.md) · [SCALING_PROCESS_KNOWLEDGE_GRAPH.md](scaling-process/SCALING_PROCESS_KNOWLEDGE_GRAPH.md) · [AGENT_MAINTENANCE_POLICY.md](scaling-process/AGENT_MAINTENANCE_POLICY.md) · [SYSTEM_TOPOLOGY.md](scaling-process/SYSTEM_TOPOLOGY.md) · [DECISION_LOG.md](scaling-process/DECISION_LOG.md) · [VALIDATION_EVIDENCE.md](scaling-process/VALIDATION_EVIDENCE.md) · [OPEN_QUESTIONS_AND_FUTURE_WORK.md](scaling-process/OPEN_QUESTIONS_AND_FUTURE_WORK.md) |
| **Validation** | Per [AGENT_MAINTENANCE_POLICY.md](scaling-process/AGENT_MAINTENANCE_POLICY.md): `node architecture/scaling-process/scripts/validate-open-questions.mjs` when editing OQ IDs; `node architecture/scaling-process/scripts/validate-current-state-keys.mjs` when editing CURRENT_STATE machine header |

---

### Automatic Trip Enrichment (ATE) — KG-ATE

| Field | Value |
|-------|-------|
| **Registry coverage status** | `AUTHORITY_ACTIVE` |
| **Scope** | Post-finalize trip behavior enrichment orchestration: enqueue/sync lifecycle, hardware-path routing (SMART5 HF vs LTE_R1 native), route/safety enrichment stage, misuse trigger, driving-impact job enqueue, reconciliation repair → enrichment chain, `behaviorEnrichmentStatus` FSM, UI/manual fallback paths. |
| **Authority directory** | [`architecture/knowledge-graphs/automatic-trip-enrichment/`](knowledge-graphs/automatic-trip-enrichment/) |
| **Authority-native status** | **`CANONICAL`** (per [GRAPH.yaml](knowledge-graphs/automatic-trip-enrichment/GRAPH.yaml) and [README.md](knowledge-graphs/automatic-trip-enrichment/README.md)) · Canonicalized 2026-09-01 @ `4843a4ebc` |
| **Ownership boundary** | **MAY_TRIGGER** `detectEnergyEvents` from reconciliation step 5. **Does NOT own** REFUEL/RECHARGE semantics (→ KG-EED), DI V2 scoring (→ KG-Driving-Intelligence), DIMO budget internals (→ Scaling Process), Battery HV sessions (→ Battery V2). See [governance/AUTHORITY_BOUNDARIES.md](knowledge-graphs/automatic-trip-enrichment/governance/AUTHORITY_BOUNDARIES.md). |
| **Mandatory entry documents** | [README.md](knowledge-graphs/automatic-trip-enrichment/README.md) · [GRAPH.yaml](knowledge-graphs/automatic-trip-enrichment/GRAPH.yaml) · [governance/AGENT_PROTOCOL.md](knowledge-graphs/automatic-trip-enrichment/governance/AGENT_PROTOCOL.md) · [governance/AUTHORITY_BOUNDARIES.md](knowledge-graphs/automatic-trip-enrichment/governance/AUTHORITY_BOUNDARIES.md) · [graph/nodes.yaml](knowledge-graphs/automatic-trip-enrichment/graph/nodes.yaml) · [graph/edges.yaml](knowledge-graphs/automatic-trip-enrichment/graph/edges.yaml) · [graph/invariants.yaml](knowledge-graphs/automatic-trip-enrichment/graph/invariants.yaml) · [open-questions/OPEN_QUESTIONS.md](knowledge-graphs/automatic-trip-enrichment/open-questions/OPEN_QUESTIONS.md) |
| **Validation** | `node architecture/knowledge-graphs/automatic-trip-enrichment/scripts/validate-graph.mjs` |

---

### Energy Event Detection (EED) — KG-EED

| Field | Value |
|-------|-------|
| **Registry coverage status** | `AUTHORITY_ACTIVE` — a structured, usable authority exists and **must** be consulted before substantive EED work |
| **Scope** | REFUEL and RECHARGE detection, parsing, coalescing, persistence; `durationSeconds` vs `fuelLevelRiseDurationSeconds` semantics; sibling reconciliation; `VehicleEnergyEvent` and API DTO semantics; trip timeline energy card UI semantics. |
| **Authority directory** | [`architecture/knowledge-graphs/energy-event-detection/`](knowledge-graphs/energy-event-detection/) |
| **Authority-native status** | **`APPROVED_FOR_CANONICAL_MERGE`** per [GRAPH.yaml](knowledge-graphs/energy-event-detection/GRAPH.yaml) (`status` and `authority_state`; `main_sha_at_canonicalization: null`) and [README.md](knowledge-graphs/energy-event-detection/README.md) |
| **Lifecycle inconsistency (explicit)** | PR #1486 is **already merged** on `main` (merge commit `182731fe48cd25578668f102ed847f4791fbaabd`). EED’s own lifecycle metadata has **not** been promoted to `CANONICAL`. This post-merge promotion gap is an explicit documentation/lifecycle inconsistency requiring a **separate EED-authority follow-up**. Until that follow-up occurs, agents must **not** infer or silently assign `CANONICAL`. |
| **Ownership boundary** | **OWNS** all REFUEL/RECHARGE detection semantics, coalescing, persist gates, fuel-rise derivation, sibling reconciliation, energy API/UI contracts. **KG-ATE** may trigger `detectEnergyEvents` only — EED owns meaning. Fuel station enrichment trust detail is downstream (Tankstellenerkennung consumes persisted REFUEL events). See [governance/AUTHORITY_BOUNDARIES.md](knowledge-graphs/energy-event-detection/governance/AUTHORITY_BOUNDARIES.md). |
| **Mandatory entry documents** | [README.md](knowledge-graphs/energy-event-detection/README.md) · [GRAPH.yaml](knowledge-graphs/energy-event-detection/GRAPH.yaml) · [governance/AGENT_PROTOCOL.md](knowledge-graphs/energy-event-detection/governance/AGENT_PROTOCOL.md) · [governance/AUTHORITY_BOUNDARIES.md](knowledge-graphs/energy-event-detection/governance/AUTHORITY_BOUNDARIES.md) · [graph/nodes.yaml](knowledge-graphs/energy-event-detection/graph/nodes.yaml) · [graph/edges.yaml](knowledge-graphs/energy-event-detection/graph/edges.yaml) · [graph/invariants.yaml](knowledge-graphs/energy-event-detection/graph/invariants.yaml) · [open-questions/OPEN_QUESTIONS.md](knowledge-graphs/energy-event-detection/open-questions/OPEN_QUESTIONS.md) |
| **Validation** | `node architecture/knowledge-graphs/energy-event-detection/scripts/validate-graph.mjs` |

---

## 5. `NOT_STARTED`, `AUDIT_IN_PROGRESS`, and absent-module bootstrap

When registry coverage status is `NOT_STARTED`, or a module is absent and added as `NOT_STARTED`, the module is **inventoried only** — equivalent to having no authority.

**Execute [`MODULE_AUTHORITY_STANDARD.md`](MODULE_AUTHORITY_STANDARD.md)** — it defines:

- mandatory repository and read-only Production-VPS audit phases
- exact mandatory authority directory structure and file content
- Production read-only safety rules
- evidence and three-axis status requirements
- the promotion gate to `AUTHORITY_ACTIVE`

Summary: set `AUDIT_IN_PROGRESS` when reconstruction begins; inspect repository truth and applicable Production truth separately; never promote a deployed runtime-bearing module while `PRODUCTION_ACCESS_UNAVAILABLE`; update the registry row and detailed authority section in the same workstream/PR when promotion criteria are met.

**Existing flat `architecture/*.md` documents** remain supporting evidence. They do **not** automatically become canonical authorities and do **not** satisfy the standard.

---

## 6. Definition of done — architecture-affecting work

A workstream is **not complete** until:

- [ ] Affected registered authorities updated in the **same PR** when substantive behavior/architecture changed
- [ ] BEFORE / WHY / CHANGE / alternatives / expected effect / validation / observed effect / non-effects / tradeoffs / gaps recorded where applicable
- [ ] Open questions and contradictions updated — not silently deleted
- [ ] Cross-module boundaries consulted; every owning authority updated for cross-cutting changes
- [ ] Applicable module authority validators run (or limitation documented if validators require unavailable runtime deps)
- [ ] **Registry synchronization** completed for every affected module (overview row always; detailed section for `AUTHORITY_ACTIVE`; partial material for `AUDIT_IN_PROGRESS`; no active detail for `NOT_STARTED`)
- [ ] Registry metadata reviewed: module name, mini description, registry coverage status, authority-native status, authority path, scope, boundaries, mandatory entry documents, validation commands, successor, Last updated
- [ ] Each affected module reported as `REGISTRY_REVIEWED: UPDATED` or `REGISTRY_REVIEWED: UNCHANGED` with before/after coverage status and reason
- [ ] Central registry validator passes: `bash architecture/scripts/validate-module-registry.sh`
- [ ] Final agent report includes `ARCHITECTURE_GOVERNANCE` completion block (see [`.cursor/rules/Architectur-Updates.mdc`](../.cursor/rules/Architectur-Updates.mdc))
- [ ] This registry updated **only if** any reviewed metadata fact changed

---

## 7. Registry maintenance triggers

Update this file when:

| Trigger | Action |
|---------|--------|
| Module **added** to inventory | Add overview row with name, mini description, registry status |
| Authority **created**, **renamed**, **moved**, **split**, **merged**, or **superseded** | Update overview row and detailed section; link successor for `SUPERSEDED` |
| **Registry coverage status** changes | Update overview table and routing behavior |
| **Authority-native status** or maturity changes | Update authority-native column; preserve historical note in module authority |
| **Entry documents** or graph entry points change | Update mandatory entry document links |
| **Validation commands** change | Update validation column |
| **Ownership boundaries** change | Update boundary text; ensure both sides of cross-graph contracts updated |

---

## Cross-authority quick reference

```
REFUEL detected?     → KG-EED
Station identified?  → Tankstellenerkennung (after REFUEL event exists)
Trip enrichment?     → KG-ATE
Driving behavior & impact? → Driving Intelligence (consumes trip boundaries; does not own Trip Detection/DIMO Segments, EED, or Tankstellenerkennung)
Battery health?      → Battery V2
Multi-replica/scale? → Scaling Process
```

Do not conflate confidence domains across Tankstellenerkennung and KG-EED. Do not document energy-event field semantics in KG-ATE.
