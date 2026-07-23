# Legal Documents — Upload & Review Wizard (Prompt 24/32)

**Date:** 2026-07-22

## Scope

Replace inline PDF upload with a **4-step guided wizard** on **Verwaltung → Kunden-Rechtstexte**. No direct activation from upload — drafts only until separate activate flow.

## UX flow

| Step | Label | Content |
|------|-------|---------|
| 1 | Einordnung | document type, variant, language, jurisdiction, B2B/B2C, channel, scope, mandatory |
| 2 | Version & Gültigkeit | version label, title, valid from/until, change summary, legal owner |
| 3 | Datei | drag-and-drop + file picker (iOS PDF), client PDF/size validation |
| 4 | Prüfung | summary, upload progress, server metadata (pages, scan, checksum), save draft / request review |

**Entry:** PageHeader action **„Neue Version“** (`legal-documents` write).

**Upload timing:** XHR upload starts when entering step 4 (after steps 1–3 validated). File is streamed — not held in extra client storage beyond the `File` reference.

**Abort:** Confirm dialog on cancel with dirty form or in-flight upload; `AbortController` aborts XHR.

**Success toasts:** Only after server confirms upload (`POST …/upload`) or review submission (`POST …/submit-for-review`).

## Validation rules

| Field | Client rule |
|-------|-------------|
| documentType | required |
| legalVariant | required for `CONSUMER_INFORMATION` |
| stationIds | ≥1 when `STATION_SPECIFIC` |
| versionLabel | required; pattern `^[A-Za-z0-9][A-Za-z0-9._\-+ ]{0,63}$`; no duplicate per type (non-archived/revoked) |
| validUntil | must be after validFrom when both set |
| file | required PDF (`isLegalPdfFile` — iOS empty MIME OK); max `VITE_DOCUMENT_LEGAL_UPLOAD_MAX_MB` (default 15) |

Server re-validates scope, PDF, malware scan. `SCAN_FAILED` blocks draft save / review actions in UI.

## API integration

| Action | Endpoint |
|--------|----------|
| Upload (progress + abort) | `POST /organizations/:orgId/legal-documents/upload` via `api.legalDocuments.uploadWithProgress` |
| Save draft | Upload creates `DRAFT` — wizard closes after confirm |
| Request review | `POST …/legal-documents/:id/submit-for-review` (`legal-documents` write) |
| Stations (scope) | `GET …/stations?selectableOnly=true` |

**Not called:** `activate` — activation remains on Freigabe section.

## Accessibility

- `FormDialog` / Radix Dialog: focus trap, Escape to close (blocked while submitting)
- Step region: `aria-live="polite"`, `aria-labelledby` on form
- Progress: `role="progressbar"` with `aria-valuenow`
- Field errors: `role="alert"`
- Keyboard: primary actions as buttons; file input via labeled control

## Components

| File | Role |
|------|------|
| `LegalDocumentUploadWizardDialog.tsx` | Orchestration, upload, submit |
| `LegalDocumentUploadWizardSteps.tsx` | Step UI |
| `legal-document-upload-wizard.validation.ts` | Step validation |
| `legal-document-upload-wizard.utils.ts` | Upload param builder, scan helpers |
| `LegalDocumentsLegacyMutations.tsx` | Activate/archive only |

## Tests

```
legal-document-upload-wizard.validation.test.ts — 9 passed
legal-document-upload-wizard.utils.test.ts — 3 passed
LegalDocumentUploadWizardDialog.test.tsx — 8 passed (step components + SSR portal note)
LegalDocumentsTab.wizard.test.tsx — 1 passed
npx tsc -b — exit 0
```

Coverage: each step, validation errors, permissions, upload/scan errors, mobile stepper markup, API param builder.

## Permissions

| UI | Permission |
|----|------------|
| Open wizard / upload / save draft | `legal-documents` write |
| Request review | `legal-documents` write (`submit_review` server-side) |
| Activate / archive | `legal-documents` manage / write (unchanged) |
