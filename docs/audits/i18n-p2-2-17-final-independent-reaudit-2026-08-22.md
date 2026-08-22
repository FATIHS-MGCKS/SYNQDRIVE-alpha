# P2.2.17 — Booking Vehicle Picker Localization — Final Independent Re-Audit

**Date:** 2026-08-22
**Auditor mode:** Strict read-only independent verification
**Target implementation:** PR #1143
**Authoritative baseline:** `f709520590967c4a128f91a38f07d0672f6d4a55`
**Implementation HEAD audited:** `6753320b82e52301b67338a04805f9c2c0f6eee3`
**Pre-flight reference:** PR #1142 (audit-only, not modified)

---

## 1. Provenance

| Check | Independent result |
|-------|-------------------|
| PR #1143 exists | YES — https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/1143 |
| Open | YES (`state: OPEN`) |
| Draft | YES (`isDraft: true`) |
| Merged | NO |
| Base branch | `cursor/p227b-voice-telephony-test-center-preflight-3c10` |
| Base SHA | `f709520590967c4a128f91a38f07d0672f6d4a55` |
| HEAD SHA | `6753320b82e52301b67338a04805f9c2c0f6eee3` |
| Baseline ancestry | YES — `git merge-base --is-ancestor f7095205 HEAD` |
| P216A/B1/B2/C1/C2A/C2B ancestry | YES — all contained in base branch history |
| Commits on branch | 2 (`3b2cb81b` feat, `6753320b` docs whitespace) |
| Audit-only contamination | NO — no PR #1142 commits; no Communication Center / Dashboard changes |
| Local HEAD == remote HEAD | YES — both `6753320b82e52301b67338a04805f9c2c0f6eee3` |

**Provenance: PASS**

---

## 2. Complete Diff Classification

Changed paths (`f7095205...6753320b`): 14 files.

| Path | Category |
|------|----------|
| `rental/components/new-booking/VehiclePickerStep.tsx` | **A** — picker presentation |
| `rental/lib/booking-vehicle-preflight.ts` | **A/B** — preflight machine + presentation threading |
| `rental/lib/booking-vehicle-preflight-presentation-i18n.ts` | **B** — presentation adapter (new) |
| `rental/components/booking-vehicle-picker-localization.test.tsx` | **D** — tests |
| `rental/lib/booking-vehicle-preflight.test.ts` | **D** — tests |
| `i18n/translations/en.ts`, `de.ts` | **C** — dictionary |
| `i18n/hardcoded-copy-guard.test.ts`, `scripts/i18n-hardcoded-scan.mjs`, `hardcoded-copy-inventory.json` | **E** — governance |
| `architecture/I18N_BOOKING_VEHICLE_PICKER_P2_2_17_2026-08-22.md` | **F** |
| `docs/audits/i18n-p2-2-17-booking-vehicle-picker-implementation-2026-08-22.md` | **F** |
| `master/components/ChangesView.tsx`, `ArchitekturView.tsx` | **F** |

**Category G (business/runtime semantic change): 0**
**Category H (unrelated/out-of-scope): 0**
**New compatibility consumers: 0**

---

## 3. Exact Production Scope

| Path | Role | Baseline debt | Machine coupling | Modifications | Tests |
|------|------|---------------|------------------|---------------|-------|
| `VehiclePickerStep.tsx` | Picker UI chrome, filters, status tabs, cards | 2 scanner-visible + ~15 hidden literals | Filter values `all`/status enums; callbacks props-only | All presentation → `t()` / `formatVehicleOperationalStatusLabel`; locale threaded to preflight | EN/DE render + source guards |
| `booking-vehicle-preflight.ts` | Preflight machine logic | ~10 German presentation strings inline | `hardBlockReason`, `isSelectable`, eligibility booleans | Presentation extracted to adapter; optional `{ locale }` param | Machine invariant + locale presentation tests |
| `booking-vehicle-preflight-presentation-i18n.ts` | Canonical message adapter | N/A (new) | None — TranslationKey mapping only | 9 picker-specific + reused health/fleet keys | Indirect via preflight tests + source guards |

**Adapter legitimacy:** ACCEPTABLE architecture support — mirrors `task-detail-presentation-i18n.ts` pattern. Not scope expansion; required to keep machine file enforce-clean.

