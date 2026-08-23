# P2.2.28 — Post-P227 Vehicle Quick View Next-Slice Pre-Flight

**Date:** 2026-08-23
**Mode:** STRICT READ-ONLY PRE-FLIGHT
**Authoritative baseline:** `314f20aabcf91eab8fd0e4ac44a10428af857c20` (merge commit of PR #1203 / P2.2.27 QV-G)
**Audit branch:** `cursor/p2228-post-p227-quick-view-next-slice-preflight-3c10`

---

## 0. Baseline / topology

| Check | Result |
|-------|--------|
| PR #1203 merged | **YES** (`mergedAt: 2026-08-23T12:47:35Z`) |
| Merge SHA | `314f20aabcf91eab8fd0e4ac44a10428af857c20` |
| Commit exists locally/remotely | **YES** |
| `merge-base(HEAD, baseline)` | `314f20aabcf91eab8fd0e4ac44a10428af857c20` ✓ |
| Pre-audit commits on baseline | **0** ✓ |
| Working tree clean (pre-audit) | **YES** |

### Ancestry (verified via merge-base with `9f87c3d7` P227 base)

| Slice | Present in `314f20aa` ancestry |
|-------|-------------------------------|
| P227 (QV-G) | YES |
| P226 (Tire Measure) | YES |
| P225 (Pickup Check) | YES |
| P224 (Damage Capture) | YES |
| P223 (Invoice Documents) | YES |
| P222–P216 | YES (linear main history) |

---

## 1. Post-P227 freeze verification

| Check | Result |
|-------|--------|
| `npm run i18n:check` | **PASS** |
| i18n suite count | **325** tests (23 files) |
| EN keys | **8434** |
| DE keys | **8434** |
| Parity | **100%** |
| Orphans | **0** |
| Shim inventory | **29** (prod 18, test 11) |
| New compatibility consumers | **0** |
| Global active enforce-clean debt | **0** |
| `status.overdue` DE | **`Überfällig`** (no `Ueberfaellig` regression) |

### Per-slice enforce-clean debt

| Slice | Debt |
|-------|------|
| P227 | **0** |
| P226 | **0** |
| P225 | **0** |
| P224 | **0** |
| P223 | **0** |
| P222 | **0** |
| P221 | **0** |
| P220 | **0** |
| P219 | **0** |
| P218 | **0** |
| P217 | **0** |
| P216A/B1/B2/C1/C2A/C2B | **0** |

QV-G frozen boundary: `OperatorVehicleQuickViewTasks.tsx` + `operator-vehicle-quick-view-i18n.ts` tasks API — **0 scanner findings, 11/11 tests on baseline**.

---

## 2. Purpose

Select exactly **one** bounded P2.2.28 localization slice from remaining Operator Vehicle Quick View residual, scored by user impact × operator frequency × boundedness × machine/display separation × testability × low risk × low collision.

---

## 3. Global residual inventory (recomputed)

| Surface | Scanner debt | Enforce-clean |
|---------|-------------|---------------|
| GLOBAL | 1577 unique findings | **0** |
| MASTER | 1049 | 0 |
| OPERATOR | 130 | 0 |
| RENTAL | 372 | 0 |
| SHARED | 1 | 0 |
| SHELL | 25 | 0 |

**Global active enforce-clean debt = 0** ✓

---

## 4–5. QV-G exclusion & residual sanity

**Frozen (excluded from P228 candidate pool):**

- `OperatorVehicleQuickViewTasks.tsx`
- `operator-vehicle-quick-view-i18n.ts` QV-G task mappings
- `operator.vehicleQuickView.tasks.*` keys
- Task row presentation (title, priority, status, overdue, create/open chrome)

**P227 residual classification:** **E (presentation regression) = 0**

---

## 6. Remaining Quick View inventory

### Files with residual debt

| File | Scanner findings | Role |
|------|-----------------|------|
| `operator/components/OperatorVehicleQuickView.tsx` | **20** | Parent host — all non-QV-G sections |
| `operator/lib/operatorVehicleQuickView.utils.ts` | **0** (maps not scanned) | Status/release/health label maps, `formatOperatorDateTime` (`de-DE`) |
| `operator/hooks/useOperatorVehicleQuickViewData.ts` | **0** | Booking-context German labels (hidden debt) |

**QV-G findings:** 0 | **QV parent findings:** 20

### Sub-surface map (actual repo structure)

| ID | Section | Lines (approx) | Visible concepts | Est. keys | Risk |
|----|---------|----------------|------------------|-----------|------|
| **QV-A** | Header / hero / primary status | 70–193 | not-found, close, status chips, cleaning chip, release block, health prefix, unreliable callout | 12–18 | Med — utils maps + locale threading |
| **QV-B** | Quick actions (handover + booking CTA) | 196–257 | pickup/return CTAs, booking create, gate reasons (already i18n) | 3–5 new | Low |
| **QV-C** | Booking context | 259–271 + hook | section title, 4 kind labels, datetime locale | 5–6 | Low |
| **QV-D** | Blockers & hints | 273–294 | section title, health error prefix, contradictions | 6–8 | Med |
| **QV-E** | Rental Health modules | 296–329 | section title, module labels, stale suffix, empty | 10–15 | High — utils coupling |
| **QV-F** | Active damages | 331–356 | section title, empty, type/severity display | 3–5 | Low — P224 overlap |
| **QV-G** | Open Tasks | 358–377 | **FROZEN** | 0 | — |
| **QV-H** | Tire profile | 380–431 | section title, measure CTA, 5 InfoTile labels, empty | 7–8 | Med — P226 semantics freeze |
| **QV-I** | AI Uploads / documents | 433–453 | section title only (+ raw machine fields) | 1–2 | Low |
| **QV-J** | Tool actions footer | 455–513 | 4 action title/subtitle pairs | 8 | Low |

**Hidden debt not in scanner (manual audit):** `Buchung`, `Reifenprofil`, InfoTile labels, `Rental Health:` prefix, `Rental Health nicht geladen:`, `Pickup starten`/`Return starten` (3 shared), `Schließen` (shared), ` · stale`, `Status nicht verfügbar` (release fallback L168).

**Fixed-locale debt:** `locale: 'de'` at L82 (`fleetDisplay`), L152 (`VehicleOperationalStatusCallout`), L138 (`deriveOperatorVehicleStatusSnapshot`).

---

## 7. Header / vehicle identity deep audit

| Element | Classification | Notes |
|---------|------------------|-------|
| License plate | **A** dynamic | `vehicle.license` |
| Model | **A** dynamic | `vehicle.model` |
| Station | **A** dynamic | `vehicle.station` |
| Close control | **C** presentation | `aria-label="Schließen"` — reuse `common.close` |
| Primary status chip | **B→C** | `snapshot.primaryLabel` from utils maps |
| Fleet status badge | **B→C** | `fleetDisplay.statusBadge.label` — **hardcoded `locale: 'de'`** |
| Cleaning chip | **B→C** | `cleaningStatus === 'Needs Cleaning'` → `"Reinigung offen"` |
| Unreliable callout | **C** | child component — thread `locale` |
| "Darf raus?" | **C** | release question label |
| Release answer | **B→C** | `snapshot.releaseLabel` from `RELEASE_LABELS` |
| Rental Health prefix | **C** | `"Rental Health: "` + state label |
| Not found | **C** | `"Fahrzeug nicht gefunden."` |

**E (uncertain) = 0** — all resolved.

**Assignment:** not displayed in Quick View header.

---

## 8–16. Domain audits (summary)

### Primary status badges (QV-A)

| Machine | Visible label source | Logic use |
|---------|---------------------|-----------|
| `OperatorPrimaryStatus` | `PRIMARY_STATUS_LABELS` | Filter/snapshot derivation only |
| `OperatorReleaseDecision` | `RELEASE_LABELS` | Display only |
| `RentalHealthState` | `RENTAL_HEALTH_STATE_LABELS` | Display only |
| `cleaningStatus` enum | German literal | Enum gate, not string compare |

**Separation:** machine codes exist; labels in utils maps — **adapter refactor safe**.

### Actions (QV-B)

| Action | Callback | Reuse candidate |
|--------|----------|-----------------|
| Pickup | `openHandover(PICKUP)` | `vehicle.bookings.startPickup` |
| Return | `openHandover(RETURN)` | `vehicle.bookings.startReturn` |
| Create booking | `openSheet(booking-create)` | new key |
| Damage/AI/Tire/Task footer | various | separate slice |

### Health summary (QV-E)

**DEFER** — touches `HEALTH_MODULE_LABELS`, `formatModuleRow`, contradictions, API `blocking_reasons`. Too coupled for next slice.

### Booking context (QV-C)

4 hook labels + section title + `formatOperatorDateTime('de-DE')`. Small but lower leverage.

### Footer (QV-J)

8 strings, 4 callbacks — clean single-file slice, lower centrality than header.

### Loading/error/a11y

Distributed across sections; best bundled with owning slice (not standalone).

---

## 18. Split reassessment

| Sub-slice | Classification |
|-----------|----------------|
| QV-A Header & primary status | **SAFE WITH EXTRA FREEZE** |
| QV-B Quick actions | **SAFE BOUNDED** |
| QV-C Booking context | **SAFE BOUNDED** |
| QV-D Blockers | **SAFE WITH EXTRA FREEZE** |
| QV-E Rental Health modules | **TOO COUPLED** |
| QV-F Damages | **SAFE BOUNDED** (low value) |
| QV-H Tire | **SAFE WITH EXTRA FREEZE** (P226 semantics) |
| QV-I Documents | **LOW VALUE** |
| QV-J Tool footer | **SAFE BOUNDED** |

---

## 19–21. Candidate tests

| Test | Result |
|------|--------|
| Header/status bounded slice while leaving health/booking/footer untouched? | **ONE SAFE SLICE** (hero L70–193 + utils presentation maps + locale threading) |
| Actions/footer cleaner slice? | **ONE SAFE SLICE** (single-file, ~10 keys) |
| Health summary safe? | **DEFER** — too coupled |

---

## 22–28. Scoring (0–5, higher = better except business risk)

| Sub-slice | Ops leverage | Machine sep | Biz risk (↓better) | Boundedness | Testability | Collision | Residual quality | **Total** |
|-----------|-------------|-------------|---------------------|-------------|-------------|-----------|------------------|-----------|
| **QV-A Header/status** | 5 | 3 | 2 | 3 | 4 | 5 | 5 | **27** |
| QV-B Quick actions | 5 | 4 | 2 | 5 | 5 | 5 | 4 | **26** |
| QV-J Tool footer | 4 | 4 | 1 | 5 | 5 | 5 | 3 | **23** |
| QV-C Booking context | 3 | 4 | 1 | 5 | 4 | 5 | 3 | **21** |
| QV-D Blockers | 3 | 2 | 2 | 3 | 3 | 5 | 4 | **20** |
| QV-E Health modules | 4 | 2 | 3 | 2 | 3 | 4 | 5 | **19** |
| QV-F Damages | 2 | 3 | 1 | 4 | 4 | 4 | 2 | **16** |
| QV-H Tire | 3 | 3 | 2 | 3 | 3 | 3 | 3 | **17** |
| QV-I Documents | 1 | 4 | 1 | 5 | 3 | 5 | 1 | **15** |

---

## 29. Quick View sub-slice ranking

| Rank | Sub-slice | Files | Visible | Hidden | Fixed locale | Keys | Recommendation |
|------|-----------|-------|---------|--------|--------------|------|----------------|
| 1 | **QV-A Header & primary status** | QV.tsx hero, utils maps, i18n adapter | ~12 | ~3 | **3 hardcoded `de`** | ~14 (6 new + 8 reuse) | **SELECT** |
| 2 | QV-B Quick actions | QV.tsx L196–257 | ~3 | 0 | 0 | ~5 | Next after A |
| 3 | QV-J Tool footer | QV.tsx L455–513 | 8 | 0 | 0 | ~8 | Good follow-up |
| 4 | QV-C Booking context | QV.tsx + hook | ~5 | 4 hook labels | 1 datetime | ~6 | Quick win |
| 5 | QV-D Blockers | QV.tsx + utils | ~4 | API strings | 0 | ~8 | After header |
| 6 | QV-E Health modules | QV.tsx + utils | ~8 | module reasons | 0 | ~15 | Defer |
| 7 | QV-H Tire | QV.tsx | ~8 | 5 InfoTiles | tire helpers default de | ~8 | Defer (P226 freeze) |
| 8 | QV-F Damages | QV.tsx | ~3 | severity raw | 0 | ~5 | Low value |
| 9 | QV-I Documents | QV.tsx | 1 | machine fields | 0 | ~2 | Low value |

---

## 30. Non-QV Operator alternatives (top 3)

| Rank | Surface | Files | Findings | Score | Notes |
|------|---------|-------|----------|-------|-------|
| 1 | Booking form sheet | `OperatorBookingFormSheet.tsx` | 16 | 22 | High debt, higher mutation risk |
| 2 | Today view | `OperatorTodayView.tsx` | 12 | 20 | Broad workflow surface |
| 3 | AI upload flow | `OperatorAiUploadFlow.tsx` | 11 | 18 | Active complexity |

---

## 31–32. Vehicle/Fleet & Rental/Master alternatives

| Domain | Best candidate | Files | Findings | Score |
|--------|---------------|-------|----------|-------|
| Vehicle/Fleet | Residual in `FleetContext` hosts / vehicle list filters | `OperatorVehiclesView.tsx` (4) + utils filters (6) | 10 | 17 |
| Rental | Finance/billing residual modules | various rental (372 total) | — | 15 |
| Master | Master admin copy (1049 total) | master components | 1049 | 12 (low operator leverage) |

---

## 33. Top 12 cross-domain ranking

| Rank | Domain | Surface | Files | Active? | Vis | Hidden | FixLoc | Ops | Sep | Risk | Bnd | Test | Coll | Keys | Rec |
|------|--------|---------|-------|---------|-----|--------|--------|-----|-----|------|-----|------|------|------|-----|
| 1 | Operator/QV | **Header & primary status** | QV hero, utils, adapter | Y | 12 | 3 | 3 | 5 | 3 | 2 | 3 | 4 | 5 | ~14 | **P228 SELECT** |
| 2 | Operator/QV | Quick actions | QV.tsx | Y | 3 | 0 | 0 | 5 | 4 | 2 | 5 | 5 | 5 | ~5 | Next |
| 3 | Operator/QV | Tool footer | QV.tsx | Y | 8 | 0 | 0 | 4 | 4 | 1 | 5 | 5 | 5 | ~8 | Next |
| 4 | Operator/QV | Booking context | QV + hook | Y | 5 | 4 | 1 | 3 | 4 | 1 | 5 | 4 | 5 | ~6 | Next |
| 5 | Operator | Booking form sheet | `OperatorBookingFormSheet.tsx` | Y | 16 | ? | ? | 4 | 2 | 4 | 2 | 3 | 4 | ~25 | Defer |
| 6 | Operator/QV | Blockers & hints | QV + utils | Y | 4 | API | 0 | 3 | 2 | 2 | 3 | 3 | 5 | ~8 | Defer |
| 7 | Operator | Today view | `OperatorTodayView.tsx` | Y | 12 | ? | ? | 4 | 2 | 3 | 2 | 3 | 4 | ~20 | Defer |
| 8 | Operator/QV | Rental Health modules | QV + utils | Y | 8 | reasons | 0 | 4 | 2 | 3 | 2 | 3 | 4 | ~15 | Defer |
| 9 | Operator | AI upload flow | `OperatorAiUploadFlow.tsx` | Y | 11 | ? | ? | 3 | 2 | 3 | 2 | 3 | 4 | ~18 | Defer |
| 10 | Operator/QV | Tire profile | QV.tsx | Y | 8 | 5 | 1 | 3 | 3 | 2 | 3 | 3 | 3 | ~8 | Defer |
| 11 | Operator/QV | Damages section | QV.tsx | Y | 3 | raw enums | 0 | 2 | 3 | 1 | 4 | 4 | 4 | ~5 | Low value |
| 12 | Operator/QV | Documents section | QV.tsx | Y | 1 | machine | 0 | 1 | 4 | 1 | 5 | 3 | 5 | ~2 | Low value |

---

## 34. Winner comparison

| Candidate | Score |
|-----------|-------|
| Best QV sub-slice (QV-A Header) | **27** |
| Best other Operator (Booking form) | 22 |
| Best non-Operator | 15 |

**QUICK VIEW WINS**

---

## 35. Campaign decision

**CONTINUE OPERATOR — VEHICLE QUICK VIEW**

Rationale: QV-A fixes the highest-impact mixed-language defect (`useLanguage().locale` ignored; badges forced to `de`), remains bounded with P227 extraction precedent, and continues the established split campaign.

---

## 36. Selected P2.2.28 target

**P2.2.28 — Operator Vehicle Quick View Header & Primary Status Localization**

---

## 37. Split decision

**ONE SLICE**

Narrow structural extraction of hero/header block (P227 precedent) into `OperatorVehicleQuickViewHeader.tsx` if needed for enforce-clean boundary; no whole-sheet refactor.

---

## 38. Exact P228 production scope

| Path | Role | Presentation | Machine/business |
|------|------|--------------|------------------|
| `operator/components/OperatorVehicleQuickViewHeader.tsx` | **NEW** — extracted hero/not-found/close/status/release | Owns header chrome | Receives snapshot + vehicle props; no derivation |
| `operator/components/OperatorVehicleQuickView.tsx` | Host wiring | Removes hero literals | Unchanged callbacks for non-header sections |
| `operator/lib/operator-vehicle-quick-view-i18n.ts` | **EXTEND** — add header/status adapter fns | Maps machine → TranslationKey | QV-G task fns **frozen** |
| `operator/lib/operatorVehicleQuickView.utils.ts` | Status snapshot derivation | Replace inline label maps with adapter calls OR keep maps as fallback only during migration | **Freeze** `deriveOperatorVehicleStatusSnapshot` logic; presentation labels via adapter |
| `i18n/translations/operator.vehicleQuickView.header.{en,de}.ts` | **NEW** dictionary module | Header-specific keys | — |
| `i18n/translations/{en,de}.ts` | Register header module | — | — |
| `operator/components/operator-vehicle-quick-view-header-localization.test.tsx` | **NEW** tests | — | — |
| `i18n/hardcoded-copy-guard.test.ts` | P228 boundary | — | — |

**Out of scope:** QV-G tasks, quick actions, booking, blockers, health modules, damages, tire, documents, footer tools.

---

## 39. Selected presentation inventory (~16 concepts)

| Concept | Current DE | Strategy |
|---------|-----------|----------|
| Vehicle not found | `Fahrzeug nicht gefunden.` | new `operator.vehicleQuickView.header.notFound` |
| Close aria | `Schließen` | reuse `common.close` |
| Cleaning chip | `Reinigung offen` | reuse `dashboard.fleet.cleaningPending` |
| Release question | `Darf raus?` | new `operator.vehicleQuickView.header.releaseQuestion` |
| Release unavailable | `Status nicht verfügbar` | new or reuse release-unavailable key |
| Rental Health prefix | `Rental Health: ` | new `operator.vehicleQuickView.header.rentalHealthPrefix` |
| Primary status labels (6) | utils maps | reuse `dashboard.label.*` / `vehicle.status.*` where semantic match |
| Release labels (4) | utils maps | new `operator.vehicleQuickView.header.release.*` |
| Health state in hero (5) | utils maps | reuse `health.state.*` |
| Unreliable callout | child component | **thread `locale`** (no new QV keys) |

Dynamic (not translated): license, model, station, health error strings from API.

---

## 40. Machine / domain freeze

| Machine value | Used by | Visible map? | Must stay unchanged |
|---------------|---------|--------------|---------------------|
| `vehicleId` | props, callbacks | No | YES |
| `license`, `model`, `station` | header display | No (raw display) | YES |
| `cleaningStatus` enum | chip gate | Yes → label | YES enum |
| `OperatorPrimaryStatus` | snapshot | Yes → label | YES code |
| `OperatorReleaseDecision` | snapshot | Yes → label | YES code |
| `health.overall_state` | hero suffix | Yes → label | YES code |
| `snapshot.primaryTone/releaseTone` | chip styling | No | YES |
| `rental_blocked`, contradictions | downstream sections | Out of scope | YES |

---

## 41. Callback / route freeze

| Callback | Args | P228 |
|----------|------|------|
| `onClose` | none | preserved |
| `data.reloadDetails` | none | preserved (callout refresh) |

No new routes. Handover/booking/sheet actions remain out of scope.

---

## 42. State preservation contract

Header slice has **no local UI state**. Same-mount locale switch must preserve: vehicle identity text, chip tones, release decision machine values, callback identities.

---

## 43–44. Dynamic data & date/time freeze

Do not translate: registration, model, station, API health errors, contradiction backend strings (out of scope).

Date/time: none in header slice.

---

## 45. Presentation adapter strategy

**Extend** `operator-vehicle-quick-view-i18n.ts`:

- Add `operatorVehicleQuickViewHeader*` / status label resolver functions
- QV-G task functions remain frozen
- Utils keeps derivation; adapter resolves presentation keys from machine enums
- Thread `locale` into `resolveFleetVehicleDisplayState` and `VehicleOperationalStatusCallout`

Forbidden: business predicates, health derivation, routing, permissions, API, state mutation.

---

## 46–47. Key reuse & growth gate

| Type | Keys |
|------|------|
| Reuse | `common.close`, `health.state.*`, `dashboard.fleet.cleaningPending`, `dashboard.label.ready/blocked`, `vehicle.status.*` (semantic audit during impl) |
| New (est.) | ~6–8 under `operator.vehicleQuickView.header.*` |
| **Total new** | **≤ 12** (well under 70 gate) |

---

## 48. P228 enforce-clean boundary

```text
P228_ENFORCE_CLEAN_EXACT = [
  'operator/components/OperatorVehicleQuickViewHeader.tsx',
  'operator/lib/operator-vehicle-quick-view-i18n.ts',  // header fns only guarded; QV-G fns frozen
]
```

Parent `OperatorVehicleQuickView.tsx` **not** in enforce-clean until later slices complete (same pattern as P227 parent residual).

---

## 49. Blind-spot guards

- Status map completeness (6 primary + 4 release + 5 health states)
- `locale` threading (no hardcoded `'de'`)
- Cleaning chip enum gate vs label
- Close aria uses canonical key
- No raw `OperatorPrimaryStatus` / `RentalHealthState` in DOM
- Dynamic vehicle fields pass through unchanged
- QV-G boundary regression guard (P227 remains 0)

---

## 50. Future test contract

`operator-vehicle-quick-view-header-localization.test.tsx`:

- EN render: chips, release question, not-found, close aria
- DE render: same concepts
- DE → EN / EN → DE same-mount: vehicle license/model unchanged, status machine codes unchanged, chip tones unchanged, callbacks unchanged
- `locale` threads to fleet display + callout (no forced `de`)
- No raw TranslationKey or machine enum in textContent
- P228 enforce-clean = 0; P227 remains 0

---

## 51–53. Contracts

| Contract | Requirement |
|----------|-------------|
| Category E | 0 — presentation-only vs `314f20aa` |
| Global freeze | All P216–P227 = 0; global enforce-clean = 0 |
| Shim | ≤ 29 baseline; new compat consumers = 0 |

---

## 54. Active feature collision

| Active work | Collision with QV-A |
|-------------|---------------------|
| Communication Center C11.5 (#1205) | **NONE** — different domain |
| P227 audit PRs (#1204, #1206) | **NONE** — read-only |
| Voice/telephony preflight branch | **NONE** |

**Collision score: 5/5** — safe to proceed.

---

## 55. Implementation contract (if GO)

**TITLE:** P2.2.28 — Operator Vehicle Quick View Header & Primary Status Localization

**AUTHORITATIVE BASE:** `314f20aabcf91eab8fd0e4ac44a10428af857c20`

**IN SCOPE:** header extraction, adapter extension, header dictionary, tests, P228 enforce-clean, docs

**OUT OF SCOPE:** QV-G frozen tasks, later QV slices, P216–P227, business logic, health derivation, task/vehicle mutation, API, permissions, routing, shim cleanup, Communication Center

**Acceptance:** selected header debt = 0; EN/DE correct; locale threading fixed; machine values frozen; Category E = 0; parity 100%; P228 = 0; P227–P216 remain 0; tests + build + `git diff --check` PASS.

---

## Final verdict

**A — GO — P2.2.28 TARGET SELECTED**

P2.2.28 should implement **Operator Vehicle Quick View Header & Primary Status Localization** as a single bounded slice, extending the existing Quick View adapter pattern established by P2.2.27 QV-G.
