# P2.2.33 — Post-P232 Next i18n Slice Pre-Flight

**Date:** 2026-08-24
**Mode:** Strict read-only audit / next-slice selection
**Authoritative baseline:** `820851c2469297c842ff02a16e21983aaa4aec41` (merge of PR #1238 / P2.2.32)
**Prior pre-flight reference:** PR #1237 (P2.2.32 selection)

---

## 1. Baseline verification

| Check | Result |
|-------|--------|
| Baseline SHA | `820851c2469297c842ff02a16e21983aaa4aec41` |
| P232 ancestry | YES (`73cfb5a` → `9a759e71` → merge `820851c2`) |
| Working tree | clean |
| `npm run i18n:check` | **PASS** |
| EN keys | **8472** |
| DE keys | **8472** |
| Parity | **100%** |
| Orphans | **0** |
| Global enforce-clean debt | **0** |
| Shim | **29** (prod 18, test 11) |
| i18n:check suite tests | **334** |

**Baseline regression:** NONE

---

## 2. Frozen Quick View slices (do not reopen)

| Slice | Status |
|-------|--------|
| P227 Open Tasks | FROZEN |
| P228 Header & Primary Status | FROZEN |
| P229 Quick Actions | FROZEN |
| P230 Tool/Footer Actions | FROZEN |
| P231 Booking & Customer Context | FROZEN |
| P232 Rental Health Modules | FROZEN |

---

## 3. Remaining Quick View residual (actual, post-P232)

Parent file: `operator/components/OperatorVehicleQuickView.tsx`

Scanner-reported findings: **6** (all in parent; enforce-clean slices extracted through P232)

### Residual block inventory

| Block | Path/lines | Visible copy | Hidden copy | Fixed-locale | Machine values | Dynamic data | Actions | Est. new keys | Risk |
|-------|------------|--------------|-------------|--------------|----------------|--------------|---------|---------------|------|
| **Blockers** | L122–143 | `Blocker & Hinweise`; `Rental Health nicht geladen:` prefix | visibility predicate | none in block | `rental_blocked`, contradictions array | `healthError`, `blocking_reasons[]`, contradiction strings from utils | none | 3–6 chrome only; 4+ if contradictions refactored | **HIGH** |
| **Active Damages** | L150–175 | `Aktive Schäden`; `Keine aktiven Schäden.` | row title pattern `type · severity` | none | `damageType`, `severity`, `rentalImpact` | `locationLabel`, `id` | none | **4–6** + heavy reuse | **LOW** |
| **Tire Profile** | L199–250 | `Reifenprofil`; `Messung eintragen`; `Keine Reifendaten.`; 5× InfoTile labels | `InfoTile` helper labels; `—` fallback | `formatOperatorDateTime` → `de-DE`; tire helpers default `locale='de'` | tread/km/status/mode values | measurement timestamps, displayMode | tire-measure sheet open | **10–14** | **MEDIUM** |
| **Documents** | L252–272 | `AI Uploads / Dokumente` | conditional section visibility | `formatOperatorDateTime` → `de-DE` | `documentType`, `status` | `sourceFileName` | none | **4–8** + type/status maps TBD | **LOW–MEDIUM** |

**Post-P232 QV sections already extracted/localized:** Header, Quick Actions, Booking Context, Rental Health, Tasks, Tool Actions.

---

## 4. Blockers — re-audit classification

**Verdict: STILL TOO COUPLED**

| Element | Source | Nature |
|---------|--------|--------|
| Section visibility | `rental_blocked \|\| contradictions.length \|\| healthError` | business predicate — freeze |
| `blocking_reasons` | API `VehicleHealthResponse.blocking_reasons` | dynamic backend/business strings — **must not translate** |
| `healthError` | fleet health fetch error string | dynamic — **must not translate** |
| `contradictions` | `detectOperatorStatusContradictions()` in `operatorVehicleQuickView.utils.ts` | **hardcoded German presentation strings returned as machine data** |

Contradiction strings (utils L105–126) are presentation text embedded in derivation layer:

- `Fahrzeugstatus „Verfügbar“, Rental Health meldet Block.`
- `Status „Aktiv vermietet“ ohne aktive Buchungsreferenz.`
- `Status „Reserviert“ ohne Reservierungsreferenz.`
- `Operativer Wartungsblock ohne rental_blocked in Rental Health.`

Localizing Blockers without refactoring contradictions to stable machine codes → TranslationKey would either:

1. translate dynamic business text incorrectly, or
2. change derivation/eligibility semantics.

**Not selectable for P2.2.33.**

---

## 5. Documents — classification

**Verdict: SAFE AFTER NARROW EXTRACTION (chrome-first)**

| Concept | Treatment |
|---------|-----------|
| Section title | localizable chrome |
| `documentType` / `status` | machine codes — map to keys if canonical maps exist; else display raw until maps added |
| `sourceFileName` | dynamic — never translate |
| `createdAt` | raw timestamp — locale format only |
| Visibility | `documentsLoading \|\| documents.length > 0` — freeze |

Lower leverage than Damages; type/status canonical key reuse less established in QV context.

---

## 6. Damage — classification

**Verdict: SAFE PRESENTATION-ONLY — BEST NEXT QV SLICE**

| Concept | Baseline | P233 approach |
|---------|----------|---------------|
| Section title | hardcoded DE | new `operator.vehicleQuickView.damages.*` |
| Empty state | hardcoded DE | new key |
| `damageType` | `formatDamageType()` title-case hack | reuse `operator.damageCapture.damageType.*` |
| `severity` | raw machine code displayed | reuse `operator.damageCapture.severity.*` |
| `rentalImpact` chip | raw code when `!== NONE` | reuse `operator.damageCapture.rentalImpact.*` |
| `locationLabel` | dynamic text | preserve verbatim |
| `id` | React key | preserve |
| Workflow/thresholds | none in QV list | freeze |

Existing P2.2.24 `operator.damageCapture.*` keys provide clean machine → TranslationKey boundary.

---

## 7. Secondary metadata (Tire Profile) — classification

**Verdict: SAFE AFTER NARROW EXTRACTION — defer to P2.2.34+**

Coherent bounded slice, but crosses:

- `formatOperatorDateTime` fixed `de-DE` in `operatorVehicleQuickView.utils.ts`
- `tire-health-detail-ui.ts` helpers defaulting to `locale='de'`
- P2.2.26 tire-measure domain overlap

Higher coupling than Active Damages; not first choice.

---

## 8. Accessibility / fallback residual

No standalone aria/title debt isolated in QV parent beyond section chrome. Prefer attaching accessibility to owning extracted components (Damages, Tire, Documents) rather than a meta-slice.

---

## 9. Non-Quick-View alternatives (top candidates)

| Surface | File | Scanner findings | Notes |
|---------|------|------------------|-------|
| **Operator bookings** | `OperatorBookingFormSheet.tsx` | 16 | largest operator debt; low boundedness |
| **Operator today** | `OperatorTodayView.tsx` | 12 | high leverage dashboard; multi-section |
| **Operator AI upload** | `OperatorAiUploadFlow.tsx` | 11 | active domain; medium collision risk |
| **Operator booking detail** | `OperatorBookingDetailSheet.tsx` | 8 | medium scope |
| **Operator documents** | `OperatorBookingDocumentsPanel.tsx` | 7 | overlaps documents domain |
| **Operator vehicles** | `OperatorVehiclesView.tsx` | 4 | fleet list chrome |
| **Rental fleet** | various rental components | partial prior work | lower incremental QV completion value |

**Best non-QV Operator candidate:** `OperatorTodayView.tsx`
**Best Vehicle/Fleet candidate:** `OperatorVehiclesView.tsx`
**Best Rental candidate:** remaining `OperatorBookingFormSheet.tsx` fields (but scope too large)

Finishing Vehicle Quick View damages first yields higher incremental completion of the primary operator vehicle anchor before leaving QV.

---

## 10. Top-10 ranking

Scores 0–5 (higher better except Business Risk where 0=low). Weighted preference: leverage, boundedness, testability, low risk.

| Rank | Candidate | Leverage | Visible debt | Hidden/fixed | Separation | Bounded | Testable | Collision safety | Biz risk (0–5) | Total |
|------|-----------|----------|--------------|--------------|------------|---------|----------|------------------|----------------|-------|
| 1 | **QV Active Damages** | 4 | 4 | 3 | 5 | 5 | 5 | 5 | 1 | **32** |
| 2 | QV Tire Profile | 4 | 5 | 2 | 3 | 4 | 4 | 4 | 3 | 29 |
| 3 | QV Documents | 3 | 3 | 2 | 4 | 4 | 4 | 5 | 2 | 27 |
| 4 | OperatorTodayView | 5 | 5 | 3 | 3 | 2 | 3 | 4 | 3 | 28 |
| 5 | OperatorBookingFormSheet | 5 | 5 | 3 | 3 | 1 | 2 | 3 | 4 | 26 |
| 6 | OperatorAiUploadFlow | 4 | 4 | 2 | 3 | 2 | 3 | 3 | 3 | 24 |
| 7 | OperatorVehiclesView | 3 | 3 | 2 | 4 | 3 | 4 | 5 | 2 | 26 |
| 8 | OperatorBookingDetailSheet | 3 | 3 | 2 | 3 | 3 | 3 | 4 | 2 | 23 |
| 9 | OperatorBookingDocumentsPanel | 3 | 3 | 2 | 3 | 3 | 3 | 4 | 2 | 23 |
| 10 | QV Blockers | 4 | 3 | 4 | 1 | 2 | 2 | 4 | 5 | 21 |

---

## 11. Campaign decision

**A — CONTINUE VEHICLE QUICK VIEW**

---

## 12. Selected P2.2.33 target

**P2.2.33 — Operator Vehicle Quick View Active Damages Localization**

---

## 13. Split decision

**ONE SLICE**

Active Damages is a single coherent section (title, empty, up to 5 rows, chip labels) with no internal sub-domain requiring split.

---

## 14. Implementation contract (for future P2.2.33 — do not implement here)

### Exact production files

| File | Role |
|------|------|
| `operator/components/OperatorVehicleQuickViewActiveDamages.tsx` | **new extract** |
| `operator/lib/operator-vehicle-quick-view-i18n.ts` | extend adapter (damages helpers) |
| `operator/components/OperatorVehicleQuickView.tsx` | wiring only |
| `i18n/translations/operator.vehicleQuickView.damages.{en,de}.ts` | new dictionary slice |

### Presentation concepts (~6–10)

- section title
- empty state
- row separator / formatting chrome (if needed)
- damage type label (via reuse)
- severity label (via reuse)
- rental impact chip label (via reuse)

### Machine/domain freeze

- `DamageResponse.id` (React key)
- `damageType`, `severity`, `rentalImpact` codes
- `locationLabel` dynamic text
- slice limit `damages.slice(0, 5)` order
- `isActiveDamage` filter (in hook — do not change)
- visibility: always render section (baseline)

### Dynamic data preserve

- `locationLabel`
- any future description fields

### Callbacks / routes / permissions

**NO ACTIONS** in damages section — NA

### Date/time / number / unit

NA in this slice (no dates/numbers displayed)

### Expected key reuse

| Machine | Reuse key prefix |
|---------|------------------|
| `damageType.*` | `operator.damageCapture.damageType.*` |
| `severity.*` | `operator.damageCapture.severity.*` |
| `rentalImpact.*` | `operator.damageCapture.rentalImpact.*` |

### Estimated new keys

**4–6** new `operator.vehicleQuickView.damages.*` (8460→8472 baseline now 8472 → ~8476–8478)

### Proposed `P233_ENFORCE_CLEAN_EXACT`

```
operator/components/OperatorVehicleQuickViewActiveDamages.tsx
operator/lib/operator-vehicle-quick-view-i18n.ts
```

### Future acceptance gates

- selected visible/hidden/fixed-locale debt = 0
- Category E = 0
- EN = DE, parity 100%, orphans 0
- P233 = 0; P232–P216 remain 0; global enforce-clean = 0
- shim ≤ 29; new compatibility consumers = 0
- meaningful EN/DE + same-mount tests PASS
- `npm run i18n:check` PASS; build PASS; `git diff --check` PASS

### Test contract

- `operator-vehicle-quick-view-active-damages-localization.test.tsx`
- EN/DE section + empty + row labels
- same-mount locale switch
- dynamic `locationLabel` preserved
- machine codes not leaked when canonical labels exist
- type/severity/impact maps via reuse keys
- P227–P232 regression PASS

---

## 15. Collision check

| Active work | Classification |
|-------------|----------------|
| PR #1239 Communication Center navigation | **LOW** — no QV damages paths |
| PR #1240 P232 re-audit | audit-only |
| PR #1237 P232 preflight | audit-only |
| Operator damage capture (P2224 merged) | **LOW** — reuse keys, no conflict |
| Tire/health modules | **LOW** — separate QV blocks |

**Collision: LOW** — no HIGH/DIRECT collision.

---

## 16. Main drift

`main` has advanced beyond baseline. No merged main commits materially touch QV Active Damages block on baseline. **Main-drift collision: LOW.**

---

## 17. Deferred targets (post-P233)

| Target | Classification | Earliest |
|--------|----------------|----------|
| QV Tire Profile | SAFE AFTER NARROW EXTRACTION | P2.2.34 |
| QV Documents | SAFE AFTER NARROW EXTRACTION | P2.2.35 |
| QV Blockers | STILL TOO COUPLED | requires architectural prerequisite (contradiction machine codes) |
| OperatorTodayView | leave QV | after QV residual closure |

---

## 18. Final verdict

**A — GO — P2.2.33 TARGET SELECTED**

**P2.2.33 — Operator Vehicle Quick View Active Damages Localization**

Proceed with bounded extraction following P227–P232 patterns. Do not select Blockers. Do not reopen frozen slices.