---

## 4. VehiclePickerStep — Full Presentation Audit

### Localized (verified)

- Section title, search placeholder (pre-existing keys)
- Station filter label → `bookings.planner.allStations`
- Reset filters → `tasks.filter.resetFilters`
- More filters → `fleetCondition.moreFilters`
- Active-filter badge → `bookings.wizard.vehiclePicker.filtersActive`
- Status tabs → `fleet.shell.tab.all`, `vehicle.status.*`
- Price fallback → `bookings.wizard.noTariff`
- Fleet status badge → `formatVehicleOperationalStatusLabel(status, locale)`
- Empty state → `bookings.wizard.noVehiclesInCategory`
- Preflight blocking/caution via `resolveBookingVehiclePreflight(..., { locale })`

### Remaining strings (not Category E)

| String | Classification |
|--------|----------------|
| `Electric`, `Hybrid`, `Diesel`, `Petrol` in `fuelChipClass` | A — machine fuel-type values |
| `—` station empty sentinel | C — technical |
| CSS class tokens | C — technical |

| Metric | Before | After |
|--------|--------|-------|
| Scanner-visible enforce-clean (VehiclePickerStep) | 2 | **0** |
| Hidden presentation literals (cluster estimate) | ~18–22 | **0** |
| Category E residual | — | **0** |

---

## 5. Original Global Findings — Hard Gate

### Baseline (`f7095205`) — independently reproduced

| File | Line | Sample | Severity |
|------|------|--------|----------|
| `VehiclePickerStep.tsx` | 348 | `Alle Stationen` | enforce-clean |
| `VehiclePickerStep.tsx` | 383 | `Filter zurücksetzen` | enforce-clean |

`enforceCleanRemaining = 2`

Note: `Filter zurücksetzen` finding `files` array also listed `DataAuthorizationTab.tsx` as co-occurrence, but primary file was VehiclePickerStep.

### Implementation (`6753320b`)

| File | Line | Sample | Severity |
|------|------|--------|----------|
| *(none in VehiclePickerStep)* | — | — | — |

`enforceCleanRemaining = 1` (see §27)

**VehiclePickerStep known findings: 2 → 0 — PASS**

Strings were localized via `t()` keys, not moved to scanner-blind helpers.

---

## 6. Machine / Presentation Split — `booking-vehicle-preflight.ts`

| Machine field | Baseline semantics | Implementation semantics | Changed? |
|---------------|-------------------|-------------------------|----------|
| `hardBlockReason` | `offline` \| `rental_blocked` \| `no_tariff` \| null | Same | **NO** |
| `isSelectable` | Derived from offline/rentalBlocked/rentalUnverified/noTariff/unknown/unreliable | Same branch logic | **NO** |
| `fleetStatus` | `selectOperationalStatus(vehicle)` | Same | **NO** |
| `offline`, `rentalBlocked`, `healthWarningOnly`, `noTariff`, `muted` | Same predicates | Same | **NO** |
| `blockingReason` | German hardcoded / raw provider | Localized via adapter / raw provider preserved | Presentation only |
| `cautionReason` | German hardcoded / raw provider[0] | Localized via adapter / raw provider[0] preserved | Presentation only |

**All machine fields: changed = NO**

---

## 7. Presentation Adapter Architecture

`booking-vehicle-preflight-presentation-i18n.ts`:

| Check | Result |
|-------|--------|
| React hooks | None |
| Canonical locale type | `SupportedLocale` via `isSupportedLocale` |
| Mutable global locale | None |
| Hidden `'de'` fallback | None |
| Hidden `'en'` override | Uses `DEFAULT_PRODUCT_LOCALE` when locale invalid/absent (repo-standard) |
| Browser-language inference | None |
| Business rules in adapter | None |
| Raw provider text translation | None — only canonical fallbacks mapped |

**Classification: CANONICAL**

---

## 8–10. Selection, Callbacks, Filters

