# P2.2.35 — Final Independent Re-Audit
## Operator Vehicle Quick View Documents Localization

**Date:** 2026-08-24  
**Mode:** Strict read-only independent verification  
**Implementation PR:** #1251  
**Authoritative baseline:** `4116bcdbc6580ac6fb431252c9dc7e711a0fc4d0`  
**Implementation HEAD audited:** `bb5adc5c6b4cd3e791d9741100f2101d31fb897b`  
**Pre-flight:** PR #1249 (C — GO — final clean QV presentation slice)

---

## 1. Verdict

**A — READY FOR P2.2.35 FREEZE / MERGE — QUICK VIEW PRESENTATION CAMPAIGN COMPLETE**

PR #1251 may be marked ready and merged.

Operator Vehicle Quick View presentation i18n is complete through P2.2.35. Remaining Blockers/contradiction localization is architecturally deferred and is not part of the completed presentation campaign.

**Campaign state:** QV PRESENTATION COMPLETE — BLOCKERS ARCHITECTURALLY DEFERRED

---

## 2. Implementation PR State

| Field | Expected | Actual | Match |
|-------|----------|--------|-------|
| PR exists | #1251 | #1251 | YES |
| State | OPEN | OPEN | YES |
| Draft | true | true | YES |
| Merged | false | null | YES |
| Mergeable | true | MERGEABLE | YES |
| Base SHA | `4116bcdb` | `4116bcdbc6580ac6fb431252c9dc7e711a0fc4d0` | YES |
| HEAD SHA | `bb5adc5c` | `bb5adc5c6b4cd3e791d9741100f2101d31fb897b` | YES |
| local HEAD == remote HEAD | YES | YES | YES |

---

## 3. Provenance

```
git merge-base bb5adc5c 4116bcdb → 4116bcdbc6580ac6fb431252c9dc7e711a0fc4d0 ✓
git rev-list --count 4116bcdb..bb5adc5c → 2
```

- No PR #1249 ancestry (`merge-base --is-ancestor` exit 1)
- No merge from current main
- No rebase onto moving main
- No unrelated campaign ancestry
- Direct linear chain: `4116bcdb → ba12068c → bb5adc5c`

---

## 4. Two-Commit Forensics

### Commit 1: `ba12068c0da426684a16f3f6c246d2f00e3c0154`

| Field | Value |
|-------|-------|
| Parent | `4116bcdbc6580ac6fb431252c9dc7e711a0fc4d0` |
| Subject | P2.2.35 — Operator Vehicle Quick View Documents Localization |
| Classification | **P235 IMPLEMENTATION** |

**Changed paths (14):**
- Production: `OperatorVehicleQuickView.tsx`, `OperatorVehicleQuickViewDocuments.tsx` (new), `operator-vehicle-quick-view-i18n.ts`
- Dictionaries: `en.ts`, `de.ts`, `operator.vehicleQuickView.documents.{en,de}.ts`
- Tests: `operator-vehicle-quick-view-documents-localization.test.tsx`, `hardcoded-copy-guard.test.ts`
- Scanner: `hardcoded-copy-inventory.json`
- Docs: implementation audit + architecture record
- Meta: `ChangesView.tsx`, `ArchitekturView.tsx`

Unrelated: 0 | Main-drift: 0 | Audit contamination: 0

### Commit 2: `bb5adc5c6b4cd3e791d9741100f2101d31fb897b`

| Field | Value |
|-------|-------|
| Parent | `ba12068c` |
| Subject | fix(i18n): remove trailing whitespace from P235 documentation |
| Classification | **DOCUMENTATION ONLY** (P235 follow-up) |

**Changed paths (2):**
- `architecture/I18N_OPERATOR_VEHICLE_QUICK_VIEW_DOCUMENTS_P2_2_35_2026-08-24.md`
- `docs/audits/i18n-p2-2-35-operator-vehicle-quick-view-documents-implementation-2026-08-24.md`

Unrelated: 0 | Main-drift: 0 | Audit contamination: 0

