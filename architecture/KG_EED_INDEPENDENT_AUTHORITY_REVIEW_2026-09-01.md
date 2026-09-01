# KG-EED Independent Authority Review — Phase 2B.1

**Date:** 2026-09-01  
**Reviewer role:** Independent adversarial authority gate (not implementation agent)  
**Target:** PR #1486 — `architecture/knowledge-graphs/energy-event-detection/`

## 1. Review baseline

| Field | Value |
|-------|-------|
| **MAIN_SHA** | `da959784f835a31482852d506daa137c90389b87` |
| **PR_1486_HEAD_SHA (pre-review)** | `cc2ff60f01d0499aaa9078ad77f601ef98696bd3` |
| **REVIEWED_RUNTIME_AGAINST_SHA** | `da959784f835a31482852d506daa137c90389b87` |
| **Runtime delta after canonicalization base** | **None** — PR #1486 is docs-only |

**Methodology:** Independent reconstruction from application source at `main` SHA. KG YAML used only as comparison target after reconstruction. Validator treated as necessary-not-sufficient. Tests run where Prisma client available (`refuel-sibling-reconciliation.spec.ts`, `refuel-fuel-rise.spec.ts` PASS).

---

## 2. Independent runtime reconstruction

### REFUEL path (CONFIRMED)

```
TripReconciliationService step 5 (@Optional energyEventsService, isolated try/catch)
  OR POST /energy-events/detect OR ops scripts
→ EnergyEventsService.detectEnergyEvents
→ DimoSegmentsService.fetchEnergyEventSegments (refuel+recharge isolated outcomes)
→ parseDimoEnergyEventSegment (refuel GraphQL, minIncreasePercent:5)
→ isSegmentPersistable (liters>1.0, !ongoing, duration>0)
→ coalesceSegments (gap≤300s, geo≤250m)
→ fetchFuelLevelSamples (30s) + deriveRefuelFuelLevelRise
→ buildUpsertPayload + upsert by unique dimoSegmentId
→ pruneStaleCoalescedSubSegments (coalesce provenance only)
→ reconcileSupersededRefuelSiblings (REFUEL-only, vehicle-scoped deleteMany)
→ toEnergyEventDto → API / trips-timeline → TripTimelineEnergyCard (REFUEL semantics)
```

### RECHARGE path (CONFIRMED)

```
Same entry → fetchEnergyEventSegments → DimoRechargeSegmentsClient (default detector, 31d windows)
→ shared persist gate (soc≥1 OR energy>0) → coalesce (gap≤1800s)
→ fuelLevelRise* forced null → upsert → coalesce prune only (no sibling reconcile)
→ UI uses durationSeconds for charging minutes
```

### KG alignment

| Area | Match |
|------|-------|
| Trigger ownership | **PASS** — with addition of `@Optional` skip (EED-FB-001) |
| DIMO path | **PASS** |
| REFUEL semantics | **PASS** |
| RECHARGE semantics | **PASS** |
| KS MX incident facts | **PASS** after provenance split |
| ATE/EED firewall | **PASS** |

---

## 3. Candidate findings adjudication

| Candidate | Verdict | Summary |
|-----------|---------|---------|
| **A** Premature CANONICAL | **PARTIAL** | `status: CANONICAL` before review artifact existed. Fixed: `authority_review` gate in GRAPH.yaml (precedent: KG-ATE merged CANONICAL post-review; gate documents completion requirement). |
| **B** EED-EV-0022 contradiction | **CONFIRMED** | Node CONFIRMED vs registry INFERENCE. Fixed: EED-EV-0022 + EED-EXT-003 → INFERRED. |
| **C** Doc as PROVEN_IN_CODE | **CONFIRMED** | EED-EV-0016/0019/0021 inflated. Fixed: downgrade epistemic + registry maturity; validator blocks ARCHITECTURE_DOC+CONFIRMED. |
| **D** KS MX provenance | **CONFIRMED** | EED-EV-0018 conflated fixture with production. Fixed: split EED-EV-0018 (TEST/fixture) + EED-EV-0025 (PRODUCTION/P1.3-S6). |
| **E** Open-question accounting | **CONFIRMED** | Mixed current-state with future questions; math inconsistent. Fixed: EED-ST-001 + corrected summary counts. |
| **F** Validator weakness | **PARTIAL** | Added deterministic epistemic + PRODUCTION_VALIDATED + authority_review gate checks. Not a semantic theorem prover. |

