# Vehicle & Device Connectivity — Remediation Backlog (Phase 3)

**Status:** PROPOSED backlog — **not implemented**.  
Priority: P0 (correctness) → P3 (debt).  
**Hardened 2026-09-12:** RB-001 gated on GT-R1; RB-018 added.

| ID | Pri | Source | Title | Decision | Code paths | Expected change | Risk | Tests | Prod validation | Cross-module | Independent? |
|----|-----|--------|-------|----------|------------|-----------------|------|-------|-----------------|--------------|--------------|
| VDC-RB-001 | P0 | VDC-CX-010, VDC-DEC-002 | Equality upsert metadata-only path **(GT-gated)** | VDC-DEC-002 alt B + per-signal gate | `vls-monotonic-merge.util.ts`, `dimo-snapshot.processor.ts` | Equality → metadata-only **unless** newer per-signal/device evidence; never unconditional payload discard | **High** if shipped without per-signal safety — replug loss | Unit + GT-R1 fixtures | KS MX 2024 churn; GT recovery ordering | Trip Detection, CH | Partial |
| VDC-RB-002 | P0 | VDC-CX-008, VDC-DEC-006 | Separate webhook processing from provider link ERROR | VDC-DEC-006 | `vehicle-connectivity-runtime-projection.service.ts`, `connectivity-alert.service.ts` | `webhookProcessingFailed` from inbox/dead-letter only | Medium | Alert specs | Aug 2026 class | Notifications | Yes |
| VDC-RB-003 | P1 | VDC-CX-011, VDC-DEC-003 | Expose provider mirror connection separately from authorization | VDC-DEC-003 | `provider-link-state.builder.ts`, runtime DTO | Additive `providerMirrorConnectionState` | Low-Medium | Builder + API tests | KS MX 2024 replay | Frontend | No |
| VDC-RB-004 | P1 | VDC-CX-002, VDC-DEC-006 | Unify webhook failure event types | VDC-DEC-006 | `connectivity-alert.service.ts`, registry | Canonical `WEBHOOK_PROCESSING_FAILURE` | Low | Registry tests | Notifications | Notifications | Yes |
| VDC-RB-005 | P1 | VDC-Q-013, VDC-DEC-006 | Inbox enqueue failure observability + SLA metrics | VDC-DEC-006 | `device-connection-webhook-inbox.service.ts` | enqueue_failed / canonicalization delay metrics | Low | Inbox tests | Aug 2026 pattern | Scaling Process | Yes |
| VDC-RB-006 | P2 | VDC-CX-001, VDC-DEC-009 | Move alert policy to VDC-neutral module | VDC-DEC-009 | `connectivity-alert/*` | Policy relocate; DIMO delivery adapter | Medium | Alert specs | Regression | DIMO | No |
| VDC-RB-007 | P2 | VDC-GAP-008, VDC-DEC-005 | Align legacy `onlineStatus` | VDC-DEC-005 | legacy projection | 24–48h → signal_delayed | Medium | Regression | Fleet filters | Frontend | No |
| VDC-RB-008 | P2 | VDC-CX-004, VDC-DEC-005 | Align admin DIMO debug thresholds | VDC-DEC-005 | `dimo.controller.ts` | 48h offline; document 5m Live | Low | Controller tests | Admin UI | Master Admin | Yes |
| VDC-RB-009 | P2 | VDC-GAP-010 | Unify operational telemetry resolution | VDC-DEC-004 | `vehicles-operational.service.ts` | Single evidence chain | Medium | Projection tests | Master-admin | Master Admin | Partial |
| VDC-RB-010 | P2 | VDC-GAP-012 | Remove legacy frontend freshness classifier | VDC-DEC-004 | `telemetryFreshness.ts` | Require `connectivityRuntime` | Medium | FE tests | Rental UI | Frontend | No |
| VDC-RB-011 | P2 | VDC-CX-006, VDC-DEC-007 | Episode evidence reliability policy | VDC-DEC-007 | read model | Tenant policy + safe default | Low | Read model tests | GT-R1 | Rental | Yes |
| VDC-RB-012 | P3 | VDC-CX-003 | Remove or wire dedupe helper | — | `connectivity-alert.dedupe.ts` | Delete or wire | Low | Policy tests | N/A | None | Yes |
| VDC-RB-013 | P3 | VDC-CX-005, VDC-DEC-008 | Document stale snapshot metric | VDC-DEC-008 | processor, runbooks | Observability docs | Low | N/A | Ops | Ops | Yes |
| VDC-RB-014 | P3 | VDC-CX-009, VDC-DEC-008 | Centralize diagnostic transitions (optional) | VDC-DEC-008 | diagnostic tracker | Redis/metrics; non-authoritative | Medium | Tracker tests | Multi-replica | Observability | No |
| VDC-RB-015 | P1 | VDC-GAP-009 | HM adapter for canonical runtime | VDC-Q-006 | runtime builder | HM profile inputs | High | HM + VDC | HM vehicles | HM Integration | No |
| VDC-RB-016 | P2 | VDC-GAP-011, VDC-Q-008 | Episode/webhook retention | VDC-Q-008 | Prisma, ops | TTL/partition | Medium | Migration | Storage | Data platform | No |
| VDC-RB-017 | P2 | VDC-Q-012 | CH duplicate root cause | VDC-DEC-002 | CH service, processor | Prove/disprove CX-010 causality | Medium | CH tests | Historical replay | ClickHouse | Partial |
| VDC-RB-018 | P1 | VDC-DEC-011, Phase 2 | Adaptive provider/device polling scheduler | VDC-DEC-011 | `dimo-snapshot.scheduler.ts`, tier config, profile layer | Information-gain cadence; `nextPollAt` concept; backoff on equality streak; event-triggered refresh; jitter | Medium-High | Pilot metrics | Poll:advance ratio; latency SLAs | DIMO + Scaling Process | No |
| VDC-RB-019 | P0 | VDC-DEC-012, GT-R1 | Canonical physical-device-state reconciliation | VDC-DEC-012 | `device-connection-physical-state/*`, webhook + snapshot writers (Phase 2 cutover) | Durable projection + transition log; multi-source ordering; idempotency; self-heal; GT-R1 regression | **High** if enabled without cutover discipline | Unit + PG integration + GT-R1 | Flag-gated pilot; drift detector dry-run | DIMO, Notifications, Vehicles | Partial (Phase 1 foundation only) |

