# P2.2.22 — Rental Send Invoice Dialog Localization Implementation

**Date:** 2026-08-22
**Baseline:** `59b01928a09598f36045a61fad031f0e44dcc1fc` (PR #1167 / P2.2.21)
**Pre-flight:** PR #1171 — GO
**Branch:** `cursor/p2222-rental-send-invoice-dialog-i18n-3c10`
**PR:** #1172 (Draft)

## 0. Topology gate

| Check | Result |
|-------|--------|
| PR #1167 merged @ `59b01928` | ✓ |
| `git merge-base HEAD 59b01928` | `59b01928` |
| `git rev-list --count 59b01928..HEAD` (pre-edit) | 0 |
| Implementation commits after baseline | 1 (`845ca3be`) |
| Audit branch ancestry | none |
| Communication Center ancestry | none |

**Topology verdict:** PASS

## 1. Post-P221 freeze verification

| Metric | Baseline ref | Verified |
|--------|-------------|----------|
| `npm run i18n:check` | PASS | PASS |
| Global enforce-clean debt | 0 | 0 |
| P221 | 0 | 0 |
| P220 | 0 | 0 |
| P219 | 0 | 0 |
| P218 | 0 | 0 |
| P217 | 0 | 0 |
| P216A/B1/B2/C1/C2A/C2B | 0 | 0 |
| EN keys | ~8230 | 8235 |
| DE keys | ~8230 | 8235 |
| Parity | 100% | 100% |
| Orphans | 0 | 0 |
| Shim inventory | 29 | 29 |
| New compatibility consumers | 0 | 0 |
| Global scanner inventory | ~1616 | 1611 |

## 2. Exact production scope

| Item | Value |
|------|-------|
| Production component | `frontend/src/rental/components/invoices/SendInvoiceDialog.tsx` |
| Host | `frontend/src/rental/components/invoices/InvoiceDetail.tsx` |
| Route/render | Invoice detail → send email action → `SendInvoiceDialog` |
| Presentation adapter | `frontend/src/rental/lib/send-invoice-i18n.ts` (new) |
| Feature flag | none |
| Dialog type | standalone `FormDialog` component |
| Prior test coverage | none (added P222 suite) |

## 3. Presentation inventory

### Scanner-visible (baseline → after)

| Concept | Class | Resolution |
|---------|-------|------------|
| Dialog title | D | `invoices.send.title` |
| Dialog description | D | `invoices.send.description` |
| Default body template | D | `invoices.send.defaultBody` via adapter |
| Recipient label | D | reuse `email.send.modal.recipient` |
| Subject label | D | reuse `email.send.modal.subject` |
| Message label | D | reuse `email.send.modal.body` |
| CC/BCC labels | D | reuse `email.send.modal.cc` / `.bcc` |
| CC placeholder | D | `invoices.send.ccPlaceholder` |
| Cancel action | D | reuse `common.cancel` |
| Send action | D | reuse `email.send.modal.send` |
| Recipient required toast | D | `invoices.send.error.recipientRequired` |
| Invoice number in description/body | B | `displayNumber(invoice)` dynamic |
| Host `defaultSubject` | B/A | unchanged German host string |
| Recipient email | B | form state, never translated |
| Success/error toasts | C | host `useInvoiceDocuments` (out of scope) |
| Attachment UI | — | none in dialog (documentId prop only) |
| Loading spinner | C | icon only, send label remains localized |
| aria/title/tooltips | — | none in scoped component |

**Category E remaining:** 0

## 4. Scope stop gate

- Production files changed: 2 (+ dictionaries/tests/governance)
- New presentation concepts: 5 keys + 7 reused keys
- No API/Communication Center/permission changes

**Scope verdict:** CONTINUE (bounded)

## 6. Machine/domain inventory

| Value | Baseline | Implementation | Changed |
|-------|----------|----------------|---------|
| `invoice.id` | prop | prop | NO |
| `invoiceNumber` / display | `displayNumber(invoice)` | same | NO |
| `orgId` | host hook | host hook | NO |
| `customerId` | not in dialog | not in dialog | NO |
| `documentId` | prop → payload | prop → payload | NO |
| `toEmail` | prefilled + editable state | same | NO |
| `subject` | host default + editable | same | NO |
| `bodyText` | dialog default + editable | localized default on open only | NO* |
| `ccEmails` / `bccEmails` | parsed arrays | same | NO |
| `onSend` callback | `documents.sendEmail` | same | NO |
| Send API | `sendInvoiceDocumentEmail(orgId, invoice.id, payload)` | same | NO |
| Permission gates | host `capabilities.sendEmail` | unchanged | NO |

\*Default body presentation localized at open-reset; user edits and payload semantics unchanged.

## 8. Recipient semantics

**Source:** A — prefilled customer email from `InvoiceDetail` (`defaultToEmail`), B — manual edit in dialog.

| Aspect | Changed |
|--------|---------|
| Prefill source | NO |
| Manual editing | NO |
| Validation (`!toEmail.trim()`) | NO |
| Payload field `toEmail` | NO |
| Fallback | NO |

## 9–10. Subject/body lifecycle

| Field | Classification | Behavior |
|-------|---------------|----------|
| `defaultSubject` | A (host-owned) | Set on open from prop; not localized in dialog |
| `subject` state | C (user-editable) | Preserved on locale switch |
| `bodyText` default | D (dialog-owned canonical) | Localized on open via `buildSendInvoiceDefaultBody(locale, number)` |
| `bodyText` after edit | C | Preserved on locale switch (`locale` excluded from reset deps) |

## 13. Send API payload

| Field | Baseline source | Implementation source | Type | Semantic |
|-------|----------------|----------------------|------|----------|
| `toEmail` | trimmed state | trimmed state | string | unchanged |
| `subject` | `subject.trim() \|\| defaultSubject` | same | string | unchanged |
| `bodyText` | `bodyText.trim() \|\| undefined` | same | string? | unchanged |
| `ccEmails` | `parseEmails(ccEmails)` | same | string[] | unchanged |
| `bccEmails` | `parseEmails(bccEmails)` | same | string[] | unchanged |
| `documentId` | `documentId ?? undefined` | same | string? | unchanged |

## 14. Send action order

1. Send click → 2. recipient validation → 3. payload build → 4. `onSend(payload)` → 5. close on `true`

Unchanged.

## 17. Validation freeze

| Rule | Condition | Presentation key | Condition changed |
|------|-----------|------------------|-------------------|
| Recipient required | `!toEmail.trim()` | `invoices.send.error.recipientRequired` | NO |

## 21. Fixed-locale audit (P222 scope)

No `locale === 'de'`, `de-DE`, `Intl.*`, or `toLocale*` in scoped production files.

## 23. Presentation adapter

`send-invoice-i18n.ts` — **CANONICAL** (presentation-only default body + error key constant)

## 24. Key reuse

| Concept | Classification | Key |
|---------|---------------|-----|
| Recipient | B | `email.send.modal.recipient` |
| Subject | B | `email.send.modal.subject` |
| Message | B | `email.send.modal.body` |
| CC/BCC | B | `email.send.modal.cc` / `.bcc` |
| Send | B | `email.send.modal.send` |
| Cancel | B | `common.cancel` |
| Dialog title | C | `invoices.send.title` |
| Description | C | `invoices.send.description` |
| Default body | C | `invoices.send.defaultBody` |
| Recipient error | C | `invoices.send.error.recipientRequired` |
| CC placeholder | C | `invoices.send.ccPlaceholder` |

**New keys:** 5 EN + 5 DE
**Reused keys:** 7 concepts
**Changed existing translations:** 0

## 27. Dictionary accounting

| | Baseline | Final |
|--|----------|-------|
| EN | 8230 | 8235 |
| DE | 8230 | 8235 |
| Parity | 100% | 100% |
| Orphans | 0 | 0 |

## 29. P222 enforce-clean exact

```
rental/components/invoices/SendInvoiceDialog.tsx
rental/lib/send-invoice-i18n.ts
```

**P222 result:** 0

## 32–38. Tests

File: `rental-send-invoice-dialog-localization.test.tsx`

| # | Coverage |
|---|----------|
| EN/DE title + labels | ✓ |
| Runtime switch (remount) | ✓ |
| Runtime switch (same mount EN→DE) | ✓ |
| Edited subject/body/recipient preserved | ✓ |
| Payload regression | ✓ |
| Recipient unchanged | ✓ |
| documentId in payload | ✓ |
| mockSend exercised | ✓ |

**Collected:** 11 | **Passed:** 11 | **Failed:** 0 | **Skipped:** 0

## 44. Communication Center collision

Production overlap: 0 | Dictionary collision: 0 | Shared helper collision: 0

## 45. Scanner accounting

| Metric | Before | After |
|--------|--------|-------|
| P222 scanner-visible | 5 | 0 |
| P222 hidden presentation | 0 | 0 |
| P222 fixed-locale | 0 | 0 |
| Rental residual | 385 | 380 |
| Global inventory | 1616 | 1611 |
| Global enforce-clean | 0 | 0 |

## 48–49. Build / diff check

- `npm run build` — PASS
- `git diff --check 59b01928...HEAD` — PASS (after whitespace fix)

## 50. Diff classification

| Class | Files |
|-------|-------|
| A — production presentation | `SendInvoiceDialog.tsx` |
| B — adapter | `send-invoice-i18n.ts` |
| C — dictionaries | `invoices.send.{en,de}.ts`, `en.ts`, `de.ts` |
| D — tests | `rental-send-invoice-dialog-localization.test.tsx` |
| E — scanner/governance | `i18n-hardcoded-scan.mjs`, `hardcoded-copy-guard.test.ts`, `i18n-check.mjs`, inventory |
| F — docs | audit + architecture |
| G — bookkeeping | `ChangesView.tsx`, `ArchitekturView.tsx` |
| H — business semantic | 0 |
| I — unrelated | 0 |

## 57. CI triage (PR #1172 @ `845ca3be`)

| Failed check | Classification |
|--------------|----------------|
| Vehicle Detail Typecheck | B — pre-existing |
| Vehicle Detail Backend unit tests | B — pre-existing |
| Vehicle Detail Playwright E2E | B — pre-existing |
| Legal Documents Typecheck | B — pre-existing |

**P222-caused required CI failures:** 0

Evidence: Vehicle Detail **Frontend component tests PASS**, **Production build PASS**, **Lint PASS** on same run.

## 58. Reconciliation summary

All gates PASS except non-P222 CI failures (pre-existing).

## 59. Final verdict

**A — IMPLEMENTATION COMPLETE — READY FOR INDEPENDENT P2.2.22 RE-AUDIT**

- `npm run i18n:check` = PASS
- GLOBAL ACTIVE I18N ENFORCE-CLEAN DEBT = 0
- P222 = 0; P221–P216 = 0
- Branch based directly on `59b01928`
- PR #1172 remains Draft and unmerged
