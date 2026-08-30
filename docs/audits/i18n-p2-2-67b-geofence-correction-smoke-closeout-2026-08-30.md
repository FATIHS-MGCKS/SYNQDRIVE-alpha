# P2.2.67b — Geofence Correction Smoke Closeout Final Audit

**Date:** 2026-08-30  
**Mode:** STRICT READ-ONLY DELTA + SMOKE CERTIFICATION  
**Implementation PR:** #1444  
**Original P266 baseline:** `bbeb09b9c8b4e58fe0749caba25721bfc78e4ce2`  
**Pre-correction HEAD:** `dd84d429347f00142b3bf0b4b6a523535e331c17`  
**Corrected HEAD:** `8be8f131a7acd0ab772725b16792a403b4152ec7`  
**Prior closeout audit:** PR #1446 (verdict B — non-blocking HomeAwayBadge tooltip observation)

---

## 1. PR #1444 topology

| Check | Result |
|-------|--------|
| State | OPEN |
| Draft | YES |
| Merged | NO |
| Mergeable | MERGEABLE |
| Base OID | `bbeb09b9c8b4e58fe0749caba25721bfc78e4ce2` ✓ |
| Head OID | `8be8f131a7acd0ab772725b16792a403b4152ec7` ✓ |
| Commit count | **4** |

**Commits:** `f401cda23` → `91fa584c9` → `dd84d4293` → `8be8f131a`

---

## 2. Correction delta (dd84d429 → 8be8f131a)

| Path | Scope |
|------|-------|
| `frontend/src/rental/components/HomeAwayBadge.tsx` | Production tooltip/title/label localization |
| `frontend/src/i18n/translations/rental.microChrome.en.ts` | +9 geofence keys |
| `frontend/src/i18n/translations/rental.microChrome.de.ts` | +9 geofence keys |
| `frontend/src/rental/components/rental-micro-chrome-localization.test.tsx` | Extended HOME/AWAY/UNKNOWN same-mount coverage |

**No unrelated semantic changes.** No scanner/governance/docs delta in correction commit.

---

## 3. Tooltip debt resolution

| Previously identified host copy | Status |
|--------------------------------|--------|
| Home tooltip | Resolved → `fleet.geofence.tooltip.home` |
| Away tooltip | Resolved → `fleet.geofence.tooltip.away` |
| Station unresolved | Resolved → `fleet.geofence.tooltip.stationUnresolved` |
| Missing coordinates | Resolved → `fleet.geofence.tooltip.missingCoordinates` |
| Missing radius | Resolved → `fleet.geofence.tooltip.missingRadius` |
| Missing GPS | Resolved → `fleet.geofence.tooltip.missingGps` |
| Generic unknown | Resolved → `fleet.geofence.tooltip.unknown` |
| Compact unknown/title framing | Resolved → `fleet.geofence.statusUnknown` + localized `compactTitle` |

**EN locale:** zero German tooltip prose (verified in tests: no `Umkreis`, `Koordinaten`, `Geofence-Status` under EN).

---

## 4. Home / Away / — label handling

| Display | Handling |
|---------|----------|
| **Home** | Localized via `fleet.geofence.state.home` (EN: Home, DE: Zuhause) |
| **Away** | Localized via `fleet.geofence.state.away` (EN: Away, DE: Unterwegs) |
| **—** | Visual unknown placeholder retained (typographic dash, not host prose) |

**Machine state** (`home` / `away` / `unknown` ChipState) unchanged. Only presentation keys differ by locale.

---

## 5–8. Raw ownership, semantics, same-mount

| Check | Result |
|-------|--------|
| Raw `stationName` (`Provider Station X7`) | Preserved byte-identical in interpolated tooltips |
| Raw `license` (`KS MX 2024`) | Preserved byte-identical in missing-GPS tooltip |
| `isVehicleAtHomeStation()` outcome | Unchanged — logic untouched |
| Palette per state | Unchanged (`bg-emerald-50` / `bg-gray-100` / `bg-amber-50`) |
| Icon per state | Unchanged (`home` / `help-circle`) |
| HOME same-mount DE→EN→DE | PASS |
| AWAY same-mount | PASS |
| UNKNOWN same-mount (5 subcases) | PASS — station unresolved, missing coords, missing radius, missing GPS, generic unknown |

