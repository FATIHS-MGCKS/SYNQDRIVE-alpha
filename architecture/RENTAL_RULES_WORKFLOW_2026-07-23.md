# Rental Rules Edit / Preview / Publish / History Workflow (Prompt 33)

Date: 2026-07-23

## Scope

End-to-end operator workflow for rental rules:

- Tri-state field editors (inherit / own / no requirement; booleans: inherit / required / not required)
- Organization scope without inherit (no real system default beyond permissive nulls)
- Per-field metadata: effective, inherited, draft, source, change impact
- Live preview (`active` / `draft` / `diff`) via revision preview APIs
- Vehicle overrides table with reset-to-category
- Publish impact panel with booking/manual-approval context
- Revision history list/detail APIs and UI
- Manual eligibility approval decisions from publish impact context
- DE/EN i18n and WCAG-oriented keyboard/focus patterns

## Backend

### New routes

- `GET /organizations/:orgId/rental-rules/revisions`
- `GET /organizations/:orgId/rental-rules/revisions/:revisionId`

`RentalRulesRevisionService.listRevisions` / `getRevisionDetail` include actor names and diff preview.

Overview `overrideVehicles` enriched with override field list, revision metadata (hash, validity, createdBy).

## Frontend

### New modules

- `rental-rule-field-state.util.ts` — tri-state semantics
- `RentalRuleTriStateControl.tsx` — radiogroup segmented control
- `RentalRuleFieldRow.tsx` — per-field metadata panel
- `RentalRuleLivePreviewPanel.tsx` — wired preview API
- `RentalRulesManualApprovalPanel.tsx` — booking eligibility approval UI

### Updated

- `RentalRuleFieldsForm.tsx` — tri-state editor + field rows
- `RentalRulePublishImpactPanel.tsx` — i18n, manual approvals, read-only messaging
- `RentalRulesOverridesSection.tsx` — accessible table + reset
- `RentalRulesHistorySection.tsx` — revision-based history
- Drawers: defaults, category, vehicle override + live preview

## Accessibility notes

- Tri-state controls use `role="radiogroup"` / `role="radio"` with `aria-checked`
- Visible `focus-visible` rings on interactive controls
- Semantic labels (`aria-labelledby`, `sr-only` labels)
- History rows expandable via keyboard-focusable buttons
- Status communicated with text labels, not color alone
- Drawer/dialog focus inherited from existing `DetailDrawer` pattern

## API client

`api.rentalRules.previewRevision`, `listRevisions`, `getRevision`
