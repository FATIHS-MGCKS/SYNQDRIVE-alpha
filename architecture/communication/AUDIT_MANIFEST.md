# Communication Center — Audit Manifest

| Field | Value |
|-------|-------|
| **Baseline SHA** | `3011084491b4b4d2b593cc3845369232b0511721` (`origin/main` at PR1 start) |
| **Workstream** | POST-P6-BOUNDARY-PR1 communication booking snapshot port |
| **Repository audit** | **PARTIAL** — `communication-quick-action.executor.ts`, module imports, port/adapter wiring |
| **Production audit** | **NOT_STARTED** — blocker: scoped PR1; full VPS read deferred to authority completion |
| **Promotion** | **NOT** `AUTHORITY_ACTIVE` in this PR |

## Repository surfaces reviewed

| Path | Notes |
|------|-------|
| `backend/src/modules/communication/ops/communication-quick-action.executor.ts` | Removed direct `BookingsService` |
| `backend/src/modules/communication/ports/communication-booking-snapshot-read.port.ts` | Core-owned contract |
| `backend/src/modules/bookings/communication-booking-snapshot-read/*` | Rental adapter |

## Residual Core → Rental couplings (documented)

| Dependency | Status |
|------------|--------|
| `BookingDocumentBundleService` (documents) | **Retained** in quick-action executor |
| WhatsApp module services | **Retained** (intra-communication orchestration) |