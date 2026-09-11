# Vehicle Connectivity — Knowledge Graph (Bootstrap)

Human-readable overview. Machine-readable source: [`graph/`](graph/).

## Epistemic legend

| State | Meaning |
|-------|---------|
| `CONFIRMED` | Supported by inspected code or strong evidence |
| `INFERRED` | Reasonable; pending full audit |
| `UNKNOWN` | Not yet reconstructed |
| `CONTRADICTED` | Sources disagree — see contradictions |

## Core nodes

| ID | Type | Title | Status |
|----|------|-------|--------|
| VC-DOM-CONNECTIVITY-001 | domain | Vehicle Connectivity domain | CONFIRMED |
| VC-STATE-FRESHNESS-001 | state | Source freshness state | CONFIRMED |
| VC-RES-FRESHNESS-001 | resolver | Telemetry freshness resolver | CONFIRMED |
| VC-ORCH-RUNTIME-001 | orchestrator | Runtime state builder | CONFIRMED |
| VC-PROF-LTE-R1-001 | profile | LTE_R1 hardware profile | INFERRED |

## Hypotheses (seed)

| ID | Summary |
|----|---------|
| VC-HYP-001 | ~24h periodic stationary source update (pending reconstruction) |
| VC-HYP-002 | IO174 not exposed via signalsLatest ingest |
| VC-HYP-003 | Poll frequency ≠ R1 source-update frequency |
| VC-HYP-004 | Per-signal timestamp heterogeneity on standby wakes |
| VC-HYP-005 | Long silence ≠ disconnect |
| VC-HYP-006 | Distinct fault states required |
| VC-HYP-007 | Reconnect requires fresh device evidence |

## Invariants

| ID | Kind | Statement |
|----|------|-----------|
| VC-INV-001 | CONFIRMED | Poll time is not source time |
| VC-INV-002 | CONFIRMED | Monotonic sourceTimestamp guard |
| VC-INV-003 | CANDIDATE | Standby silence tolerance |

## Ownership edges (conceptual)

```
[DIMO Integration] --acquires--> signalsLatest / webhooks
        |
        v (evidence)
[Vehicle Connectivity] --interprets--> freshness / standby / fault class
        |
        v (projects)
[Vehicles / Fleet surfaces] --presents--> connectivity UI/API
```

Trip Detection owns wake/trip FSM — **not** connectivity lifecycle.

## Decisions (bootstrap)

| ID | Title | Status |
|----|-------|--------|
| VC-DEC-BOOTSTRAP-001 | Bootstrap authority scope | PROPOSED |

## Open gaps

- VC-GAP-001 — fragmented ownership in code
- VC-GAP-002 — Production baseline pending
- VC-GAP-003 — historical raw payload retention
- VC-GAP-004 — LTE_R1 standby interval
- VC-GAP-005 — IO174 visibility
- VC-GAP-006 — HM profile
- VC-GAP-007 — trip-wake correlation

## Validation

```bash
bash architecture/vehicle-connectivity/scripts/validate-graph.sh
```
