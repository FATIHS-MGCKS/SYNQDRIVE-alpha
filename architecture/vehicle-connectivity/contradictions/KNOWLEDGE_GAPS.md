# Vehicle Connectivity — Knowledge Gaps

| Gap ID | Topic | Epistemic | Notes |
|--------|-------|-----------|-------|
| **VC-GAP-001** | Unified connectivity authority | CONFIRMED | Semantics spread across `vehicles/connectivity`, `dimo/connectivity-alert`, AI freshness — bootstrap establishes VC module |
| **VC-GAP-002** | Production baseline | UNKNOWN | Phase 2 not performed in bootstrap — see [evidence/PRODUCTION_BASELINE.md](../evidence/PRODUCTION_BASELINE.md) |
| **VC-GAP-003** | Historical per-wake raw payload retention | UNKNOWN | `vehicle_latest_states.raw_payload_json` is latest-only |
| **VC-GAP-004** | LTE_R1 standby interval ground truth | UNKNOWN | ~24h hypothesis pending reconstruction — see VC-HYP-001 |
| **VC-GAP-005** | IO174 / Ruptela raw IO visibility | UNKNOWN | Not exposed in current DIMO signalsLatest ingest path |
| **VC-GAP-006** | HM connectivity profile parity | UNKNOWN | Future target — no audit started |
| **VC-GAP-007** | Connectivity vs trip-wake correlation rules | PARTIAL | Snapshot wake owned by Trip Detection; VC correlation semantics not documented |
