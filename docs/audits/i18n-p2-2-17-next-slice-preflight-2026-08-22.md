# P2.2.17 — Next-Slice Discovery (Read-Only Pre-Flight)

**Date:** 2026-08-22  
**Mode:** Strict read-only audit — no implementation  
**Repository:** FATIHS-MGCKS/SYNQDRIVE-alpha  
**Audit branch:** `cursor/p2217-next-slice-preflight-audit-3c10`

---

## 0. Provenance — Post-P2.2.16C Baseline

| Check | Independent result |
|-------|-------------------|
| PR #1140 merged | **YES** (`mergedAt`: 2026-08-22T01:27:06Z) |
| Merge SHA | `f709520590967c4a128f91a38f07d0672f6d4a55` |
| Merge message | `P2.2.16C.2B — Task Detail Host Residual Localization (#1140)` |
| P216A/B1/B2/C1/C2A/C2B ancestry | Present via merge chain |
| Audit-only branch used as baseline | **NO** |
| Stale implementation branch | **NO** |
| Working tree at audit time | Clean on `f7095205` |

**POST_P216C_CONTENT_HEAD = `f709520590967c4a128f91a38f07d0672f6d4a55`**

---

## 1. P2.2.16C Freeze Verification

| Boundary | Result |
|----------|--------|
| P216A | 0 |
| P216B1 | 0 |
| P216B2 | 0 |
| P216C1 | 0 |
| P216C2A | 0 |
| P216C2B | 0 |

- Task Detail active presentation debt (hosts + shared chrome/workflow): **0**
- Timeline bridge locale (`TASK_TIMELINE_BRIDGE_LOCALE`): **absent**
- `buildChecklistBlockerLabel(resolveTaskDetailPresentationLocale(locale), …)` production path: **intact**
- EN/DE parity: **100%** (7899/7899)
- New Task Detail compat consumers since P216C: **0**

**P2.2.16C remains frozen. Do not reopen.**

---

## 2. Global I18N Baseline (Independent Recompute)

Scanner: `frontend/scripts/i18n-hardcoded-scan.mjs` (regenerated at `f7095205`).

| Metric | Value |
|--------|-------|
| Total unique findings | 1719 |
| **Global enforce-clean remaining** | **2** |
| Rental findings | 488 |
| Master findings | 1049 |
| Operator findings | 156 |
| SHARED findings | 1 |
| SHELL findings | 25 |
| Canonical EN keys | **7899** |
| Canonical DE keys | **7899** |
| Parity | **100%** |
| Shim total | **29** (prod 18, test 11) |
| Shim drift since P216C | **0** |

Rental module breakdown: other 337, Finance/Billing 127, Tasks 13, Bookings 2, Documents 8, App shell 1.

---

## 3–4. Remaining Debt Cluster Inventory

Meaningful clusters identified (domain-level, not file-ranked):

| # | Domain cluster | Primary files | Scanner | Hidden est. | Active? | User impact | Risk | Testability |
|---|----------------|---------------|---------|-------------|---------|-------------|------|-------------|
| 1 | **Booking vehicle picker** | `VehiclePickerStep.tsx`, `booking-vehicle-preflight.ts` | 2 (enforce-clean) | ~18–22 | **ACTIVE** | **HIGH** | LOW | ACCEPTABLE |
| 2 | **Damage repair task dialog** | `CreateRepairTaskDialog.tsx` | ~12 | ~8 | ACTIVE | MEDIUM | LOW | WEAK |
| 3 | **Operator task card** | `OperatorTaskCard.tsx`, `operatorTaskCard.utils.ts` | 4 | ~6 | ACTIVE | HIGH | LOW | ACCEPTABLE |
| 4 | **Operator vehicle quick view** | `OperatorVehicleQuickView.tsx` | 22 | unknown | ACTIVE | HIGH | MODERATE | WEAK |
| 5 | **Operator booking sheets** | `OperatorBookingFormSheet.tsx`, cancel/no-show sheets | 27+ | unknown | ACTIVE | HIGH | MODERATE | WEAK |
| 6 | **Master health/billing admin** | `HealthTrackingView.tsx`, `billing/*` | 232+ | high | ACTIVE (admin) | LOW | MODERATE | WEAK |
| 7 | **Rental billing/finance** | `billing/*`, `FinanceView.tsx` | 127 | moderate | ACTIVE | MEDIUM | MODERATE | ACCEPTABLE |
| 8 | **Micro single-finding surfaces** | `HomeAwayBadge`, `LegalDocumentsTab`, etc. | 1 each | low | ACTIVE | LOW | LOW | WEAK |

