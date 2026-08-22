# P2.2.22 — Post-P221 Residual Prioritization & Next Slice Selection

**Date:** 2026-08-22  
**Mode:** STRICT READ-ONLY PRE-FLIGHT  
**Repository:** FATIHS-MGCKS/SYNQDRIVE-alpha  
**Authoritative baseline:** `59b01928a09598f36045a61fad031f0e44dcc1fc`  
**Baseline description:** Squash-merge of PR #1167 (P2.2.21 Rental Create Invoice Dialog Localization) onto `6413a3dd` (P2.2.20)

---

## 0. Topology hard gate — PASS

| Check | Independent result |
|-------|-------------------|
| PR #1167 merged | ✅ `mergedAt: 2026-08-22T13:17:32Z` |
| Merge SHA | `59b01928a09598f36045a61fad031f0e44dcc1fc` ✅ |
| Commit exists | ✅ |
| Merge parent | `6413a3dd` (P2.2.20) |
| P221 ancestry | ✅ merge commit contains P2.2.21 |
| P220 ancestry | ✅ `6413a3dd` ancestor |
| P219 ancestry | ✅ `9b714458` ancestor |
| P218 ancestry | ✅ `d645343f` ancestor |
| P217 ancestry | ✅ `6e578fd9` ancestor |
| P216 ancestry | ✅ `f7095205`, `718a5e82`, `2f47b6a0` ancestors |
| Working tree clean @ baseline | ✅ |
| Audit branch | `cursor/p2222-post-p221-next-slice-preflight-3c10` from `59b01928` |
| `git merge-base HEAD 59b01928` | `59b01928` ✅ |
| Commits before audit artifact | 0 ✅ |

**Note:** `59b01928` is the head of `cursor/p227b-voice-telephony-test-center-preflight-3c10`, not yet on current `origin/main` (main has parallel Communication Center merges). P222 implementation must branch from `59b01928`, not from contaminated `main` HEAD.

---

## 1. Post-P221 freeze verification — PASS

| Metric | Result |
|--------|--------|
| `npm run i18n:check` | **PASS** |
| EN keys | **8230** |
| DE keys | **8230** |
| Parity | **100%** |
| Orphans (invoices.create.*) | **0** |
| Shim (`../i18n/` compat) | **29** (prod 18, test 11) |
| Global scanner inventory | **1616** |
| Enforce-clean surface findings | **0** |
| GLOBAL ACTIVE I18N ENFORCE-CLEAN DEBT | **0** |

### Prior freeze scoped findings @ `59b01928`

| Freeze | Findings |
|--------|----------|
| P221 | 0 |
| P220 | 0 |
| P219 | 0 |
| P218 | 0 |
| P217 | 0 |
| P216C2B | 0 |
| P216C2A | 0 |
| P216C1 | 0 |
| P216B2 | 0 |
| P216B1 | 0 |
| P216A | 0 |

### P221 residual verification

`CreateInvoiceDialog.tsx` and `create-invoice-i18n.ts`: **0 scanner findings**. No presentation regression.

### P221 component tests @ baseline

`rental-create-invoice-dialog-localization.test.tsx`: **13/13 PASS**

---

## 2. Fresh residual inventory (@ `59b01928`)

| Surface | Scanner findings |
|---------|-----------------|
| **Global total** | 1616 |
| MASTER | 1049 |
| RENTAL | 385 |
| OPERATOR | 156 |
| SHARED | 1 |
| SHELL | 25 |

**Rental by module (scanner):**

| Module | Findings |
|--------|----------|
| Other Rental areas | 260 |
| Finance/Billing | 103 |
| Tasks | 13 |
| Documents | 8 |
| App / routing shell | 1 |

**Enforce-clean debt:** 0 (distinct from scanner inventory).

---

## 3. Frozen slices (excluded from candidacy)

P216A/B1/B2/C1/C2A/C2B, P217, P218, P219 (Insurances), P220 (Parts & Accessories), P221 (Create Invoice Dialog), P214-class invoice list surfaces (`invoice-list-i18n.ts` + list components), P212 Fines (`fines-i18n.ts`), P211 Rental Handover, P213 Operator Handover — all enforce-clean @ 0 on frozen paths.

---

## 4. Rental decomposition (post-P221)

Highest-value **bounded** Rental surfaces remaining in Finance/Billing and invoice detail:

