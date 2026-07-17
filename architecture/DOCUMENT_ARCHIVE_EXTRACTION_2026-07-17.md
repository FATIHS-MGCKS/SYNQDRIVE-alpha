# Document Archive / Correspondence Extraction (V4.9.609)

**Date:** 2026-07-17  
**Prompt:** 34/84 — Safe extraction schemas for non-auto-apply documents

## Scope

| Module | Role |
|--------|------|
| `document-archive-extraction.rules.ts` | Archive field readers, plausibility, apply gate, entity/deadline suggestions |
| `document-action-planner.archive-rules.ts` | Archive-only action plan assessment |

## Document types

Applies to Prisma `DocumentExtractionType` values that are **archive-only**:

- `OTHER`
- `VEHICLE_CONDITION`

Subtype is carried in `archiveSubtype` (alias: `documentKind`, `documentSubtype`).

## Archive subtypes

| Subtype | Example use |
|---------|-------------|
| `AUTHORITY_LETTER` | Behördliches Schreiben |
| `INSURANCE_LETTER` | Versicherungskorrespondenz |
| `CUSTOMER_CORRESPONDENCE` | Kundenkorrespondenz |
| `DRIVER_DOCUMENT` | Fahrer-/Übergabeunterlagen |
| `PAYMENT_PROOF` | Zahlungsnachweis (non-finance auto-apply path) |
| `WORKSHOP_REPORT` | Werkstattbericht ohne Service-Apply |
| `EXPERT_REPORT` | Sachverständigengutachten (link only) |
| `GENERAL_EVIDENCE` | Allgemeiner Nachweis |
| `CONTRACT_DOCUMENT` | Vertragsdokument |
| `UNKNOWN` | Unklare Klassifikation |

## Canonical fields

| Field | Aliases | Notes |
|-------|---------|-------|
| `archiveSubtype` | `documentKind`, `documentSubtype` | `UNKNOWN` when unclear |
| `sender` | `from`, `issuer` | Prefer organization over personal name |
| `recipient` | `to`, `addressee` | Minimize personal data |
| `documentDate` | `eventDate`, `letterDate` | |
| `referenceNumber` | `reportNumber`, `caseNumber` | |
| `subject` | `title` | |
| `deadlines` | `deadlineItems`, `deadline` | JSON array — **suggestion only** |
| `mentionedEntities` | `entityMentions` | JSON array — explicit mentions only |
| `summary` | `description` | |
| `actionRequired` | `requiredAction` | Human note — no auto outreach |

## Rules

1. **Archive and entity links primary** — apply returns `archived: true` plus optional link/deadline suggestions.
2. **No invented domain objects** — no damage, service, invoice, or task records created.
3. **Deadlines suggestion-only** — `SUGGEST_DEADLINE_REMINDER` optional; no automatic tasks.
4. **PII minimization** — warnings for sensitive subtypes with personal identifiers.
5. **Unknown subtype stays UNKNOWN** — never invent a subtype.
6. **No automatic outreach** — planner never emits contact/send actions.

## Apply gate

`assessArchiveApplyGate()` requires minimal metadata (summary, subject, reference, sender, or document date).  
`canApplyDomain` is always `false`.

## Tests

- `document-archive-extraction.rules.spec.ts` — per-subtype fixtures
- `document-action-planner.archive-rules.spec.ts` — archive-only planner per subtype
