# Vehicle & Device Connectivity — Change Ledger (append-only)

| Date | Change | Author/workstream |
|------|--------|-------------------|
| 2026-09-11 | Bootstrap Phase 0 — authority scaffold, registry `AUDIT_IN_PROGRESS`, initial hypotheses and LTE_R1 placeholder evidence | Vehicle & Device Connectivity bootstrap |
| 2026-09-11 | Canonical rename: Vehicle Connectivity → Vehicle & Device Connectivity; path `vehicle-device-connectivity/`; stable-ID prefix `VC-*` → `VDC-*`; device scope made explicit | Vehicle & Device Connectivity bootstrap |
| 2026-09-11 | Phase 1 repository current-state audit complete — CURRENT_STATE, signal authority, semantic map, inventory, contradictions CX-002..009, gaps GAP-008..012, graph expansion | Vehicle & Device Connectivity Phase 1 |
| 2026-09-11 | Phase 1 precision hardening — source-advance wording, VDC-CX-010, recovery vocabulary, VDC-Q-011 24h jitter question | Vehicle & Device Connectivity Phase 1 |
| 2026-09-11 | Phase 2 Production read-only audit — KS MX 2024 LTE_R1 forensics, PRODUCTION_BASELINE verified, hypothesis matrix updated, GT-R1-UNPLUG-001 prepared | Vehicle & Device Connectivity Phase 2 |
| 2026-09-11 | Phase 2 evidence hardening — threshold actual-evaluation classification, webhook latency semantics, recovery epistemics, runtime drift check, VDC-CX-011, VDC-Q-012/013 | Vehicle & Device Connectivity Phase 2 |
| 2026-09-11 | Phase 2 narrow correction — C2 `05:06:51Z` contradiction resolved (no such poll row); stage-evidence matrix; VDC-Q-003/Q-011 epistemics; Aug 2026 year fix; scheduler retry wording softened | Vehicle & Device Connectivity Phase 2 |
| 2026-09-11 | Phase 3 reconciliation — CX-001..011 disposition, VDC-DEC-002..010, evidence hierarchy, target semantic model, remediation backlog, gap/hypothesis/question triage | Vehicle & Device Connectivity Phase 3 |
| 2026-09-12 | Phase 3 hardening — VDC-DEC-010 recovery fast-path, VDC-DEC-002 per-signal gate, VDC-DEC-011 adaptive polling, VDC-RB-018, VDC-Q-014, GT-before-RB-001 workstream order | Vehicle & Device Connectivity Phase 3 |
| 2026-09-12 | GT-R1-UNPLUG-001 read-only preflight — live DIMO webhook/subscription baseline for tokenId 187336; Production ingest readiness; operator watch queries (VDC-EVID-GT-R1-PREFLIGHT-001) | Vehicle & Device Connectivity GT preflight |
| 2026-09-12 | GT-R1-UNPLUG webhook failure forensics — root cause matrix; enqueue_failed→HTTP 5xx→provider `failed`; DIMO webhook ops runbook cross-ref; remediation PUT designed not executed (VDC-EVID-GT-R1-UNPLUG-FAILURE-001) | Vehicle & Device Connectivity GT forensics |
| 2026-09-12 | Authorized UNPLUG webhook recovery — `PUT` enable `49438f51-…`; `failed`→`enabled`; failureCount 11→0; 7 subscriptions preserved; GT physical NOT started (VDC-EVID-GT-R1-UNPLUG-RECOVERY-001) | Vehicle & Device Connectivity GT recovery |
| 2026-09-12 | GT-R1-UNPLUG-001 physical execution — operator unplug 16:27:04 / replug 17:01:20 Berlin; UNPLUG webhook delivered but `no_state_change` ignored; snapshot unplug/replug confirmed; no episode/alert; PLUG webhook absent (VDC-EVID-GT-R1-EXECUTION-001) | Vehicle & Device Connectivity GT execution |
| 2026-09-12 | Physical-state reconciliation Phase 1 foundation — VDC-DEC-012, VDC-RB-019, schema + policy + repository + service (flag OFF), unit/PG tests, drift detector (VDC-EVID-PHYSICAL-STATE-FOUNDATION-001) | Vehicle & Device Connectivity remediation |
| 2026-09-13 | Phase 1 evidence correction — POSTGRES_VALIDATED / FINAL_CI_VALIDATED (PR #1626, CI 34741055482) | Vehicle & Device Connectivity evidence |
| 2026-09-13 | RB-019 Phase 2 runtime cutover scope audit — VDC-DEC-013, subphases P2.1–P2.7, no implementation (VDC-EVID-RB019-PHASE2-SCOPE-001) | Vehicle & Device Connectivity remediation |
| 2026-09-13 | RB-019 Phase 2 audit hardening — snapshot PLUG resolve_plug contract, atomic tx Option A, full crash matrix, shadow adjudication, STATEFUL_SHADOW, flag semantics, event-history APPLIED-only (PR #1631) | Vehicle & Device Connectivity remediation |
| 2026-09-13 | RB-019 Phase 2 audit final hardening — authorityMode latch (forward-only), P2.2/P2.3 cycle fix, DB-enforced effect idempotency, precise PR file inventory (PR #1631) | Vehicle & Device Connectivity remediation |
| 2026-09-13 | RB-019 Phase 2 audit micro-closure — P2.1 owns latch schema; authority scope frozen `UNIQUE (organizationId, vehicleId, provider)`; device replacement inherits authority; merge #1631 before P2.1 (PR #1631) | Vehicle & Device Connectivity remediation |
