# Vehicle & Device Connectivity — Open Contradictions

Preserve both sides with evidence. Phase 3 adds **disposition** per contradiction — contradictions are **not deleted** when architecturally addressed.

**Reconciliation:** [reconciliation/PHASE3_RECONCILIATION.md](../reconciliation/PHASE3_RECONCILIATION.md)

| ID | Topic | Epistemic | Description | Phase-3 disposition | Linked VDC-DEC | Implementation | Validation |
|----|-------|-----------|-------------|---------------------|----------------|----------------|------------|
| **VDC-CX-001** | Connectivity alert code location | CONTRADICTED | **Proposed:** VDC owns alert-policy semantics. **Observed:** `dimo/connectivity-alert/` — policy provider-neutral but `producerModule: 'dimo'`. | CHANGE_REQUIRED — ownership debt | VDC-DEC-009 | ARCHITECTURALLY_ADDRESSED_RUNTIME_PENDING | VALIDATED (repo) |
| **VDC-CX-002** | Webhook failure type naming | CONTRADICTED | Types: `WEBHOOK_PROCESSING_FAILED`; service/registry: `WEBHOOK_FAILURE`. | FIX_REQUIRED — naming alignment | VDC-DEC-006 | ARCHITECTURALLY_ADDRESSED_RUNTIME_PENDING | PROPOSED |
| **VDC-CX-003** | Unused dedupe helper | CONTRADICTED | `buildConnectivityAlertDedupeKey` unused; fingerprints used. | REMOVE_DEAD_PATH | — | RESOLVED_IN_ARCHITECTURE (remove recommended) | PROPOSED |
| **VDC-CX-004** | Admin DIMO debug thresholds | CONTRADICTED | Admin offline ≥24h vs canonical `signal_delayed` until 48h. | DOCUMENTATION_ONLY → CHANGE_REQUIRED | VDC-DEC-005 | ARCHITECTURALLY_ADDRESSED_RUNTIME_PENDING | VALIDATED |
| **VDC-CX-005** | Stale snapshot metric vs freshness | CONTRADICTED | Prometheus stale counter **5 min** ≠ domain live **15 min**. | KEEP_AS_IS — observability vs domain | VDC-DEC-008 | RESOLVED_IN_ARCHITECTURE | VALIDATED |
| **VDC-CX-006** | Episode evidence reliability default | CONTRADICTED | `episodeEvidenceReliable` default `false` → interruption UNKNOWN. | GROUND_TRUTH_REQUIRED for UX; conservative default kept | VDC-DEC-007 | ARCHITECTURALLY_ADDRESSED_RUNTIME_PENDING | PROPOSED |
| **VDC-CX-007** | Physical episode vs physical evidence | CONTRADICTED | Absence of open episode ≠ no interruption; unplug without episode possible. | DOCUMENTATION_ONLY — promote invariant | VDC-DEC-004, VDC-DEC-007 | RESOLVED_IN_ARCHITECTURE | VALIDATED |
| **VDC-CX-008** | Webhook failure alert mapping | CONTRADICTED | `webhookProcessingFailed` when `providerLink.state === 'ERROR'`. | FIX_REQUIRED | VDC-DEC-006 | ARCHITECTURALLY_ADDRESSED_RUNTIME_PENDING | PROPOSED |
| **VDC-CX-009** | Diagnostic tracker scope | CONTRADICTED | Process-local, demand-driven, not authoritative; multi-replica double-count. | KEEP_AS_IS — best-effort diagnostic | VDC-DEC-008 | RESOLVED_IN_ARCHITECTURE | VALIDATED |
| **VDC-CX-010** | Equal sourceTimestamp full VLS upsert | CONTRADICTED | Equality full upsert; ~1,027:3 ratio KS MX 2024; CH duplicates exist; causality UNKNOWN. | CHANGE_REQUIRED — metadata-only canonical | VDC-DEC-002 | ARCHITECTURALLY_ADDRESSED_RUNTIME_PENDING | PRODUCTION_VALIDATED (impact); PROPOSED (fix) |
| **VDC-CX-011** | DIMO CONNECTED vs providerLinkState UNKNOWN | CONTRADICTED | Production: CONNECTED + fresh fetch + standby + UNKNOWN link. Builder: authorization chain. | DOCUMENTATION_ONLY + additive mirror field | VDC-DEC-003 | ARCHITECTURALLY_ADDRESSED_RUNTIME_PENDING | PRODUCTION_VALIDATED (observation); PROPOSED (fix) |

**Counts:** 11 contradictions — 4 RESOLVED_IN_ARCHITECTURE; 7 ARCHITECTURALLY_ADDRESSED_RUNTIME_PENDING; 0 RESOLVED_IN_RUNTIME.
