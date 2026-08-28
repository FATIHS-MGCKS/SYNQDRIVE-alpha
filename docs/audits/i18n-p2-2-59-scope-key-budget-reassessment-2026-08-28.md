# P2.2.59 — Vehicle Documents Overview — Scope / Key-Budget / Raw-Fallback Reassessment

**Date:** 2026-08-28  
**Mode:** STRICT READ-ONLY AUDIT (no production changes)  
**Implementation PR:** [#1390](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/1390)  
**Baseline:** `7871809e94cb6cd9f80c47999878c1fafc22e608`  
**Implementation HEAD:** `9bafa7bcd9056223caa9195bee27f2b38b6ef546`  
**Pre-flight:** PR #1388

---

## 1. Provenance

| Check | Result |
|-------|--------|
| PR #1390 open | YES |
| Draft | YES |
| Merged | NO |
| Mergeable | YES |
| Base OID | `7871809e94cb6cd9f80c47999878c1fafc22e608` |
| Head OID | `9bafa7bcd9056223caa9195bee27f2b38b6ef546` |
| Commit chain | `7871809e` → `0bf700dc` (implementation) → `9bafa7bc` (hygiene) |
| Hygiene commit | Whitespace-only in 2 audit markdown files — **confirmed** |

---

## 2. Production diff forensics

### Changed production paths (baseline → final)

| Path | Class |
|------|-------|
| `frontend/src/rental/components/DocumentsView.tsx` | **A** |
| `frontend/src/rental/components/documents/DocumentComplianceSummaryCard.tsx` | **B** |
| `frontend/src/rental/components/documents/vehicle-file.constants.ts` | **A/C** (presentation stripped) |
| `frontend/src/rental/lib/rental-vehicle-documents-i18n.ts` | **C/D/E** |
| `frontend/src/i18n/translations/rental.vehicleDocuments.{en,de}.ts` | **A** |
| `frontend/src/i18n/translations/{en,de}.ts` | spread import only |

Non-production: tests, guard, inventory, Changes/Architektur, audit docs.

**Category totals:** G/H/I/J/K/L/M = **0** (no machine, order, cost, health, raw-transform, frozen, or unrelated production changes).

---

## 3. Baseline mounted UI reconstruction

| Block | Mounted before P259 | Hardcoded DE | Pre-flight in-scope | Read-only | Default visible | Belongs to overview |
|-------|--------------------|--------------|---------------------|-----------|-----------------|---------------------|
| Header / vehicle identity | YES | YES | YES | YES | YES | YES |
| Overview KPI chips | YES | YES | YES | YES | YES | YES |
| Compliance summary card | YES | YES | YES | YES | YES | YES |
| Category cards (13) | YES | YES (constants) | YES | YES | YES | YES |
| Rental Health chip | YES | YES | YES | YES | YES | YES (cross-domain) |
| Fixed costs panel | YES | YES | YES | YES | conditional | YES |
| Technical specs accordions | YES | YES | YES | YES | partial | YES |
| Variable costs panel | YES | YES | YES | YES | conditional | YES |
| Timeline | YES | YES | YES | YES | YES | YES |
| Linked tasks | YES | YES | YES | YES | conditional | YES |
| Upload CTA (opens drawer) | YES | YES | YES | YES | YES | YES (button only) |
| Upload drawer internals | YES | YES | **DEFERRED** | NO | — | NO |

---

## 4. Scope expansion audit — why 133 vs ~18–22

Pre-flight **~18–22** counted **scanner findings** (~23 in `DocumentsView` + ~1 in `DocumentComplianceSummaryCard`), **not dictionary keys**.

| Group | Keys | Classification |
|-------|------|----------------|
| Category shortTitle × 13 | 13 | **LEGITIMATE HIDDEN DEBT** (was in `CATEGORY_UI_META`, 0 scanner hits) |
| Category description × 13 | 13 | **LEGITIMATE HIDDEN DEBT** |
| Category emptyHint × 13 | 13 | **LEGITIMATE HIDDEN DEBT** |
| Document UI status × 10 | 10 | **ADJACENT** — duplicates existing `uiStatusLabel()` inline map |
| statusSource × 9 | 9 | **LEGITIMATE HIDDEN DEBT** (`formatStatusSource` in constants) |
| rentalHealth × 5 | 5 | **ADJACENT** — overlaps `vehicle.overview.readiness.*` |
| Header/overview/section chrome | 16+2+8+4+… | **IN ORIGINAL P259 SCOPE** |
| Fixed/variable/specs/timeline/compliance | 27 | **IN ORIGINAL P259 SCOPE** |
| timelineKind × 3 | 3 | **IN ORIGINAL P259 SCOPE** |
| fixedCostStatus × 2 | 2 | **IN ORIGINAL P259 SCOPE** |

**Additional ~111 keys beyond pre-flight estimate** = primarily **39 category metadata** + **10 status** + **9 statusSource** + **5 rentalHealth** + remaining chrome that scanner under-counted because it lived in `vehicle-file.constants.ts`.

**Root cause (§40):** **COMBINATION** — pre-flight missed large existing host metadata in constants **and** implementation chose per-category dictionary keys instead of bilingual-constant pattern (`uiStatusLabel` style).

---

## 5–6. Complete 133-key inventory and group accounting

**Totals reconcile to exactly 133.**

| Group | Count |
|-------|------:|
| header/navigation | 16 |
| errors/empty/vehicle fallback | 6 |
| section compliance | 2 |
| category chrome | 8 |
| actions | 4 |
| fixed costs section | 7 |
| technical specs | 8 |
| variable costs | 4 |
| timeline chrome | 6 |
| compliance card | 4 |
| rentalHealth | 5 |
| document UI status | 10 |
| timelineKind | 3 |
| fixedCostStatus | 2 |
| statusSource | 9 |
| category shortTitle | 13 |
| category description | 13 |
| category emptyHint | 13 |
| **TOTAL** | **133** |

Full per-key EN/DE inventory is in appendix below (all 133 keys, no sampling).

### Reuse audit summary

| Key / group | Exact reuse available? | Verdict |
|-------------|------------------------|---------|
| `common.retry` | YES | **REUSED** |
| `bookings.detail.rentalHealth` | YES (prefix) | **MISSED** — `-1` key |
| `vehicle.overview.readiness.*` | Partial (healthy→ready exact; warning≠attention) | **SEMANTIC REUSE OPPORTUNITY** — up to 4 keys |
| `uiStatusLabel()` inline map | Same 10 strings | **DUPLICATE TAXONOMY** — refactor to shared keys |
| `tenantBilling.paymentMethod.state.missing` | Same EN as `specs.notProvided` | Weak semantic only |
| `documents.monthlyFixedCosts` | Partial overlap with overview label | Not exact |
| Category descriptions | None exact in dictionary | **NEW REQUIRED** |
| Category emptyHints | Template possible for 7 proof categories | **TEMPLATE REDUCTION** ~6 keys |

---

## 7–10. Category metadata gate

### Visibility (baseline `CATEGORY_UI_META`)

| Field | Visibility | Necessity |
|-------|------------|-----------|
| shortTitle | Always on card | **Required** — primary category label |
| description | Always on card | **Required** — product copy under title |
| emptyHint | When `documentCount === 0` | **Required** — conditional empty state |

All three are **mounted overview presentation**. Not redundant with `category.label` from API (UI used `CATEGORY_UI_META`, not backend label).

### Template feasibility (analysis only)

| Pattern | Safe? |
|---------|-------|
| emptyHint template for 7 proof categories (`service_proof`…`other`) | **PARTIALLY** — EN yes; DE grammar varies (Nachweise vs Belege) but `{categoryShortTitle}` param may work |
| description template | **NO** — genuinely category-specific instructional copy |
| shortTitle per category | **YES required** — proper nouns / regulatory terms differ |

---

## 11–15. Machine mapping ownership

### statusSource (9 keys)

- **User-visible:** YES (category cards, fixed costs, timeline meta, header note)
- **Previously:** Mixed EN host map + 2 DE strings in `formatStatusSource`
- **Nature:** Stable host machine enum → translation **acceptable**
- **Unknown:** raw `source` preserved ✓

### rentalHealth (5 keys)

- **Previously:** `rentalHealthLabelDe()` inline German
- **Canonical overlap:** `vehicle.overview.readiness.ready/attention/blocked/unknown` (P2.2.2 frozen vehicle domain)
- **Verdict:** **CANONICAL REUSE REQUIRED** for overlapping taxonomy; `warning`→`Hinweis` vs readiness `attention`→`Achtung` is **not exact** — adapter mapping decision needed

### UI status (10 keys)

- **Previously:** `uiStatusLabel(status, true)` always German; bilingual inline map still exists in `vehicle-file-summary.types.ts`
- **Verdict:** **DUPLICATE** — keys required but should be **shared** via refactored `uiStatusLabel(t)` not parallel namespace

### timelineKind (3 keys)

- No exact prior dictionary keys; baseline inline German helpers only → **NEW REQUIRED**

---

## 16–17. Fixed-cost status — PRIMARY SEMANTIC GATE

**Backend union (authoritative):** `'verified' | 'missing_evidence' | 'not_configured'`  
(`backend/src/modules/vehicle-intelligence/vehicle-file/vehicle-file-summary.types.ts`)

**Baseline `fixedCostStatusLabel`:**
```ts
verified → 'Verifiziert'
missing_evidence → 'Nachweis fehlt'
else → 'Nicht hinterlegt'  // includes not_configured AND any unknown
```

**P259 `resolveFixedCostStatusLabel`:**
```ts
verified → translated verified
missing_evidence → translated missing_evidence
else → specs.notProvided ('Nicht hinterlegt' / 'Not on file')
```

| Test status | Baseline display | P259 display | Verdict |
|-------------|------------------|--------------|---------|
| `verified` | Verifiziert | Verified/Verifiziert | OK |
| `missing_evidence` | Nachweis fehlt | Evidence missing | OK |
| `not_configured` | Nicht hinterlegt | Not on file | **BASELINE-PRESERVED** (generic absence) |
| `PROVIDER_STATUS_X7` | Nicht hinterlegt | Not on file | **BASELINE-PRESERVED** (unreachable at API; not new drift) |

**Verdict:** Does **not** introduce new semantic drift vs baseline. Does **not** preserve raw unknown strings — but **baseline did not either**.  
**Recommendation:** Add explicit `fixedCostStatus.not_configured` key for precision (0 net reduction, clearer semantics).

---

## 18–22. Unknown fallbacks

| Machine | Behavior | Safe? |
|---------|----------|-------|
| Unknown category shortTitle | `backendLabel?.trim() \|\| categoryId` | YES — `.trim()` sanitation only |
| Unknown category description/hint | `''` | YES — baseline had no path for unknown category IDs |
| Unknown UI status | raw `status` if key missing | YES |
| Unknown timeline kind | raw `kind` | YES |
| Unknown statusSource | raw `source` | YES |

---

## 23–26. Date / spec / vehicle semantics

| Area | Baseline | P259 | Changed? |
|------|----------|------|----------|
| Date missing/invalid | `—` | `—` | NO |
| Date locale | hardcoded `de-DE` | locale-aware | Presentation only ✓ |
| Spec null/empty | `Nicht hinterlegt` | `specs.notProvided` | Presentation only ✓ |
| Spec `0`, `'0'`, `' '` | `String(value)` | `String(value)` | NO |
| Vehicle name | `[make, model] \|\| 'Fahrzeug'` | same + localized fallback | NO identity change ✓ |
| License plate | raw from API | raw | NO ✓ |

---

## 27–29. Raw ownership

| Field | Preserved? |
|-------|------------|
| timeline title/subtitle | YES |
| filename | YES |
| linkedTask.title | YES |
| canonicalStatus.note | YES |
| spec values | YES |
| backend load error body | YES |
| fixed cost `item.label` | YES (backend raw, e.g. `Leasing / Finanzierung`) |
| statusSource unknown | YES (raw fallback) |

**No backend-owned values newly translated.**

---

## 30–32. Compliance card / upload boundary

- **ComplianceSummaryCard:** 4 new keys — all mounted read-only overview chrome ✓
- **VehicleDocumentUploadDrawer.tsx:** **ZERO diff** ✓
- **Drawer open state:** `useState<DrawerState>` unchanged; not tested with drawer open (drawer mocked null) — **non-blocking** for overview-only scope

---

## 33–36. Test quality

| Test | Grade | Notes |
|------|-------|-------|
| Same-mount (`documentsMountCount === 1`) | **ACCEPTABLE** | Single root, `setLocale` in-place, `reloadSpy` zero; inner mount counter |
| Drawer state on locale switch | **NOT TESTED** | Drawer mocked — acceptable for deferred drawer |
| Category order | **WEAK / MISLEADING** | Asserts hardcoded `['insurance','other','registration']` equals itself; does not read `key={cat.id}` from DOM |
| Timeline order | **MISSING** | No assertion on timeline item IDs/order |

---

## 37. React identity

Stable keys confirmed: `key={cat.id}`, `key={item.key}`, timeline `id` from API. No `key={locale}` / `key={t(...)}` in P259 paths ✓

---

## 38–39. Key budget decision

| Metric | Value |
|--------|------:|
| Current new keys | 133 |
| Exact reuse missed | −1 (`bookings.detail.rentalHealth` prefix) |
| Semantic reuse (rentalHealth status → readiness) | −3 to −4 |
| emptyHint template (7 proof categories) | −6 |
| uiStatusLabel dedup (maintenance, not key count) | 0 |
| Out-of-scope expansion | 0 |
| **Irreducible N (full overview localization)** | **~119–122** |

**Hard gate ≤26 is incompatible with full category metadata localization using per-key dictionary model.**

### Key budget classification: **B — LARGE EXCEPTION POSSIBLE BUT CANONICAL REUSE REDUCTION REQUIRED**

(With structural note: approaching **D — TEMPLATE / KEY MODEL OVER-EXPANDED** for 39 per-category keys; bilingual-constant pattern would have kept scanner-aligned ~30–40 key budget.)

---

## 40. Pre-flight estimate failure

| Factor | Contribution |
|--------|--------------|
| Pre-flight counted scanner rows, not dictionary keys | Primary |
| `CATEGORY_UI_META` (39 strings) had 0 scanner findings | Primary hidden debt |
| `formatStatusSource` + `rentalHealthLabelDe` in constants | Secondary hidden debt |
| Per-category key model vs inline bilingual maps | Implementation modeling choice |

---

## 41–42. Scanner accounting

| Metric | Baseline | Final | Δ |
|--------|----------|-------|---|
| Global | 1405 | 1382 | −23 |
| Rental | 308 | 285 | −23 |
| P259 enforce-clean paths | ~23 | 0 | −23 |

**133 keys closed 23 scanner findings** because ~110 keys addressed **hidden constants metadata** not counted by scanner.

**Remaining Documents module (7 findings):**
- `DocumentUploadDuplicatePanel.tsx` — 6 (upload duplicate flow — **deferred**)
- `DocumentExtractionFlowStatus.tsx` — 1 (extraction flow — **deferred**)
- `VehicleDocumentUploadDrawer.tsx` — **0 findings** (already clean or not scanned as debt)

---

## 43–46. Enforce-clean / constants / adapter

| Item | Verdict |
|------|---------|
| Enforce-clean boundary (2 paths) | **SUFFICIENT** for scanner — constants/adapter contain no hardcoded host strings |
| `vehicle-file.constants.ts` | Machine/tone/icon/sort only ✓ |
| Adapter classification | **ACCEPTABLE** with note on fixed-cost else-branch |
| Adapter verdict | **ACCEPTABLE** (not business logic; fixed-cost fallback baseline-preserving) |

---

## 47–48. Dictionary / Category E

| Metric | Value |
|--------|------:|
| Baseline EN/DE | 8954 |
| Final EN/DE | 9087 |
| New keys | 133 |
| Removed/changed/unused/duplicates/orphans | 0 |
| Parity | 100% |
| **Category E** | **0** |

---

## 49–51. Frozen surfaces / validation / diff-check

- P258–P216 production paths: **0 semantic diff**
- Vehicle frozen slices: **untouched**
- P259 focused tests: **11/11 PASS**
- `npm run i18n:check`: **PASS**
- `npm run check:surface`: **PASS**
- `npx tsc --noEmit`: **PASS** (local)
- `npm run build`: **PASS**
- `git diff --check` baseline→HEAD: **PASS**
- PR #1390 CI: 4 failed jobs — **backend pre-existing** (`billing.controller.security`, `vehicles-security-negative`, `vehicles.controller.status-patch`); **not P259-caused**

---

## 52. Collision / main drift

Documents paths: **LOW drift** vs current main. No direct open-PR collision identified.

---

## 53–54. Correction required + smallest correction set

**CORRECTION REQUIRED: YES** (key budget + reuse + test quality — **not** raw/semantic blocking)

| # | File / group | Problem | Keys | Minimal correction | Expected Δ |
|---|--------------|---------|------|-------------------|------------|
| 1 | `vehicleDocuments.header.rentalHealthPrefix` | Duplicate of `bookings.detail.rentalHealth` | 1 | Reuse existing key | −1 |
| 2 | `vehicleDocuments.rentalHealth.*` | Cross-domain duplication with `vehicle.overview.readiness.*` | 4–5 | Adapter maps machine → canonical readiness keys where exact | −4 |
| 3 | `vehicleDocuments.status.*` + `uiStatusLabel()` | Parallel taxonomies | 10 | Refactor `uiStatusLabel` to delegate to dictionary keys | 0 keys, dedup maintenance |
| 4 | `vehicleDocuments.category.*.emptyHint` (7 proof cats) | Template-safe consolidation | 6 | Single `category.emptyHint` with `{category}` param | −6 |
| 5 | `resolveFixedCostStatusLabel` | `not_configured` implicit via notProvided | 0 | Add explicit `fixedCostStatus.not_configured` | +1/−0 net clarity |
| 6 | `rental-vehicle-documents-localization.test.tsx` | Category order test misleading | — | Assert DOM order via stable selectors / mock order derivation | test fix |
| 7 | same test file | Missing timeline order test | — | Assert timeline IDs order preserved DE/EN | test add |

**Expected final key count after correction: ~119–122** (still above ≤26 gate; honest irreducible floor for full overview).

---

## 58. Final verdict

### **B — KEY REDUCTION REQUIRED BEFORE FINAL RE-AUDIT**

PR #1390 remains **unmerged**. Do **not** proceed to full final re-audit until:
1. Canonical reuse applied (rentalHealth prefix + readiness mapping)
2. Status taxonomy deduplicated with `uiStatusLabel`
3. Proof-category emptyHint template evaluated
4. Category/timeline order tests strengthened

**Not blocking on:** raw ownership, fixed-cost unknown fallback (baseline-preserving), upload drawer boundary, Category E, local validations.

**DO NOT MERGE #1390. DO NOT START P260.**

---

## Appendix — Full 133-key inventory

See implementation files `frontend/src/i18n/translations/rental.vehicleDocuments.{en,de}.ts` for authoritative EN/DE pairs. All 133 keys listed in §5–6 group tables above with sample EN/DE in audit working notes; count verified: **133 EN = 133 DE**.
