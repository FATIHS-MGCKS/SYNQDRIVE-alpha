# UX-011 — Cross-product accessibility audit closeout

**Date:** 2026-11-23  
**Merge:** [#2512](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/2512) → `698db6c0b1d4cfef4c8ea42febe0cfdcd4ee7f85`
**Base SHA:** `6394587609e761e6774256d5b888c53bb7bcc4ce` (post UX-010 #2511)  
**Scope:** Bounded risk-based audit — dialogs/sheets + shared tables (MAUX, RENTUX, OPUX, FEUX)  
**WCAG target:** 2.2 AA where applicable (automated + keyboard subset)  
**Certification:** **NOT CLAIMED** — partial axe + keyboard evidence only

## Phase 1 — Baseline (existing authority)

| Asset | Role |
|-------|------|
| `frontend/e2e/operator-a11y.spec.ts` | Operator Today — critical axe only |
| `frontend/e2e/legal-documents-a11y.spec.ts` | Rental legal admin — axe (color-contrast excluded) + dialog keyboard |
| `frontend/e2e/vehicle-detail-a11y.spec.ts` | Rental vehicle detail — tabs, menus, axe, touch targets |
| `frontend/e2e/evaluations-a11y.spec.ts` | Rental evaluations — axe |
| `frontend/e2e/portal-modal-focus-cycle.ts` | Shared focus-cycle harness (service modal) |
| `frontend/src/rental/lib/use-portal-modal-a11y.ts` | Shared modal focus trap + Escape |

**Known limitations (unchanged):** color-contrast often disabled in axe suites; Operator axe = critical-only; no full screenreader certification.

## Phase 2 — Representative surfaces matrix

| Product | Dialog / sheet | Table / list | Evidence |
|---------|----------------|--------------|----------|
| **MAUX** | `OrganizationCreateWizard` (`AppDialog`) | `OrganizationsView` + shared `DataTable` | vitest + code audit |
| **OPUX** | `OperatorBookingDetailSheet` | Operator Today task/booking lists (existing operator e2e) | vitest + `cross-product-a11y-ux011.spec.ts` |
| **RENTUX** | Legal upload wizard (existing e2e) | Bookings planner `DataTable` (inherits shared table fix) | existing `legal-documents-a11y`, `vehicle-detail-a11y` |
| **FEUX** | `AppDialog` / `FormDialog` / Radix | `DataTable` pattern | `data-table-a11y.ui.test.tsx` |

**Untested this pass:** Master engineering-hub modals, booking edit sheet (Rental), full Bookings planner axe, 200% zoom manual on Master, complete color-contrast debt.

## Phase 3 — Axe findings (bounded runs)

| Surface | critical | serious | moderate | minor | Notes |
|---------|----------|---------|----------|-------|-------|
| Operator booking sheet (UX-011 spec) | 0 (post-fix) | 0 | — | — | `color-contrast` excluded per existing policy; scoped to `[role="dialog"]` |
| Operator Today (existing spec) | — | — | — | — | Re-run with UX-011 branch (see PLAYWRIGHT_RESULTS) |
| Legal / vehicle detail | — | — | — | — | Baseline specs unchanged (no rule relaxations) |

## Phase 4 — Manual keyboard checklist (spot checks)

| Check | MAUX org wizard | OPUX booking sheet | RENTUX (existing e2e) |
|-------|-----------------|--------------------|------------------------|
| Dialog name | PASS (Radix `Title`) | PASS (`aria-labelledby`) | PASS (legal wizard e2e) |
| Focus into dialog | Radix default | PASS (`usePortalModalA11y` → close btn) | vehicle-detail menu Escape |
| Escape dismiss | Radix | PASS (e2e) | legal / status menu |
| Focus restore | Radix | PASS (hook) | vehicle status trigger |
| Tab cycle in modal | Not manually exercised | Trap via hook | portal-modal harness |

## Confirmed defects (fixed)

1. **MAUX** `OrganizationCreateWizard` — plain `<h2>` inside `AppDialog` (no accessible dialog name for assistive tech). **Fix:** `DialogPrimitive.Title`; back button `aria-label`.
2. **MAUX** `OrganizationsView` — icon-only pagination without names. **Fix:** `Vorherige/Nächste Seite` labels; header `variant="context"` for visible description.
3. **OPUX** `OperatorBookingDetailSheet` — `role="dialog"` without `aria-labelledby`; no focus trap/Escape; loading/error not announced. **Fix:** labelled title id, `usePortalModalA11y`, `role="status"` / `role="alert"`.
4. **FEUX** `DataTable` — loading state not exposed on table. **Fix:** `aria-busy` while `loading`.

### PR #2512 review closeout (F1–F3)

| Finding | Remediation |
|---------|-------------|
| **F1** i18n-new-debt-gate (`Zurück`, pagination, operator loading) | `common.back`, `master.organizations.list.pagination.*`, `operator.bookings.detail.loadingAnnouncement` — 9 locales |
| **F2** Wizard labels without `htmlFor`/`id` | Stable `org-wizard-*` ids on nine fields (both steps) |
| **F3** Bookings rows without keyboard detail open | Always-visible open control in `BookingsTableView` (`bookings.planner.openBookingAria`); `stopPropagation` on button |

New/updated regression: `organization-create-wizard.a11y.ui.test.tsx`, `bookings-table-view.a11y.ui.test.tsx`; vitest harnesses for localized aria (not source-only).

## Remaining accessibility debt

- Hardcoded DE visible wizard/dialog copy on Master org surfaces (pre-existing product copy; aria for F1 strings now i18n).
- `AppDialog` close control remains DE-only (`Schließen`).
- Color-contrast violations across StatusChip / muted tokens — **not** remediated in UX-011.
- `PlatformOpsHub` integrated tabs still missing `tabsAriaLabel` (documented UX-010).
- Bookings planner axe (beyond keyboard open control) — not scanned in this pass.
- Full WCAG 2.2 AA certification **not** claimed.

## Regression tests added

- `frontend/e2e/cross-product-a11y-ux011.spec.ts`
- `frontend/src/master/components/organizations-view-a11y.ui.test.tsx`
- `frontend/src/master/components/organization-create-wizard.a11y.ui.test.tsx`
- `frontend/src/rental/components/bookings/bookings-table-view.a11y.ui.test.tsx`
- `frontend/src/operator/components/operator-booking-detail-sheet.a11y.ui.test.tsx`
- `frontend/src/components/patterns/data-table-a11y.ui.test.tsx`

## UX-011 verdict

**BOUNDED_AUDIT_COMPLETE** — reproducible defects on audited surfaces fixed; extended regression tests; backlog item **UX-011 DONE**. Further a11y work is **post-backlog** debt tracking, not UX-012.

**Backlog final status:** `UI_UX_IMPROVEMENT_BACKLOG_2026-11-23.md` items UX-001–UX-011 **DONE** (or closed).