# Vehicle & Device Connectivity — Decision Register

Phase 3 decisions are **PROPOSED** or **VALIDATED** — not `PRODUCTION_VALIDATED` unless explicitly noted for observational facts.

---

## VDC-DEC-BOOTSTRAP-001 — Bootstrap authority scope

| Field | Value |
|-------|-------|
| **STATUS** | PROPOSED |
| **DATE** | 2026-09-11 |
| **BEFORE** | Connectivity semantics fragmented across vehicles/, dimo/, AI modules without registry authority |
| **WHY** | Need provider-neutral ownership for freshness, standby/disconnect semantics, and ground-truth methodology |
| **CHANGE** | Establish `architecture/vehicle-device-connectivity/` at registry status `AUDIT_IN_PROGRESS` |
| **ALTERNATIVES** | Extend DIMO Integration authority only — rejected; HM and cross-provider semantics required |
| **EXPECTED_EFFECT** | Agents route connectivity semantics work to Vehicle & Device Connectivity authority |
| **EVIDENCE** | VDC-EVID-PROD-BASELINE-001 |
| **VALIDATION** | Registry + graph validators pass |
| **REMAINING_UNKNOWNS** | Promotion to AUTHORITY_ACTIVE deferred |
| **OWNING_MODULE** | Vehicle & Device Connectivity |

---

## VDC-DEC-002 — Equal sourceTimestamp ingest behavior (VDC-CX-010)

| Field | Value |
|-------|-------|
| **STATUS** | PROPOSED |
| **DATE** | 2026-09-11 (Phase 3); hardened 2026-09-12 |
| **BEFORE** | `incoming == existing` performs full VLS upsert and downstream side effects; ~1,027:3 equality:advance ratio in KS MX 2024 stationary window |
| **WHY** | Material churn; weak source-advance proof; CH duplicate rows exist (causality unproven) |
| **EVIDENCE** | VDC-EVID-PHASE2-001 |
| **ALTERNATIVES** | A) complete no-op — rejected (loses providerFetchedAt). B) **metadata-only update** — PROPOSED **with per-signal safety gate**. C) conditional signal merge — preferred when equality + newer per-signal evidence. D) current full upsert — rejected as canonical |
| **CHANGE** | On equality: update `providerFetchedAt`, poll metadata, reachability fields only; skip full telemetry/CH/episode side effects **unless** objectively newer per-signal/device evidence is detected |
| **IMPLEMENTATION_PREREQUISITE** | **Equality short-circuit must preserve objectively newer per-signal/device evidence.** `incoming top-level sourceTimestamp == existing` does **not** prove no signal contains newer evidence (VDC-HYP-004). Protected signals include at minimum: `obdIsPluggedIn`, ignition, speed, physical-device evidence, and any per-signal timestamp newer than stored evidence. **VDC-RB-001 MUST NOT** ship as unconditional `equal top-level timestamp → discard payload` until this is proven safe or per-signal comparison is implemented. |
| **GT_GATE** | **GT-R1-UNPLUG-001 MUST precede RB-001 production rollout** unless implementation independently proves replug/recovery evidence cannot be suppressed |
| **EXPECTED_EFFECT** | Reduced CH churn; preserved reachability; no replug evidence loss |
| **VALIDATION** | Unit/integration processor tests; GT-R1 recovery ordering; per-signal heterogeneity fixtures |
| **OBSERVED_EFFECT** | N/A — not implemented |
| **NON_EFFECTS** | Strict advance path (`incoming > existing`) unchanged |
| **TRADEOFFS** | Per-signal merge adds complexity; metadata-only alone insufficient without safety gate |
| **REMAINING_UNKNOWNS** | CH duplicate root cause (VDC-Q-012); safe per-signal comparison in current VLS persistence shape |
| **OWNING_MODULE** | VDC semantics; DIMO snapshot processor implementation |

---

## VDC-DEC-003 — Provider link vs authorization vs mirror health (VDC-CX-011)

| Field | Value |
|-------|-------|
| **STATUS** | PROPOSED |
| **DATE** | 2026-09-11 (Phase 3) |
| **BEFORE** | `providerLinkState` UNKNOWN while DIMO `connectionStatus=CONNECTED` on same vehicle |
| **WHY** | Builder encodes consent/IAM/mapping confidence, not mirror session health; field name misleads operators |
| **EVIDENCE** | VDC-EVID-PHASE2-001 |
| **ALTERNATIVES** | Force ACTIVE from CONNECTED — **rejected**. Rename field — deferred breaking change. **Additive mirror field** — PROPOSED |
| **CHANGE** | Document `providerLinkState` as authorization confidence; expose optional `providerMirrorConnectionState` from adapter (DIMO/HM) |
| **EXPECTED_EFFECT** | Operators see CONNECTED mirror without faking ACTIVE authorization |
| **VALIDATION** | Builder tests; fleet API contract; KS MX 2024 replay |
| **NON_EFFECTS** | Authorization precedence rules unchanged |
| **REMAINING_UNKNOWNS** | HM mirror shape |
| **OWNING_MODULE** | VDC runtime assembly |