| Concern | Result |
|---------|--------|
| Selected vehicle ID | Unchanged — `selectedVehicleId === vehicle.id` |
| `onSelectVehicle(vehicle)` | Unchanged |
| Disabled state | Still `!preflight.isSelectable` |
| Filter machine values | Still `'all'`, brand strings, station IDs, fuel type strings, status enum values |
| Filter callbacks | `onBrandFilterChange(e.target.value)` etc. — unchanged |
| Tab `onStatusFilterChange(tab.value)` | Machine value unchanged (`all`, `AVAILABLE`, etc.) |
| Translated labels as filter state | **Not used** |

**Semantic changes: 0**

---

## 11–13. Preflight Branches (representative)

| State | Machine result (baseline = impl) | EN presentation | DE presentation |
|-------|----------------------------------|-----------------|-------------------|
| Offline | `hardBlockReason=offline`, `isSelectable=false` | Vehicle offline · check device | Fahrzeug offline · Gerät prüfen |
| Rental blocked (no reasons) | `rental_blocked`, not selectable | Not rentable | Nicht vermietbar |
| Rental blocked (provider) | `rental_blocked`, raw reasons | Raw `TÜV überfällig` preserved | Same raw text |
| Rental unverified | `rental_blocked` | Rental clearance not verified | Mietfreigabe nicht verifiziert |
| No tariff | `no_tariff` | No active tariff assigned | Kein aktiver Tarif zugewiesen |
| Unknown status | `rental_blocked` | Status unavailable | Status nicht verfügbar |
| Maintenance caution | selectable, caution set | In maintenance — select with caution | In Wartung — Auswahl mit Vorsicht |
| Health warning | selectable, caution set | Raw or Health warning | Raw or Gesundheit Warnung |

`hardBlockReason` never derived from translated strings. **PASS**

---

## 14–15. Dynamic Data & Formatting

- License `KS-AB 100`, station `Kassel HQ`, fuel `Petrol`, price `€120.00` — unchanged across EN/DE (test-verified).
- No `de-DE` / `en-US` / `Intl.*` / `toLocale*` added in P217 production paths.

---

## 16. +9 Key Audit

Independently verified 9 new keys under `bookings.wizard.vehiclePicker.*`:

| Key | Class |
|-----|-------|
| `filtersActive` | **A** — picker-specific active badge |
| `preflight.vehicleOffline` | **A** |
| `preflight.noActiveTariff` | **A** — context-specific (differs from short `noTariff`) |
| `preflight.statusUnavailable` | **A** |
| `preflight.maintenanceCaution` | **A** |
| `preflight.currentlyRented` | **A** |
| `preflight.reservedCaution` | **B** — caution vs status label distinction |
| `preflight.healthCritical` | **A** |
| `preflight.healthWarning` | **A** |

**Counts: A=8, B=1, C–H=0**

---

## 17. Reused Key Audit

| Key | Semantic fit |
|-----|-------------|
| `bookings.planner.allStations` | CORRECT — same "all stations" filter concept |
| `tasks.filter.resetFilters` | ACCEPTABLE — generic reset-filters action |
| `fleetCondition.moreFilters` | ACCEPTABLE — same expandable filter chrome |
| `vehicle.status.*` | CORRECT — operational status taxonomy |
| `health.rentalBlocked` | CORRECT — not-rentable fallback |
| `fleetCondition.rentalClearanceNotVerified` | CORRECT — rental gate unverified |

---

## 18. Dictionary Accounting

| Metric | Baseline | Implementation |
|--------|----------|----------------|
| EN keys | 7899 | **7908** |
| DE keys | 7899 | **7908** |
| Parity | 100% | **100%** |
| New keys | — | **9** |
| Removed keys | — | **0** |
| Changed existing translations | — | **0** |
| Orphans | — | **0** |
| Duplicate candidates | — | **0** |

---

## 19. P217 Enforce-Clean

`P217_ENFORCE_CLEAN_EXACT` (verified in scanner + guard test):

- `rental/components/new-booking/VehiclePickerStep.tsx`
- `rental/lib/booking-vehicle-preflight.ts`

No broad prefixes, no ignores/allowlists/exemptions. Presentation adapter intentionally outside boundary (repo convention).

**P217 scoped findings: 0**

---

## 20. Blind-Spot Guard Quality

Guards in `hardcoded-copy-guard.test.ts` + `booking-vehicle-picker-localization.test.tsx`:

