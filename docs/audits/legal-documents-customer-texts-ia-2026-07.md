# Legal Documents — Customer Legal Texts IA (Prompt 23/32)

**Date:** 2026-07-22

## Scope

Read-only information architecture redesign for **Verwaltung → Kunden-Rechtstexte** (formerly “Rechtliche Dokumente”). Mutation dialogs deferred to later prompts; existing upload/activate/archive preserved under “Schnellaktionen”.

## New components

| Component | Path | Role |
|-----------|------|------|
| `useLegalDocumentsOverview` | `rental/components/legal-documents/useLegalDocumentsOverview.ts` | Load list + optional audit events |
| `LegalDocumentsReadinessStrip` | `…/LegalDocumentsReadinessStrip.tsx` | Compact compliance summary (4 tiles, no duplicate KPIs) |
| `LegalDocumentCategoryCards` | `…/LegalDocumentCategoryCards.tsx` | Per-type readiness cards |
| `LegalDocumentConfigAlerts` | `…/LegalDocumentConfigAlerts.tsx` | Critical configuration hints |
| `LegalDocumentVersionHistorySection` | `…/LegalDocumentVersionHistorySection.tsx` | Version table |
| `LegalDocumentAuditSection` | `…/LegalDocumentAuditSection.tsx` | Recent lifecycle events |
| `LegalDocumentsLegacyMutations` | `…/LegalDocumentsLegacyMutations.tsx` | Preserved mutation surface |
| `buildLegalDocumentsReadinessSummary` | `rental/lib/legal-documents-overview.ts` | View-model / readiness engine |

## Reused design system

- `PageHeader` (variant `full`) — title, subtitle, status chip, refresh action
- `MetricCard` (variant `summary`) — readiness strip
- `DataCard` — category cards, alerts, audit wrapper
- `StatusChip` + `StatusDot` tones — status never color-only (labels on every chip)
- `SectionHeader` — subsection hierarchy
- `DataTable` — version history (horizontal scroll on mobile)
- `Timeline` — audit events
- `ErrorState`, `Button`, `toast` (sonner)

## Responsive decisions

| Breakpoint | Behavior |
|------------|----------|
| Mobile | Readiness strip 2×2 grid; category cards stack; table scrolls horizontally |
| Tablet | Category cards 1–2 columns |
| Desktop (`lg`) | Category cards 3-column grid; full table visible |

## Visual verification

1. Open **Verwaltung → Kunden-Rechtstexte**
2. Header shows title, subtitle, overall status chip (not green when any category blocked)
3. Readiness strip: Gesamtstatus / Einsatzbereit / Einschränkung / Blockiert
4. Config alerts list critical items with text labels
5. Three category cards answer: active version, valid since, approver, language/jurisdiction, next action
6. Version history table lists all versions; download action per row
7. Audit section (with `legal-documents-audit` read) shows timeline
8. Schnellaktionen at bottom for upload/activate (unchanged logic)

## Tests

```
legal-documents-overview.test.ts — 3 passed
npx tsc -b — exit 0
```

## API extensions

- `LegalDocumentDto` aligned with backend `LegalDocumentApiResponse` fields
- `api.legalDocuments.listEvents` for audit section