---

## 5. VehiclePickerStep — Known Baseline Debt (Explicit)

| Item | Detail |
|------|--------|
| Exact file | `rental/components/new-booking/VehiclePickerStep.tsx` |
| Enforce-clean findings | **2** (only global enforce-clean debt) |
| Finding 1 | Line ~348: `Alle Stationen` (TEXT, occurs 2× in file; 5× repo-wide) |
| Finding 2 | Line ~383: `Filter zurücksetzen` (TEXT, occurs 2× in file; 3× repo-wide) |
| Migration phase | P2.2.3 (bookings enforce-clean prefix `rental/components/new-booking/`) |
| Active production UI | **YES** — consumed by `NewBookingView.tsx` |
| `useLanguage()` present | **YES** (partial localization already done) |
| Existing key reuse | `bookings.planner.allStations`, `tasks.filter.resetFilters`, `bookings.wizard.noTariff` (partial) |
| Presentation-only | **YES** (filter values, labels, status tabs, preflight copy) |

### Hidden literals beyond scanner (same cluster)

**In `VehiclePickerStep.tsx`:**

| Literal | Role |
|---------|------|
| `STATUS_TABS` labels: Alle, Verfügbar, Reserviert, Vermietet, Wartung | Status filter chrome |
| `Weitere Filter` | Mobile filter toggle |
| `aktiv` | Active-filter badge |
| `Kein Tarif` | Price fallback (key `bookings.wizard.noTarif` **already exists**) |
| `fleetStatusLabelDe(...)` | Hardcoded DE operational label |

**In `booking-vehicle-preflight.ts` (coupled helper):**

| Literal | Role |
|---------|------|
| `Nicht vermietbar` | Blocking reason |
| `Mietfreigabe nicht verifiziert` | Blocking reason |
| `Kein aktiver Tarif zugewiesen` | Blocking reason |
| `Status nicht verfügbar` | Blocking reason |
| `In Wartung — Auswahl mit Vorsicht` | Caution reason |
| `Aktuell vermietet` / `Reserviert` | Caution reasons |
| `Gesundheit kritisch` / `Gesundheit Warnung` | Health caution |
| `fleetStatusLabelDe` | DE-only wrapper around `formatVehicleOperationalStatusLabel` |
| `UNCATEGORIZED_VEHICLE_LABEL` | DE label constant |

**Scanner-visible: 2 | Hidden presentation: ~18–22 | Total cluster debt: ~20–24**

This is **not** a 2-string task.

---

## 6–7. Other Small High-Confidence Candidates

| Candidate | Why considered | Why not #1 |
|-----------|----------------|------------|
| `CreateRepairTaskDialog` | Bounded English dialog, ~12 scanner hits | Not enforce-clean debt; no global i18n:check unblock |
| `OperatorTaskCard` | 4 German strings, mobile-visible | Hidden `taskStatusLabelDe`; no enforce-clean gate |
| `HomeAwayBadge` | 1 finding | Low impact; likely micro-residual |
| `LegalDocumentsTab` | 1 finding | Secondary surface |

**VehiclePickerStep wins** on: enforce-clean gate ownership, P2.2.3 residual closure, active core booking workflow, bounded file count, existing `bookings.wizard.*` namespace, test harness already exists (`rental-bookings-customers-localization.test.tsx`).

---

## 8. Key Reuse Analysis (Selected Cluster)

| Concept | Classification | Candidate key |
|---------|----------------|---------------|
| All stations filter | B — reuse | `bookings.planner.allStations` or new `bookings.wizard.allStations` |
| Reset filters | B — reuse | `tasks.filter.resetFilters` or `fleetConnectivity.clearFilters` (semantic overlap) |
| No tariff price | A — exact | `bookings.wizard.noTariff` |
| Status tab labels | C — new | `bookings.wizard.status.*` (5 keys) or reuse `vehicle.status.*` / operational tab keys |
| More filters / active badge | C — new | `bookings.wizard.moreFilters`, `bookings.wizard.filtersActive` |
| Preflight blocking/caution | C — new | `bookings.wizard.preflight.*` (~8 keys) |
| Operational status chip | B — reuse | `formatVehicleOperationalStatusLabel(status, locale)` (already EN/DE capable) |

