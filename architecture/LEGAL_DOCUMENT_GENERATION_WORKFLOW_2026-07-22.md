# Booking Document Generation Workflow — Architecture (2026-07-22)

## Context

Prompt 19/32 replaces fire-and-forget PDF generation with observable BullMQ workflow.

## Components

| Component | Role |
|-----------|------|
| `BookingDocumentGenerationJob` | Durable Prisma workflow state |
| `BookingDocumentGenerationDispatcherService` | Enqueue + idempotent persist |
| `BookingDocumentGenerationProcessorService` | Worker execution + retry classification |
| `BookingDocumentGenerationRecoveryScheduler` | Stale/pending recovery |
| `BookingDocumentBundleService` | Unchanged render/store/idempotent pointers |

## Queue

- Name: `booking.document.generation` (`QUEUE_NAMES.BOOKING_DOCUMENT_GENERATION`)
- Worker: `BookingDocumentGenerationProcessor` (concurrency 2, lock 180s)

## Tenant safety

Worker re-validates `organizationId` + `bookingId` from DB against queue payload before execution.

## Related

- Prompt 16: `BookingDocumentCompletenessService`
- Prompt 17: `RentalContract` legal snapshot
- Prompt 18: `LegalDocumentDeliveryEvidence`
- `docs/audits/legal-documents-generation-workflow-2026-07.md`
