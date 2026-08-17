# Phase 3 E7B.1 — Recommendation Authority Conformance Hardening (2026-08)

## Status

- **Machine status:** `CI_E7B1_RECOMMENDATION_AUTHORITY_CONFORMANCE_HARDENING_COMPLETED`
- **Branch:** `integration/evaluations-e7-recommendations-actions-2026-08`
- **Draft PR:** #1055
- **Entry HEAD:** `82fa8c46` (E7B complete)

## Purpose

Independent post-E7B review found fail-closed semantics gaps. E7B.1 closes them without redesign, new families, persistence, or E8/E9 scope.

---

## Remediations

### 1. Finance exact AVAILABLE gate

- `readFinanceMoney()` requires metric `status === 'AVAILABLE'` only.
- PARTIAL / STALE / UNAVAILABLE / ERROR / NOT_APPLICABLE suppress Finance recommendations.

### 2. Open vs overdue receivables

- `OPEN_RECEIVABLES_SOURCE = fin.open_receivables` (E3 canonical non-overdue population).
- `OVERDUE_OPEN_POPULATIONS_DISTINCT = true`
- When overdue > 0, `OPEN_RECEIVABLES_REVIEW` suppressed with reason **UI_ACTION_SUPERSESSION** (same Finance surface), not same-money conflation.

### 3. Driver exact gate

- Requires `driverInfluence.status === 'AVAILABLE'`
- Requires `factors.length > 0`
- Requires `piiTier !== 'none'`
- No driverRef in recommendation payload.

### 4. Cost PARTIAL-only authority

- `COST_EVIDENCE_INCOMPLETE` emits only when `costModel.status === 'PARTIAL'` AND canonical incomplete evidence (unsupported categories or reason).
- `costModel.status === 'UNAVAILABLE` suppresses cost recommendation entirely.

### 5. Source-scoped quality limitations

- `qualityLimitationsForSections(quality, sourceSections)` attached to recommendation provenance.
- Structural FRESHNESS UNKNOWN preserved in provenance; VALIDITY UNKNOWN not standalone-actionable.

### 6. Source-scoped quality supersession

- `COST_EVIDENCE_INCOMPLETE` covers only `costModel` limitation keys.
- `DETECTION_INPUT_SKIPPED` covers only `strengths` / `weaknesses` limitation keys.
- Independent limitations still emit `DATA_QUALITY_LIMITED`.

### 7. Empty-state fail-closed

- `NO_ACTION_NEEDED` only when `collectionStatus === 'AVAILABLE'` and zero recommendations.
- PARTIAL / STALE / UNAVAILABLE / ERROR with zero recommendations → `INSUFFICIENT_EVIDENCE`.

### 8. Discriminated action targets + runtime validation

- `E7ActionTarget` is a discriminated union (`EVALUATIONS_SECTION`, `APPLICATION_ROUTE`, `ENTITY_REFERENCE`).
- `assertValidE7ActionTarget()` fail-closed at finalization.

---

## Tests

| Suite | Count |
|-------|-------|
| `evaluations-recommendations.derive.e7b1.spec.ts` | 31 |
| All E7 + E5 equivalence | 77 pass |
| HTTP security integration (explicit) | 9 pass |
| `npm run test:evaluations` | 629 pass; 2 pre-existing `tire-critical.detector.spec.ts` failures on `origin/main` |

---

## Orchestration preserved

| Counter | Result |
|---------|--------|
| `E7_E4_SUMMARY_CALL_COUNT` | 1 |
| `E7_DIRECT_E3_FINANCE_CALL_COUNT` | 0 |
| `E7_E5_SECOND_SUMMARY_CALL_COUNT` | 0 |

---

## Next

**E7C** — frontend Recommendations / Actions integration.
