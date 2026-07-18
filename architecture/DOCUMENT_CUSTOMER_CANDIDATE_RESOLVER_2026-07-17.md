# Document Customer Candidate Resolver (V4.9.629)

**Date:** 2026-07-17  
**Prompt:** 54/84 — Tenant-safe customer candidate resolution from document signals

## Inputs

| Signal | Source |
|--------|--------|
| Kundennummer | `customerNumber` / `customerReference` / UUID `customerId` / `taxId` / `idNumberNormalized` |
| Booking-Link | `linkedBookingId` → booking.customerId |
| Normalisierter Name | `customer` / `customerName` (exact normalized match only) |
| Anschrift | `address` / `street` + `city` + `zip` |
| E-Mail | `email` / `customerEmail` |
| Telefonnummer | `phone` / `customerPhone` / `telephone` |
| Dokumentreferenz | `invoiceNumber` / `reportNumber` (hints only) |
| Upload-Kontext | OptionalContext `CUSTOMER` / `DRIVER` |

## Output per candidate

```json
{
  "customerId": "…",
  "confidence": 0.88,
  "matchReasons": ["EMAIL_EXACT"],
  "conflicts": [],
  "rank": 1,
  "confirmationRequired": true,
  "displayLabel": "Kunde MM"
}
```

Stored in `plausibility._pipeline.customerCandidates` with `ambiguousNameMatch` and `autoConfirmEligible: false`.

## Rules

1. **Booking-Link > Name** — `BOOKING_LINK` (0.93) outranks `NAME_EXACT` (0.62); name never alone produces a candidate.
2. **No aggressive fuzzy** — exact normalized email/phone/name/address only; no Levenshtein or partial name match.
3. **Duplicate names visible** — when multiple customers share the same normalized name, all name matches remain visible with `DUPLICATE_NAME` conflict.
4. **PII not in logs/pipeline hints** — public hints use `*Present` flags only; `displayLabel` uses initials, no raw email/name/phone.
5. **No auto-create / no auto-contact** — resolver never creates customers or triggers outreach.
6. **Candidate vs confirmed link** — results are suggestions only; `acceptedEntityLinks` remains the confirmed path.
7. **Tenant scope** — all queries filter `organizationId` + `ACTIVE` + `archivedAt: null`.

## Integration

```text
DocumentExtractionProcessor.runExtraction
  → after bookingCandidates
  → when organizationId + documentType ∈ {FINE, INVOICE, DAMAGE, ACCIDENT, OTHER}
  → CustomerCandidateResolverService.resolve
  → mergePipelinePlausibility({ customerCandidates })
```

Public DTO: `customerCandidates: PublicCustomerCandidateDto[] | null`.

## Tests

- `customer-candidate-matching.util.spec.ts` — unique email, duplicate names, booking-link priority, name-only guard, PII-safe hints
- `customer-candidate-resolver.service.spec.ts` — tenant-scoped Prisma, booking link resolution, ambiguous names