- Banned German literals (`Alle Stationen`, `Filter zurücksetzen`, `Weitere Filter`, etc.)
- Adapter canonical key wiring
- Inventory scope assertion

**Grade: ACCEPTABLE** (source-level; no runtime callback/filter behavioral guards)

---

## 21. Runtime Locale Switch

Tests mount separate EN and DE instances (not in-place `setLocale` on same root). Architecture uses `useMemo(..., [t, locale])` on status tabs — correct dependency pattern.

**Grade: ACCEPTABLE** — separate-mount EN/DE verified; in-place switch not exercised.

---

## 22–23. Test Quality

**23/23 PASS** (`booking-vehicle-picker-localization.test.tsx` + `booking-vehicle-preflight.test.ts`)

| Coverage | Present? |
|----------|----------|
| EN title/placeholder/empty | YES |
| DE title/placeholder/empty | YES |
| Runtime locale switch (same mount) | NO |
| VehiclePicker 2→0 inventory | YES |
| Dynamic vehicle data | YES |
| Preflight machine invariants EN/DE | YES (offline, unverified, no-tariff, provider raw) |
| Callback identity | NO (static analysis only) |
| Filter machine values | NO (static analysis only) |

Preflight tests **execute behavior** for machine paths, not mapping-only.

**Overall grade: ACCEPTABLE**

---

## 24. Category E / Business Diff

No changes to booking state, API calls, payloads, navigation, persistence, eligibility predicates, or filter algorithms.

**Category E = 0**

---

## 25. P216 Freeze Regression

| Boundary | Scoped findings |
|----------|----------------|
| P216A | 0 |
| P216B1 | 0 |
| P216B2 | 0 |
| P216C1 | 0 |
| P216C2A | 0 |
| P216C2B | 0 |
| P217 | 0 |

**No frozen boundary weakened.**

---

## 26. Shim / Compatibility

| Metric | Value |
|--------|-------|
| Baseline shim | 29 (18 prod, 11 test) |
| Implementation shim | **29** |
| New compat consumers | **0** |
| Presentation adapter | Not a compat shim |

---

## 27. DataAuthorizationTab — Critical Baseline Check

### Baseline `npm run i18n:check` (`f7095205`)

- Exit: **1**
- `enforceCleanRemaining: 2` (both keyed to VehiclePickerStep)
- `DataAuthorizationTab.tsx` line 420: `Filter zurücksetzen` — **present on baseline source**; co-listed in VehiclePickerStep finding `files` array but not primary file

### Implementation `npm run i18n:check` (`6753320b`)

- Exit: **1**
- `enforceCleanRemaining: 1`
- Primary file: `DataAuthorizationTab.tsx:419` — `Filter zurücksetzen`, phase `P2.2.4`

### Classification: **A — present identically on baseline** (co-occurrence; unmasked when VehiclePickerStep fixed)

**Not P217-caused.**

### Why earlier audits reported VehiclePickerStep as sole global debt

Scanner groups shared literal clusters under a primary file. Both `VehiclePickerStep` and `DataAuthorizationTab` shared `Filter zurücksetzen`; primary attribution was VehiclePickerStep. Fixing VehiclePickerStep unmasked the latent P2.2.4 settings debt.

---

## 28–29. Global i18n:check Delta

| Metric | Baseline | Implementation |
|--------|----------|----------------|
| Exit status | FAIL (1) | FAIL (1) |
| enforceCleanRemaining | 2 | 1 |
| VehiclePickerStep | 2 | **0** |
| DataAuthorizationTab | 0 (co-listed only) | **1** (primary) |
| P217-caused findings | — | **0** |

**GLOBAL RESULT = FAIL — 1 PRE-EXISTING DataAuthorizationTab FINDING (unmasked)**

---

## 30. DataAuthorizationTab Scope Ownership

- Migration phase tag: **P2.2.4** (Tasks & Settings)
- File: `rental/components/settings/data-authorization/DataAuthorizationTab.tsx`
- Likely next-slice candidate for settings residual cleanup (potential P2.2.18 or P2.2.4 closure follow-up)
- **Not fixed in this audit**

---

## 31–32. Build & git diff --check

| Gate | Result |
|------|--------|
| `npm run build` (implementation HEAD) | **PASS** |
| `git diff --check f7095205...6753320b` | **PASS** |

