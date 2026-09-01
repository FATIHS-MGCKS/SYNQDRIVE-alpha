# P2.2.41 — Post-P240 Next-Slice Pre-Flight

**Date:** 2026-08-25  
**Mode:** Strict read-only target selection  
**Authoritative baseline:** `9280b2cb7e995add90b6dcecb279470242b99a74` (merged PR #1280 — P2.2.40)  
**Current main SHA:** `79bb49a075b2153d53398b567e94d80f4d2f7088`

---

## 1. Baseline hard gate

| Check | Result |
|-------|--------|
| Baseline SHA | `9280b2cb7e995add90b6dcecb279470242b99a74` ✓ |
| P240 merge ancestry | YES — commit message: `P2.2.40 — Operator Booking Detail Sheet localization (#1280)` |
| Working tree | Clean (excluding unrelated untracked audit file) |
| `npm run i18n:check` | **PASS** |

### Independent metrics (post-P240)

| Metric | Expected | Actual |
|--------|----------|--------|
| EN | 8608 | **8608** |
| DE | 8608 | **8608** |
| Parity | 100% | **100%** |
| Orphans | 0 | **0** |
| P240 | 0 | **0** |
| P239–P216 | 0 | **0** |
| Global enforce-clean | 0 | **0** |
| i18n suite count | — | **382** |
| Shim | 29 | **29** |
| New compatibility consumers | 0 | **0** |

**Baseline health: PASS — no regression.**

---

## 2. P240 freeze verification

| Frozen surface | Visible | Hidden | Fixed-locale | Enforce-clean |
|----------------|--------:|-------:|-------------:|--------------:|
| `OperatorBookingDetailSheet.tsx` | 0 | 0 | 0 | 0 |
| `operator-booking-detail-i18n.ts` | 0 | 0 | 0 | 0 |
| P236 Booking Form | 0 | — | — | 0 |
| P237 Cancel/No-Show | 0 | — | — | 0 |
| P238 Documents | 0 | — | — | 0 |
| P239 More View | 0 | — | — | 0 |

**P240 freeze: VERIFIED**

---

## 3. Baseline topology

| Item | Classification |
|------|----------------|
| Baseline `9280b2cb` | **PARALLEL CAMPAIGN BASELINE** (P239 merge line + P240) |
| vs `origin/main` `79bb49a0` | **BEHIND MAIN** by 15 commits |
| Recent main merges after P240 | #1281 DIMO provider-link, #1282 dashboard mobile fix, #1279 dashboard layout, fleet P0.3/P0.2, connectivity |
| Open PRs touching Operator booking cards | **NONE** |

---

## 4. Active workstream exclusion map

| PR | Domain | Changed paths (summary) | P241 eligible? | Collision |
|----|--------|-------------------------|----------------|-----------|
| **#1281** (MERGED) | DIMO provider-link authority | `backend/modules/dimo/*`, vehicle projection | NO — backend/semantic | **NONE** on Operator booking cards |
| **#1277** (OPEN) | Fleet health evaluability | `fleet-health-evaluation/*`, `FleetOperatorRow`, rental i18n | NO — fleet/health semantics | **NONE** on Operator booking cards |
| **#1279** (MERGED) | Dashboard layout refactor | `DashboardView`, `dashboard/*` KPI/header/shell | NO — dashboard exclusion | **NONE** |
| **#1280** (MERGED) | P2.2.40 Detail Sheet | `OperatorBookingDetailSheet`, detail adapter | Frozen | N/A |

**Exclusion verdict:** Fleet/Vehicle/Dashboard/DIMO paths excluded. No semantic collision with booking-card target.

---

## 5. Operator residual inventory (top surfaces)

| Path | Component | Mount | Debt* | Machine/dynamic | Coupling | Est. keys | Collision |
|------|-----------|-------|------:|-----------------|----------|----------:|-----------|
| `OperatorBookingCard.tsx` | Today handover card | TodayView | ~7† | status, gates, names | handover/detail | 10–14 | NONE |
| `OperatorScanBookingCard.tsx` | Scan booking hit card | ScanView | ~6† | status, bookingId slice | scan/search/detail | shared | NONE |
| `OperatorTodayView.tsx` | Today shell/sections | today tab | 13 | tasks, alerts, banners | broad | 20+ | LOW |
| `OperatorScanView.tsx` | Scan search chrome | scan tab | 6 | search query | search logic | 12+ | LOW |
| `OperatorBottomNav.tsx` | Tab chrome | shell | 1 | tab IDs frozen | navigation | 5 | NONE |
| `OperatorTaskCard.tsx` | Task row | tasks/today | 4 | dynamic titles | task mutations | 15+ | LOW |
| `OperatorScanVehicleCard.tsx` | Scan vehicle hit | ScanView | 0‡ | vehicle health badges | fleet/health | 20+ | **MEDIUM** |
| `OperatorAiUploadFlow.tsx` | AI upload wizard | sheet | 11 | documents | upload pipeline | 30+ | LOW |
| `OperatorVehiclesView.tsx` | Vehicles list | vehicles tab | 4 | vehicle data | fleet | 10+ | MEDIUM |
| `operator/lib/operatorStatus.ts` | Vehicle badge labels | vehicle cards | ~12† | operational status | **fleet/health** | 15+ | **HIGH** |

\* Scanner inventory count where listed; † manual code audit (cards not yet in inventory); ‡ debt in parent view strings.

**Quick View / P216–P235:** frozen — excluded.

---

## 6. Today Booking Card deep audit

**Path:** `frontend/src/operator/components/OperatorBookingCard.tsx`  
**Mount:** `OperatorTodayView` → `renderHandoverCards` (dueNow, pickupsToday, returnsToday)

| Element | Source | Localize? | Freeze |
|---------|--------|-----------|--------|
| Vehicle name · plate | `item.vehicleName`, `item.plate` | NO | raw |
| Customer name | `item.customerName` | NO | raw |
| Station | `item.station` | NO | raw |
| Time | `item.timeLabel` (locale-formatted upstream) | display only | timestamp frozen |
| Status chip | `item.statusLabel` (precomputed) | **YES** — should use `bookingStatusLabel(status, locale)` in card | machine status frozen |
| Due badge | `pickupDueBadge()` / `returnDueBadge()` | YES — map kind labels | kind machine frozen |
| Overdue chip | `'Überfällig'` | YES — reuse `status.overdue` | predicate frozen |
| Done chip | `'Erledigt'` | YES — new or common key | `isDone` frozen |
| Primary CTA | `'Pickup starten'` / `'Return starten'` | YES — reuse `vehicle.bookings.startPickup/Return` | gate + callback frozen |
| Details button | `'Details'` | YES — reuse `common.details` | `onDetails` frozen |
| Gate tooltip/body | `resolveHandoverGateReason(locale, gate)` | already localized | gate machine frozen |

**Actions:** pickup/return handover (`startHandover`), details (`setDetailItem` → P240 detail sheet). No direct cancel/no-show on card.

---

## 7. Scan Booking Card deep audit

**Path:** `frontend/src/operator/components/OperatorScanBookingCard.tsx`  
**Mount:** `OperatorScanView` → bookings result list

| Element | Source | Localize? | Freeze |
|---------|--------|-----------|--------|
| Title | `'Buchung · ' + bookingId.slice(0,8)` | YES — host label only; **ID slice raw** | bookingId frozen |
| Vehicle · plate | dynamic | NO | raw |
| Customer | dynamic | NO | raw |
| Status | `bookingStatusLabel(status)` **without locale** | YES — add locale | machine status frozen |
| Details | `'Details'` | reuse `common.details` | callback frozen |
| Fahrzeug | `'Fahrzeug'` | YES | `onOpenVehicle` frozen |
| Pickup / Return | `'Pickup'` / `'Return'` | YES — reuse start labels | handover callbacks frozen |

**Search freeze:** `useOperatorScanSearch` query/ranking unchanged. Cards are pure presentation.

---

## 8. Today + Scan combination decision

**Decision: ONE SHARED SLICE**

| Criterion | Assessment |
|-----------|------------|
| Same business semantics | YES — booking presentation in Operator handover/search flows |
| Same machine mappings | YES — booking status, pickup/return kinds |
| Bounded ownership | YES — 2 card components + 1 adapter |
| Combined key count | ~10–14 net new (modest) |
| Testability | Single test file can cover both mounts |

**Not suitable as single slice:** OperatorTodayView/ScanView section chrome (parent views) — separate follow-on slices.

---

## 9. Booking card status audit

| Machine | Today label source | Scan label source | Key (target) | Tone |
|---------|-------------------|-------------------|--------------|------|
| pending | `item.statusLabel`† | `bookingStatusLabel` | `bookings.planner.pending` | unchanged |
| confirmed | same | same | `bookings.confirmed` | unchanged |
| active | same | same | `bookings.active` | unchanged |
| completed | same | same | `bookings.completed` | unchanged |
| cancelled | same | same | `bookings.cancelled` | unchanged |
| no_show | same | same | `bookings.planner.noShow` | unchanged |

† Today card should switch to `bookingStatusLabel(item.status, locale)` at render time (presentation-only).

---

## 10. Booking card action audit

| Action | Today callback | Scan callback | Sheet/route | P241 touch |
|--------|---------------|---------------|-------------|------------|
| Open details | `onDetails()` → `setDetailItem` | `openBookingDetails` | P240 detail sheet | label only |
| Pickup handover | `onPickupStart` → `startHandover` | `onPickup` → `startBookingHandover` | handover flow | label only |
| Return handover | `onReturnStart` | `onReturn` | handover flow | label only |
| Open vehicle | — | `onOpenVehicle` | vehicle QV | label only |
| Edit/cancel/no-show | — | — | via detail sheet | frozen P236/P237 |

---

## 11–17. Integration freezes

- **P240 Detail Sheet:** cards only open detail via existing callbacks; no P240 file changes.
- **P237 Cancel/No-Show:** not launched from cards directly.
- **P236 Booking Form:** not launched from cards.
- **Search/query:** frozen — presentation only in cards.
- **Order/sort:** Today `dueNow` sort by `scheduledAt`; Scan result order from `useOperatorScanSearch` — unchanged.

---

## 18–26. Challenger summary

| Challenger | Debt | Score | Notes |
|------------|-----:|------:|-------|
| **Booking Cards (Today+Scan)** | ~13 | **44** | **Selected** — high visibility, bounded, booking-domain continuation |
| Operator Bottom Nav | 1 | 36 | Small; good P242 candidate |
| Operator Scan Search UX | 6 | 38 | Parent view; don't mix with cards |
| Operator Today View chrome | 13 | 40 | Broader than cards (banners, sections, alerts) |
| Operator Task Card | 4 | 34 | Dynamic task titles |
| Operator Scan Vehicle Card | ~8† | 28 | **DEFER** — fleet/health badge coupling via `operatorStatus.ts` |
| Operator AI Upload | 11 | 30 | Large wizard |
| Rental/Customer/Dashboard | — | <25 | No stronger bounded candidate |
| Vehicle/Fleet | — | — | **VEHICLE/FLEET DEFERRED — ACTIVE SEMANTIC WORK** (#1277, #1281) |

---

## 27. Top-12 ranking (eligible bounded candidates)

| Rank | Candidate | Score | Est. keys | Files | Risk |
|-----:|-----------|------:|----------:|------:|-----:|
| 1 | **Operator Today + Scan Booking Cards** | 44 | 10–14 | 3 | 1 |
| 2 | Operator Today View chrome (partial) | 40 | 18–22 | 2–3 | 2 |
| 3 | Operator Scan Search UX chrome | 38 | 12–16 | 1–2 | 2 |
| 4 | Operator Bottom Nav | 36 | 5 | 2 | 1 |
| 5 | Operator Task Card | 34 | 12–18 | 2–3 | 2 |
| 6 | Operator Header chrome | 30 | 4–6 | 2 | 1 |
| 7 | Operator Vehicles View | 28 | 8–12 | 2 | 3 |
| 8 | Operator Entry/Access screens | 26 | 8 | 3 | 2 |
| 9 | Operator AI Upload (subset) | 25 | 25+ | 4+ | 3 |
| 10 | Operator Connectivity Banner | 22 | 3 | 2 | 1 |
| 11 | Rental booking list row | 20 | 15+ | 3+ | 3 |
| 12 | Customer detail modal chrome | 18 | 12+ | 2+ | 3 |

---

## 28. Campaign direction

**A — CONTINUE OPERATOR**

Booking cards materially outrank external challengers on visibility, boundedness, collision safety, and campaign continuity. No Rental/Customer surface exceeds score 44 without broader scope or fleet/dashboard coupling.

---

## 29. Selected P241 target

### **P2.2.41 — Operator Today + Scan Booking Cards Localization**

---

## 30. Split decision

**ONE SLICE** — shared adapter for both card components.

---

## 31. Exact production boundary

| Path | Role |
|------|------|
| `frontend/src/operator/components/OperatorBookingCard.tsx` | Today handover booking card |
| `frontend/src/operator/components/OperatorScanBookingCard.tsx` | Scan search booking result card |
| `frontend/src/operator/lib/operator-booking-card-i18n.ts` | **NEW** presentation adapter |

### Mount / audience

| Card | Mount | Audience |
|------|-------|----------|
| `OperatorBookingCard` | `OperatorTodayView` handover sections | Operator — today tab |
| `OperatorScanBookingCard` | `OperatorScanView` booking results | Operator — scan tab |

### Out of scope (frozen)

- `OperatorTodayView.tsx` section headers/banners
- `OperatorScanView.tsx` search placeholder/empty states
- `operator/lib/operatorData.ts` (statusLabel precompute — card renders via `bookingStatusLabel` instead)
- `operator/lib/operatorStatus.ts` (vehicle badges — defer to avoid fleet coupling)
- P240/P236/P237/P238/P239 files
- Quick View, fleet, dashboard

---

## 32. Machine / domain freeze matrix (selected)

| Value | May localize? | Must stay unchanged |
|-------|---------------|---------------------|
| `bookingId` | NO | full ID in callbacks; scan title may show truncated slice as data |
| `status` enum | label only | machine value |
| `kind` PICKUP/RETURN | label only | machine value |
| `pickupGate`/`returnGate` booleans | tooltip text only | predicates |
| `isDone`/`isOverdue`/`isDueNow` | chip labels only | booleans |
| `scheduledAt`/`timeLabel` | format only (upstream) | raw instant |
| customer/vehicle/station strings | NO | raw |
| handover callbacks | NO | identity + args |
| detail sheet open | NO | `setDetailItem` / `mapScanBookingToDetailItem` |

---

## 33. Key reuse audit (preview)

| Concept | Strategy |
|---------|----------|
| Pickup/Return CTA | **EXACT REUSE** `vehicle.bookings.startPickup`, `startReturn` |
| Details | **EXACT REUSE** `common.details` |
| Overdue | **EXACT REUSE** `status.overdue` |
| Status labels | **EXACT REUSE** `bookingStatusLabel(status, locale)` |
| Due kind badges | **SEMANTIC REUSE** `operator.bookings.documents.group.pickup/return` or new `operator.bookings.card.kind.*` |
| Scan booking title prefix | **NEW** `operator.bookings.card.scanTitle` (with `{id}` var for slice only) |
| Done chip | **NEW** `operator.bookings.card.done` |
| Open vehicle | **NEW** or reuse vehicle key |
| Gate tooltips | **REUSE** `resolveHandoverGateReason` (Today card already wired) |

**Estimated new keys:** 10–14 EN+DE (≤30 budget)

---

## 34. Adapter strategy

**NEW BOOKING CARD PRESENTATION ADAPTER** — `operator-booking-card-i18n.ts`

Extend pattern from P240 detail adapter. Delegate gate reasons to existing handover-i18n on Today card. No business logic.

---

## 35. Extraction strategy

**KEEP EXISTING COMPONENTS** — no structural split required.

---

## 36. P241 enforce-clean (future)

```text
P241_ENFORCE_CLEAN_EXACT = [
  'operator/components/OperatorBookingCard.tsx',
  'operator/components/OperatorScanBookingCard.tsx',
  'operator/lib/operator-booking-card-i18n.ts',
]
```

Exclude all P216–P240 frozen paths, Quick View, fleet/vehicle status libs, dashboard, dynamic content.

---

## 37. Test contract (future)

`operator-booking-card-localization.test.tsx` — minimum:

- EN / DE render both cards
- Same-mount locale switch preserves bookingId, customer, vehicle, plate, station, time
- Status mapping without machine-code leak
- Today: pickup/return callback + bookingId preservation
- Scan: details + vehicle + handover callbacks
- Gate tooltip localization (Today)
- P240 detail integration untouched (mock)
- Raw TranslationKey leakage = 0

---

## 38. Category E feasibility

**YES** — all changes are presentation-layer string substitution and locale threading. Callbacks, gates, IDs, and search semantics unchanged.

---

## 39. Active collision

**NONE** on selected production paths.

| PR | Path overlap | Semantic overlap |
|----|--------------|------------------|
| #1277 | NONE | NONE |
| #1279 | NONE | NONE |
| #1281 | NONE | NONE |

---

## 40. Current main drift

| Path | baseline → main | Classification |
|------|-----------------|----------------|
| `OperatorBookingCard.tsx` | Minor — main removed `useLanguage`/handover gate i18n (regression) | **LOW** |
| `OperatorScanBookingCard.tsx` | No diff | **NONE** |

**Baseline strategy: DIRECT FROM P240 MERGE BASELINE (`9280b2cb`)**

Implement P241 from baseline, not from current main, to preserve P240 gate-reason localization on Today card.

---

## 41. Campaign forecast

| Slice | Estimate |
|-------|----------|
| **P241** | Booking cards (Today + Scan) — selected |
| P242 | Operator Bottom Nav OR Today view section chrome |
| P243 | Operator Scan search UX chrome OR Task card |

---

## 42. Claim reconciliation (pre-flight)

| Claim | Result |
|-------|--------|
| Baseline healthy post-P240 | PASS |
| Operator continuation justified | PASS |
| Booking cards forecast confirmed | PASS — repository evidence supports |
| Fleet/Dashboard excluded | PASS |
| Bounded 3-file production scope | PASS |
| Category E feasible | PASS |
| No HIGH/DIRECT collision | PASS |

---

## 43. Final verdict

### **A — GO — P2.2.41 TARGET SELECTED**

**P2.2.41 — Operator Today + Scan Booking Cards Localization**

**CAMPAIGN:** OPERATOR

**SPLIT:** ONE SLICE

**IMPLEMENTATION NOT STARTED.**

---

*Audit-only artifact. No production, dictionary, test, scanner, or architecture changes.*
