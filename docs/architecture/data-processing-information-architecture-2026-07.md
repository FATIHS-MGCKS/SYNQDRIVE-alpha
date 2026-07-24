# Data Processing & Approvals — Information Architecture (Prompt 34)

**Date:** 2026-07-24  
**Scope:** Frontend read-only hub for Verwaltung → Datenverarbeitung & Freigaben  
**Follow-ups:** Mutating workflows in Prompts 35–36

## Page identity

| Field | Value |
|-------|-------|
| Nav / tab label (DE) | Datenverarbeitung & Freigaben |
| Nav / tab label (EN) | Data Processing & Approvals |
| Eyebrow | Verwaltung / Administration |
| Subtitle | Control processing, technical access policies, provider access, sharing, and consents |

## Information architecture (6 sections)

1. **Verarbeitungstätigkeiten** — Processing activity register (`GET .../processing-activity-register`)
2. **Technische Zugriffspolicies** — Runtime enforcement coverage (`GET .../coverage`)
3. **Providerzugriffe** — System/provider authorizations (filtered legacy `data-authorizations`)
4. **Einwilligungen** — Non-provider org approvals/consents (complement filter)
5. **Partner & Auftragsverarbeiter** — DPA list (`GET .../data-processing-agreements`)
6. **Audit & Entscheidungen** — Authorization decision audit (`GET .../audit/authorization-decisions`)

Permission gating: `data-authorization` read unlocks hub and all six sections (granular `data_processing.*` to be wired in later prompts).

## New frontend components

| Component | Path | Role |
|-----------|------|------|
| `DataProcessingHub` | `frontend/src/rental/components/settings/data-processing/DataProcessingHub.tsx` | Main page shell |
| `DataProcessingPageHeader` | `.../DataProcessingPageHeader.tsx` | `PageHeader variant="full"` + readiness chip |
| `DataProcessingReadinessStrip` | `.../DataProcessingReadinessStrip.tsx` | Four `MetricCard` summary (no false green) |
| `DataProcessingSubNav` | `.../DataProcessingSubNav.tsx` | Horizontal section tabs |
| `useDataProcessingHub` | `.../useDataProcessingHub.ts` | Parallel section data loading |
| Section components | `.../sections/*.tsx` | Read-only lists per IA area |
| `buildDataProcessingReadinessSummary` | `frontend/src/rental/lib/data-processing-readiness.ts` | Technical readiness (no DSGVO claim) |
| `buildDataProcessingPermissions` | `frontend/src/rental/lib/data-processing-permissions.ts` | Section visibility |
| `useDataProcessingPermissions` | `frontend/src/rental/hooks/useDataProcessingPermissions.ts` | Hook wrapper |

Tab wiring: `DataAuthorizationTab` re-exports `DataProcessingHub` (legacy consent-center UI preserved under `data-authorization/` for P35/P36).

## Reused design system building blocks

- `PageHeader` (full variant, eyebrow, status chip, meta)
- `MetricCard` (summary variant, compact value)
- `DataTable`, `StatusChip`, `EmptyState`, `ErrorState`, `SkeletonRows`
- Layout tokens: `surface-premium`, `surface-frosted`, `animate-fade-up`
- Sub-nav pattern aligned with Verwaltung tab bars (horizontal scroll, `role="tablist"`)

## Readiness model

Overall status keys (never “DSGVO-konform”):

| Key | Tone | Meaning |
|-----|------|---------|
| `noData` | neutral | Empty register + no legacy authorizations |
| `blockingGaps` | critical | Register gaps and/or open enforcement flows |
| `partnerReview` | watch | DPA transfer/status attention |
| `traceable` | success | No blocking gaps in current view |

Strip metrics: Register completeness, Runtime Coverage ratio, Partner/DPA attention count.

## Responsive behavior

| Breakpoint | Behavior |
|------------|----------|
| Mobile (`< md`) | Sub-nav horizontal scroll; section content as stacked cards |
| Tablet / Desktop (`≥ md`) | `DataTable` for lists; extra columns at `lg` |
| Hub container | `max-w-[1600px]`, spacing `space-y-5` |

## API surface (frontend)

`api.dataProcessing` in `frontend/src/lib/api.ts`:

- `register.list(orgId)`
- `coverage.get(orgId)`
- `dpa.list(orgId)`
- `audit.authorizationDecisions(orgId)`
- Legacy: `api.dataAuthorizations.list(orgId)` for providers/consents split

## Tests

- `frontend/src/rental/lib/data-processing-readiness.test.ts` — readiness logic
- `frontend/src/rental/components/settings/data-processing/data-processing.ui.test.tsx` — hub, nav, section states

Run: `cd frontend && npm test -- data-processing`

## Explicit non-goals (Prompt 34)

- No mutating workflows (create/edit/grant/revoke)
- No compliance evidence export UI
- No granular permission matrix beyond hub read gate
