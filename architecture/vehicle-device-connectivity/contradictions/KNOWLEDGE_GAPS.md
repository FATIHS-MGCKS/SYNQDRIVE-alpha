# Vehicle & Device Connectivity — Knowledge Gaps

Phase 3 adds **resolution status** per gap. Historical IDs preserved.

| Gap ID | Topic | Epistemic | Phase-3 status | Notes |
|--------|-------|-----------|----------------|-------|
| **VDC-GAP-001** | Unified connectivity authority | CONFIRMED | **PARTIALLY_RESOLVED** | Authority established; code still distributed (VDC-DEC-009) |
| **VDC-GAP-002** | Production baseline | CONFIRMED | **RESOLVED** | Phase 2 verified read-only — [evidence/PRODUCTION_BASELINE.md](../evidence/PRODUCTION_BASELINE.md) |
| **VDC-GAP-003** | Historical per-wake raw payload retention | CONFIRMED | **STILL_OPEN** | Design gap — VLS latest-only |
| **VDC-GAP-004** | LTE_R1 standby interval ground truth | CONFIRMED (single vehicle) | **PARTIALLY_RESOLVED** | KS MX 2024 ~24h (n=3); fleet distribution open (VDC-Q-001) |
| **VDC-GAP-005** | IO174 / Ruptela raw IO visibility | CONFIRMED (ingest path) | **PARTIALLY_RESOLVED** | IO174_NOT_EXPOSED_BY_CURRENT_INGEST; device timer not proven |
| **VDC-GAP-006** | HM connectivity profile parity | PARTIAL | **STILL_OPEN** | Repo audit done; runtime integration missing (VDC-GAP-009) |
| **VDC-GAP-007** | Connectivity vs trip-wake correlation | PARTIAL | **STILL_OPEN** | Wake documented; correlation rules undefined |
| **VDC-GAP-008** | Legacy 3-state vs 5-state freshness | CONFIRMED | **STILL_OPEN** | SUPERSEDE_LEGACY_PATH — VDC-RB-007 |
| **VDC-GAP-009** | HM not in canonical runtime | CONFIRMED | **STILL_OPEN** | **DEFERRED_TO_OTHER_MODULE** — HM Integration program |
| **VDC-GAP-010** | Dual telemetry resolution paths | CONFIRMED | **STILL_OPEN** | VDC-RB-009 |
| **VDC-GAP-011** | Episode/webhook retention | CONFIRMED | **STILL_OPEN** | Confirmed **design gap** — retention policy missing (VDC-Q-008) |
| **VDC-GAP-012** | Frontend dual connectivity paths | CONFIRMED | **STILL_OPEN** | VDC-RB-010 |

**Summary:** 1 RESOLVED; 3 PARTIALLY_RESOLVED; 8 STILL_OPEN (including 1 DEFERRED_TO_OTHER_MODULE).
