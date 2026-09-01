# KG-EED Changelog

## 2026-09-01 — Phase 2B.1 independent authority review

**Reviewer:** adversarial gate (not implementation agent)  
**Pre-review SHA:** `cc2ff60f01d0499aaa9078ad77f601ef98696bd3`  
**Artifact:** `architecture/KG_EED_INDEPENDENT_AUTHORITY_REVIEW_2026-09-01.md`

### Corrections

- Added `authority_review` gate to `GRAPH.yaml`
- Split KS MX provenance: `EED-EV-0018` (fixture/TEST) + `EED-EV-0025` (production/P1.3-S6)
- Downgraded epistemic inflation on EED-EV-0016/0019/0021/0022 and `EED-EXT-003`
- Added `EED-ST-001` (current scheduler coupling fact), `EED-FB-001` (optional inject skip), `EED-COMP-008` (fuel station enqueue)
- Strengthened `validate-graph.mjs` with epistemic and authority-gate checks
- Corrected open-question accounting in `OPEN_QUESTIONS.md`

### Verdict

`APPROVE_WITH_DOCUMENTED_OPEN_QUESTIONS` — ready for human merge review

---

## 2026-09-01 — Phase 2B canonicalization (initial)

**Base SHA:** `da959784f835a31482852d506daa137c90389b87` (main after KG-ATE PR #1484 merge)

### Created

- `architecture/knowledge-graphs/energy-event-detection/` full canonical structure
- `GRAPH.yaml`, `graph/schema.yaml`, `graph/nodes.yaml`, `graph/edges.yaml`, `graph/invariants.yaml`
- Governance: `AGENT_PROTOCOL.md`, `AUTHORITY_BOUNDARIES.md`
- `decisions/DECISIONS.md` (12 decisions)
- `evidence/EVIDENCE_REGISTRY.md` (24 evidence nodes)
- `open-questions/OPEN_QUESTIONS.md` (12 classified)
- `scripts/validate-graph.mjs`
- `architecture/KG_EED_CANONICALIZATION_2026-09-01.md`

### Discovery audit

| Action | Count |
|--------|------:|
| Discovery components referenced | 52 |
| Canonicalized as operational nodes | 58 |
| Evidence nodes created | 24 |
| Decision nodes | 12 |
| Invariants | 13 |
| Edges | 97 |
| Open questions | 12 |

### Verified / corrected from discovery

- **CONFIRMED:** minIncreasePercent 5, coalesce 300s/1800s, persist gate liters>1.0, mechanism isolation
- **CONFIRMED:** KS MX 4818s from DIMO envelope; coalesce single-segment pass-through; 685s sibling reconcile
- **CONFIRMED:** ATE step 5 MAY_TRIGGER only; EED owns semantics (ATE-EXT-006 reciprocal)
- **POLICY RESOLVED:** No historical backfill (EED-DEC-009 / EED-OQ-002)
- **DEFERRED:** FM-007 and ATE multi-replica — referenced only, not expanded

### Not changed

- Application runtime code
- Production data
- KG-ATE canonical graph (no cross-authority corrections required)

### Validation

- `node architecture/knowledge-graphs/energy-event-detection/scripts/validate-graph.mjs` — see canonicalization report
