# Document Entity Candidate Ranking Policy (V4.9.632)

**Date:** 2026-07-17  
**Prompt:** 57/84 — Central ranking policy across entity candidate resolvers

## Scope

Unifies ranking for:

- Vehicle
- Booking
- Customer
- Driver
- Partner (Vendor)

## Per-candidate output (`entityCandidateRanking.candidates[]`)

```json
{
  "entityType": "VEHICLE",
  "entityId": "…",
  "ranking": {
    "score": 1.0,
    "confidenceLevel": "HIGH",
    "positiveReasons": ["VIN_EXACT"],
    "negativeReasons": [],
    "conflicts": [],
    "rank": 1,
    "autoSelectEligibility": true
  }
}
```

Pipeline root:

```json
{
  "rankingVersion": "1.0.0",
  "documentType": "FINE",
  "preselectionBlocked": false,
  "preselectionBlockedReason": null,
  "candidates": []
}
```

Stored in `plausibility._pipeline.entityCandidateRanking`.

## Rules

1. **No automatic confirmation** — `autoSelectEligibility` is preselection only, never apply/auto-link.
2. **HIGH = preselection** — `confidenceLevel: HIGH` (score ≥ 0.85 after weighting).
3. **Context conflict visible** — upload context `CONFLICT` → `CONTEXT_CONFLICT` negative reason + `preselectionBlocked`.
4. **Multiple above threshold** — more than one HIGH candidate per entity type → all `autoSelectEligibility: false`.
5. **Document-type weighting** — per-entity multipliers (e.g. INVOICE boosts PARTNER, FINE boosts DRIVER).
6. **Ranking version** — `ENTITY_CANDIDATE_RANKING_VERSION` (`1.0.0`) persisted.
7. **Machine-readable reasons** — `positiveReasons` from match codes; `negativeReasons` from `NEGATIVE_REASON_CODES`.

## Integration

```text
DocumentExtractionProcessor.runExtraction
  → after partnerCandidates
  → buildEntityCandidateRankingFromPipeline
  → mergePipelinePlausibility({ entityCandidateRanking })
```

Public DTO: `entityCandidateRanking: PublicEntityCandidateRankingDto | null`.

## Tests

- `entity-candidate-ranking.policy.spec.ts` — vehicle, booking, customer, driver, partner scenarios
