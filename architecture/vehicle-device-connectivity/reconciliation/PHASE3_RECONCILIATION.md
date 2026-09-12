# Vehicle & Device Connectivity — Phase 3 Reconciliation Report

**Date:** 2026-09-11  
**Registry:** `AUDIT_IN_PROGRESS`  
**Baseline:** [PHASE3_BASELINE.md](PHASE3_BASELINE.md)

## 1. Reconciliation methodology

Every contradiction, gap, hypothesis, and question is classified on **three independent axes** (never collapsed):

| Axis | Values |
|------|--------|
| **A — Epistemic state** | CONFIRMED, INFERRED, HISTORICAL, UNKNOWN, CONTRADICTED |
| **B — Decision / validation status** | PROPOSED, EXPERIMENTAL, VALIDATED, PRODUCTION_VALIDATED, REJECTED, SUPERSEDED |
| **C — Remediation disposition** | KEEP_AS_IS, CHANGE_REQUIRED, FIX_REQUIRED, DEFERRED, GROUND_TRUTH_REQUIRED, DOCUMENTATION_ONLY, SUPERSEDE_LEGACY_PATH, REMOVE_DEAD_PATH |

**Resolution classes:**

- `RESOLVED_IN_ARCHITECTURE` — canonical semantics decided; runtime may still diverge.
- `RESOLVED_IN_RUNTIME` — code matches canonical decision (none in Phase 3).
- `ARCHITECTURALLY_ADDRESSED_RUNTIME_PENDING` — decision + backlog item; implementation deferred.

Evidence sources: Phase 1 repository audit, Phase 2 Production read-only LTE_R1 forensics (KS MX 2024), code inspection.

---

## 2. VDC-CX-001..011 disposition matrix

### VDC-CX-001 — Connectivity alert code location

| Field | Value |
|-------|-------|
| **Code truth** | Policy in `dimo/connectivity-alert/`; `producerModule: 'dimo'` in registry |
| **Production truth** | Alerts fire on KS MX 2024; delivery works |
| **Conflict** | VDC semantic ownership vs DIMO module placement |
| **Operational risk** | **Low** — functional; **Medium** ownership drift for HM/multi-provider |
| **Provider-neutral implication** | Alert **semantics** belong to VDC; **delivery** may stay provider-adjacent |
| **Canonical semantics** | VDC owns policy vocabulary; DIMO (or per-provider adapters) own transport |
| **Disposition** | **CHANGE_REQUIRED** (structural, P2) — not emergency |
| **Epistemic** | CONTRADICTED → architecture **CONFIRMED** debt |
| **Validation** | PROPOSED → **VALIDATED** (repo evidence) |
| **Runtime remediation** | Yes — relocate or extract neutral module (VDC-RB-006) |
| **GT required** | No |
| **Owning module** | VDC semantics; DIMO delivery today |
| **Neighbors** | Notifications, DIMO Integration |
| **Migration** | Registry `producerModule` may remain `dimo` short-term with documented split |
| **Linked decision** | VDC-DEC-009 |
| **Phase-3 status** | ARCHITECTURALLY_ADDRESSED_RUNTIME_PENDING |

### VDC-CX-002 — Webhook failure type naming

| Field | Value |
|-------|-------|
| **Code truth** | Types: `WEBHOOK_PROCESSING_FAILED`; service emits `WEBHOOK_FAILURE` |
| **Production truth** | Not directly observed in Phase 2 |
| **Conflict** | Enum/registry/runtime reason mismatch |
| **Operational risk** | **Low-Medium** — observability and alert routing confusion |
| **Canonical semantics** | Single taxonomy per VDC-DEC-006 |
| **Disposition** | **FIX_REQUIRED** (P1 naming alignment) |
| **Classification** | Semantic convergence debt — not intentional dual meaning |
| **Runtime remediation** | Yes (VDC-RB-004) |
| **GT required** | No |
| **Linked decision** | VDC-DEC-006 |
| **Phase-3 status** | ARCHITECTURALLY_ADDRESSED_RUNTIME_PENDING |

### VDC-CX-003 — Unused dedupe helper

