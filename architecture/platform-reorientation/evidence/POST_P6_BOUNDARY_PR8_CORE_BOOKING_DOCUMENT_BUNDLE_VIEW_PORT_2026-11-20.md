# POST-P6-BOUNDARY-PR8 — Core booking document bundle view port (V-P1-03)

**Base:** `8b95e5e262dbb16651b011af78e2cdeabd416352`

| Layer | Artifact |
|-------|----------|
| Core contract | `platform-channels/ports/core-booking-document-bundle-view.port.ts` (`CORE_BOOKING_DOCUMENT_BUNDLE_VIEW_PORT`) |
| Rental adapter | `documents/core-booking-document-bundle-view/*` |
| Consumers migrated | `communication-quick-action.executor`, `whatsapp-ai-tools`, `whatsapp-booking-reminder`, `whatsapp-conversation-context` |

**Removed:** direct `BookingDocumentBundleService` injection in the four confirmed Core platform consumers.

**Preserved:** single `getBundleView(organizationId, bookingId)` delegation per call site (underlying `getOrCreateBundle` write semantics unchanged); missing-document messaging, template gating, AI tool output shape, conversation-context try/catch null fallback.

**Narrow DTO:** `bundleStatus`, `missingLegalDocuments`, `legalMissing`, `warnings` only — no customer PII, document bytes, or download URLs.

**Residual (out of scope):** other modules still inject `BookingDocumentBundleService` directly (bookings, tasks outbox, invoices, documents controller, etc.) — not claimed closed.

**Registry:** Communication / WhatsApp remain `AUDIT_IN_PROGRESS`; Documents `NOT_STARTED`; Bookings `AUDIT_IN_PROGRESS`.

**V-P1-03 verdict (this PR):** remediated for **four-consumer direct-injection scope** only.