**Reuse estimate:** ~40–50%  
**New-key estimate:** ~8–12 genuinely new semantic keys  
**Duplicate risk:** LOW if `bookings.wizard.*` namespace used consistently  
**Orphan risk:** LOW

---

## 9. Machine / Domain Semantic Risk

| Machine value | Localization risk |
|---------------|-------------------|
| `VEHICLE_OPERATIONAL_STATUS.*` enum | LOW — label only |
| `brandFilter` / `stationFilter` / `fuelFilter` values (`all`, IDs) | LOW — unchanged |
| `FleetStatus` / `hardBlockReason` codes | LOW — presentation separate |
| Vehicle IDs, tariff IDs, health payloads | **FROZEN** — not translated |
| Filter callback semantics (`onResetFilters`, etc.) | **FROZEN** |

**Category E expectation: 0** — achievable.

---

## 10–12. Production Surface / User Impact / Testability

| Cluster | Surface | Impact | Testability |
|---------|---------|--------|-------------|
| Booking vehicle picker | ACTIVE PRODUCTION (new booking wizard step 2) | **HIGH** — first-run booking flow, mixed DE/EN under EN locale | **ACCEPTABLE** — `rental-bookings-customers-localization.test.tsx` covers P2.2.3; `useLanguage()` wired; runtime switch feasible |

---

## 13. Server / Client Boundary

- `VehiclePickerStep` is client component with `useLanguage()` — **no new locale architecture needed**
- `booking-vehicle-preflight.ts` is plain utility — must receive `locale` explicitly (same pattern as P2.2.16B/C)
- Memoization: pass `locale` into `useMemo` deps where preflight labels computed

---

## 14. Date/Time / Formatting

- No `de-DE` / `en-US` in `VehiclePickerStep.tsx`
- `booking-vehicle-preflight.ts`: currency via `formatNetAsGross` (existing); no fixed locale formatters in cluster
- Fuel type chips display raw `vehicle.fuelType` English enum strings — **machine/domain display** (Electric, Diesel); classify as intentional technical unless product requests translation

---

## 15. Cross-Domain Coupling

| Coupling | Blast radius |
|----------|--------------|
| `formatVehicleOperationalStatusLabel` | Shared vehicle ops module — read-only reuse, no modification required |
| `resolveBookingVehiclePreflight` | Used only by booking picker path — **LOW** |
| `NewBookingView` parent | Passes props only — no label changes needed |
| Shared select/filter components | None — inline selects in VehiclePickerStep |

**Blast radius: LOW** — no split required for coupling.

---

## 16. Dictionary Health

| Metric | Value |
|--------|-------|
| EN | 7899 |
| DE | 7899 |
| Parity | 100% |
| Orphans | 0 (registry tests pass) |
| Recent P216 groups | `tasks.detail.*`, `tasks.detail.actions.*`, `tasks.resolution.code.*` |
| Namespace consistency | `bookings.wizard.*` already established (30+ keys) — preferred for new picker keys |

---

## 17. Shim / Compatibility

| Metric | Value |
|--------|-------|
| Total | 29 |
| Production | 18 |
| Test | 11 |
| Drift since P216C | 0 |

**Target for P2.2.17: new compat consumers = 0**

---

## 18. Scanner Baseline Validity

- Methodology remains meaningful: enforce-clean surfaces detected; P216 boundaries all 0
- P2.2.3 prefix `rental/components/new-booking/` is enforce-clean — correctly flags VehiclePickerStep
- Known false-negative pattern: `STATUS_TABS` config array, `fleetStatusLabelDe`, preflight helper strings — **requires blind-spot guards** (same pattern as P2.2.16)
- No stale allowlists identified for selected cluster
- Scanner modification **not required** as prerequisite

---

## 19. Prioritization Model (Weighted)

Scoring 1–5 (5 = best for next slice):

| Cluster | User impact | Enforce-clean | Hidden debt bounded | Key reuse | Size | Risk | Testability | **Total** |
|---------|-------------|---------------|---------------------|-----------|------|------|-------------|-----------|
| Booking vehicle picker | 5 | 5 | 4 | 4 | 4 | 5 | 4 | **31** |
| Operator task card | 4 | 1 | 4 | 3 | 5 | 5 | 4 | 26 |
| Damage repair dialog | 3 | 1 | 4 | 2 | 4 | 5 | 2 | 21 |
| Operator vehicle quick view | 4 | 1 | 2 | 2 | 2 | 3 | 2 | 16 |
| Master health admin | 1 | 1 | 1 | 2 | 1 | 3 | 2 | 11 |

