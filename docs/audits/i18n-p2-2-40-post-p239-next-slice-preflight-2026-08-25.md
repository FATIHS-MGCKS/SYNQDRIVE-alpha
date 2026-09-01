# P2.2.40 — Post-P239 Next-Slice Pre-Flight

**Date:** 2026-08-25
**Mode:** STRICT READ-ONLY TARGET SELECTION
**Repository:** FATIHS-MGCKS/SYNQDRIVE-alpha
**Authoritative baseline:** `00a58f54970be4853b1adab61796ac7b3bd962b3` (merged PR #1274 — P2.2.39)
**Current main:** `7a4060ef2151a5b504006aea2bbaed58cd448940`
**Auditor branch:** `cursor/p2240-post-p239-next-slice-preflight-3c10`

---

## 1. Baseline hard gate

| Check | Result |
|-------|--------|
| Baseline SHA | ✅ `00a58f54970be4853b1adab61796ac7b3bd962b3` |
| P239 merged ancestry | ✅ `00a58f54` = merge commit of #1274 |
| `merge-base(HEAD, baseline)` | ✅ `00a58f54` |
| `rev-list count baseline..HEAD` | ✅ **0** (audit branch) |
| `npm run i18n:check` | ✅ PASS |
| EN / DE | **8596 / 8596** |
| Parity | **100%** |
| Orphans | **0** |
| P239–P216 enforce-clean | **0** |
| Global enforce-clean (guarded scopes) | **0** |
| Vitest suite count | **373** |
| Shim compat total | **29** (unchanged) |
| New compatibility consumers | **0** |

**Baseline regression:** NONE — proceed.

---

## 2. P239 freeze verification

| Surface | Visible | Hidden | Fixed-locale | P239 |
|---------|--------:|-------:|-------------:|-----:|
| `OperatorMoreView.tsx` | 0 | 0 | 0 | **0** |
| `operator-more-i18n.ts` | 0 | 0 | 0 | **0** |

**P239 closed.** Do not reopen.

---

## 3. Baseline topology

| Item | Value |
|------|-------|
| Authoritative baseline branch | `p239-p238-merge-baseline-3c10` @ `00a58f54` |
| Current main | `7a4060ef` (+129 commits ahead of baseline) |
| Relationship | **PARALLEL CAMPAIGN BASELINE** — P239 merge point; main has fleet/ops/connectivity work not in campaign branch |

**Recently merged (relevant):**

| PR | Domain |
|----|--------|
| #1274 | P2.2.39 Operator More View i18n |
| #1275 | Fleet operational availability consumer migration |
| #1273/#1271 | VehicleOperationalProjection |
| #1267 | Connectivity production processing gate |
| #1263 | Vehicle operational state provenance |

**Open audit-only PRs:** #1276 (P239 re-audit), #1272 (P239 preflight), #1277 (Fleet health evaluability — **EXCLUDE**)

---

## 4. Active workstream exclusion map

| PR | Domain | Changed paths (summary) | Collision radius | P240 eligible? |
|----|--------|-------------------------|------------------|----------------|
| #1277 | Fleet health evaluability | `fleet-health-evaluation/*`, `FleetOperatorRow`, `fleetVehicleDisplay` | HIGH — vehicle health/readiness | **NO** |
| #1275 (merged) | Fleet operational availability | `operational-availability/*`, fleet map/HUD | HIGH | **NO** |
| #1271/#1273 (merged) | VehicleOperationalProjection | backend projection, api.ts | MEDIUM | **NO** |
| #1267 (merged) | Connectivity gate | webhook/BullMQ lifecycle | MEDIUM | **NO** |
| #1276 | P239 audit doc | audit only | NONE | N/A |

**Vehicle/Fleet operational-state surfaces: DEFERRED** until workstreams stabilize.

---

## 5. Operator residual inventory (top surfaces)

| Path | Component | Mount | Visible debt | Hidden | Fixed-locale | Est. keys | Collision |
|------|-----------|-------|-------------:|-------:|-------------:|----------:|-----------|
| `operator/components/OperatorBookingDetailSheet.tsx` | `OperatorBookingDetailSheet` | Today + Scan fullscreen sheet | **8** | 0 | 0 | ~22–26 | **NONE** |
| `operator/views/OperatorTodayView.tsx` | `OperatorTodayView` | Tab `today` | **13** | 0 | 0 | ~30+ | LOW |
| `operator/ai-upload/OperatorAiUploadFlow.tsx` | `OperatorAiUploadFlow` | Action sheet | **11** | 0 | 0 | ~25+ | LOW |
| `operator/views/OperatorScanView.tsx` | `OperatorScanView` | Tab `scan` | **6** | 0 | 0 | ~12–15 | LOW |
| `operator/views/OperatorTasksView.tsx` | `OperatorTasksView` | Tab `tasks` | **3** | 0 | 0 | ~25+ | LOW |
| `operator/components/OperatorBookingCard.tsx` | `OperatorBookingCard` | Today handover cards | 0* | ~6–8 | 0 | ~8 | LOW |
| `operator/components/OperatorScanBookingCard.tsx` | `OperatorScanBookingCard` | Scan results | 0* | ~5–6 | 0 | ~6 | LOW |
| `operator/components/OperatorBottomNav.tsx` | `OperatorBottomNav` | Global nav | **1** | ~4 | 0 | ~5 | LOW |
| `operator/components/OperatorHeader.tsx` | `OperatorHeader` | Global header | **2** | 0 | 0 | ~6 | LOW |
| `operator/handover/*` | Handover flow | Sheet | 0 | 0 | 0 | — | **FROZEN P2213** |
| `operator/damages/*` | Damage capture | Sheet | 0 | 0 | 0 | — | **FROZEN P2224** |
| `operator/verification/*` | Pickup check | Sheet | 0 | 0 | 0 | — | **FROZEN P2225** |

\*Scanner may under-count JSX template strings in cards; manual review confirms debt.

**Operator total residual:** 69 findings (down from 77 pre-P239).

---

## 6–14. Domain audits (summary)

### Booking List
No dedicated list/table. Bookings render as **cards** in Today (`OperatorBookingCard`) and Scan (`OperatorScanBookingCard`). Not a single-table slice; cards are a separate candidate (P241).

### Booking Detail (selected)
`OperatorBookingDetailSheet` — fullscreen dialog from Today + Scan. Host-owned chrome: header, metadata labels, health blocker title, manage section, pickup/return CTAs, pickup verification entry. **Excludes** embedded `OperatorBookingDocumentsPanel` (P238). Dynamic: customer name, vehicle, station, time label, API errors, blocking reasons.

### Booking Filters
No standalone filter component. Scan search inline in `OperatorScanView`; task booking filter in `OperatorTasksView`. Not one bounded slice.

### Handover / Return / Damage
Already localized (P2213, P2224, P2225). Not eligible.

### Operator Tasks / Notifications / Focus
Tasks view has mixed task + booking filter debt; notifications/focus not primary surfaces. Lower rank than booking detail.

### Challengers outside Operator
| Domain | Best candidate | Verdict |
|--------|----------------|---------|
| Rental | Mostly localized in P2.2.x campaign | LOW residual |
| Dashboard | Global context header (#1259 merged) — partial | Excluded: fleet ops coupling risk |
| Customer | Standalone selector not isolated | MEDIUM coupling |
| Communication | Message bodies dynamic | **INELIGIBLE** |
| Automation | Machine trigger values | HIGH risk |
| Vehicle/Fleet | All active ops work | **DEFERRED** |
| App Shell | `OperatorBottomNav` (5 labels) | Bounded but lower leverage than booking detail |

---

## 15. Top-15 ranking

| Rank | Candidate | Score /50 | Biz risk | Est. keys | Files |
|------|-----------|----------:|---------:|----------:|------:|
| 1 | **Operator Booking Detail Sheet** | **44** | 1 | ~24 | 2 |
| 2 | Operator Today View (booking chrome) | 38 | 2 | ~30+ | 1–3 |
| 3 | Operator Booking Cards (Today + Scan) | 36 | 1 | ~14 | 2 |
| 4 | Operator Bottom Nav | 34 | 0 | ~5 | 1 |
| 5 | Operator Scan View (search UX) | 33 | 1 | ~14 | 1 |
| 6 | Operator AI Upload Flow | 32 | 2 | ~25+ | 2–3 |
| 7 | Operator Tasks View | 28 | 2 | ~25+ | 2–3 |
| 8 | Operator Header | 26 | 0 | ~6 | 1 |
| 9 | Operator Today bucket metadata utils | 25 | 1 | ~10 | 1 |
| 10 | operatorStatus.ts label maps | 24 | 2 | ~12 | 1 |
| 11 | operatorBooking.utils gate strings | 23 | 2 | ~18 | 1 |
| 12 | Operator Vehicles View | 22 | 1 | ~10 | 1 |
| 13 | Operator Desktop Only Notice | 18 | 0 | ~3 | 1 |
| 14 | Operator Connectivity Banner | 16 | 0 | ~1 | 1 |
| 15 | Operator Vehicle Quick View shell residuals | 14 | 2 | ~3 | 1 |

---

## 16. Top-5 deep comparison

### 1. Operator Booking Detail Sheet ✅ SELECTED

| Attribute | Value |
|-----------|-------|
| Paths | `operator/components/OperatorBookingDetailSheet.tsx` |
| Symbol | `OperatorBookingDetailSheet` |
| Mount | `OperatorTodayView` + `OperatorScanView` → fullscreen `role="dialog"` |
| Audience | Operator mobile/tablet |
| Visible debt | **8** |
| Route | No dedicated route; sheet overlay on `today` / `scan` tabs |
| Machine values | `bookingId`, `status` enum, `kind` PICKUP/RETURN, gate booleans, sheet types |
| Dynamic (raw) | `customerName`, `vehicleName`, `plate`, `station`, `timeLabel`, API `error`, `blockingReasons` |
| Callbacks frozen | `onClose`, `onPickupStart`, `onReturnStart`, `openSheet({ type })`, `triggerRefresh` |
| Collision | **NONE** |
| Main drift | **LOW** (detail sheet not changed on main since baseline) |

### 2. Operator Today View
13 findings; mixed handover buckets, stale banner, create CTA, tablet hint — broader than one sheet.

### 3. Operator Booking Cards
Two components; no scanner findings but manual debt; natural follow-on P241 after detail sheet.

### 4. Operator Bottom Nav
5 tab labels; very bounded shell chrome; lower operational leverage.

### 5. Operator Scan View
Search placeholder, QR stub, booking section header; overlaps with card/detail flows.

---

## 17. Campaign direction

**A — CONTINUE OPERATOR**

Operator booking detail is the highest-scoring safe slice. No external challenger materially outranks it without fleet/ops collision risk.

---

## 18. Selected P240 target

### **P2.2.40 — Operator Booking Detail Sheet Localization**

**Split decision:** **ONE SLICE**

---

## 19. Exact production boundary

| Path | Role |
|------|------|
| `frontend/src/operator/components/OperatorBookingDetailSheet.tsx` | Primary UI |
| `frontend/src/operator/lib/operator-booking-detail-i18n.ts` | New bounded adapter (proposed) |

**Excluded from P240 enforce-clean:**

- `OperatorBookingDocumentsPanel` (P238)
- Parent views (`OperatorTodayView`, `OperatorScanView`)
- `operatorBooking.utils.ts` (gate logic; presentation mapping only if required for `noShowGate.reason` display — prefer adapter mapping machine gate codes without changing gate predicates)

### Presentation inventory (host-owned)

| Element | Current (DE baseline) |
|---------|----------------------|
| Header kicker | `Buchung` |
| Close aria | `Schließen` |
| Kind chip | `Buchung` / `Abholung` / `Rückgabe` |
| Field labels | `Kunde`, `Station`, `Zeit` |
| Error fallback | `Details nicht verfügbar` |
| Health blocker title | `Fahrzeug blockiert` |
| Pickup verification section | `Dokumentenprüfung`, `Prüfung beim Pickup erfassen` |
| Manage section | `Buchung verwalten`, `Bearbeiten`, `Buchung stornieren`, `No-Show markieren` |
| Primary CTAs | `Pickup starten`, `Return starten` |

### Machine / domain freeze

| Value | May localize label? | Must stay unchanged |
|-------|--------------------|---------------------|
| `item.bookingId` | No | ID |
| `status` enum | Map to key | Machine value |
| `item.kind` PICKUP/RETURN | Map to key | Machine value |
| `pickupGate`/`returnGate` booleans | No | Predicate |
| `openSheet` types | No | `booking-edit`, `booking-cancel`, `booking-no-show`, `ai-upload`, `pickup-verification` |
| `matrix.edit/cancel.allowed` | No | Boolean |
| `noShowGate.allowed` | No | Boolean |

### Dynamic data freeze (never translate)

- `item.customerName`, `item.vehicleName`, `item.plate`, `item.station`, `item.timeLabel`
- API error message body (except known host fallback `Details nicht verfügbar`)
- `detail.health.blockingReasons[]` (raw API strings)

### Callback / navigation freeze

| Callback | Args | Unchanged |
|----------|------|-----------|
| `onClose` | — | ✅ |
| `onPickupStart(item)` | `OperatorTodayBookingItem` | ✅ |
| `onReturnStart(item)` | `OperatorTodayBookingItem` | ✅ |
| `openBookingAction(type)` | `booking-edit` \| `booking-cancel` \| `booking-no-show` | ✅ |
| `openSheet` (AI upload) | vehicleId, bookingId, customerId, contextMode | ✅ |
| `openSheet` (pickup-verification) | customerId, bookingId, customerName | ✅ |

---

## 20. Key reuse audit

| Concept | Classification |
|---------|----------------|
| `bookings.customer` / `bookings.vehicle` / `bookings.period` | SEMANTIC REUSE candidate |
| `common.close` | EXACT REUSE (close aria) |
| `operator.bookings.cancelNoShow.*` | SEMANTIC REUSE for no-show/manage actions |
| `bookingStatusLabel(status, locale)` | SEMANTIC REUSE via rental status map |
| `resolveHandoverGateReason(locale, gate)` | Already localized (handover i18n) |
| Header kicker, field labels, CTAs | NEW `operator.bookings.detail.*` |
| `canOperatorMarkNoShow` reason strings | MACHINE — MAP ONLY (presentation adapter; do not change gate logic) |

**Estimated new keys:** ~22–26 (under 40 budget)

---

## 21. Adapter / extraction strategy

| Decision | Choice |
|----------|--------|
| Adapter | **NEW BOUNDED PRESENTATION ADAPTER** (`operator-booking-detail-i18n.ts`) |
| Extraction | **KEEP EXISTING COMPONENT** |
| Business logic in adapter | **FORBIDDEN** |

---

## 22. P240 enforce-clean boundary

```
P240_ENFORCE_CLEAN_EXACT = [
  'operator/components/OperatorBookingDetailSheet.tsx',
  'operator/lib/operator-booking-detail-i18n.ts',
]
```

Excludes: P216–P239, QV blockers, fleet/ops surfaces, `OperatorBookingDocumentsPanel`.

---

## 23. Test contract (future P240)

- EN / DE render of header, labels, manage section, CTAs
- Same-mount locale switch preserves `item` identity and dynamic fields
- `bookingStatusLabel` receives locale
- Gate tooltips use localized presentation; gate booleans unchanged
- `openSheet` / `onPickupStart` / `onReturnStart` callback args unchanged
- `/rental` N/A; documents panel (P238) debt unchanged
- P240 enforce-clean = 0

---

## 24. Category E feasibility

**FEASIBLE.** Diff limited to presentation wiring + adapter. No route, gate predicate, sheet type, or API contract changes required.

**Watch item:** `bookingStatusLabel(status)` currently called without `locale` — thread locale only; no status enum change. `noShowGate.reason` from `canOperatorMarkNoShow` returns DE strings — map at presentation boundary without altering gate predicates.

---

## 25. Collision & drift

| Check | Result |
|-------|--------|
| #1277 path overlap | **NONE** on detail sheet |
| #1275/#1271/#1267 semantic overlap | **NONE** |
| Active Operator collision | **NONE** |
| Main drift on selected paths | **LOW** |
| Baseline strategy | **DIRECT FROM P239 MERGE BASELINE** (`00a58f54`) |

---

## 26. Campaign forecast (not authorized)

| Slice | Likely target |
|-------|---------------|
| P240 | Operator Booking Detail Sheet |
| P241 | Operator Booking Cards (Today + Scan) |
| P242 | Operator Bottom Nav + shell chrome OR Operator Scan search UX |

---

## 27. Claim reconciliation

| Claim | Result |
|-------|--------|
| Baseline 00a58f54 | ✅ PASS |
| EN/DE 8596 | ✅ PASS |
| P239 = 0 | ✅ PASS |
| Operator continuity supported | ✅ PASS |
| Fleet/ops exclusion honored | ✅ PASS |
| Bounded single surface selected | ✅ PASS |

---

## 28. Final verdict

### **A — GO — P2.2.40 TARGET SELECTED**

**P2.2.40 — Operator Booking Detail Sheet Localization**

**CAMPAIGN:** OPERATOR

**IMPLEMENTATION NOT STARTED.**

---

*Pre-flight completed 2026-08-25. No production, dictionary, test, or scanner changes.*