---

## VDC-DEC-004 — Canonical evidence hierarchy (multi-dimensional)

| Field | Value |
|-------|-------|
| **STATUS** | VALIDATED (architecture) |
| **DATE** | 2026-09-11 (Phase 3) |
| **BEFORE** | Flattened connected/offline presentation on legacy surfaces |
| **WHY** | Phase 1–2 proved independent layers (poll, source, physical, auth, processing) |
| **EVIDENCE** | VDC-EVID-REPO-PHASE1-001 |
| **ALTERNATIVES** | Single boolean connectivity — rejected |
| **CHANGE** | Adopt seven-dimension hierarchy: physical, authorization, mirror, reachability, source freshness, event processing, data coverage |
| **EXPECTED_EFFECT** | Consistent agent and operator mental model |
| **VALIDATION** | Authority cross-reference sweep |
| **NON_EFFECTS** | Does not change runtime until RB items land |
| **OWNING_MODULE** | Vehicle & Device Connectivity |

---

## VDC-DEC-005 — Freshness threshold taxonomy

| Field | Value |
|-------|-------|
| **STATUS** | VALIDATED (architecture) |
| **DATE** | 2026-09-11 (Phase 3) |
| **BEFORE** | 5m/15m/24h/48h used interchangeably across UI, metrics, legacy, domain |
| **WHY** | Prevent false "defect" classification of intentional parallel semantics |
| **EVIDENCE** | VDC-EVID-PHASE2-001 |
| **ALTERNATIVES** | Change canonical 15m/24h/48h — **rejected in Phase 3** |
| **CHANGE** | Classify each threshold surface (domain, UI, observability, legacy); defer LTE_R1 tolerance evaluation |
| **EXPECTED_EFFECT** | Clear remediation targeting; VDC-Q-003/Q-011 limitations explicit |
| **VALIDATION** | Semantic map + CURRENT_STATE alignment |
| **REMAINING_UNKNOWNS** | Hardware-specific boundary tolerance (future) |
| **OWNING_MODULE** | VDC |

---

## VDC-DEC-006 — Webhook and event-processing failure taxonomy (VDC-CX-002, CX-008, Q-013)

| Field | Value |
|-------|-------|
| **STATUS** | PROPOSED |
| **DATE** | 2026-09-11 (Phase 3) |
| **BEFORE** | `WEBHOOK_FAILURE` vs `WEBHOOK_PROCESSING_FAILED`; link ERROR maps to webhook failure; Aug 2026 enqueue_failed + ~100min delay |
| **WHY** | Fast provider delivery ≠ fast SynqDrive disconnect detection; conflated failure classes |
| **EVIDENCE** | VDC-EVID-PHASE2-001 |
| **ALTERNATIVES** | Single generic integration error — rejected (loses diagnosability) |
| **CHANGE** | Canonical terms: `PROVIDER_LINK_ERROR`, `WEBHOOK_DELIVERY_FAILURE`, `WEBHOOK_PROCESSING_FAILURE`, `QUEUE_ENQUEUE_FAILURE`, `CANONICALIZATION_DELAY`, `RETRY_RECOVERY` — separate dimensions |
| **EXPECTED_EFFECT** | Correct alert routing and ops runbooks |
| **VALIDATION** | Alert registry alignment; inbox metrics |
| **REMAINING_UNKNOWNS** | Root cause of Aug 2026 enqueue_failed (VDC-Q-013) |
| **OWNING_MODULE** | VDC + DIMO webhook pipeline |

---

## VDC-DEC-007 — Episode evidence reliability (VDC-CX-006, CX-007)

| Field | Value |
|-------|-------|
| **STATUS** | PROPOSED |
| **DATE** | 2026-09-11 (Phase 3) |
| **BEFORE** | `episodeEvidenceReliable` defaults false; absence of episode ≠ no unplug documented |
| **WHY** | Conservative safety vs operator usability |
| **EVIDENCE** | VDC-EVID-REPO-PHASE1-001 |
| **ALTERNATIVES** | Default true — rejected without GT (false confidence risk) |
| **CHANGE** | Keep default false; promote invariant: **no open episode does not prove uninterrupted connection**; tenant policy hook for reliability |
| **EXPECTED_EFFECT** | Safer operator inference; explicit UNKNOWN when episodes untrusted |
| **VALIDATION** | GT-R1-UNPLUG-001; read model tests |
| **GROUND_TRUTH_REQUIRED** | Yes — operator UX validation |
| **OWNING_MODULE** | VDC |