---

## 20. Top 5 Ranked Candidates

### #1 — Booking Vehicle Picker (RECOMMENDED)
- **Files:** `VehiclePickerStep.tsx`, `booking-vehicle-preflight.ts`
- **Visible:** 2 enforce-clean | **Hidden:** ~18–22
- **New keys:** ~8–12 | **Reuse:** ~40–50%
- **Risk:** LOW | **Tests:** ACCEPTABLE (extend P2.2.3 harness)
- **Why now:** Only global enforce-clean debt; closes P2.2.3 gap; high-visibility active booking flow

### #2 — Operator Task Card
- **Files:** `OperatorTaskCard.tsx`, `operatorTaskCard.utils.ts`
- **Visible:** 4 | **Hidden:** ~6 (`taskStatusLabelDe`, aria template)
- **Why later:** Not enforce-clean; no global check unblock

### #3 — Damage Repair Task Dialog
- **Files:** `CreateRepairTaskDialog.tsx`
- **Visible:** ~12 English strings | **Hidden:** ~8
- **Why later:** English-only dialog; weaker test baseline

### #4 — Operator Vehicle Quick View
- **Files:** `OperatorVehicleQuickView.tsx`
- **Visible:** 22 | **Hidden:** unknown (likely high)
- **Why later:** Larger scope; moderate coupling

### #5 — Rental Billing Micro-Surfaces
- **Files:** various `billing/*` 2–5 findings each
- **Visible:** distributed | **Hidden:** moderate
- **Why later:** lower urgency; finance domain coupling

---

## 21–22. P2.2.17 Scope Decision

**Selected scope:** **P2.2.17 — Booking Vehicle Picker Localization**

**One slice or split:** **A — ONE IMPLEMENTATION SLICE**

Rationale: `VehiclePickerStep` and `booking-vehicle-preflight.ts` are tightly coupled — localizing UI chrome without preflight strings would leave German leakage on every vehicle card under EN locale.

---

## 23. Exact File Boundary

### `P217_ENFORCE_CLEAN_EXACT` (proposed)

```
rental/components/new-booking/VehiclePickerStep.tsx
rental/lib/booking-vehicle-preflight.ts
```

### Presentation adapter (recommended, not in enforce-clean)

```
rental/lib/booking-vehicle-preflight-presentation-i18n.ts
```

No broad `rental/components/new-booking/` prefix for P217 — exact paths only.

---

## 24. Presentation Architecture

```
useLanguage().{t, locale}
  → VehiclePickerStep (filter chrome, status tabs, badges)
  → resolveBookingVehiclePreflight(vehicle, health, hasTariff, catalogLoading, { locale })
    → booking-vehicle-preflight-presentation-i18n (blocking/caution copy)
    → formatVehicleOperationalStatusLabel(status, locale)  // replace fleetStatusLabelDe
```

Machine codes (`hardBlockReason`, filter values, vehicle IDs) unchanged.

---

## 25. Key Strategy

**Reuse:**
- `bookings.wizard.noTariff`
- `bookings.planner.allStations` (or alias `bookings.wizard.allStations`)
- `tasks.filter.resetFilters` (or dedicated `bookings.wizard.resetFilters`)
- `formatVehicleOperationalStatusLabel` for status chips

**New namespace (estimate 8–12 keys):**
- `bookings.wizard.status.all|available|reserved|rented|maintenance`
- `bookings.wizard.moreFilters`
- `bookings.wizard.filtersActive`
- `bookings.wizard.preflight.*` (blocking/caution reasons)

**Duplicate prevention:** Search `bookings.*`, `vehicle.status.*`, `health.*` before adding.

---

## 26. Machine Semantics Freeze (Future Implementation)

**FROZEN:**
- Filter values (`all`, brand/station/fuel IDs)
- `onSelectVehicle`, `onResetFilters`, callback signatures
- `VEHICLE_OPERATIONAL_STATUS` enum values
- `hardBlockReason` codes (`offline`, `rental_blocked`, `no_tariff`)
- Vehicle registration, make/model, station names (user/domain data)
- Tariff calculation, `catalogLoading` logic, `isSelectable` predicates

