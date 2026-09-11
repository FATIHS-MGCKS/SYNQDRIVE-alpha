# Vehicle & Device Connectivity — Open Contradictions

Preserve both sides with evidence. Do not resolve by preference in Phase 1.

| ID | Topic | Epistemic | Description |
|----|-------|-----------|-------------|
| **VDC-CX-001** | Connectivity alert code location | CONTRADICTED | **Proposed:** VDC owns connectivity alert-policy semantics. **Observed:** `backend/src/modules/dimo/connectivity-alert/` — policy is pure/provider-neutral but delivery registry `producerModule: 'dimo'`. No VDC module copy. |
| **VDC-CX-002** | Webhook failure type naming | CONTRADICTED | Types define `WEBHOOK_PROCESSING_FAILED`; service emits `WEBHOOK_FAILURE`; runtime builder uses `WEBHOOK_PROCESSING_FAILED` reason code. |
| **VDC-CX-003** | Unused dedupe helper | CONTRADICTED | `buildConnectivityAlertDedupeKey` in `connectivity-alert.dedupe.ts` unused; service uses notification fingerprints instead. |
| **VDC-CX-004** | Admin DIMO debug thresholds | CONTRADICTED | `dimo.controller.ts` uses 15m online / 24h standby / offline ≥24h. Canonical interpreter uses 48h `signal_delayed` before hard offline. |
| **VDC-CX-005** | Stale snapshot metric vs freshness | CONTRADICTED | Processor Prometheus stale counter threshold **5 min** ≠ canonical live threshold **15 min**. |
| **VDC-CX-006** | Episode evidence reliability default | CONTRADICTED | `buildDeviceConnectionSummary` defaults `episodeEvidenceReliable: false` → interruption knowledge stays `unknown` unless caller opts in. |
| **VDC-CX-007** | Physical episode vs physical evidence | CONTRADICTED | `interruption-knowledge.ts`: absence of open episode ≠ no interruption; physical unplug without episode possible. |
| **VDC-CX-008** | Webhook failure alert mapping | CONTRADICTED | `syncConnectivityAlerts` sets `webhookProcessingFailed` when `providerLink.state === 'ERROR'` — conflates link error with webhook processing failure. |
| **VDC-CX-009** | Diagnostic tracker scope | CONTRADICTED | `ConnectivityDiagnosticTransitionTracker` is process-local, demand-driven, not authoritative monitor; multi-instance double-count risk documented in code. |
| **VDC-CX-010** | Equal sourceTimestamp accepted as full VLS upsert | CONTRADICTED | `isIncomingVlsSourceTimestampStale` rejects only `incoming < existing`. Equality performs full VLS upsert and may execute downstream side effects without source-time advance. **Phase 2 Production:** ~1,027 equal-timestamp polls vs 3 strict advances (KS MX 2024); CH historical duplicate `recorded_at` up to 11,293 rows. Impact **MATERIAL** for churn/storage; **LOW** for erroneous Sep episodes. **Not fixed.** See [evidence/LTE_R1_KS_MX_2024_PRODUCTION_FORENSICS.md](../evidence/LTE_R1_KS_MX_2024_PRODUCTION_FORENSICS.md). |
