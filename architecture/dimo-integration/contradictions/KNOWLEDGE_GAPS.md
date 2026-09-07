# DIMO Integration — Knowledge Gaps

| Gap ID | Topic | Epistemic | Notes |
|--------|-------|-----------|-------|
| **DIM-GAP-001** | Segment reconciliation vs Trip FSM ownership | PARTIAL | Both modules touch segments; split with Trip Detection not fully reconstructed |
| **DIM-GAP-002** | Provider trigger subscription inventory | PARTIAL | R9 five-vehicle canary @ 2026-09-07: 5/5 speed+ignition on active cohort; tokenId **190497** excluded (`FORMER_FLEET_VEHICLE`) — see DIM-EV-R9-CANARY-001, DIM-EV-R9-PERM-001 |
| **DIM-GAP-005** | Stale SynqDrive vehicle mirror for former fleet tokenId **190497** | OPEN | DB shows AVAILABLE/CONNECTED + active consent/link; Identity privileged absent — data-integrity cleanup deferred |
| **DIM-GAP-003** | Complete DIMO env/feature-flag matrix | UNKNOWN | Production env file not sampled |
| **DIM-GAP-004** | Full provider gateway graph | UNKNOWN | Phase 4 partial only |
