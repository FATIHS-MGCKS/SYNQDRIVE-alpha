# Legal Documents — Central Resolver (Prompt 8/32)

**Date:** 2026-07-22  
**Scope:** Deterministic legal document resolution for concrete booking/process contexts.

## Disclaimer

SynqDrive executes administratively approved legal text rules. It does not provide legal advice or silently assume German as the customer language.

## Resolver contract

### Entry points

| Method | Description |
|--------|-------------|
| `LegalDocumentResolverService.resolve(input)` | Resolve from explicit `LegalDocumentResolverInput` |
| `LegalDocumentResolverService.resolveForBooking(orgId, bookingId, overrides?)` | Load booking + org hints, then resolve |

Existing callers (`getActiveByType`, bundle attach) are **not** replaced in this prompt.

### Input (`LegalDocumentResolverInput`)

| Field | Required | Notes |
|-------|----------|-------|
| `organizationId` | yes | Tenant scope |
| `bookingId` | no | Loads customer/station hints |
| `customerLanguage` | recommended | No silent `de` — use org language via documented fallback |
| `customerSegment` | no | `B2C` / `B2B`; derived from `Customer.customerType` when booking loaded |
| `jurisdiction` | no | ISO 3166-1 alpha-2; fallback chain documented |
| `bookingChannel` | no | Defaults to `MANUAL` with `fallbackDecisions` entry |
| `productScope` | no | `BusinessType`; defaults from org |
| `stationId` | no | From booking `pickupStationId` when omitted |
| `effectiveTimestamp` | no | Default `booking.createdAt` or `now` |
| `documentTypes` | no | Default: all `LEGAL_DOCUMENT_TYPES` |

### Output (`LegalDocumentResolverResult`)

| Field | Description |
|-------|-------------|
| `resolverVersion` | `legal-document-resolver-v1` |
| `evaluatedAt` | ISO timestamp |
| `evaluatedContext` | Normalized context used for matching |
| `selectedDocuments` | Winners per type with `selectionReason` + `scopeFingerprint` |
| `missingMandatoryDocuments` | Structured gaps (`MISSING_MANDATORY`) |
| `conflicts` | Ambiguous rules (`SCOPE_CONFLICT`) |
| `fallbackDecisions` | Transparent fallback trail |
| `errors` | Blocking issues (language, jurisdiction, conflicts) |
| `isComplete` | `true` when all mandatory types resolved without blocking errors |

### Selection reasons

- `SINGLE_MATCH` — one candidate
- `HIGHEST_PRIORITY_MATCH` — deterministic priority winner
- `ORGANIZATION_WIDE_FALLBACK` — station cleared, org-wide rule selected

## Priority rules

1. Only `ACTIVE` documents within `validFrom`/`validUntil` at `effectiveTimestamp`
2. Scope dimensions must match (language, jurisdiction exact; segment/channel/product/station via overlap rules)
3. Among matches: highest `priority` wins
4. Tie on priority: lower `id` (lexicographic) wins — deterministic, no `findFirst`
5. Same priority + overlapping scope → `SCOPE_CONFLICT` (no selection)

## Error codes

| Code | Meaning |
|------|---------|
| `LEGAL_DOCUMENT_RESOLVER_MISSING_LANGUAGE` | No explicit or org language |
| `LEGAL_DOCUMENT_RESOLVER_UNSUPPORTED_LANGUAGE` | Invalid language code |
| `LEGAL_DOCUMENT_RESOLVER_UNSUPPORTED_JURISDICTION` | No document for jurisdiction |
| `LEGAL_DOCUMENT_RESOLVER_SCOPE_CONFLICT` | Ambiguous overlapping rules |
| `LEGAL_DOCUMENT_RESOLVER_MISSING_MANDATORY` | Mandatory type not resolved |
| `LEGAL_DOCUMENT_RESOLVER_BOOKING_NOT_FOUND` | Invalid `bookingId` |

## Fallback behaviour

Configured in `LEGAL_DOCUMENT_RESOLVER_FALLBACK_POLICY`:

| Field | Fallback order |
|-------|----------------|
| Language | explicit → organization.language (**never silent `de`**) |
| Jurisdiction | explicit → customer.country → org.country → derive from language |
| Booking channel | explicit → default `MANUAL` (logged) |
| Customer segment | explicit → `INDIVIDUAL`→B2C / `CORPORATE`→B2B |
| Product scope | explicit → `organization.businessType` |
| Station | explicit → `booking.pickupStationId` |

## Excluded statuses

Not considered for resolution: `DRAFT`, `IN_REVIEW`, `APPROVED`, `SCHEDULED`, `SUPERSEDED`, `REVOKED`, `ARCHIVED`.

## Test results

| Suite | Tests |
|-------|-------|
| `legal-document-resolver.engine.spec.ts` | 15 |
| `legal-document-resolver.context.spec.ts` | 4 |
| **Total resolver** | **19 passed** |
| All `legal-document*` suites | 98 passed |

Scenarios covered: German B2C web, English B2B, manual channel, missing language, unsupported jurisdiction, overlapping rules, future/expired/revoked versions, station-specific vs org-wide, B2B/B2C separation.

## Files

- `legal-document-resolver.service.ts` — Nest entry + Prisma loader
- `legal-document-resolver.engine.ts` — pure resolution
- `legal-document-resolver.matching.ts` — scope matching predicates
- `legal-document-resolver.context.ts` — context + fallbacks
- `legal-document-resolver.constants.ts` — version, error codes, policy

## Follow-up (Prompt 9+)

- Wire `BookingDocumentBundleService` to resolver (remove hardcoded `'de'`)
- Optional `GET …/legal-documents/resolve` API
- Persist resolver trace on bundle generation
