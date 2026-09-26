# DIMO Integration — Knowledge Gaps

| Gap ID | Topic | Epistemic | Notes |
|--------|-------|-----------|-------|
| **DIM-GAP-001** | Segment reconciliation vs Trip FSM ownership | **RESOLVED** | TDL-DEC-OQ006-001 / DIM-DEC-OQ006-001 — provider transport vs TripDecisionEngine mutations |
| **DIM-GAP-002** | Provider trigger subscription inventory | PARTIAL | R9 **authorized cohort** **5/5** via GET @ 2026-09-07 + re-read @ OQ-009 (`8a1d9c658…`); SynqDrive scheduler DB **6** rows incl. 1 stale mirror — see DIM-EV-R9-CANARY-001 / TDL-EVID-OQ009-R9-INGRESS-001 |
| **DIM-GAP-003** | Complete DIMO env/feature-flag matrix | UNKNOWN | Production env file not sampled |
| **DIM-GAP-004** | Full provider gateway graph | UNKNOWN | Phase 4 partial only |
| **DIM-GAP-005** | Stale SynqDrive vehicle mirror for **`HISTORICALLY_EXCLUDED_FORMER_FLEET_ASSET`** | OPEN | **`STALE_FORMER_FLEET_SCHEDULER_MIRROR_COUNT=1`** — DB shows AVAILABLE/CONNECTED + active consent/link; excluded from R9 authorized cohort; cleanup deferred (DIM-EV-R9-PERM-001) |
| **DIM-GAP-006** | Natural R9 webhook wake end-to-end delivery | **PARTIAL** | **Start** wake **PRODUCTION_OBSERVED** (KS MS 661 @ `684950419…`, R11 reconfirm); fleet-wide operational wake-rate KPI **unknown** @ OQ-009; in-trip/end-path wake + payload archive **OPEN** |