---

## VDC-DEC-008 — Diagnostic observability non-authoritative guarantee (VDC-CX-005, CX-009)

| Field | Value |
|-------|-------|
| **STATUS** | VALIDATED (architecture) |
| **DATE** | 2026-09-11 (Phase 3) |
| **BEFORE** | 5m stale metric and process-local diagnostic tracker could be mistaken for domain truth / SLO |
| **WHY** | Code already documents demand-driven, non-authoritative behavior |
| **EVIDENCE** | VDC-EVID-REPO-PHASE1-001 |
| **CHANGE** | Canonical guarantee: diagnostic transitions and 5m stale counter are **best-effort observability only**; never SLO or connectivity state |
| **EXPECTED_EFFECT** | Ops uses correct signals |
| **VALIDATION** | Runbook documentation |
| **OWNING_MODULE** | VDC + Observability |

---

## VDC-DEC-009 — Connectivity alert semantic ownership (VDC-CX-001, Q-005)

| Field | Value |
|-------|-------|
| **STATUS** | PROPOSED |
| **DATE** | 2026-09-11 (Phase 3) |
| **BEFORE** | Alert policy under `dimo/connectivity-alert` |
| **WHY** | HM and multi-provider require neutral policy ownership |
| **EVIDENCE** | VDC-EVID-REPO-PHASE1-001 |
| **CHANGE** | VDC owns policy types and thresholds; provider modules own delivery adapters |
| **EXPECTED_EFFECT** | HM can reuse policy without DIMO coupling |
| **VALIDATION** | Module boundary review; alert regression suite |
| **OWNING_MODULE** | VDC (policy); DIMO (delivery today) |

---

## VDC-DEC-010 — Recovery evidence vocabulary (Phase 2 Aug 2026)

| Field | Value |
|-------|-------|
| **STATUS** | VALIDATED (architecture) |
| **DATE** | 2026-09-11 (Phase 3); hardened 2026-09-12 |
| **BEFORE** | Colloquial PHYSICAL_REPLUG / FULL_CONNECTIVITY_RECOVERED without epistemic precision; implicit PLUG webhook dependency risk |
| **WHY** | Phase 2 proved snapshot plug signal without human-observed replug; Aug 2026 had **no** canonical PLUG webhook |
| **EVIDENCE** | VDC-EVID-PHASE2-001 |
| **CHANGE** | Adopt vocabulary in TARGET_SEMANTIC_MODEL.md; `FULL_CONNECTIVITY_RECOVERED` requires strict source advance; **PLUG webhook = optional fast-path, not mandatory recovery dependency** |
| **RECOVERY_FAST_PATH** | PLUG webhook may accelerate `PHYSICAL_DEVICE_PRESENT` / replug inference. **FULL_CONNECTIVITY_RECOVERED MUST NOT depend on PLUG webhook.** Provider-neutral: PLUG webhook **OR** fresh snapshot physical evidence **OR** other sufficiently strong provider/device evidence (per profile) may establish physical presence. **Never sufficient alone:** poll SUCCESS, `providerFetchedAt` advance, equal stale snapshot |
| **GT-R1_LTE_R1** | Must determine: PLUG webhook emission; `obdIsPluggedIn=true` vs strict top-level source advance ordering; per-signal timestamp independence; recovery without PLUG webhook; exact recovery ordering |
| **EXPECTED_EFFECT** | Recovery paths work when webhooks are absent; no false dependency on PLUG delivery |
| **GROUND_TRUTH_REQUIRED** | GT-R1-UNPLUG-001 before claiming provider recovery SLA |
| **OWNING_MODULE** | VDC |

---

## VDC-DEC-012 — Durable effective physical-device-state projection

