# Vehicle & Device Connectivity — Knowledge Gaps

| Gap ID | Topic | Epistemic | Notes |
|--------|-------|-----------|-------|
| **VDC-GAP-001** | Unified connectivity authority | CONFIRMED | Semantics spread across `vehicles/connectivity`, `dimo/connectivity-alert`, AI freshness — bootstrap establishes VDC module |
| **VDC-GAP-002** | Production baseline | UNKNOWN | Phase 2 not performed in bootstrap — see [evidence/PRODUCTION_BASELINE.md](../evidence/PRODUCTION_BASELINE.md) |
| **VDC-GAP-003** | Historical per-wake raw payload retention | UNKNOWN | `vehicle_latest_states.raw_payload_json` is latest-only |
| **VDC-GAP-004** | LTE_R1 standby interval ground truth | UNKNOWN | ~24h hypothesis pending reconstruction — see VDC-HYP-001 |
| **VDC-GAP-005** | IO174 / Ruptela raw IO visibility | UNKNOWN | Not exposed in current DIMO signalsLatest ingest path |
| **VDC-GAP-006** | HM connectivity profile parity | UNKNOWN | Future target — no audit started |
| **VDC-GAP-007** | Connectivity vs trip-wake correlation rules | PARTIAL | Snapshot wake owned by Trip Detection; VDC correlation semantics not documented |
