# P2.2.34 — Post-P233 Next i18n Slice Pre-Flight

**Date:** 2026-08-24  
**Mode:** STRICT READ-ONLY TARGET SELECTION  
**Authoritative baseline:** `5650bb01c4b6f850046fc51817058f6d41fb4997` (merged PR #1242 / P2.2.33)  
**Previous implementation HEAD:** `5af2f1be58b7a0470386a0b9363fe40b89812e7d`

---

## 0. Primary Decision

**Is there still a sufficiently valuable, bounded, presentation-only Operator Vehicle Quick View slice after P233?**

**YES — but only for the remaining inline parent blocks (Tire Profile, then Documents).**

P227–P233 extracted and localized seven Quick View surfaces. The parent `OperatorVehicleQuickView.tsx` still owns three presentation blocks with meaningful operator-visible debt. **Tire Profile** is the cleanest next slice: bounded DOM, extractable component, existing locale-capable tire presentation helpers (`tire-health-detail-ui.ts`), and no dynamic user-generated text in labels. **Blockers** remains deferred (coupled). **Documents** is viable as a follow-on slice.

**Quick View vs move-on:** Tire Profile outranks the best non-QV Operator candidate (`OperatorBookingFormSheet`, 16 scanner findings) on boundedness, enforce-clean precision, and machine/presentation separation — while remaining high-visibility in the primary operator vehicle drill-down.

---

## 1. Baseline / Topology Hard Gate

| Check | Result |
|-------|--------|
| Baseline SHA exists | `5650bb01c4b6f850046fc51817058f6d41fb4997` |
| Contains merged P233 | YES (merge commit of PR #1242) |
| P227–P233 extracted components present | ALL 7 exist on baseline |
| P227–P233 commit ancestry in baseline | YES (`314f20aa`…`5650bb01`) |
| Working tree clean (pre-audit) | YES |
| `npm run i18n:check` | **PASS** |

| Metric | Expected | Actual |
|--------|----------|--------|
| EN keys | 8475 | **8475** |
| DE keys | 8475 | **8475** |
| Parity | 100% | **100%** |
| Orphans | 0 | **0** |
| Global enforce-clean | 0 | **0** |
| P233–P216 | 0 | **0** |
| i18n suite count | — | **336** collected / passed |
| Shim | ≈29 | **29** (prod 18, test 11) |
| Compatibility consumers | — | **29** total, **0** new |

---

## 2. Complete Quick View Residual Inventory

All findings below are from **authoritative baseline production code** (`5650bb01`), not prior audit docs.

| Path | Block | Concept | Vis | Current text / behavior | Machine input | Dynamic? | Fixed locale? | Callback | Risk |
|------|-------|---------|-----|-------------------------|---------------|----------|---------------|----------|------|
| `OperatorVehicleQuickView.tsx` | Blockers L122–143 | Section title | Y | `Blocker & Hinweise` | visibility predicate | N | N | N/A | HIGH |
| same | Blockers | Health load error prefix | Y | `Rental Health nicht geladen:` | `healthError` string | semi | N | N/A | HIGH |
| same | Blockers | Blocking reasons list | Y | raw `blocking_reasons[]` | API strings | **Y** | N | N/A | HIGH |
| same | Blockers | Contradiction messages | Y | German strings from utils | derived in `detectOperatorStatusContradictions` | **Y** | N | N/A | **CRITICAL** |
| same | Tire L177–228 | Section title | Y | `Reifenprofil` | always shown | N | N | N/A | LOW |
| same | Tire | CTA action | Y | `Messung eintragen` | always when section rendered | N | N | `openSheet({type:'tire-measure'})` | LOW |
| same | Tire | Empty state | Y | `Keine Reifendaten.` | `!tireSummary` | N | N | N/A | LOW |
| same | Tire | InfoTile labels ×5 | Y | `Letzte Messung`, `Profil (min.)`, `Status`, `Restlaufzeit`, `Modus` | static labels | N | N | N/A | LOW |
| same | Tire | Last measurement value | Y | `formatOperatorDateTime(...)` | ISO timestamp | N | **de-DE** | N/A | MED |
| same | Tire | Status/tread/remaining | Y | `tireUiStatusLabel` etc. | summary API | N | **defaults locale='de'** | N/A | MED |
| same | Tire | Mode value | Y | raw `displayMode` / `measurementState` | machine enum | N | N | N/A | LOW |
| same | Documents L230–250 | Section title | Y | `AI Uploads / Dokumente` | visibility gate | N | N | N/A | MED |
| same | Documents | Row title | Y | `{documentType} · {status}` | machine codes | N | N | N/A | MED |
| same | Documents | Row subtitle | Y | `{sourceFileName} · {date}` | filename + ISO | **filename Y** | **de-DE date** | N/A | MED |
| `operatorVehicleQuickView.utils.ts` | `formatOperatorDateTime` | Shared date formatter | used by Tire+Docs | `toLocaleString('de-DE')` | ISO | N | **YES** | N/A | MED (shared) |

**Scanner-visible parent debt (4):** Blockers title, Documents title, Tire empty, Tire CTA.  
**Additional manual residual not in scanner:** Tire section title, 5 InfoTile labels, health-error prefix, raw machine codes in document rows, fixed-locale formatters.

**Frozen P227–P233 components:** 0 enforce-clean findings each (verified via inventory).

---

## 3. Residual Ownership Classification

| Class | Items |
|-------|-------|
| **A — Blockers / contradictions** | Blockers section + `detectOperatorStatusContradictions` messages + `blocking_reasons` |
| **B — Documents** | AI Uploads / Dokumente section |
| **C — Secondary metadata** | Tire Profile section (vehicle tire summary tiles) |
| **D — Date/time presentation** | `formatOperatorDateTime` (de-DE) in Tire + Documents |
| **E — Accessibility** | No standalone aria/tooltip debt found in QV parent |
| **F — Empty/error/fallback** | Tire empty, Blockers health-error prefix |
| **G–I** | **0** genuine missed debt in frozen P231–P233 slices |

---

## 4. Blockers Re-Audit

**Path:** `health.rental_blocked` / `blocking_reasons` / `healthError` + `deriveOperatorVehicleStatusSnapshot` → `snapshot.contradictions` → Blockers `SectionCard`

| String | Classification |
|--------|----------------|
| `Blocker & Hinweise` | CANONICAL PRESENTATION |
| `Rental Health nicht geladen:` | CANONICAL PRESENTATION |
| `blocking_reasons[i]` | DYNAMIC BUSINESS DATA (server-provided, no stable code mapping in QV) |
| Contradiction messages in `detectOperatorStatusContradictions` | DERIVED BUSINESS REASON (hardcoded German in utils) |

**Blockers overall: STILL TOO COUPLED — DEFER**

Localization would require either (a) refactoring contradiction generation to emit stable machine codes before presentation, or (b) translating dynamic server reasons — both violate freeze contract. Do **not** select for P234.

---

## 5. Documents Re-Audit

**Path:** `api.vehicleIntelligence.documentExtractions` → `useOperatorVehicleQuickViewData` → Documents `SectionCard`

| Field | Classification |
|-------|----------------|
| Section title | CANONICAL PRESENTATION |
| `documentType` | MACHINE ENUM → reuse `documentExtraction.type.*` |
| `status` | MACHINE ENUM → reuse `documentExtraction.status.*` |
| `sourceFileName` | DYNAMIC FILENAME — **do not translate** |
| `createdAt` | TIMESTAMP — presentation format only |
| Visibility | `documentsLoading \|\| documents.length > 0` |

**Documents classification: ONE CLEAN SLICE (second QV candidate after Tire)**

Not selected for P234 because Tire has tighter coupling to existing locale-aware helpers and lower dynamic-data risk.

---

## 6. Secondary Metadata (Tire Profile)

Tire block is self-contained vehicle metadata presentation:

| Concept | Raw value | Presentation |
|---------|-----------|--------------|
| Last measurement | ISO instant | locale datetime |
| Min tread | mm + position from API/evidence | via `tireLowestTreadLabel(locale)` |
| Status | `TireUiStatus` machine | via `tireUiStatusLabel(locale)` |
| Remaining km | numeric from evidence | via `tireRemainingKmLabel(locale)` |
| Mode | `displayMode` / `measurementState` | machine enum → new map keys |

**Metadata classification: ONE COHERENT BOUNDED SLICE (selected P234 target)**

---

## 7. Date / Time / Number / Unit Audit

| Location | Formatter | Fixed locale | Business comparison? |
|----------|-----------|--------------|---------------------|
| `formatOperatorDateTime` | `toLocaleString('de-DE')` | **YES** | NO (display only) |
| Tire tread/km labels | `tire-health-detail-ui` | locale param (QV passes default `de`) | NO |
| Documents `createdAt` | `formatOperatorDateTime` | **YES** | NO (sort in hook uses raw ISO) |

P234 Tire slice should localize datetime at presentation edge only; must **not** alter hook sort (`new Date(b.createdAt) - new Date(a.createdAt)`).

---

## 8. Accessibility / Fallback

No orphan aria-label/title/tooltip debt in QV parent beyond strings already inventoried. Accessibility strings should attach to owning feature slices (Tire, Documents, Blockers), not a standalone micro-slice.

---

## 9. Quick View Completion Test

| After candidate | Closure status |
|-----------------|----------------|
| **P234 Tire Profile** | **SIGNIFICANT RESIDUAL** (Documents + Blockers remain) |
| If Documents next | **BLOCKERS-ONLY RESIDUAL** |
| If Blockers attempted | **ARCHITECTURAL PREREQUISITE REQUIRED** |

---

## 10–13. Non-QV Candidate Rankings (Top 3 each)

### Operator (outside QV)

| Rank | Surface | Paths | Visible debt | Coupling |
|------|---------|-------|--------------|----------|
| 1 | Booking form sheet | `operator/bookings/OperatorBookingFormSheet.tsx` | 16 | MEDIUM |
| 2 | Today view | `operator/views/OperatorTodayView.tsx` | 12 | MEDIUM |
| 3 | AI upload flow | `operator/ai-upload/OperatorAiUploadFlow.tsx` | 11 | MEDIUM |

### Vehicle / Fleet

| Rank | Surface | Paths | Visible debt | Coupling |
|------|---------|-------|--------------|----------|
| 1 | Fleet condition / health display | `rental/lib/fleetVehicleDisplay.ts` + fleet views | scattered | HIGH |
| 2 | Vehicle detail header badges | `rental/components/vehicle-detail/VehicleDetailHeaderBadges.tsx` | partial i18n | MEDIUM |
| 3 | Fleet map operator panel | `rental/components/fleet-map/*` | moderate | MEDIUM |

### Rental

| Rank | Surface | Paths | Visible debt | Coupling |
|------|---------|-------|--------------|----------|
| 1 | Data analyse view | `rental/components/DataAnalyseView.tsx` | 32 | HIGH (broad) |
| 2 | Documents view | `rental/components/DocumentsView.tsx` | 22 | MEDIUM |
| 3 | Damage work queue | `rental/components/damages/DamageWorkQueue.tsx` | 14 | MEDIUM |

### Master / Shared / Shell

| Rank | Surface | Debt |
|------|---------|------|
| 1 | Master Changes/Architektur views | large (admin meta, lower operator leverage) |
| 2 | Shell navigation | 25 SHELL findings |
| 3 | Shared cross-surface | 1 finding |

---

## 14. Top-10 Global Ranking

| # | Candidate | OpLev | Vis | Debt | Separation | Bounded | Test | Enforce | Coll | BizRisk | Est keys | Est files |
|---|-----------|-------|-----|------|------------|---------|------|---------|------|---------|----------|-----------|
| 1 | **QV Tire Profile** | 5 | 5 | 4 | 5 | 5 | 5 | 5 | 5 | 1 | 8–12 | 3–4 |
| 2 | QV Documents | 4 | 4 | 3 | 4 | 4 | 4 | 4 | 5 | 2 | 6–10 | 3–4 |
| 3 | Operator booking form | 5 | 5 | 4 | 3 | 2 | 3 | 2 | 4 | 3 | 25+ | 6+ |
| 4 | Operator today view | 5 | 5 | 3 | 3 | 2 | 3 | 2 | 4 | 2 | 20+ | 5+ |
| 5 | Rental documents view | 4 | 4 | 4 | 3 | 2 | 3 | 2 | 3 | 2 | 30+ | 8+ |
| 6 | Operator AI upload flow | 4 | 4 | 3 | 3 | 2 | 3 | 2 | 3 | 3 | 20+ | 5+ |
| 7 | Rental data analyse | 3 | 3 | 5 | 2 | 1 | 2 | 1 | 3 | 3 | 40+ | 10+ |
| 8 | QV Blockers | 5 | 4 | 3 | 1 | 2 | 2 | 1 | 4 | 5 | 15+ | 5+ |
| 9 | Operator booking detail sheet | 4 | 4 | 2 | 3 | 3 | 3 | 3 | 4 | 2 | 12+ | 4+ |
| 10 | Rental damage work queue | 3 | 3 | 3 | 3 | 2 | 3 | 2 | 3 | 4 | 20+ | 6+ |

**Winner:** QV Tire Profile — highest combined score with lowest business risk and cleanest enforce-clean boundary.

---

## 15. Quick View vs Move-On Decision

**A — CONTINUE QUICK VIEW**

Tire Profile beats best external candidate on boundedness, separation, enforce-clean suitability, and collision safety while preserving high operator leverage. Blockers intentionally deferred. Documents follows as P2.2.35 candidate.

---

## 16. Selected P234 Target

**P2.2.34 — Operator Vehicle Quick View Tire Profile Localization**

**IMPLEMENTATION NOT STARTED.**

---

## 17. Split Decision

**ONE SLICE**

---

## 18. Exact Production Boundary

### Production paths (initial)

- `frontend/src/operator/components/OperatorVehicleQuickView.tsx` (wiring only)
- **NEW** `frontend/src/operator/components/OperatorVehicleQuickViewTireProfile.tsx`
- `frontend/src/operator/lib/operator-vehicle-quick-view-i18n.ts` (extend adapter)

### Symbols / presentation concepts

| Concept | Source |
|---------|--------|
| Section title | `Reifenprofil` |
| CTA label | `Messung eintragen` |
| Empty state | `Keine Reifendaten.` |
| InfoTile labels | Letzte Messung, Profil (min.), Status, Restlaufzeit, Modus |
| Last measurement display | ISO → locale datetime |
| Tread / status / remaining | `tireLowestTreadLabel`, `tireUiStatusLabel`, `tireRemainingKmLabel` with active locale |
| Mode display | `displayMode` / `measurementState` machine values |

### Frozen inputs

- `tireSummary` object from hook (unchanged)
- `tireLoading` boolean
- `vehicleId`, `vehicleLabel`, `bookingId` for CTA args (unchanged)
- Sort/filter in hook (unchanged)

### Callbacks / routes

- `openSheet({ type: 'tire-measure', vehicleId, vehicleLabel, bookingId?, onSuccess })` — **freeze**

### Visibility

- Section always rendered (same as baseline)
- Inner: loading skeleton / empty / grid — unchanged predicates

---

## 19. Machine / Domain Freeze Contract

| Value | Freeze |
|-------|--------|
| `TireDisplayMode` (`MEASURED`/`ESTIMATED`/`UNKNOWN`) | machine — map only |
| `measurementState` (`measured`/`estimated`/`mixed`) | machine — map only |
| `TireUiStatus` codes | machine — map via existing helpers |
| ISO timestamps (`lastMeasurementAt`, etc.) | raw instant unchanged |
| Numeric tread mm / remaining km | raw values unchanged |
| `vehicleId`, `bookingId` | unchanged |
| Sheet route `type: 'tire-measure'` | unchanged |

---

## 20. Dynamic Data Freeze

- API-provided evidence display strings inside `tire-health-detail-ui` when `evidencePresentation` exists: **preserve backend-provided localized display fields** (already `displayDe`/`displayEn`); do not re-translate.
- No user-entered free text rendered in Tire Profile block.

---

## 21. Callback / Route / Permission Freeze

| Action | Target | Args |
|--------|--------|------|
| Measure CTA | `openSheet` | `type:'tire-measure'`, `vehicleId`, `vehicleLabel`, optional `bookingId`, `onSuccess: reloadDetails` |

Permissions: N/A (inherits shell sheet access). Visibility/disabled: N/A (button always enabled when shown).

---

## 22–23. Date/Time & Number/Unit Contracts

- **Date:** locale presentation only via adapter; raw ISO and hook timezone semantics frozen
- **Numbers/units:** mm, km, bar from API/helpers — presentation formatting only; no threshold logic in adapter

---

## 24. Key Reuse Audit

| Concept | Classification |
|---------|----------------|
| Section title / empty / CTA | **NEW P234** (`operator.vehicleQuickView.tire.*`) |
| InfoTile labels (5) | **NEW P234** |
| `displayMode` / `measurementState` labels | **NEW P234** or **SEMANTIC REUSE** from `health.tire.*` / `operator.tireMeasure.*` where exact |
| Status/tread/remaining via helpers | **SEMANTIC REUSE** — thread locale into existing `tire-health-detail-ui` |
| Datetime presentation | **NEW P234 formatter** in QV adapter (do not change utils business logic) |

**Estimated new keys: 8–12**  
**Estimated substantive production files: 3–4**

---

## 25. Proposed P234 Enforce-Clean Boundary

```
P234_ENFORCE_CLEAN_EXACT = [
  'operator/components/OperatorVehicleQuickViewTireProfile.tsx',
  'operator/lib/operator-vehicle-quick-view-i18n.ts',
]
```

Parent wiring changes in `OperatorVehicleQuickView.tsx` allowed; Blockers/Documents/ frozen slices excluded.

---

## 26. Test Contract

**New:** `operator-vehicle-quick-view-tire-profile-localization.test.tsx`

Minimum coverage:
- EN + DE section title, labels, empty, CTA
- Same-mount DE↔EN toggle
- Locale threading into tire helpers (status/tread/remaining differ by locale)
- `displayMode` machine value preserved; only label localized
- Datetime locale presentation differs; raw instant unchanged
- CTA callback args unchanged (mock `openSheet`)
- 6+ damages-style: N/A; tire has no slice limit
- Raw key / machine-code leakage guards
- P234 enforce-clean inventory = 0

**Frozen regressions:** P227–P233 QV suites (84 tests) + `npm run i18n:check`

---

## 27. Collision Check

| PR / area | Classification |
|-----------|----------------|
| #1244 Communication Center legacy removal | **LOW** (different surfaces) |
| #1243 P233 re-audit | audit-only |
| P2226 tire measure (merged) | **LOW** (adjacent, already localized — reuse keys) |
| Main branch QV parent | **HIGH drift** (see §28) — do not absorb |

**Selected target collision: LOW**

---

## 28. Main Drift

| Item | Value |
|------|-------|
| Current `origin/main` SHA | `9f0066f5705c7597f3662ccd3a78ab603060dd3d` |
| `OperatorVehicleQuickView.tsx` drift vs baseline | **HIGH** — main re-inlines monolithic QV (reverts P227–P233 extractions) |

**Implementation must branch from `5650bb01`, not `main`.**

---

## 29. P234 Implementation Success Contract

Standard closure: selected debt = 0, Category E = 0, EN = DE, parity 100%, orphans 0, P234 = 0, P227–P216 = 0, global enforce-clean = 0, shim ≤ 29, tests PASS, build PASS, `git diff --check` PASS, P234-caused CI failures = 0.

---

## 30. Final Verdict

**A — GO — P2.2.34 TARGET SELECTED**

**P2.2.34 — Operator Vehicle Quick View Tire Profile Localization**

**IMPLEMENTATION NOT STARTED.**

---

*Read-only pre-flight. No production, dictionary, test, or scanner modifications.*