| Field | Value |
|-------|-------|
| **Code truth** | `buildConnectivityAlertDedupeKey` test-only |
| **Conflict** | Dead code vs active fingerprint dedupe |
| **Operational risk** | **None** |
| **Disposition** | **REMOVE_DEAD_PATH** (P3) or wire intentionally |
| **Classification** | Harmless dead code |
| **Runtime remediation** | Optional cleanup (VDC-RB-012) |
| **Linked decision** | — |
| **Phase-3 status** | RESOLVED_IN_ARCHITECTURE (remove recommended) |

### VDC-CX-004 — Admin DIMO debug thresholds vs 5-state freshness

| Field | Value |
|-------|-------|
| **Code truth** | Admin offline at ≥24h; canonical `signal_delayed` until 48h |
| **Production truth** | Not operator-validated in Phase 2 |
| **Conflict** | Debug surface shows offline 24h earlier than fleet runtime |
| **Operational risk** | **Medium** for master-admin operators |
| **Disposition** | **DOCUMENTATION_ONLY** short-term; **CHANGE_REQUIRED** align to 48h (P2) |
| **Classification** | Legacy debug drift — not domain truth |
| **Linked decision** | VDC-DEC-005 |
| **Phase-3 status** | ARCHITECTURALLY_ADDRESSED_RUNTIME_PENDING |

### VDC-CX-005 — 5-minute stale metric vs 15-minute live

| Field | Value |
|-------|-------|
| **Code truth** | Prometheus `synqdrive_stale_snapshots_total` at 5m; live at 15m |
| **Conflict** | Metric fires before domain "live" ends |
| **Operational risk** | **Low** if treated as observability warning |
| **Disposition** | **KEEP_AS_IS** + **DOCUMENTATION_ONLY** |
| **Classification** | Intentional observability metric ≠ domain semantic |
| **Canonical** | 5m = early warning; 15m = live boundary |
| **Linked decision** | VDC-DEC-008 |
| **Phase-3 status** | RESOLVED_IN_ARCHITECTURE |

### VDC-CX-006 — episodeEvidenceReliable default false

| Field | Value |
|-------|-------|
| **Code truth** | Default `false`; query service hardcodes `false` |
| **Conflict** | Interruption knowledge stays UNKNOWN unless opted in |
| **Operational risk** | **Medium** UX — conservative but may hide known episodes |
| **Disposition** | **GROUND_TRUTH_REQUIRED** for UX proof; **KEEP_AS_IS** until GT |
| **Classification** | Conservative-by-design **with accidental hardcoding debt** in query service |
| **Linked decision** | VDC-DEC-007 |
| **Phase-3 status** | ARCHITECTURALLY_ADDRESSED_RUNTIME_PENDING |

### VDC-CX-007 — Physical episode vs physical evidence

| Field | Value |
|-------|-------|
| **Code truth** | `interruption-knowledge.ts` documents absence of episode ≠ no unplug |
| **Production** | No unplug in Sep window; Aug 2026 episode opened from webhook |
| **Conflict** | Documented tension, not code bug |
| **Operational risk** | **High** if operators assume episode completeness |
| **Disposition** | **DOCUMENTATION_ONLY** + invariant promotion |
| **Canonical** | Absence of open episode **MUST NOT** prove uninterrupted connection |
| **Linked decision** | VDC-DEC-004, VDC-DEC-007 |
| **Phase-3 status** | RESOLVED_IN_ARCHITECTURE (invariant PROPOSED) |

### VDC-CX-008 — Provider link ERROR conflated with webhook failure

| Field | Value |
|-------|-------|
| **Code truth** | `webhookProcessingFailed := providerLink.state === 'ERROR'` |
| **Production** | Aug 2026 ~100min canonicalization — provider delivery was fast |
| **Conflict** | Authorization/link errors surface as webhook processing failures |
| **Operational risk** | **High** — false webhook failure alerts |
| **Disposition** | **FIX_REQUIRED** (P0/P1) |
| **Linked decision** | VDC-DEC-006 |
| **Phase-3 status** | ARCHITECTURALLY_ADDRESSED_RUNTIME_PENDING |

### VDC-CX-009 — Process-local diagnostic tracker

| Field | Value |
|-------|-------|
| **Code truth** | In-memory; demand-driven; documented non-authoritative |
| **Conflict** | Could be mistaken for SLO monitor |
| **Operational risk** | **Low-Medium** multi-replica double-count |
| **Disposition** | **KEEP_AS_IS** as best-effort diagnostic; **DOCUMENTATION_ONLY** |
| **Classification** | Acceptable non-authoritative telemetry |
| **Linked decision** | VDC-DEC-008 |
| **Phase-3 status** | RESOLVED_IN_ARCHITECTURE |

