# P2.2.49 — Rental Invoice Detail Secondary Localization — Final Independent Re-Audit

**Date:** 2026-08-26  
**Auditor mode:** Strict read-only independent verification  
**Implementation PR:** #1330  
**Implementation HEAD:** `19570a51b8ca7480502eb9f3250646b39da321ea`  
**Authoritative baseline:** `2dfafe8f8810bf995146e95487792a8e8a5d5897`  
**Pre-flight authority:** PR #1327 (read-only; no ancestry)  
**Verdict:** **B — READY WITH NON-BLOCKING OBSERVATIONS**

---

## 1. Provenance

| Check | Result |
|-------|--------|
| PR #1330 exists | YES |
| Open | YES |
| Draft | YES |
| Merged | NO |
| Mergeable | YES (`MERGEABLE`, `mergeStateStatus: UNSTABLE`) |
| Base OID | `2dfafe8f8810bf995146e95487792a8e8a5d5897` |
| HEAD OID | `19570a51b8ca7480502eb9f3250646b39da321ea` |
| `merge-base(HEAD, baseline)` | `2dfafe8f8810bf995146e95487792a8e8a5d5897` |
| `rev-list` baseline..HEAD | **1** |
| #1327 ancestry | **NO** |
| #1325 ancestry | **NO** |
| #1329 ancestry | **NO** |
| #1328 ancestry | **NO** |
| #1324 ancestry | **NO** |
| #1323 ancestry | **NO** |
| Current-main merge/rebase | **NO** |
| local HEAD == remote HEAD | YES |

---

## 2. Implementation commit forensics

| Field | Value |
|-------|--------|
| SHA | `19570a51b8ca7480502eb9f3250646b39da321ea` |
| Parent | `2dfafe8f8810bf995146e95487792a8e8a5d5897` |
| Subject | `feat(i18n): P2.2.49 Rental Invoice Detail Secondary localization` |
| Changed paths | 19 |

### Classification

| Category | Paths |
|----------|-------|
| P249 IMPLEMENTATION | `InvoiceDetailSecondary.tsx`, `InvoiceNotes.tsx`, `InvoiceTimeline.tsx`, `invoiceDetailSecondary.mapper.ts`, `rental-invoice-detail-secondary-i18n.ts`, `rental.invoice.detail.secondary.{en,de}.ts`, `en.ts`/`de.ts` registry |
| P249 TEST FOLLOW-UP | `rental-invoice-detail-secondary-localization.test.tsx`, `InvoiceDetailSecondary.test.tsx`, `invoiceDetailSecondary.mapper.test.ts` |
| P249 DOC/ARCHITECTURE FOLLOW-UP | `docs/audits/i18n-p2-2-49-rental-invoice-detail-secondary-implementation-2026-08-26.md`, `architecture/I18N_RENTAL_INVOICE_DETAIL_SECONDARY_P2_2_49_2026-08-26.md` |
| P249 BOOKKEEPING FOLLOW-UP | `ChangesView.tsx`, `ArchitekturView.tsx` |
| P249 scanner/governance | `hardcoded-copy-guard.test.ts`, `hardcoded-copy-inventory.json`, `i18n-check.mjs` |

**UNRELATED = 0 | MAIN-DRIFT CONTAMINATION = 0 | AUDIT CONTAMINATION = 0 | UNKNOWN = 0**

---

## 3. Complete diff inventory (19 paths)

| Path | Class |
|------|-------|
| `InvoiceDetailSecondary.tsx` | A — Secondary detail presentation |
| `InvoiceNotes.tsx` | B — Notes presentation |
| `InvoiceTimeline.tsx` | C — Timeline presentation |
| `invoiceDetailSecondary.mapper.ts` | D — Secondary mapper presentation |
| `rental-invoice-detail-secondary-i18n.ts` | E — P249 adapter |
| `rental.invoice.detail.secondary.{en,de}.ts` | F — dictionaries |
| `rental-invoice-detail-secondary-localization.test.tsx` | G — focused tests |
| `InvoiceDetailSecondary.test.tsx` | G — focused tests |
| `invoiceDetailSecondary.mapper.test.ts` | G — focused tests |
| `hardcoded-copy-guard.test.ts` | H — scanner/governance |
| `hardcoded-copy-inventory.json` | H — scanner/governance |
| `i18n-check.mjs` | H — scanner/governance |
| `en.ts`, `de.ts` | F — dictionaries |
| implementation audit doc | I |
| architecture doc | J |
| `ChangesView.tsx`, `ArchitekturView.tsx` | K |

