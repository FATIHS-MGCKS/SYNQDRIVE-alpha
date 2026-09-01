# Knowledge Graph Schema Proposal — ATE & EED

**Date:** 2026-09-01  
**Status:** PROPOSAL — not yet canonical  
**Informed by:** Driving Intelligence evidence governance, Battery V2 graph (`architecture/battery-v2/graph/*.yaml`), discovery artifacts in this directory.

---

## Part F — Evidence taxonomy

### Evidence status (claim maturity)

| Status | Definition | Use when |
|--------|------------|----------|
| `PROVEN_IN_CODE` | Verified in `main` at recorded SHA | Default for implemented behavior |
| `PROVEN_BY_TEST` | Automated test asserts behavior | Unit/integration/e2e |
| `PROVEN_IN_PRODUCTION` | Post-deploy runtime observation | Soak, forensic DB, metrics |
| `PROVEN_BY_EXTERNAL_PROVIDER_RESPONSE` | DIMO/telemetry payload captured | KS MX, calibration scripts |
| `INFERRED` | Logical conclusion from confirmed facts | Architecture reasoning |
| `DESIGNED` | Intended but not fully verified | PRD, open implementation |
| `PROPOSED` | Future recommendation | Backfill policies, schedulers |
| `DEPRECATED` | Still in code but discouraged | Legacy paths |
| `SUPERSEDED` | Replaced; historical record kept | Pre-S5 refuel UI |
| `UNKNOWN` | Gap acknowledged | Open questions |

### Confidence

| Level | Criteria |
|-------|----------|
| `HIGH` | Code + test + (production or provider capture) |
| `MEDIUM` | Code + one corroborating source |
| `LOW` | Single source or inference only |

### Provenance requirements (every material node/decision)

```yaml
provenance:
  evidence_status: PROVEN_IN_CODE
  confidence: HIGH
  sources:
    - type: code
      path: backend/src/...
      sha: c5dce7a9d
    - type: test
      path: backend/src/...spec.ts
    - type: architecture
      path: architecture/P1_3_S5_...
    - type: pr
      id: 1443
      url: https://github.com/...
```

### Mapping from Driving Intelligence classes

| DI class | KG status |
|----------|-----------|
| `CONFIRMED_FROM_CODE` | `PROVEN_IN_CODE` |
| `CONFIRMED_FROM_RUNTIME` | `PROVEN_IN_PRODUCTION` |
| `CONFIRMED_FROM_PROVIDER_*` | `PROVEN_BY_EXTERNAL_PROVIDER_RESPONSE` |
| `INFERENCE` | `INFERRED` |
| `HYPOTHESIS` | `PROPOSED` |
| `SUPERSEDED` | `SUPERSEDED` |

---

## Part G — `GRAPH.yaml` schema proposal

### File layout (per workstream)

```
architecture/knowledge-graphs/<workstream>/
  GRAPH.yaml          # machine authority
  graph/nodes.yaml    # optional split (Battery V2 pattern)
  graph/edges.yaml
  graph/invariants.yaml
```

### Node entity classes

| Class | Prefix example | Purpose |
|-------|----------------|---------|
| `SYSTEM` | `ATE-SYS-*` | End-to-end workstream boundary |
| `COMPONENT` | `ATE-COMP-*` | Logical module group |
| `SERVICE` | `ATE-SVC-*` | Nest injectable service |
| `JOB` | `ATE-JOB-*` | BullMQ job type |
| `SCHEDULER` | `ATE-SCH-*` | Cron/interval worker |
| `QUEUE` | `ATE-QUE-*` | Bull queue name |
| `STATE` | `ATE-ST-*` | DB status field semantics |
| `SIGNAL` | `EED-SIG-*` | Telemetry/provider signal |
| `EVENT` | `EED-EVT-*` | Domain event kind (REFUEL/RECHARGE) |
| `DATA_MODEL` | `*-DM-*` | Prisma model |
| `API` | `*-API-*` | HTTP route |
| `UI` | `*-UI-*` | Frontend surface |
| `INVARIANT` | `*-INV-*` | Must-not-break rule |
| `DECISION` | `ATE-DEC-*` / `EED-DEC-*` | Historical decision |
| `FAILURE_MODE` | `*-FM-*` | Known failure behavior |
| `EVIDENCE` | `*-EV-*` | Registry artifact pointer |
| `OPEN_QUESTION` | `*-OQ-*` | Unresolved |
| `EXTERNAL_AUTHORITY` | `EXT-*` | Owned elsewhere |