| Surface | Production file(s) | Visible | Hidden est. | Active | Notes |
|---------|-------------------|--------:|------------:|--------|-------|
| **Send Invoice Dialog** | `SendInvoiceDialog.tsx` | 5 | ~12 | ✅ | `InvoiceDetail.tsx` render path |
| Invoice Internal Notes | `InvoiceNotes.tsx` | 5 | ~10 | ✅ | Invoice detail section |
| Invoice Timeline | `InvoiceTimeline.tsx` + `invoiceTimeline.mapper.ts` | 4 | ~8 | ✅ | Fixed `de-DE` in mapper |
| Invoice Documents panel | `InvoiceDocuments.tsx` + `invoiceDocuments.mapper.ts` | 8 | ~15 | ✅ | Larger; delivery actions |
| Invoice Detail Secondary | `InvoiceDetailSecondary.tsx` | 7 | ~10 | ✅ | Multi-section |
| Tenant billing drawers | `billing/*` | 5–8 each | medium | ✅ | Higher API coupling |
| Damages dialogs | `damages/*` | 7–15 | high | ✅ | Pin/workflow coupling |

**Not selected merely because P221 touched invoices:** Create dialog is closed; **Send** is a distinct dialog with email payload semantics, not create/financial math.

---

## 5. Operator decomposition

| Surface | File | Visible | Active | Notes |
|---------|------|--------:|--------|-------|
| Vehicle Quick View | `OperatorVehicleQuickView.tsx` | 22 | ✅ | Too large for P222 |
| Booking Form Sheet | `OperatorBookingFormSheet.tsx` | 16 | ✅ | Medium-large |
| Booking Cancel Sheet | `OperatorBookingCancelSheet.tsx` | 5 | ✅ | Bounded |
| Booking No-Show Sheet | `OperatorBookingNoShowSheet.tsx` | 6 | ✅ | Bounded |
| Pickup Check Sheet | `OperatorPickupCheckSheet.tsx` | 4 | ✅ | Bounded |
| Today View | `OperatorTodayView.tsx` | 12 | ✅ | Multi-surface |

Operator handover core: already localized (P2.2.13); 0 residual on frozen paths.

---

## 6. Master decomposition (sub-surfaces only)

| Sub-surface | File | Visible | Notes |
|-------------|------|--------:|-------|
| Health Tracking | `HealthTrackingView.tsx` | 132 | TOO LARGE |
| Vehicle Registration Modal | `VehicleRegistrationModal.tsx` | 95 | TOO LARGE |
| High Mobility Data | `HighMobilityDataView.tsx` | 65 | Integration-heavy |
| Insurances Admin | `InsurancesAdminView.tsx` | 59 | Admin-only |
| Billing Pricing Tab | `billing/BillingPricingTab.tsx` | 27 | Financial |

Master remains largest raw inventory but fails boundedness without narrow sub-surface selection.

---

## 7. Communication Center collision gate

