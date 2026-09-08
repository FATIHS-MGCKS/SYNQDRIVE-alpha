# DIMO Integration — Knowledge Gaps

| Gap ID | Topic | Epistemic | Notes |
|--------|-------|-----------|-------|
| **DIM-GAP-001** | Segment reconciliation vs Trip FSM ownership | PARTIAL | Both modules touch segments; split with Trip Detection not fully reconstructed |
| **DIM-GAP-002** | Provider trigger subscription inventory | PARTIAL | R9 active cohort verified via GET @ 2026-09-07: **5/5** speed+ignition; method in `r9-post-get-audit.mjs` / `r9-five-vehicle-canary-bootstrap.mjs`; tokenId **190497** excluded — see DIM-EV-R9-CANARY-001 |
| **DIM-GAP-003** | Complete DIMO env/feature-flag matrix | UNKNOWN | Production env file not sampled |
| **DIM-GAP-004** | Full provider gateway graph | UNKNOWN | Phase 4 partial only |
| **DIM-GAP-005** | Stale SynqDrive vehicle mirror for former fleet tokenId **190497** | OPEN | DB shows AVAILABLE/CONNECTED + active consent/link; Identity privileged absent — data-integrity cleanup deferred |
| **DIM-GAP-006** | Natural R9 webhook wake end-to-end delivery | OPEN | Provider wiring validated (5/5); no observed Production drive/ignition wake event — **NEXT_GATE** `NATURAL_R9_WAKE_OBSERVATION` |
