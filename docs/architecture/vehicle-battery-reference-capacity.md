# Vehicle Battery Reference Capacity API

Prompt 56/78. Managed HV reference capacity records with verification workflow — **no SOH calculation activation**.

## Allowed sources (API create)

- `MANUFACTURER_VERIFIED`
- `VIN_DECODED_VERIFIED`
- `BMS_REPORT`
- `WORKSHOP_DOCUMENT`
- `VERIFIED_VEHICLE_SPEC`
- `MANUAL_VERIFIED`

Legacy enum values (`VEHICLE_MASTER`, `DIMO_NOMINAL_SIGNAL`, …) are **not** accepted via API.

## Fields

| Field | Notes |
|-------|-------|
| `capacityKwh` | Positive kWh |
| `capacityType` | `USABLE`, `USABLE_NET`, `NET`, `WORKSHOP_MEASURED` for assessment-compatible specs |
| `source` | Whitelist above |
| `verificationStatus` | Always `UNVERIFIED` on create — no auto-verify |
| `documentId` / `serviceEventId` | Evidence references |
| `verifiedByUserId` / `verifiedAt` | Set only via verify endpoint |
| `notes` | Free text |

## Rules

- KS FH 660E **57 kWh** from registration stays `UNVERIFIED` until explicit verify with evidence
- No auto-verify from vehicle model or internet assumptions
- Supersede-on-replace — active row deactivated, never silent overwrite
- Full audit trail in `vehicle_battery_reference_capacity_changes`

## API

Base: `/organizations/:orgId/vehicles/:vehicleId/battery-reference-capacity`

| Method | Path | Permission |
|--------|------|------------|
| GET | `/` | `fleet-condition.read` |
| GET | `/history` | `fleet-condition.read` |
| GET | `/audit` | `fleet-condition.read` |
| POST | `/` | `fleet-condition.write` |
| POST | `/:id/verify` | `fleet-condition.manage` |
| PATCH | `/:id/notes` | `fleet-condition.write` |

## Files

- `reference-capacity/vehicle-battery-reference-capacity.*`
- `battery-assessment` unchanged — SOH not activated
