# Document Driver Candidate Resolver (V4.9.630)

**Date:** 2026-07-17  
**Prompt:** 55/84 — Tenant-safe driver candidate resolution separate from customer resolver

## Inputs

| Signal | Source |
|--------|--------|
| Expliziter Booking Driver | `assignedDriverId` + `BookingAllowedDriver` PRIMARY role |
| Zusätzlicher Fahrer | `BookingAllowedDriver` ADDITIONAL role |
| Führerscheindaten | `licenseNumber` / `driverLicenseNumber` → `licenseNumberNormalized` (exact, no raw value in hints) |
| Name | `driverName` / `lesseeName` / `additionalDriverName` (not `customerName`) |
| Driver-ID | `driverId` / `driverCustomerId` (UUID) |
| Trip-/Booking-Zuordnung | `VehicleTrip.actualDriverId` / `assignedDriverId` for linked booking + offense date |
| Upload-Kontext | OptionalContext `DRIVER` only (separate from `CUSTOMER`) |

## Output per candidate

```json
{
  "driverCustomerId": "…",
  "confidence": 0.92,
  "matchReasons": ["LICENSE_EXACT"],
  "conflicts": [],
  "rank": 1,
  "confirmationRequired": true,
  "displayLabel": "Fahrer AF",
  "driverRole": "PRIMARY"
}
```

Stored in `plausibility._pipeline.driverCandidates` with `ambiguousDriverPool`, `unassignedDriver`, and `autoConfirmEligible: false`.

## Rules

1. **Booking customer ≠ driver** — contract holder (`booking.customerId`) is never a driver candidate unless explicitly in the allowed driver pool.
2. **Ambiguous driver pool** — multiple `allowedDriverIds` without unique strong signal → all pool drivers visible with `AMBIGUOUS_DRIVER_POOL` conflict.
3. **FINE unassigned** — `unassignedDriver: true` when no unique strong match; no automatic driver link on apply.
4. **No negative driver history** — resolver suggests candidates only; no side effects on driver records or attribution.
5. **Confirmation required** — all candidates require manual confirmation via `acceptedEntityLinks` (`entityType: 'driver'`).
6. **PII minimized** — pipeline hints use `*Present` flags; `displayLabel` uses initials only.
7. **Tenant scope** — org-scoped `Customer` + `Booking` + `VehicleTrip` queries.

## Integration

```text
DocumentExtractionProcessor.runExtraction
  → after customerCandidates
  → when organizationId + documentType ∈ {FINE, ACCIDENT, DAMAGE}
  → DriverCandidateResolverService.resolve
  → mergePipelinePlausibility({ driverCandidates })
```

Upload context split:
- `CUSTOMER` → customer resolver only
- `DRIVER` → driver resolver only

Public DTO: `driverCandidates: PublicDriverCandidateDto[] | null`.

## Tests

- `driver-candidate-matching.util.spec.ts` — primary license, additional name, company customer exclusion, ambiguous pool, PII-safe hints
- `driver-candidate-resolver.service.spec.ts` — tenant-scoped Prisma, ambiguous pool, unassigned FINE