### Edge types

| Edge | Meaning |
|------|---------|
| `TRIGGERS` | Causes execution |
| `CONSUMES` | Reads output of |
| `PRODUCES` | Writes output |
| `PERSISTS` | DB write |
| `READS` | DB read |
| `WRITES` | DB update |
| `CALLS` | Direct function/service call |
| `ENQUEUES` | Puts job on queue |
| `PROCESSES` | Worker handles job |
| `GUARDED_BY` | Scheduler leader |
| `LOCKED_BY` | Distributed mutex |
| `BUDGETED_BY` | DIMO provider budget |
| `RETRIES_VIA` | Retry mechanism |
| `DERIVES` | Computed field |
| `COALESCES` | Merge segments |
| `RECONCILES` | Sibling/stale cleanup |
| `DISPLAYS` | UI rendering |
| `DEPENDS_ON` | External authority |
| `SUPERSEDES` | Replaces decision |
| `PROVEN_BY` | Evidence link |
| `OWNED_BY` | Authority owner graph |
| `MAY_TRIGGER` | Cross-graph (weak) |
| `MAY_ATTACH_TO` | Cross-graph UI |
| `MUST_NOT_INTERPRET_AS` | Semantic firewall |

### Mandatory node fields

```yaml
id: ATE-SVC-ENRICHMENT-ORCHESTRATOR
type: SERVICE
name: TripEnrichmentOrchestratorService
workstream: automatic-trip-enrichment
summary: Single canonical enrichment enqueue + sync entry
source_files:
  - backend/src/modules/vehicle-intelligence/trips/trip-enrichment-orchestrator.service.ts
entrypoints:
  - enqueueBehaviorEnrichment
  - runEnrichmentSync
inputs: [tripId, vehicleId, organizationId]
outputs: [behaviorEnrichmentStatus, TripBehaviorEvent[], drivingImpactJob]
state_mutations: [VehicleTrip.behaviorEnrichmentStatus, behaviorSummaryJson]
idempotency: [jobId hf-enrich-${tripId}, terminal status guards]
failure_behavior: [FAILED_TRANSIENT retry, FAILED_PERMANENT terminal]
observability: [enrichmentPending, enrichmentFailed]
provenance:
  evidence_status: PROVEN_IN_CODE
  confidence: HIGH
  sources: [...]
tags: [canonical, enrichment]
status: ACTIVE
```

### Mandatory edge fields

```yaml
from: ATE-N13
to: EED-N-RF-01
type: MAY_TRIGGER
authority_owner: energy-event-detection
cross_graph: true
notes: Step 5 isolated try/catch; EED owns semantics
provenance: {...}
```

### Invariant node example

```yaml
id: EED-INV-001
type: INVARIANT
statement: REFUEL durationSeconds is DIMO detection envelope, not physical pump duration
applies_to: [EED-EVT-REFUEL]
violation_severity: P1
provenance:
  evidence_status: PROVEN_IN_PRODUCTION
  sources:
    - architecture/P1_3_S5_ENERGY_REFUEL_SEMANTICS_2026-08-30.md
    - PR 1443
```

---

## Part H — Proposed repository structure

### Automatic Trip Enrichment