| Field | Value |
|-------|-------|
| **STATUS** | PROPOSED (Phase 1 foundation implemented — flag OFF) |
| **DATE** | 2026-09-12 |
| **BEFORE** | Webhook canonicalization deduped physical plug/unplug from last `dimo_device_connection_events.event_type` only; snapshot `obdIsPluggedIn` could prove newer physical state without updating that authority (GT-R1) |
| **WHY** | Split authority made genuine newer UNPLUG webhooks classify as `no_state_change`, blocking episodes/alerts after snapshot-only replug recovery |
| **EVIDENCE** | VDC-EVID-GT-R1-EXECUTION-001; VDC-EVID-GT-R1-WEBHOOK-RECOVERY-001 |
| **CANONICAL_PRINCIPLE** | A durable, provider-neutral **effective physical-device-state projection** is the canonical authority for physical plug/unplug deduplication and ordering. Webhook event history is evidence/history — **not** the effective physical-state authority. |
| **PROJECTION** | `device_connection_physical_states` — one row per `(organizationId, vehicleId, provider, bindingKey)`; `bindingKey` non-null (`{provider}:binding:{id}` or `{provider}:device:{hash}`) |
| **TRANSITION_LOG** | Append-only `device_connection_physical_state_transitions` with explicit decisions: ESTABLISHED, APPLIED, DUPLICATE, STALE, CONFLICT, INSUFFICIENT_EVIDENCE, PROVENANCE_REFRESH |
| **TIMESTAMP_AUTHORITY** | Physical ordering uses `evidenceObservedAt` from provider-observed webhook time or per-signal `obdIsPluggedIn.timestamp` — never `providerFetchedAt`, poll completion, or `receivedAt` |
| **INITIALIZATION** | Snapshot self-heal may establish/repair projection without retroactive user-visible lifecycle events or fabricated PLUG webhooks |
| **EPISODE_BOUNDARY** | Physical projection transition ≠ episode/alert policy; snapshot-only UNPLUG episode opening remains deferred (Phase 1) |
| **ROLLOUT** | `CONNECTIVITY_PHYSICAL_STATE_RECONCILIATION_ENABLED` default **OFF**; do not enable with mixed old/new replicas |
| **IMPLEMENTATION** | `backend/src/modules/dimo/device-connection-physical-state/*`; migration `20260912200000_device_connection_physical_state` |
| **VALIDATION** | Policy unit tests; PostgreSQL integration (concurrency, GT-R1 regression); drift detector dry-run |
| **OWNING_MODULE** | VDC |

---

## VDC-DEC-011 — Adaptive / information-gain provider polling

| Field | Value |
|-------|-------|
| **STATUS** | PROPOSED |
| **DATE** | 2026-09-12 (Phase 3 hardening) |
| **BEFORE** | Fixed tier polling (~5 min RESTING_STANDBY) produced ~1,030 SUCCESS polls vs 3 strict source advances (KS MX 2024); VDC-DEC-002 reduces processing churn but not API poll volume |
| **WHY** | Fixed frequent polling of healthy stationary vehicles is not a scalable canonical design; provider cost and queue load grow with fleet size independent of information gain |
| **EVIDENCE** | VDC-EVID-PHASE2-001 |
| **CANONICAL_PRINCIPLE** | **Polling cadence follows expected information gain and vehicle/device state, not elapsed wall-clock time alone.** |
| **POLLING_POLICY_INPUTS** (not connectivity runtime states): `ACTIVE_DRIVING`, `POST_TRIP_SETTLING`, `CONFIRMED_STANDBY`, `LONG_IDLE`, `DISCONNECTED_UNPLUGGED`, `RECOVERY`, `EVENT_TRIGGERED_REFRESH` |
| **REQUIREMENTS** | High frequency while driving; relatively frequent post-trip settling; progressive backoff on repeated equal `sourceTimestamp`; sparse watchdog for confirmed healthy standby; native/provider events trigger targeted refresh; strict source advance may reset cadence; jitter against thundering herd; respect provider rate limits/budgets; missing webhooks must not leave vehicle permanently unpolled; profiles may override (LTE_R1 ~24h is profile evidence, **not** universal 24h poll rule; Smart5/HM may differ) |
| **ALTERNATIVES** | Keep fixed 5 min standby polling — rejected as canonical fleet design |
| **CHANGE** | Define provider-neutral adaptive polling policy (VDC); implement via VDC-RB-018 with DIMO acquisition + Scaling Process execution |
| **EXPECTED_EFFECT** | Lower provider/API load per stationary vehicle; preserved trip-start/disconnect/recovery detection latency (calibrated via VDC-Q-014 + GT) |
| **VALIDATION** | Metrics in VDC-RB-018; fleet pilot; GT-R1 recovery latency |
| **NON_EFFECTS** | Does not change canonical 15m/24h/48h freshness thresholds |
| **TRADEOFFS** | Adaptive policy complexity; per-profile calibration required |
| **REMAINING_UNKNOWNS** | Safe backoff intervals per profile (VDC-Q-014); final storage shape for `nextPollAt` |
| **OWNING_MODULE** | VDC (semantic policy); DIMO Integration (API acquisition); Scaling Process (scheduler mechanics only) |
