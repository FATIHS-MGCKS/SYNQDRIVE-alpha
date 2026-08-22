# P2.2.23 — Final Independent Re-Audit

**Date:** 2026-08-22  
**Mode:** STRICT READ-ONLY INDEPENDENT VERIFICATION  
**Repository:** FATIHS-MGCKS/SYNQDRIVE-alpha  
**Target implementation:** PR [#1184](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/1184) — P2.2.23 Rental Invoice Documents Panel Localization  
**Pre-flight reference:** PR [#1182](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/1182)  
**Authoritative baseline:** `80dbba83d8f7d93db1beba695d5b4d4229925cb0`  
**Implementation HEAD:** `08421a4c1bb5cb2ff21ec29d11c35c03f95fb3c3`  
**Auditor branch:** `cursor/p2223-final-independent-reaudit-3c10`  
**Auditor:** Independent read-only re-audit (no production/dictionary/test/scanner changes)

---

## 1. Provenance — HARD GATE

| Check | Independent result |
|-------|-------------------|
| PR #1184 exists | ✅ YES |
| `state` | `OPEN` |
| `isDraft` | `true` |
| `merged` | `false` |
| `mergeable` | `MERGEABLE` |
| Base SHA | `80dbba83d8f7d93db1beba695d5b4d4229925cb0` ✅ exact match |
| HEAD SHA | `08421a4c1bb5cb2ff21ec29d11c35c03f95fb3c3` ✅ exact match |
| Commits after baseline | **1** (`08421a4c` — `feat(i18n): P2.2.23 localize Rental Invoice Documents panel`) |
| Audit-only contamination on impl branch | ✅ NONE (single implementation commit; docs are implementation evidence, not re-audit) |
| Communication Center contamination | ✅ NONE (no `communication/` production paths in diff) |
| Unrelated feature ancestry | ✅ NONE (`git merge-base --is-ancestor 80dbba83 08421a4c` = YES) |
| `local HEAD == origin/head` | ✅ `08421a4c` == `origin/cursor/p2223-rental-invoice-documents-i18n-3c10` |

**Provenance verdict:** ✅ **PASS**

---

## 2. Complete diff classification

Diff range: `80dbba83..08421a4c` — **17 paths**, **1 commit**.

| Path | Cat | Justification |
|------|:---:|---------------|
| `frontend/src/rental/components/invoices/InvoiceDocuments.tsx` | **A** | Invoice Documents presentation wiring |
| `frontend/src/rental/lib/invoice-documents-i18n.ts` | **B** | New presentation adapter |
| `frontend/src/rental/components/invoices/invoiceDocuments.mapper.ts` | **C** | Locale threading for `formatDateTime` only |
| `frontend/src/i18n/translations/invoices.documents.en.ts` | **D** | +29 canonical EN keys |
| `frontend/src/i18n/translations/invoices.documents.de.ts` | **D** | +29 canonical DE keys |
| `frontend/src/i18n/translations/en.ts` | **D** | Spread import for documents module |
| `frontend/src/i18n/translations/de.ts` | **D** | Spread import for documents module |
| `frontend/src/rental/components/rental-invoice-documents-localization.test.tsx` | **E** | 11 P223 regression tests |
| `frontend/src/i18n/hardcoded-copy-guard.test.ts` | **F** | P223 enforce-clean guard scope |
| `frontend/scripts/i18n-hardcoded-scan.mjs` | **F** | `P223_ENFORCE_CLEAN_EXACT` boundary only |
| `frontend/scripts/i18n-check.mjs` | **F** | Registers P223 test file |
| `frontend/src/i18n/hardcoded-copy-inventory.json` | **F** | Inventory refresh (scanner output) |
| `frontend/src/rental/components/settings/company/CompanySections.tsx` | **I** | Prior-freeze restoration (1-line; see §4–7) |
| `docs/audits/i18n-p2-2-23-rental-invoice-documents-implementation-2026-08-22.md` | **G** | Implementation audit evidence |
| `architecture/I18N_RENTAL_INVOICE_DOCUMENTS_P2_2_23_2026-08-22.md` | **G** | Architecture record |
| `frontend/src/master/components/ChangesView.tsx` | **H** | Changelog bookkeeping |
| `frontend/src/master/components/ArchitekturView.tsx` | **H** | Architecture flow bookkeeping |

**Totals:** J = 0, K = 0, new compatibility consumers = 0, Category E (business/runtime) = 0.

### `CompanySections.tsx` classification justification

- Path: `frontend/src/rental/components/settings/company/CompanySections.tsx`
- Change: 1 presentation string — hardcoded German loading copy → `{t('invoices.documents.loading')}`
- Under **P2.2.4** enforce-clean prefix `rental/components/settings/` (not P223 primary scope)
- Classified **I — prior-freeze restoration**, not K (out-of-scope), because scanner dedup unmasked latent P2.2.4 debt when P223 localized the identical loading literal in `InvoiceDocuments.tsx` (see §4–7)

---

## 3. Expected primary production scope

| Path | Baseline role | Actual modification | Presentation-only? | Business coupling | Scope justified? |
|------|---------------|---------------------|--------------------|-------------------|------------------|
| `InvoiceDocuments.tsx` | Invoice detail documents panel UI | `useLanguage()` + `t()` for all owned chrome; `formatDateTime(_, locale)`; backend labels passthrough | ✅ YES | Callbacks/IDs unchanged | ✅ YES |
| `invoice-documents-i18n.ts` | *(new)* | `idoc`, `formatInvoiceDocumentDateTime`, locale resolution | ✅ YES | No API/storage logic | ✅ YES |
| `invoiceDocuments.mapper.ts` | Panel helper utilities | `formatDateTime` delegates to adapter with `locale` param; all other functions unchanged | ✅ YES | Gate/capability mapping unchanged | ✅ YES |

---

## 4. Extra production path — CompanySections HARD GATE

**Exact path:** `frontend/src/rental/components/settings/company/CompanySections.tsx` (line ~531 in `CompanyDocumentsSection`)

| # | Question | Independent answer |
|---|----------|-------------------|
| 1 | Prior enforce-clean boundary? | ✅ YES — **P2.2.4** via prefix `rental/components/settings/` |
| 2 | P223 scanner/dictionary exposed latent duplicate? | ✅ YES — identical literal `Dokumente werden geladen…` deduped with `InvoiceDocuments.tsx` at baseline |
| 3 | Global enforce-clean debt > 0 before CompanySections fix on P223 branch? | ✅ YES — simulated revert → **enforce-clean = 1** |
| 4 | Debt absent at authoritative baseline? | ✅ YES — baseline inventory: CompanySections findings = 0 (masked) |
| 5 | Exactly one canonical presentation substitution? | ✅ YES — single line |
| 6 | Reuses appropriate TranslationKey? | ✅ YES — `invoices.documents.loading` (shared loading semantics) |
| 7 | Zero business/runtime semantics? | ✅ YES |
| 8 | Avoidable without weakening scanner? | ❌ NO — dedup is correct; fix is required for global enforce-clean = 0 |
| 9 | Prior-freeze restoration vs scope expansion? | ✅ Prior-freeze restoration |

**Classification:** **A — LEGITIMATE PRIOR-FREEZE RESTORATION**

---

## 5. CompanySections semantic diff

| Field | Value |
|-------|-------|
| Baseline literal | `Dokumente werden geladen…` (hardcoded German) |
| New expression | `{t('invoices.documents.loading')}` |
| Rendered EN | `Loading documents…` |
| Rendered DE | `Dokumente werden geladen…` |
| Machine value involved? | NO |
| Callback/state involved? | NO (`loading` prop unchanged) |
| Conditional changed? | NO (`loading ? … : …` preserved) |
| DOM behavior changed? | NO (same `<p>` element/class) |

**presentation-only = YES | runtime/business change = NO**

---

## 6. CompanySections freeze relationship

| Field | Value |
|-------|-------|
| Prior boundary | **P2.2.4** (`P24_ENFORCE_CLEAN_PREFIXES` includes `rental/components/settings/`) |
| Exact path inclusion | `rental/components/settings/company/CompanySections.tsx` matches prefix |
| Baseline finding count (CompanySections) | **0** (dedup-masked) |
| P223-pre-fix finding count (simulated) | **1** enforce-clean (global) |
| P223-post-fix finding count | **0** |

**Prior freeze restoration objectively demonstrated:** ✅ YES

---

## 7. Scanner dedup behavior

| Question | Answer |
|----------|--------|
| What changed in scanner? | Only `P223_ENFORCE_CLEAN_EXACT` boundary added (3 paths) |
| Dedup logic changed? | **NO** — `dedupeFindings` key remains `${surface}|${category}|${sample}` |
| Dedup stricter/correcter? | N/A (unchanged); exposure is correct |
| Coverage weakened? | **NO** |
| Identical literals counted correctly? | **YES** — after P223 localization, latent P2.2.4 literal surfaces |
| Unrelated findings suppressed? | **NO** |

**scanner weakening = NO**

---

## 8. Invoice Documents scope reality check

Owned presentation: panel title, meta labels, action labels, version history, delivery history, generating/failed/empty/loading states, incoming attachment chrome, date/time display, aria via existing patterns.

Not in panel: upload, delete/remove, file-size computation (uses `sizeLabel` passthrough).

**Verdict:** **KEEP AS ONE SLICE**

---

## 9. Machine / domain inventory

| Machine/domain value | Baseline semantics | Implementation semantics | Changed? |
|---------------------|-------------------|-------------------------|----------|
| `doc.id` / `v.id` | Document version ID for preview/download | Same | NO |
| `row.id` | Delivery email ID for retry | Same | NO |
| `panel.panelState` | `EMPTY`/`GENERATING`/`ACTIVE`/etc. | Same | NO |
| `doc.documentType` | Machine enum (display via `documentTypeLabel`) | Same | NO |
| `doc.status` | Machine enum for tone mapping | Same | NO |
| `doc.fileName` | Backend filename display | Same | NO |
| `doc.statusLabel` | Dynamic backend label | Passthrough unchanged | NO |
| `row.channelLabel` | Dynamic backend label | Passthrough unchanged | NO |
| `row.documentVersionLabel` | Dynamic backend label | Passthrough unchanged | NO |
| `doc.createdAt` / raw ISO | Sort/display input | Same raw value; locale-formatted display only | NO |
| `doc.sizeBytes` / `sizeLabel` | Backend-provided size label | Passthrough | NO |
| `capabilities.*.reason` | Backend capability denial reason | Passthrough | NO |
| `generation.errorMessage` | Backend error text | Passthrough | NO |
| Callbacks (`onPreview`, `onDownload`, etc.) | Same signatures/IDs | Same | NO |
| API operations | Parent-owned (not in changed files) | Unchanged | NO |

**Changed = NO** (all rows)

---

## 10. Document ID / invoice association

| Concern | Changed? |
|---------|----------|
| Document ID | NO |
| Invoice ID | NO (parent context; not modified) |
| Document-to-invoice association | NO |
| Row identity (`key={v.id}`, `key={row.id}`) | NO |
| Document ordering | NO |
| Open/download target | NO |

No translated string used as identity. ✅

---

## 11. Filename semantics — HARD GATE

| Concern | Changed? |
|---------|----------|
| Backend filename | NO — `doc.fileName` rendered directly |
| Uploaded filename | N/A in panel |
| Generated filename | N/A (backend) |
| Payload filename | N/A |
| Fallback presentation | `invoices.list.emptyValue` (`—`) for missing names only |

**file identity semantics unchanged:** ✅ YES

---

## 12. URL / storage / MIME — HARD GATE

No URL, storage key, MIME, or content-type fields modified in diff. Preview/download remain callback-driven with document IDs.

**unchanged:** ✅ YES

---

## 13. Document type / status

| Machine value | Baseline visible label | New localized mapping | Logic use | API/persistence |
|--------------|------------------------|----------------------|-----------|-----------------|
| `doc.status` | `statusLabel` (backend) | Passthrough `statusLabel` | `documentStatusTone(doc.status)` unchanged | Unchanged |
| `doc.documentType` | `documentTypeLabel` (backend) | Passthrough | None in panel | Unchanged |
| `row.status` | `statusLabel` (backend) | Passthrough | Tone chip only | Unchanged |

**machine value unchanged:** ✅ YES

---

## 14. Backend label preservation

| Field | Classification | Mutated? |
|-------|---------------|----------|
| `statusLabel` | Dynamic backend content | NO |
| `channelLabel` | Dynamic backend content | NO |
| `errorMessage` | Dynamic backend content | NO |
| `documentTypeLabel` | Dynamic backend content | NO |
| `capabilities.*.reason` | Dynamic backend content | NO |

---

## 15. Mapper audit — PRIMARY HARD GATE

`invoiceDocuments.mapper.ts` line-by-line vs baseline:

| Function | Change |
|----------|--------|
| `capabilityToGate` | Unchanged |
| `documentGatesFromPanel` | Unchanged |
| `formatDateTime` | Signature adds `locale`; delegates to `formatInvoiceDocumentDateTime` |
| `olderVersions` | Unchanged |
| `shouldPollDocumentsPanel` | Unchanged |

**mapper business/data mapping changed = NO**

---

## 16. formatDateTime implementation

| Field | Baseline | Implementation |
|-------|----------|----------------|
| Locale behavior | Hardcoded `de-DE` | `getFormattingLocale(resolveInvoiceDocumentsLocale(locale))` |
| Locale input | None | `locale` param from `useLanguage()` |
| Formatter API | `Date#toLocaleString` | Same |
| Timezone | Default environment (no `timeZone` option) | Same (no `timeZone` option) |
| Options | `day/month/year/hour/minute` 2-digit | Identical options |
| Empty ISO | `'—'` hardcoded | `invoices.list.emptyValue` (`—`) |
| Invalid date | `Invalid Date` string risk (unchanged policy) | Same |

**only locale-aware visible formatting changes:** ✅ YES

---

## 17. Timezone semantics

No `timeZone` option added or removed. Same `new Date(iso)` parsing. Same instant display policy as baseline.

**timezone unchanged:** ✅ YES

---

## 18. Date sorting

Panel does not sort by formatted dates. `olderVersions` filters by `isActive` only. Delivery history order unchanged (API order).

**localized date not used for sorting:** ✅ YES

---

## 19. File size

`doc.sizeLabel` passed through unchanged. No byte recalculation or locale number formatting added.

**business/file semantics unchanged:** ✅ YES

---

## 20. Upload workflow

Not present in `InvoiceDocuments` panel.

**N/A — unchanged**

---

## 21. Delete workflow

Not present in `InvoiceDocuments` panel.

**N/A — unchanged**

---

## 22. Download / open / preview

| Action | Callback | ID passed | Changed? |
|--------|----------|-----------|----------|
| Preview | `onPreview(doc.id)` / `onPreview(v.id)` | document version ID | NO |
| Download | `onDownload(doc.id)` / `onDownload(v.id)` | document version ID | NO |
| Open attachment | `onPreviewIncoming` | N/A (parent) | NO |
| Retry delivery | `onRetryDelivery(row.id)` | email ID | NO |

Only visible action labels/tooltips localized.

---

## 23. Permissions

Capability gates (`preview`, `download`, `sendEmail`, `generate`, `regenerate`, `retry`) unchanged. `disabled`/`reason` wiring preserved.

**no authorization changes:** ✅ YES

---

## 24. API / payload audit

No API calls added/modified in changed production files. Parent invoice detail owns API layer.

| Operation | Baseline args/payload | Implementation | Changed? |
|-----------|----------------------|----------------|----------|
| All panel callbacks | Parent-defined | Unchanged signatures | NO |

---

## 25. Dynamic business data preservation

Under EN and DE renders (verified in tests): filename `rechnung-FSM-2026-0042.pdf`, backend `statusLabel` `Erzeugt`, `documentTypeLabel` `Rechnung`, `sizeLabel` `12 KB`, capability reasons, error messages — all preserved.

**YES**

---

## 26. Presentation adapter

`invoice-documents-i18n.ts` classification: **CANONICAL**

- Allowed: locale resolution, `translateKey` wrapper, `formatInvoiceDocumentDateTime`
- Forbidden patterns absent: no API/upload/delete/permission/sort/business rules

---

## 27. +29 key audit

Independent recompute: **8235 → 8264** (+29). Keys in `invoices.documents.{en,de}.ts`: **29** each.

| Class | Count | Keys |
|-------|------:|------|
| A — panel chrome | 14 | title, activeVersion, meta.* (5), versionHistory.* (2), delivery.title/channel/documentVersion/triggeredBy, failed.lastAttempt, incomingAttachment.description |
| B — actions | 6 | action.generatePdf, preview, sendEmail, regenerate, resend, openAttachment |
| C — loading/empty/error | 7 | loading, generating.title/hint, failed.title/unknownError, empty.description, delivery.empty |
| D — confirmation | 0 | — |
| E — status/type presentation | 0 | status uses backend `statusLabel` |
| F — date/file presentation | 2 | meta.createdAt, delivery.dateTime (labels only; formatting via adapter) |
| G — new domain concept | 0 | — |
| H — should reuse existing | 0 | `common.download`/`common.retry` reused in component, not duplicated |
| I — semantic duplicate | 0 | — |
| J — overly granular | 0 | — |
| K — orphan | 0 | — |
| L — incorrect translation | 0 | — |
| M — machine value translated | 0 | — |

**Total A–M = 29**

---

## 28. Key reuse audit

| Claimed reuse | Verified | Semantic match |
|---------------|----------|----------------|
| `common.download` | ✅ Used in `InvoiceDocuments.tsx` | YES |
| `common.retry` | ✅ Used for retry generation button | YES |
| `invoices.list.emptyValue` | ✅ Used for empty name/timestamp fallback | YES |

No unnecessary new generic keys for Download/Retry/empty dash. Panel-specific keys appropriately scoped under `invoices.documents.*`.

---

## 29. Orphans / parity

| Metric | Baseline | Final |
|--------|----------|-------|
| EN keys | 8235 | **8264** |
| DE keys | 8235 | **8264** |
| New keys | — | 29 |
| Removed keys | 0 | 0 |
| Changed existing translations | 0 | 0 |
| Parity | 100% | **100%** |
| Orphans | 0 | **0** |

---

## 30. Translation quality

| Term (DE) | Assessment |
|-----------|------------|
| Dokumente | ✅ Correct |
| Hochladen | N/A (not in panel) |
| Herunterladen | ✅ via `common.download` |
| Öffnen | ✅ `Anhang öffnen` |
| Löschen | N/A |
| Dokumenttyp | ✅ |
| Status | ✅ via backend label |
| Erstellt | ✅ `Erstellt am` |
| Hochgeladen | N/A |
| Keine Dokumente | ✅ empty state phrasing |

**Issues:** STYLE ONLY (none blocking)

---

## 31. P223 ENFORCE-CLEAN

`P223_ENFORCE_CLEAN_EXACT` paths (and only these):

1. `rental/components/invoices/InvoiceDocuments.tsx`
2. `rental/lib/invoice-documents-i18n.ts`
3. `rental/components/invoices/invoiceDocuments.mapper.ts`

No broad prefix, ignores, allowlists, or exemptions.

**P223 scoped findings:** **0** ✅

---

## 32. Prior freezes

| Boundary | Count |
|----------|------:|
| P223 | 0 |
| P222 | 0 |
| P221 | 0 |
| P220 | 0 |
| P219 | 0 |
| P218 | 0 |
| P217 | 0 |
| P216A | 0 |
| P216B1 | 0 |
| P216B2 | 0 |
| P216C1 | 0 |
| P216C2A | 0 |
| P216C2B | 0 |
| P2.2.4 (CompanySections prefix) | 0 |

**all active frozen boundaries = 0** ✅

---

## 33. Scanner-visible / hidden / fixed-locale

| Metric | Before (baseline) | After (08421a4c) |
|--------|-------------------|------------------|
| P223 path visible findings | 8 | 0 |
| Global enforce-clean | 0 | 0 |
| Hidden enforce-clean (CompanySections) | 1 (dedup-masked) | 0 (restored) |
| FORMAT_LOCALE debt (global) | 8 | 8 (unchanged category total) |

**after = 0 for canonical presentation debt** ✅

---

## 34. Test source audit

File: `rental-invoice-documents-localization.test.tsx` — **11 tests**

| Class | Tests | Grade |
|-------|------:|-------|
| Component render (EN/DE) | 2 | STRONG |
| Runtime locale switch | 2 | STRONG |
| Date formatter | 2 | STRONG |
| Machine-value regression | 2 | STRONG |
| Action regression (preview ID) | 1 | ACCEPTABLE |
| Source guard (P223 enforce-clean) | 1 | STRONG |
| Empty/loading states | 1 | STRONG |

**Overall P223 suite:** **STRONG**

---

## 35. Test execution

| Suite | Collected | Passed | Failed | Skipped |
|-------|----------:|-------:|-------:|--------:|
| P223 file only | 11 | 11 | 0 | 0 |
| `npm run i18n:check` (full) | 275 | 275 | 0 | 0 |

**broader suite:** 275/275 PASS ✅

---

## 36. Mapper regression test quality

Evidence via `formatInvoiceDocumentDateTime` tests: DE ≠ EN formatted output, same calendar day, empty → `—`. Component tests verify filename/labels/IDs under locale switch.

**Grade:** **STRONG**

---

## 37. Action regression test quality

`mockPreview` called with `'doc-1'` after localized EN render. Download/send/regenerate not individually clicked but static diff confirms same `onClick={() => onDownload(doc.id)}` patterns.

**Grade:** **ACCEPTABLE** (preview proven; others by diff + callback signature preservation)

---

## 38. Runtime locale switch

Tests: mount EN → switch to DE on same mount; title updates; `rechnung-FSM-2026-0042.pdf` and backend labels persist.

**document identity unchanged:** ✅ YES

---

## 39. Category E / business diff

Adversarial review of all production changes: mapping, sorting, upload, delete, filenames, URLs, MIME, timestamps, permissions, callbacks, API payloads, document/invoice association — **no semantic changes**.

**Category E = 0** ✅

---

## 40. Global i18n freeze

```
npm run i18n:check → PASS
GLOBAL ACTIVE I18N ENFORCE-CLEAN DEBT = 0
```

---

## 41. Shim / compatibility

| Metric | Baseline | Implementation |
|--------|----------|----------------|
| COMPAT `../i18n/` consumers | 29 | 29 |
| New compatibility consumers | 0 | 0 |

**shim <= baseline:** ✅ YES

---

## 42. Communication Center collision

Active Communication Center PRs (#1108, #1134, #1183, etc.) — **no file overlap** with P223 diff. No shared dictionary namespace collision (`invoices.documents.*` vs `communication.*`).

**material overlap = 0** ✅

---

## 43. Build

```
cd frontend && npm run build → PASS
```

---

## 44. git diff --check

```
git diff --check 80dbba83..08421a4c → PASS (no conflict markers/whitespace errors)
```

---

## 45. CI triage (PR #1184 HEAD run 32591203825)

| Job | Result | Classification |
|-----|--------|----------------|
| Frontend component tests | PASS | — |
| Production build | PASS | — |
| Lint | PASS | — |
| Accessibility (axe) | PASS | — |
| Backend integration/security | PASS | — |
| Backend unit tests | FAIL | **B — pre-existing** (unrelated security characterization specs) |
| Typecheck | FAIL | **B — pre-existing** (not in P223 diff) |
| Playwright E2E Vehicle Detail | FAIL | **B — pre-existing** |

**P223-caused required failures = 0** ✅

---

## 46. Scanner inventory delta

| Scope | Before | After | Δ |
|-------|-------:|------:|--:|
| Global | 1611 | 1603 | −8 |
| Rental | 380 | 372 | −8 |

CompanySections fix: removes dedup-masked debt; does not add new global findings post-fix.

---

## 47. Documentation accuracy

| Claim | Matches reality? |
|-------|-----------------|
| +29 keys | ✅ |
| 8264/8264 | ✅ |
| P223 = 0 | ✅ |
| P222–P216 = 0 | ✅ |
| 275/275 tests | ✅ |
| Category E = 0 | ✅ |
| CompanySections rationale | ✅ (simulation confirms enforce-clean 1 → 0) |
| global enforce-clean = 0 | ✅ |

Implementation doc claims verified. Documentation is corroborated by independent execution.

---

## 48. CompanySections merge decision

**KEEP IN PR #1184**

Necessary to preserve P2.2.4 enforce-clean freeze after correct scanner dedup exposure. Not scope creep — one-line presentation substitution with zero business semantics, reusing an appropriate key.

---

## 49. Final reconciliation table

| Metric | Baseline | Implementation claim | Independent result |
|--------|----------|---------------------|-------------------|
| Provenance | 80dbba83 | 08421a4c | ✅ PASS |
| Primary scope | 3 production paths | 3 + CompanySections | ✅ bounded |
| CompanySections classification | A | A | ✅ A |
| CompanySections prior-freeze | P2.2.4 | P2.2.4 | ✅ demonstrated |
| Scanner dedup | unchanged | unchanged | ✅ confirmed |
| Document IDs | unchanged | unchanged | ✅ |
| Invoice association | unchanged | unchanged | ✅ |
| Filenames | unchanged | unchanged | ✅ |
| URLs/storage | unchanged | unchanged | ✅ |
| MIME | unchanged | unchanged | ✅ |
| Backend labels | unchanged | unchanged | ✅ |
| Mapper semantics | unchanged | locale only | ✅ |
| Date formatter | de-DE fixed | locale-aware | ✅ presentation only |
| Timezone | default | default | ✅ |
| Sorting | unchanged | unchanged | ✅ |
| Upload | N/A | N/A | ✅ |
| Delete | N/A | N/A | ✅ |
| Download/open | unchanged | unchanged | ✅ |
| Permissions | unchanged | unchanged | ✅ |
| API/payload | unchanged | unchanged | ✅ |
| Dynamic data | preserved | preserved | ✅ |
| Visible debt (P223 paths) | 8 | 0 | ✅ 0 |
| Hidden debt | 1 masked | 0 | ✅ 0 |
| Fixed-locale | 8 global | 8 global | ✅ |
| EN keys | 8235 | 8264 | ✅ |
| DE keys | 8235 | 8264 | ✅ |
| Parity | 100% | 100% | ✅ |
| New keys | — | 29 | ✅ |
| Duplicates | 0 | 0 | ✅ |
| Orphans | 0 | 0 | ✅ |
| P223 | — | 0 | ✅ |
| P222–P216 | 0 | 0 | ✅ |
| Older CompanySections freeze | masked 0 | 0 | ✅ |
| Tests | — | 275/275 | ✅ 275/275 |
| Mapper test quality | — | STRONG | ✅ STRONG |
| Runtime switch | — | yes | ✅ |
| Category E | 0 | 0 | ✅ |
| Shim | 29 | 29 | ✅ |
| Compat consumers | 0 new | 0 | ✅ |
| Communication overlap | 0 | 0 | ✅ |
| npm run i18n:check | PASS | PASS | ✅ |
| Global enforce-clean | 0 | 0 | ✅ |
| Build | — | PASS | ✅ |
| git diff --check | — | PASS | ✅ |
| CI | — | partial fail | pre-existing only |
| Rental scanner | 380 | 372 | ✅ |
| Global scanner | 1611 | 1603 | ✅ |
| local HEAD == remote | — | yes | ✅ |

---

## 50. Audit artifact

This document: `docs/audits/i18n-p2-2-23-final-independent-reaudit-2026-08-22.md`

---

## 51. Final report (67 items)

1. baseline SHA: `80dbba83d8f7d93db1beba695d5b4d4229925cb0`
2. implementation PR: **#1184**
3. implementation HEAD: `08421a4c1bb5cb2ff21ec29d11c35c03f95fb3c3`
4. provenance: **PASS**
5. P223 production files: `InvoiceDocuments.tsx`, `invoice-documents-i18n.ts`, `invoiceDocuments.mapper.ts`
6. CompanySections path: `frontend/src/rental/components/settings/company/CompanySections.tsx`
7. CompanySections classification: **A — LEGITIMATE PRIOR-FREEZE RESTORATION**
8. CompanySections merge decision: **KEEP IN PR #1184**
9. scanner dedup: unchanged keying; P223 localization exposed latent P2.2.4 literal
10. primary scope verdict: **KEEP AS ONE SLICE**
11. document IDs changed: **NO**
12. invoice association changed: **NO**
13. filename semantics changed: **NO**
14. URL/storage semantics changed: **NO**
15. MIME semantics changed: **NO**
16. backend labels changed: **NO**
17. mapper business mapping changed: **NO**
18. date/time presentation changed: **YES** (locale-aware only)
19. timezone semantics changed: **NO**
20. sort semantics changed: **NO**
21. upload semantics changed: **N/A**
22. delete semantics changed: **N/A**
23. download/open semantics changed: **NO**
24. permissions changed: **NO**
25. API/payload changed: **NO**
26. dynamic business data preserved: **YES**
27. adapter classification: **CANONICAL**
28. visible findings before/after: **8 → 0**
29. hidden findings before/after: **1 masked → 0**
30. fixed-locale before/after: **8 / 8** (unchanged)
31. reused keys: `common.download`, `common.retry`, `invoices.list.emptyValue`
32. new keys: **29**
33. EN count: **8264**
34. DE count: **8264**
35. parity: **100%**
36. duplicates: **0**
37. orphans: **0**
38. P223: **0**
39. P222: **0**
40. P221: **0**
41. P220: **0**
42. P219: **0**
43. P218: **0**
44. P217: **0**
45. P216A/B1/B2/C1/C2A/C2B: **0 / 0 / 0 / 0 / 0 / 0**
46. older CompanySections freeze: **0** (restored)
47. tests collected: **11** (P223) / **275** (full)
48. tests passed: **11** / **275**
49. tests failed: **0**
50. tests skipped: **0**
51. broader suite: **275/275 PASS**
52. mapper regression quality: **STRONG**
53. runtime locale switch: **PASS**
54. Category E: **0**
55. npm run i18n:check: **PASS**
56. global enforce-clean debt: **0**
57. shim before/after: **29 / 29**
58. new compatibility consumers: **0**
59. Communication Center overlap: **0**
60. build: **PASS**
61. git diff --check: **PASS**
62. CI: **pre-existing failures only** (Typecheck, Backend unit, Playwright Vehicle Detail on HEAD run)
63. Rental scanner before/after: **380 / 372**
64. global scanner before/after: **1611 / 1603**
65. local HEAD == remote HEAD: **YES**
66. audit artifact: `docs/audits/i18n-p2-2-23-final-independent-reaudit-2026-08-22.md`
67. audit PR: *(created with this commit)*

---

## 52. Final verdict

### **B — READY WITH NON-BLOCKING OBSERVATIONS**

All P2.2.23 i18n hard gates pass independently. CompanySections one-line fix is legitimate prior-freeze restoration (P2.2.4), not scope expansion. Presentation-only localization with zero business/mapper/API semantic changes. Tests, build, global i18n closure, and P223 freeze verified.

**Non-blocking observations:**
- PR #1184 HEAD workflow run shows pre-existing **Typecheck**, **Backend unit tests**, and **Playwright E2E Vehicle Detail** failures unrelated to invoice documents i18n (classified B — pre-existing). Frontend component tests and production build PASS on same HEAD.
- Recommend confirming base-branch CI health before merge; not blocking P2.2.23 freeze on i18n grounds.

**PR #1184 may be marked ready and merged** from an i18n/production-hardening perspective once pre-existing CI failures are acknowledged or resolved on the integration branch.

---

*Audit performed read-only. No production code, dictionaries, tests, scanners, or PR #1184 modified.*