---

## 4. Additional findings

| ID | Sev | Finding | Correction |
|----|-----|---------|------------|
| EED-FIND-007 | P2 | Missing `@Optional` energyEventsService silent skip | Added `EED-FB-001`, edge from ATE trigger |
| EED-FIND-008 | P2 | Fuel station enrichment post-persist not in graph | Added `EED-COMP-008` |
| EED-FIND-009 | P3 | Canonicalization report cited 97 edges; graph has 78 | Noted; graph is source of truth |

**ADDITIONAL_FINDINGS:** 3

---

## 5. Cross-graph authority

| Graph | Result | Notes |
|-------|--------|-------|
| KG-ATE | **PASS** | ATE-EXT-006 ↔ EED-EXT-001 reciprocal; step 5 MAY_TRIGGER only |
| Battery V2 | **PASS** | HvChargeSession parallel path; orthogonality **INFERRED** (Battery V2 does not document VehicleEnergyEvent) |
| Scaling Process | **PASS** | Provider budget + leader/mutex referenced external |

**AUTHORITY_CONFLICTS:** 0

---

## 6. Epistemic audit

| Check | Result |
|-------|--------|
| Evidence maturity vs node epistemic_status | **PASS** (post-correction) |
| KS MX production vs fixture separation | **PASS** |
| PRODUCTION_VALIDATED decisions backed by strong evidence | **PASS** |
| INFERENCE not promoted to CONFIRMED operational facts | **PASS** |

---

## 7. Corrections applied (this review)

| Artifact | Change |
|----------|--------|
| `GRAPH.yaml` | `authority_review` gate block |
| `graph/nodes.yaml` | EED-ST-001, EED-FB-001, EED-COMP-008, EED-EV-0025; epistemic fixes; KS MX evidence split |
| `graph/edges.yaml` | New edges for ST-001, FB-001, COMP-008, KS MX provenance |
| `graph/invariants.yaml` | EED-INV-001 evidence refs |
| `evidence/EVIDENCE_REGISTRY.md` | Maturity corrections + EED-EV-0025 |
| `open-questions/OPEN_QUESTIONS.md` | Corrected accounting |
| `scripts/validate-graph.mjs` | Epistemic + authority gate checks |
| `history/CHANGELOG.md` | 2B.1 review entry |

---

## 8. Unresolved (honest open questions)

- Dedicated energy scheduler (EED-OQ-001) — future architecture
- Battery V2 ↔ VehicleEnergyEvent link (EED-OQ-004) — OUT_OF_SCOPE
- Fleet sibling inventory policy (EED-OQ-007)
- KG-ATE FM-007 / multi-replica — **DEFERRED**, not expanded

**UNRESOLVED_BLOCKERS:** 0

---

## 9. Merge recommendation

### **APPROVE_WITH_DOCUMENTED_OPEN_QUESTIONS**

**FINAL_VERDICT:** `READY_TO_MERGE`  
**CANONICAL_AUTHORITY_CONFIDENCE:** `MEDIUM`

**Rationale:** After independent reconstruction, KG-EED materially agrees with runtime for REFUEL/RECHARGE chains, duration vs fuel-rise semantics, coalescing constants, sibling reconciliation guards, and ATE/EED firewall. Initial PR had epistemic inflation (docs as CONFIRMED facts, fixture as production), premature authority gate, and minor completeness gaps. Corrections applied during this review. Remaining items are classified open questions or inferred cross-graph boundaries — not promoted as facts.

