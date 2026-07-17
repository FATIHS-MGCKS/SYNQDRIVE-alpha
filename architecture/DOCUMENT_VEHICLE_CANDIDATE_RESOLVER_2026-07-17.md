# Document Vehicle Candidate Resolver (V4.9.627)

**Date:** 2026-07-17  
**Prompt:** 52/84 — Tenant-safe vehicle candidate resolution from OCR signals

## Signals

| Signal | Source |
|--------|--------|
| Kennzeichen | `extractedData.licensePlate` |
| VIN | `extractedData.vin` |
| Marke/Modell | `extractedData.make` / `model` |
| Interne Flottennummer | `fleetNumber`, `vehicleNumber`, `vehicleName` → `Vehicle.vehicleName` |
| Dokumentkontext | OptionalContext candidate `VEHICLE` |
| Buchungsreferenz | `bookingReference` / `bookingId` → `Booking.vehicleId` |

OCR uncertainty from `fieldEvidence.conflict` on `vin` / `licensePlate` lowers confidence and marks fuzzy plate matches.

## Output per candidate

```json
{
  "vehicleId": "…",
  "confidence": 0.98,
  "matchReasons": ["VIN_EXACT"],
  "conflicts": [],
  "rank": 1,
  "confirmationRequired": false
}
```

Stored in `plausibility._pipeline.vehicleCandidates` with `hints`, `blockerPresent`, `autoConfirmEligible: false`.

## Ranking rules

1. **VIN exact** (0.98) ranks above **license plate exact** (0.82).
2. Plates and VINs are normalized (`[\s\-._/]` stripped, uppercase).
3. OCR uncertainty downgrades plate to `LICENSE_PLATE_FUZZY` (0.68).
4. **BLOCKER** when OCR VIN and OCR plate resolve to different vehicles in the same org (`VEHICLE_CANDIDATE_VIN_PLATE_MISMATCH` plausibility check).
5. **No auto-confirmation** — `autoConfirmEligible` is always `false`; multiple plausible candidates set `confirmationRequired: true` on each.
6. **Zero candidates** is valid (org inbox without matching fleet data).

## Integration

```text
DocumentExtractionProcessor.runExtraction
  → when organizationId && !vehicleId
  → VehicleCandidateResolverService.resolve
  → mergePipelinePlausibility({ vehicleCandidates })
  → optional BLOCKER plausibility check
```

Public DTO: `vehicleCandidates: PublicVehicleCandidateDto[] | null`.

## Tests

- `vehicle-candidate-matching.util.spec.ts` — 0 / 1 / multiple candidates, BLOCKER, OCR uncertainty
- `vehicle-candidate-resolver.service.spec.ts` — tenant-scoped Prisma wiring, booking reference
