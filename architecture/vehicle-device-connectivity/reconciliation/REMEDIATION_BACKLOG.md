# Vehicle & Device Connectivity — Remediation Backlog (Phase 3)

**Status:** PROPOSED backlog — **not implemented** in Phase 3.  
Priority: P0 (correctness) → P3 (debt).

| ID | Pri | Source | Title | Decision | Code paths | Expected change | Risk | Tests | Prod validation | Cross-module | Independent? |
|----|-----|--------|-------|----------|------------|-----------------|------|-------|-----------------|--------------|--------------|
| VDC-RB-001 | P0 | VDC-CX-010, VDC-DEC-002 | Equality upsert metadata-only path | VDC-DEC-002 alt B | `vls-monotonic-merge.util.ts`, `dimo-snapshot.processor.ts` | `incoming==existing` → metadata-only VLS update; skip full downstream side effects | Medium — providerFetchedAt must remain correct | Unit + integration snapshot processor | KS MX 2024 churn ratio drop | Trip Detection wake, CH ingest | Partial — CH coupling |
| VDC-RB-002 | P0 | VDC-CX-008, VDC-DEC-006 | Separate webhook processing from provider link ERROR | VDC-DEC-006 | `vehicle-connectivity-runtime-projection.service.ts`, `connectivity-alert.service.ts` | `webhookProcessingFailed` from inbox/dead-letter evidence only | Medium — alert false positives | Alert service specs | Aug 2026 latency class | Notifications | Yes |
| VDC-RB-003 | P1 | VDC-CX-011, VDC-DEC-003 | Expose provider mirror connection separately from authorization | VDC-DEC-003 | `provider-link-state.builder.ts`, runtime DTO, fleet API | Add `providerMirrorConnectionState`; stop hiding DIMO CONNECTED behind UNKNOWN auth | Low-Medium API additive | Builder + fleet contract tests | KS MX 2024 audit replay | Frontend presentation | No — FE contract |
| VDC-RB-004 | P1 | VDC-CX-002, VDC-DEC-006 | Unify webhook failure event types | VDC-DEC-006 | `connectivity-alert.service.ts`, `notification-event-registry.definitions.ts`, runtime builder | Single canonical `WEBHOOK_PROCESSING_FAILURE` registry + reason alignment | Low | Registry + alert tests | Notification delivery | Notifications | Yes |
| VDC-RB-005 | P1 | VDC-Q-013, VDC-DEC-006 | Inbox enqueue failure observability + SLA metrics | VDC-DEC-006 | `device-connection-webhook-inbox.service.ts`, workers | Metrics for enqueue_failed, canonicalization delay | Low | Inbox processor tests | Replay Aug 2026 pattern | Scaling Process queues | Yes |
| VDC-RB-006 | P2 | VDC-CX-001, VDC-DEC-009 | Move alert policy to VDC-neutral module path | VDC-DEC-009 | `connectivity-alert/*` → `vehicles/connectivity/alerts/` (or shared) | Relocate policy; keep DIMO delivery adapter | Medium refactor | Existing alert specs | Alert regression | DIMO Integration | No |
| VDC-RB-007 | P2 | VDC-GAP-008, VDC-DEC-005 | Align legacy `onlineStatus` to 5-state freshness | VDC-DEC-005 | `vehicle-connectivity-runtime-legacy.projection.ts`, consumers | Map 24–48h to signal_delayed not OFFLINE | Medium — API consumers | Regression specs | Fleet list filters | Frontend map | No |
| VDC-RB-008 | P2 | VDC-CX-004, VDC-DEC-005 | Align admin DIMO debug thresholds | VDC-DEC-005 | `dimo.controller.ts` | Use 48h before offline; document 5m Live as presentation | Low | Controller tests | Admin UI | Master Admin | Yes |
| VDC-RB-009 | P2 | VDC-GAP-010 | Unify operational telemetry resolution | VDC-DEC-004 | `vehicles-operational.service.ts`, assembler | Single timestamp evidence chain | Medium | Operational projection tests | Master-admin list | Master Admin | Partial |
| VDC-RB-010 | P2 | VDC-GAP-012 | Remove legacy frontend freshness classifier | VDC-DEC-004 | `telemetryFreshness.ts`, rental surfaces | Require `connectivityRuntime` everywhere | Medium UX | FE tests | Rental fleet UI | Frontend i18n | No |
| VDC-RB-011 | P2 | VDC-CX-006, VDC-DEC-007 | Episode evidence reliability policy | VDC-DEC-007 | `device-connection-query.service.ts`, read model | Tenant policy + safe default; document UNKNOWN semantics | Low | Read model tests | GT-R1 follow-up | Rental projection | Yes |
| VDC-RB-012 | P3 | VDC-CX-003 | Remove or wire dedupe helper | DOCUMENTATION_ONLY | `connectivity-alert.dedupe.ts` | Delete dead code or use in service | Low | Policy tests | N/A | None | Yes |
| VDC-RB-013 | P3 | VDC-CX-005, VDC-DEC-008 | Document stale snapshot metric semantics | VDC-DEC-008 | `dimo-snapshot.processor.ts`, ops runbooks | Rename metric labels/docs; optional dashboard note | Low | N/A | Observability only | Ops | Yes |
| VDC-RB-014 | P3 | VDC-CX-009, VDC-DEC-008 | Centralize diagnostic transitions (optional) | VDC-DEC-008 | `connectivity-diagnostic-transition.tracker.ts` | Redis-backed or metrics-only; keep non-authoritative | Medium ops | Tracker tests | Multi-replica | Observability | No |
| VDC-RB-015 | P1 | VDC-GAP-009 | HM adapter for canonical runtime | VDC-Q-006 | `vehicle-connectivity-runtime-state.builder.ts`, HM services | HM profile inputs to runtime dimensions | High | HM + VDC tests | HM vehicles | HM Integration | No |
| VDC-RB-016 | P2 | VDC-GAP-011, VDC-Q-008 | Episode/webhook retention policy | VDC-Q-008 | Prisma migrations, ops jobs | TTL/partition like `dimo_poll_logs` | Medium data | Migration tests | Storage audit | Data platform | No |
| VDC-RB-017 | P2 | VDC-Q-012 | CH duplicate root cause investigation | VDC-DEC-002 | `clickhouse-telemetry.service.ts`, processor | Prove/disprove CX-010 causality | Medium | CH ingest tests | Historical replay | ClickHouse ops | Partial |

## Recommended next workstream

1. **VDC-RB-001 + VDC-RB-017** (equality upsert + CH duplicate causality) — highest data-integrity leverage.
2. **VDC-RB-002 + VDC-RB-004 + VDC-RB-005** (webhook/event-processing semantics) — operator trust on disconnect detection.
3. **VDC-RB-003** (provider mirror vs authorization) — resolves VDC-CX-011 presentation without forcing false ACTIVE.
4. **GT-R1-UNPLUG-001** (when authorized) — unblocks VDC-Q-003/Q-011 and recovery vocabulary validation.
5. **VDC-RB-015** (HM) — separate provider program; do not block DIMO remediation.
