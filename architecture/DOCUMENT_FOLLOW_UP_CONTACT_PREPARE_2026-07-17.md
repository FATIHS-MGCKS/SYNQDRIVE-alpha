# Document Follow-Up Contact Prepare (V4.9.650)

Date: 2026-07-17  
Prompt: 75/84 — Follow-up „Kontakt vorbereiten“

## Goal

Prepare outbound contact drafts for document follow-up suggestions (customer, driver, vendor, insurance) without automatic sending.

## Targets

| Suggestion type | Contact target |
|-----------------|----------------|
| `PREPARE_CUSTOMER_CONTACT` | CUSTOMER |
| `PREPARE_DRIVER_CONTACT` | DRIVER |
| `PAYMENT_REVIEW` | VENDOR |
| `INSURANCE_REVIEW` | INSURANCE |

## Flow

1. `GET .../contact-prepare` — builds preview (recipient from confirmed entity link, subject/body draft, document reference, sender identity via `OutboundEmailPolicyService`)
2. `POST .../contact-prepare/opened` — audit when user opens prepare UI (`actionAudit` + ActivityLog)
3. User reviews/edits recipient, subject, body; optionally selects document attachment (`defaultSelected: false`)
4. `POST .../contact-prepare/send` — explicit send via existing outbound email stack (`NOTIFICATION` source, dev/simulated in tests)

## Rules enforced

- Recipient resolved from confirmed `acceptedEntityLinks` + entity records (customer/vendor/insurance partner)
- No sensitive raw fields in draft (`iban`, `rawText`, etc. listed in `excludedSensitiveFields`)
- Document attachment only when `attachDocument: true`
- Reuses platform/org sender (`noreply` + Reply-To policy)
- Never auto-sends — preview + explicit send endpoint only
- Audit trail: `plausibility._pipeline.actionAudit` + `ActivityLog` (`CREATE` on open, `SEND` on dispatch)

## API

Vehicle + org scoped under existing follow-up suggestion routes.

## Frontend

- `DocumentFollowUpSuggestionsPanel` — lists suggestions with „Kontakt vorbereiten“
- `DocumentFollowUpContactPrepareModal` — preview + send using existing email UX patterns
- Wired into `DocumentUploadView` and `VehicleDocumentUploadDrawer` after apply result

## Tests

- `document-follow-up-contact.draft.spec.ts`
- `document-follow-up-contact-prepare.service.spec.ts` (mocked provider — no real send)
- `document-follow-up-contact.test.ts` (frontend)

## Files

- `document-follow-up-contact.{types,draft,recipient.util,prepare.service}.ts`
- `dto/send-document-follow-up-contact.dto.ts`
- `DocumentFollowUpContactPrepareModal.tsx`, `DocumentFollowUpSuggestionsPanel.tsx`