**Category E target: 0**

---

## 27. Required Future Test Plan

Extend or add `booking-vehicle-picker-localization.test.tsx`:

1. EN render — filter labels, status tabs, reset button, no-tariff fallback
2. DE render — same surfaces
3. Runtime locale switch DE ↔ EN
4. Preflight blocking/caution strings localized per locale
5. `formatVehicleOperationalStatusLabel` receives locale (not `fleetStatusLabelDe`)
6. Filter values / vehicle IDs / callbacks unchanged
7. No raw `TranslationKey` in output
8. No German leak under EN
9. P217 enforce-clean inventory = 0
10. Blind-spot guards on `STATUS_TABS`, preflight helper maps
11. `npm run build` PASS
12. P216A–C2B regression = 0

---

## 28. Blind-Spot Guard Plan

Focused guards (not broad scanner expansion):

- No hardcoded `STATUS_TABS` German labels
- No `fleetStatusLabelDe` in production picker path
- No German preflight prose in `booking-vehicle-preflight.ts`
- No `Alle Stationen` / `Filter zurücksetzen` literals
- `resolveBookingVehiclePreflight` must accept locale parameter

---

## 29. VehiclePickerStep Decision

**Should VehiclePickerStep be P2.2.17?**

**YES**

Proof:
- Active production UI in core booking wizard
- Only global enforce-clean debt (2 findings)
- Bounded to 2 production files (+ optional adapter)
- P2.2.3 enforce-clean prefix already claims `new-booking/` — this closes a documented gap
- Hidden debt is significant but contained within same cluster (not a reason to defer)

---

## 30. P2.2.16C Freeze Protection

P2.2.17 scope does **not** touch Task Detail hosts, shared workflow, or timeline utils.

**Required future regression:** P216A/B1/B2/C1/C2A/C2B = 0

---

## 31. Global `i18n:check` Expectation

**A — YES**

Independent verification: the **only** enforce-clean violations in the entire repository are the 2 VehiclePickerStep findings. Implementing P2.2.17 with full hidden-literal cleanup in the bounded cluster is expected to reduce `enforceCleanRemaining` from 2 → 0 and unblock the global `npm run i18n:check` enforce-clean assertion (currently fails in `rental-bookings-customers-localization.test.tsx` and related guards).

**Caveat:** Test files that assert global `enforceCleanRemaining === 0` may need updating only if scanner methodology changes — not expected.

---

## 32. Implementation Contract

### P2.2.17 — Booking Vehicle Picker Localization

**IN SCOPE:**
- `rental/components/new-booking/VehiclePickerStep.tsx`
- `rental/lib/booking-vehicle-preflight.ts`
- Optional: `rental/lib/booking-vehicle-preflight-presentation-i18n.ts`
- Dictionary additions under `bookings.wizard.*`
- `P217_ENFORCE_CLEAN_EXACT` scanner/guard entries
- Localization tests + P2.2.3 harness extension
- Audit + architecture docs

**OUT OF SCOPE:**
- `NewBookingView.tsx` (unless prop threading required — presentation only)
- Task Detail / P216 frozen code
- Operator surfaces
- Master admin
- VehiclePickerStep fuel-type enum display (machine values)
- `useTaskDetail.ts` dead-code German fallback
- VehiclePickerStep unrelated files
- Scanner weakening / allowlists

**Acceptance criteria:**
1. P217 scoped visible findings = 0
2. P217 scoped hidden presentation literals = 0
3. EN/DE correct + runtime switch
4. Category E = 0
5. Parity 100%, orphans 0
6. New compat consumers = 0
7. P216 boundaries = 0
8. Global enforce-clean = 0
9. Meaningful tests PASS, build PASS, `git diff --check` PASS

---

## 33. Final Verdict

**A — GO**

P2.2.17 should implement **Booking Vehicle Picker Localization** as a single bounded slice covering `VehiclePickerStep.tsx` and `booking-vehicle-preflight.ts`, closing the last P2.2.3 enforce-clean gap and the only global enforce-clean debt.

---

## Explicit Confirmations

| Item | Value |
|------|-------|
| Production code modified | **NO** |
| Dictionaries modified | **NO** |
| Scanner modified | **NO** |
| Tests modified | **NO** |
| P2.2.17 implementation started | **NO** |
| Merged | **NO** |
| `useTaskDetail.ts` modified | **NO** (non-blocking dead-code observation preserved) |
