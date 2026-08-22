# P2.2.19 — Rental Insurances View Localization — Final Independent Re-Audit

**Date:** 2026-08-22  
**Auditor mode:** Strict read-only independent verification  
**Target implementation:** PR [#1155](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/1155)  
**Pre-flight reference:** PR [#1153](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/1153) (audit-only, not modified)  
**Authoritative baseline SHA:** `d645343f8e449037b5c9507457dc9b6d7926a61f`  
**Implementation HEAD SHA:** `4cadfb633a3597ae64c63e4ac497b722f71944f9`

---

## 1. Provenance — PASS

| Check | Independent result |
|-------|-------------------|
| PR #1155 exists | Yes |
| Open | Yes (`state: OPEN`) |
| Draft | Yes (`isDraft: true`) |
| Merged | No (`mergedAt: null`) |
| Mergeable | Yes (`MERGEABLE`) |
| Base SHA | `d645343f8e449037b5c9507457dc9b6d7926a61f` |
| HEAD SHA | `4cadfb633a3597ae64c63e4ac497b722f71944f9` |
| Local HEAD == remote HEAD | Yes |
| Audit-only contamination | No |
| Communication Center contamination | No |
| Dashboard contamination | No |
| Master Admin localization contamination | No (ChangesView/ArchitekturView bookkeeping entries only) |

**Commit list (`d645343f..4cadfb63`):**

1. `1456e908` — Complete InsurancesView localization with insurances.* keys and i18n helpers
2. `574bdf64` — Document rental InsurancesView i18n architecture (P2.2.19)
3. `5e8b17cc` — Add insurances.* dictionary modules and presentation adapter (P2.2.19)
4. `add86be5` — Add P219 enforce-clean boundary, guards, and localization tests
5. `4cadfb63` — Document P2.2.19 rental InsurancesView i18n implementation

**Changed paths:** 15 files, all within P2.2.19 scope. No unrelated surface files.

---

## 2. Complete Diff Classification

| Path | Class |
|------|-------|
| `rental/components/InsurancesView.tsx` | A — Rental Insurance presentation |
| `rental/lib/insurances-i18n.ts` | B — insurance presentation adapter |
| `i18n/translations/insurances.{en,de}.ts` | C — canonical dictionaries |
| `i18n/translations/en.ts`, `de.ts` | C — dictionary wiring |
| `rental/components/rental-insurances-localization.test.tsx` | D — tests |
| `scripts/i18n-hardcoded-scan.mjs`, `i18n-check.mjs`, `hardcoded-copy-guard.test.ts`, `hardcoded-copy-inventory.json` | E — scanner/governance |
| `docs/audits/...implementation...md`, `architecture/I18N_RENTAL_INSURANCES...md` | F — documentation/architecture |
| `master/components/ChangesView.tsx`, `ArchitekturView.tsx` | G — bookkeeping |
| — | H — business/runtime semantic change: **0** |
| — | I — unrelated/out-of-scope: **0** |
| — | J — compatibility/shim: **0 new consumers** |

---

## 3. Scope Expansion Verdict — **A**

**Verdict:** Implementation remained within the actual production responsibility of `InsurancesView.tsx`; pre-flight underestimated embedded UI.

**Evidence:** Baseline `InsurancesView.tsx` was **1,254 lines** and already contained the full 8-step inquiry wizard (steps 0–7), detail drawer, overview KPIs, filters, sort, and table — all inline. Pre-flight cited ~55 scanner findings on this single file; it did not scope a “table-only” slice.

| Surface | File/region | In baseline? | InsurancesView responsibility? | Presentation debt (pre) | Business coupling | P219? | Reason |
|---------|-------------|--------------|-------------------------------|-------------------------|-------------------|-------|--------|
| Overview/KPI | `renderOverview` | Yes | Yes | ~12 | Low (summary display) | Yes | Page chrome + KPI labels |
| Filters | status dropdown | Yes | Yes | ~8 | Low (filter UI) | Yes | Labels only; machine `all`/status enums preserved |
| Sort | sort dropdown | Yes | Yes | ~4 | Low | Yes | Label maps; keys `status`/`expiry`/`vehicle` unchanged |
| Table | vehicle rows | Yes | Yes | ~15 | Medium (row actions) | Yes | Headers/actions localized; data raw |
| Row actions | detail/inquiry/upload | Yes | Yes | ~6 | Medium (callbacks) | Yes | Labels only |
| Empty/error | overview states | Yes | Yes | ~5 | Low | Yes | EmptyState copy |
| Wizard step 1 | `renderStepVehicle` | Yes | Yes | ~8 | Medium (vehicle select) | Yes | Inline in view |
| Wizard step 2 | `renderStepInsurers` | Yes | Yes | ~12 | Medium (partner select) | Yes | Inline in view |
| Wizard step 3 | `renderStepPurpose` | Yes | Yes | ~14 | High (purpose enum) | Yes | Machine values preserved |
| Wizard step 4 | `renderStepHistorical` | Yes | Yes | ~35 | High (data keys) | Yes | 14 historical item keys |
| Wizard step 5 | `renderStepTimeRange` | Yes | Yes | ~6 | Medium | Yes | Time range enums preserved |
| Wizard step 6 | `renderStepLiveData` | Yes | Yes | ~24 | High (live data keys) | Yes | 9 live data item keys |
| Wizard step 7 | `renderStepReview` | Yes | Yes | ~15 | High (review + disclosure) | Yes | Review chrome |
| Wizard step 8 | `renderStepSubmit` | Yes | Yes | ~13 | High (submit result) | Yes | Submit states |
| Detail drawer | `renderDetail` | Yes | Yes | ~20 | Medium | Yes | Section labels; record data raw |
| Nested dialogs | — | No separate modals | N/A | 0 | — | N/A | No extracted dialog components |

**Stop-scope recommendation:** **KEEP AS ONE SLICE** — wizard and drawer are not independently reusable components; all live inside `InsurancesView.tsx` at baseline.

---

## 4. Production File Boundary — PASS

**Claimed P219 exact boundary:**

- `rental/components/InsurancesView.tsx` ✓
- `rental/lib/insurances-i18n.ts` ✓

**`insurances-i18n.ts` classification:** **CANONICAL PRESENTATION ADAPTER**

Contains: `TranslationKey` maps, locale formatters, label helpers, machine value constants, structural metadata (`HISTORICAL_DATA_GROUPS`, `TIME_RANGE_OPTIONS`, `STATUS_ORDER`) moved from view without semantic change.

Does **not** contain: eligibility logic, validation rules, API selection, state transitions, filtering predicates, or KPI calculations.

---

## 5. Business Semantics — Category H = 0

| Machine value | Baseline | Implementation | Changed? |
|---------------|----------|----------------|----------|
| `vehicleId` | `selectedVehicle.vehicle.id` | Same | No |
| `inquiryType` | `inquiryPurpose` string | Same | No |
| `selectedInsurerIds` | `Array.from(selectedInsurerIds)` | Same | No |
| `selectedHistoricalData` | `Object.fromEntries(...map(k => [k, true]))` | Same | No |
| `selectedLiveData` | `{ frequency, level }` per key | Same | No |
| `selectedTimeRange` | `rangeObj` with `from`/`to`/`label` | Same | No |
| `selectedInsuranceModels` | `[inquiryPurpose]` | Same | No |
| Status filter | `'all'` + `ACTIVE`…`PENDING_INQUIRY` | Same | No |
| Sort keys | `status` / `expiry` / `vehicle` | Same | No |
| Wizard step index | `0`–`7` numeric | Same | No |
| `api.insurances.*` endpoints | overview, partners, disclosure, vehicleInsurance, submitInquiry | Same | No |
| `STATUS_ORDER` | `{EXPIRED:0,…,ACTIVE:4}` | Identical in adapter | No |
| `TIME_RANGE_OPTIONS` days | 30/90/183/365/0 | Identical | No |
| Historical/live data keys | Same key strings | Same | No |

**Submit payload (hard gate):** Byte-for-byte equivalent structure and field assignment. `api.insurances.submitInquiry(payload)` unchanged.

**Presentation-only delta in detail drawer:** `inq.inquiryType?.replace(/_/g, ' ')` → `labelInquiryPurpose(locale, inq.inquiryType)` — display only; stored/API value unchanged.

---

## 6. Wizard Audit — semantics changed = 0

| Step | Purpose | Machine state | Validation | Next/back | API relevance | Localized | Semantic change? |
|------|---------|---------------|------------|-----------|---------------|-------------|------------------|
| 0 | Select vehicle | `selectedVehicle` | implicit (required for submit) | Cancel→overview / Next | `vehicleId` | Yes | No |
| 1 | Select insurers | `selectedInsurerIds` | load partners if empty | Back/Next | `selectedInsurerIds` | Yes | No |
| 2 | Purpose | `inquiryPurpose` | selection required | Back/Next | `inquiryType`, `selectedInsuranceModels` | Yes | No |
| 3 | Historical data | `selectedHistorical` Set | optional multi-select | Back/Next | `selectedHistoricalData` | Yes | No |
| 4 | Time range | `timeRange`, `customFrom/To` | custom dates if `custom` | Back/Next | `selectedTimeRange` | Yes | No |
| 5 | Live data | `selectedLiveData`, frequency, aggregation | optional | Back/Next; loads disclosure | `selectedLiveData` | Yes | No |
| 6 | Review | read-only summary | — | Back/Submit | pre-submit | Yes | No |
| 7 | Submit result | `submitResult`, `submitting` | — | back to overview / new inquiry | post `submitInquiry` | Yes | No |

**Step identity:** Numeric `step` (0–7) and `INSURANCE_WIZARD_STEP_KEYS` machine keys used for stepper; localized labels via `labelWizardStep(locale, stepKey)` — labels never used as state identifiers.

**Validation:** No validation condition changes identified. Only message presentation localized.

---

## 7. Filters / Sort — PASS

| Filter | Label key | Machine value | Predicate | Changed? |
|--------|-----------|---------------|-----------|----------|
| All statuses | `insurances.filters.allStatuses` | `all` | no status filter | No |
| Active | `insurances.status.ACTIVE` | `ACTIVE` | `v.status === 'ACTIVE'` | No |
| Expiring soon | `insurances.status.EXPIRING_SOON` | `EXPIRING_SOON` | same | No |
| Expired | `insurances.status.EXPIRED` | `EXPIRED` | same | No |
| Missing | `insurances.status.MISSING` | `MISSING` | same | No |
| Pending inquiry | `insurances.status.PENDING_INQUIRY` | `PENDING_INQUIRY` | same | No |

Sort keys `status`/`expiry`/`vehicle`, `STATUS_ORDER` comparator, default `sortKey='status'` — unchanged.

---

## 8. +199 Key Audit

**Independent count:** 199 EN + 199 DE = **8124/8124** (baseline 7925 → +199). Parity 100%.

### Classification counts (A–P)

| Class | Count | Notes |
|-------|-------|-------|
| A — overview/KPI | 10 | title, tabs, KPIs, refresh |
| B — table | 5 | row actions, missing banner |
| C — filters/sort | 6 | search, filters, sort labels |
| D — statuses/types | 18 | status, inquiryStatus, timeRange, frequency, aggregation |
| E — wizard step chrome | 86 | steps 1–8 UI (purposes, historical, live, review, submit) |
| F — wizard validation/help | 0 | no separate validation message keys |
| G — detail drawer | 19 | detail section labels |
| H — empty/error/loading | 9 | empty.* + missing.documentStored |
| I — actions | 12 | wizard/nav actions |
| J — accessibility | 0 | no dedicated aria keys |
| K — should reuse existing | 4 | `actions.back/cancel/next/retry` vs `common.*` |
| L — semantic duplicate | 1 | `missing.noRecord` ≈ `empty.noInsuranceRecord` |
| M — overly granular | 8 | per-step action duplicates vs `common.*`; `detail.since` superseded by `sinceFrequency` |
| N — orphan | **2** | `insurances.missing.noRecord`, `insurances.detail.since` |
| O — incorrect translation | 0 | EN/DE terminology acceptable |
| P — machine value translated | 0 | enums stay machine-side |

### Key count by surface (reconciles to 199)

| Surface | Keys |
|---------|------|
| Overview/KPI | 10 |
| Filters/sort | 6 |
| Table/row actions | 5 |
| Status/type enums | 18 |
| Wizard step 1 (vehicle) | 5 |
| Wizard step 2 (insurers/partners) | 11 |
| Wizard step 3 (purpose) | 17 |
| Wizard step 4 (historical) | 35 |
| Wizard step 5 (time range) | 5 |
| Wizard step 6 (live data) | 24 |
| Wizard step 7 (review) | 15 |
| Wizard step 8 (submit) | 13 |
| Detail drawer | 19 |
| Errors/empty | 7 |
| Actions chrome (shared) | 12 |
| Misc (`emptyValue`, wizard step labels) | 2 |
| **Total** | **199** |

**Key-growth verdict:** **MOSTLY JUSTIFIED WITH CLEANUP** — +199 is explained by full wizard matrix (14 historical + 9 live data items × label+desc) embedded in baseline view; pre-flight 45–60 estimate was low. Cleanup: 2 orphans, 4 `common.*` reuse candidates.

---

## 9. Orphans — FAIL (2)

| Key | Status |
|-----|--------|
| `insurances.missing.noRecord` | Defined but unused; drawer uses `empty.noInsuranceRecord` |
| `insurances.detail.since` | Defined but unused; drawer uses `detail.sinceFrequency` |

Dynamic keys (`insurances.historical.*`, `insurances.live.*`, `insurances.wizard.step.*`, `insurances.inquiry.purpose.*`) are referenced via adapter template maps — **not** orphaned.

---

## 10. Translation Quality — PASS (STYLE ONLY)

- EN: clear SaaS fleet-insurance terminology
- DE: formal, consistent (`Flottenversicherung`, `Anfrage`, `Versicherer`)
- No blocking terminology errors
- Style: could align generic actions with `common.*` (non-blocking)

---

## 11. P219 Enforce-Clean — PASS

```
P219_ENFORCE_CLEAN_EXACT = {
  'rental/components/InsurancesView.tsx',
  'rental/lib/insurances-i18n.ts',
}
```

- No broad rental prefix, ignores, allowlists, or scanner weakening
- **P219 findings: 0** (baseline InsurancesView: 55 → 0)
- **Hidden P219 presentation debt: 0**
- `locale === 'de'` in P219 scope: **0**

**Blind-spot guards:** **ACCEPTABLE** — grep guards for status maps, KPI/title literals, German leakage; does not execute wizard steps.

---

## 12. Global Closure Freeze — PASS

```
npm run i18n:check = PASS
Canonical keys: 8124/8124 (EN+DE)
Tests: 217/217 PASS
GLOBAL ACTIVE I18N ENFORCE-CLEAN DEBT = 0
```

| Freeze | Result |
|--------|--------|
| P218 | 0 |
| P217 | 0 |
| P216A/B1/B2/C1/C2A/C2B | 0 |
| Shim | 29 (18 prod, 11 test) — unchanged |
| New compat consumers | 0 |

---

## 13. Tests — WEAK (overview-focused)

**10 tests** in `rental-insurances-localization.test.tsx`:

| Area | Tested? | Method |
|------|---------|--------|
| Overview EN/DE | Yes | Render |
| KPI/filters EN | Yes | Render |
| Runtime locale switch | Yes | Sequential remount |
| Machine status/purpose values | Yes | Unit + source inspect |
| Status label maps | Yes | Unit |
| Date formatting | Yes | Unit |
| P219 enforce-clean | Yes | Inventory |
| No key leakage | Yes | Render regex |
| Wizard step progression | **No** | — |
| Wizard validation | **No** | — |
| Submit payload | **No** (static diff only) | Source inspect for `inquiryType` |
| Detail drawer EN/DE | **No** | — |
| Filter/sort behavior | **No** | — |

**Grade:** **WEAK** for wizard/drawer; **ACCEPTABLE** for overview + machine constants. Business semantics strongly supported by static diff (payload identical, step logic unchanged).

---

## 14. Build / git diff --check — PASS

- `npm run build` — PASS (local)
- `git diff --check d645343f...4cadfb63` — PASS

---

## 15. CI Triage (PR #1155 HEAD)

| Failed job | Classification | P219-caused? |
|------------|----------------|--------------|
| Typecheck (backend billing/vehicles spec TS errors) | B — pre-existing | No |
| Backend unit tests (Vehicle Detail workflow) | B — pre-existing | No |
| Playwright E2E Vehicle Detail #20 (device connection / `Konnektivität`) | B — pre-existing | No |

**Passed:** Frontend component tests (includes `rental-insurances-localization.test.tsx`), Production build, Lint, Legal Documents E2E.

**P219-caused required failures: 0**

---

## 16. Scanner Inventory Delta

| Metric | Baseline | After P219 |
|--------|----------|------------|
| Global findings | 1718 | **1665** (−53) |
| Rental findings | 487 | **434** (−53) |
| InsurancesView | 55 | **0** |
| Enforce-clean debt | 0 | **0** |

---

## 17. Documentation Accuracy — PASS

Implementation and architecture docs match verified results for scope, +199, 8124/8124, P219=0, global closure PASS, Category E=0, shim 29, prior freezes. Claims are accurate (verified independently, not taken on faith).

---

## 18. Final Reconciliation Table

| Metric | Baseline | Implementation claim | Independent result |
|--------|----------|------------------------|-------------------|
| Provenance | d645343f | d645343f → 4cadfb63 | **Confirmed** |
| Production scope | 2 paths | 2 paths | **Confirmed** |
| Scope expansion | ~55 findings | 8-step wizard | **A — underestimated baseline UI** |
| Machine enums | frozen | frozen | **Confirmed** |
| Submit payload | — | unchanged | **Confirmed identical** |
| Wizard semantics | — | unchanged | **Confirmed** |
| P219 findings | 55 | 0 | **0** |
| EN/DE keys | 7925 | 8124 | **8124/8124** |
| New keys | +199 | +199 | **+199** |
| Orphans | 0 required | 0 claimed | **2 found** |
| npm run i18n:check | PASS | PASS | **PASS** |
| Global enforce-clean | 0 | 0 | **0** |
| Build | — | PASS | **PASS** |
| git diff --check | — | PASS | **PASS** |
| CI P219-caused failures | — | 0 | **0** |
| Category H/E | 0 | 0 | **0** |

---

## 19. Smallest Correction Set (if pursuing A)

1. **Remove or wire** `insurances.missing.noRecord` (duplicate of `empty.noInsuranceRecord`)
2. **Remove** unused `insurances.detail.since` (superseded by `sinceFrequency`)
3. *(Non-blocking)* Consider reusing `common.back/cancel/next/retry` instead of `insurances.actions.*` duplicates
4. *(Non-blocking)* Add wizard step render test (step 2 purpose select EN/DE) for stronger runtime confidence

---

## 20. Final Verdict

### **B — READY WITH NON-BLOCKING OBSERVATIONS**

**PR #1155 may be marked ready and merged** after optional cleanup of 2 orphan keys (recommended but not blocking business semantics).

`npm run i18n:check` = PASS  
GLOBAL ACTIVE I18N ENFORCE-CLEAN DEBT = 0

### Blocking issues: **None**

### Non-blocking observations

1. **2 orphan dictionary keys** — remove or wire before freeze hardening
2. **Test coverage weak for wizard/drawer** — overview + static diff provide confidence; wizard runtime tests would strengthen re-audit posture
3. **4 `common.*` reuse candidates** for generic actions (style/consistency, not correctness)
4. **CI failures pre-existing** — backend typecheck + Vehicle Detail E2E unrelated to P219

### Not applicable

- D (split) — wizard is baseline-inline responsibility
- E (business semantics) — payload and state machine unchanged
- F (global closure regression) — all global gates pass

---

**Audit artifact branch:** `cursor/p2219-final-independent-reaudit-3c10`  
**Implementation PR:** #1155 (not modified)
