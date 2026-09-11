# Vehicle & Device Connectivity — Knowledge Graph (Bootstrap)

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
| VDC-DOM-CONNECTIVITY-001 | domain | Vehicle & Device Connectivity domain | CONFIRMED |
| VDC-STATE-FRESHNESS-001 | state | Source freshness state | CONFIRMED |
| VDC-RES-FRESHNESS-001 | resolver | Telemetry freshness resolver | CONFIRMED |
| VDC-ORCH-RUNTIME-001 | orchestrator | Runtime state builder | CONFIRMED |
| VDC-PROF-LTE-R1-001 | profile | LTE_R1 hardware profile | INFERRED |

## Hypotheses (seed)

| ID | Summary |
|----|---------|
| VDC-HYP-001 | ~24h periodic stationary source update (pending reconstruction) |
| VDC-HYP-002 | IO174 not exposed via signalsLatest ingest |
| VDC-HYP-003 | Poll frequency ≠ R1 source-update frequency |
| VDC-HYP-004 | Per-signal timestamp heterogeneity on standby wakes |
| VDC-HYP-005 | Long silence ≠ disconnect |
| VDC-HYP-006 | Distinct fault states required |
| VDC-HYP-007 | Reconnect requires fresh device evidence |

## Invariants

| ID | Kind | Statement |
|----|------|-----------|
| VDC-INV-001 | CONFIRMED | Poll time is not source time |
| VDC-INV-002 | CONFIRMED | Monotonic sourceTimestamp guard |
| VDC-INV-003 | CANDIDATE | Standby silence tolerance |

## Ownership edges (conceptual)

```
[DIMO Integration] --acquires--> signalsLatest / webhooks
        |
        v (evidence)
[Vehicle & Device Connectivity] --interprets--> freshness / standby / fault class
        |
        v (projects)
[Vehicles / Fleet surfaces] --presents--> connectivity UI/API
```

Trip Detection owns wake/trip FSM — **not** connectivity lifecycle.

## Decisions (bootstrap)

| ID | Title | Status |
|----|-------|--------|
| VDC-DEC-BOOTSTRAP-001 | Bootstrap authority scope | PROPOSED |

## Open gaps

- VDC-GAP-001 — fragmented ownership in code
- VDC-GAP-002 — Production baseline pending
- VDC-GAP-003 — historical raw payload retention
- VDC-GAP-004 — LTE_R1 standby interval
- VDC-GAP-005 — IO174 visibility
- VDC-GAP-006 — HM profile
- VDC-GAP-007 — trip-wake correlation

## Validation

```bash
bash architecture/vehicle-device-connectivity/scripts/validate-graph.sh
```