Active/open Communication work (PRs #1158, #1165, #1134, etc.) targets **inbox/message** surfaces, not Rental invoice email dialog.

| Candidate | Collision |
|-----------|-----------|
| Send Invoice Dialog | **NO** — `rental/components/invoices/SendInvoiceDialog.tsx` not in comm PR file sets |
| Invoice Notes | **NO** |
| Operator booking sheets | **LOW** |
| Master surfaces | **NO** |

**Dictionary namespace note:** `email.send.modal.*` keys exist for booking document send modals — **reuse opportunity**, not collision, for Send Invoice Dialog.

---

## 8. Fixed-locale inventory (production, selected domains)

| Location | Pattern | Class |
|----------|---------|-------|
| `invoiceUtils.ts` | `de-DE` currency/date | C — outside P222 boundary unless co-touched |
| `invoiceTimeline.mapper.ts` | `Intl.DateTimeFormat('de-DE')` | C — Invoice Timeline candidate only |
| `invoiceDocuments.mapper.ts` | `toLocaleString('de-DE')` | C — Invoice Documents candidate only |
| Frozen slices (P217–P221) | `getFormattingLocale` adapters | A/B — already addressed |

Send Invoice Dialog itself: **0 fixed-locale** literals (uses `displayNumber` from host).

---

## 9. Top 10 ranked candidates

| Rank | Domain | Surface | Exact files | Vis | Hidden | Fixed-loc | Active | Impact | Biz risk | Bound | Arch | Test | Coll | ~Keys | Rec |
|------|--------|---------|-------------|----:|-------:|----------:|--------|-------:|---------:|------:|-----:|------:|-----:|------:|-----|
| 1 | Rental | **Send Invoice Dialog** | `SendInvoiceDialog.tsx` (+ adapter) | 5 | 12 | 0 | ✅ | 5 | 1 | 5 | 4 | 4 | 5 | **~18** | **SELECT** |
| 2 | Rental | Invoice Internal Notes | `InvoiceNotes.tsx` | 5 | 10 | 0 | ✅ | 3 | 1 | 5 | 3 | 4 | 5 | ~15 | Strong alt |
| 3 | Rental | Invoice Timeline | `InvoiceTimeline.tsx`, `invoiceTimeline.mapper.ts` | 4 | 8 | 2 | ✅ | 4 | 2 | 4 | 3 | 3 | 5 | ~22 | Mapper locale debt |
| 4 | Operator | Booking Cancel Sheet | `OperatorBookingCancelSheet.tsx` | 5 | 8 | 0 | ✅ | 4 | 2 | 5 | 3 | 4 | 4 | ~18 | Operator best |
| 5 | Operator | Booking No-Show Sheet | `OperatorBookingNoShowSheet.tsx` | 6 | 8 | 0 | ✅ | 4 | 2 | 5 | 3 | 4 | 4 | ~18 | Operator alt |
| 6 | Rental | Invoice Documents panel | `InvoiceDocuments.tsx`, mapper | 8 | 15 | 1 | ✅ | 4 | 3 | 3 | 3 | 3 | 5 | ~35 | Split later |
| 7 | Operator | Pickup Check Sheet | `OperatorPickupCheckSheet.tsx` | 4 | 6 | 0 | ✅ | 4 | 2 | 5 | 3 | 4 | 4 | ~16 | Operator alt |
| 8 | Rental | Create Damage Dialog | `CreateDamageDialog.tsx` | 7 | 12 | 0 | ✅ | 4 | 3 | 4 | 3 | 3 | 4 | ~25 | Damage workflow |
| 9 | Rental | Invoice Detail Secondary | `InvoiceDetailSecondary.tsx` | 7 | 10 | 0 | ✅ | 3 | 2 | 3 | 3 | 3 | 5 | ~28 | Multi-section |
| 10 | Master | Billing Pricing Tab | `billing/BillingPricingTab.tsx` | 27 | 20+ | 2 | ✅ | 2 | 4 | 2 | 2 | 2 | 5 | 60+ | TOO LARGE |

---

## 10. Three-strategy decision

### A — Continue bounded Rental closure

- **Best candidate:** Send Invoice Dialog  
- **Benefit:** High finance-workflow impact; natural invoice-detail continuation after P221; maximal reuse of `email.send.modal.*` keys  
- **Risk:** Low — email payload only, no tax/amount math  
- **Why now:** Active path from `InvoiceDetail`; scanner + hidden debt clearable in one slice  
- **Debt reduction:** ~17 presentation items scoped  
- **Complexity:** Low (2 production files)

### B — Begin bounded Operator closure

- **Best candidate:** Booking Cancel Sheet  
- **Benefit:** Field-operator UX; bounded sheet pattern  
- **Risk:** Moderate workflow/state coupling  
- **Why defer:** Lower cross-slice leverage than completing invoice detail email flow  
- **Complexity:** Low-medium

### C — Begin bounded Master closure

- **Best candidate:** None ≤80 concepts at acceptable risk  
- **Why defer:** All viable Master sub-surfaces exceed P222 boundedness budget  

**Chosen strategy: A — Continue bounded Rental closure**

---

## 11. Diminishing returns in Rental

**YES — RENTAL STILL HAS BEST NEXT SLICE**

Consecutive Rental slices remain justified: Send Invoice Dialog is a distinct, bounded, high-impact satellite of the already-localized invoice detail stack — not repetition of P221 create math/payload.

---

## 12. Excluded candidates

| Candidate | Reason |
|-----------|--------|
| Master Health Tracking / Vehicle Registration | TOO LARGE |
| Operator Vehicle Quick View | TOO LARGE |
| Invoice Documents panel (full) | SHOULD BE SPLIT (mapper + panel) |
| Tenant billing drawers | TOO BUSINESS-COUPLED / FINANCIAL RISK |
| DataAnalyseView | TOO LARGE |
| Communication Center inbox | ACTIVE FEATURE COLLISION |
| Create Invoice Dialog (reopen) | frozen P221 |
| Invoice list/filters (reopen) | frozen P214 class |

---

## 13. Selected P2.2.22 target

### **P2.2.22 — Rental Send Invoice Dialog Localization**

| Attribute | Value |
|-----------|-------|
| **Authoritative base** | `59b01928a09598f36045a61fad031f0e44dcc1fc` |
| **Production files** | `rental/components/invoices/SendInvoiceDialog.tsx`, `rental/lib/send-invoice-i18n.ts` |
| **Substantive production file count** | 2 |
| **Visible scanner findings** | 5 |
| **Estimated hidden presentation literals** | ~12 |
| **Fixed-locale in scope** | 0 |
| **Expected new keys** | **~12–18 net** (after reusing `email.send.modal.*`, `common.cancel`) |
| **One-slice decision** | **ONE SLICE** |

---

## 14. Presentation inventory (selected target)

### Scanner-visible (5)

German dialog chrome, labels, actions, toast, description template fragments.

### Scanner-blind (~12)

| Item | Example |
|------|---------|
| Default body template | `` `Guten Tag,\n\nanbei erhalten Sie Ihre Rechnung ${number}...` `` |
| Validation toast | `Bitte Empfänger-E-Mail angeben` |
| Dialog title | `Rechnung per E-Mail senden` |
| Description | `` `Rechnung ${number} als PDF-Anhang versenden.` `` |
| Actions | `Abbrechen`, `Senden` |
| Field labels | Empfänger, Betreff, Nachricht, CC, BCC |

### Dynamic (must NOT translate)

- `displayNumber(invoice)` — invoice business number  
- `defaultToEmail`, `defaultSubject` from parent  
- User-entered email/subject/body text

---

## 15. Machine/domain freeze matrix

| Machine value | Used by | Presentation mapping? | Must remain unchanged |
|---------------|---------|----------------------|----------------------|
| `SendInvoiceEmailPayload.toEmail` | `onSend` | No (user input) | ✅ |
| `subject` | payload | No | ✅ |
| `bodyText` | payload | No | ✅ |
| `ccEmails[]` / `bccEmails[]` | payload | No | ✅ |
| `documentId` | payload | No | ✅ |
| `parseEmails` split logic | `[,;]` | No | ✅ |
| `invoice.id`, status, amounts | parent props | No | ✅ |
| Email validation gate | `!toEmail.trim()` | Message only | Condition unchanged |

**Semantic risk:** **PRESENTATION-ONLY SAFE**

---

## 16. Key reuse strategy

| Reuse (existing) | Purpose |
|------------------|---------|
| `common.cancel` | Cancel button |
| `email.send.modal.recipient` | Recipient label |
| `email.send.modal.subject` | Subject label |
| `email.send.modal.body` | Message label |
| `email.send.modal.cc` / `.bcc` | CC/BCC labels |
| `email.send.modal.send` | Send button |
| `email.send.modal.errorRequired` | Adapt for missing recipient (or narrow invoice-specific variant) |

**Recommended namespace for net-new:** `invoices.send.*` (dialog title, description, default body template, invoice-specific validation)

**Estimated net-new keys:** ~12–18

---

## 17. P222_ENFORCE_CLEAN_EXACT (proposed)

```
rental/components/invoices/SendInvoiceDialog.tsx
rental/lib/send-invoice-i18n.ts
```

No broad prefixes. No ignores/allowlists/exemptions.

---

## 18. Blind-spot guard plan

Future `hardcoded-copy-guard.test.ts` greps for:

- German send-invoice literals (`Rechnung per E-Mail`, `Bitte Empfänger`, `Guten Tag,`)
- Hardcoded `Abbrechen` / `Senden` in component
- Require `useLanguage` / `send-invoice-i18n` adapter usage
- Ban reintroduction of fixed default body template without translation key

---

## 19. Future test contract

Executable tests in `rental-send-invoice-dialog-localization.test.tsx`:

1. EN render — dialog title/labels  
2. DE render — dialog title/labels  
3. Runtime locale switch (remount pattern acceptable)  
4. `SendInvoiceEmailPayload` field names unchanged  
5. `parseEmails` behavior unchanged  
6. Validation: empty recipient blocks submit (condition unchanged)  
7. Default body uses localized template with **dynamic** `displayNumber` preserved  
8. `onSend` called with same payload shape  
9. No raw `TranslationKey` in DOM  
10. Inventory: P222 scoped findings = 0  

---

## 20. Category E contract

Baseline: `59b01928`. Required: **business/runtime modifications = 0**, **Category E = 0**.

---

## 21. Global i18n + shim freeze contract

Preserve: `npm run i18n:check` PASS, global enforce-clean debt 0, P221–P216 = 0, shim ≤ 29, new compat consumers = 0.

---

## 22. Implementation contract summary

**TITLE:** P2.2.22 — Rental Send Invoice Dialog Localization  
**BASE:** `59b01928a09598f36045a61fad031f0e44dcc1fc`  
**IN SCOPE:** `SendInvoiceDialog.tsx`, `send-invoice-i18n.ts`, `invoices.send.{en,de}.ts` (or reuse-heavy minimal additions), P222 guards/tests, architecture/changes bookkeeping  
**OUT OF SCOPE:** Invoice create (P221), invoice list (P214), invoice documents/timeline/notes panels, billing tenant drawers, Communication Center, Operator/Master surfaces, API/payload/permission changes

---

## 23. Final verdict

### **A — GO — P2.2.22 TARGET SELECTED**

**Selected target:** P2.2.22 — Rental Send Invoice Dialog Localization

---

**Auditor confirmations:**

- production code modified = **NO**  
- dictionaries modified = **NO**  
- tests modified = **NO**  
- scanner modified = **NO**  
- P2.2.22 implementation started = **NO**  
- merged = **NO**
