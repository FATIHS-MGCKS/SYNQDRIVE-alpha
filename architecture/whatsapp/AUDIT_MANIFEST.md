# WhatsApp Business — Audit Manifest

| Field | Value |
|-------|-------|
| **Baseline SHA** | `9fef3a9fa2c3b8d5abf3d3e44947e303574b16d1` |
| **Workstream** | POST-P6-BOUNDARY-PR2 whatsapp booking operational read port |
| **Repository audit** | **PARTIAL** — four `BookingsService` consumers migrated |
| **Production audit** | **NOT_STARTED** — VPS access not exercised in PR2 |
| **Promotion** | **NOT** `AUTHORITY_ACTIVE` |

## Residual Core → Rental couplings

| Dependency | Status |
|------------|--------|
| `BookingDocumentBundleService` | Retained (documents) |
| `DamagesService` (VI) | Retained on conversation context |
| `prisma.booking` active-booking lookup | Retained in AI/context loaders |