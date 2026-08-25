# P2.2.39 — Post-P238 Next-Slice Pre-Flight (Clean Topology)

**Date:** 2026-08-25  
**Mode:** STRICT READ-ONLY TARGET SELECTION — AUDIT TOPOLOGY CORRECTION  
**Repository:** FATIHS-MGCKS/SYNQDRIVE-alpha  
**Authoritative P238 merge baseline:** `0e01cd12cd888f4df20aad0c398c99823cc3286b` (merged PR #1266)  
**Supersedes (invalid topology):** PR [#1270](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/1270)  
**Clean auditor branch:** `cursor/p2239-post-p238-next-slice-preflight-clean-3c10`  
**Clean PR base branch:** `p239-p238-merge-baseline-3c10` @ `0e01cd12`

---

## 1. Baseline verification

| Check | Independent result |
|-------|-------------------|
| Baseline SHA | ✅ `0e01cd12cd888f4df20aad0c398c99823cc3286b` |
| Contains merged PR #1266 | ✅ commit message confirms |
| `npm run i18n:check` | ✅ **PASS** |
| EN / DE | **8578 / 8578** |
| Parity | **100%** |
| Orphans | **0** |
| P238–P216 frozen debt | **0** |
| Global enforce-clean (frozen surfaces) | **0** |
| i18n suite | **364 tests** |

**Baseline regression:** ❌ **NONE**

---

## 2. Why PR #1270 topology is rejected

| Requirement | PR #1270 actual | Status |
|-------------|-----------------|--------|
| PR base = P238 baseline | Base = `main` @ `13c7b150` | ❌ **INVALID** |
| Exactly 1 audit commit above baseline | **~52 commits** in PR | ❌ **INVALID** |
| Mergeable draft audit PR | `mergeable: CONFLICTING` | ❌ **INVALID** |
| 0 production/dictionary/test/scanner changes | Audit-only intent correct; topology wrong | ⚠️ |

**Root cause:** PR #1270 used `main` as base while the audit branch was cut from the **parallel i18n Operator campaign baseline** (`0e01cd12`). `main` and the campaign lineage are not equivalent refs for this audit — GitHub therefore surfaced the entire i18n campaign commit chain (~52 commits) instead of a single audit commit.

**Disposition:** PR #1270 remains **open, unmerged, superseded**. History is preserved. **Do not use #1270 ancestry for implementation.**

**Correct topology:**

```
p239-p238-merge-baseline-3c10  →  0e01cd12  (PR base)
cursor/p2239-post-p238-next-slice-preflight-clean-3c10  →  0e01cd12 + 1 audit commit  (PR head)
```

---

## 3. Target revalidation — Operator More View

Independent re-check at baseline `0e01cd12` (content conclusions from #1270 artifact validated; topology discarded).

| Field | Value |
|-------|-------|
| **Exact path** | `frontend/src/operator/views/OperatorMoreView.tsx` |
| **Component** | `OperatorMoreView` |
| **Route/mount** | `/operator` → bottom-nav tab `more` → `OperatorShell` case `'more'` |
| **Audience** | Operator (mobile/tablet) |
| **Visible debt** | **9** scanner findings |
| **Hidden debt** | 1 (`themePreferenceLabel` in `lib/theme.ts` — hardcoded DE) |
| **Fixed-locale debt** | `themePreferenceLabel(preference)` — address in P239 adapter via `ThemePreference` → TranslationKey |
| **Machine/domain inputs** | `OperatorSheetAction.type`, `ThemePreference`, `OperatorTab`, vehicle `id` |
| **Dynamic data** | `${v.model} · ${v.license}` vehicle labels — **must stay raw** |
| **Callbacks** | `openSheet`, `setActiveTab`, `setScanQuery`, `setPickerOpen`, `cycleThemePreference` — **unchanged** |
| **Routes/sheets** | Opens `booking-create`, `ai-upload`, `tire-measure` sheets — frozen flows, args frozen |
| **Permissions** | Operator shell access guard — unchanged |
| **Estimated keys** | **16–20** (after reuse of `operator.bookings.form.createTitle`, partial `aiUpload.*`) |
| **Business coupling** | **LOW** — presentation-only hub; no health/connectivity/operational-state derivation |
| **Active collision** | **NONE** |
| **Main drift** | **LOW** — cosmetic card-radius class tweaks on `OperatorMoreView.tsx` vs `main` (no semantic change) |

**Target decision:** **CONFIRMED — P2.2.39 — Operator More View Localization**

---

## 4. Active collision recheck

| PR | State | vs Operator More View |
|----|-------|----------------------|
| **#1263** | MERGED | Backend/DIMO/vehicle operational — **no path overlap** |
| **#1267** | MERGED | Connectivity webhook inbox — **no path overlap** |
| **#1271** | MERGED | P0.2 VehicleOperationalProjection backend — **no path overlap** |
| **#1270** | OPEN (superseded) | Audit-only — **NONE** |
| Operator connectivity banner (#915) | OPEN | Different surface — **LOW** |
| Operator Today work queue (#906) | OPEN | Different surface — **LOW** |

| Check | Result |
|-------|--------|
| Ancestry overlap | **NONE** |
| Changed-path overlap | **NONE** |
| Semantic overlap | **NONE** |
| **Classification** | **NONE** |

---

## 5. Selected target

# **P2.2.39 — Operator More View Localization**

**Split decision:** **ONE SLICE**

**Campaign:** OPERATOR (continue)

---

## 6. Exact production boundary

| Item | Value |
|------|-------|
| **Production paths** | `frontend/src/operator/views/OperatorMoreView.tsx`, `frontend/src/operator/lib/operator-more-i18n.ts` (new) |
| **In scope** | Section headings, action card titles/subtitles, vehicle-picker chrome, nav CTA, theme labels, web-app link, info footer |
| **Out of scope** | `OperatorActionSheets`, frozen P236/P226/P224 flows, `lib/theme.ts` logic, bottom nav, shell header, connectivity banner |

---

## 7. Machine / dynamic-data freeze

| Value | Localize label? | Must remain unchanged? |
|-------|----------------|------------------------|
| Sheet types (`booking-create`, `ai-upload`, `tire-measure`) | NO | ✅ |
| `vehicleId` | NO | ✅ |
| `vehicleLabel` (composed) | NO — raw display | ✅ |
| `ThemePreference` (`system`/`light`/`dark`) | label only | machine ✅ |
| `OperatorTab` (`vehicles`, `scan`) | NO | ✅ |
| `/rental` link target | NO | ✅ |
| Action card static order | NO | ✅ |

---

## 8. Key strategy

| Concept | Strategy |
|---------|----------|
| Create booking title | **SEMANTIC REUSE** — `operator.bookings.form.createTitle` |
| Create booking subtitle | **NEW** — `operator.more.action.createBooking.subtitle` |
| AI Upload | **SEMANTIC REUSE** — `operator.bookings.documents.aiUpload.*` where wording matches |
| Tire measure | **NEW** — `operator.more.action.tireMeasure.*` |
| Sections / nav / theme / footer | **NEW** — `operator.more.*` |
| Vehicle list labels | **DYNAMIC — DO NOT TRANSLATE** |

**Estimated new keys:** 16–20

**Adapter:** `operator-more-i18n.ts` (NEW BOUNDED PRESENTATION ADAPTER)

**Extraction:** NO STRUCTURAL CHANGE REQUIRED

---

## 9. P239 enforce-clean proposal

```
P239_ENFORCE_CLEAN_EXACT:
  - operator/views/OperatorMoreView.tsx
  - operator/lib/operator-more-i18n.ts
```

Excludes P216–P238, Quick View blockers, connectivity/vehicle-state surfaces, frozen sheets.

---

## 10. Test contract (future implementation)

- P239 enforce-clean = 0
- EN/DE section + action labels
- Same-mount locale switch preserves vehicle labels
- `openSheet` args unchanged on CTA click
- Theme preference maps machine enum
- No raw TranslationKey or vehicle-label translation

---

## 11. Baseline strategy

**DIRECT FROM P238 MERGE BASELINE** (`0e01cd12`)

Implementation branch from `p239-p238-merge-baseline-3c10` or exact SHA `0e01cd12`. Do **not** branch from PR #1270 or from `main` without explicit reconciliation plan.

---

## 12. PR topology verification (this audit)

| Check | Required | This PR |
|-------|----------|---------|
| merge-base | `0e01cd12` | ✅ |
| commits above baseline | 1 | ✅ |
| changed files | 1 (audit doc only) | ✅ |
| production changes | 0 | ✅ |
| dictionary / test / scanner changes | 0 | ✅ |
| Draft | true | ✅ (on create) |

---

## 13. Final verdict

### **A — CLEAN P2.2.39 PRE-FLIGHT RECREATED — TARGET CONFIRMED**

**P2.2.39 — Operator More View Localization**

**IMPLEMENTATION NOT STARTED.**

PR #1270 is **superseded** by this clean audit PR. Do not merge #1270.

---

*Audit topology correction completed 2026-08-25. No production, dictionary, test, scanner, or architecture changes.*
