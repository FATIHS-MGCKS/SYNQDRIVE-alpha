# Document Damage & Accident Apply Executor (V4.9.615)

**Date:** 2026-07-17  
**Prompt:** 40/84 — Idempotent executors for DAMAGE / ACCIDENT

## Scope

| Module | Role |
|--------|------|
| `document-damage-extraction.rules.ts` | `buildDamageDraftPayload()` — UNKNOWN type/severity preserved in payload |
| `document-action-planner.damage-rules.ts` | Existing damage plan (CREATE_DAMAGE_DRAFT / RECORD / LINK) |
| `damages.service.ts` | Idempotent draft/create/link/record via `documentExtractionId` |
| Executors | `CREATE_DAMAGE_DRAFT`, `CREATE_DAMAGE_RECORD`, `LINK_EXISTING_DAMAGE` |
| Prisma `VehicleDamage.documentExtractionId` | Tenant-unique extraction linkage |

## Rules

1. **Idempotent by extraction** — unique `(organizationId, documentExtractionId)`; retry returns existing damage case.
2. **Confirmed values unchanged** — apply record uses confirmed type/severity/description; no SCRATCH/MODERATE defaults.
3. **UNKNOWN preserved** — draft maps type UNKNOWN → Prisma `OTHER` with `[extraction-uncertain:...]` liability note; `locationView` stays `UNKNOWN`.
4. **Link existing case** — appraisal/link candidate via `linkCandidateId`; optional `LINK_EXISTING_DAMAGE` action; draft passes `linkExistingDamageId` when candidate present.
5. **Accident draft-only** — `CREATE_DAMAGE_RECORD` blocked until `accidentApplyConfirmed`; only draft shell created.
6. **Duplicate detection** — orchestrator loads vehicle damages + `duplicateDamageId` into plan context; blocked plans cannot execute.
7. **Result entity IDs** — `damage` stored on action execution records; `damageId` on apply result.
8. **Legacy removal** — `applyDamageReport` removed from apply service.

## Confirm / apply wiring

- `DAMAGE`, `ACCIDENT` route through `DocumentActionOrchestratorService`.

## Tests

- `document-damage-extraction.rules.spec.ts` — `buildDamageDraftPayload`
- `damages.service.spec.ts` — retry, parallel race, link existing case
- `executors/create-damage-document-action.executor.spec.ts`
