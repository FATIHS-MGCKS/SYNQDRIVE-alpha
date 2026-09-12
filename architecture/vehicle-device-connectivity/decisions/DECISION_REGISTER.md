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
| **DATE** | 2026-09-11 (Phase 3) |
| **BEFORE** | `incoming == existing` performs full VLS upsert and downstream side effects; ~1,027:3 equality:advance ratio in KS MX 2024 stationary window |
| **WHY** | Material churn; weak source-advance proof; CH duplicate rows exist (causality unproven) |
| **EVIDENCE** | VDC-EVID-PHASE2-001 |
| **ALTERNATIVES** | A) complete no-op — rejected (loses providerFetchedAt). B) **metadata-only update** — PROPOSED. C) conditional signal merge — deferred. D) current full upsert — rejected as canonical |
| **CHANGE** | On equality: update `providerFetchedAt`, poll metadata, reachability fields only; skip full telemetry/CH/episode side effects unless signal-level newer evidence (future) |
| **EXPECTED_EFFECT** | Reduced CH churn and duplicate risk; preserved provider reachability evidence |
| **VALIDATION** | Unit/integration processor tests; Production churn ratio comparison on KS MX 2024 profile |
| **OBSERVED_EFFECT** | N/A — not implemented |
| **NON_EFFECTS** | Strict advance path (`incoming > existing`) unchanged |
| **TRADEOFFS** | May delay detection of payload changes without timestamp advance |
| **REMAINING_UNKNOWNS** | CH duplicate root cause (VDC-Q-012); per-signal merge rules |
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
| **DATE** | 2026-09-11 (Phase 3) |
| **BEFORE** | Colloquial PHYSICAL_REPLUG / FULL_CONNECTIVITY_RECOVERED without epistemic precision |
| **WHY** | Phase 2 proved snapshot plug signal without human-observed replug |
| **EVIDENCE** | VDC-EVID-PHASE2-001 |
| **CHANGE** | Adopt vocabulary table in TARGET_SEMANTIC_MODEL.md; `FULL_CONNECTIVITY_RECOVERED` requires strict source advance |
| **EXPECTED_EFFECT** | Consistent episode resolution documentation |
| **GROUND_TRUTH_REQUIRED** | Historical instant reconstruction; GT-R1 for proof |
| **OWNING_MODULE** | VDC |