**L/M/N/O/P = 0 | new compatibility consumers = 0**

---

## 4. Production boundary

| Path | Baseline | Implementation | Safe? |
|------|----------|----------------|-------|
| `InvoiceDetailSecondary.tsx` | German accordion chrome, task status labels from mapper | `useLanguage()` + `rids()` for section chrome; task status via adapter | YES |
| `InvoiceNotes.tsx` | German notes chrome; raw `{invoice.notes}` | Localized chrome; raw notes unchanged; `onSave(notes)` unchanged | YES |
| `InvoiceTimeline.tsx` | German timeline chrome; `mapInvoiceTimelinePanel` dates fixed de-DE | Localized chrome; locale-aware `item.time` override; raw event title/detail/actor preserved | YES |
| `invoiceDetailSecondary.mapper.ts` | German `taskStatusLabel`, fallback `Aufgabe` | Removed presentation labels; `isDone` derivation unchanged | YES |
| `rental-invoice-detail-secondary-i18n.ts` | N/A (new) | Static keys, task status→TranslationKey, timeline date formatter | YES |

---

## 5. Pre-flight scope reconciliation

**EXACTLY MATCHES PREFLIGHT**

Matches PR #1327 selected 5-path secondary boundary; 28 keys within 25–29 estimate; no primary/financial/documents expansion.

---

## 6. Runtime trace

`/rental` → invoices → `InvoiceDetail` → `InvoiceDetailSecondary`  
Panel: `buildInvoiceDetailSecondaryPanel(invoice, provenance, editGate)`  
Timeline: `useInvoiceTimeline` → `mapInvoiceTimelinePanel` → locale re-format in component  
Callbacks: `onSaveNotes(notes)`, `onCopyInternalId()`  
Task source: `invoice.tasks[]`; status machine preserved; labels in component via adapter  
Permissions/visibility: unchanged from `detail.actions.edit` and panel predicates

---

## 7–11. Negative certifications

| Certification | Result |
|---------------|--------|
| INVOICE PRIMARY DIFF | **ZERO** |
| FINANCIAL DIFF | **ZERO** (production paths only) |
| TAX SEMANTIC DIFF | **ZERO** |
| PAYMENT SEMANTIC DIFF | **ZERO** |
| DOCUMENTS PANEL DIFF | **ZERO** |

---

## 12–17. Dynamic data & notes

| Gate | Result |
|------|--------|
| Description raw `Langzeitmiete Sonderkondition X7` | PASS — rendered verbatim EN/DE |
| Notes raw `Interne Notiz X7 – Kunde ruft Freitag zurück` | PASS — rendered verbatim |
| Notes edit state machine | UNCHANGED |
| Notes mutation `onSave(notes)` | UNCHANGED |
| Notes payload `Interne Notiz X7` | PASS — byte-equivalent (test) |
| Notes draft same-mount `Noch nicht speichern X7` | PASS (test) |

---

## 18–25. Tasks

| Status | Machine | EN label | DE label | Tone/Icon |
|--------|---------|----------|----------|-----------|
| OPEN | OPEN | Open | Offen | watch / list-todo |
| IN_PROGRESS | IN_PROGRESS | In progress | In Bearbeitung | watch / list-todo |
| DONE | DONE | Completed | Erledigt | positive / list-todo + line-through |
| COMPLETED | COMPLETED | Completed (via DONE key) | Erledigt | same as DONE |
| CANCELLED | CANCELLED | Cancelled | Abgebrochen | watch / list-todo |

- Derivation unchanged (`isDone` from machine status)
- Order/IDs/React keys unchanged
- Task title `Rückgabe prüfen Sonderfall X7` raw preserved
- Task navigation: N/A (no click handlers)