---

## 9. Key accounting

| Metric | Value |
|--------|------:|
| P266 keys before correction | 9 |
| New correction keys | 9 |
| Reused correction keys | 1 (`fleet.geofence.statusUnknown`) |
| **Final P266 keys** | **18** (≤18 ✓) |
| Final EN / DE | **9736** / **9736** |
| Parity | 100% |
| Orphans / unused | 0 / 0 |

**New correction keys:** `fleet.geofence.state.home`, `.state.away`, `.tooltip.home`, `.tooltip.away`, `.tooltip.stationUnresolved`, `.tooltip.missingCoordinates`, `.tooltip.missingRadius`, `.tooltip.missingGps`, `.tooltip.unknown`

---

## 10–11. Manual host-copy check & five-path smoke

### HomeAwayBadge manual inspection

All user-facing strings route through `t()`:
- `detailTitle` — 7 tooltip keys
- `stateLabel` — state.home / state.away / `—`
- `ariaStatus` — statusUnknown or stateLabel
- `compactTitle` — composed from localized parts
- `aria-label` — `fleet.geofence.ariaLabel`

**ACTIVE ACTIONABLE HOST PRESENTATION DEBT IN HomeAwayBadge = 0**

### Five P266 paths

| Path | Known active technical host-copy exceptions |
|------|---------------------------------------------|
| OrganizationSwitcher.tsx | 0 |
| AIAssistantView.tsx | 0 |
| HomeAwayBadge.tsx | 0 |
| rental-requirements-ui.tsx | 0 |
| rental/App.tsx | 0 |

---

## 12–16. Scanner, Category E, freezes, collision

| Check | Result |
|-------|--------|
| P266 enforce-clean | 0 findings |
| Scanner suppression | None added in correction |
| Global / Rental / Finance | 1241 / 144 / 25 (unchanged from pre-correction) |
| Category E | 0 |
| Help Center diff | 0 (17 sections / 44 articles unchanged) |
| Data Analyse / IAM / DIMO / frozen surfaces | 0 diff in correction delta |
| Open PR collision (#1447+) | None on P266 production paths |

---

## 17–18. Validation

| Command | Result |
|---------|--------|
| P266 focused tests | PASS (7/7) |
| P265–P261 regressions | PASS (50/50 focused slice) |
| `npm run i18n:check` | PASS (535 tests, 9736 keys) |
| `npm run check:surface` | PASS |
| `npx tsc -p tsconfig.json --noEmit` | PASS |
| `npm run build` | PASS |
| `git diff --check` baseline→corrected HEAD | PASS |

**Unrelated CI note:** PR #1444 GitHub workflows "Legal Documents — Production Readiness CI / Typecheck" and "Vehicle Detail — Production Readiness CI" (typecheck, backend unit tests, Playwright E2E) fail on paths unrelated to P266 (`HomeAwayBadge` only in correction). Campaign validation suite passes independently.

---

## 19. Closeout invariant

**KNOWN ACTIVE ACTIONABLE TECHNICAL RENTAL I18N DEBT: 0**

The tooltip exception identified by audit #1446 is closed by correction commit `8be8f131a`.

---

## Final verdict

**A — FINAL SMOKE CERTIFIED — TECHNICAL RENTAL I18N CAMPAIGN COMPLETE — #1444 READY TO MERGE**

**The HomeAwayBadge correction is independently certified.**

**Known active actionable technical Rental i18n debt is zero.**

**The active-mount technical Rental i18n campaign is complete without known host-copy exceptions.**

**PR #1444 may now be marked ready and merged.**

**Help Center static article content remains a separate editorial localization workstream.**

**DO NOT MERGE THE AUDIT PR.**