**Both commits P235-only:** YES

---

## 5. Main-Drift Isolation

| Reference | SHA |
|-----------|-----|
| Authoritative baseline | `4116bcdbc6580ac6fb431252c9dc7e711a0fc4d0` |
| Implementation HEAD | `bb5adc5c6b4cd3e791d9741100f2101d31fb897b` |
| Current main | `3e6a47c094104f5174cb8dd2619af1cc3fcb2539` |

Post-baseline main commits touching QV paths:
- `bb5854ea` (#1066) — touches `OperatorVehicleQuickView.tsx` (notifications routing foundation; monolithic QV divergence on main)

PR #1250 (merged token migration) does **not** touch Operator QV or Documents paths.

**Implementation ancestry contamination:** NONE  
**Classification:** **ISOLATED CLEANLY**  
**Future merge conflict risk on QV parent:** MEDIUM (main diverged; reconciliation required at merge time, not implementation contamination)

---

## 6. Complete Diff Inventory

| Class | Paths | Count |
|-------|-------|-------|
| A — QV parent wiring | `OperatorVehicleQuickView.tsx` | 1 |
| B — extracted Documents | `OperatorVehicleQuickViewDocuments.tsx` | 1 |
| C — i18n adapter | `operator-vehicle-quick-view-i18n.ts` | 1 |
| D — dictionaries | `en.ts`, `de.ts`, `operator.vehicleQuickView.documents.{en,de}.ts` | 4 |
| E — tests | documents localization test, guard test | 2 |
| F — scanner/governance | `hardcoded-copy-inventory.json` | 1 |
| G — implementation docs | implementation audit md | 1 |
| H — architecture docs | architecture md, ChangesView, ArchitekturView | 3 |
| I — business/runtime semantic | — | **0** |
| J — unrelated/main drift | — | **0** |
| K — compatibility/shim | — | **0** |

---

## 7. Production Scope

| Path | Baseline | Implementation | Safe? |
|------|----------|----------------|-------|
| `OperatorVehicleQuickView.tsx` | Inline Documents `SectionCard` + visibility | Wiring to extracted component; removed unused import | YES |
| `OperatorVehicleQuickViewDocuments.tsx` | N/A | Read-only document list presentation | YES |
| `operator-vehicle-quick-view-i18n.ts` | P227–P234 helpers | +documents section/type/status/line helpers | YES |

**Hook unchanged:** `useOperatorVehicleQuickViewData.ts` — not in diff.

---

## 8. Active Document Data Path

```
api.vehicleIntelligence.documentExtractions(vehicleId)
  → useOperatorVehicleQuickViewData (map, sort createdAt desc, slice(0,5))
  → OperatorVehicleQuickView (visibility: documentsLoading || documents.length > 0)
  → OperatorVehicleQuickViewDocuments
  → operator-vehicle-quick-view-i18n.ts
  → documentExtraction.type.* / documentExtraction.status.* keys
  → localized UI
```

### Rendered fields

| Field | Source | Localized? |
|-------|--------|------------|
| Section title | host-owned | YES |
| Document ID | API `id` | NO (React key only) |
| Document type | API `documentType` | Label only via `documentExtraction.type.*` |
| Status | API `status` | Label only via `documentExtraction.status.*` |
| Filename | API `sourceFileName` | NO (verbatim) |
| Created-at | API `createdAt` | Locale-formatted presentation only |
| Display name | N/A | N/A |
| Category/expiry/missing/required/count | N/A | Not rendered |
| Actions/callbacks/routes/permissions | N/A | Not present |

---

## 9. Extraction Equivalence

| Concern | Baseline | Implementation | Equivalent? |
|---------|----------|----------------|-------------|
| Section visibility | `(documentsLoading \|\| documents.length > 0)` in parent | Same predicate in parent | YES |
| Document visibility | All mapped docs shown | Same | YES |
| IDs / React keys | `key={doc.id}` | `key={doc.id}` | YES |
| Type machine value | Raw in data | Unchanged in data | YES |
| Status machine value | Raw in data | Unchanged in data | YES |
| Type presentation | Raw `{doc.documentType}` | Localized label | Presentation-only |
| Status presentation | Raw `{doc.status}` | Localized label | Presentation-only |
| Filename | `sourceFileName ?? '—'` | Same | YES |
| Ordering | `createdAt` desc | Unchanged (hook) | YES |
| Limit | 5 | Unchanged (hook) | YES |
| Actions/callbacks | None | None | YES |
| DOM structure | `SectionCard` > rows | `OperatorGlassCard` > rows (same classes) | YES (no material redesign) |

---

## 10–11. Document ID & React Key Audit

- IDs byte-identical from API through to `key={doc.id}`
- No `key={t(...)}` or localized keys
- **PASS**

---

## 12–13. Document Type Machine Values & Key Reuse

Baseline rendered raw machine codes. Implementation maps via `documentExtraction.type.${documentType}`.

All canonical types in dictionary: SERVICE, OIL_CHANGE, TIRE, BRAKE, BATTERY, VEHICLE_CONDITION, TUV_REPORT, BOKRAFT_REPORT, INVOICE, ACCIDENT, DAMAGE, FINE, OTHER.

**Reuse quality:** EXACT for all tested types (TIRE, SERVICE, INVOICE in tests).  
**Machine values changed:** NO

---

## 14–16. Document Status & PARTIALLY_APPLIED

### PARTIALLY_APPLIED special audit

| Question | Answer |
|----------|--------|
| Stable machine status in production? | YES — Prisma enum, backend lifecycle, rental intake flows |
| Rendered before P235? | YES — baseline showed raw `{doc.status}` |
| Previous presentation | Raw machine code fallback |
| New key presentation-only? | YES |
| Changes status derivation? | NO |
| Changes matching/branching/filtering/tone/icon? | NO (QV has no status tones/icons) |
| Legitimizes invalid state? | NO — state already canonical |
| EN/DE semantically correct? | YES — "Partially applied" / "Teilweise angewendet" |

**Classification:** **CANONICAL GAP FILL — SAFE**

Baseline `en.ts` lacked `documentExtraction.status.PARTIALLY_APPLIED`; other statuses existed. P235 fills the gap for a status already reachable in QV data.

**Status reuse quality:** EXACT  
**Status derivation changed:** NO  
**Tones/icons changed:** NO (N/A — no status chrome in QV documents list)

---

## 17–20. Dynamic Data

| Check | Result |
|-------|--------|
| Filename `Fahrzeugschein_Muster_ABC-42.pdf` | Exact EN/DE/same-mount |
| Display name | N/A |
| Arbitrary dynamic data | Preserved verbatim |
| Expiry | N/A — not rendered |

---

## 21–27. Semantics Freeze

| Concern | Changed? |
|---------|----------|
| Expiry raw/predicates/thresholds | N/A |
| Missing-document semantics | N/A |
| Required/optional semantics | N/A |
| Count semantics | NO |
| Order | NO |
| Filtering | NO |
| Limit (5) | NO |
| Visibility | NO |

---

## 28–31. Actions / Callbacks / Routes / Permissions

Read-only list. No row actions, callbacks, routes, sheets, modals, or permission predicates in Documents slice.

**All N/A — unchanged.**

---

## 32. DOM / Layout

Extracted component preserves:
- `space-y-3 p-4` card wrapper
- `h3` section title
- `rounded-xl border border-border/50 px-3 py-2 text-xs` rows
- Two-line primary/secondary text structure

**No material redesign.**

---

## 33–34. Adapter Audit

Helpers added to `operator-vehicle-quick-view-i18n.ts`:

| Helper | Class |
|--------|-------|
| `operatorVehicleQuickViewDocumentsSectionTitle` | C — canonical presentation label |
| `operatorVehicleQuickViewDocumentTypeLabel` | A — type → TranslationKey |
| `operatorVehicleQuickViewDocumentStatusLabel` | B — status → TranslationKey |
| `operatorVehicleQuickViewDocumentPrimaryLine` | C — presentation formatter |
| `operatorVehicleQuickViewDocumentSecondaryLine` | D — presentation formatter (filename + date) |

E/F/G/H/I/J/K = 0

**Adapter classification:** CANONICAL  
**Business logic in adapter:** NO

---

## 35–37. Keys & Dictionary Accounting

### Exact new P235 keys (2)

| Key | EN | DE | Required? | Classification |
|-----|----|----|-----------|----------------|
| `operator.vehicleQuickView.documents.sectionTitle` | AI uploads / documents | AI-Uploads / Dokumente | YES | **JUSTIFIED** |
| `documentExtraction.status.PARTIALLY_APPLIED` | Partially applied | Teilweise angewendet | YES (gap fill) | **JUSTIFIED** |

| Metric | Baseline | Final |
|--------|----------|-------|
| EN keys | 8489 | 8491 |
| DE keys | 8489 | 8491 |
| New keys | — | 2 |
| Removed keys | — | 0 |
| Changed existing translations | — | 0 |
| Parity | 100% | 100% |
| Orphans | 0 | 0 |
| Duplicates | 0 | 0 |

---

## 38–45. Regression Results (Independent)

| Test | Result |
|------|--------|
| Same-mount locale switch | PASS |
| Type regression (TIRE, SERVICE, INVOICE) | PASS |
| Status regression (READY_FOR_REVIEW, APPLIED, PARTIALLY_APPLIED, CONFIRMED) | PASS |
| Filename regression | PASS |
| Dynamic-name regression | N/A |
| Expiry regression | N/A |
| Count/order regression | PASS |
| Action regression | N/A |
| Raw-key leakage | PASS |
| Raw machine-code leakage | PASS (localized where canonical keys exist) |

**P235 tests:** 8/8 PASS  
**Frozen QV P227–P234:** 103/103 PASS (implementation claimed 95; independent run includes P235 suite in count)

---

## 46–47. Accessibility & Fixed-Locale

- No aria-label/title/tooltip in Documents slice (section uses visible `h3` only)
- Date formatting via `formatOperatorVehicleQuickViewDateTime` (locale-aware, presentation-only)
- **P235 fixed-locale debt:** 0

---

## 48–50. Blockers Hard Exclusion

Complete P235 diff has **zero** production modifications to:
- Blockers section logic
- `blocking_reasons` rendering
- `contradiction` strings/utils
- `operatorVehicleQuickView.utils.ts`
- `useOperatorVehicleQuickViewData.ts`

Blockers section at line 121 remains hardcoded `"Blocker & Hinweise"` — untouched.

---

## 51–53. Quick View Campaign Closure

### Complete QV residual re-scan

| Finding | File:Line | Classification |
|---------|-----------|----------------|
| `Blocker & Hinweise` | `OperatorVehicleQuickView.tsx:121` | **A — Blockers / contradiction architecture** |

E (safe untranslated presentation debt) = **0**  
F (frozen-slice regression) = **0**

### Blockers architectural deferral

Remaining Blockers text is coupled to:
- `data.health?.blocking_reasons` (dynamic business strings)
- `snapshot?.contradictions` (derived in `operatorVehicleQuickView.utils.ts`)
- Eligibility/readiness predicates (`rental_blocked`, contradiction detection)

Localizing cleanly requires separating presentation from business derivation — beyond P235 presentation mapping scope.

**Classification:** **ARCHITECTURAL DEFERRAL JUSTIFIED**

### Campaign closure

**QV PRESENTATION COMPLETE — BLOCKERS ARCHITECTURALLY DEFERRED**

---

## 54–60. Scanner, Freeze, Shim

### P235_ENFORCE_CLEAN_EXACT

```
operator/components/OperatorVehicleQuickViewDocuments.tsx
operator/lib/operator-vehicle-quick-view-i18n.ts
```

- P235 scoped findings: **0**
- Does not swallow Blockers: YES (parent Blockers line excluded from P235 boundary)
- Does not reopen P227–P234: YES
- No ignores/allowlists/exemptions/scanner weakening

| Phase | Debt |
|-------|------|
| P235 | 0 |
| P234–P227 | 0 |
| P226–P216 | 0 |
| Global enforce-clean | 0 |

**Shim:** 29 (unchanged, baseline 29)  
**New compatibility consumers:** 0

---

## 61–62. Collision Analysis

| PR/Event | Overlap with P235 paths | Classification |
|----------|-------------------------|----------------|
| PR #1250 (merged token migration) | None on Operator QV/Documents | NONE |
| Main `bb5854ea` (#1066) on QV parent | Future merge conflict on parent only | LOW (ancestry) / MEDIUM (future merge) |

**Implementation ancestry contamination:** NONE  
**Active collision:** LOW

---

## 63–65. Build, Diff-Check, CI

| Check | Result |
|-------|--------|
| `npm run build` | PASS |
| `git diff --check` | PASS |
| `npm run i18n:check` | PASS (338 tests) |

### CI triage (HEAD `bb5adc5c`)

| Job | Result | P235-caused? |
|-----|--------|--------------|
| Frontend component tests | PASS | — |
| Production build | PASS | — |
| Lint | PASS | — |
| Accessibility (axe) | PASS | — |
| Typecheck | FAIL (backend spec TS errors) | **NO** — billing/vehicles security specs |
| Backend unit tests | FAIL (one workflow) / PASS (other) | **NO** — unrelated |
| Playwright E2E Vehicle Detail | FAIL (one workflow) / PASS (other) | **NO** — flaky/pre-existing |

**P235-caused required CI failures:** 0

---

## 66. Claim Reconciliation

| Claim | PR Claim | Independent | PASS/FAIL |
|-------|----------|-------------|-----------|
| Baseline | `4116bcdb` | `4116bcdb` | PASS |
| HEAD | `bb5adc5c` | `bb5adc5c` | PASS |
| Commit count | 2 | 2 | PASS |
| Both commits P235-only | YES | YES | PASS |
| No #1249 ancestry | YES | YES | PASS |
| No moving-main ancestry | YES | YES | PASS |
| Main drift isolated | YES | ISOLATED CLEANLY | PASS |
| Documents extraction | YES | YES | PASS |
| IDs unchanged | YES | YES | PASS |
| React keys stable | YES | YES | PASS |
| Type values unchanged | YES | YES | PASS |
| Status values unchanged | YES | YES | PASS |
| PARTIALLY_APPLIED safe | YES | CANONICAL GAP FILL | PASS |
| Filenames unchanged | YES | YES | PASS |
| Dynamic names | N/A | N/A | PASS |
| Expiry | N/A | N/A | PASS |
| Missing/required | N/A | N/A | PASS |
| Count/order/filter/limit | unchanged | unchanged | PASS |
| Visibility unchanged | YES | YES | PASS |
| Callbacks/routes/permissions | N/A | N/A | PASS |
| DOM/layout | unchanged | unchanged | PASS |
| 2 new keys | YES | YES (exactly 2) | PASS |
| 8491/8491 | YES | YES | PASS |
| P235=0 | YES | YES | PASS |
| Blockers untouched | YES | YES | PASS |
| QV campaign closure | QV PRESENTATION COMPLETE | CONFIRMED | PASS |
| 8 P235 tests | 8/8 | 8/8 | PASS |
| 95 frozen QV tests | 95/95 | 103/103 (incl. P235 in run) | PASS |
| 338 i18n tests | 338 | 338 | PASS |
| Category E | 0 | 0 | PASS |
| Shim | 29 | 29 | PASS |
| Build | PASS | PASS | PASS |
| diff-check | PASS | PASS | PASS |
| CI P235 failures | 0 | 0 | PASS |

---

## 67. Correction Threshold

**CORRECTIONS REQUIRED:** NO

---

## 68. Smallest Correction Set

Not applicable — verdict A.
