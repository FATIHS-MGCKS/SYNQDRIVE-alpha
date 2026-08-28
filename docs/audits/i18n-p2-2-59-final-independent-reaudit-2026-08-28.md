# P2.2.59 — Vehicle Documents Overview — Final Independent Re-Audit

**Date:** 2026-08-28  
**Mode:** STRICT READ-ONLY MERGE CERTIFICATION  
**Implementation PR:** [#1390](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/1390)  
**Pre-flight:** PR #1388  
**Scope reassessment:** PR #1392 (verdict B — corrections applied in #1390)  
**Baseline:** `7871809e94cb6cd9f80c47999878c1fafc22e608`  
**Final HEAD:** `11653bbe6bc6bcde610561a67fe1b28a6fc95e6c`

---

## 1. PR Topology

| Check | Result |
|-------|--------|
| PR #1390 open | YES |
| Draft | YES |
| Merged | NO |
| Mergeable | YES |
| Base OID | `7871809e94cb6cd9f80c47999878c1fafc22e608` |
| Head OID | `11653bbe6bc6bcde610561a67fe1b28a6fc95e6c` |
| Commit count | **3** |
| Chain | `7871809e` → `0bf700dc` → `9bafa7bc` → `11653bbe6` |
| #1388 ancestry | NO |
| #1392 ancestry | NO |
| Main-only ancestry | NO |

### Commits

1. `0bf700dc` — feat(i18n): P2.2.59 vehicle documents read-only overview localization  
2. `9bafa7bc` — chore(docs): trim trailing whitespace in P259 audit artifacts (**Markdown whitespace-only**)  
3. `11653bbe6` — fix(i18n): dedupe vehicle document presentation taxonomy  

---

## 2. Correction Delta (`9bafa7bc` → `11653bbe6`)

| Path | Classification |
|------|----------------|
| `rental.vehicleDocuments.{en,de}.ts` | dictionary reduction + canonical reuse |
| `rental-vehicle-documents-i18n.ts` | presentation adapter |
| `vehicle-file-summary.types.ts` | taxonomy dedup (`uiStatusLabel`) |
| `DocumentsView.tsx` | canonical reuse |
| `timeline.tsx` | stable test instrumentation (`data-timeline-id`) |
| `rental-vehicle-documents-localization.test.tsx` | test hardening |
| `hardcoded-copy-inventory.json` | scanner refresh (no weakening) |
| `ChangesView.tsx`, `ArchitekturView.tsx` | docs |
| implementation/architecture markdown | docs |

**Semantic changes:** business / raw / order / upload / frozen = **0**

---

## 3. Production Scope (baseline → final)

| Path | Role |
|------|------|
| `DocumentsView.tsx` | Primary overview host |
| `DocumentComplianceSummaryCard.tsx` | Compliance summary |
| `vehicle-file.constants.ts` | Machine/icon/tone/sort only |
| `rental-vehicle-documents-i18n.ts` | Presentation adapter |
| `vehicle-file-summary.types.ts` | `uiStatusLabel` taxonomy dedup |
| `rental.vehicleDocuments.{en,de}.ts` | Dictionary slice |
| `timeline.tsx` | Non-semantic `data-timeline-id` attribute |

**Deferred (zero diff):** `VehicleDocumentUploadDrawer.tsx`, upload hooks, mutation APIs.

---

## KEY-BUDGET EXCEPTION CERTIFICATION

| Metric | Value |
|--------|------:|
| Baseline EN/DE | 8954 |
| Final EN/DE | **9082** |
| P259 new keys | **128** |
| Original implementation | 133 |
| Net correction | −5 |

### 133 → 128 accounting

**Removed (−7):**
1. `vehicleDocuments.header.rentalHealthPrefix`
2. `vehicleDocuments.rentalHealth.healthy`
3. `vehicleDocuments.rentalHealth.unknown`
4. `vehicleDocuments.category.service_proof.emptyHint`
5. `vehicleDocuments.category.tire_proof.emptyHint`
6. `vehicleDocuments.category.brake_proof.emptyHint`
7. `vehicleDocuments.category.battery_proof.emptyHint`

**Added (+2):**
1. `vehicleDocuments.category.emptyHintProof`
2. `vehicleDocuments.fixedCostStatus.not_configured`

**Reused canonical (not new keys):**
- `bookings.detail.rentalHealth`
- `vehicle.overview.readiness.ready`
- `vehicle.overview.readiness.unknown`
- `common.retry`

### Final 128-key groups

| Group | Count |
|-------|------:|
| header/navigation | 17 |
| errors/empty/vehicle fallback | 6 |
| compliance | 4 |
| category chrome | 8 |
| actions | 4 |
| fixed costs section | 7 |
| technical specs | 8 |
| variable costs | 4 |
| timeline chrome | 6 |
| rentalHealth (dedicated) | 3 |
| document UI status | 10 |
| timelineKind | 3 |
| fixedCostStatus | 3 |
| statusSource | 9 |
| category shortTitle | 13 |
| category description | 13 |
| category-specific emptyHint | 9 |
| proof emptyHint template | 1 |
| **TOTAL** | **128** |

**Verdict:** **128-KEY EXCEPTION JUSTIFIED** — all remaining keys are mounted overview presentation; pre-flight ≤26 gate superseded by hidden `CATEGORY_UI_META` debt discovery (#1392).

---

## MULTI-LOCALE `uiStatusLabel` ARCHITECTURE AUDIT

### Implementation

`uiStatusLabel(status, deLocale)` in `vehicle-file-summary.types.ts` resolves from static `en`/`de` dictionaries via `vehicleDocuments.status.*` keys.

### Callers

| Path | Mounted | Locale source | Risk |
|------|---------|---------------|------|
| `rental-vehicle-documents-localization.test.tsx` | test only | boolean | none |
| **Production paths** | use `resolveVehicleDocumentUiStatusLabel(status, t)` | full `useLanguage().locale` | none |

`uiStatusLabel` has **no production callers** after P259. Mounted UI uses canonical `t()` path with full locale support.

### Verdict: **B — NON-BLOCKING DEBT — CURRENT P259 CALLERS USE CANONICAL t PATH**

Legacy boolean EN/DE wrapper preserved for API compatibility; no PL/FR/CS/NL/ES/TR/IT mounted regression.

---

## Rental Health Mapping

| Machine | Mapping | Verdict |
|---------|---------|---------|
| `healthy` | `vehicle.overview.readiness.ready` | EXACT REUSE |
| `unknown` | `vehicle.overview.readiness.unknown` | EXACT REUSE |
| `warning` | `vehicleDocuments.rentalHealth.warning` | DEDICATED KEY JUSTIFIED (`Notice`/`Hinweis` ≠ `Attention`/`Achtung`) |
| `critical` | `vehicleDocuments.rentalHealth.critical` | DEDICATED KEY JUSTIFIED (no readiness equivalent) |
| `blocked` | `vehicleDocuments.rentalHealth.blocked` | DEDICATED KEY JUSTIFIED (DE `Gesperrt` ≠ readiness `Blockiert`) |

**Prefix:** `bookings.detail.rentalHealth` + `:` — EN/DE both `Rental Health` — exact fit.

---

## UI Status Single Authority

- **Canonical keys:** `vehicleDocuments.status.*` (10 keys)
- **`resolveVehicleDocumentUiStatusLabel`:** production display path via `t()`
- **`uiStatusLabel`:** delegates to same keys (no parallel inline bilingual map)
- **`uiStatusTone`:** unchanged; tone independent of label translation

---

## Proof Empty-Hint Template

Applies to: `service_proof`, `tire_proof`, `brake_proof`, `battery_proof`

| Category | EN rendered | DE rendered | Match baseline |
|----------|-------------|-------------|----------------|
| service_proof | No Service evidence on file yet. | Noch keine Service-Nachweise hinterlegt. | YES |
| tire_proof | No Tire evidence on file yet. | Noch keine Reifen-Nachweise hinterlegt. | YES |
| brake_proof | No Brake evidence on file yet. | Noch keine Bremsen-Nachweise hinterlegt. | YES |
| battery_proof | No Battery evidence on file yet. | Noch keine Batterie-Nachweise hinterlegt. | YES |

**Non-templated (9):** registration, insurance, tax, leasing_financing, tuv_hu, bokraft, repair_proof, damage_accident, other — category-specific copy retained.

---

## Fixed-Cost Status

| Status | Label | Verdict |
|--------|-------|---------|
| `verified` | translated verified | OK |
| `missing_evidence` | translated missing_evidence | OK |
| `not_configured` | explicit `not_configured` | OK |
| `PROVIDER_STATUS_X7` | `specs.notProvided` | baseline-preserving (no new drift) |

---

## CATEGORY / TIMELINE ORDER TEST AUDIT

| Test | Instrumentation | Grade |
|------|-----------------|-------|
| Category order | `data-category-id` on `<article>`; DOM `querySelectorAll`; DE→EN→DE | **STRONG** |
| Timeline order | `data-timeline-id` on `<li>`; DOM `querySelectorAll`; DE→EN→DE | **STRONG** |
| Same-mount | `documentsMountCount === 1`, `reloadSpy === 0` | **PASS** |

**Order expectation source:** uses `sortDocumentCategories(mockSummary.documentCategories)` — **STRONG ENOUGH FOR LOCALE REGRESSION** (verifies locale switch does not reorder; does not re-certify sort algorithm, which is frozen separately).

**Drawer open-state:** not tested (drawer mocked) — **NON-BLOCKING NOT COVERED** (drawer state code unchanged).

---

## RAW OWNERSHIP CERTIFICATION

| Fixture | Preserved |
|---------|-----------|
| Timeline title `Provider Document Timeline X7` | YES |
| Subtitle `Provider Document Subtitle X7` | YES |
| Filename `Fahrzeugschein_X7.pdf` | YES |
| Task title `Provider Task Title X7` | YES |
| Load error `Backend Vehicle Documents Error X7` | YES |
| Spec value `Provider Spec X7` | YES |
| Fixed-cost `item.label` (backend raw) | YES |
| `canonicalStatus.note` | YES |
| Unknown category → `backendLabel.trim() \|\| categoryId` | YES |
| Unknown status/kind/source → raw fallback | YES |

---

## UPLOAD DRAWER DEFERRED BOUNDARY

| Path | Diff |
|------|------|
| `VehicleDocumentUploadDrawer.tsx` | **0 lines** |
| Upload hooks / mutation APIs | untouched |

**Remaining Documents debt (7):** all in deferred paths:
- `DocumentUploadDuplicatePanel.tsx` (6)
- `DocumentExtractionFlowStatus.tsx` (1)

---

## Scanner / Enforce-Clean

| Metric | Value |
|--------|------:|
| Global | 1382 |
| Rental | 285 |
| P259 enforce-clean | 0 |
| Scanner weakening | NO |

---

## Category E

All semantic categories = **0**.

---

## Frozen Surfaces

P258–P216, Vehicle Overview/Trips/Health/Tasks — **0 semantic diff** on P259 paths.

---

## Validation (independent, final HEAD)

| Check | Result |
|-------|--------|
| P259 focused tests (14) | PASS |
| Vehicle file hardening (7) | PASS |
| `i18n:check` | PASS |
| `check:surface` | PASS |
| `tsc --noEmit` (frontend) | PASS |
| `npm run build` | PASS |
| `git diff --check` baseline→HEAD | PASS |
| `git diff --check` correction | PASS |
| EN keys | 9082 |
| DE keys | 9082 |
| Parity | 100% |
| Orphans / unused / duplicates | 0 |

---

## CI Triage

| Failure | Classification |
|---------|----------------|
| Backend typecheck (`billing.controller.security`, `vehicles-security-negative`, `vehicles.controller.status-patch`) | **pre-existing** — backend test constructor arity, unrelated to P259 |
| Frontend component tests | **PASS** |
| Production build (CI) | **PASS** |

**P259-caused required failures: 0**

---

## Collision / Main Drift

- No main rebase absorbed; campaign-line isolated from `7871809e`
- **No HIGH/DIRECT collision** on exact P259 production paths among open PRs
- Only #1390 touches `rental.vehicleDocuments.*` / `DocumentsView` on active branch set

---

## Progress Recomputation (post-P259)

| Metric | Value |
|--------|-------|
| P259 mounted overview | localized |
| P259 enforce-clean paths | 0 debt |
| Rental scanner | 285 (−23 from P259 slice) |
| Documents overview read-only | **complete** |
| Documents write/deferred debt | 7 findings (upload-adjacent) |

---

## P260 Candidates (ranked, not implemented)

1. **P2.2.60 — Vehicle Documents Upload/Extraction flow** (`VehicleDocumentUploadDrawer`, `DocumentUploadDuplicatePanel`, `DocumentExtractionFlowStatus`) — natural continuation, 7 remaining Documents findings
2. **Data Analyse diagnostics** — separate rental campaign surface (if census ranks higher on main)
3. **Remaining Rental presentation debt** — next highest scanner-density mounted slice per #1388 census

**Selected likely P260:** **P2.2.60 — Vehicle Documents Upload/Extraction flow**

---

## Claim Reconciliation

| Claim | #1390 | Independent | PASS |
|-------|-------|-------------|------|
| 3 commits | YES | YES | PASS |
| Direct ancestry from baseline | YES | YES | PASS |
| 128 keys | YES | YES (128) | PASS |
| 9082/9082 | YES | YES | PASS |
| Scanner 1382/285 | YES | YES | PASS |
| P259 enforce-clean 0 | YES | YES | PASS |
| Canonical reuse | YES | verified | PASS |
| UI status dedup | YES | verified | PASS |
| Proof template | YES | 4 categories | PASS |
| Fixed-cost explicit | YES | verified | PASS |
| Raw ownership | YES | verified | PASS |
| Category order test | YES | STRONG | PASS |
| Timeline order test | YES | STRONG | PASS |
| Same-mount | YES | PASS | PASS |
| Upload Drawer zero diff | YES | 0 lines | PASS |
| Category E 0 | YES | YES | PASS |
| Frozen surfaces | YES | YES | PASS |
| Checks/build/diff-check | YES | PASS (local) | PASS |

---

## Final Verdict

### **A — READY FOR P2.2.59 FREEZE / MERGE**

PR #1390 may now be marked ready and merged.

P2.2.59 is ready for freeze.

VEHICLE DOCUMENTS OVERVIEW / LIST IS LOCALIZED.

VEHICLE DOCUMENTS UPLOAD / EXTRACTION FLOWS REMAIN DEFERRED.

DO NOT MERGE #1388 OR #1392.

NEXT CANDIDATE: **P2.2.60 — Vehicle Documents Upload/Extraction flow**
