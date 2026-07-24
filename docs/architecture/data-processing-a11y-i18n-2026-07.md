# Data Processing — Mobile, i18n & Accessibility (Prompt 38)

Date: 2026-07-24

## Found issues

| Area | Issue |
|------|--------|
| Tabs | Sub-nav had `role="tab"` but no `aria-controls`, roving `tabIndex`, or keyboard navigation |
| Tabpanel | Section container lacked `role="tabpanel"` / `aria-labelledby` |
| i18n | `LIFECYCLE_STATUS_LABELS` / `ENFORCEMENT_STATUS_LABELS` hardcoded German in constants |
| i18n | Hardcoded strings: revoke reason, unknown error, list load failure, pagination default |
| a11y | KPI buttons lacked descriptive `aria-label`; status chips relied on color only |
| a11y | Tables missing `aria-label` / caption; rows not keyboard-activatable |
| a11y | Dialog close button hardcoded `Schließen` in shared `AppDialog` |
| a11y | Lifecycle dialog errors not in error summary region with `aria-describedby` |
| Mobile | `animate-fade-up` without `motion-safe` / `prefers-reduced-motion` guard |
| Terms | Legal basis, consent, and provider access not linguistically separated in UI hints |

## Fixed

- **DataProcessingSubNav** — reuses `useRovingTablist` (Arrow, Home, End, roving tabindex, `aria-controls`)
- **DataProcessingHub** — `tabpanel` wiring, `#data-processing-main`, `motion-safe:animate-fade-up`
- **Status labels** — `data-processing-status-labels.ts` + full DE/EN `dataProcessing.status.*` keys
- **Tables** — `ariaLabel` + `sr-only` caption on all hub sections; keyboard row activation in `DataTable`
- **KPI strip** — `aria-label`, `aria-pressed`, `role="group"`, visible focus rings
- **LifecycleActionDialog** — error summary `role="alert"`, `aria-describedby`, `closeAriaLabel`
- **AppDialog** — optional `closeAriaLabel` (default `Close`)
- **Provider / Consent sections** — explicit term hints separating legal basis, consent, provider access
- **i18n** — new keys for a11y, tables, errors, lifecycle revoke reason, unsupported entity

## Tests

### Component / unit

```bash
cd frontend && npm test -- data-processing
```

Includes:

- `data-processing-a11y.ui.test.tsx` — tablist `aria-controls`, roving tabindex
- `data-processing-status-labels.test.ts` — status label i18n mapping
- existing `data-processing.ui.test.tsx` suite

### Playwright + Axe

```bash
cd frontend/e2e && npx playwright test data-processing-a11y.spec.ts
```

Covers:

- tab/tabpanel wiring
- Arrow / Home / End keyboard navigation
- Axe WCAG 2.x scan (critical/serious, color-contrast excluded like other modules)
- Wizard dialog focus + Escape
- 320px viewport overflow check

### Manual keyboard checklist

- [x] Section tabs: ArrowLeft/Right, Home, End, Enter/Space activate
- [x] Tabpanel receives focus outline when focused
- [x] KPI filters toggle with keyboard (button + `aria-pressed`)
- [x] Table rows activatable via Enter/Space when clickable
- [x] Wizard and lifecycle dialogs close on Escape (Radix focus trap)

## Remaining limitations

- **Drawer detail views** — slide-over panels use shared drawer pattern; full focus-return-to-trigger audit not extended beyond Radix dialog/wizard in this pass
- **Color contrast** — `StatusChip` tones excluded from Axe runs (shared design token QA, same as legal-documents module)
- **E2E mocks** — Playwright tests use API mocks; no live backend integration
- **AppDialog global close label** — only data-processing dialogs pass `closeAriaLabel`; other product dialogs still use default until migrated

## Changes / Architektur

- Changes: V4.9.821
- Architektur: Data Processing a11y/i18n patterns documented
