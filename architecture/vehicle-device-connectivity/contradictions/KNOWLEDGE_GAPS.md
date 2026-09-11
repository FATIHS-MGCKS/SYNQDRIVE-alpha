# Vehicle & Device Connectivity — Knowledge Gaps

| Gap ID | Topic | Epistemic | Notes |
|--------|-------|-----------|-------|
| **VDC-GAP-001** | Unified connectivity authority | CONFIRMED | Semantics spread across vehicles/, dimo/, AI — VDC authority established but code not relocated |
| **VDC-GAP-002** | Production baseline | CONFIRMED | Phase 2 verified read-only — [evidence/PRODUCTION_BASELINE.md](../evidence/PRODUCTION_BASELINE.md) |
| **VDC-GAP-003** | Historical per-wake raw payload retention | CONFIRMED | VLS `raw_payload_json` latest-only limits IO174 / per-signal forensics |
| **VDC-GAP-004** | LTE_R1 standby interval ground truth | CONFIRMED (single vehicle) | ~24 h intervals observed KS MX 2024; fleet distribution still open |
| **VDC-GAP-005** | IO174 / Ruptela raw IO visibility | CONFIRMED (ingest path) | IO174_NOT_EXPOSED_BY_CURRENT_INGEST; device-level visibility still unknown |
| **VDC-GAP-006** | HM connectivity profile parity | PARTIAL | Bounded repo audit done — [providers/high-mobility/REPOSITORY_AUDIT.md](../providers/high-mobility/REPOSITORY_AUDIT.md); runtime integration missing |
| **VDC-GAP-007** | Connectivity vs trip-wake correlation | PARTIAL | Wake boundary documented in [operations/POLLING_AND_SCHEDULERS.md](../operations/POLLING_AND_SCHEDULERS.md); correlation rules not defined |
| **VDC-GAP-008** | Legacy 3-state vs 5-state freshness | CONFIRMED | `onlineStatus` OFFLINE at ≥24h vs `signal_delayed` until 48h |
| **VDC-GAP-009** | HM not in canonical runtime | CONFIRMED | `VehicleConnectivityRuntimeStateBuilder` DIMO-centric; HM vehicles lack runtime |
| **VDC-GAP-010** | Dual telemetry resolution paths | CONFIRMED | Fleet assembler full evidence vs operational `resolveRowTelemetry` reduced set |
| **VDC-GAP-011** | Episode/webhook retention | CONFIRMED | No retention policy on episode/event/inbox tables (unlike `dimo_poll_logs` 30d) |
| **VDC-GAP-012** | Frontend dual connectivity paths | CONFIRMED | P1 `connectivityRuntime` vs legacy client `telemetryFreshness.ts` on some surfaces |