### VDC-RB-018 — future inputs (conceptual)

Vehicle activity, provider/device profile, last strict source advance, repeated equality streak, physical device state, webhook/native-event receipt, last provider reachability, recovery state, rate-limit budget.

### VDC-RB-018 — validation metrics

Provider requests per stationary vehicle/day; poll : strict-source-advance ratio; provider/API cost; queue jobs per vehicle/day; DB/CH writes per source advance; detection latency after driving resumes; unplug/replug/recovery latency; missed source advances; thundering-herd distribution.

### VDC-RB-001 — implementation prerequisite (mandatory)

> **Equality short-circuit must preserve objectively newer per-signal/device evidence.**

Do **not** implement unconditional `equal top-level timestamp → discard payload`. Protect at minimum: `obdIsPluggedIn`, ignition, speed, physical-device evidence, any per-signal timestamp newer than stored evidence.

---

### VDC-RB-019 — Phase 1 foundation (2026-09-12)

**Shipped (dark):** schema, policy, repository, service, metrics, tests, drift detector. **Deferred:** live webhook gate replacement, snapshot writer cutover, Production backfill, flag enablement.

**GT-R1 regression target:** self-heal PLUG from snapshot without episode → accept newer webhook UNPLUG exactly once.

---

## Recommended next workstream (hardened order)

1. **Merge Phase 3 architecture** (this PR + hardening).
2. **Execute GT-R1-UNPLUG-001** on **current** behavior — establish recovery baseline **before** equality changes alter observable replug/snapshot evidence.
3. **Finalize safe equality / per-signal handling** for VDC-RB-001 (design + persistence capability).
4. **Implement VDC-RB-001** + investigate **VDC-RB-017** (CH duplicate causality).
5. **Design/implement VDC-RB-018** adaptive polling (VDC-DEC-011, VDC-Q-014).
6. **Webhook taxonomy/processing remediation** — VDC-RB-002, RB-004, RB-005.
7. **Remaining provider/runtime work** — RB-003, RB-015 (HM), legacy alignment.

**Why GT before RB-001:** Changing equality handling before GT could alter or suppress the exact snapshot/replug evidence needed as baseline (VDC-HYP-004 per-signal heterogeneity; Aug 2026 `SNAPSHOT_PLUG_SIGNAL` path).

**Why RB-018 after RB-001 design clarity:** DEC-002 addresses processing churn; DEC-011 addresses API poll volume — complementary but RB-018 benefits from stable ingest semantics.
