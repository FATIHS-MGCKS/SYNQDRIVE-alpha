# Vehicle & Device Connectivity — Knowledge Graph

**Registry status:** `AUDIT_IN_PROGRESS`  
**Graph validator:** `bash architecture/vehicle-device-connectivity/scripts/validate-graph.sh`

## Overview

Phase 3 reconciliation expanded decisions, resolved GAP-002, added Phase 2 evidence node, and linked CX-010/011 to PROPOSED decisions.

## Node inventory (summary)

| Prefix | Count (approx) | Role |
|--------|----------------|------|
| VDC-DOM- | 1 | Domain root |
| VDC-AUTH- | 1 | Semantic authority |
| VDC-STATE- / VDC-RES- / VDC-ORCH- | 3 | Freshness + runtime assembly |
| VDC-PIPE- / VDC-PERSIST- | 3 | Ingest + storage |
| VDC-POL- | 1 | Alert policy |
| VDC-API- / VDC-CONS- | 2 | API + frontend consumer |
| VDC-HYP- | 7 | Hypotheses (several PRODUCTION_VALIDATED) |
| VDC-GAP- | 12 | Knowledge gaps (1 RESOLVED, 3 PARTIAL) |
| VDC-CX- | 11 | Contradictions (4 arch-resolved, 7 runtime-pending) |
| VDC-EVID- | 4 | Evidence artifacts (repo, prod baseline, phase2, pending) |
| VDC-DEC- | 10 | Decisions (bootstrap + Phase 3) |
| VDC-PROF- | 1 | LTE_R1 profile |

Machine-readable: [graph/nodes.yaml](graph/nodes.yaml), [graph/edges.yaml](graph/edges.yaml), [graph/invariants.yaml](graph/invariants.yaml).

## Phase 3 artifacts

- [reconciliation/PHASE3_RECONCILIATION.md](reconciliation/PHASE3_RECONCILIATION.md)
- [reconciliation/TARGET_SEMANTIC_MODEL.md](reconciliation/TARGET_SEMANTIC_MODEL.md)
- [reconciliation/REMEDIATION_BACKLOG.md](reconciliation/REMEDIATION_BACKLOG.md)
- [reconciliation/GROUND_TRUTH_GATES.md](reconciliation/GROUND_TRUTH_GATES.md)

## Decision register

| ID | Status | Summary |
|----|--------|---------|
| VDC-DEC-BOOTSTRAP-001 | PROPOSED | Bootstrap authority scope |
| VDC-DEC-002 | PROPOSED | Equality upsert metadata-only (CX-010) |
| VDC-DEC-003 | PROPOSED | Authorization vs mirror (CX-011) |
| VDC-DEC-004 | VALIDATED | Evidence hierarchy |
| VDC-DEC-005 | VALIDATED | Threshold taxonomy |
| VDC-DEC-006 | PROPOSED | Webhook failure taxonomy |
| VDC-DEC-007 | PROPOSED | Episode evidence reliability |
| VDC-DEC-008 | VALIDATED | Diagnostic non-authoritative |
| VDC-DEC-009 | PROPOSED | Alert semantic ownership |
| VDC-DEC-010 | VALIDATED | Recovery vocabulary |

Full register: [decisions/DECISION_REGISTER.md](decisions/DECISION_REGISTER.md).

## Key edges (runtime flow)

```
VDC-PIPE-SNAPSHOT-001 → VDC-STATE-FRESHNESS-001 → VDC-RES-FRESHNESS-001
  → VDC-ORCH-RUNTIME-001 → VDC-API-FLEET-001 → VDC-CONS-FE-001
VDC-POL-ALERT-001 derives_from VDC-ORCH-RUNTIME-001 (VDC-CX-001 tension)
VDC-DEC-002 resolves VDC-CX-010 (runtime pending)
VDC-DEC-003 resolves VDC-CX-011 (runtime pending)
VDC-EVID-PHASE2-001 supports VDC-HYP-001, VDC-HYP-003, VDC-HYP-005
```

## Invariants

6 invariants — see [graph/invariants.yaml](graph/invariants.yaml). Phase 3 promoted VDC-INV-003; added VDC-INV-006.
