# Document Booking Candidate Resolver (V4.9.628)

**Date:** 2026-07-17  
**Prompt:** 53/84 — Tenant-safe booking candidate resolution from document signals

## Inputs

| Signal | Source |
|--------|--------|
| Fahrzeug (bestätigt/vorgeschlagen) | `vehicleId` or top `vehicleCandidates[0]` |
| Ereignis-/Dokumentzeit | FINE `eventDate` / INVOICE `invoiceDate` / `eventDateTime` |
| Booking-Nummer | `bookingReference` / `bookingId` (UUID) |
| Kundenname | `customer` / `customerName` (supporting only) |
| Rechnungs-/Fine-Referenz | `invoiceNumber`, `reportNumber` (hints) |
| Dokumentuntertyp | `documentSubtype` / `documentKind` |
| Upload-Kontext | OptionalContext `BOOKING` |

## Output per candidate

```json
{
  "bookingId": "…",
  "confidence": 0.84,
  "matchReasons": ["DATE_OVERLAP"],
  "conflicts": [],
  "temporalOverlap": true,
  "rank": 1,
  "confirmationRequired": true
}
```

Stored in `plausibility._pipeline.bookingCandidates` with `ambiguousOverlap` and `autoConfirmEligible: false`.

## Rules

1. **Tatzeit (FINE)** — `readFineEventDate()` is decisive for temporal overlap.
2. **Date-only** — calendar-day window overlap; confidence penalty (`DATE_ONLY_PENALTY`).
3. **Missing time** — no temporal candidates without strong reference/context; `MISSING_EVENT_TIME` warning.
4. **Overlapping bookings** — multiple `temporalOverlap` matches → `ambiguousOverlap: true`, `OVERLAPPING_BOOKINGS` conflict, `confirmationRequired: true`.
5. **Customer name alone** — never produces a candidate; only boosts score when a strong signal exists.
6. **Statuses** — `ACTIVE`, `COMPLETED`, `CONFIRMED` (aligned with `FinesService.matchBooking`).
7. **Tenant scope** — all queries filter `organizationId` + `vehicleId`.

## Integration

```text
DocumentExtractionProcessor.runExtraction
  → after vehicleCandidates
  → when organizationId + resolvedVehicleId + documentType ∈ {FINE, INVOICE, DAMAGE, ACCIDENT}
  → BookingCandidateResolverService.resolve
  → mergePipelinePlausibility({ bookingCandidates })
```

Public DTO: `bookingCandidates: PublicBookingCandidateDto[] | null`.

## Tests

- `booking-candidate-matching.util.spec.ts` — unique, overlapping, missing time, customer-only guard
- `booking-candidate-resolver.service.spec.ts` — tenant-scoped Prisma, ambiguous overlap
