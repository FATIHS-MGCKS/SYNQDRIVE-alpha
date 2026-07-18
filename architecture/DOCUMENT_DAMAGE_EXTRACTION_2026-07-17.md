# Document Damage / Accident Extraction (V4.9.607)

**Date:** 2026-07-17  
**Prompt:** 32/84 — Damage and accident schema + planner hardening

## Scope

| Module | Role |
|--------|------|
| `document-damage-extraction.rules.ts` | Field readers, plausibility, apply gate, duplicate detection, create payload builder |
| `document-action-planner.damage-rules.ts` | Damage/accident/appraisal action plan assessment |

## Canonical fields

| Field | Aliases | Notes |
|-------|---------|-------|
| `eventDateTime` | `eventDate` (+ optional `eventTime`) | Incident timestamp |
| `damageDescription` | `description` | Required for draft/apply |
| `damageAreas` | `damageArea`, `locationLabel` | Must be traceable |
| `damageType` | — | `UNKNOWN` when not stated — no SCRATCH default |
| `severity` | — | `UNKNOWN` when not stated — no MODERATE default |
| `drivable` | `drivableAfterIncident` | |
| `thirdPartyInvolved` | `opponentInvolved` | |
| `policeReference` | `policeReport` | |
| `insuranceReference` | `insuranceClaimNumber` | Suggest-only downstream |
| `bookingContext` | `bookingReference`, `bookingId` | |
| `estimatedCostGross` | `estimatedCost`, `estimatedCostCents` | Optional |
| `accidentApplyConfirmed` | `applyConfirmed` | Required for accident final apply |
| `documentKind` | `GUTACHTEN`, `APPRAISAL`, … | Appraisal mode |
| `linkedDamageId` | — | Gutachten links existing case |

## Rules

1. **No SCRATCH/MODERATE defaults** — apply gate blocks until type/severity are confirmed.
2. **Traceable damage area** — `damageAreas` or `locationLabel` required; missing area is BLOCKER.
3. **Accident draft-first** — `ACCIDENT` creates draft plan until `accidentApplyConfirmed`.
4. **Appraisal/gutachten** — link existing damage candidate; no direct duplicate create.
5. **Duplicate protection** — Prisma query on vehicle damages + `findDuplicateDamageCandidate` before apply.
6. **Vehicle inspection / insurance** — planner suggests only (`SUGGEST_VEHICLE_INSPECTION`, `SUGGEST_INSURANCE_NOTIFICATION`).

## Apply flow

```
applyDamageReport
  → buildDamageCreatePayload
  → prisma.vehicleDamage.findMany (vehicle scoped)
  → findDuplicateDamageCandidate
  → assessDamageApplyGate (+ duplicateDamageId)
  → DamagesService.create (AI_UPLOAD) when canApply
```

## Tests

| Scenario | Fixture | Expected |
|----------|---------|----------|
| Complete damage | `DAMAGE_COMPLETE` | `READY`, apply allowed |
| Incomplete / unknown type | `DAMAGE_INCOMPLETE`, `DAMAGE_UNKNOWN_TYPE` | `DRAFT_ONLY` / blocked apply |
| Accident draft | `ACCIDENT_DRAFT_ONLY` | draft-only until confirmed |
| Accident confirmed | `ACCIDENT_COMPLETE` | `READY` |
| Appraisal | `APPRAISAL_GUTACHTEN` | link candidate, no direct apply |
| Duplicate re-upload | existing + overlapping areas | `DUPLICATE_DAMAGE_CASE` |

Fixtures: `__fixtures__/document-damage-fixtures.ts`
