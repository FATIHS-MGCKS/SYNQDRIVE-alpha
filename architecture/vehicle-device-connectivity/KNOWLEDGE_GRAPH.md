# Vehicle & Device Connectivity — Knowledge Graph (Phase 1)

**Registry status:** `AUDIT_IN_PROGRESS`  
**Graph validator:** `bash architecture/vehicle-device-connectivity/scripts/validate-graph.sh`

## Overview

Phase 1 expanded the bootstrap graph with repository-discovered components: snapshot pipeline, VLS/ClickHouse persistence, fleet API, frontend consumer, alert policy, and 8 additional contradictions / 5 gaps.

## Node inventory (summary)

| Prefix | Count (approx) | Role |
|--------|----------------|------|
| VDC-DOM- | 1 | Domain root |
| VDC-AUTH- | 1 | Semantic authority |
| VDC-STATE- / VDC-RES- / VDC-ORCH- | 3 | Freshness + runtime assembly |
| VDC-PIPE- / VDC-PERSIST- | 3 | Ingest + storage |
| VDC-POL- | 1 | Alert policy |
| VDC-API- / VDC-CONS- | 2 | API + frontend consumer |
| VDC-HYP- | 7 | Open hypotheses (unchanged) |
| VDC-GAP- | 12 | Knowledge gaps |
| VDC-CX- | 11 | Contradictions |
| VDC-EVID- | 3 | Evidence artifacts |
| VDC-DEC- | 1 | Bootstrap decision |
| VDC-PROF- | 1 | LTE_R1 profile |

Machine-readable: [graph/nodes.yaml](graph/nodes.yaml), [graph/edges.yaml](graph/edges.yaml), [graph/invariants.yaml](graph/invariants.yaml).

## Decision register

| ID | Status | Summary |
|----|--------|---------|
| VDC-DEC-BOOTSTRAP-001 | PROPOSED | Bootstrap authority scope; remains AUDIT_IN_PROGRESS |

## Key edges (runtime flow)

```
VDC-PIPE-SNAPSHOT-001 → VDC-STATE-FRESHNESS-001 → VDC-RES-FRESHNESS-001
  → VDC-ORCH-RUNTIME-001 → VDC-API-FLEET-001 → VDC-CONS-FE-001
VDC-POL-ALERT-001 derives_from VDC-ORCH-RUNTIME-001 (VDC-CX-001 tension)
```

## Invariants

| ID | Kind | Title |
|----|------|-------|
| VDC-INV-001 | CONFIRMED | Poll time ≠ source time |
| VDC-INV-002 | CONFIRMED | Strict-less-than monotonic guard |
| VDC-INV-003 | CANDIDATE | Standby silence tolerance |
| VDC-INV-004 | CANDIDATE | Three frequency layers |
| VDC-INV-005 | CONFIRMED | Equal timestamp not stale (see VDC-CX-010) |

## Mandatory cross-references

- [CURRENT_STATE.md](CURRENT_STATE.md) — Phase 1 repository baseline
- [signals/SIGNAL_AUTHORITY.md](signals/SIGNAL_AUTHORITY.md) — timestamp matrix
- [lifecycle/CURRENT_SEMANTIC_MAP.md](lifecycle/CURRENT_SEMANTIC_MAP.md) — state map
- [contradictions/OPEN_CONTRADICTIONS.md](contradictions/OPEN_CONTRADICTIONS.md)
