# UX-005 — Master Admin organization detail responsive tabs

**Date:** 2026-11-23  
**Base SHA:** `5fc8e8f48aa5d20446cff230c342b72293536217` (PR #2503 merged)  
**Verification:** CODE + unit tests; responsive audit via local Master render (synthetic org detail header fixture).

## Tab inventory

| Check | Result |
|-------|--------|
| Tab count | **8** — `ORG_DETAIL_TABS` in `frontend/src/master/organizations/types.ts` |
| Shell | `MasterPageHeader` + shared `MasterPageTabs` + `chrome-tab-bar` scroll rail |
| URL sync | `orgTab` query — `readOrgTabFromUrl` / `writeOrgTabToUrl` in `org.utils.ts`; `popstate` in `OrganizationDetailView` |

## Navigation verdicts (375 / 768 / 1440)

| Viewport | Verdict | Notes |
|----------|---------|-------|
| Mobile (375px) | **COMPLIANT** (post-fix) | `min-w-0` header stack; tab rail `overflow-x-auto` only; no page-level horizontal overflow from tab bar |
| Tablet (768px) | **COMPLIANT** | Same scroll rail; header actions `flex-wrap` |
| Desktop (1440px) | **COMPLIANT** | Eight labels fit or scroll gracefully; `whitespace-nowrap` on triggers |

## Validation checklist

| # | Check | Verdict |
|---|-------|---------|
| 1 | No page-level horizontal overflow from tabs | PASS — scroll contained in `CHROME_TAB_BAR_SCROLL_CLASS` |
| 2 | All tabs reachable via horizontal scroll | PASS |
| 3 | Active tab visible after selection | PASS (post-fix) — `scrollChromeTabControlIntoView` on `activeId` |
| 4 | URL + Back/Forward restore tab | PASS — unit test `org-tab-url.test.ts` |
| 5 | Long labels remain operable | PASS — `truncate` on label span inside `shrink-0` triggers |
| 6 | Keyboard / disabled / ARIA | PASS — existing `MasterPageTabs` roving tabindex + `aria-controls` |
| 7 | Header back + actions on narrow width | PASS — icon back + wrapping actions |
| 8 | No duplicate nested scroll containers | PASS — single inner scroller |

## Confirmed defect (fixed)

| Defect | Fix |
|--------|-----|
| Programmatic or URL-driven `activeId` change could leave the selected org-detail tab outside the horizontal viewport (last tabs: Integrationen, Aktivität, Einstellungen) | Shared `scrollChromeTabControlIntoView` invoked from `MasterPageTabs` `useEffect` (benefits all Master chrome tab consumers; reduced-motion respected) |

## Regression tests added

- `frontend/src/components/patterns/chrome-tab-bar-scroll.test.ts`
- `frontend/src/master/shell/MasterPageTabs.test.tsx` (scroll on click)
- `frontend/src/master/organizations/org-tab-url.test.ts`

## Not changed

Organizations data loading, billing, IAM, permissions, backend, i18n scope (German tab labels pre-existing).