---

## 26–28. Provenance & internal ID

- Provenance values (`erstelltVon`, `erstelltUeber`, `quelle`) raw preserved; labels localized
- Internal ID `inv_internal_7f3cX9` not displayed in UI; copy callback unchanged (test)

---

## 29–35. Timeline

| Item | Result |
|------|--------|
| Raw `PAYMENT_PROVIDER_EVENT_X7` | PASS |
| Raw `Stripe reconciliation reference ABC-729` | PASS |
| Event order | UNCHANGED |
| Grouping | N/A (flat list) |
| Timestamp semantics | UNCHANGED (`occurredAt`, `timezone`, sort from panel) |
| Fixed-locale | **FIXED-LOCALE DEBT SAFELY RESOLVED** — `InvoiceTimeline.tsx` re-formats via `getFormattingLocale`; `invoiceTimeline.mapper.ts` untouched |
| Same-mount date presentation | PASS — format changes, identity/order preserved |

---

## 36–41. Behavior freeze

| Gate | Result |
|------|--------|
| Callbacks (edit/save/cancel/copy/accordion/timeline expand) | EQUIVALENT |
| Permissions | UNCHANGED |
| Visibility predicates | UNCHANGED |
| Disabled/loading | UNCHANGED |
| Accordion state machine | UNCHANGED |
| `key={locale}` etc. | NONE |

---

## 42–44. Same-mount & layout

- Same-mount preservation: **PASS** (tests)
- DOM/layout: no material redesign; implementation retains baseline `border-gray-*` task rows (did **not** absorb main theme-token drift)

---

## 45. Accessibility

Localized `aria-label`, `aria-expanded`, headings; roles/focus semantics unchanged. **No regression.**

---

## 46–49. Keys

### 28 new keys (all `rental.invoice.detail.secondary.*`)

All classified **JUSTIFIED SECONDARY CHROME**. No dynamic content or machine data localized as static.

**Key density:** **VALID KEY DENSITY** (28 within 25–29 estimate)

### Reused keys (9)

| Key | Classification |
|-----|----------------|
| `common.save` / `common.cancel` / `common.edit` | EXACT |
| `tasks.filter.status.*` (4) | EXACT |
| `notification.expandDetails` | ACCEPTABLE (DE exact; EN generic expand) |
| `dashboard.attention.showLess` | ACCEPTABLE (DE exact; EN generic collapse) |

**Cross-domain reuse verdict:** **CROSS-DOMAIN REUSE VALID** (0 INCORRECT)

---

## 50–51. Adapter

`rental-invoice-detail-secondary-i18n.ts` — **CANONICAL**  
Exports A–D only; E–O = 0.

---

## 52–56. Enforce-clean

| Scope | Findings |
|-------|----------|
| P249 | **0** |
| P248–P216 | **0** |
| Global enforce-clean | **0** |
| Raw key leakage | **0** |
| Raw machine leakage | **0** |

---

## 57. Dictionary accounting

| Metric | Value |
|--------|-------|
| Baseline EN/DE | 8732 / 8732 |
| Final EN/DE | 8760 / 8760 |
| New keys | 28 |
| Removed keys | 0 |
| Changed existing translations | 0 |
| Parity | 100% |
| Orphans | 0 |
| Duplicates | 0 |

---

## 58. Translation quality

0 BLOCKING. German terminology appropriate for internal notes, linked tasks, provenance, timeline. Minor STYLE: EN collapse uses dashboard “Show less” vs invoice-specific wording — non-blocking.

---

## 59. Category E

**Category E = 0** — all production hunks presentation-only.

---

## 60. Shim

| Metric | Value |
|--------|-------|
| Shim before/after | 29 / 29 |
| New compatibility consumers | 0 |

---

## 61–65. Collision audit

| PR | Overlap |
|----|---------|
| #1329 Dashboard/Fleet | **NONE** |
| #1328 Battery V2 LV REST | **NONE** (backend-only) |
| #1324 Vehicle Detail | **NONE** |
| #1323 LV REST audit | **NONE** (docs-only) |
| Active Rental/Invoice collision | **NONE** |

