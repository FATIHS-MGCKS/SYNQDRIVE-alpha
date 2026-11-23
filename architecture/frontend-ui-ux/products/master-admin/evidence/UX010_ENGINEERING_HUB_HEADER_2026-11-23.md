# UX-010 — Master Admin engineering hub header alignment

**Date:** 2026-11-23  
**Base SHA:** `b47834174c7ee7f2428d4c388d2230520f280a61` (post UX-009 #2508)  
**Reference:** `frontend/src/master/platform-ops/PlatformOpsHub.tsx` + shared `MasterPageHeader` / `MasterPageTabs`  
**Verification:** CODE audit + `engineering-hub-header.contract.test.ts`; no authenticated browser session (visual E2E not claimed).

## Phase 1 — Visual contract audit

| Check | PlatformOps reference | Engineering hubs |
|-------|----------------------|------------------|
| Title hierarchy | `variant="context"` → PageHeader `full` | **Defect (pre-fix):** default `page` hid `description` text |
| Description typography | Shown under title (`text-[13px] muted`) | Same when `context` |
| Header variant | `context` for multi-section hub | Applied to all five engineering views |
| Icon | None on reference | LV/HV battery hubs keep leading icons (product identity) |
| Status chip | Global platform state | **Intentional omission** — no equivalent live status on engineering tools |
| Refresh actions | Header `actions` | Tire / battery hubs already compliant; VSI/APDS refresh in scope section |
| Tab placement | Intended in header | **Tire:** detached tabs → integrated; **VSI:** tabs after scope pickers (intentional IA) |
| Header–content spacing | `space-y-5` wrapper | Parent `PageContainer` `master-page-stack` (compliant) |
| Responsive | Actions wrap; tabs scroll rail | Shared `MasterPageTabs` / PageHeader unchanged |
| i18n | Reference DE-hardcoded (pre-existing debt) | Engineering hubs use existing `t()` keys only |

### Reference note (out of scope for code change)

`PlatformOpsHub` passes `tabs` without `tabsAriaLabel`, so `MasterPageHeader` does not render integrated tabs today. Documented as **known reference gap**; UX-010 did not change PlatformOps (engineering-only scope).

## Phase 2 — Fixes applied

| Surface | Verdict pre-fix | Change |
|---------|-----------------|--------|
| VSI | Description invisible | `variant="context"` |
| APDS | Description invisible | `variant="context"` |
| Tire calibration | Description invisible; tabs detached | `variant="context"`; tabs + `tabsAriaLabel` on header; refresh `aria-label` |
| Battery LV shadow | Description invisible | `variant="context"` |
| Battery HV | Description invisible | `variant="context"` |

**Preserved:** scope pickers, URL sync, tab gating on VSI, refresh behavior, icons, translation keys, permissions.

## Phase 3 — Regression checklist

| # | Check | Verdict |
|---|-------|---------|
| 1 | Title + description visible | PASS (context variant) |
| 2 | Responsive header layout | PASS (shared PageHeader) |
| 3 | Header actions functional | PASS (battery + tire) |
| 4 | Tab navigation preserved | PASS (tire integrated; VSI conditional tabs unchanged) |
| 5 | No duplicate headers | PASS |
| 6 | No new hardcoded user copy | PASS |
| 7 | ARIA on tire refresh | PASS |

## Tests

- `frontend/src/master/shell/engineering-hub-header.contract.test.ts`

## UX-010 final verdict

**ALIGNED_MINIMAL** — shared `context` hub header semantics restored; tire tab chrome matches PlatformOps integration pattern without relocating engineering selectors.

**Next backlog item:** UX-011 (accessibility sweep).