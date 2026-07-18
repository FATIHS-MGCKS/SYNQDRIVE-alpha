# Document Intake V2 — Shared Entity Review UI (V4.9.644)

**Date:** 2026-07-17  
**Scope:** Prompt 69 — interactive entity assignment review component.

## Goal

Replace read-only entity preview with a shared `DocumentEntityReview` component covering:

- Vehicle, Booking, Customer, Driver, Provider/Authority, Additional links
- Per section: best candidate, alternatives, match reasons, conflicts, search, select, “do not assign”

## Rules enforced

| Rule | Implementation |
|------|----------------|
| Nothing auto-confirmed | “Suggestion” badge on candidates; “Confirmed by you” only after PATCH entity-links |
| Origin context visible | `uploadContext.label` surfaced per matching section |
| Driver ambiguity clear | Hints for `UNKNOWN` role and close confidence gaps |
| Customer vs driver separate | Distinct sections with separate link types |
| Link change invalidates plan | Inline hint after successful PATCH (`planInvalidatedHint`) |
| No raw UUIDs | Display labels only in UI |
| Mobile-friendly | Stacked layout, `min-h-10` touch targets |

## Frontend modules

| Module | Role |
|--------|------|
| `document-entity-links.ts` | Parse `acceptedEntityLinks`, scope resolver, operation types |
| `document-entity-review.ts` | Build sections from public DTO candidate arrays + ranking |
| `DocumentEntityReview.tsx` | Section UI, search, confirm/change/remove |
| `useDocumentEntityLinks.ts` | PATCH wrapper (org + vehicle routes) |
| `DocumentExtractionReviewPanel.tsx` | Wires shared review when `entityReviewOrgId` + `t` provided |
| `api.ts` | `updateEntityLinks` / `updateEntityLinksByOrg` |

## Backend (reused)

`PATCH .../entity-links` (V4.9.633) — no backend changes in this release.

## Tests

- `document-entity-review.test.ts` — 0 / 1 / many candidates, confirmed vs suggestion
- `document-entity-review.ui.test.tsx` — no UUID leakage, suggestion badges
