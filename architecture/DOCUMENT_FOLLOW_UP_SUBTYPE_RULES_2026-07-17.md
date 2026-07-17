# Document Follow-Up Subtype Rules (V4.9.651)

Date: 2026-07-17  
Prompt: 76/84 — Versionierte Regeln für passende Folgeaktionen

## Goal

Versioned, subtype-specific follow-up suggestion rules with explicit German titles, rationale, and suggestion types — no irrelevant proposals, no automatic execution.

## Rules version

`DOCUMENT_FOLLOW_UP_RULES_VERSION = 1.0.0`

## Subtype catalogs

| Subtype group | Example follow-ups |
|---------------|-------------------|
| `FINE_NOTICE` | Fahrerzuordnung, Frist-Task, Kundenkontakt |
| `INVOICE` | Freigabe, Zahlungstermin, Anbieterzuordnung |
| `TUV_REPORT` / `BOKRAFT_REPORT` | Mängelbeseitigung, Wiedervorlage |
| `DAMAGE_REPORT` / `ACCIDENT_REPORT` | Fahrzeugprüfung, Versicherung, Kundenkontakt |
| `SERVICE_REPORT` | Nächster Service, Kilometerfrist |
| `OTHER` / `PAYMENT_PROOF` | Zuständige Person, Frist prüfen, Archivieren |

## Architecture

1. **Catalog** — `document-follow-up-subtype-rules.catalog.ts` (static rules, no schema cycle)
2. **Evaluator** — `document-follow-up-subtype-rules.ts` (`evaluateVersionedFollowUpTrigger`)
3. **Generator** — registry rules first (dedupe by type), semantic actions second, always offers `Keine Folgeaktion`
4. **Service** — `generateForPlan` prefers versioned catalog rules per `documentSubtype`
5. **Resync** — `DocumentFollowUpResyncService` rebuilds preview plan + `syncForActionPlan` after field review, preference change, entity-link change

## Rules enforced

- Trigger must match confirmed data (entity links, deadlines, defects, insurance context, etc.)
- Every suggestion has `title` + `rationale` (no empty justification)
- `NO_FOLLOW_UP` always available when other suggestions exist
- Never auto-executes — user accept/dismiss only
- Plan invalidation supersedes open suggestions; resync recalculates from preview plan

## Tests

- `document-follow-up-subtype-rules.spec.ts` — per subtype group
- Updated `document-follow-up-suggestion.generator.spec.ts`

## Files

- `document-follow-up-subtype-rules.catalog.ts`
- `document-follow-up-subtype-rules.ts`
- `document-follow-up-resync.service.ts`
- Generator + service + entity-link/extraction wiring