### VDC-CX-010 — Equal sourceTimestamp full VLS upsert

| Field | Value |
|-------|-------|
| **Code truth** | `incoming < existing` stale only; `==` full upsert |
| **Production** | ~1,027 equality vs 3 strict advances; CH duplicates exist; causality UNKNOWN |
| **Conflict** | Churn + weak advance proof vs provider reachability updates |
| **Operational risk** | **MATERIAL** churn; **LOW** erroneous Sep episodes |
| **Disposition** | **CHANGE_REQUIRED** — design only in Phase 3 |
| **Linked decision** | **VDC-DEC-002** (alternatives evaluated) |
| **GT required** | No for decision; CH causality needs VDC-RB-017 |
| **Phase-3 status** | ARCHITECTURALLY_ADDRESSED_RUNTIME_PENDING |

#### VDC-DEC-002 alternative evaluation (summary)

| Alt | Correctness | providerFetchedAt | Episodes/trips | CH churn | Recommendation |
|-----|-------------|-------------------|----------------|----------|----------------|
| A complete no-op | High for advance proof | **Lost** on equality | Reduced side effects | Lowest | Rejected — loses reachability |
| B metadata-only | High | **Preserved** | Reduced side effects | Low | **PROPOSED canonical** |
| C conditional merge | Medium-High | Partial | Complex | Medium | DEFERRED — needs signal-level spec |
| D current | Low advance proof | Preserved | Full side effects | **High** | REJECTED as canonical |

### VDC-CX-011 — DIMO CONNECTED vs providerLinkState UNKNOWN

| Field | Value |
|-------|-------|
| **Production** | CONNECTED + fresh fetch + standby + plugged + UNKNOWN link |
| **Code** | `ProviderLinkStateBuilder` UNKNOWN when consent/IAM chain incomplete despite mirror |
| **Conflict** | Field name implies connection; behavior is authorization confidence |
| **Operational risk** | **Medium** — operators see UNKNOWN while DIMO healthy |
| **Disposition** | **DOCUMENTATION_ONLY** + **CHANGE_REQUIRED** (additive mirror field) |
| **Answer** | **B + D** — authorization confidence today; separate mirror dimension required |
| **Not** | Force ACTIVE from CONNECTED alone |
| **Linked decision** | VDC-DEC-003 |
| **Phase-3 status** | ARCHITECTURALLY_ADDRESSED_RUNTIME_PENDING |

---

## 3. VDC-GAP-001..012 disposition

| ID | Phase-3 status | Epistemic | Notes |
|----|----------------|-----------|-------|
| VDC-GAP-001 | PARTIALLY_RESOLVED | CONFIRMED | Authority exists; code still distributed — ownership debt remains |
| VDC-GAP-002 | **RESOLVED** | CONFIRMED | Production baseline verified Phase 2 |
| VDC-GAP-003 | STILL_OPEN | CONFIRMED | Design gap — latest-only VLS payload |
| VDC-GAP-004 | PARTIALLY_RESOLVED | CONFIRMED | Single-vehicle Production evidence; fleet distribution open (VDC-Q-001) |
| VDC-GAP-005 | PARTIALLY_RESOLVED | CONFIRMED | Ingest path confirmed absent; device-level IO174 still UNKNOWN |
| VDC-GAP-006 | STILL_OPEN | PARTIAL | Repo audit done; runtime parity not started |
| VDC-GAP-007 | STILL_OPEN | PARTIAL | Wake documented; correlation rules undefined |
| VDC-GAP-008 | STILL_OPEN | CONFIRMED | Legacy 3-state drift — SUPERSEDE_LEGACY_PATH planned |
| VDC-GAP-009 | STILL_OPEN | CONFIRMED | DEFERRED_TO_OTHER_MODULE — HM program |
| VDC-GAP-010 | STILL_OPEN | CONFIRMED | Dual resolution paths |
| VDC-GAP-011 | STILL_OPEN | CONFIRMED | Design gap — retention policy missing (not epistemic unknown) |
| VDC-GAP-012 | STILL_OPEN | CONFIRMED | Frontend dual paths |

---

## 4. VDC-HYP-001..007 Phase-3 classification