---

## 33. CI Triage (PR #1143 run `32544989243`)

| Job | Status | Classification |
|-----|--------|----------------|
| Production build | PASS | — |
| Frontend component tests | PASS | — |
| Lint | PASS | — |
| Typecheck | FAIL | **B** — backend `billing.controller.security.characterization.spec.ts`, `vehicles-security-negative.spec.ts`, `vehicles.controller.status-patch.spec.ts` — unrelated to P217 |
| Backend unit tests | FAIL | **B** — same backend TS errors |
| Playwright E2E (Vehicle Detail) | FAIL | **D** — uncertain/flaky; no P217 file references in logs |

**P217-caused required failures: 0**

---

## 34. Documentation Accuracy

Implementation doc + architecture doc + ChangesView + ArchitekturView claims verified against independent results. All material claims accurate.

---

## 35. Final Residual Search (P217 scope)

| Remaining string | Class |
|------------------|-------|
| `UNCATEGORIZED_VEHICLE_LABEL` export | A — pre-existing machine constant |
| Fuel type strings in chip class | A — domain values |
| `EUR` currency default | A — domain |
| `'—'` em dash | C — technical |

**Category E = 0**

---

## 36. Reconciliation Table

| Metric | Baseline | Impl claim | Independent |
|--------|----------|------------|-------------|
| Provenance | f7095205 | f7095205 | **MATCH** |
| VehiclePicker findings | 2 | 2→0 | **2→0** |
| Hidden picker literals | ~18–22 | 0 | **0** |
| Preflight machine semantics | frozen | frozen | **unchanged** |
| Vehicle selection | frozen | frozen | **unchanged** |
| Callbacks / filters | frozen | frozen | **unchanged** |
| P217 | debt | 0 | **0** |
| EN / DE keys | 7899 | 7908 | **7908 / 7908** |
| Parity | 100% | 100% | **100%** |
| New keys | — | 9 | **9** |
| Orphans | — | 0 | **0** |
| Runtime locale switch | — | correct | **ACCEPTABLE** (separate mounts) |
| P217 tests | — | 23 PASS | **23 PASS** |
| Test quality | — | — | **ACCEPTABLE** |
| P216 freezes | 0 each | 0 | **0 each** |
| Shim | 29 | 29 | **29** |
| Category E | — | 0 | **0** |
| DataAuthorizationTab | co-listed | pre-existing | **A — pre-existing** |
| Global i18n:check | FAIL(2) | FAIL(1) | **FAIL(1)** |
| Build | — | PASS | **PASS** |
| git diff --check | — | PASS | **PASS** |
| CI P217-caused | — | 0 | **0** |

---

## 37. Collateral Observation (non-blocking)

`booking-vehicle-preflight-banner.tsx` (out of P217 scope) calls `resolveBookingVehiclePreflight` without `{ locale }`. Implementation now defaults to `DEFAULT_PRODUCT_LOCALE` (`en`) for presentation strings instead of hardcoded German. Machine semantics unchanged; presentation drift for banner consumers only.

---

## 38. Final Verdict

# B — READY WITH NON-BLOCKING OBSERVATIONS

PR #1143 may be marked ready and merged from a **P2.2.17 presentation-localization perspective**, subject to accepting:

1. **Global `i18n:check` still FAIL** — 1 pre-existing `DataAuthorizationTab.tsx` enforce-clean finding unmasked (not P217-caused; proven on baseline).
2. **Test quality ACCEPTABLE not STRONG** — no in-place runtime locale-switch test; no callback/filter behavioral tests.
3. **CI failures pre-existing** — backend TypeScript errors unrelated to P217; Production build and frontend component tests pass.
4. **Out-of-scope banner collateral** — `booking-vehicle-preflight-banner.tsx` presentation defaults to EN when locale omitted.

All P2.2.17 hard gates pass: provenance, 2→0 VehiclePicker findings, hidden debt 0, machine semantics frozen, Category E 0, P217=0, P216 freezes intact, +9 keys justified, parity 100%, build PASS.

**DO NOT MERGE** per audit protocol — awaiting human merge decision.

**DO NOT BEGIN P2.2.18.**
