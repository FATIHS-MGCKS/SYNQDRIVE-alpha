# P2.2.12 — Rental Fines localization — Final independent re-audit

**Date:** 2026-08-21  
**Auditor mode:** Strict read-only independent verification  
**Target implementation:** PR #1098 — `cursor/p2212-rental-fines-i18n-3c10`  
**Program baseline:** `26d5e442f43097981f0c19d5a200c410f9d09793` (post–P2.2.11 / PR #1095)

---

## 1. Provenance (independently verified)

| Check | Expected | Independent result |
|-------|----------|-------------------|
| PR #1098 exists | yes | **Confirmed** — open Draft PR |
| PR state | OPEN | **OPEN** (`isDraft: true`) |
| PR base branch | post-P2.2.11 tip | `cursor/p227b-voice-telephony-test-center-preflight-3c10` |
| PR base SHA | `26d5e442…` | **`26d5e442f43097981f0c19d5a200c410f9d09793`** ✓ |
| PR head branch | `cursor/p2212-rental-fines-i18n-3c10` | **Match** ✓ |
| PR head SHA | `6e5fc4f1…` | **`6e5fc4f1c7e096e0e7d788b09caa379d38e3f288`** ✓ |
| Ancestry from baseline | direct | **`26d5e442` is ancestor of head** ✓ |
| Commits on PR | 2 | `0b22d96b` (implementation), `6e5fc4f1` (docs) |
| P27B/P28/P29/P210/P211 ancestry on base | present | **Confirmed** on base branch history (#1095→#1086→#1082→#1078→P27B chain) |
| Local == remote HEAD | match | **Verified** on fetched `origin/cursor/p2212-rental-fines-i18n-3c10` |
| Audit branch as impl base | must not | **No** — branched from `26d5e442`, not #1097 |
| Unrelated commits | none | **14 files only** — all P2.2.12-scoped |

**Provenance verdict:** **PASS**

---

## 2. Complete diff classification

`git diff 26d5e442…6e5fc4f1` — 14 paths:

| Path | Class |
|------|-------|
| `rental/components/FinesView.tsx` | **A** presentation/i18n |
| `rental/lib/fines-i18n.ts` | **A** presentation/i18n |
| `i18n/translations/fines.{en,de}.ts` | **B** dictionary |
| `i18n/translations/en.ts`, `de.ts` | **B** dictionary (spread wiring) |
| `rental/components/rental-fines-localization.test.tsx` | **C** tests |
| `i18n/hardcoded-copy-guard.test.ts` | **C** tests |
| `scripts/i18n-hardcoded-scan.mjs` | **D** scanner/governance (P212 boundary only) |
| `i18n/hardcoded-copy-inventory.json` | **D** scanner artifact |
| `docs/audits/i18n-p2-2-12-rental-fines-implementation-2026-08-21.md` | **F** documentation |
| `architecture/I18N_RENTAL_FINES_P2_2_12_2026-08-21.md` | **F** documentation |
| `master/components/ChangesView.tsx` | **F** documentation |
| `master/components/ArchitekturView.tsx` | **F** documentation |

**Category E = 0**  
**Category G = 0**

---

## 3. Production scope

**Primary production files (verified):**

1. `frontend/src/rental/components/FinesView.tsx`
2. `frontend/src/rental/lib/fines-i18n.ts`

**Out-of-scope modules:** No changes to invoices, vendors, insurance, tenant billing, master finance, backend, or unrelated document modules.

**Supporting only:** dictionary modules, scanner/guards, tests, docs.

---

## 4. Business / machine semantics

Independent line-level comparison baseline → implementation:

| Domain | Verdict |
|--------|---------|
| Fine status machine values | **Unchanged** — same 7 enums (`NEW`…`CLOSED`) |
| OffenseType machine values | **Unchanged** — identical 9 German persisted strings |
| API calls | **Unchanged** — `api.fines.list/stats/get/create/update/uploadImage`, `vehicles.listByOrg` |
| Filter machine values | **Unchanged** — `'all'` + status enums; `f.status !== statusFilter` logic preserved |
| Status update payloads | **Unchanged** — `{ status }`, `{ notes }` |
| Create payload | **Unchanged** — `{ ...form, imageUrl }` shape |
| Document intake | **Unchanged** — `optionalContextType: 'FINE'`, `sourceSurface: 'fines_page'`, `returnView: 'fines'` |
| Amount/currency | **Unchanged** — cents math `Math.round(parseFloat * 100)`, default `EUR` |
| IDs / routes / permissions | **Unchanged** — no routing or permission edits |

**BUSINESS/RUNTIME SEMANTIC CHANGES = 0**

---

## 5. Status mapping architecture

`fines-i18n.ts` implements:

```
machine status → FINE_STATUS_LABEL_KEYS → fi(locale, key) → display label
```

`FinesView.tsx` uses `labelFineStatus(locale, statusFilter)` for chips/filters and `fineStatusStyle(status)` for styling (styles decoupled from labels). Status dropdown in detail uses `FINE_STATUS_VALUES.map` with machine `key` passed to `updateStatus(key)`.

Unknown status fallback: `labelFineStatus` → `'fines.status.NEW'` key; `fineStatusStyle` → `NEW` styles. **Safe.**

---

## 6. Offense type mapping architecture

```
German machine value → OFFENSE_TYPE_LABEL_KEYS → localized label
<option value={offenseType}>  // machine value unchanged
```

Baseline `OFFENSE_TYPES` array byte-identical to `FINE_OFFENSE_TYPE_VALUES`. Unknown offense → `'fines.offenseType.other'` display only; raw value never mutated.

No translation-key leakage in rendered EN test (`not.toMatch(/fines\.[a-zA-Z.]+/)`).

---

## 7. Filter / sort semantics

- **Filters:** UI labels via `labelFineStatus` / `t('fines.filters.*')`; state remains `'all' | FineStatusValue`. KPI chip actions still toggle `'NEW'` / `'RESOLVED'`.
- **Sort:** No sort control existed at baseline; none added. **N/A — no regression.**
- **Pagination:** Unchanged (client-side list).

Filter behavior identical; only presentation labels differ by locale.

---

## 8. Amount / currency

- Display: `formatFineAmount(locale, cents, currency)` replaces hardcoded `de-DE` formatter.
- Logic: `cents / 100`, `Math.round(parseFloat * 100)` unchanged.
- Currency code passed through unchanged.
- No translated currency strings enter state.

---

## 9. Date / time

- Baseline: fixed `'de-DE'` in component helpers.
- Implementation: `finesFormattingLocale()` → `'en-US'` (EN) / `'de-DE'` (DE) in `fines-i18n.ts` only.
- `FinesView.tsx`: **no** remaining hardcoded `de-DE` / `en-US`.
- Sorting/comparison uses raw ISO strings / Date objects, not formatted text.

---

## 10. Document / evidence semantics

- Filenames, mime accept (`image/*,application/pdf`), upload API, preview URLs unchanged.
- Only alt text / section labels localized (`fines.form.previewAlt`, `fines.detail.documentAlt`).

---

## 11. Scanner / P212 boundary

**P212_ENFORCE_CLEAN_EXACT (verified in diff):**

1. `rental/components/FinesView.tsx`
2. `rental/lib/fines-i18n.ts`

No prefix expansion, ignores, allowlists, or exemptions added. Prior P27B/P28/P29/P210/P211 boundaries unchanged.

**Independent P212 findings:** **0**  
**Prior frozen boundaries:** P27B 0, P28 0, P29 0, P210 0, P211 0

---

## 12. Blind-spot verification

Manual inspection + grep guards in `hardcoded-copy-guard.test.ts`:

| Area | Before (est.) | After |
|------|---------------|-------|
| Status maps in component | German labels in `STATUS_MAP` | Moved to `fines.status.*` keys |
| Offense options | label=value German | value=machine, label localized |
| KPI/filter/table/form/detail copy | ~60 hidden literals | **`t('fines.*')` / helpers** |
| Fixed de-DE formatters | in component | locale-aware in adapter |

**Hidden presentation literals in P212 scope after:** **0**

Blind-spot guards ban `Bußgelder`, `STATUS_MAP`, `OFFENSE_TYPES`, `toLocaleDateString('de-DE'`, etc. — would fail on reintroduction.

---

## 13. Dictionary audit

| Metric | Value |
|--------|-------|
| Canonical EN/DE | **7292 / 7292 (100%)** |
| Net delta | **+82** (7210 → 7292) |
| `fines.en.ts` keys | **93** (11 legacy + 82 new) |
| Legacy keys wired in FinesView UI | **6** of 11 (`title`, `searchPlaceholder`, `totalFines`, `totalAmount`, `noFines`, `fineNumber`) |
| Cross-namespace reuse | **7** (`common.back/cancel/save/edit`, `tasks.filter.status.*`) |

**New key classification (82 keys):**

| Class | Count | Notes |
|-------|-------|-------|
| A — genuinely new Fines concept | **75** | status/offense display, filters, form, detail, metrics, columns |
| B — context-specific presentation | **7** | e.g. `fines.metric.*`, `fines.filters.statusActive` |
| C — should have reused existing | **0** blocking |
| D — unnecessary duplicate | **0** blocking |
| E — incorrect/misleading translation | **0** |
| F — orphan/unreferenced in UI | **5** non-blocking legacy (`uploadFine`, `openFines`, `points`, `uploadNotice`, `drivingBan`) — pre-existed unwired; not introduced by P2.2.12 |

**+82 justification:** FinesView monolith (~35 scanner + ~60 blind-spot strings) required structured namespaces (`fines.form.*`, `fines.detail.*`, `fines.status.*`, `fines.offenseType.*`). Count above pre-flight estimate (~40–55) reflects full form + detail panel coverage, not quota chasing.

---

## 14. EN/DE copy quality

Operational terminology reviewed — natural DE fleet/rental phrasing (`Bußgelder`, `Aktenzeichen`, `Vergehensart`, `Behörde`). EN reads cleanly (`Traffic fines`, `Case number`, `Under review`).

**Issues:** STYLE ONLY — legacy keys retain EN strings from pre-P2.2.12 inline dictionary without UI wiring yet.

---

## 15. Test quality

**Grade: ACCEPTABLE** (not STRONG)

| Requirement | Covered |
|-------------|---------|
| Real LanguageProvider | ✓ |
| EN/DE FinesView render | ✓ |
| Status/offense display localization | ✓ |
| Machine status/offense/filter values | ✓ |
| Locale formatting | ✓ |
| P212 enforce-clean | ✓ |
| Blind-spot guard patterns | ✓ (in guard suite) |
| Empty/error/retry states | **Partial** — empty state via list render; no dedicated error/retry interaction test |
| Filter interaction → machine value | **Not tested** (structural source assertion only) |

Missing tests are **non-blocking** for merge readiness (same pattern as P2.2.11 re-audit B).

---

## 16. Independent validation (re-run on PR head `6e5fc4f1`)

| Command | Result |
|---------|--------|
| `npm test -- rental-fines-localization.test.tsx hardcoded-copy-guard.test.ts` | **33/33 PASS** |
| `npm run i18n:check` | **PASS** (7292/7292) |
| `npm run build` | **PASS** |
| `node scripts/i18n-hardcoded-scan.mjs` | Global **1854**, P212 **0**, enforce-clean **0** |
| `node scripts/i18n-shim-inventory.mjs` | **29** (18 prod / 11 test) |
| P27B/P28/P29/P210/P211 regression | **0 findings each** |

---

## 17. Metrics reconciliation

| Metric | Baseline (`26d5e442` inventory) | Impl claim | Independent |
|--------|-----------------------------------|------------|-------------|
| Global | 1875 | 1854 | **1854** |
| Rental | 586 | 565 | **565** |
| Master | 1049 | 1049 | **1049** |
| Operator | 180 | 180 | **180** |
| SHARED | 35 | — | **35** |
| SHELL | 25 | — | **25** |
| P212 (FinesView+boundary) | 35 | 0 | **0** |
| Canonical EN/DE | 7210 | 7292 | **7292 / 100%** |
| Shim | 29 | 29 | **29** |

### Global −21 vs P212 −35 explained

Per-file inventory delta (baseline frozen JSON vs post-PR rescan):

- `FinesView.tsx`: **−35** (full P212 remediation)
- **Unrelated unchanged files gained +14** on full rescan:
  - `CreateInvoiceDialog.tsx` **+10**
  - `VendorManagementView.tsx` **+2**
  - `VendorDetailView.tsx` **+1**
  - `BillingInvoiceSection.tsx` **+1**

**Net global: −35 + 14 = −21.**

This is **inventory regeneration drift** in out-of-scope rental finance/vendor files (not modified by #1098), not P212 regression or scanner weakening. P212 scoped count is authoritative for this slice.

---

## 18. +82 keys vs finding delta

| Remediation source | Approx. strings |
|--------------------|-----------------|
| Scanner-visible FinesView | 35 |
| Blind-spot (maps, KPIs, form, detail) | ~25–30 |
| Legacy wired + structured namespaces | 11 + normalization overhead |

82 keys appropriate for monolith surface; no evidence of semantic fragmentation for quota. Five legacy dictionary keys remain UI-unwired (pre-existing debt).

---

## 19. Shim / compat

- No fines `../i18n/` compat shim added.
- `fines-i18n.ts` uses canonical `../../i18n/` imports.
- **New compat consumers: 0**

---

## 20. Documentation consistency

Implementation docs match independent metrics on P212, keys, machine semantics, and scope. Implementation report correctly notes global −21 vs P212 −35; this re-audit adds precise drift explanation.

Minor **trailing whitespace** in markdown docs flagged by `git diff --check` — non-blocking hygiene.

---

## 21. CI triage (PR #1098 @ `6e5fc4f1`)

| Failure | Classification |
|---------|----------------|
| Backend `tsc` — billing.controller.security.characterization.spec.ts | **B** pre-existing |
| Backend `tsc` — vehicles-security-negative.spec.ts | **B** pre-existing |
| Backend `tsc` — vehicles.controller.status-patch.spec.ts | **B** pre-existing |
| Frontend component tests, build, lint, a11y, Playwright (completed run) | **PASS** |

**P2.2.12-caused required CI failures = 0**

---

## 22. Final table

| Metric | Baseline | Impl claim | Independent |
|--------|----------|------------|-------------|
| Global | 1875 | 1854 | **1854** |
| Rental | 586 | 565 | **565** |
| P212 | 35 | 0 | **0** |
| Hidden literals (P212) | ~60 | 0 | **0** |
| Canonical EN | 7210 | 7292 | **7292** |
| Canonical DE | 7210 | 7292 | **7292** |
| Parity | 100% | 100% | **100%** |
| New keys | — | 82 | **82** |
| Existing reuse (UI) | — | 18 | **13 wired** (6 legacy fines + 7 cross-ns) |
| Duplicate candidates | — | 0 | **0 blocking** |
| Orphans (UI-unwired legacy) | 11 | — | **5** |
| Shim | 29 | 29 | **29** |
| New compat | 0 | 0 | **0** |
| Category E | 0 | 0 | **0** |
| Category G | 0 | 0 | **0** |
| Fines tests | — | 9/9 | **9/9 PASS** |
| Guard tests | — | 24/24 | **24/24 PASS** |
| i18n:check | — | PASS | **PASS** |
| build | — | PASS | **PASS** |
| git diff --check | — | PASS | **WARN** (doc trailing WS only) |
| Business/runtime changes | 0 | 0 | **0** |
| P212-caused CI failures | — | 0 | **0** |
| Test quality | — | — | **ACCEPTABLE** |

---

## 23. Final verdict

**B — READY WITH NON-BLOCKING OBSERVATIONS**

PR #1098 may be marked ready and merged after human review of the observations below.

### Non-blocking observations

1. **Five legacy `fines.*` keys** (`uploadFine`, `openFines`, `points`, `uploadNotice`, `drivingBan`) remain dictionary-only — not wired in current FinesView UI (pre-existing; safe to defer).
2. **Test depth ACCEPTABLE** — no dedicated error/retry or filter-click machine-value interaction tests.
3. **Global scanner −21** reflects +14 inventory drift in unchanged invoice/vendor files on full rescan; P212 −35 is the authoritative slice metric.
4. **Doc trailing whitespace** — cosmetic only.

### Blocking criteria

All blocking gates pass: provenance ✓, Category E/G = 0 ✓, machine semantics ✓, P212 = 0 ✓, blind spots closed ✓, scanner not weakened ✓, dictionary integrity ✓, parity ✓, shim stable ✓, meaningful tests pass ✓, build/i18n pass ✓, no P212-caused CI failures ✓.

**STOP — Do not merge from this audit branch. Do not begin P2.2.13.**