**Do not merge in this review turn** — human merge decision remains with PR owner.

---

## 10. Finding register (complete — severity corrected in 2B.2)

**Previous severity aggregate (§10 legacy table below) was internally inconsistent** — it claimed P0=2 without mapping findings to IDs. Corrected register:

| ID | Title | Sev | Status | Origin | Correction commit |
|----|-------|-----|--------|--------|-------------------|
| EED-FIND-001 | Premature `status: CANONICAL` on unmerged PR | P1 | CLOSED | Candidate A | `6e9e65c63` → `f90b8c72c` (2B.2 lifecycle) |
| EED-FIND-002 | `EED-EV-0022` / `EED-EXT-003` epistemic contradiction | P1 | CLOSED | Candidate B | `6e9e65c63` |
| EED-FIND-003 | Architecture docs classified as PROVEN_IN_CODE | P1 | CLOSED | Candidate C | `6e9e65c63` |
| EED-FIND-004 | KS MX fixture conflated with production evidence | P1 | CLOSED | Candidate D | `6e9e65c63` |
| EED-FIND-005 | Open-question accounting inconsistent | P2 | CLOSED | Candidate E | `6e9e65c63` |
| EED-FIND-006 | Validator semantic checks insufficient | P2 | CLOSED | Candidate F | `6e9e65c63` |
| EED-FIND-007 | Missing `@Optional` energyEventsService skip path | P2 | CLOSED | Review | `6e9e65c63` |
| EED-FIND-008 | Missing fuel-station enrichment post-persist node | P2 | CLOSED | Review | `6e9e65c63` |
| EED-FIND-009 | Canonicalization report stale edge count | P3 | CLOSED | Review | noted |
| EED-FIND-010 | `EED-DEC-009` PRODUCTION_VALIDATED without strong evidence | P2 | CLOSED | Review | `6e9e65c63` |

### Corrected severity totals

| Severity | Count |
|----------|------:|
| P0 | 0 |
| P1 | 4 |
| P2 | 5 |
| P3 | 1 |
| **Total** | **10** |

**UNRESOLVED_P0=0, UNRESOLVED_P1=0**

### Legacy aggregate (superseded — do not use)

| Severity | Count |
|----------|------:|
| P0 | 2 |
| P1 | 3 |
| P2 | 3 |
| P3 | 1 |

*This table lacked explicit finding IDs and incorrectly assigned P0 without register entries.*

---

## 11. Post-review main reconciliation (Phase 2B.2)

| Field | SHA |
|-------|-----|
| **REVIEWED_RUNTIME_SHA** | `da959784f835a31482852d506daa137c90389b87` |
| **POST_REVIEW_HEAD_SHA** | `6e9e65c63610ba64fdc08f8fa671b3330a9c335a` |
| **CURRENT_MAIN_AT_RECONCILE** | `814a7e00924474d95622e4ff67b0c2b86d0712ef` |
| **POST_RECONCILE_HEAD_SHA** | `f4e00e58f0e711402c4fe9fbbbce78738b24ca44` |

**Main delta:** #1487 P1.8.3.1 scaling deploy leader convergence — **EED_RUNTIME_RELEVANT=0 files**.

**Conclusion:** Phase 2B.1 reconstruction remains valid. No EED graph semantic updates required for #1487.

**Closure artifact:** `architecture/KG_EED_FINAL_AUTHORITY_CLOSURE_2026-09-01.md`

---

## 12. Merge recommendation (supersedes §9 for 2B.2 gate)

### **APPROVE_WITH_DOCUMENTED_OPEN_QUESTIONS** (Phase 2B.1)

**Phase 2B.2 final gate:** `READY_TO_MERGE` — see `architecture/KG_EED_FINAL_AUTHORITY_CLOSURE_2026-09-01.md`

**CANONICAL_AUTHORITY_CONFIDENCE:** `MEDIUM`
