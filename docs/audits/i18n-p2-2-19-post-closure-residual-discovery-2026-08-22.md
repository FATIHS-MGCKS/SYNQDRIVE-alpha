# P2.2.19 — Post-Closure Residual Discovery Audit

**Date:** 2026-08-22  
**Mode:** STRICT READ-ONLY POST-CLOSURE AUDIT  
**Auditor:** Cursor Cloud Agent (independent)  
**Repository:** FATIHS-MGCKS/SYNQDRIVE-alpha  

---

## Executive Summary

Global i18n enforce-clean closure (P2.2.18 / PR #1148) is **intact**. `npm run i18n:check` passes with zero active enforce-clean debt. Residual internationalization debt exists **outside** enforce-clean coverage, concentrated in the **Master admin surface** (1,049 scanner findings), **Rental finance/insurance surfaces** (193 rental-side findings), and **scanner-blind DE/EN ternary presentation** in health/dashboard builder modules.

**Recommended P2.2.19 target:** Rental Insurances View localization (`InsurancesView.tsx`) — bounded, active production slice following the established P2.2.12 FinesView pattern.

**Final Verdict:** **A — GO**

---

## 0. Baseline Verification

| Check | Result |
|-------|--------|
| PR #1148 merged | ✅ `true` (`mergedAt: 2026-08-22T03:42:02Z`) |
| Exact merge SHA | ✅ `d645343f8e449037b5c9507457dc9b6d7926a61f` |
| HEAD matches merge SHA | ✅ Verified on `origin/cursor/p227b-voice-telephony-test-center-preflight-3c10` |
| P217 ancestry (`6e578fd`) | ✅ Present |
| P216 ancestry (`f7095205`) | ✅ Present |
| Working tree | ✅ Clean at audit start (post `i18n:check` inventory refresh only) |
| `npm run i18n:check` | ✅ **PASS** (204 tests, 15 files) |
| P218 enforce-clean debt | **0** |
| P217 enforce-clean debt | **0** |
| P216A enforce-clean debt | **0** |
| P216B1 enforce-clean debt | **0** |
| P216B2 enforce-clean debt | **0** |
| P216C1 enforce-clean debt | **0** |
| P216C2A enforce-clean debt | **0** |
| P216C2B enforce-clean debt | **0** |

**Topology note:** P2.2.18 merged into the i18n lineage branch (`cursor/p227b-voice-telephony-test-center-preflight-3c10`), not `main`. This is expected and correct for the i18n hardening series. PR #1147 remains superseded and unmerged.

---

## 1. Purpose of P2.2.19

With global enforce-clean debt at zero, P2.2.19 must identify residual i18n debt **outside scanner/enforce-clean coverage** or intentionally excluded from it. This audit searched all primary residual categories (A–L) and found meaningful active production presentation debt remaining.

---

## 2. Post-Closure Metrics (Independently Recomputed)

| Metric | Value |
|--------|-------|
| Canonical EN keys | **7,925** |
| Canonical DE keys | **7,925** |
| Parity | **100%** |
| Orphan key estimate | **~976** (keys not found as string literals in `src/`; many are dynamically referenced or namespace-composed) |
| Duplicate EN value groups | **547** (same EN string under multiple keys; includes intentional cross-namespace reuse) |
| Shim total | **29** |
| Production shim consumers | **18** |
| Test shim consumers | **11** |
| Canonical `../../i18n/` consumers | **495** |
| Active enforce-clean findings | **0** |
| Total scanner inventory | **1,718** findings |
| Non-enforce-clean inventory | **1,717** |
| Enforce-clean exact boundaries | **162** paths |
| Enforce-clean prefix boundaries | **52** prefixes |
| Boundary set count | **29** slice definitions |

### Scanner inventory by surface

| Surface | Findings |
|---------|----------|
| MASTER | 1,049 |
| RENTAL | 487 |
| OPERATOR | 156 |
| SHELL | 25 |
| SHARED | 1 |

### Scanner inventory by category

| Category | Count |
|----------|-------|
| TEXT | 1,218 |
| TITLE | 257 |
| LABEL | 93 |
| PLACEHOLDER | 84 |
| ARIA | 58 |
| FORMAT_LOCALE | 8 |

---

## 3. Active Production Residual Search

### Rental surface (487 findings, non-enforced)

| Cluster | Findings | Top files |
|---------|----------|-----------|
| Finance/Billing/Insurance | 193 | `InsurancesView.tsx` (55), `CreateInvoiceDialog.tsx` (24), `FinancialInsightsView.tsx` (11), `PartsAccessoriesView.tsx` (24) |
| Damages | 91 | `DamageRentalSections.tsx` (15), damage-related components |
| Users/Roles/IAM | 67 | `CreateUserWizard.tsx` (16), IAM utils |
| Data Analysis | 32 | `DataAnalyseView.tsx` (32) |
| Documents/Legal (non-enforced) | 31 | `DocumentsView.tsx` (22) |
| Parts/Accessories | 24 | `PartsAccessoriesView.tsx` (24) |
| Other | 48 | Various |

### Master surface (1,049 findings — entirely outside enforce-clean)

| Module | Findings | Top files |
|--------|----------|-----------|
| Health Tracking | 132 | `HealthTrackingView.tsx` |
| Billing Admin | 100 | `BillingPricingTab.tsx` (27), drawers/tabs |
| Vehicle Registration | 95 | `VehicleRegistrationModal.tsx` |
| High Mobility Data | 65 | `HighMobilityDataView.tsx` |
| Insurances Admin | 59 | `InsurancesAdminView.tsx` |
| Performance Logic | 56 | `PerformanceLogicView.tsx` |
| Prospects | 47 | `ProspectsView.tsx` |
| Trip Detection | 38 | `TripDetectionLogicView.tsx` |
| System Monitoring | 37 | `SystemMonitoringView.tsx` |
| Other master modules | 520 | Architektur, connected-vehicles, platform-ops, security-access, etc. |

### Operator surface (156 findings, non-enforced)

Top: `OperatorVehicleQuickView.tsx` (22), `OperatorBookingFormSheet.tsx` (16), handover-adjacent residuals.

---

## 4. Scanner Coverage Gap Analysis

### What IS covered

| Domain | Scanner | Enforce-clean |
|--------|---------|---------------|
| Login/shell | ✅ | ✅ P2.1 |
| Rental nav/dashboard prefix | ✅ | ✅ P2.1 |
| Fleet/health/vehicle-detail prefix | ✅ | ✅ P2.2 |
| Bookings/customers prefix | ✅ | ✅ P2.3 |
| Tasks/settings prefix | ✅ | ✅ P2.4 |
| Workflow automation | ✅ | ✅ P2.5 |
| Stations | ✅ | ✅ P2.6 |
| Voice assistant | ✅ | ✅ P2.7A/B |
| WhatsApp | ✅ | ✅ P2.8 |
| Support center | ✅ | ✅ P2.9 |
| Master support ops | ✅ | ✅ P2.10 |
| Handover | ✅ | ✅ P2.11 |
| Fines | ✅ | ✅ P2.12 |
| Operator handover | ✅ | ✅ P2.13 |
| Invoice list | ✅ | ✅ P2.14 |
| Vendor directory | ✅ | ✅ P2.15 |
| Service tasks / task detail slices | ✅ | ✅ P2.16A–C2B |
| Booking vehicle picker | ✅ | ✅ P2.17 |
| Data authorization | ✅ | ✅ P2.18 |

### What is NOT covered (gap inventory: **12 major gaps**)

| Path / Domain | Scanner | Enforce-clean | Active prod | Known literals | Risk |
|---------------|---------|---------------|-------------|----------------|------|
| `master/components/*` (bulk) | ✅ scanned | ❌ not enforced | ✅ | 1,049 | **HIGH** — entire master admin UI |
| `rental/components/InsurancesView.tsx` | ✅ | ❌ | ✅ | 55 | **HIGH** — active rental finance |
| `rental/components/DataAnalyseView.tsx` | ✅ | ❌ | ✅ | 32 | MEDIUM |
| `rental/components/PartsAccessoriesView.tsx` | ✅ | ❌ | ✅ | 24 | MEDIUM |
| `rental/components/invoices/CreateInvoiceDialog.tsx` | ✅ | ❌ | ✅ | 24 | MEDIUM |
| `rental/components/DocumentsView.tsx` | ✅ | ❌ | ✅ | 22 | MEDIUM |
| `rental/components/damages/**` | ✅ | ❌ | ✅ | 91 | MEDIUM |
| `rental/components/users-roles/**` | ✅ | ❌ | ✅ | 67 | MEDIUM |
| `operator/components/**` (non-handover) | ✅ | ❌ | ✅ | 156 | MEDIUM |
| `backend/src/**` | ❌ not scanned | ❌ | ✅ | Many | MEDIUM — API-facing messages |
| `e2e/**` | ❌ excluded | ❌ | test | N/A | LOW |
| DE/EN ternary builders (`tire-health-detail-ui.ts`, dashboard builders) | ❌ blind | partial | ✅ | ~150+ ternaries | **HIGH** — hidden presentation |

### Scanner exclusions (by design)

- `*.test.ts(x)`, `translations/`, `legal-documents.*`, `test-utils.ts`
- Files outside `SCAN_ROOTS`: `e2e/`, `figma-*/`, `backend/`
- Dynamically constructed strings (template literals with variables) — partially blind
- Constants arrays in `.ts` config files — detected only if under scan roots

---

## 5. Dead Code / Unused Production Code

| Path | Unused evidence | Hardcoded locale/copy | Prod import count | Risk if removed | Should clean? | Priority |
|------|-----------------|----------------------|-------------------|-----------------|---------------|----------|
| `lib/tasks/hooks/useTaskDetail.ts` | Exported from `lib/tasks/index.ts` but **zero production imports**; only referenced in contract test | `'Aufgabe konnte nicht geladen werden'` (DE error fallback, line 45) | 0 prod / 1 test | LOW | **SAFE CLEANUP** | P3 |
| `rental/i18n/LanguageContext.tsx` | Compatibility re-export shim (intentional) | None | 18 prod via `../i18n/` | HIGH if removed prematurely | **NEEDS ARCHITECTURAL REVIEW** | P4 (shim retirement wave) |

**Classification summary:** 1 SAFE CLEANUP candidate, 1 intentional legacy bridge.

---

## 6. Fixed Locale Search

### Pattern occurrence counts (production `src/`, excluding tests)

| Pattern | Occurrences (files) |
|---------|---------------------|
| `toLocaleString` / `toLocaleDateString` | ~130 files |
| `Intl.DateTimeFormat` / `Intl.NumberFormat` | ~15 files |
| `'de-DE'` / `'en-US'` literals | ~70 files |
| `locale === 'de'` ternaries | **~80 production files** |

### Category D/E candidates (presentation hardcoding / dead code)

| File | Category | Issue |
|------|----------|-------|
| `rental/lib/tire-health-detail-ui.ts` | **D** | 27 `locale === 'de' ? labelDe : labelEn` branches — should use translation keys |
| `rental/components/health/BrakeEvidencePanel.tsx` | **D** | 15 DE/EN inline ternaries despite enforce-clean health prefix |
| `rental/lib/brake-health-evidence-ui.ts` | **D** | 13 DE/EN inline ternaries |
| `rental/components/fleet-health-service/fleet-health-service-freshness.ts` | **D** | 15 DE/EN ternaries |
| `rental/components/dashboard/*Builder*.ts` | **D** | ~40 files with `const de = locale === 'de'` pattern — scanner-blind hidden debt |
| `rental/components/FleetHubView.tsx` | **D** | `'Aktualisieren' : 'Refresh'` inline (enforce-clean file with blind-spot pattern) |
| `rental/components/shared/rental-requirements-ui.tsx` | **D** | 11 DE/EN ternaries |
| `lib/tasks/hooks/useTaskDetail.ts` | **E** | Dead code + German error string |

**Note:** Many `getFormattingLocale(locale)` usages are **Category A** (canonical locale mapping) and healthy.

---

## 7. Alternate Language Contexts / Providers

| Provider | Status | Risk |
|----------|--------|------|
| `src/i18n/LanguageContext.tsx` | **Canonical** — single `LanguageProvider` + `useLanguage` | None |
| `src/rental/i18n/LanguageContext.tsx` | **Compatibility shim** — re-exports canonical | LOW — 18 prod consumers remain |
| `RUNTIME_TRANSLATION_LOCALE_CODES` in `locales.ts` | **Deprecated** alias | LOW — documented, used in structural tests only |
| Custom `t()` wrappers per domain | **Domain adapters** (`fines-i18n.ts`, `handover-i18n.ts`, etc.) | LOW — healthy pattern |

**Target architecture intact:** one canonical provider, domain presentation adapters, no competing runtime systems.

---

## 8. Raw Translation Key Leak Risk

| Path | Risk | Evidence |
|------|------|----------|
| `LanguageContext.translateKey()` | LOW | Returns `missing-key` source with `[key]` bracket wrapper in dev |
| Generic metadata renderers | LOW | No production path renders raw `TranslationKey` strings without `t()` |
| Dynamic key construction | MEDIUM | Domain adapters (fines, vendor, invoice) construct keys from machine values — guarded by typed maps |
| `FinancialInsightsView.tsx` | LOW | Uses `t('common.loading') ?? 'Loading…'` fallback — English leak on missing key only |

**High-risk production paths:** None identified that systematically render raw keys to users.

---

## 9. Server / Backend User-Facing Strings

Backend (`backend/src/`) is **not scanned** by the frontend i18n toolchain. Audit sample found:

| Cluster | Examples | UI reach |
|---------|----------|----------|
| IAM MFA messages | `'MFA is not enrolled'`, `'Invalid verification code'` | API error responses → frontend should map via `auth.error.*` |
| Validation util | `'Validation failed'` | Generic API envelope |
| Workflow shadow | `'Shadow evaluation — no actions executed.'` | Admin/automation UI |
| Insurance adapter | `'No API endpoint configured'` | Integration status |

**Separation:** Machine error codes (HTTP status, enum values) vs human messages. Frontend owns presentation for user-visible errors via semantic key mapping (established in `auth-error-i18n.ts`). Backend messages should **not** be localized in P2.2.19 — contract audit deferred to future hygiene slice.

---

## 10. Notification / Communication Copy

| Area | Coverage | Residual |
|------|----------|----------|
| Dashboard notifications (`dashboard/notifications/`) | Enforce-clean prefix (P2.1) — **0 scanner findings** | Hidden DE/EN ternaries in builders (~15 files) |
| WhatsApp Business | Enforce-clean (P2.8) | ✅ Closed |
| Support Center | Enforce-clean (P2.9) | ✅ Closed |
| Voice Assistant | Enforce-clean (P2.7) | ✅ Closed |
| Email settings (`EmailVersandTab.tsx`) | Enforce-clean (P2.4 settings prefix) | ✅ Closed |

**Gap:** Dashboard notification **builder/view-model** files use `locale === 'de'` ternaries that bypass scanner TEXT detection because strings are composed in `.ts` builders, not JSX literals.

---

## 11. Route / Navigation Metadata

| Area | Status |
|------|--------|
| Rental `Sidebar.tsx` / `TopBar.tsx` | ✅ Enforce-clean (P2.1) |
| Master `Sidebar.tsx` | ❌ 3 scanner findings |
| Route labels in `rental/App.tsx` | Partially enforced (shell) |
| Command palette / feature cards (master) | ❌ Hardcoded in master views |

Navigation metadata debt is concentrated in **master admin** views, not rental shell.

---

## 12. Dynamic String Construction

Found extensively in:
- Dashboard builders (`operationsBuilder.ts`, `fleetStateBuilder.ts`, `actionQueueBuilder.ts`)
- Health presentation (`tire-health-detail-ui.ts`, `brake-health-evidence-ui.ts`)
- Booking/invoice mappers

**Classification:** Most should become interpolation-based translation keys. Current concatenation patterns block multi-language readiness for PL/FR/CS/etc.

---

## 13. Pluralization / Interpolation Quality

| Area | Issue |
|------|-------|
| Dashboard time semantics | Separate `hoursShortDe` / `hoursShort` keys instead of ICU-style plural rules |
| Tire/brake health | Parallel `labelDe`/`labelEn` fields from API presentation layer |
| Task/customer counts | Generally use `t('key', { count })` — healthy where enforced |
| Invoice/finance amounts | `formatMoneyCents` with locale param — healthy pattern |

**Grammar debt:** DE/EN dual-field pattern in health modules is the highest-risk pluralization anti-pattern.

---

## 14. Dictionary Quality Audit

| Metric | Value | Assessment |
|--------|-------|------------|
| Orphan keys | ~976 estimated | Expected — dynamic keys, legal namespaces, future-use keys |
| Duplicate EN values | 547 groups | Many intentional (e.g., "Bookings" across nav contexts) |
| Cross-namespace reuse | Present | `dashboard.drilldown.noMatches` reused in settings (P218) — semantically valid |
| P216/P217/P218 drift | None detected | Key namespaces aligned post-closure |
| Generic concept duplication | LOW | `common.*` used appropriately |

**Do not clean in P2.2.19** — dictionary hygiene is a separate deferred slice.

---

## 15. Key Ownership Debt

| Example | Classification |
|---------|----------------|
| `dashboard.drilldown.noMatches` in Settings data-auth | **B** — acceptable cross-domain generic reuse |
| `tasks.filter.resetFilters` in data-auth | **B** — acceptable generic reuse |
| Finance keys under mixed namespaces | **C** — namespace smell in invoice/fines/billing (not blocking) |

No **D — correction-worthy** ownership issues requiring immediate action.

---

## 16. Shim / Compatibility Debt

| File | Classification |
|------|----------------|
| 18 production `../i18n/` consumers | **TEMPORARY MIGRATION** — active required until migrated to `../../i18n/` |
| 11 test shim consumers | **TEST-ONLY** |
| `rental/i18n/LanguageContext.tsx` | **ACTIVE REQUIRED** — re-export bridge |

**Retirement:** No production shims can be safely removed without migrating their import paths. Post-global-closure, shim count is stable at 29. Future shim retirement slice should target the 18 production consumers individually.

---

## 17. Test-Only I18n Debt

| Pattern | Risk |
|---------|------|
| `locale === 'de' ? 'en' : 'de'` in localization tests | LOW — intentional runtime switch testing |
| German-default in characterization tests | LOW |
| `notificationEngine.test-utils.ts` | LOW — test fixture DE assumptions |
| Missing localization tests for: Insurances, Damages, DataAnalyse, Master admin, Users/Roles | **MEDIUM** — gaps hide regressions |

Test debt does not block P2.2.19 but should be added for the selected slice.

---

## 18. Non-EN/DE Readiness

| Component | Verdict |
|-----------|---------|
| `SupportedLocale` union (9 locales) | ✅ READY |
| Dictionary loader / registry | ✅ READY |
| `LanguageProvider` | ✅ READY |
| `getFormattingLocale()` BCP-47 mapping | ✅ READY |
| Partial dictionaries (PL/FR/CS/NL/ES/IT ~6%) | **READY WITH WORK** |
| Turkish fallback-only | ✅ By design |
| DE/EN ternary presentation modules | **STRUCTURAL BLOCKER** for PL/FR/CS/NL/ES/TR/IT |
| Type generation (`TranslationKey`) | ✅ READY |

**Overall:** **READY WITH WORK** — architecture supports expansion but DE/EN ternary modules must be converted before non-EN/DE presentation quality is achievable.

---

## 19. Hardcoded Language Assumptions

~80 production files contain `locale === 'de'` ternary presentation branching. Highest density:

1. `tire-health-detail-ui.ts` (27)
2. `BrakeEvidencePanel.tsx` (15)
3. `brake-health-evidence-ui.ts` (13)
4. `fleet-health-service-freshness.ts` (15)
5. Dashboard builder modules (~40 files, 1-6 each)

These should be replaced by canonical `t()` dictionary lookups.

---

## 20. Fallback Policy Audit

| Scenario | Behavior | Risk |
|----------|----------|------|
| Missing key | `translateKey` returns `[key]` with `missing-key` source | LOW in prod (7925/7925 EN/DE) |
| Unsupported locale (TR) | Explicit English fallback (`fallback-en`) | ✅ By design |
| Runtime language switch | `LanguageProvider` state + `localStorage` persistence | ✅ Works |
| Dictionary load failure | Falls back to English dictionary | ✅ Safe |
| Silent German default | **Not detected** in canonical provider | ✅ |

**Default locale:** `en` (not German). No silent DE default risk in canonical runtime.

---

## 21. Runtime Locale-Switch Coverage Matrix

| Domain | EN test | DE test | Runtime switch | Risk |
|--------|---------|---------|----------------|------|
| Login | ✅ | ✅ | ✅ | LOW |
| Nav/Dashboard | ✅ | ✅ | ✅ | LOW |
| Vehicles/Health | ✅ | ✅ | ✅ | LOW |
| Bookings/Customers | ✅ | ✅ | ✅ | LOW |
| Tasks/Settings | ✅ | ✅ | ✅ | LOW |
| Automation | ✅ | ✅ | partial | LOW |
| Stations | ✅ | ✅ | partial | LOW |
| Voice/WhatsApp | ✅ | ✅ | partial | LOW |
| Support | ✅ | ✅ | partial | LOW |
| Handover | ✅ | ✅ | partial | LOW |
| Fines/Invoices/Vendors | ✅ | ✅ | partial | LOW |
| Task detail (P216) | ✅ | ✅ | ✅ | LOW |
| Data authorization (P218) | ✅ | ✅ | ✅ | LOW |
| **Insurances** | ❌ | ❌ | ❌ | **HIGH** |
| **Damages** | ❌ | ❌ | ❌ | MEDIUM |
| **DataAnalyse** | ❌ | ❌ | ❌ | MEDIUM |
| **Master admin** | ❌ | ❌ | ❌ | HIGH |
| **Users/Roles** | ❌ | ❌ | ❌ | MEDIUM |
| **Operator (non-handover)** | ❌ | ❌ | ❌ | MEDIUM |

---

## 22. Product-Surface Prioritization

| Cluster | Active | Scanner visible | Hidden | Priority |
|---------|--------|-----------------|--------|----------|
| Master admin surface | ✅ | 1,049 | DE/EN ternaries | P1 (split required) |
| Rental finance/insurance | ✅ | 193 | formatting | P1 |
| Health DE/EN ternary modules | ✅ | 0 | ~55+ | P2 |
| Rental damages | ✅ | 91 | low | P2 |
| Rental users/roles | ✅ | 67 | low | P3 |
| Operator residuals | ✅ | 156 | low | P3 |
| Dashboard notification builders | ✅ | 0 | ~40 ternaries | P2 |
| Dead code (`useTaskDetail.ts`) | ❌ | 1 | 0 | P4 |
| Shim retirement | N/A | N/A | N/A | P4 |
| Dictionary hygiene | N/A | ~976 orphans | N/A | P5 |
| Backend presentation contract | ✅ | unscanned | many | P5 |

---

## 23. Risk Model (Top Clusters)

Scoring: 1 (low) – 5 (high)

| Cluster | User impact | Frequency | Scanner invisibility | Runtime risk | Size | Testability |
|---------|-------------|-----------|---------------------|--------------|------|-------------|
| Master admin | 3 (admin) | 4 | 1 | 3 | 5 | 2 |
| Rental Insurances | 5 | 4 | 1 | 4 | 2 | 4 |
| Health DE/EN ternaries | 5 | 5 | 5 | 4 | 3 | 3 |
| Rental Damages | 4 | 3 | 1 | 3 | 3 | 3 |
| Dashboard builders | 5 | 5 | 5 | 3 | 4 | 3 |
| Rental DataAnalyse | 3 | 2 | 1 | 2 | 2 | 4 |
| Master Billing | 3 | 3 | 1 | 3 | 4 | 2 |

---

## 24. Top 7 Residual Clusters (Ranked)

### #1 — Master Admin Surface Residuals
- **Files:** `master/components/HealthTrackingView.tsx` (132), `VehicleRegistrationModal.tsx` (95), `HighMobilityDataView.tsx` (65), +40 more
- **Active/Dead:** Active production (platform admin)
- **Visible literals:** 1,049 | **Hidden:** ~20 | **Fixed locale:** ~10
- **Shim:** None
- **Runtime risk:** Medium (admin-only but daily use)
- **Test quality:** None
- **New-key estimate:** 800–1,200
- **Why:** Largest residual bucket; **SPLIT REQUIRED** for implementation

### #2 — Rental Insurances View
- **Files:** `rental/components/InsurancesView.tsx` (55 findings)
- **Active/Dead:** Active production
- **Visible literals:** 55 | **Hidden:** ~5 | **Fixed locale:** 0
- **Shim:** None
- **Runtime risk:** High (customer-facing finance workflow)
- **Test quality:** None
- **New-key estimate:** 45–60
- **Why:** Bounded single-view slice, follows P212 FinesView pattern, high rental operator impact

### #3 — Health Module DE/EN Ternary Presentation
- **Files:** `tire-health-detail-ui.ts`, `BrakeEvidencePanel.tsx`, `brake-health-evidence-ui.ts`, `fleet-health-service-freshness.ts`
- **Active/Dead:** Active (within enforce-clean prefixes but scanner-blind)
- **Visible literals:** 0 | **Hidden:** ~70 | **Fixed locale:** ~70
- **Shim:** None
- **Runtime risk:** High for non-EN/DE locales
- **Test quality:** Partial (vehicles-health tests exist but don't cover ternary modules)
- **New-key estimate:** 40–60
- **Why:** Blocks multi-language readiness; architectural leverage

### #4 — Rental Damages Surfaces
- **Files:** `rental/components/damages/DamageRentalSections.tsx` + related (91 total)
- **Active/Dead:** Active
- **Visible literals:** 91 | **Hidden:** low | **Fixed locale:** few
- **New-key estimate:** 60–80
- **Why:** Core vehicle operations, no enforce-clean coverage yet

### #5 — Dashboard Notification Builder Hidden Debt
- **Files:** `dashboard/operationsBuilder.ts`, `actionQueueBuilder.ts`, `fleetStateBuilder.ts`, `notification-handover-copy.ts`, +15 more
- **Active/Dead:** Active
- **Visible literals:** 0 (enforce-clean) | **Hidden:** ~40 DE/EN ternaries
- **New-key estimate:** 30–50
- **Why:** Daily operations UI; scanner-blind despite enforce-clean status

### #6 — Rental Finance Adjacent (CreateInvoice, PartsAccessories, DataAnalyse)
- **Files:** `CreateInvoiceDialog.tsx` (24), `PartsAccessoriesView.tsx` (24), `DataAnalyseView.tsx` (32)
- **Active/Dead:** Active
- **Visible literals:** 80 | **Hidden:** low
- **New-key estimate:** 70–90
- **Why:** Natural follow-on after Insurances; SPLIT from #2

### #7 — Operator Non-Handover Residuals
- **Files:** `OperatorVehicleQuickView.tsx` (22), `OperatorBookingFormSheet.tsx` (16), +others
- **Active/Dead:** Active
- **Visible literals:** 156 | **Hidden:** low
- **New-key estimate:** 100–130
- **Why:** Mobile operator workflows; handover already closed (P2.13)

---

## 25. Selected P2.2.19 Implementation Target

### P2.2.19 — Rental Insurances View Localization

**Rationale:**
- Highest-impact **bounded** rental production slice after global closure
- 55 confirmed scanner findings in a single primary file
- Follows proven P2.2.12 FinesView pattern (`fines-i18n.ts` adapter + enforce-clean boundary)
- Category E expectation = 0 (no machine insurance API values in presentation layer)
- Independent EN/DE/runtime-switch testing straightforward
- Does not touch frozen P216/P217/P218 areas

**Not selected:**
- Master admin (#1) — too large, SPLIT REQUIRED
- Health ternaries (#3) — better as architecture slice after more rental surfaces closed
- Dead code cleanup — trivial, not preferred per instructions

---

## 26. Special Case Assessment

Meaningful active production presentation debt **does exist**. No switch to architecture-only slice required.

---

## 27. One Slice or Split

**ONE SLICE** — `InsurancesView.tsx` is implementable as a single bounded slice.

Broader finance cluster (#6) and master admin (#1) are **SPLIT REQUIRED** for future slices.

---

## 28. Exact File Boundary

```
P219_ENFORCE_CLEAN_EXACT = [
  'rental/components/InsurancesView.tsx',
]
```

Optional presentation adapter (recommended, following P212 pattern):

```
P219_PRESENTATION_ADAPTER = [
  'rental/lib/insurances-i18n.ts',
]
```

---

## 29. Key Strategy

| Strategy | Detail |
|----------|--------|
| New namespace | `insurances.*` (overview, inquiry wizard, status filters, step labels, historical data groups, partner cards) |
| Reuse existing | `common.save`, `common.cancel`, `common.loading`, `common.status`, `common.back`, `common.next`, `nav.*` where applicable |
| Expected key growth | **45–60** new keys |
| Duplicate-risk controls | Status filter labels → single `insurances.status.*` map; inquiry purpose options → `insurances.inquiry.purpose.*`; avoid duplicating `common.*` concepts |
| Machine values unchanged | `ACTIVE`, `EXPIRING_SOON`, `EXPIRED`, `MISSING`, `PENDING_INQUIRY`, inquiry purpose enum values |

---

## 30. Machine Semantics Freeze

| Invariant | Rule |
|-----------|------|
| Insurance status enum values | Never translate in API payloads |
| Inquiry purpose `value` fields | Machine keys (`quote_standard`, etc.) — translate labels only |
| Historical data `key` fields | Machine identifiers — translate labels/descriptions only |
| Partner/vehicle IDs | Never in presentation keys |
| Date/number formatting | Use `getFormattingLocale(locale)` — no hardcoded `de-DE` |
| Category E | **0** — no machine value translation |

---

## 31. Future Test Plan (P2.2.19 Implementation)

| Test | Requirement |
|------|-------------|
| EN rendering | All visible strings resolve via `t()` |
| DE rendering | All visible strings resolve via `t()` |
| Runtime switch EN↔DE | No stale literal leakage |
| Dynamic data | Vehicle names, partner names, policy numbers unchanged |
| Machine values | Status chips use semantic mapping, not translated enums |
| Callbacks/routes/payloads | Unchanged |
| No raw keys | No `[insurances.*]` visible |
| No hardcoded DE/EN | Scanner findings = 0 for boundary |
| Blind-spot guard | No `locale === 'de'` ternaries introduced |
| Build | `npm run build` PASS |
| Global gate | `npm run i18n:check` PASS |

New test file: `rental/components/rental-insurances-localization.test.tsx`

---

## 32. Global Closure Regression Requirement

```
GLOBAL_I18N_CLOSURE_FREEZE = {
  'npm run i18n:check': 'PASS',
  globalActiveEnforceCleanDebt: 0,
  canonicalEnDeParity: '7925/7925',
  shimBaseline: 29,
}
```

Any P2.2.19 implementation MUST preserve this freeze.

---

## 33. P218/P217/P216 Freeze

```
P218 = 0
P217 = 0
P216A = 0
P216B1 = 0
P216B2 = 0
P216C1 = 0
P216C2A = 0
P216C2B = 0
```

Must remain zero after P2.2.19.

---

## 34. Shim Target

P2.2.19 is **not** shim cleanup.

| Requirement | Target |
|-------------|--------|
| New compat consumers | 0 |
| Shim total | ≤ 29 (baseline) |

---

## 35. Implementation Contract

### P2.2.19 — Rental Insurances View Localization

**IN SCOPE:**
- `rental/components/InsurancesView.tsx` — all user-facing presentation
- `rental/lib/insurances-i18n.ts` — presentation adapter (recommended)
- `i18n/translations/*.en.ts` + `*.de.ts` — `insurances.*` namespace keys
- `rental/components/rental-insurances-localization.test.tsx` — EN/DE/runtime-switch tests
- `i18n-hardcoded-scan.mjs` — P219 boundary registration
- `hardcoded-copy-guard.test.ts` — P219 guard
- `docs/audits/` + `architecture/` bookkeeping

**OUT OF SCOPE:**
- Master admin surfaces
- `InsurancesAdminView.tsx` (master)
- Health DE/EN ternary modules
- Damages, DataAnalyse, PartsAccessories
- Backend message localization
- Dictionary orphan cleanup
- Shim retirement
- Frozen P216/P217/P218 files

**Acceptance criteria:**
1. Scoped residual debt = 0
2. Hidden presentation debt = 0 in scope
3. EN correct
4. DE correct
5. Runtime switch correct
6. Category E = 0
7. `npm run i18n:check` PASS
8. Global active enforce-clean debt = 0
9. Parity 100%
10. No new compat consumers
11. Shim ≤ 29
12. P216/P217/P218 freezes = 0
13. Localization tests PASS
14. Build PASS
15. `git diff --check` PASS

---

## 36. Audit Metadata

| Field | Value |
|-------|-------|
| Artifact | `docs/audits/i18n-p2-2-19-post-closure-residual-discovery-2026-08-22.md` |
| Branch | `cursor/p2219-post-closure-residual-discovery-3c10` |
| Baseline SHA | `d645343f8e449037b5c9507457dc9b6d7926a61f` |
| Production code modified | **NO** |
| Dictionaries modified | **NO** |
| Scanner modified | **NO** |
| Tests modified | **NO** |
| P2.2.19 implementation started | **NO** |
| Merged | **NO** |

---

## 37. Final Report

| # | Item | Value |
|---|------|-------|
| 1 | Authoritative baseline SHA | `d645343f8e449037b5c9507457dc9b6d7926a61f` |
| 2 | Global `i18n:check` | **PASS** |
| 3 | Global active enforce-clean debt | **0** |
| 4 | EN count | **7,925** |
| 5 | DE count | **7,925** |
| 6 | Parity | **100%** |
| 7 | Orphan count | **~976** (estimated) |
| 8 | Duplicate candidate count | **547** groups |
| 9 | Shim total | **29** |
| 10 | Production shim | **18** |
| 11 | Test shim | **11** |
| 12 | Scanner coverage gap count | **12** major gaps |
| 13 | Active production residual clusters | **7** (see §24) |
| 14 | Dead-code residual clusters | **1** (`useTaskDetail.ts`) |
| 15 | Fixed-locale production occurrences | **~80** files (DE/EN ternaries) |
| 16 | Alternate locale-provider count | **1** canonical + **1** shim |
| 17 | Backend presentation debt clusters | **4** (IAM, validation, workflow, integrations) |
| 18 | Navigation/config residual clusters | **2** (master sidebar/cards, operator) |
| 19 | Runtime locale-switch coverage gaps | **5** domains (Insurances, Damages, DataAnalyse, Master, Users/Roles) |
| 20 | Multi-language readiness verdict | **READY WITH WORK** |
| 21 | Top 7 clusters | See §24 |
| 22 | Selected P2.2.19 target | **Rental Insurances View Localization** |
| 23 | Why selected | Bounded, active production, 55 literals, P212 pattern, Category E = 0 |
| 24 | Exact file scope | `rental/components/InsurancesView.tsx` [+ optional `rental/lib/insurances-i18n.ts`] |
| 25 | Expected new keys | **45–60** |
| 26 | Runtime risk | **Medium** (finance workflow, mitigated by slice isolation) |
| 27 | Category E expectation | **0** |
| 28 | Future test plan | See §31 |
| 29 | Global closure freeze plan | See §32 |
| 30 | Shim target | ≤ 29, no new compat consumers |
| 31 | Audit artifact | This document |
| 32 | Audit PR | Draft PR on audit branch |
| 33 | Final verdict | **A — GO** |

---

## 38. Final Verdict

# **A — GO**

Global i18n closure is intact. Active production presentation debt remains outside enforce-clean coverage. P2.2.19 should proceed as **Rental Insurances View Localization** — a bounded, high-impact rental slice with Category E = 0.

---

*End of audit.*
