# Document Service & Inspection Apply Executor (V4.9.614)

**Date:** 2026-07-17  
**Prompt:** 39/84 — Idempotent executors for SERVICE, OIL_CHANGE, TÜV, BOKRAFT

## Scope

| Module | Role |
|--------|------|
| `document-service-extraction.rules.ts` | Service/oil apply gate + payload (explicit `eventDate`, no defaults) |
| `document-inspection-extraction.rules.ts` | `buildInspectionApplyPayload()` — confirmed `validUntil` only |
| `document-action-planner.service-rules.ts` | `CREATE_SERVICE_EVENT` + `REFRESH_VEHICLE_SERVICE_HISTORY` |
| `document-action-planner.inspection-rules.ts` | Existing compliance plan (unchanged semantics) |
| `service-events.service.ts` | Idempotent create + compliance/history vehicle updates |
| Executors | `CREATE_SERVICE_EVENT`, `CREATE_COMPLIANCE_SERVICE_EVENT`, `UPDATE_VEHICLE_COMPLIANCE_DATES`, `REFRESH_VEHICLE_SERVICE_HISTORY` |
| Prisma `VehicleServiceEvent.documentExtractionId` | Tenant-unique extraction linkage |

## Rules

1. **Idempotent by extraction** — unique `(organizationId, documentExtractionId)`; retry returns existing service event.
2. **No default dates** — `eventDate` required; no `new Date()` fallback on apply.
3. **Confirmed validUntil** — vehicle compliance update only when explicit `validUntil` resolves; missing validity → archive-only plan (no compliance action).
4. **Split actions** — service event create separate from vehicle update; partial failure recoverable on retry without duplicate events.
5. **Idempotent vehicle updates** — compliance dates skip when already applied; service history refresh via `refreshVehicleHistoryDenorm`.
6. **Result entity IDs** — `serviceEvent` + `vehicle` stored on action execution records; `serviceEventId` on apply result.
7. **Legacy removal** — `applyServiceEvent` / `applyInspectionReport` removed from apply service.

## Confirm / apply wiring

- `SERVICE`, `OIL_CHANGE`, `TUV_REPORT`, `BOKRAFT_REPORT` route through `DocumentActionOrchestratorService`.

## Tests

- `document-service-extraction.rules.spec.ts`
- `document-action-planner.service-rules.spec.ts`
- `document-inspection-extraction.rules.spec.ts` — `buildInspectionApplyPayload`
- `service-events.service.spec.ts` — retry, race, partial failure between event + vehicle update
- `executors/create-service-document-action.executor.spec.ts`