| ID | Epistemic | Validation | Hypothesis status | Promoted fact / invariant |
|----|-----------|------------|-------------------|---------------------------|
| VDC-HYP-001 | PRODUCTION_OBSERVATION | PRODUCTION_VALIDATED (n=1 vehicle) | **Retained** — fleet falsifier open | ~24h strict source advance (LTE_R1 profile observation) |
| VDC-HYP-002 | PRODUCTION_OBSERVATION | PRODUCTION_VALIDATED | **Retained** | IO174 not in ingest path |
| VDC-HYP-003 | PRODUCTION_OBSERVATION | PRODUCTION_VALIDATED | **Promoted to VDC-INV-004** (existing) + fact | Poll ≠ source advance |
| VDC-HYP-004 | PRODUCTION_OBSERVATION | PRODUCTION_VALIDATED (latest payload limit) | **Retained** | Per-signal timestamp heterogeneity |
| VDC-HYP-005 | PRODUCTION_OBSERVATION | PRODUCTION_VALIDATED | **Promoted to VDC-INV-003** (candidate→confirmed) | Long silence ≠ disconnect |
| VDC-HYP-006 | PRODUCTION_OBSERVATION | PRODUCTION_VALIDATED | **Retained** — design principle | Distinct fault states required |
| VDC-HYP-007 | PRODUCTION_OBSERVATION + CODE | PRODUCTION_VALIDATED | **Promoted to proposed recovery rule** | FULL_CONNECTIVITY_RECOVERED needs strict advance |

**Not confirmed:** Physical Ruptela IO174 timer behavior (VDC-HYP-001 remaining falsifier).

---

## 5. VDC-Q-001..013 triage

| ID | Triage | Follow-up owner |
|----|--------|-----------------|
| VDC-Q-001 | PARTIALLY_ANSWERED | VDC — fleet analytics |
| VDC-Q-002 | ANSWERED | VDC — closed for ingest surfaces |
| VDC-Q-003 | PARTIALLY_ANSWERED | VDC + GT — false-positive rate |
| VDC-Q-004 | ANSWERED | VDC |
| VDC-Q-005 | OPEN → **PROPOSED** via VDC-DEC-009 | VDC/DIMO |
| VDC-Q-006 | DEFERRED | HM Integration |
| VDC-Q-007 | OPEN | Master Admin / VDC |
| VDC-Q-008 | OPEN | VDC + platform ops |
| VDC-Q-009 | PARTIALLY_ANSWERED | VDC-RB-001/017 |
| VDC-Q-010 | PARTIALLY_ANSWERED | VDC-RB-017 |
| VDC-Q-011 | PARTIALLY_ANSWERED | GT for runtime evaluation |
| VDC-Q-012 | OPEN | VDC + ClickHouse |
| VDC-Q-013 | PARTIALLY_ANSWERED | VDC + ops logs |

---

## 6. Canonical evidence hierarchy

See updated [../lifecycle/EVIDENCE_HIERARCHY.md](../lifecycle/EVIDENCE_HIERARCHY.md) (Phase 3 proposed canonical layer).

---

## 7. Target semantic model

See [TARGET_SEMANTIC_MODEL.md](TARGET_SEMANTIC_MODEL.md).

---

## 8. Architectural vs runtime resolution summary

| Category | Count | Examples |
|----------|-------|----------|
| RESOLVED_IN_ARCHITECTURE | 4 | CX-005, CX-007, CX-009, CX-003 |
| ARCHITECTURALLY_ADDRESSED_RUNTIME_PENDING | 7 | CX-001, 002, 004, 006, 008, 010, 011 |
| OPEN / GT blocked | — | Q-003, Q-011, GT-R1 |

---

## 9. HM / Smart5 portability

See [TARGET_SEMANTIC_MODEL.md](TARGET_SEMANTIC_MODEL.md) § HM portability. DIMO-specific: webhooks, episodes, `obdIsPluggedIn`, `signalsLatest`. HM-specific: `HmFreshnessStatus` parallel until GAP-009 closed.

---

## 10. Related artifacts

- [REMEDIATION_BACKLOG.md](REMEDIATION_BACKLOG.md)
- [GROUND_TRUTH_GATES.md](GROUND_TRUTH_GATES.md)
- [../decisions/DECISION_REGISTER.md](../decisions/DECISION_REGISTER.md)