---

## 66. Main drift

| | |
|-|-|
| Current main SHA | `95e28f2b44d823c64a84e49132c34c22c99159d1` |
| P249 path drift vs main | **LOW** — theme tokens only in `InvoiceDetailSecondary.tsx` (`border-gray-*` → `border-border`) |
| Implementation absorbed drift? | **NO** (correct) |
| Future merge risk | LOW cosmetic conflict on task row borders |

---

## 67–74. Tests & build

| Check | Result |
|-------|--------|
| Focused test quality | **STRONG** |
| P249 focused tests | 11 collected, 11 passed |
| P223 documents regression | PASS |
| P248 operator entry regression | PASS |
| `npm run i18n:check` | PASS |
| Suite count | **463** |
| `npm run check:surface` | PASS |
| `npm run build` | PASS |
| `git diff --check` | **FAIL** — trailing whitespace in implementation markdown docs only (non-blocking) |

---

## 75. CI triage

Workflow run `33007033315`: Backend unit (vehicle-detail), Typecheck (vehicles/billing), Playwright Vehicle Detail — **unrelated/pre-existing** (no P249 paths).  
Workflow run `33007033361`: Production build, Frontend component tests, Lint — **PASS**.

**P249-caused required CI failures = 0**

---

## 76. Rental campaign progress

| Metric | Value |
|--------|-------|
| P249 closed actionable units | 16 |
| Remaining Rental findings | 356 |
| Remaining global actionable units | ~1453 |
| Updated global completion | ~92.9% |
| Confidence | HIGH |

---

## 77. P250 forecast

**P250 FORECAST CONFIRMED** — Rental Invoice Detail Primary (Header + Relations)

Post-P249 residuals in invoice detail cluster point to primary header, relations, amounts, and actions surfaces.

---

## 78. Claim reconciliation

| Claim | PR claim | Independent | PASS/FAIL |
|-------|----------|-------------|-----------|
| Baseline | `2dfafe8f` | `2dfafe8f` | PASS |
| HEAD | `19570a51b` | `19570a51b` | PASS |
| 1 commit | 1 | 1 | PASS |
| 5-path scope | yes | yes | PASS |
| +28 keys | 28 | 28 | PASS |
| 8760/8760 | yes | yes | PASS |
| P249 = 0 | 0 | 0 | PASS |
| 463 tests | 463 | 463 | PASS |
| Notes mutation | frozen | frozen | PASS |
| Dynamic data | raw | raw | PASS |
| Invoice Primary | untouched | untouched | PASS |
| Financial/tax/payment | zero | zero | PASS |
| Documents panel | untouched | untouched | PASS |
| Adapter | CANONICAL | CANONICAL | PASS |
| Same-mount | PASS | PASS | PASS |
| Category E | 0 | 0 | PASS |
| Shim | 29 | 29 | PASS |
| #1329–#1323 overlap | NONE | NONE | PASS |
| Main drift | LOW | LOW | PASS |
| `git diff --check` | PASS | FAIL (docs whitespace) | **FAIL** |

---

## 79–80. Correction threshold

**CORRECTIONS NOT REQUIRED** for merge readiness.

Optional non-blocking cleanup: strip trailing whitespace from implementation markdown docs (`architecture/I18N_*`, `docs/audits/i18n-p2-2-49-rental-invoice-detail-secondary-implementation-*`).

---

## 84. Final verdict

**B — READY WITH NON-BLOCKING OBSERVATIONS**

PR #1330 may be marked ready and merged.

**RENTAL CAMPAIGN STATUS: CONTINUES.**

**NEXT CANDIDATE: P2.2.50 — Rental Invoice Detail Primary (Header + Relations)**

### Non-blocking observations

1. `git diff --check` fails on trailing whitespace in implementation documentation markdown only.
2. CI workflow `33007033315` shows unrelated vehicle-detail/billing failures; a subsequent run passes frontend/build gates.
3. Cross-domain reuse of `dashboard.attention.showLess` for timeline collapse is semantically acceptable but EN copy is generic (“Show less”).