```
architecture/knowledge-graphs/automatic-trip-enrichment/
  README.md
  GRAPH.yaml
  CURRENT_STATE.md
  ARCHITECTURE.md
  DATA_FLOW.md
  DECISIONS.md
  INVARIANTS.md
  FAILURE_MODES.md
  PRODUCTION_EVIDENCE.md
  OPEN_QUESTIONS.md
  CHANGELOG.md
  AGENT_PROTOCOL.md
  JOB_LIFECYCLE.md
  SCHEDULING_AND_LIVENESS.md
  graph/
    nodes.yaml
    edges.yaml
    invariants.yaml
  scripts/
    validate-graph.sh
```

### Energy Event Detection

```
architecture/knowledge-graphs/energy-event-detection/
  README.md
  GRAPH.yaml
  CURRENT_STATE.md
  ARCHITECTURE.md
  DATA_FLOW.md
  DECISIONS.md
  INVARIANTS.md
  FAILURE_MODES.md
  PRODUCTION_EVIDENCE.md
  OPEN_QUESTIONS.md
  CHANGELOG.md
  AGENT_PROTOCOL.md
  SIGNAL_SEMANTICS.md
  graph/
    nodes.yaml
    edges.yaml
    invariants.yaml
  scripts/
    validate-graph.sh
```

**Not created in this discovery task.**

---

## Part I — Agent governance protocol

### Change classification

| Class | Examples | Graph updates required |
|-------|----------|------------------------|
| `PATCH` | Typo, log message, non-behavioral refactor | CHANGELOG only if graph-referenced |
| `ARCHITECTURAL_CHANGE` | New queue, new scheduler, new reconciliation step | nodes + edges + CURRENT_STATE + ARCHITECTURE |
| `SEMANTIC_CHANGE` | Field meaning, UI label authority, duration interpretation | INVARIANTS + SIGNAL_SEMANTICS (EED) + DECISIONS |
| `AUTHORITY_CHANGE` | Moving detect trigger, merging EED into ATE doc | Boundary map + both graphs + independent review |

### Mandatory agent checklist (both workstreams)

1. Identify impacted graph node IDs (ATE-* / EED-*)
2. Update `graph/edges.yaml` relationships
3. Update `CURRENT_STATE.md` snapshot
4. Append `DECISIONS.md` record if behavior/semantics changed
5. Preserve superseded decisions (never delete history)
6. Link PR, commit SHA, tests, production evidence IDs
7. Update `OPEN_QUESTIONS.md` (close or add)
8. Set `evidence_status` + `confidence` on changed nodes
9. File `ATE_EED_BOUNDARY_MAP` cross-graph impact section
10. Request **independent review** for `AUTHORITY_CHANGE` or `SEMANTIC_CHANGE` (EED duration)

### Decision record template

```markdown
## DECISION_ID: EED-DEC-YYYY-NNN
- **Date:**
- **Problem:**
- **Observation:**
- **Options considered:**
- **Decision:**
- **Why:**
- **Tradeoff:**
- **Evidence:** (PR, SHA, test paths)
- **Current status:** ACTIVE | SUPERSEDED | PROPOSED
- **Superseded by:**
- **Cross-graph impact:** ATE | EED | NONE
- **Non-effects:** (what this did NOT fix)
```

### Independent review triggers

- Duration semantics change (EED)
- New automatic enrichment trigger (ATE)
- Reconciliation mutex scope change (ATE)
- Sibling deletion rule change (EED)
- DIMO detector production config change (EED)
- Scale-to-2 / multi-replica scheduler behavior (ATE)

### Validation script (proposed)

Mirror `architecture/battery-v2/scripts/validate-graph.mjs`:

- Unique IDs per workstream prefix
- Edge endpoints exist
- Cross-graph edges reference `authority_owner`
- Invariants have evidence
- No `MUST_NOT_INTERPRET_AS` edges missing for known semantic firewalls
- Open questions linked or explicitly `UNKNOWN`

---

## Readiness

| Item | Status |
|------|--------|
| Schema proposal | **READY** |
| Agent protocol proposal | **READY** |
| Canonical GRAPH.yaml files | **NOT CREATED** (by design) |
| Validate script | **PROPOSED** (copy Battery V2 pattern) |
