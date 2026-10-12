# DIMO Deep Audit — Coverage Matrix

**Production reference SHA (R4 read-only):** `a4d06c602ff192aa7ba6688a6472100033417bca`  
**Matrix date:** 2026-10-12

Status key: **DONE** | **PARTIAL** | **OPEN** | **BLOCKED**

| Dimension | Status | Evidence |
|-----------|--------|----------|
| **R4.0** Initial integration & production baseline | **DONE** | `evidence/PRODUCTION_BASELINE.md`, historical R9 canary (DIM-EV-PROD-*), deployed SHA @ R4 |
| **R4.1** Provider query inventory | **OPEN** | No committed inventory doc; code paths under `backend/src/modules/dimo/queries/` (21 files) not catalogued → DIM-OBS-002 |
| **R4.1a** Production metrics & request budget | **DONE** | `/opt/cursor/artifacts/DIMO_R41A_PRODUCTION_METRICS_RESULT.md`; Prometheus @ R4 SHA |
| **R4.1b** JWT 403 root cause | **DONE** | `/opt/cursor/artifacts/DIMO_R41B_ROOT_CAUSE_RESULT.md`; DIM-DEF-001..003 |
| **R4.2** Telemetry quality & source timestamps | **DONE** | `/opt/cursor/artifacts/DIMO_R42_TELEMETRY_QUALITY_AUDIT.md`; DIM-DEF-008..009 |
| **R4.3** Live map & per-signal contract | **DONE** | `/opt/cursor/artifacts/DIMO_R43_LIVE_FRESHNESS_AUDIT.md`; DIM-DEF-004..007, 010–011 |
| **A** Authentication & authorization | **PARTIAL** | Code: `dimo-auth.service.ts` (developer + vehicle JWT, Redis lock, budget IDENTITY). Prod: 403 pattern measured (R4.1b). **OPEN:** wallet/consent matrix per org, privilege scope table, prod token health dashboard sample @ R4 |
| **B** Webhooks & event processing | **PARTIAL** | Code: `dimo-webhook.controller.ts` (verification handshake, optional HMAC, speed/ignition wake, device-connection inbox idempotency). Historical prod: R9 start wake (DIM-EV-KS-MS-661-*). **OPEN:** end-path wake, payload archive. **BLOCKED:** R9 T+24 fleet wake-rate (DIM-OBS-005) |
| **C** End-to-end pipeline | **PARTIAL** | Traced: webhook → `SnapshotWakeIntakeService` → `SnapshotWakeCoordinatorService` → `dimo.snapshot.poll` → `dimo-snapshot.processor` → VLS. Metrics: wake outcomes R4.1a (`IGNORED_FSM_ACTIVE` dominant). **OPEN:** loss points under Redis/queue failure (code review only) |
| **D** Provider API & resilience | **DONE** | R4.1a volumes; `DimoRequestExecutor` retry/403/429; `dimo-provider-gateway.service.ts`; budget enabled prod |
| **E** Vehicle lifecycle & data isolation | **PARTIAL** | `registry_lifecycle` skip in processor; `dimo-vehicle-data-source-link.service.ts`; DIM-DEF-012. **OPEN:** full onboarding/offboarding state machine audit |
| **F** Data integrity & operations | **PARTIAL** | PG: R4.2/4.3 driving session; monotonic VLS merge verified in code. **BLOCKED:** ClickHouse correlation (DIM-OBS-004). **OPEN:** charging session historical (NOT_AVAILABLE R4.3) |

## Component grid

| Component | Auth | Webhook | E2E | Resilience | Lifecycle | Data |
|-----------|------|---------|-----|------------|-----------|------|
| `DimoAuthService` | PARTIAL | — | PARTIAL | DONE | — | — |
| `DimoWebhookController` | PARTIAL | PARTIAL | PARTIAL | — | — | — |
| Device connection inbox/queue | — | PARTIAL | PARTIAL | PARTIAL | PARTIAL | PARTIAL |
| `SnapshotWakeIntakeService` | — | PARTIAL | PARTIAL | — | — | — |
| `DimoSnapshotProcessor` | — | — | PARTIAL | PARTIAL | PARTIAL | PARTIAL |
| `DimoTelemetryService` / queries | OPEN | — | PARTIAL | DONE | — | PARTIAL |
| `DimoRequestExecutor` / budget | DONE | — | DONE | DONE | — | — |
| Frontend live map / freshness | — | — | PARTIAL | — | — | PARTIAL |
| Prometheus / metrics | — | — | — | DONE | — | PARTIAL |

## Completion score (weighted)

| Bucket | Weight | Filled |
|--------|-------:|-------:|
| R4.0–R4.3 closed slices | 40% | 35% (R4.1 OPEN) |
| A–F deep slices | 60% | 38% (avg PARTIAL) |
| **AUDIT_COVERAGE_PERCENT (estimate)** | | **~72%** |

**AUDIT_COMPLETION_STATUS:** `IN_PROGRESS` — defect register complete; R4.1 inventory + R9 T+24 + CH + charging history remain open/blocked.
